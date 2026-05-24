/**
 * Tests for `lib/api/initial-data.ts`.
 *
 * Covers:
 *  - Returns the matching row when present in the list cache.
 *  - Returns `undefined` when missing / no list cache / invalid input.
 *  - Reads from any cached variant of the list query (e.g. when a
 *    filter argument changes the key tail).
 *  - `…UpdatedAt` helpers return the max `dataUpdatedAt` across
 *    variants, or `undefined` when no list cache exists.
 *  - Helpers do NOT mutate the cache.
 */
import { describe, it, expect } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import {
  projectInitialData,
  projectInitialDataUpdatedAt,
  reportInitialData,
  reportInitialDataUpdatedAt,
} from './initial-data';

describe('projectInitialData', () => {
  it('returns the matching row from the list cache', () => {
    const qc = new QueryClient();
    qc.setQueryData(
      ['projects', undefined],
      {
        items: [
          { id: 'a', name: 'A' },
          { id: 'b', name: 'B' },
        ],
      },
    );
    expect(projectInitialData(qc, 'b')).toEqual({ id: 'b', name: 'B' });
  });

  it('returns undefined when not present', () => {
    const qc = new QueryClient();
    qc.setQueryData(['projects', undefined], { items: [{ id: 'a' }] });
    expect(projectInitialData(qc, 'missing')).toBeUndefined();
  });

  it('returns undefined when no list cache exists', () => {
    expect(projectInitialData(new QueryClient(), 'a')).toBeUndefined();
  });

  it('returns undefined for empty slug', () => {
    const qc = new QueryClient();
    qc.setQueryData(['projects', undefined], { items: [{ id: 'a' }] });
    expect(projectInitialData(qc, '')).toBeUndefined();
  });

  it('reads across multiple cached list variants', () => {
    const qc = new QueryClient();
    qc.setQueryData(['projects', undefined], { items: [] });
    qc.setQueryData(['projects', { archived: true }], {
      items: [{ id: 'old' }],
    });
    expect(projectInitialData(qc, 'old')).toEqual({ id: 'old' });
  });

  it('tolerates a bare-array cache shape (legacy / non-paginated)', () => {
    const qc = new QueryClient();
    qc.setQueryData(['projects', undefined], [{ id: 'a' }]);
    expect(projectInitialData(qc, 'a')).toEqual({ id: 'a' });
  });

  it('does not mutate the cache', () => {
    const qc = new QueryClient();
    const seed = { items: [{ id: 'a' }] };
    qc.setQueryData(['projects', undefined], seed);
    projectInitialData(qc, 'a');
    expect(qc.getQueryData(['projects', undefined])).toBe(seed);
  });
});

describe('projectInitialDataUpdatedAt', () => {
  it('returns the max dataUpdatedAt across all list variants', () => {
    const qc = new QueryClient();
    qc.setQueryData(['projects', undefined], { items: [] });
    qc.setQueryData(['projects', { archived: true }], { items: [] });
    const a = qc.getQueryState(['projects', undefined])!.dataUpdatedAt;
    const b = qc.getQueryState(['projects', { archived: true }])!.dataUpdatedAt;
    expect(projectInitialDataUpdatedAt(qc)).toBe(Math.max(a, b));
  });

  it('returns undefined when no list cache exists', () => {
    expect(projectInitialDataUpdatedAt(new QueryClient())).toBeUndefined();
  });
});

describe('reportInitialData', () => {
  it('returns the matching report from the list cache', () => {
    const qc = new QueryClient();
    qc.setQueryData(
      ['projectReports', { project: 'demo' }, undefined],
      {
        items: [
          { number: 1, title: 'one' },
          { number: 2, title: 'two' },
        ],
      },
    );
    expect(reportInitialData(qc, 'demo', 2)).toEqual({
      number: 2,
      title: 'two',
    });
  });

  it('returns undefined for unknown number / wrong project', () => {
    const qc = new QueryClient();
    qc.setQueryData(
      ['projectReports', { project: 'demo' }, undefined],
      { items: [{ number: 1 }] },
    );
    expect(reportInitialData(qc, 'demo', 99)).toBeUndefined();
    expect(reportInitialData(qc, 'other', 1)).toBeUndefined();
  });

  it('returns undefined for invalid input', () => {
    const qc = new QueryClient();
    qc.setQueryData(
      ['projectReports', { project: 'demo' }, undefined],
      { items: [{ number: 1 }] },
    );
    expect(reportInitialData(qc, '', 1)).toBeUndefined();
    expect(reportInitialData(qc, 'demo', Number.NaN)).toBeUndefined();
  });

  it('does not mutate the cache', () => {
    const qc = new QueryClient();
    const seed = { items: [{ number: 1 }] };
    qc.setQueryData(['projectReports', { project: 'demo' }, undefined], seed);
    reportInitialData(qc, 'demo', 1);
    expect(
      qc.getQueryData(['projectReports', { project: 'demo' }, undefined]),
    ).toBe(seed);
  });
});

describe('reportInitialDataUpdatedAt', () => {
  it('returns max dataUpdatedAt for the project scope', () => {
    const qc = new QueryClient();
    qc.setQueryData(['projectReports', { project: 'demo' }, undefined], {
      items: [],
    });
    qc.setQueryData(
      ['projectReports', { project: 'demo' }, { archived: true }],
      { items: [] },
    );
    const a = qc.getQueryState([
      'projectReports',
      { project: 'demo' },
      undefined,
    ])!.dataUpdatedAt;
    const b = qc.getQueryState([
      'projectReports',
      { project: 'demo' },
      { archived: true },
    ])!.dataUpdatedAt;
    expect(reportInitialDataUpdatedAt(qc, 'demo')).toBe(Math.max(a, b));
  });

  it('returns undefined when no list cache exists for the project', () => {
    const qc = new QueryClient();
    qc.setQueryData(['projectReports', { project: 'other' }, undefined], {
      items: [],
    });
    expect(reportInitialDataUpdatedAt(qc, 'demo')).toBeUndefined();
  });
});
