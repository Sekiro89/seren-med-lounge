import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AppointmentStatus, EncounterStatus } from '@prisma/client';
import type { CreateAppointmentInput } from '@serenemed/validation';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AppointmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(organizationId: string, input: CreateAppointmentInput) {
    return this.prisma.withTenant(organizationId, (tx) =>
      tx.appointment.create({
        data: {
          organizationId,
          clinicId: input.clinicId,
          patientId: input.patientId,
          entrySource: input.entrySource,
          scheduledAt: new Date(input.scheduledAt),
          notes: input.notes,
        },
      }),
    );
  }

  async listForOrganization(organizationId: string) {
    return this.prisma.withTenant(organizationId, (tx) =>
      tx.appointment.findMany({ orderBy: { scheduledAt: 'desc' } }),
    );
  }

  /**
   * The multi-table transaction proving the pattern: check-in updates
   * the Appointment's status AND creates its Encounter atomically — a
   * crash or error partway through leaves neither change applied, not
   * a checked-in appointment with no encounter (or vice versa). Both
   * writes go through the same `tx` from one `withTenant` call, so
   * they're the same Postgres transaction, not two separate ones.
   */
  async checkIn(organizationId: string, appointmentId: string) {
    return this.prisma.withTenant(organizationId, async (tx) => {
      const appointment = await tx.appointment.findUnique({ where: { id: appointmentId } });
      if (!appointment) {
        throw new NotFoundException('Appointment not found.');
      }
      if (
        appointment.status !== AppointmentStatus.REQUESTED &&
        appointment.status !== AppointmentStatus.CONFIRMED
      ) {
        throw new ConflictException(
          `Cannot check in an appointment with status ${appointment.status}.`,
        );
      }

      // Sequential, not Promise.all — an interactive transaction's `tx`
      // is bound to one underlying connection; issuing both writes
      // concurrently on the same handle isn't a safe pattern even
      // though they're independent rows.
      await tx.appointment.update({
        where: { id: appointmentId },
        data: { status: AppointmentStatus.CHECKED_IN },
      });
      const encounter = await tx.encounter.create({
        data: {
          organizationId,
          clinicId: appointment.clinicId,
          patientId: appointment.patientId,
          appointmentId: appointment.id,
          status: EncounterStatus.OPEN,
        },
      });

      return encounter;
    });
  }
}
