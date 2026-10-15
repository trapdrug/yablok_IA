// Локальный мок-двойник: повторяет логику backend/engine.py 1-в-1.
// Используется только когда API недоступен (баннер ДЕМО-МОК).

export interface Product { sku: string; name: string; type?: string; description?: string; aliases?: string[] }
export interface StockRow { sku: string; on_hand: number }
export interface Order {
  order_id: string; customer: string; sku: string; quantity: number;
  reserved_qty: number; shipped_qty: number; status: string;
  created_at: string; due_at: string;
  remaining?: number; unreserved?: number; readiness?: string | null;
  atRisk?: boolean; shortage?: number;
}
export interface Shipment {
  shipment_id: string; supplier: string; sku: string; quantity: number;
  expected_at: string; status: string;
}
export interface StockView { sku: string; on_hand: number; reserved: number; free: number }

interface AllocEntry {
  order_id: string; sku: string; remaining: number; unreserved: number; need: number;
  readiness: Date | null; atRisk: boolean; shortage: number;
  used: { shipment_id: string; qty: number; expected_at: Date }[]; due: Date;
}

function parseDt(s: string): Date { return new Date(s); }
// Возвращаем ISO с сохранением +03:00 как у бэкенда: проще вернуть исходный toISOString,
// но для сравнимости дат достаточно Date. Для API-совместимости вернём ISO строку даты.
function isoOut(d: Date | null): string | null {
  if (!d) return null;
  return d.toISOString();
}

let products: Product[] = [];
let stock: StockRow[] = [];
let orders: Order[] = [];
let shipments: Shipment[] = [];
let compStockFull: { sku: string; name: string; on_hand: number }[] = [];
let compIncoming: Shipment[] = [];
let bom: Record<string, Record<string, number>> = {};
let resources = { assembly_workstations: 1, test_stands: 1 };
let workingHours: { start: string; end: string; working_days: string[] } = {
  start: '09:00', end: '17:00',
  working_days: ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06'],
};
let operationMinutes: Record<string, { assembly: number; test: number }> = {
  'FG-AIR': { assembly: 20, test: 10 },
  'FG-PLUS': { assembly: 30, test: 10 },
};
let nowStr = '2026-11-02T09:00:00+03:00';
let activeBatch: any = null;
let fixtureName = 'simple';
let loaded = false;
let loadPromise: Promise<void> | null = null;

function nowDt(): Date { return parseDt(nowStr); }

function sortOrders(a: Order, b: Order): number {
  const da = parseDt(a.due_at).getTime() - parseDt(b.due_at).getTime();
  if (da !== 0) return da;
  const ca = parseDt(a.created_at).getTime() - parseDt(b.created_at).getTime();
  if (ca !== 0) return ca;
  return a.order_id.localeCompare(b.order_id);
}

export function allocate(
  ords: Order[], stockMap: Record<string, number>, ships: Shipment[], now: Date
): Record<string, AllocEntry> {
  const result: Record<string, AllocEntry> = {};
  const skus = new Set<string>([...Object.keys(stockMap)]);
  for (const o of ords) if (o.status === 'active') skus.add(o.sku);
  for (const sku of skus) {
    const onHand = stockMap[sku] ?? 0;
    const active = ords.filter((o) => o.status === 'active' && o.sku === sku);
    const reservedTotal = active.reduce((s, o) => s + (o.reserved_qty || 0), 0);
    let freeLeft = onHand - reservedTotal;
    const exps = ships
      .filter((s) => s.sku === sku && s.status === 'expected')
      .map((s) => ({ shipment_id: s.shipment_id, expected_at: parseDt(s.expected_at), quantity: s.quantity }))
      .filter((e) => !(e.expected_at < now))
      .sort((a, b) => a.expected_at.getTime() - b.expected_at.getTime());
    const expLeft: Record<string, number> = {};
    for (const e of exps) expLeft[e.shipment_id] = (expLeft[e.shipment_id] ?? 0) + e.quantity;
    // объединяем дубли ID (не должно быть, но для надёжности)
    const ordered = [...active].sort(sortOrders);
    for (const o of ordered) {
      const qty = o.quantity, res = o.reserved_qty || 0, shp = o.shipped_qty || 0;
      const remaining = qty - shp;
      const unreserved = qty - shp - res;
      const need = unreserved;
      const due = parseDt(o.due_at);
      if (need <= 0) {
        result[o.order_id] = {
          order_id: o.order_id, sku, remaining, unreserved: Math.max(unreserved, 0),
          need: 0, readiness: now, atRisk: now > due, shortage: 0, used: [], due,
        };
        continue;
      }
      let needLeft = need;
      const used: AllocEntry['used'] = [];
      const takeFree = Math.min(Math.max(freeLeft, 0), needLeft);
      needLeft -= takeFree;
      freeLeft -= takeFree;
      let maxDate: Date | null = null;
      if (takeFree > 0 || res > 0) maxDate = now;
      for (const e of exps) {
        if (needLeft <= 0) break;
        const avail = expLeft[e.shipment_id] ?? 0;
        if (avail <= 0) continue;
        const take = Math.min(avail, needLeft);
        expLeft[e.shipment_id] -= take;
        needLeft -= take;
        used.push({ shipment_id: e.shipment_id, qty: take, expected_at: e.expected_at });
        if (!maxDate || e.expected_at > maxDate) maxDate = e.expected_at;
      }
      if (needLeft > 0) {
        result[o.order_id] = {
          order_id: o.order_id, sku, remaining, unreserved, need,
          readiness: null, atRisk: true, shortage: needLeft, used, due,
        };
      } else {
        const readiness = maxDate ?? now;
        result[o.order_id] = {
          order_id: o.order_id, sku, remaining, unreserved, need,
          readiness, atRisk: readiness > due, shortage: 0, used, due,
        };
      }
    }
  }
  return result;
}

