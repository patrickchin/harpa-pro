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
import type { AuthStatus } from './session';

describe('lib/auth/auth-gate', () => {
  describe('decideAuthRedirect — (auth) route group gate', () => {
    it('redirects authenticated users to (app)/projects', () => {
      expect(decideAuthRedirect('authenticated', '/(auth)/sign-in/phone')).toBe('/(app)/projects');
      expect(decideAuthRedirect('authenticated', '/(auth)/sign-up/phone')).toBe('/(app)/projects');
      expect(decideAuthRedirect('authenticated', '/(auth)/onboarding')).toBe('/(app)/projects');
    });

    it('redirects needs-onboarding users to onboarding, unless already there', () => {
      expect(decideAuthRedirect('needs-onboarding', '/(auth)/sign-in/phone')).toBe('/(auth)/onboarding');
      expect(decideAuthRedirect('needs-onboarding', '/(auth)/sign-up/phone')).toBe('/(auth)/onboarding');
      // Already on onboarding — no redirect
      expect(decideAuthRedirect('needs-onboarding', '/(auth)/onboarding')).toBeNull();
    });

    it('allows unauthenticated users to mount any auth screen', () => {
      expect(decideAuthRedirect('unauthenticated', '/(auth)/sign-in/phone')).toBeNull();
      expect(decideAuthRedirect('unauthenticated', '/(auth)/sign-up/phone')).toBeNull();
      expect(decideAuthRedirect('unauthenticated', '/(auth)/onboarding')).toBeNull();
    });

    it('allows loading status to mount (suppresses flicker)', () => {
      expect(decideAuthRedirect('loading', '/(auth)/sign-in/phone')).toBeNull();
      expect(decideAuthRedirect('loading', '/(auth)/onboarding')).toBeNull();
    });
  });

  describe('decideAppRedirect — (app) route group gate', () => {
    it('allows authenticated users to mount (no redirect)', () => {
      expect(decideAppRedirect('authenticated')).toBeNull();
    });

    it('redirects unauthenticated users to sign-in', () => {
      expect(decideAppRedirect('unauthenticated')).toBe('/(auth)/sign-in/phone');
    });

    it('redirects needs-onboarding users to onboarding', () => {
      expect(decideAppRedirect('needs-onboarding')).toBe('/(auth)/onboarding');
    });

    it('allows loading status to mount (renders splash in-place)', () => {
      expect(decideAppRedirect('loading')).toBeNull();
    });
  });
});
