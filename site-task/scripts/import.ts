import fs from 'node:fs';
import path from 'node:path';
import { Order, Shipment, Sku, State } from '../src/shared/types';

/**
 * ОПЦИОНАЛЬНЫЙ импорт архива компании в data/seed.json.
 * Ожидается каталог company/ с файлами:
 *   products.json — товары и BOM (не используется в seed, только справочно)
 *   orders.json   — [{client, sku, qty, createdAt, shipBy, status, priority}]
 *   stock.json    — { AIR: {physical, reserved}, AIR_PLUS: {physical, reserved} }
 *   incoming.json — [{sku, qty, expectedDate}]
 *
 * Запуск: npm run import
 */
const companyDir = path.resolve(process.cwd(), 'company');

function readJson<T>(name: string): T {
  const file = path.join(companyDir, name);
  if (!fs.existsSync(file)) {
    throw new Error(`file not found: ${file}`);
  }
  return JSON.parse(fs.readFileSync(file, 'utf-8')) as T;
}

interface RawOrder {
  client: string;
  sku: Sku;
  qty: number;
  createdAt: string;
  shipBy: string;
  status?: 'NEW' | 'RESERVED' | 'SHIPPED';
  priority?: 'LOW' | 'NORMAL' | 'HIGH';
}

interface RawShipment {
  sku: Sku;
  qty: number;
  expectedDate: string;
}

function main(): void {
  const stock = readJson<Record<Sku, { physical: number; reserved: number }>>('stock.json');
  const rawOrders = readJson<RawOrder[]>('orders.json');
  const rawShipments = readJson<RawShipment[]>('incoming.json');

  const orders: Order[] = rawOrders.map((o, i) => ({
    id: `ORD-${String(i + 1).padStart(3, '0')}`,
    client: o.client,
    sku: o.sku,
    qty: o.qty,
    createdAt: o.createdAt,
    shipBy: o.shipBy,
    status: o.status ?? 'NEW',
    priority: o.priority ?? 'NORMAL',
  }));

  const shipments: Shipment[] = rawShipments.map((s, i) => ({
    id: `SHP-${String(i + 1).padStart(3, '0')}`,
    sku: s.sku,
    qty: s.qty,
    expectedDate: s.expectedDate,
    status: 'PLANNED',
  }));

  const state: State = {
    stock: {
      AIR: { physical: stock.AIR?.physical ?? 0, reserved: stock.AIR?.reserved ?? 0 },
      AIR_PLUS: {
        physical: stock.AIR_PLUS?.physical ?? 0,
        reserved: stock.AIR_PLUS?.reserved ?? 0,
      },
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
    orderSeq: orders.length + 1,
    shipmentSeq: shipments.length + 1,
  };

  const dataDir = path.resolve(process.cwd(), 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const file = path.join(dataDir, 'seed.json');
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, file);
  console.log(`imported ${orders.length} orders, ${shipments.length} shipments -> ${file}`);
}

main();