import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CampaignStatus, LeadStatus, type Campaign, type CampaignType } from '@prisma/client';
import type { CampaignStatusInput, CreateCampaignInput } from '@serenemed/validation';
import { PrismaService, type ExtendedPrismaClient } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

/** Allowed status moves: PLANNED -> ACTIVE -> COMPLETED; PLANNED/ACTIVE -> CANCELLED. */
const TRANSITIONS: Record<CampaignStatus, CampaignStatus[]> = {
  PLANNED: [CampaignStatus.ACTIVE, CampaignStatus.CANCELLED],
  ACTIVE: [CampaignStatus.COMPLETED, CampaignStatus.CANCELLED],
  COMPLETED: [],
  CANCELLED: [],
};

/**
 * Marketing campaigns, including health camps (type HEALTH_CAMP — always
 * carries a location and startsAt, enforced by createCampaignSchema).
 * The campaign detail carries the funnel: its leads counted by status.
 */
@Injectable()
export class CampaignsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async create(organizationId: string, actorId: string, input: CreateCampaignInput) {
    return this.prisma.withTenant(organizationId, async (tx) => {
      const campaign = await tx.campaign.create({
        data: {
          organizationId,
          name: input.name,
          type: input.type,
          channel: input.channel,
          startsAt: input.startsAt ? new Date(input.startsAt) : undefined,
          endsAt: input.endsAt ? new Date(input.endsAt) : undefined,
          location: input.location,
          budgetMinor: input.budgetMinor,
          notes: input.notes,
          createdById: actorId,
        },
      });
      await this.audit(tx, organizationId, actorId, 'campaign.create', campaign, {
        budgetMinor: campaign.budgetMinor,
      });
      return campaign;
    });
  }

  async list(organizationId: string, filter: { status?: CampaignStatus; type?: CampaignType }) {
    return this.prisma.withTenant(organizationId, (tx) =>
      tx.campaign.findMany({
        where: { status: filter.status, type: filter.type },
        include: { _count: { select: { leads: { where: { deletedAt: null } } } } },
        orderBy: [{ startsAt: 'desc' }, { createdAt: 'desc' }],
        take: 200,
      }),
    );
  }

  /** The campaign plus its funnel: lead counts for every LeadStatus (zeros included). */
  async get(organizationId: string, campaignId: string) {
    return this.prisma.withTenant(organizationId, async (tx) => {
      const campaign = await tx.campaign.findFirst({
        where: { id: campaignId },
        include: { createdBy: { select: { id: true, fullName: true } } },
      });
      if (!campaign) {
        throw new NotFoundException('Campaign not found.');
      }
      const grouped = await tx.lead.groupBy({
        by: ['status'],
        where: { campaignId, deletedAt: null },
        _count: { _all: true },
      });
      const funnel = Object.fromEntries(
        Object.values(LeadStatus).map((status) => [status, 0]),
      ) as Record<LeadStatus, number>;
      for (const row of grouped) {
        funnel[row.status] = row._count._all;
      }
      const totalLeads = Object.values(funnel).reduce((sum, n) => sum + n, 0);
      return { ...campaign, funnel, totalLeads };
    });
  }

  async setStatus(
    organizationId: string,
    actorId: string,
    campaignId: string,
    input: CampaignStatusInput,
  ) {
    return this.prisma.withTenant(organizationId, async (tx) => {
      await tx.$queryRaw`SELECT id FROM campaigns WHERE id = ${campaignId} FOR UPDATE`;
      const campaign = await tx.campaign.findFirst({ where: { id: campaignId } });
      if (!campaign) {
        throw new NotFoundException('Campaign not found.');
      }
      const to = input.status as CampaignStatus;
      if (!TRANSITIONS[campaign.status].includes(to)) {
        throw new ConflictException(`Cannot move a ${campaign.status} campaign to ${to}.`);
      }
      const updated = await tx.campaign.update({
        where: { id: campaign.id },
        data: { status: to },
      });
      await this.audit(tx, organizationId, actorId, 'campaign.status', campaign, {
        from: campaign.status,
        to,
      });
      return updated;
    });
  }

  private audit(
    tx: ExtendedPrismaClient,
    organizationId: string,
    actorId: string,
    action: string,
    campaign: Campaign,
    metadata: Record<string, unknown>,
  ) {
    return this.auditService.record(tx, organizationId, {
      actorType: 'USER',
      actorId,
      action,
      entityType: 'Campaign',
      entityId: campaign.id,
      metadata: { type: campaign.type, ...metadata },
    });
  }
}
