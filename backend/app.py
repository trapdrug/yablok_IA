"""FastAPI: цифровой двойник Core + ИИ-аналитик."""
from __future__ import annotations

import copy
import json
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

load_dotenv(Path(__file__).resolve().parent / ".env")

from . import store
from .engine import allocate, build_snapshot, iso, parse_dt, plan_production, scenario_delay
from .models import AdminNow, AiAsk, CreateOrder, CreateShipment, DelayScenario, PlanRequest, QtyOp, StartRequest
from . import ai as ai_mod

app = FastAPI(title="Firecode × ЯблокИИ Twin API")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

store.seed_if_empty()


def err(status: int, error: str, hint: str = ""):
    return JSONResponse(status_code=status, content={"error": error, "hint": hint})


def get_now(override: str | None = None) -> datetime:
    if override:
        return parse_dt(override)
    return parse_dt(store.get_meta("scenario_now", "2026-11-02T09:00:00+03:00"))


def snapshot_public(now: datetime):
    st = store.get_state()
    stock_map = {s["sku"]: s["on_hand"] for s in st["stock"]}
    snap = build_snapshot(st["products"], stock_map, st["orders"], st["shipments"], now)
    snap.pop("_alloc", None)
    return snap, st


@app.get("/api/health")
def health():
    st = store.get_state()
    return {"ok": True, "now": st["now"]}


@app.get("/api/snapshot")
def snapshot(now: str | None = None):
    n = get_now(now)
    snap, _ = snapshot_public(n)
    return snap


@app.get("/api/orders")
def list_orders(status: str = "active", now: str | None = None):
    n = get_now(now)
    snap, st = snapshot_public(n)
    if status == "active":
        return snap["orders_active"]
    if status == "all":
        # все заказы с вычисляемыми полями для активных
        by_id = {o["order_id"]: o for o in snap["orders_active"]}
        out = []
        for o in st["orders"]:
            if o["order_id"] in by_id:
                out.append(by_id[o["order_id"]])
            else:
                out.append({**o, "remaining": o["quantity"] - o["shipped_qty"],
                            "unreserved": o["quantity"] - o["shipped_qty"] - o["reserved_qty"],
                            "readiness": None, "atRisk": False, "shortage": 0})
        return out
    # фильтр по статусу
    stock_map = {s["sku"]: s["on_hand"] for s in st["stock"]}
    alloc = allocate(st["orders"], stock_map, st["shipments"], n)
    out = []
    for o in st["orders"]:
        if o["status"] != status:
            continue
        enr = alloc.get(o["order_id"], {})
        out.append({**o,
                    "remaining": enr.get("remaining", o["quantity"] - o["shipped_qty"]),
                    "unreserved": enr.get("unreserved", o["quantity"] - o["shipped_qty"] - o["reserved_qty"]),
                    "readiness": iso(enr["readiness"]) if enr.get("readiness") else None,
                    "atRisk": bool(enr.get("atRisk", False)),
                    "shortage": int(enr.get("shortage", 0))})
    return out


@app.get("/api/shipments")
def list_shipments():
    st = store.get_state()
    return st["shipments"]


@app.post("/api/orders", status_code=201)
def create_order(body: CreateOrder):
    st = store.get_state()
    n = parse_dt(st["now"])
    skus = {p["sku"] for p in st["products"]}
    if body.sku not in skus:
        return err(400, f"Товар {body.sku} неизвестен", "Доступно: FG-AIR, FG-PLUS")
    if body.quantity <= 0:
        return err(400, "Количество должно быть > 0", "Укажите quantity >= 1")
    try:
        due = parse_dt(body.due_at)
    except Exception:
        return err(400, "Некорректный due_at", "Формат ISO8601 с +03:00")
    if due <= n:
        return err(400, f"Срок {body.due_at} должен быть позже now {st['now']}", "Укажите будущую дату")
    oid = store.next_order_id()
    con = store.connect()
    con.execute("INSERT INTO orders(order_id,customer,sku,quantity,reserved_qty,shipped_qty,status,created_at,due_at) VALUES(?,?,?,?,?,?,?,?,?)",
                (oid, body.customer, body.sku, int(body.quantity), 0, 0, "active", iso(n), body.due_at))
    con.commit()
    con.close()
    snap, _ = snapshot_public(n)
    created = next((o for o in snap["orders_active"] if o["order_id"] == oid), None)
    return JSONResponse(status_code=201, content=created or {"order_id": oid})


