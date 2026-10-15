import fs from 'node:fs';
import path from 'node:path';
import { Sku } from '../shared/types';
import { BomEntry, ProductionConfig } from '../domain/production';

export interface CompanyConfig {
  company: string;
  skus: Record<Sku, { name: string; measures: string[] }>;
  bom: Record<Sku, BomEntry>;
  production: ProductionConfig;
  risk: { considerIncoming: boolean; priorityOrder: string[] };
}

const CONFIG_FILE = path.resolve(process.cwd(), 'config', 'company.json');

let cached: CompanyConfig | null = null;

/** Загрузка config/company.json (с кэшем). */
export function loadCompanyConfig(): CompanyConfig {
  if (cached) {
    return cached;
  }
  const raw = fs.readFileSync(CONFIG_FILE, 'utf-8');
  cached = JSON.parse(raw) as CompanyConfig;
  return cached;
}