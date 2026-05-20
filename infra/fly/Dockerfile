# Image for @harpa/api. Runs TS directly via tsx so workspace packages
# can keep `"main": "./src/index.ts"` (dev/test/prod use the same files).

FROM node:22-alpine AS base
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

ENV NODE_ENV=production
EXPOSE 8787
CMD ["pnpm", "--filter", "@harpa/api", "exec", "tsx", "src/server.ts"]
