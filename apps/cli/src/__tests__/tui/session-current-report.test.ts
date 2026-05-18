/**
 * Tests for `Session.setCurrentReport` (TUI-nav.0).
 *
 * The invariants we care about:
 *   - report can only be set while authed AND a project is open
 *   - setCurrentProject(undefined) cascades and clears currentReport
 *   - clearAuth() implicitly clears both
 */
import { describe, it, expect } from 'vitest';
import { createSession, type ProjectRef, type ReportRef, type SessionUser } from '../../tui/session.js';
import { memoryCredentialsStore } from '../../tui/credentials.js';

const ENV = { HARPA_API_URL: 'http://api.example', HARPA_DEBUG: '0' as const };
const USER: SessionUser = { userId: 'u1' };
const PROJECT: ProjectRef = { id: 'p1', slug: 'demo', name: 'Demo' };
const REPORT: ReportRef = { projectSlug: 'demo', number: 1, status: 'draft' };

function authedSession() {
  return createSession({
    env: ENV,
    credentials: memoryCredentialsStore(),
    initialState: { kind: 'authed', user: USER },
    token: 'tok',
  });
}

describe('Session.setCurrentReport', () => {
  it('is a no-op when not authed', () => {
    const s = createSession({
      env: ENV,
      credentials: memoryCredentialsStore(),
      initialState: { kind: 'auth', reason: 'never' },
    });
    s.setCurrentReport(REPORT);
    expect(s.state.kind).toBe('auth');
  });

  it('is a no-op when no project is open (defensive invariant)', () => {
    const s = authedSession();
    s.setCurrentReport(REPORT);
    if (s.state.kind !== 'authed') throw new Error('unreachable');
    expect(s.state.currentReport).toBeUndefined();
  });

  it('sets the report when a project is open', () => {
    const s = authedSession();
    s.setCurrentProject(PROJECT);
    s.setCurrentReport(REPORT);
    if (s.state.kind !== 'authed') throw new Error('unreachable');
    expect(s.state.currentReport).toEqual(REPORT);
    expect(s.state.currentProject).toEqual(PROJECT);
  });

  it('clearing report leaves project intact', () => {
    const s = authedSession();
    s.setCurrentProject(PROJECT);
    s.setCurrentReport(REPORT);
    s.setCurrentReport(undefined);
    if (s.state.kind !== 'authed') throw new Error('unreachable');
    expect(s.state.currentReport).toBeUndefined();
    expect(s.state.currentProject).toEqual(PROJECT);
  });

  it('setCurrentProject(undefined) cascades and clears currentReport', () => {
    const s = authedSession();
    s.setCurrentProject(PROJECT);
    s.setCurrentReport(REPORT);
    s.setCurrentProject(undefined);
    if (s.state.kind !== 'authed') throw new Error('unreachable');
    expect(s.state.currentProject).toBeUndefined();
    expect(s.state.currentReport).toBeUndefined();
  });

  it('clearAuth() cascades and clears both', async () => {
    const s = authedSession();
    s.setCurrentProject(PROJECT);
    s.setCurrentReport(REPORT);
    await s.clearAuth('logged-out');
    expect(s.state.kind).toBe('auth');
  });
});
