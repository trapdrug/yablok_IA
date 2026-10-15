export interface StockItem {
  physical: number;
  reserved: number;
}

export interface Order {
  id: string;
  client: string;
  sku: string;
  qty: number;
  createdAt: string;
  shipBy: string;
  status: string;
  priority: string;
}

export interface Shipment {
  id: string;
  sku: string;
  qty: number;
  expectedDate: string;
  status: string;
}

export interface OrderRisk {
  orderId: string;
  sku: string;
  qty: number;
  shipBy: string;
  deficit: number;
  reason: string;
}

export interface StateResponse {
  state: {
    stock: Record<string, StockItem>;
    components: Record<string, number>;
    orders: Order[];
    shipments: Shipment[];
  };
  shortage: Record<string, number>;
  risk: OrderRisk[];
}

export interface DelayReport {
  shipmentId: string;
  days: number;
  atRisk: OrderRisk[];
  newlyAtRisk: OrderRisk[];
}

export interface ProductionResult {
  possible: boolean;
  requiredUnits: number;
  daysNeeded: number;
  readyDate?: string;
  reason?: string;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { 'content-type': 'application/json' },
    ...init,
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error ?? `HTTP ${res.status}`);
  }
  return data as T;
}

export const api = {
  getState: () => request<StateResponse>('/api/state'),
  createOrder: (body: object) =>
    request<Order>('/api/orders', { method: 'POST', body: JSON.stringify(body) }),
  reserve: (id: string) =>
    request<Order>(`/api/orders/${id}/reserve`, { method: 'POST' }),
  ship: (id: string) => request<Order>(`/api/orders/${id}/ship`, { method: 'POST' }),
  receive: (id: string) =>
    request<Shipment>(`/api/shipments/${id}/receive`, { method: 'POST' }),
  simulateDelay: (shipmentId: string, days: number) =>
    request<DelayReport>('/api/simulate/delay', {
      method: 'POST',
      body: JSON.stringify({ shipmentId, days }),
    }),
  ask: (question: string) =>
    request<{ answer: string; provider: string }>('/api/ai/ask', {
      method: 'POST',
      body: JSON.stringify({ question }),
    }),
  productionCheck: (body: object) =>
    request<ProductionResult>('/api/production/check', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
};