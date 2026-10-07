import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  PatientDocumentType,
  ProcedureKind,
  ProcedureStatus,
  StaffRole,
  type Procedure,
} from '@prisma/client';
import { roleHasPermission } from '@serenemed/permissions';
import type { StaffRole as AppStaffRole } from '@serenemed/types';
import type {
  AddChecklistItemInput,
  AttachConsentInput,
  CancelProcedureInput,
  CreateProcedureInput,
  ProcedureEstimateInput,
  ScheduleProcedureInput,
  SetChecklistItemInput,
} from '@serenemed/validation';
import { PrismaService, type ExtendedPrismaClient } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

/** The caller's role as carried in the JWT (null for a patient). */
type ActorRole = AppStaffRole | null;

const PERFORMER_ROLES: StaffRole[] = [StaffRole.JUNIOR_DOCTOR, StaffRole.SENIOR_DOCTOR];
const EDITABLE: ProcedureStatus[] = [ProcedureStatus.PLANNED, ProcedureStatus.SCHEDULED];

const DETAIL_INCLUDE = {
  checklist: { orderBy: { createdAt: 'asc' } },
  performedBy: { select: { id: true, fullName: true } },
  patient: { select: { id: true, firstName: true, lastName: true } },
} as const;

/**
 * Procedures and surgeries (kind = SURGERY). Every route is gated by
 * procedure:manage; acting on a SURGERY additionally needs
 * surgery:manage, checked here because it depends on the row, not the
 * route.
 *
 * Start is the safety gate: it requires a CONSENT_FORM document attached
 * and every pre-op checklist line ticked. OT notes and the discharge
 * summary are ClinicalNotes (noteType OPERATIVE / DISCHARGE_SUMMARY,
 * linked by procedureId) so they get sign-off and amendment history.
 */
