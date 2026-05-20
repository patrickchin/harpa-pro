/**
 * safeBack — go back if there's history, otherwise replace with a fallback.
 * Prevents the "GO_BACK not handled by any navigator" error on screens
 * entered via replace or deep link.
 */
import type { Router, Href } from 'expo-router';

export function safeBack(router: Router, fallback: Href): void {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace(fallback);
  }
}
