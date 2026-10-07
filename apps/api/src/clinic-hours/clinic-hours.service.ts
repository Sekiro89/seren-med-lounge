import { Injectable } from '@nestjs/common';
import type { SetClinicHoursInput } from '@serenemed/validation';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { clinicDayAndTime } from '../common/clinic-time';

export interface ClinicHoursDay {
  dayOfWeek: number;
  opensAt: string | null;
  closesAt: string | null;
}

export interface ClinicHoursToday {
  isOpen: boolean;
  opensAt: string | null;
  closesAt: string | null;
}

/**
 * The clinic's weekly opening hours (clinic-local HH:MM, dayOfWeek
 * 0 = Sunday). A weekday with no row is closed. Open means
 * opensAt <= now < closesAt in clinic time.
 */
@Injectable()
export class ClinicHoursService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  /** Always seven entries, Sunday first; a closed day has null times. */
  async week(organizationId: string): Promise<ClinicHoursDay[]> {
    const rows = await this.prisma.withTenant(organizationId, (tx) =>
      tx.clinicHour.findMany({ select: { dayOfWeek: true, opensAt: true, closesAt: true } }),
    );
    return Array.from({ length: 7 }, (_, dayOfWeek) => {
      const row = rows.find((r) => r.dayOfWeek === dayOfWeek);
      return { dayOfWeek, opensAt: row?.opensAt ?? null, closesAt: row?.closesAt ?? null };
    });
  }

  async today(organizationId: string, at: Date = new Date()): Promise<ClinicHoursToday> {
    const { dayOfWeek, time } = clinicDayAndTime(at);
    const row = await this.prisma.withTenant(organizationId, (tx) =>
      tx.clinicHour.findFirst({ where: { dayOfWeek } }),
    );
    if (!row) {
      return { isOpen: false, opensAt: null, closesAt: null };
    }
    return {
      isOpen: row.opensAt <= time && time < row.closesAt,
      opensAt: row.opensAt,
      closesAt: row.closesAt,
    };
  }

  /** Replaces the whole week in one transaction. */
  async replaceWeek(
    organizationId: string,
    actorId: string,
    input: SetClinicHoursInput,
  ): Promise<ClinicHoursDay[]> {
    await this.prisma.withTenant(organizationId, async (tx) => {
      await tx.clinicHour.deleteMany({});
      if (input.days.length > 0) {
        await tx.clinicHour.createMany({
          data: input.days.map((d) => ({ organizationId, ...d })),
        });
      }
      await this.auditService.record(tx, organizationId, {
        actorType: 'USER',
        actorId,
        action: 'clinic_hours.update',
        entityType: 'Organization',
        entityId: organizationId,
        metadata: { days: input.days },
      });
    });
    return this.week(organizationId);
  }
}
