# ============================================================
# Focussive Backend — Dockerfile (monorepo-aware)
# Build context: repo root (so shared/ is accessible)
# ============================================================

# ── Stage 1: Build ──────────────────────────────────────────
FROM node:22-alpine AS builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy workspace manifests first (better layer caching)
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY tsconfig.base.json ./
COPY packages/shared/package.json          ./packages/shared/
COPY packages/backend/package.json         ./packages/backend/

# Install ALL dependencies (including devDependencies for build)
RUN pnpm install --frozen-lockfile

# Copy source
COPY packages/shared/  ./packages/shared/
COPY packages/backend/ ./packages/backend/

# Build shared first, then backend
RUN pnpm --filter @focussive/shared build
RUN pnpm --filter @focussive/backend build

# ── Stage 2: Runtime ────────────────────────────────────────
FROM node:22-alpine AS runner

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy workspace manifests
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY tsconfig.base.json ./
COPY packages/shared/package.json          ./packages/shared/
COPY packages/backend/package.json         ./packages/backend/

# Install production-only dependencies
RUN pnpm install --frozen-lockfile --prod

# Copy compiled output from builder
COPY --from=builder /app/packages/shared/dist  ./packages/shared/dist
COPY --from=builder /app/packages/backend/dist ./packages/backend/dist

ENV NODE_ENV=production
EXPOSE 8080

# Fly.io maps external 443/80 → internal 8080 by default
CMD ["node", "packages/backend/dist/server.js"]
