import { describe, expect, it } from 'vitest';
import { activityEventTimes } from '../../scripts/start-admin-activity-e2e.js';

describe('admin activity E2E seed timestamps', () => {
  it('keeps every event before test start and preserves feed ordering', () => {
    const testStartedAt = new Date('2026-08-05T12:00:00.000Z');

    const times = activityEventTimes(testStartedAt);

    expect(times).toEqual({
      report: new Date('2026-08-05T11:56:00.000Z'),
      document: new Date('2026-08-05T11:57:00.000Z'),
      image: new Date('2026-08-05T11:58:00.000Z'),
      voice: new Date('2026-08-05T11:59:00.000Z'),
      text: testStartedAt,
    });
    expect(Object.values(times).every((time) => time <= testStartedAt)).toBe(true);
  });
});
