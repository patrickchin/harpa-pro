/**
 * Auth gate decision tests — pure function matrix covering all
 * (status × pathname) combinations for both (auth) and (app) route
 * groups. Each function returns a redirect target (string) or null
 * (no redirect, render children).
 *
 * Security review §1 mandates exhaustive coverage of the matrix.
 */
import { describe, it, expect } from 'vitest';
import { decideAuthRedirect, decideAppRedirect } from './auth-gate';

describe('lib/auth/auth-gate', () => {
  describe('decideAuthRedirect — (auth) route group gate', () => {
    it('redirects authenticated users to (app)/projects', () => {
      expect(decideAuthRedirect('authenticated', '/sign-in/email')).toBe('/(app)/projects');
      expect(decideAuthRedirect('authenticated', '/sign-in/code')).toBe('/(app)/projects');
      expect(decideAuthRedirect('authenticated', '/onboarding')).toBe('/(app)/projects');
    });

    it('redirects needs-onboarding users to onboarding, unless already there', () => {
      expect(decideAuthRedirect('needs-onboarding', '/sign-in/email')).toBe('/(auth)/onboarding');
      expect(decideAuthRedirect('needs-onboarding', '/sign-in/code')).toBe('/(auth)/onboarding');
      // Already on onboarding — no redirect. expo-router strips group
      // segments, so the runtime pathname is `/onboarding`.
      expect(decideAuthRedirect('needs-onboarding', '/onboarding')).toBeNull();
    });

    it('allows unauthenticated users to mount any auth screen', () => {
      expect(decideAuthRedirect('unauthenticated', '/sign-in/email')).toBeNull();
      expect(decideAuthRedirect('unauthenticated', '/sign-in/code')).toBeNull();
      expect(decideAuthRedirect('unauthenticated', '/onboarding')).toBeNull();
    });

    it('allows loading status to mount (suppresses flicker)', () => {
      expect(decideAuthRedirect('loading', '/sign-in/email')).toBeNull();
      expect(decideAuthRedirect('loading', '/onboarding')).toBeNull();
    });
  });

  describe('decideAppRedirect — (app) route group gate', () => {
    it('allows authenticated users to mount (no redirect)', () => {
      expect(decideAppRedirect('authenticated')).toBeNull();
    });

    it('redirects unauthenticated users to sign-in', () => {
      expect(decideAppRedirect('unauthenticated')).toBe('/(auth)/sign-in/email');
    });

    it('redirects needs-onboarding users to onboarding', () => {
      expect(decideAppRedirect('needs-onboarding')).toBe('/(auth)/onboarding');
    });

    it('allows loading status to mount (renders splash in-place)', () => {
      expect(decideAppRedirect('loading')).toBeNull();
    });
  });
});
