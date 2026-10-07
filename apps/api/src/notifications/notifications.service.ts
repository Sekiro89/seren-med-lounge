import { Injectable, NotFoundException } from '@nestjs/common';
import { NotificationType, StaffRole, type Prisma } from '@prisma/client';
import { PrismaService, type ExtendedPrismaClient } from '../prisma/prisma.service';

export type NotificationRecipient =
  { userId: string } | { role: StaffRole } | { patientId: string };

export interface NotifyInput {
  type: NotificationType;
  recipient: NotificationRecipient;
  /** No clinical detail — point at the entity instead. */
  title: string;
  body?: string;
  entityType?: string;
  entityId?: string;
}

/**
 * In-app notifications only (no SMS/WhatsApp/email provider is
 * contracted). Other modules call notifyInTx() inside their own
 * transaction so the alert exists exactly when the thing it announces
 * does. A role notification is shared by everyone holding that role;
 * the first person to mark it read clears it for all of them.
 */
@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async notifyInTx(tx: ExtendedPrismaClient, organizationId: string, input: NotifyInput) {
    const recipient = input.recipient;
    return tx.notification.create({
      data: {
        organizationId,
        type: input.type,
        recipientUserId: 'userId' in recipient ? recipient.userId : null,
        recipientRole: 'role' in recipient ? recipient.role : null,
        recipientPatientId: 'patientId' in recipient ? recipient.patientId : null,
        title: input.title,
        body: input.body,
        entityType: input.entityType,
        entityId: input.entityId,
      },
    });
  }

  /** Staff inbox: addressed to this user or to their role. */
  async listForStaff(
    organizationId: string,
    user: { userId: string; role: StaffRole },
    unreadOnly: boolean,
  ) {
    return this.prisma.withTenant(organizationId, (tx) =>
      tx.notification.findMany({
        where: {
          OR: [{ recipientUserId: user.userId }, { recipientRole: user.role }],
          readAt: unreadOnly ? null : undefined,
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    );
  }

  async listForPatient(organizationId: string, patientId: string, unreadOnly: boolean) {
    return this.prisma.withTenant(organizationId, (tx) =>
      tx.notification.findMany({
        where: { recipientPatientId: patientId, readAt: unreadOnly ? null : undefined },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    );
  }

  /** Only a notification addressed to the caller (directly or by role) can be marked read. */
  async markRead(
    organizationId: string,
    reader: { userId: string; role: StaffRole | null; patientId?: string },
    notificationId: string,
  ) {
    return this.prisma.withTenant(organizationId, async (tx) => {
      const mine: Prisma.NotificationWhereInput[] = reader.patientId
        ? [{ recipientPatientId: reader.patientId }]
        : [
            { recipientUserId: reader.userId },
            ...(reader.role ? [{ recipientRole: reader.role }] : []),
          ];
      const notification = await tx.notification.findFirst({
        where: { id: notificationId, OR: mine },
      });
      if (!notification) {
        throw new NotFoundException('Notification not found.');
      }
      if (notification.readAt) {
        return notification;
      }
      return tx.notification.update({
        where: { id: notificationId },
        data: { readAt: new Date(), readById: reader.userId },
      });
    });
  }
}
