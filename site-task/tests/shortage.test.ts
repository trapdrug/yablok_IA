import { describe, expect, it } from 'vitest';
import { computeRisk, computeShortage } from '../src/domain/shortage';
import { makeState } from './helpers';

describe('computeShortage', () => {
  it('shortage = max(0, NEW-спрос - free); RESERVED не учитывается', () => {
    const s = makeState({
      stock: { AIR: { physical: 10, reserved: 4 }, AIR_PLUS: { physical: 10, reserved: 0 } },
      orders: [
        { id: 'ORD-001', client: 'A', sku: 'AIR', qty: 5, createdAt: '2026-10-10', shipBy: '2026-10-20', status: 'NEW', priority: 'NORMAL' },
        { id: 'ORD-002', client: 'B', sku: 'AIR', qty: 6, createdAt: '2026-10-10', shipBy: '2026-10-20', status: 'NEW', priority: 'NORMAL' },
        { id: 'ORD-003', client: 'C', sku: 'AIR', qty: 10, createdAt: '2026-10-10', shipBy: '2026-10-20', status: 'RESERVED', priority: 'NORMAL' },
      ],
    });
    // free AIR = 6, NEW-спрос = 11 → shortage 5
    expect(computeShortage(s)).toEqual({ AIR: 5, AIR_PLUS: 0 });
  });
});

describe('computeRisk', () => {
  it('помечает заказ, если free + поставки до shipBy не хватает', () => {
    const s = makeState({
      stock: { AIR: { physical: 5, reserved: 0 }, AIR_PLUS: { physical: 0, reserved: 0 } },
      orders: [
        { id: 'ORD-001', client: 'A', sku: 'AIR', qty: 3, createdAt: '2026-10-10', shipBy: '2026-10-15', status: 'NEW', priority: 'NORMAL' },
        { id: 'ORD-002', client: 'B', sku: 'AIR', qty: 4, createdAt: '2026-10-10', shipBy: '2026-10-16', status: 'NEW', priority: 'NORMAL' },
      ],
      shipments: [
        { id: 'SHP-001', sku: 'AIR', qty: 2, expectedDate: '2026-10-17', status: 'PLANNED' },
      ],
    });
    const risk = computeRisk(s, '2026-10-10');
    // ORD-001: availableBy = 5 >= 3 → ок; ORD-002: 5 < 7 → риск, дефицит 2
    expect(risk).toHaveLength(1);
    expect(risk[0].orderId).toBe('ORD-002');
    expect(risk[0].deficit).toBe(2);
  });
  it('риск исчезает, если поставка приходит вовремя', () => {
    const s = makeState({
      stock: { AIR: { physical: 5, reserved: 0 }, AIR_PLUS: { physical: 0, reserved: 0 } },
      orders: [
        { id: 'ORD-001', client: 'A', sku: 'AIR', qty: 3, createdAt: '2026-10-10', shipBy: '2026-10-15', status: 'NEW', priority: 'NORMAL' },
        { id: 'ORD-002', client: 'B', sku: 'AIR', qty: 4, createdAt: '2026-10-10', shipBy: '2026-10-16', status: 'NEW', priority: 'NORMAL' },
      ],
      shipments: [
        { id: 'SHP-001', sku: 'AIR', qty: 2, expectedDate: '2026-10-15', status: 'PLANNED' },
      ],
    });
    // ORD-002: availableBy = 5 + 2 = 7 >= 7 → риска нет
    expect(computeRisk(s, '2026-10-10')).toHaveLength(0);
  });
  it('не учитывает RESERVED-заказы повторно', () => {
    const s = makeState({
      stock: { AIR: { physical: 10, reserved: 5 }, AIR_PLUS: { physical: 0, reserved: 0 } },
      orders: [
        { id: 'ORD-001', client: 'A', sku: 'AIR', qty: 5, createdAt: '2026-10-10', shipBy: '2026-10-15', status: 'RESERVED', priority: 'NORMAL' },
        { id: 'ORD-002', client: 'B', sku: 'AIR', qty: 4, createdAt: '2026-10-10', shipBy: '2026-10-16', status: 'NEW', priority: 'NORMAL' },
      ],
    });
    // free = 5 >= 4 → риска нет
    expect(computeRisk(s, '2026-10-10')).toHaveLength(0);
  });
});