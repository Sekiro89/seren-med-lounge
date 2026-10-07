import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService, type ExtendedPrismaClient } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PatientsService } from '../patients/patients.service';

const CANDIDATE_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  dateOfBirth: true,
  phone: true,
  email: true,
  createdAt: true,
} as const;

const RESOLVABLE_STATUSES = ['PENDING', 'ESCALATED'] as const;

/**
 * The staff-facing half of the Patient Record Claim Rules
 * (docs/architecture/open-questions.md#3): resolving a
 * PatientClaimRequest that either PatientsService.selfRegister (a
 * patient signing up, `source: SELF_SIGNUP`) or PatientsService.register
 * (Reception creating/finding a patient, `source: RECEPTION_INTAKE`)
 * couldn't confidently match on its own. This is rules 7/12's
 * "support/administrative verification flow" — not a separate
 * permission from ordinary patient management (patient:write), since
 * finding/linking a patient here is exactly the kind of thing reception
 * already does, just for an ambiguous case instead of a walk-in
 * (rule 13).
 */
@Injectable()
export class PatientClaimsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly patientsService: PatientsService,
  ) {}

  /**
   * Every PENDING or ESCALATED claim, with the candidate Patient
   * record(s) the matcher flagged embedded alongside — identity fields
   * only, no clinical data, so a reviewer can compare without this
   * becoming a second, looser route into clinical records.
   */
  async list(organizationId: string) {
    return this.prisma.withTenant(organizationId, async (tx) => {
      const claims = await tx.patientClaimRequest.findMany({
        where: { organizationId, status: { in: [...RESOLVABLE_STATUSES] } },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          source: true,
          matchReason: true,
          status: true,
          firstName: true,
          lastName: true,
          dateOfBirth: true,
          phone: true,
          email: true,
          candidatePatientIds: true,
          createdAt: true,
        },
      });

      const candidateIds = Array.from(
        new Set(claims.flatMap((claim) => claim.candidatePatientIds as string[])),
      );
      const candidates = candidateIds.length
        ? await tx.patient.findMany({
            where: { id: { in: candidateIds } },
            select: CANDIDATE_SELECT,
          })
        : [];
      const candidateById = new Map(candidates.map((candidate) => [candidate.id, candidate]));

      return claims.map(({ candidatePatientIds, ...claim }) => ({
        ...claim,
        candidates: (candidatePatientIds as string[])
          .map((id) => candidateById.get(id))
          .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate)),
      }));
    });
  }

  private async getPendingClaim(tx: ExtendedPrismaClient, organizationId: string, claimId: string) {
    const claim = await tx.patientClaimRequest.findUnique({ where: { id: claimId } });
    if (!claim || claim.organizationId !== organizationId) {
      throw new NotFoundException('Claim request not found.');
    }
    if (claim.status !== 'PENDING') {
      throw new BadRequestException('This claim request has already been escalated or resolved.');
    }
    return claim;
  }

  /** Link/create-new/reject all remain reachable from ESCALATED, not just PENDING — escalation flags a claim for a broader review, it isn't a dead end. */
  private async getResolvableClaim(
    tx: ExtendedPrismaClient,
    organizationId: string,
    claimId: string,
  ) {
    const claim = await tx.patientClaimRequest.findUnique({ where: { id: claimId } });
    if (!claim || claim.organizationId !== organizationId) {
      throw new NotFoundException('Claim request not found.');
    }
    if (!(RESOLVABLE_STATUSES as readonly string[]).includes(claim.status)) {
      throw new BadRequestException('This claim request has already been resolved.');
    }
    return claim;
  }

  /**
   * Staff picks which existing Patient this claim belongs to. Not
   * restricted to the flagged `candidatePatientIds` — a reviewer with
   * patient:read/write may recognize the right record even when the
   * matcher didn't (e.g. a mistyped phone digit), and second-guessing
   * their judgment with a narrower allow-list isn't this queue's job.
   *
   * Branches on the claim's source: a SELF_SIGNUP claim carries
   * credentials to attach (the same auto-link mechanics selfRegister()
   * uses); a RECEPTION_INTAKE claim never does — Reception is
   * confirming a RECORD, never creating or touching an ACCOUNT (see
   * PatientsService.confirmPatientIdentity's doc comment) — and may
   * carry a phone-number correction, which gets its own audit entry.
   */
  async linkToExisting(
    organizationId: string,
    actorId: string,
    claimId: string,
    patientId: string,
  ) {
    return this.prisma.withTenant(organizationId, async (tx) => {
      const claim = await this.getResolvableClaim(tx, organizationId, claimId);

      const existingPatient = await tx.patient.findUnique({ where: { id: patientId } });
      if (!existingPatient || existingPatient.organizationId !== organizationId) {
        throw new NotFoundException('Patient not found in this organization.');
      }

      let patient;
      if (claim.passwordHash && claim.email) {
        patient = await this.patientsService.linkCredentialsToPatient(
          tx,
          organizationId,
          patientId,
          {
            email: claim.email,
            passwordHash: claim.passwordHash,
          },
        );
        await this.auditService.record(tx, organizationId, {
          actorType: 'USER',
          actorId,
          action: 'patient_account.linked',
          entityType: 'Patient',
          entityId: patient.id,
          metadata: { matchType: 'staff_reviewed', claimRequestId: claim.id },
        });
      } else {
        patient = await this.patientsService.confirmPatientIdentity(
          tx,
          organizationId,
          actorId,
          patientId,
          claim.phone,
        );
        await this.auditService.record(tx, organizationId, {
          actorType: 'USER',
          actorId,
          action: 'patient.existing_match_confirmed',
          entityType: 'Patient',
          entityId: patient.id,
          metadata: { claimRequestId: claim.id },
        });
      }

      await tx.patientClaimRequest.update({
        where: { id: claim.id },
        data: {
          status: 'LINKED',
          resolvedPatientId: patient.id,
          resolvedById: actorId,
          resolvedAt: new Date(),
        },
      });

      await this.auditService.record(tx, organizationId, {
        actorType: 'USER',
        actorId,
        action: 'patient_account.claim_resolved',
        entityType: 'PatientClaimRequest',
        entityId: claim.id,
        metadata: { outcome: 'linked', patientId: patient.id },
      });

      return patient;
    });
  }

  /**
   * Staff's explicit judgment call that none of the flagged candidates
   * are actually this person — creates a brand-new Patient from the
   * claim's submitted identity, the same "nothing to duplicate against"
   * outcome selfRegister()/register() reach on their own when there's no
   * match at all, just reached here via a human decision instead. No
   * password is set for a RECEPTION_INTAKE claim (claim.passwordHash is
   * null) — same "record, not account" restraint as everywhere else in
   * this flow.
   */
  async createNewForClaim(organizationId: string, actorId: string, claimId: string) {
    return this.prisma.withTenant(organizationId, async (tx) => {
      const claim = await this.getResolvableClaim(tx, organizationId, claimId);

      const patient = await this.patientsService.createPatientRecord(
        tx,
        organizationId,
        {
          firstName: claim.firstName,
          lastName: claim.lastName,
          dateOfBirth: claim.dateOfBirth,
          phone: claim.phone,
          email: claim.email,
        },
        claim.passwordHash ?? undefined,
      );

      await tx.patientClaimRequest.update({
        where: { id: claim.id },
        data: {
          status: 'CREATED_NEW',
          resolvedPatientId: patient.id,
          resolvedById: actorId,
          resolvedAt: new Date(),
        },
      });

      await this.auditService.record(tx, organizationId, {
        actorType: 'USER',
        actorId,
        action: claim.source === 'SELF_SIGNUP' ? 'patient.self_register' : 'patient.register',
        entityType: 'Patient',
        entityId: patient.id,
        metadata: { claimRequestId: claim.id },
      });
      await this.auditService.record(tx, organizationId, {
        actorType: 'USER',
        actorId,
        action: 'patient_account.claim_resolved',
        entityType: 'PatientClaimRequest',
        entityId: claim.id,
        metadata: { outcome: 'created_new', patientId: patient.id },
      });

      return patient;
    });
  }

  /**
   * The patient ends up with no working account/no record was created —
   * same as any unresolved staff-assisted case, they retry later or are
   * handled in person. No further automatic path: this whole flow
   * already IS rule 12's staff-assisted fallback.
   */
  async reject(organizationId: string, actorId: string, claimId: string, reason?: string) {
    return this.prisma.withTenant(organizationId, async (tx) => {
      const claim = await this.getResolvableClaim(tx, organizationId, claimId);

      await tx.patientClaimRequest.update({
        where: { id: claim.id },
        data: { status: 'REJECTED', resolvedById: actorId, resolvedAt: new Date() },
      });

      await this.auditService.record(tx, organizationId, {
        actorType: 'USER',
        actorId,
        action: 'patient_account.claim_resolved',
        entityType: 'PatientClaimRequest',
        entityId: claim.id,
        metadata: { outcome: 'rejected', reason },
      });

      return { id: claim.id, status: 'REJECTED' as const };
    });
  }

  /**
   * "I can't safely tell, someone else should look at this" — the
   * escalation path sections 8/14 ask for. Reception already holds
   * patient:write (same as whoever ends up resolving an escalated
   * claim), so this isn't a hard permission boundary today, only a
   * workflow/visibility signal — flagged as a TODO in
   * docs/architecture/open-questions.md if a real escalation-only
   * reviewer tier is ever wanted. Only callable from PENDING —
   * escalating something already escalated/resolved is a no-op that
   * would just overwrite the audit trail's meaning.
   */
  async escalate(organizationId: string, actorId: string, claimId: string, reason?: string) {
    return this.prisma.withTenant(organizationId, async (tx) => {
      const claim = await this.getPendingClaim(tx, organizationId, claimId);

      await tx.patientClaimRequest.update({
        where: { id: claim.id },
        data: { status: 'ESCALATED' },
      });

      await this.auditService.record(tx, organizationId, {
        actorType: 'USER',
        actorId,
        action: 'patient_account.claim_escalated',
        entityType: 'PatientClaimRequest',
        entityId: claim.id,
        metadata: { reason },
      });

      return { id: claim.id, status: 'ESCALATED' as const };
    });
  }
}
