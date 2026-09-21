-- Runs once, automatically, the first time the postgres container
-- initializes a fresh data volume (standard docker-entrypoint-initdb.d
-- behavior — it does NOT re-run on an existing volume).
--
-- WHY THIS EXISTS: the official postgres image makes POSTGRES_USER
-- (here, "serenemed") the cluster's bootstrap SUPERUSER. Postgres
-- superusers always bypass Row-Level Security, no matter how a table's
-- policies are configured (even with FORCE ROW LEVEL SECURITY) — see
-- https://www.postgresql.org/docs/current/ddl-rowsecurity.html. That
-- means the RLS tenant-isolation policies in
-- prisma/migrations/20260921000000_init/migration.sql do nothing at all
-- for a connection using the superuser role.
--
-- So the app must NOT connect as "serenemed" at runtime. This script
-- creates a second, ordinary (non-superuser, NOBYPASSRLS) role,
-- "serenemed_app", that the application's DATABASE_URL uses. The
-- superuser role is kept only for running migrations (DIRECT_DATABASE_URL
-- / Prisma's `directUrl`), since schema changes and RLS management
-- naturally need elevated privileges, and Prisma always uses `directUrl`
-- for `migrate` commands but `url` for the query engine at runtime — see
-- docs/architecture/security.md#row-level-security.
--
-- ALTER DEFAULT PRIVILEGES here means tables created LATER by the
-- superuser role (i.e. by `prisma migrate`, which runs after this
-- script) automatically grant the app role CRUD rights — no manual
-- GRANT needed after every future migration.
--
-- Known imperfection: this also grants the app role CRUD on Prisma's own
-- `_prisma_migrations` bookkeeping table (it's just "every table this
-- role creates"). That's not a real exposure — that table holds
-- migration history, not application data — but it's not least-privilege
-- either; narrowing it further wasn't worth the added complexity here.

DO
$$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'serenemed_app') THEN
    CREATE ROLE serenemed_app WITH LOGIN PASSWORD 'serenemed_app' NOSUPERUSER NOBYPASSRLS;
  END IF;
END
$$;

GRANT CONNECT ON DATABASE serenemed TO serenemed_app;
GRANT USAGE ON SCHEMA public TO serenemed_app;

ALTER DEFAULT PRIVILEGES FOR ROLE serenemed IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO serenemed_app;
