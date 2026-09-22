import { ConflictException, Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import type { PatientRegistrationInput, PatientSignupInput } from '@serenemed/validation';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

// Matches UsersService's convention (apps/api/src/users/users.service.ts).
const BCRYPT_COST = 12;

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
   * The patient-driven counterpart to `register()` above — a real
   * password this time, since this account needs to log itself back in
   * (POST /auth/patient/signup, PatientAuthService.signup). Closes the
   * gap `register()`'s own comment flagged: patient portal
   * self-registration (docs/architecture/open-questions.md#3) had no
   * real endpoint at all until this. `actorType: 'PATIENT'` on the
   * audit entry with `actorId` set to the new patient's own id — the
   * actor IS the record being created, there's no separate staff user
   * to attribute this to.
   */
  async selfRegister(organizationId: string, input: PatientSignupInput) {
    const passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);

    return this.prisma.withTenant(organizationId, async (tx) => {
      const existing = await tx.patient.findFirst({
        where: { organizationId, email: input.email },
      });
      if (existing) {
        throw new ConflictException('An account with this email already exists.');
      }

      const patient = await tx.patient.create({
        data: {
          organizationId,
          firstName: input.firstName,
          lastName: input.lastName,
          dateOfBirth: new Date(input.dateOfBirth),
          phone: input.phone,
          email: input.email,
          passwordHash,
        },
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
        actorType: 'PATIENT',
        actorId: patient.id,
        action: 'patient.self_register',
        entityType: 'Patient',
        entityId: patient.id,
        metadata: {},
      });

      return patient;
    });
  }

  /**
   * Staff-facing patient list — for picking who an appointment is for.
   * `query` (optional) filters by first/last name or phone,
   * case-insensitive `contains` — a typeahead in the dashboard calls
   * this as the user types, not a plain "load every patient" `<select>`
   * anymore (that didn't scale: shipping the whole org's patient list
   * on every dashboard load falls over well before 100 patients). Capped
   * at 20 results either way — a real "browse all patients" screen with
   * pagination is a different, not-yet-asked-for feature; this is a
   * search box, not a directory.
   *
   * A single `contains` per field doesn't match a typed "First Last" —
   * neither field individually contains the whole two-word string.
   * Caught live by actually searching for one in a browser, not by
   * typecheck. Handled without raw SQL (no generated
   * full-name column exists, and one wasn't worth adding for this): if
   * the query splits into 2+ words, also try firstName-contains-first-word
   * AND lastName-contains-rest, which covers the common "type the full
   * name" case without pretending to be a real full-text search.
   */
  async listForOrganization(organizationId: string, query?: string) {
    const trimmed = query?.trim();
    const words = trimmed?.split(/\s+/).filter(Boolean) ?? [];

    return this.prisma.withTenant(organizationId, (tx) =>
      tx.patient.findMany({
        where: trimmed
          ? {
              OR: [
                { firstName: { contains: trimmed, mode: 'insensitive' } },
                { lastName: { contains: trimmed, mode: 'insensitive' } },
                { phone: { contains: trimmed } },
                ...(words.length > 1
                  ? [
                      {
                        AND: [
                          { firstName: { contains: words[0], mode: 'insensitive' as const } },
                          {
                            lastName: {
                              contains: words.slice(1).join(' '),
                              mode: 'insensitive' as const,
                            },
                          },
                        ],
                      },
                    ]
                  : []),
              ],
            }
          : undefined,
        orderBy: { createdAt: 'desc' },
        take: 20,
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
