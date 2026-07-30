import { describe, expect, it } from 'vitest';
import * as activity from './activity.js';

const baseEvent = {
  id: 'aud_0123456789ab',
  occurredAt: '2026-07-29T10:00:00Z',
  level: 'milestone',
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

  it.each([
    ['note.text_created', 'Text note'],
    ['note.voice_created', 'Voice note'],
    ['note.image_created', 'Image note'],
    ['note.document_created', 'Document note'],
  ] as const)('accepts the %s detail event shape', (eventType, subjectLabel) => {
    const parsed = activity.event.parse({
      ...baseEvent,
      level: 'detail',
      eventType,
      subjectType: 'note',
      subjectId: 'not_0123456789',
      subjectLabel,
      metadata: {},
    });

    expect(parsed).toMatchObject({
      level: 'detail',
      eventType,
      subjectType: 'note',
      subjectId: 'not_0123456789',
      subjectLabel,
      metadata: {},
    });
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

  it('defaults to milestone events and accepts each level filter', () => {
    expect(activity.listQuery.parse({}).level).toBe('milestone');

    for (const level of ['milestone', 'detail', 'all'] as const) {
      expect(activity.listQuery.parse({ level }).level).toBe(level);
    }
  });

  it('parses comma-separated actor exclusions and keeps from/to compatibility', () => {
    const parsed = activity.listQuery.parse({
      eventType: 'report.created',
      actorUserId: 'usr_0123456789ab',
      excludeActorUserIds: ' usr_0123456789ab,usr_bcdefghjkmnp, usr_0123456789ab ',
      projectId: 'prj_01234567',
      from: '2026-07-01T00:00:00Z',
      to: '2026-07-31T23:59:59Z',
      limit: '50',
    });

    expect(parsed).toMatchObject({
      level: 'milestone',
      limit: 50,
      excludeActorUserIds: ['usr_0123456789ab', 'usr_bcdefghjkmnp'],
      from: '2026-07-01T00:00:00.000Z',
      to: '2026-07-31T23:59:59.000Z',
    });
  });

  it('rejects malformed or excessive actor exclusions', () => {
    expect(() =>
      activity.listQuery.parse({
        excludeActorUserIds: 'usr_0123456789ab,,usr_bcdefghjkmnp',
      }),
    ).toThrow();
    expect(() =>
      activity.listQuery.parse({
        excludeActorUserIds: 'usr_0123456789ab,not-a-user-id',
      }),
    ).toThrow();

    const tooMany = Array.from(
      { length: 21 },
      (_, index) => `usr_${String(index).padStart(8, '0')}`,
    ).join(',');
    expect(() => activity.listQuery.parse({ excludeActorUserIds: tooMany })).toThrow();
  });

  it('validates the cursor response envelope', () => {
    expect(() =>
      activity.listResponse.parse({
        items: [],
        nextCursor: null,
      }),
    ).not.toThrow();
  });
});
