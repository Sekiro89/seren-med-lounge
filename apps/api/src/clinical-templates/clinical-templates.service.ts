import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ClinicalNoteType, type ClinicalTemplate, type Prisma } from '@prisma/client';
import type {
  CreateClinicalTemplateInput,
  CreateClinicalTemplateVersionInput,
} from '@serenemed/validation';
import { PrismaService, type ExtendedPrismaClient } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

const SUMMARY_SELECT = {
  id: true,
  name: true,
  noteType: true,
  specialty: true,
  isActive: true,
  currentVersion: true,
  createdAt: true,
  updatedAt: true,
} as const;

/**
 * Clinical templates: a mutable header (name, noteType, active flag,
 * currentVersion pointer) over append-only ClinicalTemplateVersion rows
 * (UPDATE/DELETE revoked from the app role). Editing a template means
 * appending a version; notes record the exact version they started from
 * (ClinicalNote.templateVersionId), so an older version stays readable
 * and usable after a new one is published.
 *
 * Audit metadata carries ids, noteType and version numbers only — never
 * the template body (it can hold clinical default text).
 */
@Injectable()
export class ClinicalTemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async create(organizationId: string, actorId: string, input: CreateClinicalTemplateInput) {
    return this.prisma.withTenant(organizationId, async (tx) => {
      const template = await tx.clinicalTemplate.create({
        data: {
          organizationId,
          name: input.name,
          noteType: input.noteType,
          specialty: input.specialty,
          currentVersion: 1,
          createdById: actorId,
        },
      });
      const version = await tx.clinicalTemplateVersion.create({
        data: {
          organizationId,
          templateId: template.id,
          version: 1,
          body: input.body as Prisma.InputJsonValue,
          createdById: actorId,
        },
      });
      await this.audit(tx, organizationId, actorId, 'clinical_template.create', template, {
        versionId: version.id,
        version: 1,
      });
      return { ...template, currentVersionId: version.id, body: version.body };
    });
  }

  async list(organizationId: string, filter: { noteType?: ClinicalNoteType; active?: boolean }) {
    return this.prisma.withTenant(organizationId, async (tx) => {
      const templates = await tx.clinicalTemplate.findMany({
        where: { deletedAt: null, noteType: filter.noteType, isActive: filter.active },
        select: SUMMARY_SELECT,
        orderBy: [{ noteType: 'asc' }, { name: 'asc' }],
        take: 200,
      });
      // Attach the current version's id so a doctor can start a note
      // from a list entry without a second round trip.
      const versions = await tx.clinicalTemplateVersion.findMany({
        where: {
          OR: templates.map((t) => ({ templateId: t.id, version: t.currentVersion })),
        },
        select: { id: true, templateId: true },
      });
      const byTemplate = new Map(versions.map((v) => [v.templateId, v.id]));
      return templates.map((t) => ({ ...t, currentVersionId: byTemplate.get(t.id) ?? null }));
    });
  }

  async get(organizationId: string, templateId: string) {
    return this.prisma.withTenant(organizationId, async (tx) => {
      const template = await tx.clinicalTemplate.findFirst({
        where: { id: templateId, deletedAt: null },
        select: {
          ...SUMMARY_SELECT,
          versions: {
            select: { id: true, version: true, createdAt: true, createdById: true },
            orderBy: { version: 'desc' },
          },
        },
      });
      if (!template) {
        throw new NotFoundException('Clinical template not found.');
      }
      const current = await tx.clinicalTemplateVersion.findUnique({
        where: { templateId_version: { templateId, version: template.currentVersion } },
      });
      return { ...template, currentVersionId: current?.id ?? null, body: current?.body ?? null };
    });
  }

  /** Fetch one specific (possibly older) version, body included. */
  async getVersion(organizationId: string, templateId: string, version: number) {
    const row = await this.prisma.withTenant(organizationId, (tx) =>
      tx.clinicalTemplateVersion.findUnique({
        where: { templateId_version: { templateId, version } },
      }),
    );
    if (!row) {
      throw new NotFoundException('Template version not found.');
    }
    return row;
  }

  /** Appends version currentVersion+1 under a row lock on the header. */
  async addVersion(
    organizationId: string,
    actorId: string,
    templateId: string,
    input: CreateClinicalTemplateVersionInput,
  ) {
    return this.prisma.withTenant(organizationId, async (tx) => {
      const template = await this.lock(tx, templateId);
      const nextVersion = template.currentVersion + 1;
      const version = await tx.clinicalTemplateVersion.create({
        data: {
          organizationId,
          templateId,
          version: nextVersion,
          body: input.body as Prisma.InputJsonValue,
          createdById: actorId,
        },
      });
      const updated = await tx.clinicalTemplate.update({
        where: { id: templateId },
        data: { currentVersion: nextVersion },
      });
      await this.audit(tx, organizationId, actorId, 'clinical_template.version', updated, {
        versionId: version.id,
        version: nextVersion,
      });
      return { ...updated, currentVersionId: version.id, body: version.body };
    });
  }

  async setActive(organizationId: string, actorId: string, templateId: string, active: boolean) {
    return this.prisma.withTenant(organizationId, async (tx) => {
      const template = await this.lock(tx, templateId);
      if (template.isActive === active) {
        throw new ConflictException(
          active ? 'Template is already active.' : 'Template is already inactive.',
        );
      }
      const updated = await tx.clinicalTemplate.update({
        where: { id: templateId },
        data: { isActive: active },
        select: SUMMARY_SELECT,
      });
      await this.audit(
        tx,
        organizationId,
        actorId,
        active ? 'clinical_template.activate' : 'clinical_template.deactivate',
        template,
        {},
      );
      return updated;
    });
  }

  private async lock(tx: ExtendedPrismaClient, templateId: string): Promise<ClinicalTemplate> {
    await tx.$queryRaw`SELECT id FROM clinical_templates WHERE id = ${templateId} FOR UPDATE`;
    const template = await tx.clinicalTemplate.findUnique({ where: { id: templateId } });
    if (!template || template.deletedAt) {
      throw new NotFoundException('Clinical template not found.');
    }
    return template;
  }

  private audit(
    tx: ExtendedPrismaClient,
    organizationId: string,
    actorId: string,
    action: string,
    template: ClinicalTemplate,
    extra: Record<string, unknown>,
  ) {
    return this.auditService.record(tx, organizationId, {
      actorType: 'USER',
      actorId,
      action,
      entityType: 'ClinicalTemplate',
      entityId: template.id,
      metadata: { noteType: template.noteType, ...extra },
    });
  }
}