@app.post("/api/orders/{order_id}/reserve")
def reserve(order_id: str, body: QtyOp):
    st = store.get_state()
    n = parse_dt(st["now"])
    o = next((x for x in st["orders"] if x["order_id"] == order_id), None)
    if o is None:
        return err(404, f"Заказ {order_id} не найден", "Проверьте ID")
    if o["status"] != "active":
        return err(400, f"Заказ {order_id} не активен ({o['status']})", "Резервировать можно только active")
    if body.qty <= 0:
        return err(400, "qty должен быть > 0", "")
    stock_map = {s["sku"]: s["on_hand"] for s in st["stock"]}
    alloc = allocate(st["orders"], stock_map, st["shipments"], n)
    # free(sku)
    sku = o["sku"]
    on_hand = stock_map.get(sku, 0)
    reserved_total = sum(x["reserved_qty"] for x in st["orders"] if x["status"] == "active" and x["sku"] == sku)
    free = on_hand - reserved_total
    unreserved = o["quantity"] - o["shipped_qty"] - o["reserved_qty"]
    if body.qty > free:
        return err(400, f"Недостаточно свободно {sku}: нужно {body.qty}, свободно {free}", "Дождитесь поставки или снимите чужой резерв")
    if body.qty > unreserved:
        return err(400, f"Заказ {order_id}: можно зарезервировать не более {unreserved}", "Уменьшите qty")
    con = store.connect()
    con.execute("UPDATE orders SET reserved_qty=reserved_qty+? WHERE order_id=?", (int(body.qty), order_id))
    con.commit()
    con.close()
    snap, _ = snapshot_public(n)
    upd = next((x for x in snap["orders_active"] if x["order_id"] == order_id), None)
    return {"order": upd, "snapshot": snap}


@app.post("/api/orders/{order_id}/ship")
def ship(order_id: str, body: QtyOp):
    st = store.get_state()
    n = parse_dt(st["now"])
    o = next((x for x in st["orders"] if x["order_id"] == order_id), None)
    if o is None:
        return err(404, f"Заказ {order_id} не найден", "")
    if o["status"] != "active":
        return err(400, f"Заказ {order_id} не активен ({o['status']}), повторная отгрузка запрещена", "Отгружать можно только active")
    if body.qty <= 0:
        return err(400, "qty должен быть > 0", "")
    stock_map = {s["sku"]: s["on_hand"] for s in st["stock"]}
    on_hand = stock_map.get(o["sku"], 0)
    if body.qty > o["reserved_qty"]:
        return err(400, f"Нельзя отгрузить {body.qty}: зарезервировано только {o['reserved_qty']}", "Сначала зарезервируйте")
    if body.qty > on_hand:
        return err(400, f"Нельзя отгрузить {body.qty}: на складе только {on_hand}", "Дождитесь поставки")
    con = store.connect()
    new_res = o["reserved_qty"] - int(body.qty)
    new_shp = o["shipped_qty"] + int(body.qty)
    new_on = on_hand - int(body.qty)
    new_status = "shipped" if new_shp == o["quantity"] else "active"
    con.execute("UPDATE orders SET reserved_qty=?, shipped_qty=?, status=? WHERE order_id=?",
                (new_res, new_shp, new_status, order_id))
    con.execute("UPDATE stock SET on_hand=? WHERE sku=?", (new_on, o["sku"]))
    con.commit()
    con.close()
    snap, _ = snapshot_public(n)
    return {"order_id": order_id, "status": new_status, "snapshot": snap}


