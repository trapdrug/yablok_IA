import { describe, expect, it } from 'vitest';
import { receiveShipment } from '../src/domain/shipments';
import { DomainError, NotFoundError } from '../src/domain/invariants';
import { makeState } from './helpers';

const withShipment = (status: 'PLANNED' | 'RECEIVED' = 'PLANNED') =>
  makeState({
    shipments: [
      { id: 'SHP-001', sku: 'AIR', qty: 15, expectedDate: '2026-10-20', status },
    ],
  });

describe('receiveShipment', () => {
  it('увеличивает physical и помечает RECEIVED', () => {
    const next = receiveShipment(withShipment(), 'SHP-001');
    expect(next.stock.AIR.physical).toBe(45);
    expect(next.shipments[0].status).toBe('RECEIVED');
  });
  it('отклоняет повторный приём', () => {
    const s2 = receiveShipment(withShipment(), 'SHP-001');
    expect(() => receiveShipment(s2, 'SHP-001')).toThrow(DomainError);
  });
  it('бросает NotFoundError для неизвестного id', () => {
    expect(() => receiveShipment(makeState(), 'SHP-999')).toThrow(NotFoundError);
  });
});