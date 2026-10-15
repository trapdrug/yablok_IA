import { State, Sku } from '../shared/types';

/**
 * Глубокое клонирование состояния (immutable-копия для симуляций).
 */
export function cloneState(state: State): State {
  return JSON.parse(JSON.stringify(state)) as State;
}

/**
 * Свободный остаток = physical - reserved. Вычисляется, никогда не хранится.
 */
export function free(state: State, sku: Sku): number {
  return state.stock[sku].physical - state.stock[sku].reserved;
}

/** Сегодняшняя дата в формате YYYY-MM-DD (UTC). */
export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Сдвиг ISO-даты на N дней (может быть отрицательным). */
export function addDays(dateISO: string, days: number): string {
  const d = new Date(`${dateISO}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}