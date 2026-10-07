import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { NotificationType, TaskStatus, type Prisma, type StaffTask } from '@prisma/client';
import type { CreateTaskInput, SetTaskStatusInput } from '@serenemed/validation';
import { PrismaService, type ExtendedPrismaClient } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { clinicDateString, clinicDayRange } from '../common/clinic-time';

const TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  // OPEN → DONE is allowed so a personal reminder can be ticked off in one step.
  [TaskStatus.OPEN]: [TaskStatus.IN_PROGRESS, TaskStatus.DONE, TaskStatus.CANCELLED],
  [TaskStatus.IN_PROGRESS]: [TaskStatus.DONE, TaskStatus.CANCELLED],
  [TaskStatus.DONE]: [],
  [TaskStatus.CANCELLED]: [],
};
const PENDING: TaskStatus[] = [TaskStatus.OPEN, TaskStatus.IN_PROGRESS];

const TASK_INCLUDE = {
  assignee: { select: { id: true, fullName: true, role: true } },
  createdBy: { select: { id: true, fullName: true } },
  patient: { select: { id: true, firstName: true, lastName: true } },
} as const;

/**
 * Staff tasks and personal reminders (assignee = creator). Any staff
 * user may create one; only the assignee or the creator may move it.
 * Assigning to someone else drops a TASK_ASSIGNED notification in their
 * inbox in the same transaction. Title/description are free text and
 * never reach audit metadata or the notification.
 */
@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async create(organizationId: string, actorId: string, input: CreateTaskInput) {
    return this.prisma.withTenant(organizationId, async (tx) => {
      const assigneeId = input.assigneeId ?? actorId;
      const assignee = await tx.user.findUnique({ where: { id: assigneeId } });
      if (!assignee || !assignee.isActive) {
        throw new BadRequestException(
          'assigneeId must be an active staff user in this organization.',
        );
      }
      if (input.patientId) {
        const patient = await tx.patient.findUnique({ where: { id: input.patientId } });
        if (!patient) {
          throw new NotFoundException('Patient not found.');
        }
      }

      const task = await tx.staffTask.create({
        data: {
          organizationId,
          title: input.title,
          description: input.description,
          assigneeId,
          createdById: actorId,
          patientId: input.patientId,
          dueAt: input.dueAt ? new Date(input.dueAt) : undefined,
          priority: input.priority,
        },
        include: TASK_INCLUDE,
      });

      if (assigneeId !== actorId) {
        await this.notificationsService.notifyInTx(tx, organizationId, {
          type: NotificationType.TASK_ASSIGNED,
          recipient: { userId: assigneeId },
          title: 'A task has been assigned to you',
          entityType: 'StaffTask',
          entityId: task.id,
        });
      }

      await this.audit(tx, organizationId, actorId, 'task.create', task, {
        priority: task.priority,
        dueAt: task.dueAt,
      });
      return task;
    });
  }

  async list(
    organizationId: string,
    actorId: string,
    filter: { createdByMe: boolean; status?: TaskStatus; due?: 'today' | 'overdue' },
  ) {
    const where: Prisma.StaffTaskWhereInput = filter.createdByMe
      ? { createdById: actorId }
      : { assigneeId: actorId };
    if (filter.status) {
      where.status = filter.status;
    }
    if (filter.due === 'today') {
      const { from, to } = clinicDayRange(clinicDateString());
      where.dueAt = { gte: from, lt: to };
    } else if (filter.due === 'overdue') {
      where.dueAt = { lt: new Date() };
      where.status = filter.status ?? { in: PENDING };
    }
    return this.prisma.withTenant(organizationId, (tx) =>
      tx.staffTask.findMany({
        where,
        include: TASK_INCLUDE,
        orderBy: [{ dueAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
        take: 200,
      }),
    );
  }

  async setStatus(organizationId: string, actorId: string, id: string, input: SetTaskStatusInput) {
    return this.prisma.withTenant(organizationId, async (tx) => {
      await tx.$queryRaw`SELECT id FROM staff_tasks WHERE id = ${id} FOR UPDATE`;
      const existing = await tx.staffTask.findUnique({ where: { id } });
      if (!existing) {
        throw new NotFoundException('Task not found.');
      }
      if (existing.assigneeId !== actorId && existing.createdById !== actorId) {
        throw new ForbiddenException('Only the assignee or the creator can update this task.');
      }
      if (!TRANSITIONS[existing.status].includes(input.status)) {
        throw new ConflictException(`Cannot move a ${existing.status} task to ${input.status}.`);
      }
      const task = await tx.staffTask.update({
        where: { id },
        data: {
          status: input.status,
          completedAt: input.status === TaskStatus.DONE ? new Date() : undefined,
        },
        include: TASK_INCLUDE,
      });
      await this.audit(tx, organizationId, actorId, 'task.status', task, {
        from: existing.status,
        to: input.status,
      });
      return task;
    });
  }

  private audit(
    tx: ExtendedPrismaClient,
    organizationId: string,
    actorId: string,
    action: string,
    task: StaffTask,
    metadata: Record<string, unknown>,
  ) {
    return this.auditService.record(tx, organizationId, {
      actorType: 'USER',
      actorId,
      action,
      entityType: 'StaffTask',
      entityId: task.id,
      metadata: {
        assigneeId: task.assigneeId,
        createdById: task.createdById,
        patientId: task.patientId,
        ...metadata,
      },
    });
  }
}