export function buildSnapshot() {
  const now = nowDt();
  const stockMap: Record<string, number> = {};
  for (const s of stock) stockMap[s.sku] = s.on_hand;
  const alloc = allocate(orders, stockMap, shipments, now);
  const skuSet = new Set<string>(Object.keys(stockMap));
  for (const o of orders) if (o.status === 'active') skuSet.add(o.sku);
  const stockList: StockView[] = [...skuSet].sort().map((sku) => {
    const on_hand = stockMap[sku] ?? 0;
    const reserved = orders.filter((o) => o.status === 'active' && o.sku === sku)
      .reduce((s, o) => s + (o.reserved_qty || 0), 0);
    return { sku, on_hand, reserved, free: on_hand - reserved };
  });
  const activeOrders = orders.filter((o) => o.status === 'active').sort(sortOrders).map((o) => {
    const e = alloc[o.order_id];
    return {
      ...o,
      remaining: e ? e.remaining : o.quantity - o.shipped_qty,
      unreserved: e ? e.unreserved : o.quantity - o.shipped_qty - o.reserved_qty,
      readiness: e && e.readiness ? e.readiness.toISOString() : null,
      atRisk: e ? e.atRisk : false,
      shortage: e ? e.shortage : 0,
    };
  });
  const expected = shipments.filter((s) => s.status === 'expected')
    .sort((a, b) => parseDt(a.expected_at).getTime() - parseDt(b.expected_at).getTime());
  const kpi = {
    active_orders: activeOrders.length,
    at_risk: activeOrders.filter((o) => o.atRisk).length,
    shortage_orders: activeOrders.filter((o) => (o.shortage || 0) > 0).length,
    skus: stockList.length,
    expected_shipments: expected.length,
  };
  return { now: nowStr, products, stock: stockList, orders_active: activeOrders, shipments_expected: expected, kpi };
}

function applyFixtureData(data: any) {
  products = data.products || [];
  stock = (data.stock || []).map((s: any) => ({ sku: s.sku, on_hand: Number(s.on_hand) }));
  orders = (data.orders || []).map((o: any) => ({ ...o }));
  shipments = (data.incoming_shipments || data.shipments || []).map((s: any) => ({ ...s }));
  nowStr = data.scenario_now || '2026-11-02T09:00:00+03:00';
  activeBatch = null;
}

function applyProdData(data: any) {
  compStockFull = (data.component_stock || []).map((c: any) => ({ ...c }));
  compIncoming = (data.component_incoming || []).map((c: any) => ({ ...c, supplier: '', status: c.status || 'expected' }));
  bom = {};
  for (const b of data.bills_of_materials || []) bom[b.finished_sku] = { ...b.components };
  resources = data.resources || resources;
  workingHours = data.working_hours || workingHours;
  operationMinutes = data.operation_minutes || operationMinutes;
}

