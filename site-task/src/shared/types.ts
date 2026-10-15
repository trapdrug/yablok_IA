export type Sku = 'AIR' | 'AIR_PLUS';
export const SKUS: Sku[] = ['AIR', 'AIR_PLUS'];

export type Priority = 'LOW' | 'NORMAL' | 'HIGH';
export const PRIORITIES: Priority[] = ['LOW', 'NORMAL', 'HIGH'];

export type OrderStatus = 'NEW' | 'RESERVED' | 'SHIPPED';
export type ShipmentStatus = 'PLANNED' | 'RECEIVED';

/**
 * Физический остаток включает зарезервированные единицы.
 * Свободный остаток НЕ хранится — вычисляется функцией free(state, sku).
 */
export interface StockItem {
  physical: number;
  reserved: number;
}

export interface Order {
  id: string;
  client: string;
  sku: Sku;
  qty: number;
  createdAt: string; // ISO date YYYY-MM-DD
  shipBy: string; // ISO date YYYY-MM-DD
  status: OrderStatus;
  priority: Priority;
}

export interface Shipment {
  id: string;
  sku: Sku;
  qty: number;
  expectedDate: string; // ISO date YYYY-MM-DD
  status: ShipmentStatus;
}

export interface State {
  stock: Record<Sku, StockItem>;
  components: Record<string, number>;
  orders: Order[];
  shipments: Shipment[];
  orderSeq: number;
  shipmentSeq: number;
}