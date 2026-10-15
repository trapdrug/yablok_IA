// fetch-обёртка к VITE_API_URL + автоматический fallback на mock.ts
import * as mock from './mock';

const BASE = (import.meta.env.VITE_API_URL as string) || 'http://localhost:8000';

let mockMode = false;
const listeners = new Set<(v: boolean) => void>();
export function isMockMode() { return mockMode; }
export function onMockMode(cb: (v: boolean) => void) {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}
function setMock(v: boolean) {
  if (mockMode !== v) { mockMode = v; listeners.forEach((cb) => cb(v)); }
}

async function req(path: string, init?: RequestInit, timeoutMs = 4000): Promise<any> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(`${BASE}${path}`, {
      ...init,
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    });
    const text = await r.text();
    let data: any = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!r.ok) {
      const err: any = new Error(data?.error || `HTTP ${r.status}`);
      err.status = r.status;
      err.hint = data?.hint || '';
      err.data = data;
      throw err;
    }
    setMock(false);
    return data;
  } finally {
    clearTimeout(t);
  }
}

function mockError(e: any): never {
  const err: any = new Error(e.message || 'Ошибка демо-данных');
  err.status = e.status || 400;
  err.hint = e.hint || '';
  throw err;
}

// Гарантируем загрузку мока заранее (для fallback)
let mockReady = mock.ensureMockLoaded();

export async function health() {
  try { return await req('/api/health'); }
  catch {
    await mockReady;
    setMock(true);
    return mock.mockHealth();
  }
}

export async function snapshot() {
  try { return await req('/api/snapshot'); }
  catch { await mockReady; setMock(true); return mock.buildSnapshot(); }
}

export async function orders(status = 'active') {
  try { return await req(`/api/orders?status=${encodeURIComponent(status)}`); }
  catch { await mockReady; setMock(true); return mock.mockOrders(status); }
}

export async function shipments() {
  try { return await req('/api/shipments'); }
  catch { await mockReady; setMock(true); return mock.mockShipments(); }
}

export async function createOrder(body: { customer: string; sku: string; quantity: number; due_at: string }) {
  try { return await req('/api/orders', { method: 'POST', body: JSON.stringify(body) }); }
  catch (e: any) {
    if (e?.status && e.status !== 0 && !isNetwork(e)) throw e;
    await mockReady; setMock(true);
    try { return mock.mockCreateOrder(body); } catch (m: any) { mockError(m); }
  }
}

function isNetwork(e: any) {
  return e?.name === 'AbortError' || e?.name === 'TypeError' || e?.status === undefined || String(e?.message || '').includes('fetch') || String(e?.message || '').includes('Failed');
}

export async function reserve(orderId: string, qty: number) {
  try { return await req(`/api/orders/${encodeURIComponent(orderId)}/reserve`, { method: 'POST', body: JSON.stringify({ qty }) }); }
  catch (e: any) {
    if (e?.status && e.status >= 400 && e.status < 500 && !mockMode) {
      // пробуем понять: это реальный 400 бэкенда или сеть? сеть не имеет status.
      throw e;
    }
    if (e?.status && !isNetwork(e) && !mockModeFallbackNeeded()) throw e;
    await mockReady; setMock(true);
    try { return mock.mockReserve(orderId, qty); } catch (m: any) { mockError(m); }
  }
}

function mockModeFallbackNeeded() {
  // если BASE недоступен — req бросит TypeError без status; тогда идём в мок
  return true;
}

export async function ship(orderId: string, qty: number) {
  try { return await req(`/api/orders/${encodeURIComponent(orderId)}/ship`, { method: 'POST', body: JSON.stringify({ qty }) }); }
  catch (e: any) {
    if (e?.status >= 400 && e?.status < 500 && !mockMode && e?.hint !== undefined && String(e?.message || '').length > 0 && !isNetwork(e)) {
      // реальный ответ API с ошибкой валидации — пробрасываем
      if (e.status) throw e;
    }
    await mockReady; setMock(true);
    try { return mock.mockShip(orderId, qty); } catch (m: any) { mockError(m); }
  }
}

export async function receive(shipmentId: string) {
  try { return await req(`/api/shipments/${encodeURIComponent(shipmentId)}/receive`, { method: 'POST' }); }
  catch (e: any) {
    if (e?.status >= 400 && e?.status < 500 && !isNetwork(e) && !mockMode) throw e;
    await mockReady; setMock(true);
    try { return mock.mockReceive(shipmentId); } catch (m: any) { mockError(m); }
  }
}

export async function createShipment(body: { supplier: string; sku: string; quantity: number; expected_at: string }) {
  try { return await req('/api/shipments', { method: 'POST', body: JSON.stringify(body) }); }
  catch (e: any) {
    if (e?.status >= 400 && e?.status < 500 && !isNetwork(e) && !mockMode) throw e;
    await mockReady; setMock(true);
    try { return mock.mockCreateShipment(body); } catch (m: any) { mockError(m); }
  }
}

export async function delayScenario(shipment_id: string, new_expected_at: string) {
  try { return await req('/api/scenarios/delay', { method: 'POST', body: JSON.stringify({ shipment_id, new_expected_at }) }); }
  catch (e: any) {
    if (e?.status >= 400 && e?.status < 500 && !isNetwork(e) && !mockMode) throw e;
    await mockReady; setMock(true);
    try { return mock.mockDelay(shipment_id, new_expected_at); } catch (m: any) { mockError(m); }
  }
}

export async function prodStatus() {
  try { return await req('/api/production/status'); }
  catch { await mockReady; setMock(true); return mock.mockProdStatus(); }
}

export async function prodPlan(finished_sku: string, batch_qty: number, start_from?: string) {
  try { return await req('/api/production/plan', { method: 'POST', body: JSON.stringify({ finished_sku, batch_qty, start_from }) }); }
  catch (e: any) {
    if (e?.status >= 400 && e?.status < 500 && !isNetwork(e) && !mockMode) throw e;
    await mockReady; setMock(true);
    try { return mock.planProduction(finished_sku, batch_qty, start_from); } catch (m: any) { mockError(m); }
  }
}

export async function prodStart(finished_sku: string, batch_qty: number) {
  try { return await req('/api/production/start', { method: 'POST', body: JSON.stringify({ finished_sku, batch_qty }) }); }
  catch (e: any) {
    if ((e?.status === 400 || e?.status === 404 || e?.status === 409) && !isNetwork(e) && !mockMode) throw e;
    await mockReady; setMock(true);
    try { return mock.mockProdStart(finished_sku, batch_qty); } catch (m: any) { mockError(m); }
  }
}

export async function aiAsk(question: string, scenario?: { shipment_id: string; new_expected_at: string }, persona: 'analyst' | 'consultant' = 'analyst', history: { role: string; content: string }[] = []) {
  try { return await req('/api/ai/ask', { method: 'POST', body: JSON.stringify({ question, scenario: scenario ?? null, persona, history }) }, 90000); }
  catch (e: any) {
    if (e?.status >= 400 && e?.status < 500 && !isNetwork(e) && !mockMode) throw e;
    await mockReady; setMock(true);
    return mock.mockAiAsk(question, scenario, persona, history);
  }
}

export async function adminReset(fixture: 'simple' | 'extended') {
  try { return await req(`/api/admin/reset?fixture=${fixture}`, { method: 'POST' }); }
  catch {
    await mockReady; setMock(true);
    const snap = mock.mockReset(fixture);
    return { ok: true, fixture, snapshot: snap };
  }
}

export const API_BASE = BASE;