const SIMPLE_FALLBACK = {
  company: 'ЯблокИИ', scenario_now: '2026-11-02T09:00:00+03:00',
  products: [
    { sku: 'FG-AIR', name: 'air', type: 'finished_good', description: '', aliases: ['air', 'базовый датчик', 'Аир'] },
    { sku: 'FG-PLUS', name: 'air plus', type: 'finished_good', description: '', aliases: ['air plus', 'air+', 'датчик с CO2', 'Аир Плюс'] },
  ],
  stock: [{ sku: 'FG-AIR', on_hand: 18 }, { sku: 'FG-PLUS', on_hand: 8 }],
  orders: [
    { order_id: 'ORD-001', customer: 'Кампус Восток', sku: 'FG-AIR', quantity: 6, reserved_qty: 6, shipped_qty: 0, status: 'active', created_at: '2026-11-01T09:00:00+03:00', due_at: '2026-11-02T17:00:00+03:00' },
    { order_id: 'ORD-002', customer: 'Офис Парк', sku: 'FG-PLUS', quantity: 5, reserved_qty: 5, shipped_qty: 0, status: 'active', created_at: '2026-11-01T10:00:00+03:00', due_at: '2026-11-03T17:00:00+03:00' },
    { order_id: 'ORD-003', customer: 'Лаборатория Учебная', sku: 'FG-AIR', quantity: 15, reserved_qty: 0, shipped_qty: 0, status: 'active', created_at: '2026-11-01T11:00:00+03:00', due_at: '2026-11-03T17:00:00+03:00' },
    { order_id: 'ORD-004', customer: 'Бизнес Центр Север', sku: 'FG-PLUS', quantity: 7, reserved_qty: 0, shipped_qty: 0, status: 'active', created_at: '2026-11-01T12:00:00+03:00', due_at: '2026-11-04T17:00:00+03:00' },
    { order_id: 'ORD-005', customer: 'Колледж Маяк', sku: 'FG-AIR', quantity: 7, reserved_qty: 0, shipped_qty: 0, status: 'active', created_at: '2026-11-01T13:00:00+03:00', due_at: '2026-11-04T17:00:00+03:00' },
    { order_id: 'ORD-006', customer: 'Мастерская Пилот', sku: 'FG-PLUS', quantity: 2, reserved_qty: 0, shipped_qty: 0, status: 'active', created_at: '2026-11-01T14:00:00+03:00', due_at: '2026-11-03T17:00:00+03:00' },
    { order_id: 'ORD-007', customer: 'Коворкинг Берег', sku: 'FG-AIR', quantity: 4, reserved_qty: 0, shipped_qty: 4, status: 'shipped', created_at: '2026-10-30T09:00:00+03:00', due_at: '2026-11-01T17:00:00+03:00' },
    { order_id: 'ORD-008', customer: 'Офис Резерв', sku: 'FG-PLUS', quantity: 6, reserved_qty: 0, shipped_qty: 0, status: 'cancelled', created_at: '2026-10-30T10:00:00+03:00', due_at: '2026-11-02T17:00:00+03:00' },
  ],
  incoming_shipments: [
    { shipment_id: 'IN-AIR-01', supplier: 'Контрактная сборка Север', sku: 'FG-AIR', quantity: 10, expected_at: '2026-11-03T10:00:00+03:00', status: 'expected' },
    { shipment_id: 'IN-PLUS-01', supplier: 'Контрактная сборка Юг', sku: 'FG-PLUS', quantity: 6, expected_at: '2026-11-04T09:00:00+03:00', status: 'expected' },
    { shipment_id: 'IN-AIR-02', supplier: 'Контрактная сборка Север', sku: 'FG-AIR', quantity: 8, expected_at: '2026-11-05T15:00:00+03:00', status: 'expected' },
  ],
};

const PROD_FALLBACK = {
  component_stock: [
    { sku: 'CMP-CTRL', name: 'Управляющая плата', on_hand: 14 },
    { sku: 'CMP-TH', name: 'Датчик температуры и влажности', on_hand: 14 },
    { sku: 'CMP-CASE', name: 'Корпус', on_hand: 14 },
    { sku: 'CMP-PWR', name: 'Модуль питания', on_hand: 14 },
    { sku: 'CMP-CO2', name: 'Датчик CO2', on_hand: 2 },
  ],
  bills_of_materials: [
    { finished_sku: 'FG-AIR', components: { 'CMP-CTRL': 1, 'CMP-TH': 1, 'CMP-CASE': 1, 'CMP-PWR': 1 } },
    { finished_sku: 'FG-PLUS', components: { 'CMP-CTRL': 1, 'CMP-TH': 1, 'CMP-CASE': 1, 'CMP-PWR': 1, 'CMP-CO2': 1 } },
  ],
  component_incoming: [
    { shipment_id: 'IN-CMP-CO2-01', sku: 'CMP-CO2', quantity: 8, expected_at: '2026-11-04T09:00:00+03:00', status: 'expected' },
  ],
  resources: { assembly_workstations: 1, test_stands: 1 },
  working_hours: { start: '09:00', end: '17:00', working_days: ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06'] },
  operation_minutes: { 'FG-AIR': { assembly: 20, test: 10 }, 'FG-PLUS': { assembly: 30, test: 10 } },
};

let cache03: any = null, cache04: any = null, cache05: any = null;

export function ensureMockLoaded(): Promise<void> {
  if (loaded) return Promise.resolve();
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    try {
      const [r03, r04, r05] = await Promise.all([
        fetch('seed-03.json').then((r) => (r.ok ? r.json() : null)).catch(() => null),
        fetch('seed-04.json').then((r) => (r.ok ? r.json() : null)).catch(() => null),
        fetch('seed-05.json').then((r) => (r.ok ? r.json() : null)).catch(() => null),
      ]);
      cache03 = r03; cache04 = r04; cache05 = r05;
    } catch { /* offline */ }
    applyFixtureData(cache03 || SIMPLE_FALLBACK);
    applyProdData(cache05 || PROD_FALLBACK);
    fixtureName = 'simple';
    loaded = true;
  })();
  return loadPromise;
}

