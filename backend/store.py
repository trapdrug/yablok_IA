"""SQLite-хранилище. Файл twin.db рядом с app.py."""
from __future__ import annotations

import json
import sqlite3
from pathlib import Path

BASE = Path(__file__).resolve().parent
DB_PATH = BASE / "twin.db"
SEED_DIR = BASE / "seed"

SCHEMA = """
CREATE TABLE IF NOT EXISTS products(sku TEXT PRIMARY KEY, name TEXT, type TEXT, description TEXT, aliases TEXT);
CREATE TABLE IF NOT EXISTS stock(sku TEXT PRIMARY KEY, on_hand INTEGER);
CREATE TABLE IF NOT EXISTS orders(order_id TEXT PRIMARY KEY, customer TEXT, sku TEXT, quantity INTEGER, reserved_qty INTEGER, shipped_qty INTEGER, status TEXT, created_at TEXT, due_at TEXT);
CREATE TABLE IF NOT EXISTS shipments(shipment_id TEXT PRIMARY KEY, supplier TEXT, sku TEXT, quantity INTEGER, expected_at TEXT, status TEXT);
CREATE TABLE IF NOT EXISTS component_stock(sku TEXT PRIMARY KEY, name TEXT, on_hand INTEGER);
CREATE TABLE IF NOT EXISTS component_incoming(shipment_id TEXT PRIMARY KEY, sku TEXT, quantity INTEGER, expected_at TEXT, status TEXT);
CREATE TABLE IF NOT EXISTS bom(finished_sku TEXT PRIMARY KEY, components TEXT);
CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY, value TEXT);
"""


def connect():
    con = sqlite3.connect(str(DB_PATH))
    con.row_factory = sqlite3.Row
    return con


def init_db():
    con = connect()
    con.executescript(SCHEMA)
    con.commit()
    con.close()


def _load_json(path: Path):
    txt = path.read_text(encoding="utf-8-sig").strip().rstrip("\x1a").strip()
    return json.loads(txt)


def clear_all(con):
    for t in ["products", "stock", "orders", "shipments", "component_stock", "component_incoming", "bom", "meta"]:
        con.execute(f"DELETE FROM {t}")


def seed_simple(con):
    data = _load_json(SEED_DIR / "03.json")
    _apply_main_fixture(con, data)


def seed_extended(con):
    data = _load_json(SEED_DIR / "04.json")
    _apply_main_fixture(con, data)


def _apply_main_fixture(con, data):
    # products / stock / orders / shipments / now — очищаем только основную часть
    for t in ["products", "stock", "orders", "shipments"]:
        con.execute(f"DELETE FROM {t}")
    for p in data.get("products", []):
        con.execute("INSERT INTO products(sku,name,type,description,aliases) VALUES(?,?,?,?,?)",
                    (p["sku"], p.get("name"), p.get("type"), p.get("description"), json.dumps(p.get("aliases", []), ensure_ascii=False)))
    for s in data.get("stock", []):
        con.execute("INSERT INTO stock(sku,on_hand) VALUES(?,?)", (s["sku"], int(s["on_hand"])))
    for o in data.get("orders", []):
        con.execute("INSERT INTO orders(order_id,customer,sku,quantity,reserved_qty,shipped_qty,status,created_at,due_at) VALUES(?,?,?,?,?,?,?,?,?)",
                    (o["order_id"], o.get("customer"), o.get("sku"), int(o["quantity"]), int(o.get("reserved_qty", 0)),
                     int(o.get("shipped_qty", 0)), o.get("status"), o.get("created_at"), o.get("due_at")))
    for s in data.get("incoming_shipments", data.get("shipments", [])):
        con.execute("INSERT INTO shipments(shipment_id,supplier,sku,quantity,expected_at,status) VALUES(?,?,?,?,?,?)",
                    (s["shipment_id"], s.get("supplier", ""), s.get("sku"), int(s["quantity"]), s.get("expected_at"), s.get("status")))
    now = data.get("scenario_now", "2026-11-02T09:00:00+03:00")
    con.execute("INSERT OR REPLACE INTO meta(key,value) VALUES('scenario_now',?)", (now,))
    # active_batch сбрасываем
    con.execute("DELETE FROM meta WHERE key='active_batch'")


