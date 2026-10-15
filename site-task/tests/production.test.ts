import { describe, expect, it } from 'vitest';
import { canProduce } from '../src/domain/production';
import { DomainError } from '../src/domain/invariants';
import { makeState } from './helpers';

const config = {
  bom: {
    AIR: { pcb: 1, temp_sensor: 1, humidity_sensor: 1, display: 1, case: 1 },
    AIR_PLUS: {
      pcb: 1,
      temp_sensor: 1,
      humidity_sensor: 1,
      co2_sensor: 1,
      display: 1,
      case: 1,
    },
  },
  production: { defectRate: 0.05, hoursPerUnit: 0.4, shiftsPerDay: 2, hoursPerShift: 8 },
};

describe('canProduce', () => {
  it('возможно, если комплектующих и времени хватает', () => {
    const r = canProduce(makeState(), 'AIR', 20, '2026-10-30', config, '2026-10-10');
    expect(r.possible).toBe(true);
    expect(r.requiredUnits).toBe(22); // ceil(20 / 0.95)
    expect(r.readyDate! <= '2026-10-30').toBe(true); // ISO-даты сравниваются лексикографически
  });
  it('сообщает о нехватке комплектующих с цифрами', () => {
    const s = makeState({
      components: {
        pcb: 100,
        temp_sensor: 100,
        humidity_sensor: 100,
        co2_sensor: 5,
        display: 100,
        case: 100,
      },
    });
    const r = canProduce(s, 'AIR_PLUS', 10, '2026-10-30', config, '2026-10-10');
    expect(r.possible).toBe(false);
    expect(r.reason ?? '').toContain('co2_sensor');
    expect(r.reason ?? '').toContain('11'); // ceil(10 / 0.95) = 11
  });
  it('сообщает о нехватке рабочего времени', () => {
    const s = makeState({
      components: {
        pcb: 2000,
        temp_sensor: 2000,
        humidity_sensor: 2000,
        co2_sensor: 2000,
        display: 2000,
        case: 2000,
      },
    });
    const r = canProduce(s, 'AIR', 1000, '2026-10-11', config, '2026-10-10');
    expect(r.possible).toBe(false);
    expect(r.reason ?? '').toContain('2026-10-11');
  });
  it('отклоняет qty <= 0', () => {
    expect(() =>
      canProduce(makeState(), 'AIR', 0, '2026-10-30', config, '2026-10-10'),
    ).toThrow(DomainError);
  });
});