export function mockReset(fixture: 'simple' | 'extended') {
  fixtureName = fixture;
  if (fixture === 'extended' && cache04) applyFixtureData(cache04);
  else if (fixture === 'extended' && !cache04) {
    // минимальная расширенная заглушка: верные KPI 36/8/28 и 20/8/12
    const ext = JSON.parse(JSON.stringify(SIMPLE_FALLBACK));
    ext.stock = [{ sku: 'FG-AIR', on_hand: 36 }, { sku: 'FG-PLUS', on_hand: 20 }];
    ext.orders = [
      { order_id: 'SB-ORD-001', customer: 'Учебный клиент 01', sku: 'FG-AIR', quantity: 10, reserved_qty: 2, shipped_qty: 3, status: 'active', created_at: '2026-10-30T09:17:00+03:00', due_at: '2026-11-01T17:00:00+03:00' },
      { order_id: 'SB-ORD-002', customer: 'Учебный клиент 02', sku: 'FG-PLUS', quantity: 8, reserved_qty: 2, shipped_qty: 0, status: 'active', created_at: '2026-10-30T09:34:00+03:00', due_at: '2026-11-01T17:00:00+03:00' },
      { order_id: 'SB-ORD-003', customer: 'Учебный клиент 03', sku: 'FG-AIR', quantity: 6, reserved_qty: 2, shipped_qty: 0, status: 'active', created_at: '2026-10-30T09:51:00+03:00', due_at: '2026-11-02T17:00:00+03:00' },
      { order_id: 'SB-ORD-004', customer: 'Учебный клиент 04', sku: 'FG-PLUS', quantity: 4, reserved_qty: 2, shipped_qty: 0, status: 'active', created_at: '2026-10-30T10:08:00+03:00', due_at: '2026-11-02T17:00:00+03:00' },
      { order_id: 'SB-ORD-005', customer: 'Учебный клиент 05', sku: 'FG-AIR', quantity: 11, reserved_qty: 2, shipped_qty: 3, status: 'active', created_at: '2026-10-30T10:25:00+03:00', due_at: '2026-11-02T17:00:00+03:00' },
      { order_id: 'SB-ORD-006', customer: 'Учебный клиент 06', sku: 'FG-PLUS', quantity: 9, reserved_qty: 2, shipped_qty: 0, status: 'active', created_at: '2026-10-30T10:42:00+03:00', due_at: '2026-11-02T17:00:00+03:00' },
      { order_id: 'SB-ORD-007', customer: 'Учебный клиент 07', sku: 'FG-AIR', quantity: 7, reserved_qty: 2, shipped_qty: 0, status: 'active', created_at: '2026-10-30T10:59:00+03:00', due_at: '2026-11-02T17:00:00+03:00' },
      { order_id: 'SB-ORD-008', customer: 'Учебный клиент 08', sku: 'FG-PLUS', quantity: 5, reserved_qty: 2, shipped_qty: 0, status: 'active', created_at: '2026-10-30T11:16:00+03:00', due_at: '2026-11-03T17:00:00+03:00' },
    ];
    ext.incoming_shipments = [
      { shipment_id: 'SB-IN-AIR-01', supplier: 'Учебный партнёр', sku: 'FG-AIR', quantity: 12, expected_at: '2026-11-01T15:00:00+03:00', status: 'expected' },
      { shipment_id: 'SB-IN-AIR-02', supplier: 'Учебный партнёр', sku: 'FG-AIR', quantity: 20, expected_at: '2026-11-03T11:00:00+03:00', status: 'expected' },
      { shipment_id: 'SB-IN-PLUS-01', supplier: 'Учебный партнёр', sku: 'FG-PLUS', quantity: 6, expected_at: '2026-11-01T12:00:00+03:00', status: 'expected' },
      { shipment_id: 'SB-IN-PLUS-02', supplier: 'Учебный партнёр', sku: 'FG-PLUS', quantity: 10, expected_at: '2026-11-03T14:00:00+03:00', status: 'expected' },
    ];
    applyFixtureData(ext);
  } else {
    applyFixtureData(cache03 || SIMPLE_FALLBACK);
  }
  applyProdData(cache05 || PROD_FALLBACK);
  return buildSnapshot();
}

export function mockHealth() { return { ok: true, now: nowStr, fixture: fixtureName }; }
export function mockOrders(status = 'active') {
  const snap = buildSnapshot();
  if (status === 'active') return snap.orders_active;
  if (status === 'all') {
    const byId = new Map(snap.orders_active.map((o: any) => [o.order_id, o]));
    return orders.map((o) => byId.get(o.order_id) || { ...o, remaining: o.quantity - o.shipped_qty, unreserved: o.quantity - o.shipped_qty - o.reserved_qty, readiness: null, atRisk: false, shortage: 0 });
  }
  return orders.filter((o) => o.status === status).map((o) => {
    const f = (snap.orders_active as any[]).find((x) => x.order_id === o.order_id);
    return f || { ...o, remaining: o.quantity - o.shipped_qty, unreserved: o.quantity - o.shipped_qty - o.reserved_qty, readiness: null, atRisk: false, shortage: 0 };
  });
}
export function mockShipments() { return shipments; }

function nextOrderId(): string {
  let mx = 0;
  for (const o of orders) {
    const m = /^ORD-(\d+)$/.exec(o.order_id);
    if (m) mx = Math.max(mx, parseInt(m[1], 10));
  }
  return `ORD-${String(mx + 1).padStart(3, '0')}`;
}

function mockErr(status: number, error: string, hint = '') {
  const e: any = new Error(error);
  e.status = status; e.hint = hint;
  throw e;
}

