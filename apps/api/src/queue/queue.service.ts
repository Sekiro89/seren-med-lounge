import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { QueueStation, QueueStatus, type Encounter, type QueueEntry } from '@prisma/client';
import { PrismaService, type ExtendedPrismaClient } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { clinicDateString, toDbDate } from '../common/clinic-time';

/** Which statuses each queue action may start from. */
const ALLOWED_FROM: Record<'call' | 'start' | 'complete' | 'skip', QueueStatus[]> = {
  call: [QueueStatus.WAITING, QueueStatus.CALLED],
  start: [QueueStatus.WAITING, QueueStatus.CALLED],
  complete: [QueueStatus.CALLED, QueueStatus.IN_SERVICE],
  skip: [QueueStatus.WAITING, QueueStatus.CALLED],
};

/**
 * OPD token queue. One QueueEntry per encounter, issued at registration
 * (RegistrationService), numbered per organization per clinic-local
 * day. The patient keeps the same token and moves between stations
 * (vitals -> doctor -> billing -> pharmacy); each desk lists its own
 * station's WAITING entries.
 */
@Injectable()
export class QueueService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Caller's transaction. The advisory lock serializes concurrent token
   * issues for the same org+day so max+1 can't repeat; the
   * (organizationId, queueDate, tokenNumber) unique constraint is the
   * backstop.
   */
  async issueToken(
    tx: ExtendedPrismaClient,
    organizationId: string,
    encounter: Encounter,
    station: QueueStation,
  ): Promise<QueueEntry> {
    const date = clinicDateString();
    const key = `queue-token:${organizationId}:${date}`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
    const { _max } = await tx.queueEntry.aggregate({
      where: { organizationId, queueDate: toDbDate(date) },
      _max: { tokenNumber: true },
    });
    return tx.queueEntry.create({
      data: {
        organizationId,
        clinicId: encounter.clinicId,
        patientId: encounter.patientId,
        encounterId: encounter.id,
        queueDate: toDbDate(date),
        tokenNumber: (_max.tokenNumber ?? 0) + 1,
        station,
      },
    });
  }

  async list(
    organizationId: string,
    filter: { date?: string; station?: QueueStation; status?: QueueStatus },
  ) {
    return this.prisma.withTenant(organizationId, (tx) =>
      tx.queueEntry.findMany({
        where: {
          queueDate: toDbDate(filter.date ?? clinicDateString()),
          station: filter.station,
          status: filter.status,
        },
        include: { patient: { select: { id: true, firstName: true, lastName: true } } },
        orderBy: { tokenNumber: 'asc' },
      }),
    );
  }

  /** Patient-facing: today's token(s) for the signed-in patient. */
  async listTodayForPatient(organizationId: string, patientId: string) {
    return this.prisma.withTenant(organizationId, (tx) =>
      tx.queueEntry.findMany({
        where: { patientId, queueDate: toDbDate(clinicDateString()) },
        select: { id: true, tokenNumber: true, station: true, status: true, queueDate: true },
        orderBy: { tokenNumber: 'asc' },
      }),
    );
  }

  async transition(
    organizationId: string,
    actorId: string,
    entryId: string,
    action: keyof typeof ALLOWED_FROM,
  ) {
    const now = new Date();
    const data: Partial<QueueEntry> = {
      call: { status: QueueStatus.CALLED, calledAt: now },
      start: { status: QueueStatus.IN_SERVICE },
      complete: { status: QueueStatus.COMPLETED, completedAt: now },
      skip: { status: QueueStatus.SKIPPED },
    }[action];
    return this.update(organizationId, actorId, entryId, ALLOWED_FROM[action], data);
  }

  /**
   * Hands the patient to the next desk: new station, back to WAITING.
   * Also how a SKIPPED (stepped-away) patient is put back in line.
   */
  async move(organizationId: string, actorId: string, entryId: string, station: QueueStation) {
    return this.update(
      organizationId,
      actorId,
      entryId,
      [QueueStatus.WAITING, QueueStatus.CALLED, QueueStatus.IN_SERVICE, QueueStatus.SKIPPED],
      { station, status: QueueStatus.WAITING, calledAt: null },
    );
  }

  private async update(
    organizationId: string,
    actorId: string,
    entryId: string,
    allowedFrom: QueueStatus[],
    data: Partial<QueueEntry>,
  ) {
    return this.prisma.withTenant(organizationId, async (tx) => {
      await tx.$queryRaw`SELECT id FROM queue_entries WHERE id = ${entryId} FOR UPDATE`;
      const entry = await tx.queueEntry.findUnique({ where: { id: entryId } });
      if (!entry) {
        throw new NotFoundException('Queue entry not found.');
      }
      if (!allowedFrom.includes(entry.status)) {
        throw new ConflictException(`Not allowed while the token is ${entry.status}.`);
      }

      const updated = await tx.queueEntry.update({ where: { id: entryId }, data });

      await this.auditService.record(tx, organizationId, {
        actorType: 'USER',
        actorId,
        action: 'queue.update',
        entityType: 'QueueEntry',
        entityId: entryId,
        metadata: {
          from: { station: entry.station, status: entry.status },
          to: { station: updated.station, status: updated.status },
        },
      });

      return updated;
    });
  }
}
