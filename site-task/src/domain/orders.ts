import { Order, Priority, SKUS, Sku, State } from '../shared/types';
import { DomainError, NotFoundError, assertInvariants } from './invariants';
import { cloneState, free } from './state';

export interface CreateOrderInput {
  client: string;
  sku: Sku;
  qty: number;
  createdAt: string;
  shipBy: string;
  priority?: Priority;
}

/** Создание заказа (статус NEW). Возвращает новое состояние. */
export function createOrder(state: State, input: CreateOrderInput): State {
  const next = cloneState(state);
  if (!input.client || input.client.trim().length === 0) {
    throw new DomainError('client is required');
  }
  if (!SKUS.includes(input.sku)) {
    throw new DomainError(`unknown sku: ${String(input.sku)}`);
  }
  if (!Number.isInteger(input.qty) || input.qty <= 0) {
    throw new DomainError('qty must be a positive integer');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.createdAt) || !/^\d{4}-\d{2}-\d{2}$/.test(input.shipBy)) {
    throw new DomainError('dates must be ISO YYYY-MM-DD');
  }
  if (input.shipBy < input.createdAt) {
    throw new DomainError('shipBy must be >= createdAt');
  }
  const order: Order = {
    id: `ORD-${String(next.orderSeq).padStart(3, '0')}`,
    client: input.client.trim(),
    sku: input.sku,
    qty: input.qty,
    createdAt: input.createdAt,
    shipBy: input.shipBy,
    status: 'NEW',
    priority: input.priority ?? 'NORMAL',
  };
  next.orderSeq += 1;
  next.orders.push(order);
  assertInvariants(next);
  return next;
}

/**
 * Резервирование товара под заказ NEW.
 * Нельзя зарезервировать больше свободного остатка;
 * одна единица не может быть обещана нескольким заказам.
 */
export function reserveOrder(state: State, orderId: string): State {
  const next = cloneState(state);
  const order = next.orders.find((o) => o.id === orderId);
  if (!order) {
    throw new NotFoundError(`order ${orderId} not found`);
  }
  if (order.status !== 'NEW') {
    throw new DomainError(`order ${orderId} has status ${order.status}, cannot reserve`);
  }
  const available = free(next, order.sku);
  if (available < order.qty) {
    throw new DomainError(
      `insufficient free stock for ${order.id}: need ${order.qty}, free ${available}`,
    );
  }
  next.stock[order.sku].reserved += order.qty;
  order.status = 'RESERVED';
  assertInvariants(next);
  return next;
}

/** Подтверждение отгрузки по заказу RESERVED. */
export function shipOrder(state: State, orderId: string): State {
  const next = cloneState(state);
  const order = next.orders.find((o) => o.id === orderId);
  if (!order) {
    throw new NotFoundError(`order ${orderId} not found`);
  }
  if (order.status !== 'RESERVED') {
    throw new DomainError(`order ${orderId} has status ${order.status}, cannot ship`);
  }
  next.stock[order.sku].physical -= order.qty;
  next.stock[order.sku].reserved -= order.qty;
  order.status = 'SHIPPED';
  assertInvariants(next);
  return next;
}