@app.post("/api/shipments", status_code=201)
def create_shipment(body: CreateShipment):
    import re
    st = store.get_state()
    n = parse_dt(st["now"])
    skus = {p["sku"] for p in st["products"]}
    if body.sku not in skus:
        return err(400, f"Товар {body.sku} неизвестен", "Доступно: FG-AIR, FG-PLUS")
    if body.quantity <= 0:
        return err(400, "Количество должно быть > 0", "Укажите quantity >= 1")
    try:
        exp = parse_dt(body.expected_at)
    except Exception:
        return err(400, "Некорректный expected_at", "Формат ISO8601 с +03:00")
    if exp <= n:
        return err(400, f"Дата {body.expected_at} должна быть позже now {st['now']}", "Укажите будущую дату")
    prefix = "IN-AIR-" if body.sku == "FG-AIR" else "IN-PLUS-"
    taken = set()
    for s in st["shipments"]:
        m = re.fullmatch(re.escape(prefix) + r"(\d+)", s["shipment_id"])
        if m:
            taken.add(int(m.group(1)))
    num = max(taken) + 1 if taken else 1
    sid = f"{prefix}{num:02d}"
    con = store.connect()
    con.execute("INSERT INTO shipments(shipment_id,supplier,sku,quantity,expected_at,status) VALUES(?,?,?,?,?,?)",
                (sid, body.supplier or "Новый поставщик", body.sku, int(body.quantity), body.expected_at, "expected"))
    con.commit()
    con.close()
    created = next((x for x in store.get_state()["shipments"] if x["shipment_id"] == sid), None)
    return JSONResponse(status_code=201, content=created or {"shipment_id": sid})


@app.post("/api/shipments/{shipment_id}/receive")
def receive(shipment_id: str):
    st = store.get_state()
    n = parse_dt(st["now"])
    s = next((x for x in st["shipments"] if x["shipment_id"] == shipment_id), None)
    if s is None:
        return err(404, f"Поставка {shipment_id} не найдена", "")
    if s["status"] == "received":
        return err(400, f"Поставка {shipment_id} уже получена, повтор запрещён", "Остаток не изменён")
    if s["status"] != "expected":
        return err(400, f"Поставка {shipment_id} в статусе {s['status']}", "")
    con = store.connect()
    con.execute("UPDATE shipments SET status='received' WHERE shipment_id=?", (shipment_id,))
    row = con.execute("SELECT on_hand FROM stock WHERE sku=?", (s["sku"],)).fetchone()
    if row is None:
        con.execute("INSERT INTO stock(sku,on_hand) VALUES(?,?)", (s["sku"], int(s["quantity"])))
    else:
        con.execute("UPDATE stock SET on_hand=on_hand+? WHERE sku=?", (int(s["quantity"]), s["sku"]))
    con.commit()
    con.close()
    snap, _ = snapshot_public(n)
    return {"shipment_id": shipment_id, "status": "received", "snapshot": snap}


@app.post("/api/scenarios/delay")
def delay(body: DelayScenario, now: str | None = None):
    st = store.get_state()
    n = get_now(now) if now else parse_dt(st["now"])
    try:
        new_dt = parse_dt(body.new_expected_at)
    except Exception:
        return err(400, "Некорректный new_expected_at", "Формат ISO8601 с +03:00")
    stock_map = {s["sku"]: s["on_hand"] for s in st["stock"]}
    try:
        res = scenario_delay(st["orders"], stock_map, st["shipments"], n, body.shipment_id, new_dt)
    except KeyError as e:
        return err(404, str(e), "Проверьте shipment_id через GET /api/shipments")
    except ValueError as e:
        return err(400, str(e), "Сценарий возможен только для expected-поставки")
    return res


@app.get("/api/production/status")
def prod_status():
    st = store.get_state()
    return {"component_stock": st["component_stock_full"], "incoming": st["component_incoming"],
            "bom": st["bom"], "resources": st["resources"],
            "working_hours": st["working_hours"], "operation_minutes": st["operation_minutes"],
            "active_batch": st["active_batch"]}


@app.post("/api/production/plan")
def prod_plan(body: PlanRequest):
    st = store.get_state()
    start = parse_dt(body.start_from) if body.start_from else parse_dt(st["now"])
    try:
        res = plan_production(st["component_stock"], st["bom"], st["component_incoming"],
                              st["resources"], st["working_hours"], st["operation_minutes"],
                              body.finished_sku, int(body.batch_qty), start)
    except KeyError as e:
        return err(404, str(e), "")
    except ValueError as e:
        return err(400, str(e), "")
    return res