@Injectable()
export class ProceduresService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async create(
    organizationId: string,
    actor: { id: string; role: ActorRole },
    input: CreateProcedureInput,
  ) {
    this.assertKindAllowed(actor.role, input.kind);
    return this.prisma.withTenant(organizationId, async (tx) => {
      const encounter = await tx.encounter.findUnique({ where: { id: input.encounterId } });
      if (!encounter) {
        throw new NotFoundException('Encounter not found.');
      }

      const procedure = await tx.procedure.create({
        data: {
          organizationId,
          patientId: encounter.patientId,
          encounterId: encounter.id,
          kind: input.kind,
          name: input.name,
          notes: input.notes,
          estimateMinor: input.estimateMinor,
          createdById: actor.id,
          checklist: {
            create: (input.checklist ?? []).map((label) => ({ organizationId, label })),
          },
        },
        include: DETAIL_INCLUDE,
      });

      await this.audit(tx, organizationId, actor.id, 'procedure.create', procedure, {
        kind: input.kind,
        estimateMinor: input.estimateMinor ?? null,
      });
      return procedure;
    });
  }

  async get(organizationId: string, procedureId: string) {
    const procedure = await this.prisma.withTenant(organizationId, (tx) =>
      tx.procedure.findUnique({
        where: { id: procedureId },
        include: {
          ...DETAIL_INCLUDE,
          clinicalNotes: {
            include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1 } },
          },
        },
      }),
    );
    if (!procedure) {
      throw new NotFoundException('Procedure not found.');
    }
    return procedure;
  }

  /** `from`/`to` bound scheduledAt — the OT / procedure-room calendar. */
  async list(
    organizationId: string,
    filter: {
      patientId?: string;
      status?: ProcedureStatus;
      performedById?: string;
      from?: Date;
      to?: Date;
    },
  ) {
    return this.prisma.withTenant(organizationId, (tx) =>
      tx.procedure.findMany({
        where: {
          patientId: filter.patientId,
          status: filter.status,
          performedById: filter.performedById,
          scheduledAt: filter.from || filter.to ? { gte: filter.from, lt: filter.to } : undefined,
        },
        include: DETAIL_INCLUDE,
        orderBy: [{ scheduledAt: 'asc' }, { createdAt: 'asc' }],
        take: 200,
      }),
    );
  }

  /** Patient-facing: what's planned for them, the estimate, and its status. */
  async listForPatient(organizationId: string, patientId: string) {
    return this.prisma.withTenant(organizationId, (tx) =>
      tx.procedure.findMany({
        where: { patientId },
        select: {
          id: true,
          kind: true,
          name: true,
          status: true,
          estimateMinor: true,
          scheduledAt: true,
          location: true,
          performedBy: { select: { fullName: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
    );
  }

  async setEstimate(
    organizationId: string,
    actor: { id: string; role: ActorRole },
    procedureId: string,
    input: ProcedureEstimateInput,
  ) {
    return this.mutate(organizationId, actor, procedureId, EDITABLE, async (tx, procedure) => {
      const updated = await tx.procedure.update({
        where: { id: procedure.id },
        data: { estimateMinor: input.estimateMinor },
        include: DETAIL_INCLUDE,
      });
      await this.audit(tx, organizationId, actor.id, 'procedure.estimate', procedure, {
        from: procedure.estimateMinor,
        to: input.estimateMinor,
      });
      return updated;
    });
  }

  /** Also used to reschedule while still SCHEDULED. */
  async schedule(
    organizationId: string,
    actor: { id: string; role: ActorRole },
    procedureId: string,
    input: ScheduleProcedureInput,
  ) {
    return this.mutate(organizationId, actor, procedureId, EDITABLE, async (tx, procedure) => {
      const performer = await tx.user.findUnique({ where: { id: input.performedById } });
      if (!performer || !performer.isActive || !PERFORMER_ROLES.includes(performer.role)) {
        throw new BadRequestException('performedById must be an active doctor.');
      }
      const updated = await tx.procedure.update({
        where: { id: procedure.id },
        data: {
          status: ProcedureStatus.SCHEDULED,
          scheduledAt: new Date(input.scheduledAt),
          performedById: performer.id,
          location: input.location,
        },
        include: DETAIL_INCLUDE,
      });
      await this.audit(tx, organizationId, actor.id, 'procedure.schedule', procedure, {
        scheduledAt: input.scheduledAt,
        performedById: performer.id,
      });
      return updated;
    });
  }

  async attachConsent(
    organizationId: string,
    actor: { id: string; role: ActorRole },
    procedureId: string,
    input: AttachConsentInput,
  ) {
    return this.mutate(organizationId, actor, procedureId, EDITABLE, async (tx, procedure) => {
      const document = await tx.patientDocument.findUnique({ where: { id: input.documentId } });
      if (
        !document ||
        document.deletedAt ||
        document.patientId !== procedure.patientId ||
        document.documentType !== PatientDocumentType.CONSENT_FORM
      ) {
        throw new BadRequestException("documentId must be this patient's CONSENT_FORM document.");
      }
      const updated = await tx.procedure.update({
        where: { id: procedure.id },
        data: { consentDocumentId: document.id },
        include: DETAIL_INCLUDE,
      });
      await this.audit(tx, organizationId, actor.id, 'procedure.consent_attached', procedure, {
        documentId: document.id,
      });
      return updated;
    });
  }

  async addChecklistItem(
    organizationId: string,
    actor: { id: string; role: ActorRole },
    procedureId: string,
    input: AddChecklistItemInput,
  ) {
    return this.mutate(organizationId, actor, procedureId, EDITABLE, async (tx, procedure) => {
      const item = await tx.procedureChecklistItem.create({
        data: { organizationId, procedureId: procedure.id, label: input.label },
      });
      await this.audit(tx, organizationId, actor.id, 'procedure.checklist_added', procedure, {
        itemId: item.id,
      });
      return item;
    });
  }

  async setChecklistItem(
    organizationId: string,
    actor: { id: string; role: ActorRole },
    procedureId: string,
    itemId: string,
    input: SetChecklistItemInput,
  ) {
    return this.mutate(organizationId, actor, procedureId, EDITABLE, async (tx, procedure) => {
      const item = await tx.procedureChecklistItem.findUnique({ where: { id: itemId } });
      if (!item || item.procedureId !== procedure.id) {
        throw new NotFoundException('Checklist item not found.');
      }
      const updated = await tx.procedureChecklistItem.update({
        where: { id: itemId },
        data: input.done
          ? { completedAt: new Date(), completedById: actor.id }
          : { completedAt: null, completedById: null },
      });
      await this.audit(tx, organizationId, actor.id, 'procedure.checklist_set', procedure, {
        itemId,
        done: input.done,
      });
      return updated;
    });
  }

  async start(organizationId: string, actor: { id: string; role: ActorRole }, id: string) {
    return this.mutate(
      organizationId,
      actor,
      id,
      [ProcedureStatus.SCHEDULED],
      async (tx, procedure) => {
        if (!procedure.consentDocumentId) {
          throw new ConflictException('Attach the signed consent form before starting.');
        }
        const open = await tx.procedureChecklistItem.count({
          where: { procedureId: procedure.id, completedAt: null },
        });
        if (open > 0) {
          throw new ConflictException(`${open} pre-op checklist item(s) are not done.`);
        }
        return this.setStatus(
          tx,
          organizationId,
          actor.id,
          procedure,
          ProcedureStatus.IN_PROGRESS,
          {
            startedAt: new Date(),
          },
        );
      },
    );
  }

  async complete(organizationId: string, actor: { id: string; role: ActorRole }, id: string) {
    return this.mutate(organizationId, actor, id, [ProcedureStatus.IN_PROGRESS], (tx, procedure) =>
      this.setStatus(tx, organizationId, actor.id, procedure, ProcedureStatus.COMPLETED, {
        completedAt: new Date(),
      }),
    );
  }

  async cancel(
    organizationId: string,
    actor: { id: string; role: ActorRole },
    id: string,
    input: CancelProcedureInput,
  ) {
    return this.mutate(organizationId, actor, id, EDITABLE, (tx, procedure) =>
      this.setStatus(tx, organizationId, actor.id, procedure, ProcedureStatus.CANCELLED, {
        cancelledAt: new Date(),
        cancelReason: input.reason,
      }),
    );
  }

  private async setStatus(
    tx: ExtendedPrismaClient,
    organizationId: string,
    actorId: string,
    procedure: Procedure,
    status: ProcedureStatus,
    data: Partial<Procedure>,
  ) {
    const updated = await tx.procedure.update({
      where: { id: procedure.id },
      data: { status, ...data },
      include: DETAIL_INCLUDE,
    });
    await this.audit(tx, organizationId, actorId, 'procedure.status', procedure, {
      from: procedure.status,
      to: status,
    });
    return updated;
  }

  /** Locks the row, checks kind permission and allowed status, then runs `work`. */
  private async mutate<T>(
    organizationId: string,
    actor: { id: string; role: ActorRole },
    procedureId: string,
    allowed: ProcedureStatus[],
    work: (tx: ExtendedPrismaClient, procedure: Procedure) => Promise<T>,
  ): Promise<T> {
    return this.prisma.withTenant(organizationId, async (tx) => {
      await tx.$queryRaw`SELECT id FROM procedures WHERE id = ${procedureId} FOR UPDATE`;
      const procedure = await tx.procedure.findUnique({ where: { id: procedureId } });
      if (!procedure) {
        throw new NotFoundException('Procedure not found.');
      }
      this.assertKindAllowed(actor.role, procedure.kind);
      if (!allowed.includes(procedure.status)) {
        throw new ConflictException(`Not allowed while the procedure is ${procedure.status}.`);
      }
      return work(tx, procedure);
    });
  }

  private assertKindAllowed(role: ActorRole, kind: ProcedureKind) {
    if (kind === ProcedureKind.SURGERY && (!role || !roleHasPermission(role, 'surgery:manage'))) {
      throw new ForbiddenException('Insufficient permissions for this operation.');
    }
  }

  private audit(
    tx: ExtendedPrismaClient,
    organizationId: string,
    actorId: string,
    action: string,
    procedure: Procedure,
    metadata: Record<string, unknown>,
  ) {
    return this.auditService.record(tx, organizationId, {
      actorType: 'USER',
      actorId,
      action,
      entityType: 'Procedure',
      entityId: procedure.id,
      metadata: { patientId: procedure.patientId, kind: procedure.kind, ...metadata },
    });
  }
}
