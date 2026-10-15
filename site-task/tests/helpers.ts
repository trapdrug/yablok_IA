import { State } from '../src/shared/types';

export function makeState(overrides: Partial<State> = {}): State {
  return {
    stock: {
      AIR: { physical: 30, reserved: 0 },
      AIR_PLUS: { physical: 10, reserved: 0 },
    },
    components: {
      pcb: 100,
      temp_sensor: 100,
      humidity_sensor: 100,
      co2_sensor: 40,
      display: 100,
      case: 100,
    },
    orders: [],
    shipments: [],
    orderSeq: 1,
    shipmentSeq: 1,
    ...overrides,
  };
}