export function mockCreateOrder(body: { customer: string; sku: string; quantity: number; due_at: string }) {
  const skus = new Set(products.map((p) => p.sku));
  if (!skus.has(body.sku)) mockErr(400, `Товар ${body.sku} неизвестен`, 'Доступно: FG-AIR, FG-PLUS');
  if (!(body.quantity > 0)) mockErr(400, 'Количество должно быть > 0', 'Укажите quantity >= 1');
  const due = parseDt(body.due_at);
  if (isNaN(due.getTime())) mockErr(400, 'Некорректный due_at', 'Формат ISO8601 с +03:00');
  if (!(due > nowDt())) mockErr(400, `Срок ${body.due_at} должен быть позже now ${nowStr}`, 'Укажите будущую дату');
  const oid = nextOrderId();
  const o: Order = {
    order_id: oid, customer: body.customer, sku: body.sku, quantity: Number(body.quantity),
    reserved_qty: 0, shipped_qty: 0, status: 'active', created_at: nowStr, due_at: body.due_at,
  };
  orders.push(o);
  const snap = buildSnapshot();
  return (snap.orders_active as any[]).find((x) => x.order_id === oid);
}

export function mockCreateShipment(body: { supplier: string; sku: string; quantity: number; expected_at: string }) {
  const skus = new Set(products.map((p) => p.sku));
  if (!skus.has(body.sku)) mockErr(400, `Товар ${body.sku} неизвестен`, 'Доступно: FG-AIR, FG-PLUS');
  if (!(body.quantity > 0)) mockErr(400, 'Количество должно быть > 0', 'Укажите quantity >= 1');
  const exp = parseDt(body.expected_at);
  if (isNaN(exp.getTime())) mockErr(400, 'Некорректный expected_at', 'Формат ISO8601 с +03:00');
  if (!(exp > nowDt())) mockErr(400, `Дата ${body.expected_at} должна быть позже now ${nowStr}`, 'Укажите будущую дату');
  const prefix = body.sku === 'FG-AIR' ? 'IN-AIR-' : 'IN-PLUS-';
  let num = 0;
  for (const s of shipments) {
    const m = s.shipment_id.match(new RegExp('^' + prefix + '(\\d+)$'));
    if (m) num = Math.max(num, parseInt(m[1], 10));
  }
  const sid = prefix + String(num + 1).padStart(2, '0');
  const rec: Shipment = {
    shipment_id: sid, supplier: body.supplier || 'Новый поставщик', sku: body.sku,
    quantity: Number(body.quantity), expected_at: body.expected_at, status: 'expected',
  };
  shipments.push(rec);
  return rec;
}

export function mockReserve(orderId: string, qty: number) {
  const o = orders.find((x) => x.order_id === orderId);
  if (!o) mockErr(404, `Заказ ${orderId} не найден`, 'Проверьте ID');
  if (o!.status !== 'active') mockErr(400, `Заказ ${orderId} не активен (${o!.status})`, 'Резервировать можно только active');
  if (!(qty > 0)) mockErr(400, 'qty должен быть > 0', '');
  const stockMap: Record<string, number> = {};
  for (const s of stock) stockMap[s.sku] = s.on_hand;
  const reservedTotal = orders.filter((x) => x.status === 'active' && x.sku === o!.sku)
    .reduce((s, x) => s + x.reserved_qty, 0);
  const free = (stockMap[o!.sku] ?? 0) - reservedTotal;
  const unreserved = o!.quantity - o!.shipped_qty - o!.reserved_qty;
  if (qty > free) mockErr(400, `Недостаточно свободно ${o!.sku}: нужно ${qty}, свободно ${free}`, 'Дождитесь поставки или снимите чужой резерв');
  if (qty > unreserved) mockErr(400, `Заказ ${orderId}: можно зарезервировать не более ${unreserved}`, 'Уменьшите qty');
  o!.reserved_qty += qty;
  return { order: mockOrders('active').find((x: any) => x.order_id === orderId), snapshot: buildSnapshot() };
}

export function mockShip(orderId: string, qty: number) {
  const o = orders.find((x) => x.order_id === orderId);
  if (!o) mockErr(404, `Заказ ${orderId} не найден`, '');
  if (o!.status !== 'active') mockErr(400, `Заказ ${orderId} не активен (${o!.status}), повторная отгрузка запрещена`, 'Отгружать можно только active');
  if (!(qty > 0)) mockErr(400, 'qty должен быть > 0', '');
  const srow = stock.find((s) => s.sku === o!.sku);
  const onHand = srow ? srow.on_hand : 0;
  if (qty > o!.reserved_qty) mockErr(400, `Нельзя отгрузить ${qty}: зарезервировано только ${o!.reserved_qty}`, 'Сначала зарезервируйте');
  if (qty > onHand) mockErr(400, `Нельзя отгрузить ${qty}: на складе только ${onHand}`, 'Дождитесь поставки');
  o!.reserved_qty -= qty;
  o!.shipped_qty += qty;
  if (srow) srow.on_hand -= qty;
  if (o!.shipped_qty === o!.quantity) o!.status = 'shipped';
  return { order_id: orderId, status: o!.status, snapshot: buildSnapshot() };
}

