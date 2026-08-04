/**
 * dismissOrReplaceTo — pop the back stack to an existing parent frame
 * when the target is already on the stack, otherwise fall back to
 * `replace`. Use this for every post-mutation redirect whose target
 * route is likely a parent already sitting below the current screen
 * (e.g. delete-draft → reports list, delete project → projects list).
 *
 * Why not raw `router.replace`?
 *
 * `replace` swaps the TOP of the stack with the new route — but if
 * that route is already one frame below, you end up with two adjacent
 * copies of the same screen and back appears to "do nothing". See
 * `docs/v4/arch-mobile-navigation.md` §4 for the full reproducer.
 *
 * `dismissTo` walks the stack back to the existing frame, so the
 * duplicate never forms. On a cold deep-link stack where the target
 * frame doesn't exist Expo Router throws — we catch and fall back to
 * `replace` so the user still lands on the right screen.
 */
import type { Href, ImperativeRouter } from 'expo-router';

export function dismissOrReplaceTo(router: ImperativeRouter, href: Href): void {
  try {
    router.dismissTo(href);
  } catch {
    router.replace(href);
  }
}
