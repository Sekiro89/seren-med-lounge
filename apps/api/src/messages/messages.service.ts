import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  MessageSenderType,
  MessageThreadStatus,
  NotificationType,
  StaffRole,
  type MessageThread,
} from '@prisma/client';
import { roleHasPermission } from '@serenemed/permissions';
import type { StaffRole as AppStaffRole } from '@serenemed/types';
import type {
  AssignMessageThreadInput,
  CreateMessageThreadInput,
  SendMessageInput,
} from '@serenemed/validation';
import { PrismaService, type ExtendedPrismaClient } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';

type Sender = { type: 'PATIENT'; patientId: string } | { type: 'USER'; userId: string };

const MESSAGE_SELECT = {
  id: true,
  senderType: true,
  senderUserId: true,
  senderUser: { select: { id: true, fullName: true } },
  body: true,
  readByPatientAt: true,
  readByStaffAt: true,
  createdAt: true,
} as const;

/**
 * Secure messaging between a patient and the clinic team. A thread
 * belongs to exactly one patient; any staff member with message:manage
 * can read and reply, and one of them can be made the assignee.
 *
 * A message body is immutable once sent (the DB grants the app role
 * UPDATE only on the two read-stamp columns, and no DELETE). Audit and
 * notification rows carry ids only — never the subject or body.
 *
 * TODO(product): no attachments yet — there is no upload client for
 * the patient portal.
 * TODO(product): no response-time SLA, escalation or auto-assignment;
 * unassigned patient messages simply alert the RECEPTION role.
 * TODO(product): in-app only — no SMS/WhatsApp/email delivery of
 * replies (no provider contracted).
 */
