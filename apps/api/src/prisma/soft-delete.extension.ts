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

interface SoftDeletableDelegate {
  update(args: { where: unknown; data: { deletedAt: Date } }): Promise<unknown>;
  updateMany(args: { where: unknown; data: { deletedAt: Date } }): Promise<unknown>;
}

function getSoftDeletableDelegate(client: unknown, modelName: string): SoftDeletableDelegate {
  const propertyName = modelName.charAt(0).toLowerCase() + modelName.slice(1);
  const delegate = (client as Record<string, SoftDeletableDelegate>)[propertyName];
  if (!delegate) {
    // Only reachable if a model is added to softDeleteModelNames whose
    // client property name doesn't match this camelCase conversion —
    // i.e. a bug here, not a runtime/data condition.
    throw new Error(`No Prisma client delegate found for model "${modelName}".`);
  }
  return delegate;
}

/**
 * Prisma Client extension applied in PrismaService. For every model with
 * a `deletedAt` field:
 *
 * - `findMany` / `findFirst` / `count` exclude soft-deleted rows by
 *   default (`deletedAt: null`). A caller that explicitly sets
 *   `deletedAt` in its own `where` overrides this — e.g. pass
 *   `{ deletedAt: { not: null } }` to list only deleted rows.
 * - `delete` / `deleteMany` are rewritten into `update` / `updateMany`
 *   that stamp `deletedAt`, never issuing a real `DELETE`.
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
          async delete({ model, args, query }) {
            if (!softDeleteModelNames.has(model)) {
              return query(args);
            }
            return getSoftDeletableDelegate(client, model).update({
              where: args.where,
              data: { deletedAt: new Date() },
            });
          },
          async deleteMany({ model, args, query }) {
            if (!softDeleteModelNames.has(model)) {
              return query(args);
            }
            return getSoftDeletableDelegate(client, model).updateMany({
              where: args.where,
              data: { deletedAt: new Date() },
            });
          },
        },
      },
    }),
  );
}
