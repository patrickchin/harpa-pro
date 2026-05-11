import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Vendor } from './index.js';

const here = dirname(fileURLToPath(import.meta.url));
const DEFAULT_DIR = resolve(here, '../fixtures');

export interface FixtureFile {
  vendor: Vendor;
  model: string;
  fixtureName: string;
  recordedAt: string;
  requestHash: string;
  request: unknown;
  response: unknown;
}

export class FixtureStore {
  constructor(private readonly dir: string = DEFAULT_DIR) {}

  path(name: string): string {
    return join(this.dir, `${name}.json`);
  }

  read(name: string): FixtureFile | null {
    const p = this.path(name);
    if (!existsSync(p)) return null;
    return JSON.parse(readFileSync(p, 'utf8')) as FixtureFile;
  }

  write(name: string, file: FixtureFile): void {
    mkdirSync(this.dir, { recursive: true });
    writeFileSync(this.path(name), JSON.stringify(file, null, 2) + '\n', 'utf8');
  }
}
