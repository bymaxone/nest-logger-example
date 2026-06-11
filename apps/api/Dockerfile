# syntax=docker/dockerfile:1

# Production image for the NestJS API (`ghcr.io/bymaxone/nest-logger-example-api`).
#
# Build context is the REPO ROOT so the workspace lockfile resolves. NOTE: this
# image can only build once `@bymax-one/nest-logger` is published to npm and the
# app dependency is switched from the local `file:`/`link:` spec to a registry
# range — the sibling library checkout lives outside the Docker build context.
#
# pnpm uses the isolated (symlinked) linker here (no hoisting in `.npmrc`), so the
# runtime stage copies BOTH the root virtual store (`/app/node_modules`) and the
# package's symlinked tree (`/app/apps/api/node_modules`).

# ── deps ─────────────────────────────────────────────────────────────────────
FROM node:24-alpine AS deps
RUN corepack enable && corepack prepare pnpm@10.8.0 --activate
WORKDIR /app
# All workspace manifests are required for a `--frozen-lockfile` install to match
# the lockfile's dependency graph.
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
# The API's `postinstall` runs `prisma generate`, which needs the schema present.
COPY apps/api/prisma apps/api/prisma
# `prisma generate` only reads the schema; it never opens a connection.
ENV DATABASE_URL=postgresql://localhost:5432/build_placeholder
RUN pnpm install --frozen-lockfile

# ── build ────────────────────────────────────────────────────────────────────
FROM node:24-alpine AS build
RUN corepack enable && corepack prepare pnpm@10.8.0 --activate
WORKDIR /app
ENV DATABASE_URL=postgresql://localhost:5432/build_placeholder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY . .
RUN pnpm --filter @nest-logger-example/api run db:generate \
 && pnpm --filter @nest-logger-example/api run build

# ── runner ───────────────────────────────────────────────────────────────────
FROM node:24-alpine AS runner
WORKDIR /app/apps/api
ENV NODE_ENV=production
# apps/api HTTP port (Appendix A: PORT=3001; worker 3002, web 3003, Grafana 3000).
ENV PORT=3001
# Non-root runtime.
RUN addgroup -S nodejs && adduser -S nestjs -G nodejs
COPY --from=build --chown=nestjs:nodejs /app/node_modules /app/node_modules
COPY --from=build --chown=nestjs:nodejs /app/apps/api/node_modules ./node_modules
COPY --from=build --chown=nestjs:nodejs /app/apps/api/dist ./dist
COPY --from=build --chown=nestjs:nodejs /app/apps/api/package.json ./package.json
COPY --from=build --chown=nestjs:nodejs /app/apps/api/prisma ./prisma
USER nestjs
EXPOSE 3001
# Source maps map OTel/stack traces back to TypeScript.
CMD ["node", "--enable-source-maps", "dist/main.js"]
# start:instrumented variant — preload the OTel SDK via --import instead of the
# in-process bootstrap:
#   CMD ["node", "--enable-source-maps", "--import", "./dist/instrumentation.js", "dist/main.js"]
