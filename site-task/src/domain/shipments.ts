import { State } from '../shared/types';
import { DomainError, NotFoundError, assertInvariants } from './invariants';
import { cloneState } from './state';

/**
 * Подтверждение получения поставки (PLANNED -> RECEIVED).
 * Увеличивает physical остаток по SKU.
 */
export function receiveShipment(state: State, shipmentId: string): State {
  const next = cloneState(state);
  const shipment = next.shipments.find((s) => s.id === shipmentId);
  if (!shipment) {
    throw new NotFoundError(`shipment ${shipmentId} not found`);
  }
  if (shipment.status !== 'PLANNED') {
    throw new DomainError(`shipment ${shipmentId} already received`);
  }
  next.stock[shipment.sku].physical += shipment.qty;
  shipment.status = 'RECEIVED';
  assertInvariants(next);
  return next;
}