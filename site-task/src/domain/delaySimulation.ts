import { State } from '../shared/types';
import { DomainError, NotFoundError } from './invariants';
import { addDays, cloneState, todayISO } from './state';
import { OrderRisk, computeRisk } from './shortage';

export interface DelayReport {
  shipmentId: string;
  days: number;
  /** Все заказы в зоне риска после задержки. */
  atRisk: OrderRisk[];
  /** Заказы, попавшие в зону риска именно из-за этой задержки. */
  newlyAtRisk: OrderRisk[];
}

/**
 * Симуляция «что если поставка задержится на N дней».
 * READ-ONLY: работает на глубокой копии, исходное состояние не меняется.
 */
export function simulateDelay(
  state: State,
  shipmentId: string,
  days: number,
  today: string = todayISO(),
): DelayReport {
  if (!Number.isInteger(days) || days < 0) {
    throw new DomainError('days must be a non-negative integer');
  }
  const shipment = state.shipments.find((s) => s.id === shipmentId);
  if (!shipment) {
    throw new NotFoundError(`shipment ${shipmentId} not found`);
  }
  if (shipment.status !== 'PLANNED') {
    throw new DomainError(`shipment ${shipmentId} already received, cannot delay`);
  }

  const before = computeRisk(state, today);
  const next = cloneState(state);
  const simShipment = next.shipments.find((s) => s.id === shipmentId);
  if (!simShipment) {
    throw new NotFoundError(`shipment ${shipmentId} not found`);
  }
  simShipment.expectedDate = addDays(simShipment.expectedDate, days);
  const after = computeRisk(next, today);
  const beforeIds = new Set(before.map((r) => r.orderId));

  return {
    shipmentId,
    days,
    atRisk: after,
    newlyAtRisk: after.filter((r) => !beforeIds.has(r.orderId)),
  };
}