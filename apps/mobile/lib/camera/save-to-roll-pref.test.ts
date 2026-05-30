import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  SAVE_TO_ROLL_KEY,
  readSaveToRollPref,
  writeSaveToRollPref,
} from './save-to-roll-pref';

// Re-mock AsyncStorage with an inspectable backing map (the default
// setup mock is shared across tests; we want a fresh one here).
const mem = new Map<string, string>();
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(async (k: string) => mem.get(k) ?? null),
    setItem: vi.fn(async (k: string, v: string) => {
      mem.set(k, v);
    }),
    removeItem: vi.fn(async (k: string) => {
      mem.delete(k);
    }),
    clear: vi.fn(async () => {
      mem.clear();
    }),
  },
}));

describe('lib/camera/save-to-roll-pref', () => {
  beforeEach(() => {
    mem.clear();
  });

  it('defaults to false when nothing is stored', async () => {
    expect(await readSaveToRollPref()).toBe(false);
  });

  it('write → read round-trips true', async () => {
    await writeSaveToRollPref(true);
    expect(mem.get(SAVE_TO_ROLL_KEY)).toBe('1');
    expect(await readSaveToRollPref()).toBe(true);
  });

  it('write false stores "0" and reads as false', async () => {
    await writeSaveToRollPref(true);
    await writeSaveToRollPref(false);
    expect(mem.get(SAVE_TO_ROLL_KEY)).toBe('0');
    expect(await readSaveToRollPref()).toBe(false);
  });
});
