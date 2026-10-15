import { Order, Shipment, SKUS, Sku, State } from '../shared/types';
import { free, todayISO } from './state';
import { OrderRisk, computeRisk, computeShortage } from './shortage';

/** Сериализованный снимок состояния — основа ответа ИИ-аналитика. */
export interface Snapshot {
  asOf: string;
  stock: Record<Sku, { physical: number; reserved: number; free: number }>;
  components: Record<string, number>;
  orders: Order[];
  shipments: Shipment[];
  shortage: Record<Sku, number>;
  risk: OrderRisk[];
}

export function buildSnapshot(state: State, today: string = todayISO()): Snapshot {
  const stock = {} as Snapshot['stock'];
  for (const sku of SKUS) {
    stock[sku] = {
      physical: state.stock[sku].physical,
      reserved: state.stock[sku].reserved,
      free: free(state, sku),
    };
  }
  return {
    asOf: today,
    stock,
    components: { ...state.components },
    orders: state.orders.map((o) => ({ ...o })),
    shipments: state.shipments.map((s) => ({ ...s })),
    shortage: computeShortage(state),
    risk: computeRisk(state, today),
  };
}

/**
 * Mock-аналитик: детерминированный ответ, вычисленный ТОЛЬКО из снимка состояния.
 * Без LLM, без заранее заготовленных цифр — все числа берутся из snapshot.
 */
export function mockAnalyze(question: string, snapshot: Snapshot): string {
  const q = question.toLowerCase();
  const has = (...words: string[]): boolean => words.some((w) => q.includes(w));

  const stockLine = (sku: Sku): string => {
    const s = snapshot.stock[sku];
    return `${sku}: physical=${s.physical}, reserved=${s.reserved}, free=${s.free}`;
  };

  const parts: string[] = [`(mock-аналитик, данные на ${snapshot.asOf})`];

  if (has('риск', 'риске', 'угроз', 'опозда', 'late', 'risk')) {
    if (snapshot.risk.length === 0) {
      parts.push('Заказов в зоне риска опоздания сейчас нет.');
    } else {
      parts.push(`Заказы в зоне риска (${snapshot.risk.length}):`);
      for (const r of snapshot.risk) {
        parts.push(
          `- ${r.orderId} (${r.sku}, qty=${r.qty}, shipBy=${r.shipBy}): дефицит ${r.deficit}. ${r.reason}`,
        );
      }
    }
  }
  if (has('нехватк', 'дефицит', 'shortage', 'хватит', 'хватает')) {
    parts.push(
      `Нехватка по NEW-заказам: AIR=${snapshot.shortage.AIR}, AIR_PLUS=${snapshot.shortage.AIR_PLUS}.`,
    );
  }
  if (has('свободн', 'свободно', 'free', 'к отгрузк', 'остаток', 'остатки')) {
    parts.push(`Свободный остаток: ${stockLine('AIR')}; ${stockLine('AIR_PLUS')}.`);
  }
  if (has('поставк', 'supply', 'shipment', 'инкоминг')) {
    const planned = snapshot.shipments.filter((s) => s.status === 'PLANNED');
    parts.push(`Планируемые поставки (${planned.length}):`);
    for (const s of planned) {
      parts.push(`- ${s.id}: ${s.sku} x${s.qty}, ожидается ${s.expectedDate}`);
    }
  }
  if (has('производств', 'собрать', 'комплектующ', 'production', 'bom')) {
    parts.push(
      `Комплектующие: ${Object.entries(snapshot.components)
        .map(([k, v]) => `${k}=${v}`)
        .join(', ')}.`,
    );
  }

  if (parts.length === 1) {
    // полная сводка
    parts.push(`Остатки: ${stockLine('AIR')}; ${stockLine('AIR_PLUS')}.`);
    parts.push(
      `Нехватка: AIR=${snapshot.shortage.AIR}, AIR_PLUS=${snapshot.shortage.AIR_PLUS}.`,
    );
    const active = snapshot.orders.filter((o) => o.status !== 'SHIPPED');
    parts.push(`Активные заказы: ${active.length}.`);
    const planned = snapshot.shipments.filter((s) => s.status === 'PLANNED');
    parts.push(`Планируемые поставки: ${planned.length}.`);
    if (snapshot.risk.length > 0) {
      parts.push(`Заказы в зоне риска: ${snapshot.risk.map((r) => r.orderId).join(', ')}.`);
    }
  }
  return parts.join('\n');
}