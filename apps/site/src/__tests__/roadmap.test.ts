import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  FEATURE_SUGGESTION_MAILTO,
  ROADMAP_STAGES,
  ROADMAP_STATUSES,
  stageFor,
} from '../lib/reports/roadmap';

const here = dirname(fileURLToPath(import.meta.url));
const roadmapDir = resolve(here, '../content/reports/roadmap');

describe('roadmap stages', () => {
  it('defines a text label and icon for every status, in display order', () => {
    expect(ROADMAP_STAGES.map((s) => s.id)).toEqual([...ROADMAP_STATUSES]);
    for (const stage of ROADMAP_STAGES) {
      expect(stage.label.length).toBeGreaterThan(0);
      expect(stage.icon.length).toBeGreaterThan(0);
    }
    expect(stageFor('in-progress').label).toBe('In progress');
  });

  it('uses the owner address for feature suggestions', () => {
    expect(FEATURE_SUGGESTION_MAILTO).toMatch(/^mailto:patrick@harpapro\.com\?subject=/);
  });

  it('keeps roadmap entries on known statuses with unique order', () => {
    const files = readdirSync(roadmapDir).filter((f) => f.endsWith('.mdx'));
    const orders = new Set<number>();
    for (const file of files) {
      const source = readFileSync(resolve(roadmapDir, file), 'utf8');
      const status = source.match(/^status: '([^']+)'$/m)?.[1];
      const order = Number(source.match(/^order: (\d+)$/m)?.[1]);
      expect(ROADMAP_STATUSES, file).toContain(status);
      expect(orders.has(order), `${file} duplicate order ${order}`).toBe(false);
      orders.add(order);
    }
  });
});
