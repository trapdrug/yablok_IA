import { describe, expect, it } from 'vitest';
import { simulateDelay } from '../src/domain/delaySimulation';
import { DomainError, NotFoundError } from '../src/domain/invariants';
import { makeState } from './helpers';

function stateWithShipment() {
  return makeState({
    stock: { AIR: { physical: 5, reserved: 0 }, AIR_PLUS: { physical: 0, reserved: 0 } },
    orders: [
      { id: 'ORD-001', client: 'A', sku: 'AIR', qty: 3, createdAt: '2026-10-10', shipBy: '2026-10-15', status: 'NEW', priority: 'NORMAL' },
      { id: 'ORD-002', client: 'B', sku: 'AIR', qty: 4, createdAt: '2026-10-10', shipBy: '2026-10-16', status: 'NEW', priority: 'NORMAL' },
    ],
    shipments: [
      { id: 'SHP-001', sku: 'AIR', qty: 2, expectedDate: '2026-10-15', status: 'PLANNED' },
    ],
  });
}

describe('simulateDelay', () => {
  it('не изменяет исходное состояние (снапшот до/после)', () => {
    const s = stateWithShipment();
    const before = JSON.stringify(s);
    simulateDelay(s, 'SHP-001', 3, '2026-10-10');
    expect(JSON.stringify(s)).toBe(before);
  });
  it('сообщает о заказах под риском с дефицитом и причиной', () => {
    const report = simulateDelay(stateWithShipment(), 'SHP-001', 3, '2026-10-10');
    // SHP-001 → 2026-10-18: ORD-002 availableBy = 5 < 7 → риск
    const atRisk = report.atRisk.find((r) => r.orderId === 'ORD-002');
    expect(atRisk).toBeDefined();
    expect(atRisk!.deficit).toBe(2);
    expect(atRisk!.reason).toBeTruthy();
    expect(report.newlyAtRisk.map((r) => r.orderId)).toContain('ORD-002');
  });
  it('days=0 → новых рисков нет', () => {
    const report = simulateDelay(stateWithShipment(), 'SHP-001', 0, '2026-10-10');
    expect(report.newlyAtRisk).toHaveLength(0);
  });
  it('бросает NotFoundError для неизвестной поставки', () => {
    expect(() => simulateDelay(makeState(), 'SHP-999', 1, '2026-10-10')).toThrow(
      NotFoundError,
    );
  });
  it('отклоняет отрицательные дни', () => {
    expect(() => simulateDelay(stateWithShipment(), 'SHP-001', -1, '2026-10-10')).toThrow(
      DomainError,
    );
  });
  it('отклоняет уже полученную поставку', () => {
    const s = makeState({
      shipments: [
        { id: 'SHP-001', sku: 'AIR', qty: 2, expectedDate: '2026-10-15', status: 'RECEIVED' },
      ],
    });
    expect(() => simulateDelay(s, 'SHP-001', 1, '2026-10-10')).toThrow(DomainError);
  });
});