def seed_production(con):
    p = SEED_DIR / "05.json"
    if not p.exists():
        return
    data = _load_json(p)
    con.execute("DELETE FROM component_stock")
    con.execute("DELETE FROM component_incoming")
    con.execute("DELETE FROM bom")
    for c in data.get("component_stock", []):
        con.execute("INSERT INTO component_stock(sku,name,on_hand) VALUES(?,?,?)", (c["sku"], c.get("name"), int(c["on_hand"])))
    for c in data.get("component_incoming", []):
        con.execute("INSERT INTO component_incoming(shipment_id,sku,quantity,expected_at,status) VALUES(?,?,?,?,?)",
                    (c["shipment_id"], c.get("sku"), int(c["quantity"]), c.get("expected_at"), c.get("status")))
    for b in data.get("bills_of_materials", []):
        con.execute("INSERT INTO bom(finished_sku,components) VALUES(?,?)",
                    (b["finished_sku"], json.dumps(b.get("components", {}), ensure_ascii=False)))
    con.execute("INSERT OR REPLACE INTO meta(key,value) VALUES('production_resources',?)",
                (json.dumps(data.get("resources", {"assembly_workstations": 1, "test_stands": 1}), ensure_ascii=False),))
    con.execute("INSERT OR REPLACE INTO meta(key,value) VALUES('production_hours',?)",
                (json.dumps(data.get("working_hours", {}), ensure_ascii=False),))
    con.execute("INSERT OR REPLACE INTO meta(key,value) VALUES('production_ops',?)",
                (json.dumps(data.get("operation_minutes", {}), ensure_ascii=False),))


def seed_if_empty():
    init_db()
    con = connect()
    n = con.execute("SELECT COUNT(*) c FROM orders").fetchone()["c"]
    if n == 0:
        seed_simple(con)
        seed_production(con)
        con.commit()
    else:
        # production тоже догрузить если пусто
        m = con.execute("SELECT COUNT(*) c FROM component_stock").fetchone()["c"]
        if m == 0:
            seed_production(con)
            con.commit()
    con.close()


def load_fixture(name: str):
    init_db()
    con = connect()
    if name == "extended":
        seed_extended(con)
    else:
        seed_simple(con)
    seed_production(con)
    con.commit()
    con.close()


def get_meta(key: str, default=None):
    con = connect()
    r = con.execute("SELECT value FROM meta WHERE key=?", (key,)).fetchone()
    con.close()
    return r["value"] if r else default


def set_meta(key: str, value: str):
    con = connect()
    con.execute("INSERT OR REPLACE INTO meta(key,value) VALUES(?,?)", (key, value))
    con.commit()
    con.close()


def get_state():
    con = connect()
    products = []
    for r in con.execute("SELECT * FROM products"):
        products.append({"sku": r["sku"], "name": r["name"], "type": r["type"],
                         "description": r["description"], "aliases": json.loads(r["aliases"] or "[]")})
    stock = [{"sku": r["sku"], "on_hand": r["on_hand"]} for r in con.execute("SELECT * FROM stock")]
    orders = []
    for r in con.execute("SELECT * FROM orders"):
        orders.append({"order_id": r["order_id"], "customer": r["customer"], "sku": r["sku"],
                       "quantity": r["quantity"], "reserved_qty": r["reserved_qty"], "shipped_qty": r["shipped_qty"],
                       "status": r["status"], "created_at": r["created_at"], "due_at": r["due_at"]})
    shipments = []
    for r in con.execute("SELECT * FROM shipments"):
        shipments.append({"shipment_id": r["shipment_id"], "supplier": r["supplier"], "sku": r["sku"],
                          "quantity": r["quantity"], "expected_at": r["expected_at"], "status": r["status"]})
    comp_stock = {r["sku"]: r["on_hand"] for r in con.execute("SELECT * FROM component_stock")}
    comp_stock_full = [{"sku": r["sku"], "name": r["name"], "on_hand": r["on_hand"]} for r in con.execute("SELECT * FROM component_stock")]
    comp_inc = [{"shipment_id": r["shipment_id"], "sku": r["sku"], "quantity": r["quantity"],
                 "expected_at": r["expected_at"], "status": r["status"]} for r in con.execute("SELECT * FROM component_incoming")]
    bom = {}
    for r in con.execute("SELECT * FROM bom"):
        bom[r["finished_sku"]] = json.loads(r["components"] or "{}")
    con.close()
    now_s = get_meta("scenario_now", "2026-11-02T09:00:00+03:00")
    resources_s = get_meta("production_resources", '{"assembly_workstations":1,"test_stands":1}')
    hours_s = get_meta("production_hours", '{"start":"09:00","end":"17:00","working_days":["2026-11-02","2026-11-03","2026-11-04","2026-11-05","2026-11-06"]}')
    ops_s = get_meta("production_ops", '{"FG-AIR":{"assembly":20,"test":10},"FG-PLUS":{"assembly":30,"test":10}}')
    active_s = get_meta("active_batch", None)
    return {
        "products": products, "stock": stock, "orders": orders, "shipments": shipments,
        "component_stock": comp_stock, "component_stock_full": comp_stock_full,
        "component_incoming": comp_inc, "bom": bom,
        "resources": json.loads(resources_s), "working_hours": json.loads(hours_s), "operation_minutes": json.loads(ops_s),
        "now": now_s, "active_batch": json.loads(active_s) if active_s else None,
    }


def next_order_id() -> str:
    con = connect()
    rows = [r["order_id"] for r in con.execute("SELECT order_id FROM orders")]
    con.close()
    mx = 0
    for oid in rows:
        if oid.startswith("ORD-"):
            try:
                mx = max(mx, int(oid.split("-")[-1]))
            except Exception:
                pass
    return f"ORD-{mx+1:03d}"
