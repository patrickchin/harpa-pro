/**
 * Build / version info exposed at runtime.
 *
 * Ported from `../haru3-reports/apps/mobile/lib/build-info.ts` on
 * branch `dev`, adapted for the v4 stack:
 *  - `serverLabel` derives from the v4 Hono API base URL (resolved via
 *    `env.EXPO_PUBLIC_API_URL`) instead of the v3 Supabase URL.
 *  - `gitCommit` / `displayVersion` / `buildTime` are read from
 *    `Constants.expoConfig.extra` if EAS injects them at build time;
 *    otherwise we fall back to `<version>+local`.
 */
import Constants from 'expo-constants';

import { env } from './env';

type BuildExtra = {
  gitCommit?: string;
  displayVersion?: string;
  buildTime?: string;
};

const extra = (Constants.expoConfig?.extra ?? {}) as BuildExtra;
const version = Constants.expoConfig?.version ?? '0.0.0';
const gitCommit = extra.gitCommit ?? 'local';

function deriveServerLabel(url: string): string {
  if (/^https?:\/\/(localhost|127\.0\.0\.1)/.test(url)) {
    return `Local (${url.replace(/^https?:\/\//, '')})`;
  }
  const flyMatch = url.match(/^https:\/\/([^.]+)\.fly\.dev/);
  if (flyMatch) {
    return `Fly (${flyMatch[1]})`;
  }
  return url || 'unknown';
}

export const buildInfo = {
  version,
  gitCommit,
  displayVersion: extra.displayVersion ?? `${version}+${gitCommit}`,
  buildTime: extra.buildTime,
  serverLabel: deriveServerLabel(env.EXPO_PUBLIC_API_URL),
} as const;
