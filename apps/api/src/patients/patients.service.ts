import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';
import { Prisma, type PatientClaimSource } from '@prisma/client';
import type { PatientRegistrationInput, PatientSignupInput } from '@serenemed/validation';
import { PrismaService, type ExtendedPrismaClient } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

// Matches UsersService's convention (apps/api/src/users/users.service.ts).
const BCRYPT_COST = 12;

// No 0/O/1/I — avoids transcription errors when Reception reads this
// code aloud or writes it on a slip for the patient (see
// PatientsService.createActivationCode's doc comment on why this exists
// instead of an SMS/email OTP).
const ACTIVATION_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ACTIVATION_CODE_LENGTH = 8;
// TODO(open-questions.md — Patient Record Claim Rules, rule 15): fixed
// for now; per-org configurable retention/verification policy doesn't
// exist anywhere in this app yet, same gap already flagged there.
const ACTIVATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

function generateActivationCode(): string {
  const bytes = randomBytes(ACTIVATION_CODE_LENGTH);
  let code = '';
  for (let i = 0; i < ACTIVATION_CODE_LENGTH; i += 1) {
    code += ACTIVATION_CODE_ALPHABET[bytes[i]! % ACTIVATION_CODE_ALPHABET.length];
  }
  return code;
}

// SHA-256, not bcrypt — this needs exact-match lookup by the code itself
// (`findFirst({ where: { codeHash } })`), not verification against one
// already-known row, and a short-lived single-use org-scoped random code
// doesn't need a slow hash the way a long-lived password does.
function hashActivationCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

const PATIENT_PROFILE_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  dateOfBirth: true,
  phone: true,
  email: true,
  createdAt: true,
} as const;

export type SelfRegisterResult =
  { kind: 'active'; patient: PatientProfile } | { kind: 'pending'; claimRequestId: string };

export type ReceptionRegisterResult =
  | { kind: 'created'; patient: PatientProfile }
  | { kind: 'existing'; patient: PatientProfile; hasAccount: boolean }
  | { kind: 'possible_match'; claimRequestId: string; candidates: PatientProfile[] }
  | { kind: 'ambiguous_match'; claimRequestId: string; candidates: PatientProfile[] };

export type ActivationResult =
  | { kind: 'created'; code: string; expiresAt: Date }
  | { kind: 'duplicate_account'; patient: PatientProfile };

export interface PatientProfile {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth: Date;
  phone: string;
  email: string | null;
  createdAt: Date;
}

interface ClaimIdentityInput {
  firstName: string;
  lastName: string;
  phone: string;
  email?: string;
}