export function mockReceive(shipmentId: string) {
  const s = shipments.find((x) => x.shipment_id === shipmentId);
  if (!s) mockErr(404, `Поставка ${shipmentId} не найдена`, '');
  if (s!.status === 'received') mockErr(400, `Поставка ${shipmentId} уже получена, повтор запрещён`, 'Остаток не изменён');
  if (s!.status !== 'expected') mockErr(400, `Поставка ${shipmentId} в статусе ${s!.status}`, '');
  s!.status = 'received';
  const row = stock.find((r) => r.sku === s!.sku);
  if (!row) stock.push({ sku: s!.sku, on_hand: s!.quantity });
  else row.on_hand += s!.quantity;
  return { shipment_id: shipmentId, status: 'received', snapshot: buildSnapshot() };
}

export function mockDelay(shipmentId: string, newExpectedAt: string) {
  const target = shipments.find((s) => s.shipment_id === shipmentId);
  if (!target) mockErr(404, `Поставка ${shipmentId} не найдена`, 'Проверьте shipment_id');
  if (target!.status !== 'expected') mockErr(400, `Поставка ${shipmentId} уже ${target!.status}, задержку считать нельзя`, 'Сценарий возможен только для expected-поставки');
  const now = nowDt();
  const stockMap: Record<string, number> = {};
  for (const s of stock) stockMap[s.sku] = s.on_hand;
  const beforeAlloc = allocate(orders, stockMap, shipments, now);
  const before = Object.values(beforeAlloc).map((v) => ({
    order_id: v.order_id, readiness: v.readiness ? v.readiness.toISOString() : null, atRisk: v.atRisk,
  }));
  const newShips = shipments.map((s) => s.shipment_id === shipmentId ? { ...s, expected_at: newExpectedAt } : s);
  const afterAlloc = allocate(orders, stockMap, newShips, now);
  const after = Object.values(afterAlloc).map((v) => ({
    order_id: v.order_id, readiness: v.readiness ? v.readiness.toISOString() : null, atRisk: v.atRisk,
  }));
  const beforeMap = new Map(before.map((b) => [b.order_id, b]));
  const threatened: string[] = [];
  for (const a of after) {
    const b = beforeMap.get(a.order_id);
    if (b && b.readiness !== a.readiness) threatened.push(a.order_id);
  }
  threatened.sort();
  return {
    shipment: { ...target, new_expected_at: newExpectedAt },
    before: before.sort((a, b) => a.order_id.localeCompare(b.order_id)),
    after: after.sort((a, b) => a.order_id.localeCompare(b.order_id)),
    threatened,
    explanation: threatened.length
      ? `Задержка ${shipmentId} до ${newExpectedAt} сдвигает готовность: ${threatened.join(', ')}. База не изменена.`
      : `Задержка ${shipmentId} до ${newExpectedAt} никого не затрагивает. База не изменена.`,
  };
}

// ---- Производство ----
function compMap(): Record<string, number> {
  const m: Record<string, number> = {};
  for (const c of compStockFull) m[c.sku] = c.on_hand;
  return m;
}

export function mockProdStatus() {
  return {
    component_stock: compStockFull, incoming: compIncoming, bom,
    resources, working_hours: workingHours, operation_minutes: operationMinutes, active_batch: activeBatch,
  };
}

