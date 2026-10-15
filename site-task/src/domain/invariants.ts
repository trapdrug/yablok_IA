import { State } from '../shared/types';

/** Ошибка нарушения правил домена (валидация, инварианты). */
export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DomainError';
  }
}

/** Сущность не найдена (маппится на HTTP 404). */
export class NotFoundError extends DomainError {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

/**
 * Проверка инвариантов состояния:
 * - physical >= 0
 * - reserved >= 0
 * - reserved <= physical
 * - комплектующие >= 0
 */
export function assertInvariants(state: State): void {
  for (const [sku, item] of Object.entries(state.stock)) {
    if (item.physical < 0) {
      throw new DomainError(`invariant violated: physical < 0 for ${sku}`);
    }
    if (item.reserved < 0) {
      throw new DomainError(`invariant violated: reserved < 0 for ${sku}`);
    }
    if (item.reserved > item.physical) {
      throw new DomainError(`invariant violated: reserved > physical for ${sku}`);
    }
  }
  for (const [name, qty] of Object.entries(state.components)) {
    if (qty < 0) {
      throw new DomainError(`invariant violated: component ${name} < 0`);
    }
  }
}