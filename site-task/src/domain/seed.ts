import { Order, Shipment, State } from '../shared/types';
import { addDays, todayISO } from './state';

/** Детерминированный PRNG (mulberry32). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CLIENTS = [
  'Alpha Corp',
  'Beta LLC',
  'Gamma Inc',
  'Delta GmbH',
  'Epsilon SA',
  'Zeta Ltd',
  'Eta Corp',
  'Theta LLC',
  'Iota Inc',
  'Kappa GmbH',
  'Lambda SA',
  'Mu Oy',
  'Nu AB',
];

/**
 * Генерация реалистичного seed-состояния (детерминированная, seed=42).
 * Даты — относительно сегодняшнего дня.
 *
 * Гарантированные сценарии:
 *  1) дефицит AIR: NEW-запросы 29 шт, свободный остаток 26 → shortage 3;
 *  2) риск опоздания: ORD-009 (AIR_PLUS) в зоне риска (дефицит 1);
 *     задержка SHP-003 на 3 дня добавляет ORD-008 в зону риска;
 *  3) успешный резерв: ORD-001 (AIR, 5 шт) можно зарезервировать (free 26).
 */
export function generateSeedState(seed = 42): State {
  const rand = mulberry32(seed);
  const pick = (): string => CLIENTS[Math.floor(rand() * CLIENTS.length)];
  const today = todayISO();
  const d = (offset: number): string => addDays(today, offset);

  const orders: Order[] = [
    // AIR: NEW-спрос 29, free 26 → shortage 3
    { id: 'ORD-001', client: pick(), sku: 'AIR', qty: 5, createdAt: d(-2), shipBy: d(3), status: 'NEW', priority: 'HIGH' },
    { id: 'ORD-002', client: pick(), sku: 'AIR', qty: 8, createdAt: d(-1), shipBy: d(5), status: 'NEW', priority: 'NORMAL' },
    { id: 'ORD-003', client: pick(), sku: 'AIR', qty: 10, createdAt: d(0), shipBy: d(7), status: 'NEW', priority: 'NORMAL' },
    { id: 'ORD-004', client: pick(), sku: 'AIR', qty: 6, createdAt: d(0), shipBy: d(10), status: 'NEW', priority: 'LOW' },
    { id: 'ORD-005', client: pick(), sku: 'AIR', qty: 4, createdAt: d(-3), shipBy: d(2), status: 'RESERVED', priority: 'HIGH' },
    { id: 'ORD-006', client: pick(), sku: 'AIR', qty: 3, createdAt: d(-5), shipBy: d(-1), status: 'SHIPPED', priority: 'NORMAL' },
    // AIR_PLUS: free 7, ORD-009 в зоне риска (дефицит 1)
    { id: 'ORD-007', client: pick(), sku: 'AIR_PLUS', qty: 6, createdAt: d(-1), shipBy: d(4), status: 'NEW', priority: 'HIGH' },
    { id: 'ORD-008', client: pick(), sku: 'AIR_PLUS', qty: 5, createdAt: d(0), shipBy: d(6), status: 'NEW', priority: 'NORMAL' },
    { id: 'ORD-009', client: pick(), sku: 'AIR_PLUS', qty: 5, createdAt: d(0), shipBy: d(8), status: 'NEW', priority: 'NORMAL' },
    { id: 'ORD-010', client: pick(), sku: 'AIR_PLUS', qty: 3, createdAt: d(-2), shipBy: d(3), status: 'RESERVED', priority: 'HIGH' },
    { id: 'ORD-011', client: pick(), sku: 'AIR_PLUS', qty: 2, createdAt: d(-4), shipBy: d(-2), status: 'SHIPPED', priority: 'NORMAL' },
  ];

  const shipments: Shipment[] = [
    { id: 'SHP-001', sku: 'AIR', qty: 15, expectedDate: d(4), status: 'PLANNED' },
    { id: 'SHP-002', sku: 'AIR', qty: 10, expectedDate: d(9), status: 'PLANNED' },
    { id: 'SHP-003', sku: 'AIR_PLUS', qty: 8, expectedDate: d(5), status: 'PLANNED' },
  ];

  return {
    stock: {
      AIR: { physical: 30, reserved: 4 },
      AIR_PLUS: { physical: 10, reserved: 3 },
    },
    components: {
      pcb: 150,
      temp_sensor: 150,
      humidity_sensor: 150,
      co2_sensor: 40,
      display: 150,
      case: 150,
    },
    orders,
    shipments,
    orderSeq: 12,
    shipmentSeq: 4,
  };
}