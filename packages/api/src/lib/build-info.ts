/**
 * Build / version info surfaced by the `/healthz` endpoint so the
 * mobile BuildBadge can display the backend version alongside the
 * frontend version. Mirrors `apps/mobile/lib/build-info.ts`.
 *
 *  - `version`      — read from the root `package.json` (single source
 *                     of truth for the monorepo semver).
 *  - `gitCommit`    — short SHA injected at image build time via the
 *                     `GIT_COMMIT` build-arg (see infra/fly/Dockerfile
 *                     + infra/fly/deploy.sh). Falls back to `local` for
 *                     dev runs and tests.
 *  - `buildTime`    — ISO timestamp injected at image build time via
 *                     the `BUILD_TIME` build-arg. Optional.
 */
import { version } from '../../../../package.json' with { type: 'json' };

const gitCommit = process.env.GIT_COMMIT?.trim() || 'local';
const buildTime = process.env.BUILD_TIME?.trim() || undefined;

export const buildInfo = {
  version,
  gitCommit,
  buildTime,
} as const;
