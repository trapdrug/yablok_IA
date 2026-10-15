import fs from 'node:fs';
import path from 'node:path';
import { State } from '../shared/types';
import { assertInvariants } from '../domain/invariants';
import { generateSeedState } from '../domain/seed';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const SEED_FILE = path.join(DATA_DIR, 'seed.json');

/**
 * In-memory хранилище с атомарной персистентностью в data/seed.json
 * (запись во временный файл + rename).
 * При первом запуске seed генерируется автоматически.
 */
class Store {
  private state: State;

  constructor() {
    if (fs.existsSync(SEED_FILE)) {
      const raw = fs.readFileSync(SEED_FILE, 'utf-8');
      this.state = JSON.parse(raw) as State;
      assertInvariants(this.state);
    } else {
      this.state = generateSeedState(42);
      this.save();
    }
  }

  getState(): State {
    return this.state;
  }

  /** Заменяет состояние и атомарно сохраняет на диск. */
  update(next: State): State {
    assertInvariants(next);
    this.state = next;
    this.save();
    return next;
  }

  private save(): void {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = `${SEED_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.state, null, 2));
    fs.renameSync(tmp, SEED_FILE);
  }
}

export const store = new Store();