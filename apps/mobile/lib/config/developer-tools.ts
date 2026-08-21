/**
 * Single source of truth for developer-only mobile surfaces.
 *
 * Fixture-input bundles intentionally expose these tools so Maestro can
 * reach report diagnostics in a release-like build. Normal release builds
 * do not.
 */
import { env } from './env';

export function shouldShowDeveloperTools(
  useFixtures: boolean,
  isDevelopmentBuild: boolean,
): boolean {
  return useFixtures || isDevelopmentBuild;
}

export const SHOW_DEVELOPER_TOOLS = shouldShowDeveloperTools(
  env.EXPO_PUBLIC_USE_FIXTURES,
  __DEV__,
);
