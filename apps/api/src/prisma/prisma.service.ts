import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { softDeleteExtension } from './soft-delete.extension';

function createExtendedClient() {
  return new PrismaClient().$extends(softDeleteExtension());
}

export type ExtendedPrismaClient = ReturnType<typeof createExtendedClient>;

/**
 * The only place in the app that constructs a Prisma Client. Every query
 * goes through `client`, which has the soft-delete extension applied —
 * see soft-delete.extension.ts. Domain services inject PrismaService and
 * call e.g. `this.prisma.client.patient.findMany(...)`.
 *
 * A plain `class X extends PrismaClient` (the usual NestJS recipe) can't
 * be used here because `$extends()` returns a new client with a distinct
 * type — it can't be "applied to `this`" inside a subclass constructor.
 * Holding the extended client as a property is the pattern Prisma's own
 * docs recommend for extensions + NestJS.
 */
@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  readonly client: ExtendedPrismaClient = createExtendedClient();

  async onModuleInit() {
    await this.client.$connect();
  }

  async onModuleDestroy() {
    await this.client.$disconnect();
  }

  /**
   * Runs `work` inside a transaction with the `app.current_organization_id`
   * Postgres session variable set, which the Row-Level Security policies
   * on clinics/users/patients (see prisma/migrations/20260921000000_init)
   * check against. This is how tenant isolation is actually enforced at
   * the database, not just in application `where` clauses.
   *
   * `set_config(..., true)` — not `SET LOCAL app.current_organization_id
   * = ${organizationId}` — because `set_config` is an ordinary SQL
   * function call and so takes `organizationId` as a real bound
   * parameter; `SET LOCAL` would require string-interpolating it into
   * the statement text. The `true` third argument makes it
   * transaction-local: it's automatically unset when the transaction
   * commits or rolls back, so it can never leak onto a pooled connection
   * reused by a later, differently-scoped request.
   *
   * Every query that touches an RLS-protected table MUST go through
   * this (i.e. use the `tx` passed into `work`, not `this.client`
   * directly) — a query issued outside of it runs with the session
   * variable unset, and the policies fail closed (see the migration's
   * comments), returning zero rows rather than throwing. That fails
   * safe, but it means "my query returns nothing" during development
   * usually means "you forgot withTenant", not a data problem.
   *
   * NOT YET CALLED ANYWHERE: nothing populates a request's
   * organizationId yet because auth isn't wired (AuthService.login is a
   * stub) — see docs/architecture/open-questions.md. Once it is, a
   * guard/interceptor reading `req.user.organizationId` should be the
   * only thing that calls this, wrapping each request's handler.
   */
  async withTenant<T>(
    organizationId: string,
    work: (tx: ExtendedPrismaClient) => Promise<T>,
  ): Promise<T> {
    return this.client.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_organization_id', ${organizationId}, true)`;
      return work(tx as unknown as ExtendedPrismaClient);
    });
  }
}