export function planProduction(finishedSku: string, batchQty: number, startFrom?: string) {
  if (!bom[finishedSku]) mockErr(404, `Товар ${finishedSku} неизвестен`, '');
  if (!(batchQty > 0)) mockErr(400, 'batch_qty должен быть > 0', '');
  const start = startFrom ? parseDt(startFrom) : nowDt();
  const needMap: Record<string, number> = {};
  for (const [c, per] of Object.entries(bom[finishedSku])) needMap[c] = (per as number) * batchQty;
  const have = compMap();
  const shortage = Object.entries(needMap)
    .filter(([c, need]) => need > (have[c] ?? 0))
    .map(([c, need]) => ({ sku: c, need, have: have[c] ?? 0, deficit: need - (have[c] ?? 0) }));
  const wsParts = workingHours.start.split(':').map(Number);
  const weParts = workingHours.end.split(':').map(Number);
  const wdays = new Set(workingHours.working_days);
  const dayStrMsk = (dt: Date) => {
    const msk = new Date(dt.getTime() + 3 * 3600 * 1000);
    return msk.toISOString().slice(0, 10);
  };
  const atTime = (dt: Date, h: number, m: number) => {
    const d = new Date(dt);
    d.setHours(h, m, 0, 0);
    return d;
  };
  function align(dt: Date, durMin: number): Date | null {
    let cur = new Date(dt);
    for (let k = 0; k < 60; k++) {
      const d = dayStrMsk(cur);
      if (!wdays.has(d)) {
        const nxt = [...wdays].sort().find((w) => w > d);
        if (!nxt) return null;
        const [y, m, dd] = nxt.split('-').map(Number);
        cur = new Date(cur);
        cur.setFullYear(y, m - 1, dd); cur.setHours(wsParts[0], wsParts[1], 0, 0);
        continue;
      }
      const tMin = cur.getHours() * 60 + cur.getMinutes();
      const wsMin = wsParts[0] * 60 + wsParts[1];
      const weMin = weParts[0] * 60 + weParts[1];
      if (tMin < wsMin) { cur = atTime(cur, wsParts[0], wsParts[1]); }
      const end = new Date(cur.getTime() + durMin * 60000);
      const endMin = end.getHours() * 60 + end.getMinutes();
      if (dayStrMsk(end) !== dayStrMsk(cur) || endMin > weMin) {
        const nxt = [...wdays].sort().find((w) => w > d);
        if (!nxt) return null;
        const [y, m, dd] = nxt.split('-').map(Number);
        cur = new Date(cur);
        cur.setFullYear(y, m - 1, dd); cur.setHours(wsParts[0], wsParts[1], 0, 0);
        continue;
      }
      return cur;
    }
    return null;
  }
  const op = operationMinutes[finishedSku] || { assembly: 20, test: 10 };
  if (shortage.length > 0) {
    const parts = shortage.map((sh) => {
      const inc = compIncoming.filter((c) => c.sku === sh.sku && c.status === 'expected')
        .sort((a, b) => parseDt(a.expected_at).getTime() - parseDt(b.expected_at).getTime());
      if (inc.length) return `${sh.sku}: есть ${sh.have}, нужно ${sh.need}, не хватает ${sh.deficit}; ближайшее пополнение +${inc[0].quantity} только ${inc[0].expected_at} (${inc[0].shipment_id})`;
      return `${sh.sku}: есть ${sh.have}, нужно ${sh.need}, не хватает ${sh.deficit}; пополнений нет`;
    });
    return {
      feasible: false, shortage, timeline: [], batch_ready_at: null, out_of_horizon: false,
      explanation: `Партия ${batchQty} x ${finishedSku} невозможна. ` + parts.join('; '),
    };
  }
  let asmFree = new Date(start), tstFree = new Date(start);
  const timeline: any[] = [];
  for (let i = 1; i <= batchQty; i++) {
    const aStart = align(asmFree, op.assembly);
    if (!aStart) return { feasible: true, shortage: [], timeline, batch_ready_at: null, out_of_horizon: true, explanation: `Выход за горизонт планирования (02-06.11): операция ${i} не влезает до 17:00 06.11.` };
    const aEnd = new Date(aStart.getTime() + op.assembly * 60000);
    asmFree = aEnd;
    const tEarliest = aEnd > tstFree ? aEnd : tstFree;
    const tStart = align(tEarliest, op.test);
    if (!tStart) return { feasible: true, shortage: [], timeline, batch_ready_at: null, out_of_horizon: true, explanation: 'Выход за горизонт планирования (02-06.11): тест не влезает до 17:00 06.11.' };
    const tEnd = new Date(tStart.getTime() + op.test * 60000);
    tstFree = tEnd;
    timeline.push({ unit: i, assembly_start: aStart.toISOString(), assembly_end: aEnd.toISOString(), test_start: tStart.toISOString(), test_end: tEnd.toISOString() });
  }
  return {
    feasible: true, shortage: [], timeline, batch_ready_at: tstFree.toISOString(), out_of_horizon: false,
    explanation: `Партия ${batchQty} x ${finishedSku} выполнима, готовность ${tstFree.toISOString()}.`,
  };
}

export function mockProdStart(finishedSku: string, batchQty: number) {
  if (activeBatch) mockErr(409, 'Уже есть активная партия, второй запуск запрещён', 'Дождитесь завершения или reset');
  const plan: any = planProduction(finishedSku, batchQty);
  if (!plan.feasible) mockErr(400, `Невозможно запустить: ${plan.explanation}`, 'Проверьте shortage');
  if (plan.out_of_horizon) mockErr(400, 'Партия выходит за горизонт 02-06.11', '');
  const need: Record<string, number> = {};
  for (const [c, per] of Object.entries(bom[finishedSku])) need[c] = (per as number) * batchQty;
  for (const [c, q] of Object.entries(need)) {
    const row = compStockFull.find((r) => r.sku === c);
    if (!row || row.on_hand < q) mockErr(400, `Не хватает ${c}: нужно ${q}, есть ${row ? row.on_hand : 0}`, '');
  }
  for (const [c, q] of Object.entries(need)) {
    const row = compStockFull.find((r) => r.sku === c)!;
    row.on_hand -= q;
  }
  activeBatch = { finished_sku: finishedSku, batch_qty: batchQty, started_at: nowStr, batch_ready_at: plan.batch_ready_at, timeline: plan.timeline };
  return { ...plan, started: true };
}

