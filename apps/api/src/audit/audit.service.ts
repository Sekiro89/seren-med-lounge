import { Injectable } from '@nestjs/common';
import { PrismaService, type ExtendedPrismaClient } from '../prisma/prisma.service';

export interface RecordAuditEntryInput {
  actorType: 'USER' | 'PATIENT' | 'SYSTEM';
  actorId?: string;
  action: string;
  entityType: string;
  entityId: string;
  metadata?: Record<string, unknown>;
}

/**
 * Real callers as of the clinic journey spine: UsersService.create,
 * AppointmentsService.checkIn, VitalsService.record, and every
 * ClinicalNotesService mutation — see each for what's logged and why.
 * No delete method: AuditLog has no `deletedAt` and its
 * `.delete()`/`.deleteMany()` are real (not soft) — see
 * soft-delete.extension.ts — but nothing should be calling them on an
 * audit trail regardless.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Takes the caller's own `tx` (from their `withTenant` call)
   * deliberately, rather than opening a separate transaction itself —
   * the audit entry needs to commit or roll back atomically with the
   * action it's recording, not as an independent write that could
   * succeed (or fail) on its own and leave the two out of sync.
   */
  async record(tx: ExtendedPrismaClient, organizationId: string, entry: RecordAuditEntryInput) {
    return tx.auditLog.create({
      data: {
        organizationId,
        actorType: entry.actorType,
        actorId: entry.actorId,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        metadata: entry.metadata,
      },
    });
  }

  async listForOrganization(organizationId: string) {
    return this.prisma.withTenant(organizationId, (tx) =>
      tx.auditLog.findMany({ orderBy: { createdAt: 'desc' } }),
    );
  }

  /**
   * The audit log screen's query: newest first, filterable, paged with a
   * `before` cursor (the createdAt of the last row you already have), and
   * each row carries the actor's name so the page doesn't have to look
   * anyone up. `metadata` is ids, statuses and field names only by the
   * project's audit rule; no clinical text and no secrets are ever put there.
   */
  async search(
    organizationId: string,
    filter: {
      action?: string;
      entityType?: string;
      actorId?: string;
      before?: Date;
      limit: number;
    },
  ) {
    return this.prisma.withTenant(organizationId, async (tx) => {
      const rows = await tx.auditLog.findMany({
        where: {
          action: filter.action ? { startsWith: filter.action } : undefined,
          entityType: filter.entityType,
          actorId: filter.actorId,
          createdAt: filter.before ? { lt: filter.before } : undefined,
        },
        orderBy: { createdAt: 'desc' },
        take: filter.limit + 1,
      });
      const page = rows.slice(0, filter.limit);

      const userIds = [
        ...new Set(page.filter((r) => r.actorType === 'USER' && r.actorId).map((r) => r.actorId!)),
      ];
      const users = userIds.length
        ? await tx.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, fullName: true, role: true },
          })
        : [];
      const byId = new Map(users.map((u) => [u.id, u]));

      return {
        items: page.map((r) => ({
          id: r.id,
          createdAt: r.createdAt,
          actorType: r.actorType,
          actorId: r.actorId,
          actorName: r.actorId ? (byId.get(r.actorId)?.fullName ?? null) : null,
          actorRole: r.actorId ? (byId.get(r.actorId)?.role ?? null) : null,
          action: r.action,
          entityType: r.entityType,
          entityId: r.entityId,
          metadata: r.metadata,
        })),
        hasMore: rows.length > filter.limit,
      };
    });
  }
}