@Injectable()
export class PatientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Reception's "create patient" flow — the backend, not the frontend,
   * decides whether this is a new patient, an existing one, or needs
   * review (Patient Record Claim Rules extended to Reception intake, see
   * docs/architecture/open-questions.md#3). Never blindly inserts:
   *
   *   1. Exact phone+dateOfBirth match, exactly one candidate, lastName
   *      also matches → confident single match → `existing`, nothing
   *      created (rule: never create a duplicate patient record).
   *   2. Exact phone+dateOfBirth match but the lastName doesn't, or more
   *      than one candidate matches → can't tell which (or whether) this
   *      is the same person → `ambiguous_match`, routed to a
   *      PatientClaimRequest for review, nothing created.
   *   3. No phone+dateOfBirth match, but an exact firstName+lastName+
   *      dateOfBirth match exists under a DIFFERENT phone (the "existing
   *      patient, new phone number" case) → `possible_match` (single) or
   *      `ambiguous_match` (multiple) — same review path, phone is never
   *      changed automatically.
   *   4. No match at all → safe to create, same as before.
   *
   * No password is ever set here — Reception is finding/creating a
   * PATIENT RECORD, never a PATIENT ACCOUNT (`Patient.passwordHash`
   * stays null); see `createActivationCode`/`redeemActivationCode` for
   * the separate, patient-completed path to an account, and this
   * method's own restraint from ever impersonating the patient.
   */
  async register(
    organizationId: string,
    actorId: string,
    input: PatientRegistrationInput,
  ): Promise<ReceptionRegisterResult> {
    const dateOfBirth = new Date(input.dateOfBirth);

    return this.prisma.withTenant(organizationId, async (tx) => {
      await this.acquireIdentityLock(tx, organizationId, input.phone, dateOfBirth);

      const phoneDobCandidates = await tx.patient.findMany({
        where: { organizationId, phone: input.phone, dateOfBirth },
        select: PATIENT_PROFILE_SELECT_WITH_ACCOUNT,
      });

      if (phoneDobCandidates.length === 1) {
        const candidate = phoneDobCandidates[0]!;
        if (candidate.lastName.trim().toLowerCase() === input.lastName.trim().toLowerCase()) {
          await this.auditService.record(tx, organizationId, {
            actorType: 'USER',
            actorId,
            action: 'patient.existing_match_detected',
            entityType: 'Patient',
            entityId: candidate.id,
            metadata: { matchType: 'phone+dob+lastName' },
          });
          return {
            kind: 'existing',
            patient: toProfile(candidate),
            hasAccount: Boolean(candidate.passwordHash),
          };
        }
        return this.createOrReuseAmbiguousClaim(
          tx,
          organizationId,
          { actorType: 'USER', actorId },
          input,
          dateOfBirth,
          [candidate],
          'phone_dob_lastname_mismatch',
        );
      }

      if (phoneDobCandidates.length > 1) {
        return this.createOrReuseAmbiguousClaim(
          tx,
          organizationId,
          { actorType: 'USER', actorId },
          input,
          dateOfBirth,
          phoneDobCandidates,
          'phone_dob_multiple',
        );
      }

      // No phone+DOB match — the "existing patient, new phone number"
      // case (docs/architecture/open-questions.md#3's claim rules,
      // extended). Never auto-adopt the new number; route to review.
      const nameMatches = await this.findPossibleNameMatch(tx, organizationId, {
        firstName: input.firstName,
        lastName: input.lastName,
        dateOfBirth,
        excludePhone: input.phone,
      });

      if (nameMatches.length > 0) {
        const matchReason =
          nameMatches.length === 1
            ? 'name_dob_different_phone'
            : 'name_dob_different_phone_multiple';
        return this.createOrReuseAmbiguousClaim(
          tx,
          organizationId,
          { actorType: 'USER', actorId },
          input,
          dateOfBirth,
          nameMatches,
          matchReason,
        );
      }

      const patient = await this.createPatientRecord(tx, organizationId, input);
      await this.auditService.record(tx, organizationId, {
        actorType: 'USER',
        actorId,
        action: 'patient.register',
        entityType: 'Patient',
        entityId: patient.id,
        metadata: {},
      });
      return { kind: 'created', patient };
    });
  }

  /**
   * The patient-driven counterpart to `register()` above — a real
   * password this time, since this account needs to log itself back in
   * (POST /auth/patient/signup, PatientAuthService.signup).
   *
   * PATIENT RECORD CLAIM RULES (see docs/architecture/open-questions.md#3):
   * a signup must never blindly create a new Patient row, because
   * `register()` above routinely creates patients with no email at all —
   * a returning patient signing up for the first time would otherwise
   * get a *second*, duplicate Patient row, silently fragmenting their
   * appointment/diagnosis/prescription history across two records. So
   * before creating anything, this looks for an existing, unclaimed
   * (passwordHash IS NULL) record that confidently matches:
   *
   *   1. Exact (organizationId, email) match, unclaimed → strongest
   *      possible signal (email is @@unique per org) → auto-link.
   *   2. No email match: exact phone + dateOfBirth match, exactly one
   *      unclaimed candidate, and its lastName also matches
   *      (case-insensitive) → auto-link.
   *   3. Anything less certain — multiple unclaimed candidates, a
   *      phone+DOB match whose lastName differs, or every phone+DOB
   *      match already claimed by someone else — goes to a
   *      PatientClaimRequest for staff to resolve (PatientClaimsService)
   *      rather than guessing. Nothing is created or linked until then.
   *   4. No phone+DOB match, but an exact name+DOB match under a
   *      different phone — the same "phone number changed" case
   *      `register()` handles for Reception — also goes to review rather
   *      than trusting a bare claim (rule 4's spirit: a changed phone
   *      number is exactly the case that must not be auto-approved).
   *   5. No match at all → safe to create a brand-new Patient, same as
   *      before.
   *
   * "Auto-link" only ever sets fields on the EXISTING row — it never
   * creates a second Patient — so existing clinical history stays
   * attached by construction (rule 14), and never silently duplicates
   * (rule 5).
   */
  async selfRegister(
    organizationId: string,
    input: PatientSignupInput,
  ): Promise<SelfRegisterResult> {
    const passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);
    const dateOfBirth = new Date(input.dateOfBirth);

    return this.prisma.withTenant(organizationId, async (tx) => {
      await this.acquireIdentityLock(tx, organizationId, input.phone, dateOfBirth);

      const emailMatch = await tx.patient.findFirst({
        where: { organizationId, email: input.email },
      });
      if (emailMatch) {
        if (emailMatch.passwordHash) {
          throw new ConflictException('An account with this email already exists.');
        }
        const patient = await this.linkCredentialsToPatient(tx, organizationId, emailMatch.id, {
          email: input.email,
          passwordHash,
        });
        await this.auditService.record(tx, organizationId, {
          actorType: 'PATIENT',
          actorId: patient.id,
          action: 'patient_account.linked',
          entityType: 'Patient',
          entityId: patient.id,
          metadata: { matchType: 'email' },
        });
        return { kind: 'active', patient };
      }

      const phoneDobCandidates = await tx.patient.findMany({
        where: { organizationId, phone: input.phone, dateOfBirth },
      });

      if (phoneDobCandidates.length > 0) {
        const unclaimed = phoneDobCandidates.filter((candidate) => !candidate.passwordHash);
        const soleCandidate = unclaimed.length === 1 ? unclaimed[0] : undefined;
        const confidentMatch =
          soleCandidate &&
          soleCandidate.lastName.trim().toLowerCase() === input.lastName.trim().toLowerCase()
            ? soleCandidate
            : null;

        if (confidentMatch) {
          const patient = await this.linkCredentialsToPatient(
            tx,
            organizationId,
            confidentMatch.id,
            { email: input.email, passwordHash },
          );
          await this.auditService.record(tx, organizationId, {
            actorType: 'PATIENT',
            actorId: patient.id,
            action: 'patient_account.linked',
            entityType: 'Patient',
            entityId: patient.id,
            metadata: { matchType: 'phone+dob+lastName' },
          });
          return { kind: 'active', patient };
        }

        // Ambiguous: multiple unclaimed candidates, a lastName mismatch,
        // or every phone+DOB match already claimed by someone else.
        const candidates = unclaimed.length > 0 ? unclaimed : phoneDobCandidates;
        const matchReason =
          unclaimed.length === 0
            ? 'phone_dob_all_claimed'
            : unclaimed.length > 1
              ? 'phone_dob_multiple'
              : 'phone_dob_lastname_mismatch';
        const { claimRequestId } = await this.createOrReuseClaim(tx, organizationId, {
          source: 'SELF_SIGNUP',
          matchReason,
          actor: { actorType: 'PATIENT' },
          identity: input,
          dateOfBirth,
          passwordHash,
          candidateIds: candidates.map((c) => c.id),
        });
        return { kind: 'pending', claimRequestId };
      }

      // No phone+DOB match at all — check for the "phone number
      // changed" case before assuming this is a genuinely new patient.
      const nameMatches = await this.findPossibleNameMatch(tx, organizationId, {
        firstName: input.firstName,
        lastName: input.lastName,
        dateOfBirth,
        excludePhone: input.phone,
      });
      if (nameMatches.length > 0) {
        const matchReason =
          nameMatches.length === 1
            ? 'name_dob_different_phone'
            : 'name_dob_different_phone_multiple';
        const { claimRequestId } = await this.createOrReuseClaim(tx, organizationId, {
          source: 'SELF_SIGNUP',
          matchReason,
          actor: { actorType: 'PATIENT' },
          identity: input,
          dateOfBirth,
          passwordHash,
          candidateIds: nameMatches.map((c) => c.id),
        });
        return { kind: 'pending', claimRequestId };
      }

      const patient = await this.createPatientRecord(tx, organizationId, input, passwordHash);
      await this.auditService.record(tx, organizationId, {
        actorType: 'PATIENT',
        actorId: patient.id,
        action: 'patient.self_register',
        entityType: 'Patient',
        entityId: patient.id,
        metadata: {},
      });
      return { kind: 'active', patient };
    });
  }

  /**
   * Reception's "Send Account Activation" action (see
   * docs/architecture/open-questions.md#3). Deliberately not an SMS/
   * email OTP — no messaging integration exists in this project — so
   * this generates a short code and hands it back to the CALLER
   * (Reception) to relay to the patient by whatever channel they already
   * use in person; nothing is sent automatically. Refuses outright if
   * the patient already has a password set (`duplicate_account`) rather
   * than issuing a token that would silently let a second party overwrite
   * an existing account's credentials.
   */
  async createActivationCode(
    organizationId: string,
    actorId: string,
    patientId: string,
  ): Promise<ActivationResult> {
    return this.prisma.withTenant(organizationId, async (tx) => {
      const existing = await tx.patient.findUnique({ where: { id: patientId } });
      if (!existing) {
        throw new NotFoundException('Patient not found.');
      }

      if (existing.passwordHash) {
        await this.auditService.record(tx, organizationId, {
          actorType: 'USER',
          actorId,
          action: 'patient_account.activation_requested',
          entityType: 'Patient',
          entityId: patientId,
          metadata: { outcome: 'duplicate_account' },
        });
        return { kind: 'duplicate_account', patient: toProfile(existing) };
      }

      const code = generateActivationCode();
      const expiresAt = new Date(Date.now() + ACTIVATION_TOKEN_TTL_MS);
      await tx.patientActivationToken.create({
        data: {
          organizationId,
          patientId,
          codeHash: hashActivationCode(code),
          expiresAt,
          createdById: actorId,
        },
      });

      await this.auditService.record(tx, organizationId, {
        actorType: 'USER',
        actorId,
        action: 'patient_account.activation_requested',
        entityType: 'Patient',
        entityId: patientId,
        // Never the code itself — see this method's doc comment and
        // hashActivationCode's.
        metadata: { outcome: 'activation_created', expiresAt: expiresAt.toISOString() },
      });

      return { kind: 'created', code, expiresAt };
    });
  }

  /**
   * POST /auth/patient/activate — the patient redeeming a Reception-
   * issued code themselves (never Reception, on the patient's behalf —
   * see `createActivationCode`'s doc comment). Returns `null` on any
   * failure (no such code, expired, already used, or the patient somehow
   * already has a password by the time this runs) — the caller
   * (PatientAuthService.activate) turns that into one generic error, so
   * a wrong/guessed code can't be used to learn anything about why it
   * failed.
   */
  async redeemActivationCode(
    organizationId: string,
    input: { code: string; password: string },
  ): Promise<PatientProfile | null> {
    const passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);
    const codeHash = hashActivationCode(input.code);

    return this.prisma.withTenant(organizationId, async (tx) => {
      const token = await tx.patientActivationToken.findFirst({
        where: { organizationId, codeHash, usedAt: null, expiresAt: { gt: new Date() } },
      });
      if (!token) {
        return null;
      }

      const currentPatient = await tx.patient.findUnique({ where: { id: token.patientId } });
      if (!currentPatient || currentPatient.passwordHash) {
        // Claimed via another path since the code was issued — don't
        // silently overwrite; the code is simply no longer valid.
        return null;
      }

      const patient = await tx.patient.update({
        where: { id: token.patientId, organizationId },
        data: { passwordHash },
        select: PATIENT_PROFILE_SELECT,
      });
      await tx.patientActivationToken.update({
        where: { id: token.id },
        data: { usedAt: new Date() },
      });

      await this.auditService.record(tx, organizationId, {
        actorType: 'PATIENT',
        actorId: patient.id,
        action: 'patient_account.linked',
        entityType: 'Patient',
        entityId: patient.id,
        metadata: { matchType: 'activation_token' },
      });

      return patient;
    });
  }

  /**
   * A staff member confirming (via PatientClaimsService) that a
   * candidate flagged by `register()`'s matching IS this person — the
   * Reception-sourced counterpart to `linkCredentialsToPatient` below,
   * except there are never credentials to set (Reception never touches
   * a patient's password). The only thing that may change is `phone`,
   * and only when the caller explicitly confirms the new number — see
   * the "existing patient, new phone number" case in `register()`'s doc
   * comment. Any phone change is its own audit entry (rule: "any
   * phone-number change must be audited").
   */
  async confirmPatientIdentity(
    tx: ExtendedPrismaClient,
    organizationId: string,
    actorId: string,
    patientId: string,
    confirmedPhone?: string,
  ): Promise<PatientProfile> {
    const existing = await tx.patient.findUnique({ where: { id: patientId } });
    if (!existing || existing.organizationId !== organizationId) {
      throw new NotFoundException('Patient not found in this organization.');
    }

    if (confirmedPhone && confirmedPhone !== existing.phone) {
      const patient = await tx.patient.update({
        where: { id: patientId, organizationId },
        data: { phone: confirmedPhone },
        select: PATIENT_PROFILE_SELECT,
      });
      await this.auditService.record(tx, organizationId, {
        actorType: 'USER',
        actorId,
        action: 'patient.phone_changed',
        entityType: 'Patient',
        entityId: patientId,
        metadata: { previousPhone: existing.phone, newPhone: confirmedPhone },
      });
      return patient;
    }

    return toProfile(existing);
  }

  /**
   * Shared by `selfRegister()`'s "no match at all" path, `register()`'s
   * same path, and PatientClaimsService's "none of the flagged
   * candidates are this person" resolution — the one place any of these
   * flows creates a brand-new Patient row. `passwordHash` is omitted
   * entirely for Reception-initiated creation (no account, ever, from
   * this path — see `register()`'s doc comment).
   *
   * Wrapped for the `(organizationId, email)` unique constraint's race
   * window: two concurrent requests can both pass an application-level
   * "no existing match" check before either commits (see
   * `acquireIdentityLock` below for the phone+DOB half of this same
   * problem) — the database is the actual backstop, this just turns its
   * rejection into a clean 409 instead of a raw 500.
   */
  async createPatientRecord(
    tx: ExtendedPrismaClient,
    organizationId: string,
    input: {
      firstName: string;
      lastName: string;
      dateOfBirth: Date | string;
      phone: string;
      email?: string | null;
    },
    passwordHash?: string,
  ): Promise<PatientProfile> {
    try {
      return await tx.patient.create({
        data: {
          organizationId,
          firstName: input.firstName,
          lastName: input.lastName,
          dateOfBirth:
            typeof input.dateOfBirth === 'string' ? new Date(input.dateOfBirth) : input.dateOfBirth,
          phone: input.phone,
          email: input.email,
          passwordHash,
        },
        select: PATIENT_PROFILE_SELECT,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('An account with this email already exists.');
      }
      throw error;
    }
  }

  /**
   * Shared by `selfRegister()`'s auto-link paths, PatientClaimsService's
   * staff-approved "link" resolution for a self-signup claim, and
   * `redeemActivationCode` above — sets credentials on an EXISTING
   * Patient row. Never creates a row, so existing clinical history
   * (appointments/diagnoses/etc, all FK'd to this same patientId) stays
   * attached — this is rule 14 by construction, not by anything extra
   * this method does.
   */
  async linkCredentialsToPatient(
    tx: ExtendedPrismaClient,
    organizationId: string,
    patientId: string,
    credentials: { email: string; passwordHash: string },
  ): Promise<PatientProfile> {
    return tx.patient.update({
      where: { id: patientId, organizationId },
      data: { email: credentials.email, passwordHash: credentials.passwordHash },
      select: PATIENT_PROFILE_SELECT,
    });
  }

  /**
   * Postgres advisory lock, scoped to (organizationId, phone,
   * dateOfBirth) and held for the rest of the caller's transaction
   * (`pg_advisory_xact_lock` auto-releases at commit/rollback — never
   * needs an explicit unlock). This is the "database is the final
   * protection against race-condition duplicates" half of the story
   * for the fields that legitimately can't carry a uniqueness
   * constraint (phone is deliberately not unique — a household can
   * share one number; DOB obviously isn't either): two concurrent
   * `register()`/`selfRegister()` calls for the same phone+DOB now
   * serialize against each other, so the second one's matching query
   * runs AFTER the first's write has committed, instead of both reading
   * "no match" and both creating.
   */
  private async acquireIdentityLock(
    tx: ExtendedPrismaClient,
    organizationId: string,
    phone: string,
    dateOfBirth: Date,
  ): Promise<void> {
    const key = `${organizationId}:${phone}:${dateOfBirth.toISOString()}`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
  }

  /**
   * The "existing patient, new phone number" signal shared by
   * `register()` and `selfRegister()`: an exact firstName+lastName+
   * dateOfBirth match under a phone OTHER than the one just submitted.
   * Deliberately exact (not `contains`) on the name fields — this feeds
   * a duplicate-prevention decision, not a search box; a loose match
   * here would risk flagging unrelated people as "possibly the same
   * patient."
   */
  private async findPossibleNameMatch(
    tx: ExtendedPrismaClient,
    organizationId: string,
    params: { firstName: string; lastName: string; dateOfBirth: Date; excludePhone: string },
  ) {
    return tx.patient.findMany({
      where: {
        organizationId,
        dateOfBirth: params.dateOfBirth,
        firstName: { equals: params.firstName, mode: 'insensitive' },
        lastName: { equals: params.lastName, mode: 'insensitive' },
        phone: { not: params.excludePhone },
      },
      select: PATIENT_PROFILE_SELECT_WITH_ACCOUNT,
    });
  }

  /** `register()`'s ambiguous/possible-match outcomes — thin wrapper over `createOrReuseClaim` that also shapes the outward result. */
  private async createOrReuseAmbiguousClaim(
    tx: ExtendedPrismaClient,
    organizationId: string,
    actor: { actorType: 'USER'; actorId: string },
    input: PatientRegistrationInput,
    dateOfBirth: Date,
    candidates: { id: string }[],
    matchReason: string,
  ): Promise<ReceptionRegisterResult> {
    const { claimRequestId } = await this.createOrReuseClaim(tx, organizationId, {
      source: 'RECEPTION_INTAKE',
      matchReason,
      actor,
      identity: input,
      dateOfBirth,
      passwordHash: undefined,
      candidateIds: candidates.map((c) => c.id),
    });

    const candidateProfiles = await tx.patient.findMany({
      where: { id: { in: candidates.map((c) => c.id) } },
      select: PATIENT_PROFILE_SELECT,
    });
    const kind = matchReason === 'name_dob_different_phone' ? 'possible_match' : 'ambiguous_match';
    return { kind, claimRequestId, candidates: candidateProfiles };
  }

  /**
   * Creates a PatientClaimRequest for an ambiguous match — or, if the
   * SAME (organizationId, phone, dateOfBirth) already has a PENDING
   * claim (a retry, from either source), refreshes that one instead of
   * piling up duplicates (see this same reasoning documented in
   * git history for the self-signup-only version of this method).
   * Shared by both `register()` (Reception, source=RECEPTION_INTAKE,
   * no credentials) and `selfRegister()` (source=SELF_SIGNUP, always
   * carries email+passwordHash).
   */
  private async createOrReuseClaim(
    tx: ExtendedPrismaClient,
    organizationId: string,
    params: {
      source: PatientClaimSource;
      matchReason: string;
      actor: { actorType: 'PATIENT' } | { actorType: 'USER'; actorId: string };
      identity: ClaimIdentityInput;
      dateOfBirth: Date;
      passwordHash?: string;
      candidateIds: string[];
    },
  ): Promise<{ claimRequestId: string }> {
    const existing = await tx.patientClaimRequest.findFirst({
      where: {
        organizationId,
        phone: params.identity.phone,
        dateOfBirth: params.dateOfBirth,
        status: 'PENDING',
      },
    });

    const auditMetadata = {
      candidatePatientIds: params.candidateIds,
      matchReason: params.matchReason,
      source: params.source,
    };
    const actorFields =
      params.actor.actorType === 'USER'
        ? { actorType: 'USER' as const, actorId: params.actor.actorId }
        : { actorType: 'PATIENT' as const, actorId: undefined };

    if (existing) {
      const updated = await tx.patientClaimRequest.update({
        where: { id: existing.id },
        data: {
          source: params.source,
          matchReason: params.matchReason,
          firstName: params.identity.firstName,
          lastName: params.identity.lastName,
          email: params.identity.email,
          passwordHash: params.passwordHash,
          candidatePatientIds: params.candidateIds,
        },
        select: { id: true },
      });
      await this.auditService.record(tx, organizationId, {
        ...actorFields,
        action: 'patient_account.claim_resubmitted',
        entityType: 'PatientClaimRequest',
        entityId: updated.id,
        metadata: auditMetadata,
      });
      return { claimRequestId: updated.id };
    }

    const created = await tx.patientClaimRequest.create({
      data: {
        organizationId,
        source: params.source,
        matchReason: params.matchReason,
        firstName: params.identity.firstName,
        lastName: params.identity.lastName,
        dateOfBirth: params.dateOfBirth,
        phone: params.identity.phone,
        email: params.identity.email,
        passwordHash: params.passwordHash,
        candidatePatientIds: params.candidateIds,
      },
      select: { id: true },
    });
    await this.auditService.record(tx, organizationId, {
      ...actorFields,
      action: 'patient_account.claim_created',
      entityType: 'PatientClaimRequest',
      entityId: created.id,
      metadata: auditMetadata,
    });
    return { claimRequestId: created.id };
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
   * One patient for the staff record page. `hasAccount` says whether they
   * have a portal login; the password hash itself never leaves this method.
   * Tenant-scoped by RLS: another organization's patient is a 404.
   */
  async findForStaff(organizationId: string, patientId: string) {
    const patient = await this.prisma.withTenant(organizationId, (tx) =>
      tx.patient.findUnique({
        where: { id: patientId },
        select: { ...PATIENT_PROFILE_SELECT, passwordHash: true },
      }),
    );
    if (!patient) {
      throw new NotFoundException('Patient not found.');
    }
    const { passwordHash, ...profile } = patient;
    return { ...profile, hasAccount: passwordHash !== null };
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
        select: PATIENT_PROFILE_SELECT,
      }),
    );
  }
}

const PATIENT_PROFILE_SELECT_WITH_ACCOUNT = {
  ...PATIENT_PROFILE_SELECT,
  passwordHash: true,
} as const;

function toProfile(patient: {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth: Date;
  phone: string;
  email: string | null;
  createdAt: Date;
}): PatientProfile {
  return {
    id: patient.id,
    firstName: patient.firstName,
    lastName: patient.lastName,
    dateOfBirth: patient.dateOfBirth,
    phone: patient.phone,
    email: patient.email,
    createdAt: patient.createdAt,
  };
}
