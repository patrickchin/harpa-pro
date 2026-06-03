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
 *  - `reloadTime` is captured when this module first evaluates. Metro
 *    re-evaluates the bundle on every "Reload" (Cmd-R), so this
 *    changes after a fresh JS bundle loads — a quick visual
 *    confirmation that a new commit actually shipped to the simulator.
 *  - `classifyApiTarget()` labels any URL as local / dev / pr / prod /
 *    other so the BuildBadge can highlight which backend the app is
 *    talking to. The `pr` label catches per-PR Fly preview apps
 *    (`harpa-pro-api-pr-<n>.fly.dev`) deployed by `pr-preview.yml`.
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

export type ApiTargetLabel = 'local' | 'dev' | 'pr' | 'prod' | 'other';

/**
 * Classify any API base URL as local / dev / pr / prod / other so the
 * BuildBadge can colour-code which environment the app talks to.
 * Matches against the host so manual overrides are classified too.
 *
 * `pr` matches per-PR Fly preview apps deployed by
 * `.github/workflows/pr-preview.yml` (`harpa-pro-api-pr-<n>.fly.dev`).
 * `prNumber` is parsed out so the badge can render `pr-124`.
 */
export function classifyApiTarget(url: string): {
  label: ApiTargetLabel;
  host: string;
  prNumber?: number;
} {
  let host = url;
  try {
    host = new URL(url).host;
  } catch {
    // keep raw url as host for malformed inputs
  }
  if (
    /^(localhost|127\.0\.0\.1|10\.|192\.168\.)/.test(host) ||
    host.endsWith('.local')
  ) {
    return { label: 'local', host };
  }
  const prMatch = host.match(/^harpa-pro-api-pr-(\d+)\.fly\.dev$/);
  if (prMatch) {
    return { label: 'pr', host, prNumber: Number(prMatch[1]) };
  }
  if (host.includes('-dev.') || host.startsWith('dev.') || host.includes('harpa-pro-api-dev')) {
    return { label: 'dev', host };
  }
  if (host.includes('harpa-pro-api') || host.startsWith('api.harpa')) {
    return { label: 'prod', host };
  }
  return { label: 'other', host };
}

/** Format a reload-time stamp as HH:MM:SS for the badge. */
export function formatReloadTime(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export const buildInfo = {
  version,
  gitCommit,
  displayVersion: extra.displayVersion ?? `${version}+${gitCommit}`,
  buildTime: extra.buildTime,
  serverLabel: deriveServerLabel(env.EXPO_PUBLIC_API_URL),
  /** Captured at module evaluation — refreshes on every Metro reload. */
  reloadTime: new Date(),
  appVariant: env.EXPO_PUBLIC_APP_VARIANT,
} as const;
