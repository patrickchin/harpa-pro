# Image for @harpa/api. Runs TS directly via tsx so workspace packages
# can keep `"main": "./src/index.ts"` (dev/test/prod use the same files).

FROM node:24.19.0-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY patches patches
COPY apps apps
COPY packages packages
COPY scripts scripts
RUN pnpm install --frozen-lockfile

# Baked into the image so the running container knows what schema head it
# expects. /readyz fails with 503 head-mismatch if app._migrations doesn't
# match. Computed + passed by infra/fly/deploy.sh from the migrations dir.
ARG MIGRATIONS_REQUIRED_HEAD
ENV MIGRATIONS_REQUIRED_HEAD=${MIGRATIONS_REQUIRED_HEAD}

# The independent admin database has its own migration stream and readiness
# endpoint. Keep this separate from MIGRATIONS_REQUIRED_HEAD so Fly's primary
# /readyz health check remains scoped to the application database.
ARG ADMIN_MIGRATIONS_REQUIRED_HEAD
ENV ADMIN_MIGRATIONS_REQUIRED_HEAD=${ADMIN_MIGRATIONS_REQUIRED_HEAD}

# Build-time version metadata surfaced via /healthz so clients (mobile
# BuildBadge, ops dashboards) can see exactly which commit is serving
# traffic. GIT_COMMIT is the full 40-character SHA; both values are
# passed by infra/fly/deploy.sh.
ARG GIT_COMMIT=local
ENV GIT_COMMIT=${GIT_COMMIT}
ARG BUILD_TIME
ENV BUILD_TIME=${BUILD_TIME}

ENV NODE_ENV=production
EXPOSE 8787
CMD ["pnpm", "--filter", "@harpa/api", "exec", "tsx", "src/server.ts"]
