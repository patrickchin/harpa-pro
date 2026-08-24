import { describe, expect, it, vi } from 'vitest';
import { probeMigrationLedger } from './migration-ledger.js';

describe('probeMigrationLedger', () => {
  it('checks reachability, bootstrap, and latest head in order', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ exists: true }] })
      .mockResolvedValueOnce({ rows: [{ name: '0031_remove_retired_llm_usage_ledger.sql' }] });

    const result = await probeMigrationLedger({
      pool: { query },
      schema: 'app',
    });

    expect(result).toEqual({
      ok: true,
      head: '0031_remove_retired_llm_usage_ledger.sql',
    });
    expect(query).toHaveBeenNthCalledWith(1, 'SELECT 1');
    expect(query).toHaveBeenNthCalledWith(
      2,
      `SELECT to_regclass('app._migrations') IS NOT NULL AS exists`,
    );
    expect(query).toHaveBeenNthCalledWith(
      3,
      `SELECT name FROM app._migrations ORDER BY name DESC LIMIT 1`,
    );
  });

  it('returns schema-missing without reading a head when the ledger relation is absent', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ exists: false }] });

    const result = await probeMigrationLedger({
      pool: { query },
      schema: 'admin',
    });

    expect(result).toEqual({ ok: false, db: 'schema-missing' });
    expect(query).toHaveBeenCalledTimes(2);
  });
});
