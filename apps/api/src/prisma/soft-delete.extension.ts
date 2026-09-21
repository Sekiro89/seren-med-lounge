import { Prisma } from '@prisma/client';

/**
 * Models that carry a `deletedAt` field, discovered from the DMMF at
 * startup — not a hardcoded list. Add `deletedAt DateTime?` to a model in
 * schema.prisma and it is automatically covered by this extension; no
 * other wiring is needed. See the SOFT DELETE CONVENTION note at the top
 * of schema.prisma.
 *
 * AuditLog is deliberately excluded (it has no `deletedAt` field) — an
 * audit trail must never be deletable, soft or otherwise.
 */
const softDeleteModelNames = new Set(
  Prisma.dmmf.datamodel.models
    .filter((model) => model.fields.some((field) => field.name === 'deletedAt'))
    .map((model) => model.name),
);

function toClientPropertyName(modelName: string): string {
  return modelName.charAt(0).toLowerCase() + modelName.slice(1);
}

/**
 * Prisma Client extension applied in PrismaService. For every model with
 * a `deletedAt` field:
 *
 * - `findMany` / `findFirst` / `count` exclude soft-deleted rows by
 *   default (`deletedAt: null`). A caller that explicitly sets
 *   `deletedAt` in its own `where` overrides this — e.g. pass
 *   `{ deletedAt: { not: null } }` to list only deleted rows.
 * - `delete` / `deleteMany` throw instead of running — see the comment
 *   above their handlers below for why this is a hard guard rather than
 *   a transparent rewrite into `update`.
 *
 * `findUnique` / `findUniqueOrThrow` are deliberately NOT filtered — they
 * are most often used for FK/relation lookups where the caller has a
 * specific ID and legitimately needs the row even if soft-deleted (e.g.
 * loading a Clinic referenced by an old Appointment). Callers that need
 * "only if still active" semantics on a unique lookup should check
 * `deletedAt` on the result themselves, or use `findFirst` with the id
 * in `where` instead.
 */
export function softDeleteExtension() {
  return Prisma.defineExtension((client) =>
    client.$extends({
      name: 'soft-delete',
      query: {
        $allModels: {
          async findMany({ model, args, query }) {
            if (softDeleteModelNames.has(model)) {
              args.where = { deletedAt: null, ...args.where };
            }
            return query(args);
          },
          async findFirst({ model, args, query }) {
            if (softDeleteModelNames.has(model)) {
              args.where = { deletedAt: null, ...args.where };
            }
            return query(args);
          },
          async count({ model, args, query }) {
            if (softDeleteModelNames.has(model)) {
              args.where = { deletedAt: null, ...args.where };
            }
            return query(args);
          },
          /**
           * NOT rewritten into an `update`. An earlier version of this
           * extension tried exactly that — calling
           * `client[model].update(...)` using the `client` closed over
           * from `Prisma.defineExtension((client) => ...)` — and it was
           * a real, live bug: that `client` reference is fixed to the
           * top-level client at extension-composition time, not to
           * whatever transaction the surrounding `delete()` call was
           * actually made through. Call `.delete()` from inside
           * `PrismaService.withTenant(...)` (i.e. on RLS-protected
           * tables) and the "rewritten" update ran on a *different*,
           * non-transactional connection with no
           * `app.current_organization_id` set — RLS then silently
           * rejected it and Prisma reported "no record found," which is
           * a confusing failure mode for something that is actually a
           * tenant-isolation bug. Caught by running this against a real
           * Postgres with RLS actually enforced (see
           * docs/architecture/security.md#row-level-security) — it
           * would NOT have been caught by typecheck/build/lint alone.
           *
           * So: fail loudly and immediately instead. Soft-deleting a row
           * is `<model>.update({ where, data: { deletedAt: new Date() } })`,
           * called directly on whatever client/transaction the caller
           * already has — which stays correctly scoped because it's the
           * same `update` operation Prisma always routes correctly,
           * with no client-reference indirection involved.
           */
          async delete({ model, args, query }) {
            if (softDeleteModelNames.has(model)) {
              throw new Error(
                `${model}.delete() is disabled for soft-deletable models. Call ` +
                  `${toClientPropertyName(model)}.update({ where, data: { deletedAt: new Date() } }) ` +
                  'instead, on the same client/transaction you already have — see ' +
                  "soft-delete.extension.ts for why this isn't done automatically.",
              );
            }
            return query(args);
          },
          async deleteMany({ model, args, query }) {
            if (softDeleteModelNames.has(model)) {
              throw new Error(
                `${model}.deleteMany() is disabled for soft-deletable models. Call ` +
                  `${toClientPropertyName(model)}.updateMany({ where, data: { deletedAt: new Date() } }) ` +
                  'instead, on the same client/transaction you already have — see ' +
                  "soft-delete.extension.ts for why this isn't done automatically.",
              );
            }
            return query(args);
          },
        },
      },
    }),
  );
}
