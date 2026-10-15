"""Чистые функции ядра цифрового двойника. Без БД и FastAPI."""
from __future__ import annotations

import copy
from datetime import datetime, timedelta, time as dtime
from dateutil import parser as date_parser
from dateutil import tz


def parse_dt(s: str) -> datetime:
    dt = date_parser.isoparse(s)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=tz.gettz("Europe/Moscow"))
    return dt


def iso(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    return dt.isoformat()


def _sort_key(o: dict):
    return (parse_dt(o["due_at"]), parse_dt(o["created_at"]), o["order_id"])


def allocate(orders: list[dict], stock: dict[str, int], shipments: list[dict], now: datetime):
    """Распределение free + expected-партий по заказам.

    orders: список dict с полями order_id, sku, quantity, reserved_qty, shipped_qty, status, created_at, due_at
    stock: {sku: on_hand}
    shipments: список dict shipment_id, sku, quantity, expected_at, status
    now: datetime

    Возвращает dict order_id -> enriched {remaining, unreserved, need, readiness(datetime|None), atRisk, shortage, used_shipments}
    """
    result: dict[str, dict] = {}
    # группировка по sku
    skus = set(list(stock.keys()) + [o["sku"] for o in orders if o.get("status") == "active"])
    for sku in skus:
        on_hand = int(stock.get(sku, 0))
        active = [o for o in orders if o.get("status") == "active" and o.get("sku") == sku]
        reserved_total = sum(int(o.get("reserved_qty", 0)) for o in active)
        free = on_hand - reserved_total
        # expected партии, не просроченные
        exps = []
        for s in shipments:
            if s.get("sku") != sku:
                continue
            if s.get("status") != "expected":
                continue
            try:
                eat = parse_dt(s["expected_at"])
            except Exception:
                continue
            if eat < now:
                continue  # просрочена — исключить до уточнения даты
            exps.append({"shipment_id": s["shipment_id"], "expected_at": eat, "quantity": int(s["quantity"])})
        exps.sort(key=lambda x: x["expected_at"])
        # остатки партий (mutable копия)
        exp_left = {e["shipment_id"]: e["quantity"] for e in exps}
        exp_by_id = {e["shipment_id"]: e for e in exps}
        free_left = free
        for o in sorted(active, key=_sort_key):
            oid = o["order_id"]
            qty = int(o.get("quantity", 0))
            res = int(o.get("reserved_qty", 0))
            shp = int(o.get("shipped_qty", 0))
            remaining = qty - shp
            unreserved = qty - shp - res
            need = unreserved
            due = parse_dt(o["due_at"])
            if need <= 0:
                readiness = now
                shortage = 0
                used: list[dict] = []
                at_risk = readiness > due
                result[oid] = {
                    "order_id": oid, "sku": sku, "remaining": remaining,
                    "unreserved": max(unreserved, 0), "need": 0,
                    "readiness": readiness, "atRisk": at_risk,
                    "shortage": 0, "used_shipments": used,
                    "due_at": due,
                }
                continue
            need_left = need
            used = []
            # откусываем от free
            take_free = min(max(free_left, 0), need_left)
            need_left -= take_free
            free_left -= take_free
            max_date = None
            if take_free > 0 or res > 0 or need == 0:
                max_date = now
            # затем от ближайших партий
            for e in exps:
                if need_left <= 0:
                    break
                avail = exp_left[e["shipment_id"]]
                if avail <= 0:
                    continue
                take = min(avail, need_left)
                exp_left[e["shipment_id"]] -= take
                need_left -= take
                used.append({"shipment_id": e["shipment_id"], "qty": take, "expected_at": e["expected_at"]})
                if max_date is None or e["expected_at"] > max_date:
                    max_date = e["expected_at"]
            if need_left > 0:
                result[oid] = {
                    "order_id": oid, "sku": sku, "remaining": remaining,
                    "unreserved": unreserved, "need": need,
                    "readiness": None, "atRisk": True,
                    "shortage": need_left, "used_shipments": used,
                    "due_at": due,
                }
            else:
                readiness = max_date if max_date is not None else now
                at_risk = readiness > due
                result[oid] = {
                    "order_id": oid, "sku": sku, "remaining": remaining,
                    "unreserved": unreserved, "need": need,
                    "readiness": readiness, "atRisk": at_risk,
                    "shortage": 0, "used_shipments": used,
                    "due_at": due,
                }
    return result


def build_snapshot(products, stock, orders, shipments, now: datetime):
    """Строит snapshot-dict для API."""
    stock_map = {s["sku"] if isinstance(s, dict) else s[0:1]: 0 for s in []}  # placeholder
    # stock может быть dict {sku:on_hand} или list[{sku,on_hand}]
    if isinstance(stock, dict):
        on_hand_map = dict(stock)
    else:
        on_hand_map = {s["sku"]: int(s["on_hand"]) for s in stock}
    alloc = allocate(orders, on_hand_map, shipments, now)
    # reserved/free per sku
    skus = set(list(on_hand_map.keys()))
    for o in orders:
        if o.get("status") == "active":
            skus.add(o.get("sku"))
    stock_list = []
    for sku in sorted(skus):
        on_hand = int(on_hand_map.get(sku, 0))
        reserved = sum(int(o.get("reserved_qty", 0)) for o in orders if o.get("status") == "active" and o.get("sku") == sku)
        free = on_hand - reserved
        stock_list.append({"sku": sku, "on_hand": on_hand, "reserved": reserved, "free": free})
    active_orders = [o for o in orders if o.get("status") == "active"]
    # сортировка для стабильности
    active_orders = sorted(active_orders, key=_sort_key)
    orders_active = []
    for o in active_orders:
        enr = alloc.get(o["order_id"], {})
        readiness = enr.get("readiness")
        orders_active.append({
            **o,
            "remaining": enr.get("remaining", int(o.get("quantity", 0)) - int(o.get("shipped_qty", 0))),
            "unreserved": enr.get("unreserved", int(o.get("quantity", 0)) - int(o.get("shipped_qty", 0)) - int(o.get("reserved_qty", 0))),
            "readiness": iso(readiness) if readiness else None,
            "atRisk": bool(enr.get("atRisk", False)),
            "shortage": int(enr.get("shortage", 0)),
        })
    expected = [s for s in shipments if s.get("status") == "expected"]
    expected = sorted(expected, key=lambda s: parse_dt(s["expected_at"]))
    at_risk_n = sum(1 for o in orders_active if o.get("atRisk"))
    shortage_n = sum(1 for o in orders_active if (o.get("shortage") or 0) > 0)
    kpi = {
        "active_orders": len(active_orders),
        "at_risk": at_risk_n,
        "shortage_orders": shortage_n,
        "skus": len(stock_list),
        "expected_shipments": len(expected),
    }
    return {
        "now": iso(now),
        "products": products,
        "stock": stock_list,
        "orders_active": orders_active,
        "shipments_expected": expected,
        "kpi": kpi,
        "_alloc": alloc,  # внутреннее, app.py вырежет
    }


def scenario_delay(orders, stock_map, shipments, now: datetime, shipment_id: str, new_expected_at: datetime):
    """Расчёт задержки на глубокой копии. Возвращает before/after/threatened. Ошибки — ValueError/KeyError."""
    # найти поставку
    target = None
    for s in shipments:
        if s.get("shipment_id") == shipment_id:
            target = s
            break
    if target is None:
        raise KeyError(f"Поставка {shipment_id} не найдена")
    if target.get("status") != "expected":
        raise ValueError(f"Поставка {shipment_id} уже {target.get('status')}, задержку считать нельзя")
    before_alloc = allocate(orders, stock_map, shipments, now)
    before = [{"order_id": oid, "readiness": iso(v["readiness"]), "atRisk": v["atRisk"]} for oid, v in before_alloc.items()]
    # копия поставок с новой датой
    new_ships = copy.deepcopy(shipments)
    for s in new_ships:
        if s.get("shipment_id") == shipment_id:
            s["expected_at"] = iso(new_expected_at)
            break
    after_alloc = allocate(orders, stock_map, new_ships, now)
    after = [{"order_id": oid, "readiness": iso(v["readiness"]), "atRisk": v["atRisk"]} for oid, v in after_alloc.items()]
    before_map = {b["order_id"]: b for b in before}
    threatened = []
    for a in after:
        b = before_map.get(a["order_id"])
        if b is None:
            continue
        if b["readiness"] != a["readiness"]:
            # ухудшение: стала позже или пропала
            threatened.append(a["order_id"])
    # explanation
    if threatened:
        expl = f"Задержка {shipment_id} до {iso(new_expected_at)} сдвигает готовность: {', '.join(threatened)}. База не изменена."
    else:
        expl = f"Задержка {shipment_id} до {iso(new_expected_at)} никого не затрагивает. База не изменена."
    return {
        "shipment": {**target, "new_expected_at": iso(new_expected_at)},
        "before": sorted(before, key=lambda x: x["order_id"]),
        "after": sorted(after, key=lambda x: x["order_id"]),
        "threatened": sorted(threatened),
        "explanation": expl,
    }


# ---------- Производство ----------

def _parse_working_hours(working_hours: dict):
    start_s = working_hours.get("start", "09:00")
    end_s = working_hours.get("end", "17:00")
    sh, sm = map(int, start_s.split(":"))
    eh, em = map(int, end_s.split(":"))
    days = set(working_hours.get("working_days", []))
    return dtime(sh, sm), dtime(eh, em), days


def plan_production(component_stock: dict, bom_map: dict, component_incoming: list,
                    resources: dict, working_hours: dict, operation_minutes: dict,
                    finished_sku: str, batch_qty: int, start_from: datetime):
    """План партии на копии. Не списывает компоненты."""
    if finished_sku not in bom_map:
        raise KeyError(f"Товар {finished_sku} неизвестен")
    if batch_qty <= 0:
        raise ValueError("batch_qty должен быть > 0")
    bom = bom_map[finished_sku]
    need_map = {comp: per * batch_qty for comp, per in bom.items()}
    shortage = []
    for comp, need in need_map.items():
        have = int(component_stock.get(comp, 0))
        if need > have:
            shortage.append({"sku": comp, "need": need, "have": have, "deficit": need - have})
    feasible = len(shortage) == 0
    ws, we, wdays = _parse_working_hours(working_hours)
    op = operation_minutes.get(finished_sku, {})
    asm_min = int(op.get("assembly", 20))
    tst_min = int(op.get("test", 10))

    def day_str(dt: datetime) -> str:
        return dt.date().isoformat()

    def align(dt: datetime, dur_min: int):
        """Подогнать старт операции чтобы влезла до 17:00 в рабочий день. Возвращает datetime или None (горизонт)."""
        cur = dt
        # защита от бесконечного цикла
        for _ in range(60):
            d = day_str(cur)
            if d not in wdays:
                # следующий рабочий день
                nxt = None
                for wd in sorted(wdays):
                    if wd > d:
                        nxt = wd
                        break
                if nxt is None:
                    return None
                y, m, dd = map(int, nxt.split("-"))
                cur = cur.replace(year=y, month=m, day=dd, hour=ws.hour, minute=ws.minute, second=0, microsecond=0)
                continue
            # время
            t = cur.time().replace(tzinfo=None)
            if t < ws:
                cur = cur.replace(hour=ws.hour, minute=ws.minute, second=0, microsecond=0)
                t = cur.time().replace(tzinfo=None)
            end = cur + timedelta(minutes=dur_min)
            # если конец в другой день или позже 17:00 -> перенос
            if end.date() != cur.date() or end.time().replace(tzinfo=None) > we:
                # следующий рабочий день 09:00
                nxt = None
                for wd in sorted(wdays):
                    if wd > d:
                        nxt = wd
                        break
                if nxt is None:
                    return None
                y, m, dd = map(int, nxt.split("-"))
                cur = cur.replace(year=y, month=m, day=dd, hour=ws.hour, minute=ws.minute, second=0, microsecond=0)
                continue
            return cur
        return None

    if not feasible:
        # объяснение с учётом входящих
        parts = []
        for sh in shortage:
            sku = sh["sku"]
            inc = [c for c in component_incoming if c.get("sku") == sku and c.get("status") == "expected"]
            if inc:
                inc_sorted = sorted(inc, key=lambda x: parse_dt(x["expected_at"]))
                first = inc_sorted[0]
                parts.append(f"{sku}: есть {sh['have']}, нужно {sh['need']}, не хватает {sh['deficit']}; ближайшее пополнение +{first['quantity']} только {first['expected_at']} ({first['shipment_id']})")
            else:
                parts.append(f"{sku}: есть {sh['have']}, нужно {sh['need']}, не хватает {sh['deficit']}; пополнений нет")
        explanation = f"Партия {batch_qty} x {finished_sku} невозможна. " + "; ".join(parts)
        return {"feasible": False, "shortage": shortage, "timeline": [],
                "batch_ready_at": None, "out_of_horizon": False, "explanation": explanation}

    # feasible -> строим timeline
    asm_free = start_from
    tst_free = start_from
    timeline = []
    for i in range(1, batch_qty + 1):
        a_start = align(asm_free, asm_min)
        if a_start is None:
            return {"feasible": True, "shortage": [], "timeline": timeline,
                    "batch_ready_at": None, "out_of_horizon": True,
                    "explanation": f"Выход за горизонт планирования (02-06.11): операция {i} не влезает до 17:00 06.11."}
        a_end = a_start + timedelta(minutes=asm_min)
        asm_free = a_end
        t_earliest = max(a_end, tst_free)
        t_start = align(t_earliest, tst_min)
        if t_start is None:
            return {"feasible": True, "shortage": [], "timeline": timeline,
                    "batch_ready_at": None, "out_of_horizon": True,
                    "explanation": "Выход за горизонт планирования (02-06.11): тест не влезает до 17:00 06.11."}
        t_end = t_start + timedelta(minutes=tst_min)
        tst_free = t_end
        timeline.append({
            "unit": i,
            "assembly_start": iso(a_start), "assembly_end": iso(a_end),
            "test_start": iso(t_start), "test_end": iso(t_end),
        })
    batch_ready = tst_free
    explanation = f"Партия {batch_qty} x {finished_sku} выполнима, готовность {iso(batch_ready)}."
    return {"feasible": True, "shortage": [], "timeline": timeline,
            "batch_ready_at": iso(batch_ready), "out_of_horizon": False, "explanation": explanation}
