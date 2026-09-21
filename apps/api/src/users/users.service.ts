import { ConflictException, Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import type { CreateUserInput } from '@serenemed/validation';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { toAppStaffRole, toPrismaStaffRole } from './staff-role.mapper';

const BCRYPT_COST = 12;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
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
