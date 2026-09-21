# Production image for apps/api. Build from the REPO ROOT, not this
# directory, because it needs the whole pnpm workspace (the app depends
# on packages/* via `workspace:*`):
#
#   docker build -f apps/api/Dockerfile -t serenemed-api .
#
# This does NOT run database migrations — that's a separate, deliberate
# step (see docs/architecture/deployment.md), run once against
# DIRECT_DATABASE_URL (the superuser role) before new instances of this
# image start serving traffic. Baking it into this image's startup would
# mean every running replica needs superuser DB credentials just to
# boot, which is more exposure than the migration step needs.

FROM node:20-alpine AS base
RUN corepack enable

# --- deps + build -----------------------------------------------------
# Installs the full workspace (incl. devDependencies — needed for `nest
# build`/`tsc`/`prisma generate`), builds every package the api depends
# on plus the api itself, then hands off to `pnpm deploy`.
FROM base AS builder
WORKDIR /app

COPY . .
RUN pnpm install --frozen-lockfile

RUN pnpm --filter api run prisma:generate
RUN pnpm --filter "./packages/*" run build
RUN pnpm --filter api run build

# `pnpm deploy` (not `pnpm prune --prod`, which silently no-ops on a
# workspace inside a non-interactive `docker build` — it prints an
# interactive confirmation prompt and skips the actual work when nothing
# answers it, so devDependencies like jest/typescript/prisma's CLI stay
# in the image with the pruned size never actually decreasing) is pnpm's
# purpose-built tool for producing a single self-contained,
# prod-dependencies-only deployable from one package in a workspace —
# workspace:* deps (like @serenemed/validation) are resolved to real
# copied files, not symlinks, so the result has no dependency on the
# rest of the monorepo being present.
RUN pnpm --filter api deploy --prod /prod/api

# `pnpm deploy` reinstalls @prisma/client into its own fresh virtual
# store as part of building /prod/api, which re-triggers @prisma/client's
# postinstall and resets the already-generated client from the
# `prisma:generate` step above back to its uninitialized placeholder
# ("@prisma/client did not initialize yet") — confirmed by actually
# running the built image and hitting that exact error before this line
# was added. Regenerating against the deployed schema, using the CLI
# that's still here in the builder (it's a devDependency, so it won't
# exist in /prod/api itself), fixes it back up in place.
RUN pnpm --filter api exec -- prisma generate --schema=/prod/api/prisma/schema.prisma

# --- runtime ------------------------------------------------------------
FROM base AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /prod/api /app

EXPOSE 4000

# NOT dist/main.js: `nest build` has no rootDir set in tsconfig.build.json
# (it's inferred from the union of src/ and scripts/), so the compiled
# output nests under dist/src/, not dist/ directly — confirmed by
# actually running this image; package.json's own start:prod script had
# the same wrong path and had apparently never been run for real either.
CMD ["node", "dist/src/main.js"]
