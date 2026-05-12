# Multi-stage build for @harpa/api. Hoisted node_modules (pnpm
# node-linker=hoisted) at the repo root, so we copy the whole monorepo
# then build the api package.

FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /repo

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps apps
COPY packages packages
COPY scripts scripts
RUN pnpm install --frozen-lockfile

FROM deps AS build
RUN pnpm --filter @harpa/api-contract build && pnpm --filter @harpa/api build

FROM node:22-alpine AS run
WORKDIR /app
COPY --from=build /repo /app
ENV NODE_ENV=production
EXPOSE 8787
CMD ["node", "/app/packages/api/dist/server.js"]
