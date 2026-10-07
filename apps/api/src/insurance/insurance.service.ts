import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  InsuranceCaseStatus,
  InvoiceStatus,
  PatientDocumentType,
  PaymentMethod,
  type InsuranceCase,
} from '@prisma/client';
import type {
  CreateInsuranceCaseInput,
  CreateInsurancePolicyInput,
  InsuranceCaseNoteInput,
  InsuranceTransitionInput,
  SettleInsuranceCaseInput,
} from '@serenemed/validation';
import { PrismaService, type ExtendedPrismaClient } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PaymentsService } from '../payments/payments.service';
import { clinicDateString, toDbDate } from '../common/clinic-time';

const S = InsuranceCaseStatus;

/**
 * Allowed moves through POST /insurance/cases/:id/transition. SETTLED is
 * reachable only via settle() (CLAIM_APPROVED / CLAIM_PARTIALLY_APPROVED
 * -> SETTLED), because settling also records the Payment.
 */
const TRANSITIONS: Record<InsuranceCaseStatus, InsuranceCaseStatus[]> = {
  [S.ELIGIBILITY_CHECK]: [S.PRE_AUTH_REQUESTED, S.CLOSED],
  [S.PRE_AUTH_REQUESTED]: [S.PRE_AUTH_APPROVED, S.PRE_AUTH_DENIED],
  [S.PRE_AUTH_APPROVED]: [S.CLAIM_SUBMITTED],
  [S.PRE_AUTH_DENIED]: [S.PRE_AUTH_REQUESTED, S.CLOSED],
  [S.CLAIM_SUBMITTED]: [S.CLAIM_APPROVED, S.CLAIM_PARTIALLY_APPROVED, S.CLAIM_REJECTED],
  [S.CLAIM_APPROVED]: [],
  [S.CLAIM_PARTIALLY_APPROVED]: [],
  [S.CLAIM_REJECTED]: [S.CLAIM_SUBMITTED, S.CLOSED],
  [S.SETTLED]: [S.CLOSED],
  [S.CLOSED]: [],
};

/** Transitions whose amountMinor is the insurer's approved amount. */
const NEEDS_APPROVED_AMOUNT: InsuranceCaseStatus[] = [
  S.PRE_AUTH_APPROVED,
  S.CLAIM_APPROVED,
  S.CLAIM_PARTIALLY_APPROVED,
];

const SETTLEABLE: InsuranceCaseStatus[] = [S.CLAIM_APPROVED, S.CLAIM_PARTIALLY_APPROVED];

const CASE_INCLUDE = {
  policy: { select: { id: true, insurerName: true, tpaName: true, policyNumber: true } },
  patient: { select: { id: true, firstName: true, lastName: true } },
} as const;

/**
 * Insurance policies and cases (eligibility -> pre-auth -> claim ->
 * settlement), attached to the patient record.
 *
 * NO INSURER INTEGRATION: the InsuranceProvider in
 * integrations/insurance is a stub and is deliberately NOT called here —
 * using it would fake an eligibility answer. Every step (eligibility
 * outcome, pre-auth decision, claim decision, settlement) is recorded
 * manually by insurance staff from what the insurer/TPA told them. When
 * an insurer is contracted, its calls slot in behind the same
 * transitions.
 *
 * Every status change and every logged communication is an append-only
 * InsuranceCaseEvent (REVOKE UPDATE/DELETE at the DB). The event's note
 * is the communication log and may hold free text; audit metadata never
 * does — it carries ids, statuses and amounts only.
 */
