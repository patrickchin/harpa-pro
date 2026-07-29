import { describe, expect, it } from 'vitest';
import * as activity from './activity.js';

const baseEvent = {
  id: 'aud_0123456789ab',
  occurredAt: '2026-07-29T10:00:00Z',
  actorUserId: 'usr_0123456789ab',
  actorLabel: 'Pat Builder',
  actorEmail: 'pat@example.com',
  subjectId: 'prj_01234567',
  subjectLabel: 'City Hall',
  projectId: 'prj_01234567',
  projectLabel: 'City Hall',
  requestId: 'req-activity-1',
};

describe('admin activity schemas', () => {
  it('accepts each curated event shape and normalizes timestamps', () => {
    const signup = activity.event.parse({
      ...baseEvent,
      eventType: 'user.signed_up',
      subjectType: 'user',
      subjectId: 'usr_0123456789ab',
      subjectLabel: 'Pat Builder',
      projectId: null,
      projectLabel: null,
      metadata: { method: 'email_otp' },
    });
    expect(signup.occurredAt).toBe('2026-07-29T10:00:00.000Z');

    expect(() =>
      activity.event.parse({
        ...baseEvent,
        eventType: 'project.created',
        subjectType: 'project',
        metadata: {},
      }),
    ).not.toThrow();

    expect(() =>
      activity.event.parse({
        ...baseEvent,
        eventType: 'report.created',
        subjectType: 'report',
        subjectId: 'rpt_01234567',
        subjectLabel: 'Report #7',
        metadata: { reportNumber: 7 },
      }),
    ).not.toThrow();
  });

  it('rejects unknown event types and arbitrary metadata', () => {
    expect(() =>
      activity.event.parse({
        ...baseEvent,
        eventType: 'project.deleted',
        subjectType: 'project',
        metadata: {},
      }),
    ).toThrow();

    expect(() =>
      activity.event.parse({
        ...baseEvent,
        eventType: 'project.created',
        subjectType: 'project',
        metadata: { projectName: 'Do not snapshot this' },
      }),
    ).toThrow();
  });

  it('accepts redacted actors and subjects after account deletion', () => {
    const parsed = activity.event.parse({
      ...baseEvent,
      eventType: 'user.signed_up',
      subjectType: 'user',
      actorUserId: null,
      actorLabel: 'Deleted user',
      actorEmail: null,
      subjectId: null,
      subjectLabel: 'Deleted user',
      projectId: null,
      projectLabel: null,
      metadata: { method: 'email_otp' },
    });

    expect(parsed.actorUserId).toBeNull();
    expect(parsed.subjectId).toBeNull();
  });

  it('validates list filters and the cursor response envelope', () => {
    expect(
      activity.listQuery.parse({
        eventType: 'report.created',
        actorUserId: 'usr_0123456789ab',
        projectId: 'prj_01234567',
        from: '2026-07-01T00:00:00Z',
        to: '2026-07-31T23:59:59Z',
        limit: '50',
      }).limit,
    ).toBe(50);

    expect(() =>
      activity.listResponse.parse({
        items: [],
        nextCursor: null,
      }),
    ).not.toThrow();
  });
});
