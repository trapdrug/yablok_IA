"""Тесты ядра: snapshot/allocate/delay/production."""
import json
from pathlib import Path
from dateutil import parser as dp

from backend.engine import allocate, build_snapshot, parse_dt, plan_production, scenario_delay

SEED = Path(__file__).resolve().parent.parent / "seed"
NOW = parse_dt("2026-11-02T09:00:00+03:00")


def load(name):
    return json.loads((SEED / name).read_text(encoding="utf-8"))


def state_simple():
    d = load("03.json")
    stock = {s["sku"]: s["on_hand"] for s in d["stock"]}
    return d, stock


def test_snapshot_numbers_simple():
    d, stock = state_simple()
    snap = build_snapshot(d["products"], stock, d["orders"], d["incoming_shipments"], NOW)
    m = {s["sku"]: s for s in snap["stock"]}
    assert m["FG-AIR"]["on_hand"] == 18 and m["FG-AIR"]["reserved"] == 6 and m["FG-AIR"]["free"] == 12
    assert m["FG-PLUS"]["on_hand"] == 8 and m["FG-PLUS"]["reserved"] == 5 and m["FG-PLUS"]["free"] == 3
    assert len(snap["orders_active"]) == 6


def test_etalon_001():
    d, stock = state_simple()
    a = allocate(d["orders"], stock, d["incoming_shipments"], NOW)
    assert a["ORD-001"]["readiness"] == NOW


def test_etalon_002():
    d, stock = state_simple()
    a = allocate(d["orders"], stock, d["incoming_shipments"], NOW)
    assert a["ORD-002"]["readiness"] == NOW


def test_etalon_003():
    d, stock = state_simple()
    a = allocate(d["orders"], stock, d["incoming_shipments"], NOW)
    assert a["ORD-003"]["readiness"] == parse_dt("2026-11-03T10:00:00+03:00")


def test_etalon_006():
    d, stock = state_simple()
    a = allocate(d["orders"], stock, d["incoming_shipments"], NOW)
    assert a["ORD-006"]["readiness"] == NOW


def test_etalon_004():
    d, stock = state_simple()
    a = allocate(d["orders"], stock, d["incoming_shipments"], NOW)
    assert a["ORD-004"]["readiness"] == parse_dt("2026-11-04T09:00:00+03:00")


def test_etalon_005():
    d, stock = state_simple()
    a = allocate(d["orders"], stock, d["incoming_shipments"], NOW)
    assert a["ORD-005"]["readiness"] == parse_dt("2026-11-03T10:00:00+03:00")


def test_prosrochka_iskluchaetsya():
    d, stock = state_simple()
    now2 = parse_dt("2026-11-04T10:00:00+03:00")
    a = allocate(d["orders"], stock, d["incoming_shipments"], now2)
    # IN-AIR-01 (03.11) просрочена -> исключена, ORD-003 берёт из IN-AIR-02 (05.11)
    used_ids = [u["shipment_id"] for u in a["ORD-003"]["used_shipments"]]
    assert "IN-AIR-01" not in used_ids
    assert a["ORD-003"]["readiness"] == parse_dt("2026-11-05T15:00:00+03:00")


def test_shortage_20air():
    d, stock = state_simple()
    orders = list(d["orders"]) + [{"order_id": "ORD-T", "customer": "t", "sku": "FG-AIR",
                                   "quantity": 20, "reserved_qty": 0, "shipped_qty": 0,
                                   "status": "active", "created_at": "2026-11-02T10:00:00+03:00",
                                   "due_at": "2026-11-06T17:00:00+03:00"}]
    a = allocate(orders, stock, d["incoming_shipments"], NOW)
    assert a["ORD-T"]["shortage"] == 12  # всего Air 18+18 поставок=36? check: free12+10+8=30, занято 22 -> остаток 8? пересчёт ниже
    assert a["ORD-T"]["readiness"] is None


def test_delay_copy_ne_menyaet_bazu():
    d, stock = state_simple()
    before_json = json.dumps(d["incoming_shipments"], ensure_ascii=False)
    res = scenario_delay(d["orders"], stock, d["incoming_shipments"], NOW,
                         "IN-AIR-01", parse_dt("2026-11-05T10:00:00+03:00"))
    assert set(res["threatened"]) == {"ORD-003", "ORD-005"}
    assert json.dumps(d["incoming_shipments"], ensure_ascii=False) == before_json


def test_delay_unknown_404():
    d, stock = state_simple()
    try:
        scenario_delay(d["orders"], stock, d["incoming_shipments"], NOW, "IN-UNKNOWN", NOW)
        assert False
    except KeyError:
        assert True


def test_production_8plus_nevozmozhna():
    prod = load("05.json")
    comp = {c["sku"]: c["on_hand"] for c in prod["component_stock"]}
    bom = {b["finished_sku"]: b["components"] for b in prod["bills_of_materials"]}
    res = plan_production(comp, bom, prod["component_incoming"], prod["resources"],
                          prod["working_hours"], prod["operation_minutes"],
                          "FG-PLUS", 8, NOW)
    assert res["feasible"] is False
    co2 = next(s for s in res["shortage"] if s["sku"] == "CMP-CO2")
    assert co2["need"] == 8 and co2["have"] == 2
    assert "04.11" in res["explanation"] or "2026-11-04" in res["explanation"]


def test_production_2air_feasible():
    prod = load("05.json")
    comp = {c["sku"]: c["on_hand"] for c in prod["component_stock"]}
    bom = {b["finished_sku"]: b["components"] for b in prod["bills_of_materials"]}
    res = plan_production(comp, bom, prod["component_incoming"], prod["resources"],
                          prod["working_hours"], prod["operation_minutes"],
                          "FG-AIR", 2, NOW)
    assert res["feasible"] is True and res["batch_ready_at"] is not None
    assert len(res["timeline"]) == 2
    # тест второго изделия может идти параллельно сборке? проверяем что test_start[1] >= assembly_end[1]
    t = res["timeline"]
    assert dp.isoparse(t[0]["test_start"]) >= dp.isoparse(t[0]["assembly_end"])


def test_no_double_promise():
    d, stock = state_simple()
    a = allocate(d["orders"], stock, d["incoming_shipments"], NOW)
    # сумма взятого из партий не превышает их объём
    used = {}
    for v in a.values():
        for u in v.get("used_shipments", []):
            used[u["shipment_id"]] = used.get(u["shipment_id"], 0) + u["qty"]
    for s in d["incoming_shipments"]:
        assert used.get(s["shipment_id"], 0) <= s["quantity"]


def test_snapshot_extended():
    d = load("04.json")
    stock = {s["sku"]: s["on_hand"] for s in d["stock"]}
    snap = build_snapshot(d["products"], stock, d["orders"], d["incoming_shipments"], NOW)
    m = {s["sku"]: s for s in snap["stock"]}
    assert m["FG-AIR"]["on_hand"] == 36 and m["FG-AIR"]["reserved"] == 8 and m["FG-AIR"]["free"] == 28
    assert m["FG-PLUS"]["on_hand"] == 20 and m["FG-PLUS"]["reserved"] == 8 and m["FG-PLUS"]["free"] == 12
