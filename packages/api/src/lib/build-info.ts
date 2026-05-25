/**
 * Build / version info surfaced by the `/healthz` endpoint so the
 * mobile BuildBadge can display the backend version alongside the
 * frontend version. Mirrors `apps/mobile/lib/build-info.ts`.
 *
 *  - `version`      — semver constant. Kept in sync with
 *                     `packages/api/package.json` manually (both are
 *                     currently pinned at `0.0.0` during v4
 *                     pre-release; bump together at release time).
 *  - `gitCommit`    — short SHA injected at image build time via the
 *                     `GIT_COMMIT` build-arg (see infra/fly/Dockerfile
 *                     + infra/fly/deploy.sh). Falls back to `local` for
 *                     dev runs and tests.
 *  - `buildTime`    — ISO timestamp injected at image build time via
 *                     the `BUILD_TIME` build-arg. Optional.
 */
const version = '0.0.0';
const gitCommit = process.env.GIT_COMMIT?.trim() || 'local';
const buildTime = process.env.BUILD_TIME?.trim() || undefined;

export const buildInfo = {
  version,
  gitCommit,
  buildTime,
} as const;
