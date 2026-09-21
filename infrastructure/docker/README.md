# infrastructure/docker/

Reserved for Dockerfiles (API/frontend production images) once the
system is ready to containerize for deployment. Local development uses
the root `docker-compose.yml` (Postgres + Redis only) — application
processes run directly via `pnpm dev:*`.
