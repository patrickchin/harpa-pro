/**
 * `(dev)` route group — gallery + per-screen mock-prop mirrors.
 *
 * Guarded so dev routes never reach a production bundle:
 *   - `__DEV__` is `true` in Metro dev builds and `false` in
 *     production EAS builds (Hermes inlines the constant).
 *   - `EXPO_PUBLIC_USE_FIXTURES=true` opts in for `:mock` builds.
 *
 * If neither is true we redirect to `/`, which keeps the routes
 * unmountable in shipped binaries even if Metro tree-shaking is
 * imperfect.
 */
import { Redirect, Stack } from 'expo-router';

import { env } from '../../lib/env';

declare const __DEV__: boolean;

function isDevGalleryEnabled(): boolean {
  const isDevBuild = typeof __DEV__ !== 'undefined' && __DEV__;
  // Preview / TestFlight builds also need the dev tools (esp. the API
  // base URL override) so QA can flip backends without a rebuild.
  const isNonProdVariant = env.EXPO_PUBLIC_APP_VARIANT !== 'production';
  return isDevBuild || env.EXPO_PUBLIC_USE_FIXTURES || isNonProdVariant;
}

export default function DevLayout() {
  if (!isDevGalleryEnabled()) {
    return <Redirect href="/" />;
  }
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerTitle: 'Dev gallery',
      }}
    />
  );
}
