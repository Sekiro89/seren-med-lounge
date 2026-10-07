import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CampaignType,
  LeadActivityType,
  LeadSource,
  LeadStatus,
  PatientConsentAction,
  PatientConsentType,
  Prisma,
  type Lead,
} from '@prisma/client';
import type {
  ConvertLeadInput,
  CreateLeadInput,
  LeadActivityInput,
  LeadStatusInput,
} from '@serenemed/validation';
import { PrismaService, type ExtendedPrismaClient } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PatientsService, type ReceptionRegisterResult } from '../patients/patients.service';

/** A lead is "open" until it converts or is lost. */
const CLOSED: LeadStatus[] = [LeadStatus.CONVERTED, LeadStatus.LOST];

/** Activity types that reach out to the lead — refused without consentToContact. */
const OUTREACH: LeadActivityType[] = [
  LeadActivityType.CALL,
  LeadActivityType.MESSAGE,
  LeadActivityType.EMAIL,
  LeadActivityType.EDUCATION_SENT,
];

/** Any real touchpoint (everything but an internal NOTE) moves a NEW lead to CONTACTED. */
const CONTACT: LeadActivityType[] = [...OUTREACH, LeadActivityType.MEETING];

/**
 * Manual status moves (POST /leads/:id/status). CONVERTED is reachable
 * only through convert(); a LOST lead can be re-opened into NURTURING.
 */
const STATUS_TRANSITIONS: Record<LeadStatus, LeadStatus[]> = {
  NEW: [LeadStatus.NURTURING, LeadStatus.APPOINTMENT_BOOKED, LeadStatus.LOST],
  CONTACTED: [LeadStatus.NURTURING, LeadStatus.APPOINTMENT_BOOKED, LeadStatus.LOST],
  NURTURING: [LeadStatus.APPOINTMENT_BOOKED, LeadStatus.LOST],
  APPOINTMENT_BOOKED: [LeadStatus.NURTURING, LeadStatus.LOST],
  LOST: [LeadStatus.NURTURING],
  CONVERTED: [],
};

const LIST_INCLUDE = {
  owner: { select: { id: true, fullName: true } },
  campaign: { select: { id: true, name: true, type: true } },
} as const;

const DETAIL_INCLUDE = {
  ...LIST_INCLUDE,
  referredByPatient: { select: { id: true, firstName: true, lastName: true } },
  convertedPatient: { select: { id: true, firstName: true, lastName: true } },
  activities: {
    orderBy: { createdAt: 'asc' },
    include: { actor: { select: { id: true, fullName: true } } },
  },
} as const;

export type ConvertLeadResult =
  | {
      converted: true;
      /** How the patient was found: given patientId, newly created, or matched an existing record. */
      via: 'patient_id' | 'created' | 'existing';
      patientId: string;
      lead: Lead;
    }
  | {
      converted: false;
      /** possible_match / ambiguous_match — resolve the claim, then convert with {patientId}. */
      registration: Extract<
        ReceptionRegisterResult,
        { kind: 'possible_match' | 'ambiguous_match' }
      >;
      lead: Lead;
    };

/**
 * Leads: prospective patients and their nurture log (lead_activities is
 * append-only at the DB). Contact consent lives on the lead itself until
 * conversion, when it carries over as a MARKETING_COMMUNICATION
 * PatientConsent. Conversion goes through PatientsService.register's
 * duplicate detection — never a parallel patient record.
 */
