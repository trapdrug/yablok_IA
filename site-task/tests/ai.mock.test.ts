import { describe, expect, it } from 'vitest';
import { buildSnapshot, mockAnalyze } from '../src/domain/ai';
import { makeState } from './helpers';

describe('mockAnalyze', () => {
  it('использует актуальные цифры из снимка', () => {
    const s = makeState({
      stock: { AIR: { physical: 30, reserved: 4 }, AIR_PLUS: { physical: 10, reserved: 3 } },
      orders: [
        { id: 'ORD-001', client: 'A', sku: 'AIR', qty: 5, createdAt: '2026-10-10', shipBy: '2026-10-20', status: 'NEW', priority: 'NORMAL' },
      ],
    });
    const answer = mockAnalyze('Сколько Air сейчас свободно?', buildSnapshot(s, '2026-10-10'));
    expect(answer).toContain('free=26');
    expect(answer).toContain('2026-10-10');
  });
  it('меняет ответ при изменении состояния', () => {
    const s1 = makeState({
      stock: { AIR: { physical: 30, reserved: 0 }, AIR_PLUS: { physical: 10, reserved: 0 } },
    });
    const s2 = makeState({
      stock: { AIR: { physical: 7, reserved: 0 }, AIR_PLUS: { physical: 10, reserved: 0 } },
    });
    const a1 = mockAnalyze('Свободный остаток?', buildSnapshot(s1, '2026-10-10'));
    const a2 = mockAnalyze('Свободный остаток?', buildSnapshot(s2, '2026-10-10'));
    expect(a1).not.toBe(a2);
    expect(a1).toContain('free=30');
    expect(a2).toContain('free=7');
  });
  it('детерминирован: одинаковый ввод → одинаковый ответ', () => {
    const snap = buildSnapshot(makeState(), '2026-10-10');
    expect(mockAnalyze('Сводка', snap)).toBe(mockAnalyze('Сводка', snap));
  });
  it('перечисляет заказы в зоне риска с дефицитом', () => {
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
    const answer = mockAnalyze('Какие заказы в зоне риска?', buildSnapshot(s, '2026-10-10'));
    expect(answer).toContain('ORD-002');
    expect(answer).toContain('дефицит 2');
  });
});