@Injectable()
export class InsuranceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly paymentsService: PaymentsService,
  ) {}

  // ---------------------------------------------------------------- policies

  async createPolicy(organizationId: string, actorId: string, input: CreateInsurancePolicyInput) {
    return this.prisma.withTenant(organizationId, async (tx) => {
      const patient = await tx.patient.findFirst({
        where: { id: input.patientId, deletedAt: null },
      });
      if (!patient) {
        throw new NotFoundException('Patient not found.');
      }
      if (input.cardDocumentId) {
        const doc = await tx.patientDocument.findFirst({
          where: { id: input.cardDocumentId, deletedAt: null },
        });
        if (
          !doc ||
          doc.patientId !== patient.id ||
          doc.documentType !== PatientDocumentType.INSURANCE_CARD
        ) {
          throw new BadRequestException(
            "cardDocumentId must be this patient's INSURANCE_CARD document.",
          );
        }
      }

      const policy = await tx.insurancePolicy.create({
        data: {
          organizationId,
          patientId: patient.id,
          insurerName: input.insurerName,
          tpaName: input.tpaName,
          policyNumber: input.policyNumber,
          memberId: input.memberId,
          sumInsuredMinor: input.sumInsuredMinor,
          validFrom: input.validFrom ? toDbDate(input.validFrom) : undefined,
          validTo: input.validTo ? toDbDate(input.validTo) : undefined,
          cardDocumentId: input.cardDocumentId,
        },
      });

      await this.auditService.record(tx, organizationId, {
        actorType: 'USER',
        actorId,
        action: 'insurance.policy_create',
        entityType: 'InsurancePolicy',
        entityId: policy.id,
        metadata: { patientId: patient.id, hasCardDocument: Boolean(input.cardDocumentId) },
      });
      return policy;
    });
  }

  async listPolicies(organizationId: string, filter: { patientId?: string }) {
    return this.prisma.withTenant(organizationId, (tx) =>
      tx.insurancePolicy.findMany({
        where: { patientId: filter.patientId, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
    );
  }

  /** Patient-facing: their own policies (no internal ids beyond the policy's). */
  async listPoliciesForPatient(organizationId: string, patientId: string) {
    return this.prisma.withTenant(organizationId, (tx) =>
      tx.insurancePolicy.findMany({
        where: { patientId, deletedAt: null },
        select: {
          id: true,
          insurerName: true,
          tpaName: true,
          policyNumber: true,
          memberId: true,
          sumInsuredMinor: true,
          validFrom: true,
          validTo: true,
          isActive: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
    );
  }

  /**
   * Existing cases on a deactivated policy carry on; only new cases are
   * refused.
   */
  async deactivatePolicy(organizationId: string, actorId: string, policyId: string) {
    return this.prisma.withTenant(organizationId, async (tx) => {
      await tx.$queryRaw`SELECT id FROM insurance_policies WHERE id = ${policyId} FOR UPDATE`;
      const policy = await tx.insurancePolicy.findFirst({
        where: { id: policyId, deletedAt: null },
      });
      if (!policy) {
        throw new NotFoundException('Insurance policy not found.');
      }
      if (!policy.isActive) {
        throw new ConflictException('This policy is already inactive.');
      }
      const updated = await tx.insurancePolicy.update({
        where: { id: policyId },
        data: { isActive: false },
      });
      await this.auditService.record(tx, organizationId, {
        actorType: 'USER',
        actorId,
        action: 'insurance.policy_deactivate',
        entityType: 'InsurancePolicy',
        entityId: policyId,
        metadata: { patientId: policy.patientId },
      });
      return updated;
    });
  }

  // ------------------------------------------------------------------- cases

  async createCase(organizationId: string, actorId: string, input: CreateInsuranceCaseInput) {
    return this.prisma.withTenant(organizationId, async (tx) => {
      const policy = await tx.insurancePolicy.findFirst({
        where: { id: input.policyId, deletedAt: null },
      });
      if (!policy) {
        throw new NotFoundException('Insurance policy not found.');
      }
      if (!policy.isActive) {
        throw new ConflictException('This policy is inactive.');
      }
      const today = toDbDate(clinicDateString());
      if (
        (policy.validFrom && policy.validFrom > today) ||
        (policy.validTo && policy.validTo < today)
      ) {
        throw new ConflictException('This policy is not valid today.');
      }

      const patientId = policy.patientId;
      if (input.encounterId) {
        const encounter = await tx.encounter.findUnique({ where: { id: input.encounterId } });
        if (!encounter) throw new NotFoundException('Encounter not found.');
        if (encounter.patientId !== patientId) {
          throw new BadRequestException('Encounter belongs to a different patient.');
        }
      }
      if (input.procedureId) {
        const procedure = await tx.procedure.findUnique({ where: { id: input.procedureId } });
        if (!procedure) throw new NotFoundException('Procedure not found.');
        if (procedure.patientId !== patientId) {
          throw new BadRequestException('Procedure belongs to a different patient.');
        }
      }
      if (input.invoiceId) {
        const invoice = await tx.invoice.findUnique({ where: { id: input.invoiceId } });
        if (!invoice) throw new NotFoundException('Invoice not found.');
        if (invoice.patientId !== patientId) {
          throw new BadRequestException('Invoice belongs to a different patient.');
        }
        if (invoice.status === InvoiceStatus.VOID) {
          throw new ConflictException('This invoice is void.');
        }
      }

      const created = await tx.insuranceCase.create({
        data: {
          organizationId,
          patientId,
          policyId: policy.id,
          encounterId: input.encounterId,
          procedureId: input.procedureId,
          invoiceId: input.invoiceId,
          requestedAmountMinor: input.requestedAmountMinor,
          status: S.ELIGIBILITY_CHECK,
          createdById: actorId,
        },
      });
      await tx.insuranceCaseEvent.create({
        data: {
          organizationId,
          caseId: created.id,
          fromStatus: null,
          toStatus: S.ELIGIBILITY_CHECK,
          amountMinor: input.requestedAmountMinor,
          actorId,
        },
      });
      await this.auditService.record(tx, organizationId, {
        actorType: 'USER',
        actorId,
        action: 'insurance.case_create',
        entityType: 'InsuranceCase',
        entityId: created.id,
        metadata: {
          patientId,
          policyId: policy.id,
          encounterId: input.encounterId ?? null,
          procedureId: input.procedureId ?? null,
          invoiceId: input.invoiceId ?? null,
          requestedAmountMinor: input.requestedAmountMinor ?? null,
        },
      });
      return this.loadCase(tx, created.id);
    });
  }

  async listCases(
    organizationId: string,
    filter: { status?: InsuranceCaseStatus; patientId?: string },
  ) {
    return this.prisma.withTenant(organizationId, (tx) =>
      tx.insuranceCase.findMany({
        where: { status: filter.status, patientId: filter.patientId },
        include: CASE_INCLUDE,
        orderBy: { updatedAt: 'desc' },
        take: 200,
      }),
    );
  }

  async getCase(organizationId: string, caseId: string) {
    return this.prisma.withTenant(organizationId, (tx) => this.loadCase(tx, caseId));
  }

  async transition(
    organizationId: string,
    actorId: string,
    caseId: string,
    input: InsuranceTransitionInput,
  ) {
    return this.mutate(organizationId, caseId, async (tx, current) => {
      const toStatus = input.toStatus as InsuranceCaseStatus;
      if (!TRANSITIONS[current.status].includes(toStatus)) {
        throw new ConflictException(`Cannot move a case from ${current.status} to ${toStatus}.`);
      }
      if (NEEDS_APPROVED_AMOUNT.includes(toStatus) && input.amountMinor === undefined) {
        throw new BadRequestException(
          `amountMinor (the approved amount) is required for ${toStatus}.`,
        );
      }

      await tx.insuranceCase.update({
        where: { id: caseId },
        data: {
          status: toStatus,
          ...(NEEDS_APPROVED_AMOUNT.includes(toStatus)
            ? { approvedAmountMinor: input.amountMinor }
            : {}),
          ...(toStatus === S.PRE_AUTH_REQUESTED && input.reference
            ? { preAuthReference: input.reference }
            : {}),
          ...(toStatus === S.CLAIM_SUBMITTED && input.reference
            ? { claimReference: input.reference }
            : {}),
        },
      });
      await tx.insuranceCaseEvent.create({
        data: {
          organizationId,
          caseId,
          fromStatus: current.status,
          toStatus,
          amountMinor: input.amountMinor,
          note: input.note,
          actorId,
        },
      });
      await this.auditService.record(tx, organizationId, {
        actorType: 'USER',
        actorId,
        action: 'insurance.case_transition',
        entityType: 'InsuranceCase',
        entityId: caseId,
        metadata: {
          from: current.status,
          to: toStatus,
          amountMinor: input.amountMinor ?? null,
        },
      });
      return this.loadCase(tx, caseId);
    });
  }

  /** A communication-log entry with no status change. */
  async addNote(
    organizationId: string,
    actorId: string,
    caseId: string,
    input: InsuranceCaseNoteInput,
  ) {
    return this.mutate(organizationId, caseId, async (tx, current) => {
      const event = await tx.insuranceCaseEvent.create({
        data: {
          organizationId,
          caseId,
          fromStatus: current.status,
          toStatus: current.status,
          note: input.note,
          actorId,
        },
      });
      await this.auditService.record(tx, organizationId, {
        actorType: 'USER',
        actorId,
        action: 'insurance.case_note',
        entityType: 'InsuranceCase',
        entityId: caseId,
        metadata: { eventId: event.id, status: current.status },
      });
      return event;
    });
  }

  /**
   * Records the insurer's settlement as a Payment (method INSURANCE)
   * against the case's invoice, in the same transaction as the case
   * moving to SETTLED. The invoice's outstanding-balance rule still
   * applies (PaymentsService.recordInTx throws 409 on overpayment).
   */
  async settle(
    organizationId: string,
    actorId: string,
    caseId: string,
    input: SettleInsuranceCaseInput,
  ) {
    return this.mutate(organizationId, caseId, async (tx, current) => {
      if (!SETTLEABLE.includes(current.status)) {
        throw new ConflictException(`Cannot settle a case in ${current.status}.`);
      }
      if (!current.invoiceId) {
        throw new ConflictException('This case has no linked invoice to settle against.');
      }
      if (current.approvedAmountMinor === null || input.amountMinor > current.approvedAmountMinor) {
        throw new ConflictException(
          `Settlement exceeds the approved amount (${current.approvedAmountMinor ?? 0} minor units).`,
        );
      }

      const { payment } = await this.paymentsService.recordInTx(
        tx,
        organizationId,
        actorId,
        current.invoiceId,
        {
          method: PaymentMethod.INSURANCE,
          amountMinor: input.amountMinor,
          reference: input.reference,
        },
      );

      await tx.insuranceCase.update({
        where: { id: caseId },
        data: { status: S.SETTLED, settledAmountMinor: input.amountMinor },
      });
      await tx.insuranceCaseEvent.create({
        data: {
          organizationId,
          caseId,
          fromStatus: current.status,
          toStatus: S.SETTLED,
          amountMinor: input.amountMinor,
          actorId,
        },
      });
      await this.auditService.record(tx, organizationId, {
        actorType: 'USER',
        actorId,
        action: 'insurance.case_settle',
        entityType: 'InsuranceCase',
        entityId: caseId,
        metadata: {
          from: current.status,
          invoiceId: current.invoiceId,
          paymentId: payment.id,
          amountMinor: input.amountMinor,
        },
      });
      return { case: await this.loadCase(tx, caseId), payment };
    });
  }

  // ----------------------------------------------------------------- helpers

  private async mutate<T>(
    organizationId: string,
    caseId: string,
    work: (tx: ExtendedPrismaClient, current: InsuranceCase) => Promise<T>,
  ): Promise<T> {
    return this.prisma.withTenant(organizationId, async (tx) => {
      await tx.$queryRaw`SELECT id FROM insurance_cases WHERE id = ${caseId} FOR UPDATE`;
      const current = await tx.insuranceCase.findUnique({ where: { id: caseId } });
      if (!current) {
        throw new NotFoundException('Insurance case not found.');
      }
      return work(tx, current);
    });
  }

  private async loadCase(tx: ExtendedPrismaClient, caseId: string) {
    const found = await tx.insuranceCase.findUnique({
      where: { id: caseId },
      include: {
        ...CASE_INCLUDE,
        events: {
          orderBy: { createdAt: 'asc' },
          include: { actor: { select: { id: true, fullName: true } } },
        },
      },
    });
    if (!found) {
      throw new NotFoundException('Insurance case not found.');
    }
    return found;
  }
}
