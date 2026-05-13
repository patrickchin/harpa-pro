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

ENV NODE_ENV=production
EXPOSE 8787
CMD ["pnpm", "--filter", "@harpa/api", "exec", "tsx", "src/server.ts"]
