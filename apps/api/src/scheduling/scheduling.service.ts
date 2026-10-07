import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AppointmentStatus, StaffRole } from '@prisma/client';
import type { CreateDoctorAvailabilityInput } from '@serenemed/validation';
import { PrismaService, type ExtendedPrismaClient } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { clinicDayRange } from '../common/clinic-time';

const DOCTOR_ROLES: StaffRole[] = [StaffRole.JUNIOR_DOCTOR, StaffRole.SENIOR_DOCTOR];
/** Appointments in these states free their slot again. */
const NON_BLOCKING: AppointmentStatus[] = [AppointmentStatus.CANCELLED, AppointmentStatus.NO_SHOW];

export interface Slot {
  start: string;
  end: string;
  available: boolean;
}

function minutesOf(time: string): number {
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
}

/**
 * Weekly recurring availability windows per doctor (clinic-local
 * HH:MM, dayOfWeek 0 = Sunday) and the bookable slots they produce for a
 * date. Slots are computed, never stored: a slot is unavailable when an
 * appointment for that doctor (not CANCELLED/NO_SHOW) is scheduled inside
 * it. Two active windows for the same doctor and weekday may not
 * overlap, regardless of clinic — a doctor can't be in two places.
 */
@Injectable()
export class SchedulingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async createAvailability(
    organizationId: string,
    actorId: string,
    input: CreateDoctorAvailabilityInput,
  ) {
    return this.prisma.withTenant(organizationId, async (tx) => {
      // Serializes concurrent window creation for the same doctor so the
      // overlap check below can't race.
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${input.doctorId} FOR UPDATE`;
      const doctor = await tx.user.findUnique({ where: { id: input.doctorId } });
      if (!doctor || !doctor.isActive || !DOCTOR_ROLES.includes(doctor.role)) {
        throw new BadRequestException('doctorId must be an active doctor in this organization.');
      }
      if (input.clinicId) {
        const clinic = await tx.clinic.findFirst({
          where: { id: input.clinicId, organizationId },
        });
        if (!clinic) {
          throw new BadRequestException('clinicId is not a clinic in this organization.');
        }
      }

      const overlapping = await tx.doctorAvailability.findFirst({
        where: {
          doctorId: input.doctorId,
          dayOfWeek: input.dayOfWeek,
          isActive: true,
          // HH:MM strings compare correctly lexicographically.
          startTime: { lt: input.endTime },
          endTime: { gt: input.startTime },
        },
      });
      if (overlapping) {
        throw new ConflictException(
          'This window overlaps an existing active availability window for the doctor.',
        );
      }

      const availability = await tx.doctorAvailability.create({
        data: {
          organizationId,
          doctorId: input.doctorId,
          clinicId: input.clinicId,
          dayOfWeek: input.dayOfWeek,
          startTime: input.startTime,
          endTime: input.endTime,
          slotMinutes: input.slotMinutes,
        },
      });

      await this.auditService.record(tx, organizationId, {
        actorType: 'USER',
        actorId,
        action: 'doctor_availability.create',
        entityType: 'DoctorAvailability',
        entityId: availability.id,
        metadata: {
          doctorId: availability.doctorId,
          clinicId: availability.clinicId,
          dayOfWeek: availability.dayOfWeek,
          startTime: availability.startTime,
          endTime: availability.endTime,
          slotMinutes: availability.slotMinutes,
        },
      });
      return availability;
    });
  }

  async listAvailability(
    organizationId: string,
    filter: { doctorId?: string; includeInactive: boolean },
  ) {
    return this.prisma.withTenant(organizationId, (tx) =>
      tx.doctorAvailability.findMany({
        where: {
          doctorId: filter.doctorId,
          isActive: filter.includeInactive ? undefined : true,
        },
        include: { doctor: { select: { id: true, fullName: true, role: true } } },
        orderBy: [{ doctorId: 'asc' }, { dayOfWeek: 'asc' }, { startTime: 'asc' }],
        take: 500,
      }),
    );
  }

  async deactivateAvailability(organizationId: string, actorId: string, id: string) {
    return this.prisma.withTenant(organizationId, async (tx) => {
      await tx.$queryRaw`SELECT id FROM doctor_availability WHERE id = ${id} FOR UPDATE`;
      const existing = await tx.doctorAvailability.findUnique({ where: { id } });
      if (!existing) {
        throw new NotFoundException('Availability window not found.');
      }
      if (!existing.isActive) {
        throw new ConflictException('Availability window is already inactive.');
      }
      const availability = await tx.doctorAvailability.update({
        where: { id },
        data: { isActive: false },
      });
      await this.auditService.record(tx, organizationId, {
        actorType: 'USER',
        actorId,
        action: 'doctor_availability.deactivate',
        entityType: 'DoctorAvailability',
        entityId: id,
        metadata: { doctorId: existing.doctorId, dayOfWeek: existing.dayOfWeek },
      });
      return availability;
    });
  }

  /** `date` is a clinic-local YYYY-MM-DD (already validated by the controller). */
  async slots(organizationId: string, doctorId: string, date: string): Promise<Slot[]> {
    return this.prisma.withTenant(organizationId, (tx) => this.slotsInTx(tx, doctorId, date));
  }

  /**
   * The caller's transaction, so a booking can recompute the slots under
   * its own lock and only then create the appointment
   * (PatientBookingService.book).
   */
  async slotsInTx(tx: ExtendedPrismaClient, doctorId: string, date: string): Promise<Slot[]> {
    const doctor = await tx.user.findUnique({ where: { id: doctorId } });
    if (!doctor || !DOCTOR_ROLES.includes(doctor.role)) {
      throw new NotFoundException('Doctor not found.');
    }

    // The weekday of a calendar date doesn't depend on timezone.
    const dayOfWeek = new Date(`${date}T00:00:00.000Z`).getUTCDay();
    const windows = await tx.doctorAvailability.findMany({
      where: { doctorId, dayOfWeek, isActive: true },
      orderBy: { startTime: 'asc' },
    });
    if (windows.length === 0) {
      return [];
    }

    const { from, to } = clinicDayRange(date);
    const appointments = await tx.appointment.findMany({
      where: {
        doctorId,
        deletedAt: null,
        status: { notIn: NON_BLOCKING },
        scheduledAt: { gte: from, lt: to },
      },
      select: { scheduledAt: true },
    });
    const booked = appointments.map((a) => a.scheduledAt.getTime());

    const slots: Slot[] = [];
    for (const window of windows) {
      const endMinute = minutesOf(window.endTime);
      for (
        let minute = minutesOf(window.startTime);
        minute + window.slotMinutes <= endMinute;
        minute += window.slotMinutes
      ) {
        const start = from.getTime() + minute * 60_000;
        const end = start + window.slotMinutes * 60_000;
        slots.push({
          start: new Date(start).toISOString(),
          end: new Date(end).toISOString(),
          available: !booked.some((t) => t >= start && t < end),
        });
      }
    }
    return slots;
  }
}
