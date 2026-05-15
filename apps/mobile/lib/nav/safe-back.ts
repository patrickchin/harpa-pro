/**
 * safeBack — navigate back, falling back to a known "up" route when there is
 * no history to pop (e.g. the screen was entered via router.replace, a deep
 * link resolver, or from an external share link).
 *
 * Without this guard, router.back() on a single-entry stack throws the
 * "GO_BACK was not handled by any navigator" warning in dev and silently
 * no-ops in production — leaving the user stuck.
 *
 * Usage:
 *   safeBack(router, '/(app)/projects');
 *   safeBack(router, `/(app)/projects/${slug}`);
 */
import type { Router } from 'expo-router';
import type { Href } from 'expo-router';

export function safeBack(router: Router, fallback: Href): void {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace(fallback);
  }
}
