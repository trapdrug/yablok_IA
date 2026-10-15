import { describe, expect, it } from 'vitest';
import { createOrder, reserveOrder, shipOrder } from '../src/domain/orders';
import { DomainError, NotFoundError } from '../src/domain/invariants';
import { makeState } from './helpers';

const base = {
  client: 'Acme',
  sku: 'AIR' as const,
  qty: 5,
  createdAt: '2026-10-10',
  shipBy: '2026-10-20',
};

describe('createOrder', () => {
  it('создаёт заказ NEW с id и приоритетом по умолчанию', () => {
    const next = createOrder(makeState(), base);
    expect(next.orders).toHaveLength(1);
    expect(next.orders[0]).toMatchObject({
      id: 'ORD-001',
      status: 'NEW',
      priority: 'NORMAL',
    });
    expect(next).not.toBe(makeState());
  });
  it('отклоняет qty <= 0', () => {
    expect(() => createOrder(makeState(), { ...base, qty: 0 })).toThrow(DomainError);
  });
  it('отклоняет неизвестный sku', () => {
    expect(() =>
      createOrder(makeState(), { ...base, sku: 'X' as never }),
    ).toThrow(DomainError);
  });
  it('отклоняет shipBy < createdAt', () => {
    expect(() =>
      createOrder(makeState(), { ...base, createdAt: '2026-10-20', shipBy: '2026-10-10' }),
    ).toThrow(DomainError);
  });
});

describe('reserveOrder', () => {
  it('резервирует NEW-заказ и увеличивает reserved', () => {
    let s = createOrder(makeState(), base);
    const next = reserveOrder(s, 'ORD-001');
    expect(next.stock.AIR.reserved).toBe(5);
    expect(next.orders[0].status).toBe('RESERVED');
  });
  it('отклоняет резерв больше свободного остатка', () => {
    const s = createOrder(makeState(), { ...base, qty: 31 });
    expect(() => reserveOrder(s, 'ORD-001')).toThrow(DomainError);
  });
  it('запрещает двойное резервирование одних и тех же единиц', () => {
    let s = makeState({
      stock: { AIR: { physical: 5, reserved: 0 }, AIR_PLUS: { physical: 0, reserved: 0 } },
    });
    s = createOrder(s, { ...base, qty: 3 });
    s = createOrder(s, { ...base, client: 'Beta', qty: 3 });
    s = reserveOrder(s, 'ORD-001');
    expect(() => reserveOrder(s, 'ORD-002')).toThrow(DomainError);
    expect(s.stock.AIR.reserved).toBe(3);
  });
  it('отклоняет повторный резерв уже зарезервированного заказа', () => {
    let s = createOrder(makeState(), base);
    s = reserveOrder(s, 'ORD-001');
    expect(() => reserveOrder(s, 'ORD-001')).toThrow(DomainError);
  });
  it('бросает NotFoundError для неизвестного id', () => {
    expect(() => reserveOrder(makeState(), 'ORD-999')).toThrow(NotFoundError);
  });
});

describe('shipOrder', () => {
  it('отгружает RESERVED-заказ: physical и reserved уменьшаются', () => {
    let s = createOrder(makeState(), base);
    s = reserveOrder(s, 'ORD-001');
    const next = shipOrder(s, 'ORD-001');
    expect(next.stock.AIR.physical).toBe(25);
    expect(next.stock.AIR.reserved).toBe(0);
    expect(next.orders[0].status).toBe('SHIPPED');
  });
  it('отклоняет отгрузку NEW-заказа', () => {
    const s = createOrder(makeState(), base);
    expect(() => shipOrder(s, 'ORD-001')).toThrow(DomainError);
  });
  it('отклоняет повторную отгрузку', () => {
    let s = createOrder(makeState(), base);
    s = reserveOrder(s, 'ORD-001');
    s = shipOrder(s, 'ORD-001');
    expect(() => shipOrder(s, 'ORD-001')).toThrow(DomainError);
  });
});