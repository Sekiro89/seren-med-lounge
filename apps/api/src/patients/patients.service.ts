import { Injectable } from '@nestjs/common';
import type { PatientRegistrationInput } from '@serenemed/validation';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class PatientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * OPD registration's most basic step — staff creating a patient
   * record — had no real endpoint until the staff-web dashboard needed
   * one to let a doctor/receptionist book an appointment for someone
   * new. No password is set here: `Patient.passwordHash` stays null,
   * same as every other staff-created patient — patient portal
   * self-registration is a separate, still-open flow (see
   * docs/architecture/open-questions.md#3).
   */
  async register(organizationId: string, actorId: string, input: PatientRegistrationInput) {
    return this.prisma.withTenant(organizationId, async (tx) => {
      const patient = await tx.patient.create({
        data: {
          organizationId,
          firstName: input.firstName,
          lastName: input.lastName,
          dateOfBirth: new Date(input.dateOfBirth),
          phone: input.phone,
          email: input.email,
        },
        // Explicit select — never return passwordHash (even as null),
        // same discipline as UsersService.create's return shape.
        select: {
          id: true,
          firstName: true,
          lastName: true,
          dateOfBirth: true,
          phone: true,
          email: true,
          createdAt: true,
        },
      });

      await this.auditService.record(tx, organizationId, {
        actorType: 'USER',
        actorId,
        action: 'patient.register',
        entityType: 'Patient',
        entityId: patient.id,
        metadata: {},
      });

      return patient;
    });
  }

  /**
   * Staff-facing patient list — for picking who an appointment is for.
   * No pagination/search yet (this app has no real patient volume to
   * need it); add when the dashboard actually needs to scroll past one
   * page, not speculatively now.
   */
  async listForOrganization(organizationId: string) {
    return this.prisma.withTenant(organizationId, (tx) =>
      tx.patient.findMany({
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          phone: true,
          email: true,
          dateOfBirth: true,
        },
      }),
    );
  }

  /**
   * Login-time lookup — same shape as UsersService's equivalent. Takes
   * organizationId explicitly (not from TenantContextService) because
   * there's no tenant context yet at the point login runs.
   */
  async findByOrgAndEmailWithPassword(organizationId: string, email: string) {
    return this.prisma.withTenant(organizationId, (tx) =>
      tx.patient.findFirst({ where: { email } }),
    );
  }

  /**
   * "Me" lookup for an already-authenticated patient — id comes from
   * the verified JWT's `sub`, never from client input, so there's no
   * way to request a different patient's record through this method.
   */
  async findOwnProfile(organizationId: string, patientId: string) {
    return this.prisma.withTenant(organizationId, (tx) =>
      tx.patient.findUnique({
        where: { id: patientId },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          dateOfBirth: true,
          phone: true,
          email: true,
          createdAt: true,
        },
      }),
    );
  }
}
