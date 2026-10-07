import type { StaffRole } from '@prisma/client';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import type { CreateUserInput } from '@serenemed/validation';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RedisService } from '../redis/redis.service';
import {
  USER_SESSION_REVOCATION_TTL_SECONDS,
  userSessionRevocationKey,
} from '../auth/session-revocation';
import { toAppStaffRole, toPrismaStaffRole } from './staff-role.mapper';

const BCRYPT_COST = 12;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Creates a user in `organizationId` — always the caller's own
   * organization (from TenantContextService in the controller), never a
   * value taken from request input. See createUserSchema's comment in
   * @serenemed/validation. `actorId` is the already-authenticated admin
   * making the call (TenantContextService.userId in the controller) —
   * who granted a new staff account access is exactly the kind of thing
   * an audit trail exists for.
   */
  async create(organizationId: string, actorId: string, input: CreateUserInput) {
    const passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);

    const user = await this.prisma.withTenant(organizationId, async (tx) => {
      const existing = await tx.user.findFirst({
        where: { organizationId, email: input.email },
      });
      if (existing) {
        throw new ConflictException('A user with this email already exists in this organization.');
      }

      const created = await tx.user.create({
        data: {
          organizationId,
          clinicId: input.clinicId,
          email: input.email,
          passwordHash,
          fullName: input.fullName,
          role: toPrismaStaffRole(input.role),
        },
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
          clinicId: true,
          isActive: true,
          createdAt: true,
        },
      });

      await this.auditService.record(tx, organizationId, {
        actorType: 'USER',
        actorId,
        action: 'user.create',
        entityType: 'User',
        entityId: created.id,
        metadata: { role: created.role, email: created.email },
      });

      return created;
    });

    return { ...user, role: toAppStaffRole(user.role) };
  }

  /**
   * A minimal staff directory for choosing someone (assign a task, escalate
   * a follow-up). Names and roles only, active staff only: no email, no
   * clinic, nothing from the admin list. Open to every signed-in staff
   * member, since they already work alongside these people.
   */
  async directory(organizationId: string, role?: StaffRole) {
    return this.prisma.withTenant(organizationId, (tx) =>
      tx.user.findMany({
        where: { isActive: true, role },
        select: { id: true, fullName: true, role: true },
        orderBy: { fullName: 'asc' },
      }),
    );
  }

  /**
   * Deactivate, reactivate or change the role of a staff member. Guards:
   * you can't change your own account here (no locking yourself out or
   * quietly promoting yourself), and the organization must always keep at
   * least one active administrator. Deactivating blocks future sign-ins;
   * a token already issued works until it expires (15 minutes).
   */
  async update(
    organizationId: string,
    actorId: string,
    targetId: string,
    change: { isActive?: boolean; role?: StaffRole },
  ) {
    return this.prisma
      .withTenant(organizationId, async (tx) => {
        await tx.$queryRaw`SELECT id FROM users WHERE "organizationId" = ${organizationId} FOR UPDATE`;
        const target = await tx.user.findUnique({ where: { id: targetId } });
        if (!target) {
          throw new NotFoundException('Staff member not found.');
        }
        if (target.id === actorId) {
          throw new ConflictException(
            'You cannot change your own account. Ask another administrator.',
          );
        }

        const losesAdmin =
          target.role === 'ADMINISTRATOR' &&
          target.isActive &&
          (change.isActive === false ||
            (change.role !== undefined && change.role !== 'ADMINISTRATOR'));
        if (losesAdmin) {
          const otherAdmins = await tx.user.count({
            where: { role: 'ADMINISTRATOR', isActive: true, id: { not: target.id } },
          });
          if (otherAdmins === 0) {
            throw new ConflictException('The clinic must keep at least one active administrator.');
          }
        }

        const updated = await tx.user.update({
          where: { id: targetId },
          data: { isActive: change.isActive, role: change.role },
          select: {
            id: true,
            email: true,
            fullName: true,
            role: true,
            isActive: true,
            createdAt: true,
          },
        });

        await this.auditService.record(tx, organizationId, {
          actorType: 'USER',
          actorId,
          action: 'user.update',
          entityType: 'User',
          entityId: targetId,
          metadata: {
            from: { role: target.role, isActive: target.isActive },
            to: { role: updated.role, isActive: updated.isActive },
          },
        });
        return { ...updated, role: toAppStaffRole(updated.role) };
      })
      .then(async (result) => {
        // After the change has committed: end their open sessions so the new
        // role (or the switch-off) applies on their very next request.
        await this.redis.client.set(
          userSessionRevocationKey(targetId),
          String(Math.floor(Date.now() / 1000)),
          'EX',
          USER_SESSION_REVOCATION_TTL_SECONDS,
        );
        return result;
      });
  }

  async listForOrganization(organizationId: string) {
    const users = await this.prisma.withTenant(organizationId, (tx) =>
      tx.user.findMany({
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
          clinicId: true,
          isActive: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
    );
    return users.map((user) => ({ ...user, role: toAppStaffRole(user.role) }));
  }

  /**
   * Login-time lookup. Deliberately takes organizationId as an explicit
   * argument rather than reading it from TenantContextService — at the
   * point login runs, the caller isn't authenticated yet, so there's no
   * tenant context to read. organizationId comes straight from the login
   * request body instead (see loginSchema's comment on why).
   */
  async findByOrgAndEmailWithPassword(organizationId: string, email: string) {
    const user = await this.prisma.withTenant(organizationId, (tx) =>
      tx.user.findFirst({ where: { email } }),
    );
    return user ? { ...user, role: toAppStaffRole(user.role) } : null;
  }
}
