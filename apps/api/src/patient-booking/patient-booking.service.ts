import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  AppointmentEntrySource,
  AppointmentStatus,
  ClinicalRecordStatus,
  LabOrderStatus,
  NotificationType,
  StaffRole,
} from '@prisma/client';
import type { PatientBookingInput } from '@serenemed/validation';
import { PrismaService, type ExtendedPrismaClient } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SchedulingService } from '../scheduling/scheduling.service';
import { clinicDateString } from '../common/clinic-time';
import { VIDEO_PROVIDER, type VideoProvider } from '../integrations/video/video-provider.interface';

const DOCTOR_ROLES: StaffRole[] = [StaffRole.JUNIOR_DOCTOR, StaffRole.SENIOR_DOCTOR];
const ACTIVE: AppointmentStatus[] = [AppointmentStatus.REQUESTED, AppointmentStatus.CONFIRMED];

/**
 * Booking rules, in one place so the clinic can tune them later
 * (open-questions.md: per-clinic booking policy).
 */
export const BOOKING_RULES = {
  /** How far ahead a patient may book. */
  maxDaysAhead: 60,
  /** No booking a slot that starts sooner than this. */
  minLeadMinutes: 30,
  /** Upcoming online bookings one patient may hold at once. */
  maxUpcoming: 3,
  /** Cancelling closer to the visit than this needs a call to the clinic. */
  cancelCutoffMinutes: 120,
  /** A video room opens this long before the start, and stays open this long after. */
  videoOpensMinutesBefore: 15,
  videoClosesMinutesAfter: 60,
} as const;

const DAY = 86_400_000;

/**
 * Patient self-service for appointments: pick a doctor, see their free
 * slots, book (at the clinic or by video), cancel, and read what happened
 * at a past visit. Every method is scoped to the signed-in patient's own
 * id from the JWT, never a client-supplied patient id.
 */
