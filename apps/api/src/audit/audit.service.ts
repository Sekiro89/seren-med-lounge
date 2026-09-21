import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface RecordAuditEntryInput {
  actorType: 'USER' | 'PATIENT' | 'SYSTEM';
  actorId?: string;
  action: string;
  entityType: string;
  entityId: string;
  metadata?: Record<string, unknown>;
}

/**
 * Minimal, real implementation — proves AuditLog's organizationId/RLS
 * addition is load-bearing, not just a schema change nobody calls. Other
 * modules should inject this and call `record()` when they gain a real
 * write path worth auditing; there isn't one yet (no module has a real
 * mutation beyond `users`, which doesn't call this — not asked for
 * here). No delete method: AuditLog has no `deletedAt` and its
 * `.delete()`/`.deleteMany()` are real (not soft) — see
 * soft-delete.extension.ts — but nothing should be calling them on an
 * audit trail regardless.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(organizationId: string, entry: RecordAuditEntryInput) {
    return this.prisma.withTenant(organizationId, (tx) =>
      tx.auditLog.create({
        data: {
          organizationId,
          actorType: entry.actorType,
          actorId: entry.actorId,
          action: entry.action,
          entityType: entry.entityType,
          entityId: entry.entityId,
          metadata: entry.metadata,
        },
      }),
    );
  }

  async listForOrganization(organizationId: string) {
    return this.prisma.withTenant(organizationId, (tx) =>
      tx.auditLog.findMany({ orderBy: { createdAt: 'desc' } }),
    );
  }
}
