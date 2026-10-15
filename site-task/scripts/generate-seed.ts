import fs from 'node:fs';
import path from 'node:path';
import { generateSeedState } from '../src/domain/seed';

const dataDir = path.resolve(process.cwd(), 'data');
fs.mkdirSync(dataDir, { recursive: true });
const file = path.join(dataDir, 'seed.json');
const state = generateSeedState(42);
const tmp = `${file}.tmp`;
fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
fs.renameSync(tmp, file);
console.log(`seed written to ${file}`);