@Injectable()
export class LeadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly patientsService: PatientsService,
  ) {}

  async create(organizationId: string, actorId: string, input: CreateLeadInput) {
    return this.prisma.withTenant(organizationId, async (tx) => {
      if (input.campaignId) {
        const campaign = await tx.campaign.findFirst({ where: { id: input.campaignId } });
        if (!campaign) {
          throw new BadRequestException('campaignId must be a campaign of this organization.');
        }
        if (input.source === LeadSource.CAMP && campaign.type !== CampaignType.HEALTH_CAMP) {
          throw new BadRequestException('A CAMP lead must reference a HEALTH_CAMP campaign.');
        }
      }
      if (input.referredByPatientId) {
        const referrer = await tx.patient.findFirst({ where: { id: input.referredByPatientId } });
        if (!referrer) {
          throw new BadRequestException('referredByPatientId must be a patient of this clinic.');
        }
      }
      if (input.ownerId) {
        await this.assertActiveStaff(tx, organizationId, input.ownerId);
      }

      // TODO(product): duplicate open leads are only warned about, never
      // blocked — the same person can legitimately enquire twice via
      // different campaigns. Revisit (merge? block?) with marketing.
      const duplicates = await tx.lead.findMany({
        where: { phone: input.phone, status: { notIn: CLOSED } },
        select: { id: true },
      });
      const possibleDuplicateLeadIds = duplicates.map((d) => d.id);

      const lead = await tx.lead.create({
        data: {
          organizationId,
          firstName: input.firstName,
          lastName: input.lastName,
          phone: input.phone,
          email: input.email,
          source: input.source,
          campaignId: input.campaignId,
          referredByPatientId: input.referredByPatientId,
          ownerId: input.ownerId,
          enquiry: input.enquiry,
          consentToContact: input.consentToContact,
          consentRecordedAt: input.consentToContact ? new Date() : null,
        },
        include: LIST_INCLUDE,
      });
      await this.audit(tx, organizationId, actorId, 'lead.create', lead, {
        consentToContact: lead.consentToContact,
        ownerId: lead.ownerId,
        referredByPatientId: lead.referredByPatientId,
        possibleDuplicateLeadIds,
      });
      return { ...lead, possibleDuplicateLeadIds };
    });
  }

  /** `due` bounds nextFollowUpAt to [from, to) — the clinic-local day. */
  async list(
    organizationId: string,
    filter: {
      status?: LeadStatus;
      source?: LeadSource;
      campaignId?: string;
      ownerId?: string;
      due?: { from: Date; to: Date };
    },
  ) {
    return this.prisma.withTenant(organizationId, (tx) =>
      tx.lead.findMany({
        where: {
          status: filter.status,
          source: filter.source,
          campaignId: filter.campaignId,
          ownerId: filter.ownerId,
          nextFollowUpAt: filter.due ? { gte: filter.due.from, lt: filter.due.to } : undefined,
        },
        include: LIST_INCLUDE,
        orderBy: filter.due ? { nextFollowUpAt: 'asc' } : { createdAt: 'desc' },
        take: 200,
      }),
    );
  }

  async get(organizationId: string, leadId: string) {
    const lead = await this.prisma.withTenant(organizationId, (tx) =>
      tx.lead.findFirst({ where: { id: leadId }, include: DETAIL_INCLUDE }),
    );
    if (!lead) {
      throw new NotFoundException('Lead not found.');
    }
    return lead;
  }

  async addActivity(
    organizationId: string,
    actorId: string,
    leadId: string,
    input: LeadActivityInput,
  ) {
    return this.mutate(organizationId, leadId, async (tx, lead) => {
      if (CLOSED.includes(lead.status)) {
        throw new ConflictException(`Not allowed while the lead is ${lead.status}.`);
      }
      const type = input.type as LeadActivityType;
      if (OUTREACH.includes(type) && !lead.consentToContact) {
        throw new ConflictException('This lead has not consented to be contacted.');
      }

      const activity = await tx.leadActivity.create({
        data: { organizationId, leadId: lead.id, type, notes: input.notes, actorId },
      });

      const becomesContacted = lead.status === LeadStatus.NEW && CONTACT.includes(type);
      if (becomesContacted) {
        await this.recordStatusChange(tx, organizationId, actorId, lead, LeadStatus.CONTACTED);
      }
      const updated = await tx.lead.update({
        where: { id: lead.id },
        data: {
          ...(becomesContacted ? { status: LeadStatus.CONTACTED } : {}),
          ...(input.nextFollowUpAt ? { nextFollowUpAt: new Date(input.nextFollowUpAt) } : {}),
        },
        include: LIST_INCLUDE,
      });
      await this.audit(tx, organizationId, actorId, 'lead.activity', lead, {
        activityId: activity.id,
        type,
        nextFollowUpAt: input.nextFollowUpAt ?? null,
        ...(becomesContacted ? { from: lead.status, to: LeadStatus.CONTACTED } : {}),
      });
      return { activity, lead: updated };
    });
  }

  async setStatus(organizationId: string, actorId: string, leadId: string, input: LeadStatusInput) {
    return this.mutate(organizationId, leadId, async (tx, lead) => {
      const to = input.status as LeadStatus;
      if (!STATUS_TRANSITIONS[lead.status].includes(to)) {
        throw new ConflictException(`Cannot move a ${lead.status} lead to ${to}.`);
      }
      // The lost reason is kept on the lead and in the STATUS_CHANGE
      // activity's notes — never in the audit metadata (free text).
      await this.recordStatusChange(
        tx,
        organizationId,
        actorId,
        lead,
        to,
        to === LeadStatus.LOST ? input.lostReason : undefined,
      );
      const updated = await tx.lead.update({
        where: { id: lead.id },
        data:
          to === LeadStatus.LOST
            ? { status: to, lostReason: input.lostReason, nextFollowUpAt: null }
            : { status: to, lostReason: null },
        include: LIST_INCLUDE,
      });
      await this.audit(tx, organizationId, actorId, 'lead.status', lead, {
        from: lead.status,
        to,
      });
      return updated;
    });
  }

  /**
   * Turns a lead into exactly one Patient.
   *
   * `{patientId}` links an existing patient directly. Otherwise the
   * patient is found-or-created through PatientsService.register — the
   * same duplicate detection Reception uses:
   *   - `created` / `existing` → the lead is linked to that patient;
   *   - `possible_match` / `ambiguous_match` → the lead is NOT converted;
   *     the claim request register() opened is returned so staff resolve
   *     it first, then convert again with `{patientId}`.
   *
   * Two transactions, deliberately: register() opens its own withTenant
   * transaction (and its own identity lock), so it can't run inside ours.
   * The link step is therefore a second transaction that re-locks the
   * lead and re-checks its status. That makes it safe to retry: if a
   * concurrent convert already linked this lead to the SAME patient the
   * call is a no-op success; to a different one it's a 409. A patient
   * register() created whose link then fails is not orphaned — it's a
   * real patient record and a retry will match it as `existing`.
   */
  async convert(
    organizationId: string,
    actorId: string,
    leadId: string,
    input: ConvertLeadInput,
  ): Promise<ConvertLeadResult> {
    if ('patientId' in input) {
      return this.link(organizationId, actorId, leadId, input.patientId, 'patient_id');
    }

    const lead = await this.prisma.withTenant(organizationId, (tx) =>
      tx.lead.findFirst({ where: { id: leadId } }),
    );
    if (!lead) {
      throw new NotFoundException('Lead not found.');
    }
    if (lead.status === LeadStatus.CONVERTED) {
      throw new ConflictException('This lead is already converted.');
    }
    const lastName = input.lastName ?? lead.lastName;
    if (!lastName) {
      throw new BadRequestException('lastName is required to register this lead as a patient.');
    }

    const registration = await this.patientsService.register(organizationId, actorId, {
      firstName: input.firstName ?? lead.firstName,
      lastName,
      phone: input.phone ?? lead.phone,
      email: input.email ?? lead.email ?? undefined,
      dateOfBirth: input.dateOfBirth,
    });

    if (registration.kind === 'created' || registration.kind === 'existing') {
      return this.link(organizationId, actorId, leadId, registration.patient.id, registration.kind);
    }

    await this.prisma.withTenant(organizationId, (tx) =>
      this.audit(tx, organizationId, actorId, 'lead.convert_needs_review', lead, {
        outcome: registration.kind,
        claimRequestId: registration.claimRequestId,
      }),
    );
    return { converted: false, registration, lead };
  }

  /** The link step of convert() — its own transaction, idempotent for the same patient. */
  private async link(
    organizationId: string,
    actorId: string,
    leadId: string,
    patientId: string,
    via: 'patient_id' | 'created' | 'existing',
  ): Promise<ConvertLeadResult> {
    try {
      return await this.mutate(organizationId, leadId, async (tx, lead) => {
        if (lead.status === LeadStatus.CONVERTED) {
          if (lead.convertedPatientId === patientId) {
            return { converted: true as const, via, patientId, lead };
          }
          throw new ConflictException('This lead is already converted.');
        }
        const patient = await tx.patient.findFirst({ where: { id: patientId } });
        if (!patient) {
          throw new NotFoundException('Patient not found.');
        }
        const other = await tx.lead.findFirst({
          where: { convertedPatientId: patientId },
          select: { id: true },
        });
        if (other) {
          throw new ConflictException('That patient is already linked to another lead.');
        }

        await this.recordStatusChange(tx, organizationId, actorId, lead, LeadStatus.CONVERTED);
        const updated = await tx.lead.update({
          where: { id: lead.id },
          data: {
            status: LeadStatus.CONVERTED,
            convertedPatientId: patientId,
            convertedAt: new Date(),
            nextFollowUpAt: null,
          },
        });
        if (lead.consentToContact) {
          await tx.patientConsent.create({
            data: {
              organizationId,
              patientId,
              consentType: PatientConsentType.MARKETING_COMMUNICATION,
              action: PatientConsentAction.GRANTED,
              recordedById: actorId,
            },
          });
        }
        await this.audit(tx, organizationId, actorId, 'lead.convert', lead, {
          from: lead.status,
          to: LeadStatus.CONVERTED,
          patientId,
          via,
          marketingConsentCarried: lead.consentToContact,
        });
        return { converted: true as const, via, patientId, lead: updated };
      });
    } catch (error) {
      // convertedPatientId is @unique: a concurrent convert of another
      // lead to the same patient loses here.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('That patient is already linked to another lead.');
      }
      throw error;
    }
  }

  private async assertActiveStaff(
    tx: ExtendedPrismaClient,
    organizationId: string,
    userId: string,
  ) {
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user || user.organizationId !== organizationId || !user.isActive) {
      throw new BadRequestException('ownerId must be an active staff member.');
    }
  }

  private recordStatusChange(
    tx: ExtendedPrismaClient,
    organizationId: string,
    actorId: string,
    lead: Lead,
    to: LeadStatus,
    reason?: string,
  ) {
    return tx.leadActivity.create({
      data: {
        organizationId,
        leadId: lead.id,
        type: LeadActivityType.STATUS_CHANGE,
        notes: reason ? `${lead.status} -> ${to}: ${reason}` : `${lead.status} -> ${to}`,
        actorId,
      },
    });
  }

  /** Locks the lead row, then runs `work` with the fresh row. */
  private async mutate<T>(
    organizationId: string,
    leadId: string,
    work: (tx: ExtendedPrismaClient, lead: Lead) => Promise<T>,
  ): Promise<T> {
    return this.prisma.withTenant(organizationId, async (tx) => {
      await tx.$queryRaw`SELECT id FROM leads WHERE id = ${leadId} FOR UPDATE`;
      const lead = await tx.lead.findFirst({ where: { id: leadId } });
      if (!lead) {
        throw new NotFoundException('Lead not found.');
      }
      return work(tx, lead);
    });
  }

  /** Metadata is ids/statuses only — never names, phone, enquiry or activity notes. */
  private audit(
    tx: ExtendedPrismaClient,
    organizationId: string,
    actorId: string,
    action: string,
    lead: Lead,
    metadata: Record<string, unknown>,
  ) {
    return this.auditService.record(tx, organizationId, {
      actorType: 'USER',
      actorId,
      action,
      entityType: 'Lead',
      entityId: lead.id,
      metadata: { source: lead.source, campaignId: lead.campaignId, ...metadata },
    });
  }
}
