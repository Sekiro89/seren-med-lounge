# Production image for apps/staff-web. Build from the REPO ROOT, not
# this directory — it needs the whole pnpm workspace (this app depends
# on packages/* via `workspace:*`):
#
#   docker build -f apps/staff-web/Dockerfile \
#     --build-arg NEXT_PUBLIC_API_URL=https://api.example.com \
#     -t serenemed-staff-web .
#
# NEXT_PUBLIC_API_URL must be passed as a build arg, not a runtime env
# var — Next.js inlines NEXT_PUBLIC_* values into the client bundle
# during `next build`, so it has to be known before that step runs, not
# when the container later starts.

FROM node:20-alpine AS base
RUN corepack enable

FROM base AS builder
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile

# Same reason as apps/api/Dockerfile: staff-web imports @serenemed/*
# packages by name (workspace symlink), resolved via each package's
# compiled dist/, which doesn't exist until this runs.
RUN pnpm --filter "./packages/*" run build

ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN pnpm --filter staff-web run build

# --- runtime ------------------------------------------------------------
FROM base AS runtime
WORKDIR /app
ENV NODE_ENV=production

# next.config.ts sets `output: 'standalone'` (+ `outputFileTracingRoot`
# pointed at the monorepo root, since Next's file tracing otherwise only
# looks inside apps/staff-web/ and misses the workspace packages it
# needs). In this monorepo the traced output nests under apps/staff-web/
# within .next/standalone/ — confirmed by actually inspecting the build
# output (same structure as apps/patient-web/Dockerfile, verified there
# first) — rather than sitting at its root, which is what a
# single-package Next.js project would produce. The `public` and
# `.next/static` folders aren't included in `standalone` by design
# (Next's own docs: meant to be served by a CDN instead) — copied in by
# hand here since there's no CDN in front of this yet.
COPY --from=builder /app/apps/staff-web/.next/standalone ./
COPY --from=builder /app/apps/staff-web/public ./apps/staff-web/public
COPY --from=builder /app/apps/staff-web/.next/static ./apps/staff-web/.next/static

WORKDIR /app/apps/staff-web
# HOSTNAME=0.0.0.0: server.js defaults to localhost, which isn't
# reachable from outside the container.
ENV PORT=3001 HOSTNAME=0.0.0.0
EXPOSE 3001

CMD ["node", "server.js"]