@app.post("/api/production/start")
def prod_start(body: StartRequest):
    st = store.get_state()
    if st["active_batch"] is not None:
        return err(409, "Уже есть активная партия, второй запуск запрещён", "Дождитесь завершения или reset")
    start = parse_dt(st["now"])
    try:
        res = plan_production(st["component_stock"], st["bom"], st["component_incoming"],
                              st["resources"], st["working_hours"], st["operation_minutes"],
                              body.finished_sku, int(body.batch_qty), start)
    except KeyError as e:
        return err(404, str(e), "")
    except ValueError as e:
        return err(400, str(e), "")
    if not res.get("feasible"):
        return err(400, f"Невозможно запустить: {res.get('explanation')}", "Проверьте shortage")
    if res.get("out_of_horizon"):
        return err(400, "Партия выходит за горизонт 02-06.11", "")
    # списать компоненты один раз
    need = {c: per * int(body.batch_qty) for c, per in st["bom"][body.finished_sku].items()}
    con = store.connect()
    for comp, q in need.items():
        row = con.execute("SELECT on_hand FROM component_stock WHERE sku=?", (comp,)).fetchone()
        have = row["on_hand"] if row else 0
        if have < q:
            con.close()
            return err(400, f"Не хватает {comp}: нужно {q}, есть {have}", "")
    for comp, q in need.items():
        con.execute("UPDATE component_stock SET on_hand=on_hand-? WHERE sku=?", (q, comp))
    con.execute("INSERT OR REPLACE INTO meta(key,value) VALUES('active_batch',?)",
                (json.dumps({"finished_sku": body.finished_sku, "batch_qty": int(body.batch_qty),
                             "started_at": st["now"], "batch_ready_at": res.get("batch_ready_at"),
                             "timeline": res.get("timeline")}, ensure_ascii=False),))
    con.commit()
    con.close()
    return {**res, "started": True}


@app.post("/api/ai/ask")
def ai_ask(body: AiAsk):
    st = store.get_state()
    n = parse_dt(st["now"])
    snap, _ = snapshot_public(n)
    # enrich snapshot для ai: shipments_expected уже есть; добавим все поставки для проверки unknown
    snap["shipments_expected"] = st["shipments"]  # все, чтобы отличать known/unknown? но для facts лучше expected
    # для unknown-детекта нужен полный список
    all_ids = [s["shipment_id"] for s in st["shipments"]]
    snap_full = dict(snap)
    scenario_diff = None
    if body.scenario:
        stock_map = {s["sku"]: s["on_hand"] for s in st["stock"]}
        try:
            scenario_diff = scenario_delay(st["orders"], stock_map, st["shipments"], n,
                                           body.scenario.shipment_id, parse_dt(body.scenario.new_expected_at))
        except KeyError as e:
            scenario_diff = {"error": str(e), "threatened": [], "before": [], "after": []}
        except ValueError as e:
            scenario_diff = {"error": str(e), "threatened": [], "before": [], "after": []}
    # для rule-based unknown: передадим все shipments
    answer, facts, via = ai_mod.answer(body.question, snap, scenario_diff, st["shipments"], persona=body.persona or "analyst", history=body.history or [])
    return {"answer": answer, "facts_used": facts, "via": via}


@app.post("/api/admin/reset")
def admin_reset(fixture: str = Query("simple")):
    if fixture not in ("simple", "extended"):
        return err(400, "fixture должен быть simple|extended", "")
    store.load_fixture(fixture)
    st = store.get_state()
    n = parse_dt(st["now"])
    snap, _ = snapshot_public(n)
    return {"ok": True, "fixture": fixture, "snapshot": snap}


@app.post("/api/admin/now")
def admin_now(body: AdminNow):
    try:
        parse_dt(body.now)
    except Exception:
        return err(400, "Некорректный now", "Формат ISO8601 с +03:00")
    store.set_meta("scenario_now", body.now)
    return {"ok": True, "now": body.now}
