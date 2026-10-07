import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { QueueStation, QueueStatus, type Encounter, type QueueEntry } from '@prisma/client';
import { canActAtStation, managesWholeQueue, stationsServedBy } from '@serenemed/permissions';
import type { StaffRole } from '@serenemed/types';
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
 * (vitals -> doctor -> lab -> billing -> pharmacy). Each desk sees the
 * stations it serves; the front desk (`queue:manage`) sees them all.
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
    role: StaffRole,
    filter: { date?: string; station?: QueueStation; status?: QueueStatus },
  ) {
    let stations: QueueStation[] | undefined = filter.station ? [filter.station] : undefined;
    if (!managesWholeQueue(role)) {
      const served = stationsServedBy(role) as QueueStation[];
      if (filter.station && !served.includes(filter.station)) {
        throw new ForbiddenException('Insufficient permissions for this operation.');
      }
      stations = filter.station ? [filter.station] : served;
    }

    return this.prisma.withTenant(organizationId, (tx) =>
      tx.queueEntry.findMany({
        where: {
          queueDate: toDbDate(filter.date ?? clinicDateString()),
          station: stations ? { in: stations } : undefined,
          status: filter.status,
        },
        include: {
          patient: { select: { id: true, firstName: true, lastName: true } },
          encounter: {
            select: {
              appointment: { select: { doctor: { select: { id: true, fullName: true } } } },
            },
          },
        },
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
    role: StaffRole,
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
    return this.update(organizationId, actorId, role, entryId, ALLOWED_FROM[action], data);
  }

  /**
   * Hands the patient to the next desk: new station, back to WAITING.
   * Also how a SKIPPED (stepped-away) patient is put back in line. The
   * sender must serve the token's current station; any station may
   * receive it, and its wait clock starts again.
   */
  async move(
    organizationId: string,
    actorId: string,
    role: StaffRole,
    entryId: string,
    station: QueueStation,
  ) {
    return this.update(
      organizationId,
      actorId,
      role,
      entryId,
      [QueueStatus.WAITING, QueueStatus.CALLED, QueueStatus.IN_SERVICE, QueueStatus.SKIPPED],
      { station, status: QueueStatus.WAITING, calledAt: null, waitingSince: new Date() },
    );
  }

  private async update(
    organizationId: string,
    actorId: string,
    role: StaffRole,
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
      if (!canActAtStation(role, entry.station)) {
        throw new ForbiddenException('This token is waiting at a desk you do not work at.');
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
