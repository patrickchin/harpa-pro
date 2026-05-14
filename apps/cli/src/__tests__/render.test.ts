/**
 * Snapshot tests for human-readable renderers. Renderers are pure
 * so the snapshots double as a contract: changes to the rendering
 * output must be intentional and reviewed in the same PR that
 * regenerates the snapshot.
 *
 * Chalk is disabled (level 0) so snapshots don't include ANSI codes —
 * makes them readable in PR diffs.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import chalk from 'chalk';
import { renderUser, renderUsage } from '../lib/render.js';

beforeAll(() => {
  chalk.level = 0;
});

describe('renderUser', () => {
  it('renders a fully populated user', () => {
    expect(
      renderUser({
        id: '00000000-0000-0000-0000-000000000001',
        phone: '+15550100100',
        displayName: 'Patrick Chin',
        companyName: 'Harpa Pro Ltd',
        createdAt: '2025-01-15T10:30:00.000Z',
      }),
    ).toMatchSnapshot();
  });

  it('renders a user missing optional fields', () => {
    expect(
      renderUser({
        id: '00000000-0000-0000-0000-000000000002',
        phone: '+15550100200',
        displayName: null,
        companyName: null,
        createdAt: '2025-01-15T10:30:00.000Z',
      }),
    ).toMatchSnapshot();
  });
});

describe('renderUsage', () => {
  it('renders months + totals', () => {
    expect(
      renderUsage({
        months: [
          { month: '2025-01', reports: 12, voiceNotes: 47 },
          { month: '2024-12', reports: 8, voiceNotes: 31 },
        ],
        totals: { reports: 20, voiceNotes: 78 },
      }),
    ).toMatchSnapshot();
  });

  it('renders empty usage', () => {
    expect(
      renderUsage({
        months: [],
        totals: { reports: 0, voiceNotes: 0 },
      }),
    ).toMatchSnapshot();
  });
});
