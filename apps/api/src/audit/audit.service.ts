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
}
