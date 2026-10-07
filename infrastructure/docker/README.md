# infrastructure/docker/

- `postgres-init/01-app-role.sql` — creates the non-superuser
  `serenemed_app` role on a fresh Postgres volume. Mounted into
  `docker-entrypoint-initdb.d` by both the root `docker-compose.yml`
  (local dev) and `../compose/docker-compose.prod.yml` (production).

The production Dockerfiles live next to the apps they build
(`apps/api/Dockerfile`, `apps/staff-web/Dockerfile`,
`apps/patient-web/Dockerfile`), because each build needs the whole
pnpm workspace as its context. Local development still uses the root
`docker-compose.yml` (Postgres + Redis only) with the apps run via
`pnpm dev:*`.
