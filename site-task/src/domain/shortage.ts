import { SKUS, Sku, State } from '../shared/types';
import { free, todayISO } from './state';

/** Нехватка по SKU: сколько NEW-заказов не может быть покрыто свободным остатком. */
export function computeShortage(state: State): Record<Sku, number> {
  const result: Record<Sku, number> = { AIR: 0, AIR_PLUS: 0 };
  for (const sku of SKUS) {
    const demand = state.orders
      .filter((o) => o.sku === sku && o.status === 'NEW')
      .reduce((sum, o) => sum + o.qty, 0);
    result[sku] = Math.max(0, demand - free(state, sku));
  }
  return result;
}

export interface OrderRisk {
  orderId: string;
  sku: Sku;
  qty: number;
  shipBy: string;
  deficit: number;
  reason: string;
}

const PRIORITY_RANK: Record<string, number> = { HIGH: 3, NORMAL: 2, LOW: 1 };

/**
 * Риск опоздания по каждому активному (NEW) заказу.
 * Очередь по SKU: shipBy по возрастанию, затем приоритет (HIGH > NORMAL > LOW),
 * затем createdAt. Для заказа i:
 *   availableBy = free + сумма PLANNED-поставок с expectedDate <= shipBy
 *   demandBefore = сумма qty заказов, стоящих раньше в очереди
 * Если availableBy < demandBefore + qty — заказ в зоне риска.
 */
export function computeRisk(state: State, today: string = todayISO()): OrderRisk[] {
  const risks: OrderRisk[] = [];
  for (const sku of SKUS) {
    const queue = state.orders
      .filter((o) => o.sku === sku && o.status === 'NEW')
      .sort(
        (a, b) =>
          a.shipBy.localeCompare(b.shipBy) ||
          (PRIORITY_RANK[b.priority] ?? 0) - (PRIORITY_RANK[a.priority] ?? 0) ||
          a.createdAt.localeCompare(b.createdAt),
      );
    const planned = state.shipments.filter(
      (s) => s.sku === sku && s.status === 'PLANNED',
    );
    let demandBefore = 0;
    for (const order of queue) {
      const incomingBy = planned
        .filter((s) => s.expectedDate <= order.shipBy)
        .reduce((sum, s) => sum + s.qty, 0);
      const availableBy = free(state, sku) + incomingBy;
      const totalNeeded = demandBefore + order.qty;
      if (availableBy < totalNeeded) {
        risks.push({
          orderId: order.id,
          sku,
          qty: order.qty,
          shipBy: order.shipBy,
          deficit: totalNeeded - availableBy,
          reason: `free + planned incoming by ${order.shipBy} = ${availableBy}, demand up to ${order.id} = ${totalNeeded}`,
        });
      }
      demandBefore = totalNeeded;
    }
  }
  return risks;
}