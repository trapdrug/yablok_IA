import { Sku, State } from '../shared/types';
import { DomainError } from './invariants';
import { addDays, todayISO } from './state';

export interface ProductionConfig {
  defectRate: number; // доля брака, [0, 1)
  hoursPerUnit: number; // часов на сборку+проверку 1 изделия
  shiftsPerDay: number;
  hoursPerShift: number;
}

export interface BomEntry {
  [component: string]: number;
}

export interface ProductionCheckResult {
  possible: boolean;
  requiredUnits: number; // с учётом брака
  daysNeeded: number;
  readyDate?: string;
  reason?: string;
}

/**
 * «Можно ли собрать партию qty единиц SKU к дате targetDate?»
 * READ-ONLY: не списывает комплектующие.
 * Учитывает: BOM, долю брака (ceil(qty / (1 - defectRate))), рабочее время.
 */
export function canProduce(
  state: State,
  sku: Sku,
  qty: number,
  targetDate: string,
  config: { bom: Record<Sku, BomEntry>; production: ProductionConfig },
  today: string = todayISO(),
): ProductionCheckResult {
  if (!Number.isInteger(qty) || qty <= 0) {
    throw new DomainError('qty must be a positive integer');
  }
  const bom = config.bom[sku];
  if (!bom) {
    throw new DomainError(`no BOM for ${sku}`);
  }
  const { defectRate, hoursPerUnit, shiftsPerDay, hoursPerShift } = config.production;
  if (defectRate < 0 || defectRate >= 1) {
    throw new DomainError('defectRate must be in [0, 1)');
  }
  if (hoursPerUnit <= 0 || shiftsPerDay <= 0 || hoursPerShift <= 0) {
    throw new DomainError('production rates must be positive');
  }

  const requiredUnits = Math.ceil(qty / (1 - defectRate));

  for (const [component, perUnit] of Object.entries(bom)) {
    const need = requiredUnits * perUnit;
    const have = state.components[component] ?? 0;
    if (have < need) {
      return {
        possible: false,
        requiredUnits,
        daysNeeded: 0,
        reason: `не хватает комплектующих: ${component} нужно ${need}, есть ${have}`,
      };
    }
  }

  const unitsPerDay = (hoursPerShift * shiftsPerDay) / hoursPerUnit;
  const daysNeeded = Math.ceil(requiredUnits / unitsPerDay);
  const readyDate = addDays(today, daysNeeded);
  if (readyDate > targetDate) {
    return {
      possible: false,
      requiredUnits,
      daysNeeded,
      reason: `готово ${readyDate}, позже целевой даты ${targetDate} (нужно ${daysNeeded} раб. дней)`,
    };
  }
  return { possible: true, requiredUnits, daysNeeded, readyDate };
}