@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly notificationsService: NotificationsService,
  ) {}

  // ---------------------------------------------------------------- patient

  async createThreadAsPatient(
    organizationId: string,
    patientId: string,
    input: CreateMessageThreadInput,
  ) {
    return this.prisma.withTenant(organizationId, async (tx) => {
      const thread = await tx.messageThread.create({
        data: { organizationId, patientId, subject: input.subject },
      });
      await this.auditService.record(tx, organizationId, {
        actorType: 'PATIENT',
        actorId: patientId,
        action: 'thread.create',
        entityType: 'MessageThread',
        entityId: thread.id,
        metadata: { patientId },
      });
      await this.writeMessage(tx, organizationId, thread, { type: 'PATIENT', patientId }, input);
      return this.patientView(tx, thread.id);
    });
  }

  async listForPatient(organizationId: string, patientId: string) {
    const threads = await this.prisma.withTenant(organizationId, (tx) =>
      tx.messageThread.findMany({
        where: { patientId },
        select: {
          id: true,
          subject: true,
          status: true,
          lastMessageAt: true,
          createdAt: true,
          _count: {
            select: {
              messages: {
                where: { senderType: MessageSenderType.USER, readByPatientAt: null },
              },
            },
          },
        },
        orderBy: { lastMessageAt: 'desc' },
        take: 200,
      }),
    );
    return threads.map(({ _count, ...t }) => ({ ...t, unreadCount: _count.messages }));
  }

  /** Own thread only (anything else is 404); marks the clinic's messages read-by-patient. */
  async getForPatient(organizationId: string, patientId: string, threadId: string) {
    return this.prisma.withTenant(organizationId, async (tx) => {
      const thread = await tx.messageThread.findUnique({ where: { id: threadId } });
      if (!thread || thread.patientId !== patientId) {
        throw new NotFoundException('Message thread not found.');
      }
      await tx.message.updateMany({
        where: { threadId, senderType: MessageSenderType.USER, readByPatientAt: null },
        data: { readByPatientAt: new Date() },
      });
      return this.patientView(tx, threadId);
    });
  }

  async sendAsPatient(
    organizationId: string,
    patientId: string,
    threadId: string,
    input: SendMessageInput,
  ) {
    return this.prisma.withTenant(organizationId, async (tx) => {
      const thread = await this.lockThread(tx, threadId);
      if (thread.patientId !== patientId) {
        throw new NotFoundException('Message thread not found.');
      }
      this.assertOpen(thread);
      return this.writeMessage(tx, organizationId, thread, { type: 'PATIENT', patientId }, input);
    });
  }

  // ------------------------------------------------------------------ staff

  async listForStaff(
    organizationId: string,
    userId: string,
    filter: { status?: MessageThreadStatus; assignedToMe?: boolean },
  ) {
    const threads = await this.prisma.withTenant(organizationId, (tx) =>
      tx.messageThread.findMany({
        where: {
          status: filter.status,
          assignedToId: filter.assignedToMe ? userId : undefined,
        },
        select: {
          id: true,
          subject: true,
          status: true,
          lastMessageAt: true,
          createdAt: true,
          patient: { select: { id: true, firstName: true, lastName: true } },
          assignedTo: { select: { id: true, fullName: true } },
          _count: {
            select: {
              messages: {
                where: { senderType: MessageSenderType.PATIENT, readByStaffAt: null },
              },
            },
          },
        },
        orderBy: { lastMessageAt: 'desc' },
        take: 200,
      }),
    );
    return threads.map(({ _count, ...t }) => ({ ...t, unreadCount: _count.messages }));
  }

  /** Marks the patient's messages read-by-staff (shared across the team). */
  async getForStaff(organizationId: string, threadId: string) {
    return this.prisma.withTenant(organizationId, async (tx) => {
      const exists = await tx.messageThread.findUnique({ where: { id: threadId } });
      if (!exists) {
        throw new NotFoundException('Message thread not found.');
      }
      await tx.message.updateMany({
        where: { threadId, senderType: MessageSenderType.PATIENT, readByStaffAt: null },
        data: { readByStaffAt: new Date() },
      });
      return tx.messageThread.findUniqueOrThrow({
        where: { id: threadId },
        include: {
          patient: { select: { id: true, firstName: true, lastName: true } },
          assignedTo: { select: { id: true, fullName: true } },
          messages: { select: MESSAGE_SELECT, orderBy: { createdAt: 'asc' } },
        },
      });
    });
  }

  async sendAsStaff(
    organizationId: string,
    userId: string,
    threadId: string,
    input: SendMessageInput,
  ) {
    return this.prisma.withTenant(organizationId, async (tx) => {
      const thread = await this.lockThread(tx, threadId);
      this.assertOpen(thread);
      return this.writeMessage(tx, organizationId, thread, { type: 'USER', userId }, input);
    });
  }

  async assign(
    organizationId: string,
    userId: string,
    threadId: string,
    input: AssignMessageThreadInput,
  ) {
    return this.prisma.withTenant(organizationId, async (tx) => {
      const thread = await this.lockThread(tx, threadId);
      const assignee = await tx.user.findUnique({ where: { id: input.assignedToId } });
      if (
        !assignee ||
        !assignee.isActive ||
        !roleHasPermission(assignee.role as unknown as AppStaffRole, 'message:manage')
      ) {
        throw new BadRequestException(
          'assignedToId must be an active staff member who can manage messages.',
        );
      }
      const updated = await tx.messageThread.update({
        where: { id: thread.id },
        data: { assignedToId: assignee.id },
      });
      await this.auditThread(tx, organizationId, userId, 'thread.assign', thread, {
        from: thread.assignedToId,
        assignedToId: assignee.id,
      });
      return updated;
    });
  }

  async close(organizationId: string, userId: string, threadId: string) {
    return this.setStatus(
      organizationId,
      userId,
      threadId,
      MessageThreadStatus.OPEN,
      MessageThreadStatus.CLOSED,
      'thread.close',
    );
  }

  async reopen(organizationId: string, userId: string, threadId: string) {
    return this.setStatus(
      organizationId,
      userId,
      threadId,
      MessageThreadStatus.CLOSED,
      MessageThreadStatus.OPEN,
      'thread.reopen',
    );
  }

  // ---------------------------------------------------------------- helpers

  private async setStatus(
    organizationId: string,
    userId: string,
    threadId: string,
    from: MessageThreadStatus,
    to: MessageThreadStatus,
    action: string,
  ) {
    return this.prisma.withTenant(organizationId, async (tx) => {
      const thread = await this.lockThread(tx, threadId);
      if (thread.status !== from) {
        throw new ConflictException(`The thread is already ${thread.status}.`);
      }
      const updated = await tx.messageThread.update({
        where: { id: thread.id },
        data: { status: to },
      });
      await this.auditThread(tx, organizationId, userId, action, thread, { from, to });
      return updated;
    });
  }

  /** Inserts the message, bumps lastMessageAt, notifies the other side, audits ids only. */
  private async writeMessage(
    tx: ExtendedPrismaClient,
    organizationId: string,
    thread: MessageThread,
    sender: Sender,
    input: SendMessageInput,
  ) {
    const message = await tx.message.create({
      data: {
        organizationId,
        threadId: thread.id,
        senderType: sender.type === 'USER' ? MessageSenderType.USER : MessageSenderType.PATIENT,
        senderUserId: sender.type === 'USER' ? sender.userId : null,
        body: input.body,
      },
      select: MESSAGE_SELECT,
    });
    await tx.messageThread.update({
      where: { id: thread.id },
      data: { lastMessageAt: message.createdAt },
    });

    if (sender.type === 'PATIENT') {
      await this.notificationsService.notifyInTx(tx, organizationId, {
        type: NotificationType.MESSAGE_RECEIVED,
        recipient: thread.assignedToId
          ? { userId: thread.assignedToId }
          : { role: StaffRole.RECEPTION },
        title: 'New message from a patient',
        entityType: 'MessageThread',
        entityId: thread.id,
      });
    } else {
      await this.notificationsService.notifyInTx(tx, organizationId, {
        type: NotificationType.MESSAGE_RECEIVED,
        recipient: { patientId: thread.patientId },
        title: 'New message from your clinic',
        entityType: 'MessageThread',
        entityId: thread.id,
      });
    }

    await this.auditService.record(tx, organizationId, {
      actorType: sender.type,
      actorId: sender.type === 'USER' ? sender.userId : sender.patientId,
      action: 'message.send',
      entityType: 'Message',
      entityId: message.id,
      metadata: { threadId: thread.id, patientId: thread.patientId, senderType: sender.type },
    });
    return message;
  }

  private async lockThread(tx: ExtendedPrismaClient, threadId: string) {
    await tx.$queryRaw`SELECT id FROM message_threads WHERE id = ${threadId} FOR UPDATE`;
    const thread = await tx.messageThread.findUnique({ where: { id: threadId } });
    if (!thread) {
      throw new NotFoundException('Message thread not found.');
    }
    return thread;
  }

  private assertOpen(thread: MessageThread) {
    if (thread.status !== MessageThreadStatus.OPEN) {
      throw new ConflictException('This conversation is closed. Start a new one instead.');
    }
  }

  /** What a patient sees: no assignee internals, sender shown by name only. */
  private patientView(tx: ExtendedPrismaClient, threadId: string) {
    return tx.messageThread.findUniqueOrThrow({
      where: { id: threadId },
      select: {
        id: true,
        subject: true,
        status: true,
        lastMessageAt: true,
        createdAt: true,
        messages: {
          select: {
            id: true,
            senderType: true,
            senderUser: { select: { fullName: true } },
            body: true,
            readByPatientAt: true,
            readByStaffAt: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
  }

  private auditThread(
    tx: ExtendedPrismaClient,
    organizationId: string,
    userId: string,
    action: string,
    thread: MessageThread,
    metadata: Record<string, unknown>,
  ) {
    return this.auditService.record(tx, organizationId, {
      actorType: 'USER',
      actorId: userId,
      action,
      entityType: 'MessageThread',
      entityId: thread.id,
      metadata: { patientId: thread.patientId, ...metadata },
    });
  }
}