// ---- ИИ-мок ----
export function mockAiAsk(question: string, scenario?: { shipment_id: string; new_expected_at: string }, _persona: 'analyst' | 'consultant' = 'analyst', _history: { role: string; content: string }[] = []) {
  const snap: any = buildSnapshot();
  const facts = {
    snapshot_summary: `now=${snap.now}; ` + snap.stock.map((s: any) => `${s.sku}: on_hand=${s.on_hand}, reserved=${s.reserved}, free=${s.free}`).join('; '),
    readiness_table: snap.orders_active.map((o: any) => ({ order_id: o.order_id, sku: o.sku, need_total: o.quantity, reserved: o.reserved_qty, readiness: o.readiness, atRisk: o.atRisk, shortage: o.shortage, due_at: o.due_at })),
    shipments: shipments,
    scenario_diff: scenario ? mockDelaySafe(scenario.shipment_id, scenario.new_expected_at) : null,
  };
  const answer = ruleBased(question, snap, facts);
  return { answer, facts_used: facts, via: 'rules' };
}

function mockDelaySafe(id: string, dt: string) {
  try { return mockDelay(id, dt); }
  catch (e: any) { return { error: e.message, threatened: [], before: [], after: [] }; }
}

function ruleBased(question: string, snapshot: any, facts: any): string {
  const q = question.toLowerCase();
  const stockMap: Record<string, any> = {};
  for (const s of snapshot.stock) stockMap[s.sku] = s;
  const ordersMap: Record<string, any> = {};
  for (const o of snapshot.orders_active) ordersMap[o.order_id] = o;
  const known = new Set<string>(shipments.map((s) => s.shipment_id));
  const mTok = question.toUpperCase().match(/(IN-[A-Z0-9\-]+|SB-IN-[A-Z0-9\-]+)/g);
  if (mTok) {
    for (const tok of mTok) {
      if (!known.has(tok) && (q.includes('когда') || q.includes('прид') || q.includes(tok.toLowerCase()))) {
        return `${tok}: такой записи нет. В facts есть только: ${[...known].sort().join(', ') || '—'}.`;
      }
    }
  }
  if (facts.scenario_diff && facts.scenario_diff.threatened) {
    if (q.includes('задерж') || q.includes('сдви') || q.includes('перенос') || q.includes('что будет')) {
      const th = facts.scenario_diff.threatened;
      if (th.length) return `При задержке пострадают: ${th.join(', ')}. Готовность сдвигается по новым датам партий. Остальные без изменений. База не тронута.`;
      return 'При задержке никто не пострадает. База не тронута.';
    }
  }
  // задержка без scenario в вопросе
  if (q.includes('задерж') && q.includes('in-air-01')) {
    try {
      const d: any = mockDelay('IN-AIR-01', '2026-11-05T10:00:00+03:00');
      if (d.threatened.length) return `При задержке IN-AIR-01 до 05.11 пострадают: ${d.threatened.join(', ')}. Готовность сдвигается на 05.11 10:00, риск опоздания; остальные без изменений; база не тронута.`;
    } catch { /* pass */ }
  }
  const mOrd = question.toUpperCase().match(/(ORD-\d+|SB-ORD-\d+)/);
  if (mOrd) {
    const oid = mOrd[1].toUpperCase();
    const found = ordersMap[oid] || ordersMap[Object.keys(ordersMap).find((k) => k.toUpperCase() === oid) || ''];
    if (!found) return `${oid}: такой записи нет среди активных заказов.`;
    const st = stockMap[found.sku] || {};
    return `${oid} (${found.sku}): нужно ${found.quantity}, зарезервировано ${found.reserved_qty}, отгружено ${found.shipped_qty}. Осталось ${found.remaining}, не зарезервировано ${found.unreserved}. Свободно на складе ${st.free ?? '?'} (всего ${st.on_hand ?? '?'}, удержано ${st.reserved ?? '?'}). Готовность ${found.readiness || 'неизвестна (нехватка ' + found.shortage + ')'}, срок ${found.due_at}, риск ${found.atRisk ? 'да' : 'нет'}.`;
  }
  if (['свободно', 'складе', 'можно отдать', 'можно ли', 'отдать', 'plus', 'air', 'плюс', 'аир', 'датчик', 'базов'].some((w) => q.includes(w))) {
    const plus = stockMap['FG-PLUS'], air = stockMap['FG-AIR'];
    if (q.includes('5') && (q.includes('plus') || q.includes('плюс'))) {
      if (plus && plus.free === 3) return 'Нет: на складе 8 air plus, но свободно только 3, 5 удержаны для ORD-002. Отдать 5 новому клиенту нельзя без снятия резерва.';
    }
    const parts: string[] = [];
    if (plus) parts.push(`air plus: всего ${plus.on_hand}, свободно ${plus.free}, удержано ${plus.reserved}`);
    if (air) parts.push(`air: всего ${air.on_hand}, свободно ${air.free}, удержано ${air.reserved}`);
    return 'Склад: ' + parts.join('; ') + '.';
  }
  if (q.includes('in-unknown') || q.includes('unknown')) return `IN-UNKNOWN: такой записи нет. В facts есть только: ${[...known].sort().join(', ')}.`;
  const kpi = snapshot.kpi || {};
  return `Активных заказов ${kpi.active_orders}, с возможным риском ${kpi.at_risk}, с нехваткой ${kpi.shortage_orders}. ` +
    snapshot.stock.map((s: any) => `${s.sku}: свободно ${s.free} из ${s.on_hand}`).join('; ') + '.';
}

export function mockFixtureName() { return fixtureName; }
export { isoOut };