@Injectable()
export class PatientBookingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly notifications: NotificationsService,
    private readonly scheduling: SchedulingService,
    @Inject(VIDEO_PROVIDER) private readonly video: VideoProvider,
  ) {}

  /** Active doctors with at least one active availability window. */
  async doctors(organizationId: string) {
    return this.prisma.withTenant(organizationId, async (tx) => {
      const doctors = await tx.user.findMany({
        where: {
          role: { in: DOCTOR_ROLES },
          isActive: true,
          availability: { some: { isActive: true } },
        },
        select: {
          id: true,
          fullName: true,
          role: true,
          availability: {
            where: { isActive: true },
            select: { dayOfWeek: true },
          },
        },
        orderBy: [{ role: 'desc' }, { fullName: 'asc' }],
      });
      return doctors.map(({ availability, ...d }) => ({
        ...d,
        days: [...new Set(availability.map((a) => a.dayOfWeek))].sort(),
      }));
    });
  }

  /** Free, bookable slots for one doctor on one clinic-local date. */
  async slots(organizationId: string, doctorId: string, date: string) {
    this.assertBookableDate(date);
    const earliest = Date.now() + BOOKING_RULES.minLeadMinutes * 60_000;
    return this.prisma.withTenant(organizationId, async (tx) => {
      await this.requireActiveDoctor(tx, doctorId);
      const slots = await this.scheduling.slotsInTx(tx, doctorId, date);
      return slots.filter((s) => s.available && new Date(s.start).getTime() >= earliest);
    });
  }

  async book(organizationId: string, patientId: string, input: PatientBookingInput) {
    const start = new Date(input.scheduledAt);
    const date = clinicDateString(start);
    this.assertBookableDate(date);
    if (start.getTime() < Date.now() + BOOKING_RULES.minLeadMinutes * 60_000) {
      throw new BadRequestException(
        'That time is too soon to book online. Please call the clinic.',
      );
    }

    return this.prisma.withTenant(organizationId, async (tx) => {
      // Serialises bookings for this doctor so two patients can't take the same slot.
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${input.doctorId} FOR UPDATE`;
      await this.requireActiveDoctor(tx, input.doctorId);

      const slot = (await this.scheduling.slotsInTx(tx, input.doctorId, date)).find(
        (s) => new Date(s.start).getTime() === start.getTime(),
      );
      if (!slot) {
        throw new BadRequestException('That is not one of the doctor’s appointment times.');
      }
      if (!slot.available) {
        throw new ConflictException('Sorry, that time was just taken. Please pick another.');
      }

      const upcoming = await tx.appointment.findMany({
        where: {
          patientId,
          deletedAt: null,
          status: { in: ACTIVE },
          scheduledAt: { gte: new Date() },
        },
        select: { scheduledAt: true },
      });
      if (upcoming.length >= BOOKING_RULES.maxUpcoming) {
        throw new ConflictException(
          `You already have ${BOOKING_RULES.maxUpcoming} upcoming visits. Cancel one, or call the clinic.`,
        );
      }
      const slotEnd = new Date(slot.end).getTime();
      if (
        upcoming.some(
          (a) => a.scheduledAt.getTime() >= start.getTime() && a.scheduledAt.getTime() < slotEnd,
        )
      ) {
        throw new ConflictException('You already have a visit booked at that time.');
      }

      const video = input.mode === 'VIDEO';
      const appointment = await tx.appointment.create({
        data: {
          organizationId,
          patientId,
          doctorId: input.doctorId,
          entrySource: video
            ? AppointmentEntrySource.VIDEO_CONSULTATION
            : AppointmentEntrySource.ONLINE_BOOKING,
          // A free slot from the doctor's own schedule needs no further approval.
          status: AppointmentStatus.CONFIRMED,
          scheduledAt: start,
          notes: input.reason || undefined,
        },
        include: { doctor: { select: { fullName: true } } },
      });

      await this.notifications.notifyInTx(tx, organizationId, {
        type: NotificationType.GENERAL,
        recipient: { role: StaffRole.RECEPTION },
        title: video ? 'New video consultation booked online' : 'New appointment booked online',
        entityType: 'Appointment',
        entityId: appointment.id,
      });
      await this.auditService.record(tx, organizationId, {
        actorType: 'PATIENT',
        actorId: patientId,
        action: 'appointment.book_online',
        entityType: 'Appointment',
        entityId: appointment.id,
        // No free text (the reason stays on the appointment only).
        metadata: { doctorId: input.doctorId, mode: input.mode },
      });
      return appointment;
    });
  }

  async cancel(organizationId: string, patientId: string, appointmentId: string) {
    return this.prisma.withTenant(organizationId, async (tx) => {
      await tx.$queryRaw`SELECT id FROM appointments WHERE id = ${appointmentId} FOR UPDATE`;
      const appointment = await this.requireOwn(tx, patientId, appointmentId);
      if (!ACTIVE.includes(appointment.status)) {
        throw new ConflictException('This visit can no longer be cancelled here.');
      }
      if (
        appointment.scheduledAt.getTime() - Date.now() <
        BOOKING_RULES.cancelCutoffMinutes * 60_000
      ) {
        throw new ConflictException(
          'Your visit is less than 2 hours away. Please call the clinic to cancel.',
        );
      }
      const cancelled = await tx.appointment.update({
        where: { id: appointmentId },
        data: { status: AppointmentStatus.CANCELLED },
      });
      await this.notifications.notifyInTx(tx, organizationId, {
        type: NotificationType.GENERAL,
        recipient: { role: StaffRole.RECEPTION },
        title: 'A patient cancelled an appointment online',
        entityType: 'Appointment',
        entityId: appointmentId,
      });
      await this.auditService.record(tx, organizationId, {
        actorType: 'PATIENT',
        actorId: patientId,
        action: 'appointment.cancel_online',
        entityType: 'Appointment',
        entityId: appointmentId,
        metadata: { from: appointment.status },
      });
      return cancelled;
    });
  }

  /**
   * One visit as the patient sees it: the appointment, and if it took
   * place, the signed-off diagnoses, medicines, tests and bills from it.
   * Draft clinical records never appear (same rule as /patients/me/diagnoses).
   */
  async visit(organizationId: string, patientId: string, appointmentId: string) {
    return this.prisma.withTenant(organizationId, async (tx) => {
      await this.requireOwn(tx, patientId, appointmentId);
      return tx.appointment.findUnique({
        where: { id: appointmentId },
        select: {
          id: true,
          status: true,
          entrySource: true,
          scheduledAt: true,
          notes: true,
          doctor: { select: { fullName: true } },
          encounter: {
            select: {
              id: true,
              status: true,
              startedAt: true,
              endedAt: true,
              diagnoses: {
                where: {
                  deletedAt: null,
                  status: { in: [ClinicalRecordStatus.FINALIZED, ClinicalRecordStatus.AMENDED] },
                },
                select: {
                  id: true,
                  versions: {
                    orderBy: { versionNumber: 'desc' },
                    take: 1,
                    select: { icdCode: true, description: true },
                  },
                },
              },
              prescriptions: {
                where: { deletedAt: null },
                select: { id: true, status: true, createdAt: true, items: true },
              },
              labOrders: {
                where: { deletedAt: null, status: { not: LabOrderStatus.CANCELLED } },
                select: {
                  id: true,
                  createdAt: true,
                  items: { select: { id: true, testName: true, results: true } },
                },
              },
              invoices: {
                where: { deletedAt: null },
                select: {
                  id: true,
                  number: true,
                  status: true,
                  totalMinor: true,
                  paidMinor: true,
                },
              },
            },
          },
        },
      });
    });
  }

  /**
   * The patient's join link for a video consultation, only around the
   * appointment time. While no video provider is contracted the stub is
   * bound, and this says so instead of returning a link that goes nowhere.
   */
  async videoRoom(organizationId: string, patientId: string, appointmentId: string) {
    const appointment = await this.prisma.withTenant(organizationId, (tx) =>
      this.requireOwn(tx, patientId, appointmentId),
    );
    if (appointment.entrySource !== AppointmentEntrySource.VIDEO_CONSULTATION) {
      throw new BadRequestException('This visit is at the clinic, not by video.');
    }
    if (
      !(
        [
          AppointmentStatus.CONFIRMED,
          AppointmentStatus.CHECKED_IN,
          AppointmentStatus.IN_PROGRESS,
        ] as AppointmentStatus[]
      ).includes(appointment.status)
    ) {
      throw new ConflictException('This video consultation is not open.');
    }
    const start = appointment.scheduledAt.getTime();
    const now = Date.now();
    if (now < start - BOOKING_RULES.videoOpensMinutesBefore * 60_000) {
      throw new ConflictException(
        `You can join from ${BOOKING_RULES.videoOpensMinutesBefore} minutes before your appointment.`,
      );
    }
    if (now > start + BOOKING_RULES.videoClosesMinutesAfter * 60_000) {
      throw new ConflictException('This video consultation has ended.');
    }
    if (!this.video.live) {
      throw new ServiceUnavailableException(
        'Video calls are not switched on yet. The clinic will phone you at your appointment time.',
      );
    }
    const room = await this.video.createRoom({
      appointmentId,
      expiresInMinutes: BOOKING_RULES.videoClosesMinutesAfter,
    });
    return { joinUrl: room.patientJoinUrl };
  }

  private assertBookableDate(date: string) {
    const today = clinicDateString();
    const last = clinicDateString(new Date(Date.now() + BOOKING_RULES.maxDaysAhead * DAY));
    if (date < today || date > last) {
      throw new BadRequestException(
        `Online booking is open for the next ${BOOKING_RULES.maxDaysAhead} days.`,
      );
    }
  }

  private async requireActiveDoctor(tx: ExtendedPrismaClient, doctorId: string) {
    const doctor = await tx.user.findUnique({ where: { id: doctorId } });
    if (!doctor || !doctor.isActive || !DOCTOR_ROLES.includes(doctor.role)) {
      throw new NotFoundException('Doctor not found.');
    }
  }

  private async requireOwn(tx: ExtendedPrismaClient, patientId: string, appointmentId: string) {
    const appointment = await tx.appointment.findUnique({ where: { id: appointmentId } });
    // Someone else's appointment is indistinguishable from a missing one.
    if (!appointment || appointment.deletedAt || appointment.patientId !== patientId) {
      throw new NotFoundException('Appointment not found.');
    }
    return appointment;
  }
}
