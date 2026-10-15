import { describe, expect, it } from 'vitest';
import { DomainError, assertInvariants } from '../src/domain/invariants';
import { makeState } from './helpers';

describe('assertInvariants', () => {
  it('проходит для корректного состояния', () => {
    expect(() => assertInvariants(makeState())).not.toThrow();
  });
  it('бросает ошибку при physical < 0', () => {
    const s = makeState();
    s.stock.AIR.physical = -1;
    expect(() => assertInvariants(s)).toThrow(DomainError);
  });
  it('бросает ошибку при reserved < 0', () => {
    const s = makeState();
    s.stock.AIR.reserved = -1;
    expect(() => assertInvariants(s)).toThrow(DomainError);
  });
  it('бросает ошибку при reserved > physical', () => {
    const s = makeState();
    s.stock.AIR.reserved = 31;
    expect(() => assertInvariants(s)).toThrow(DomainError);
  });
  it('бросает ошибку при комплектующих < 0', () => {
    const s = makeState();
    s.components.pcb = -5;
    expect(() => assertInvariants(s)).toThrow(DomainError);
  });
});