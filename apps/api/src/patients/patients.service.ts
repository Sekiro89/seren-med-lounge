import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PatientsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Login-time lookup — same shape as UsersService's equivalent. Takes
   * organizationId explicitly (not from TenantContextService) because
   * there's no tenant context yet at the point login runs.
   */
  async findByOrgAndEmailWithPassword(organizationId: string, email: string) {
    return this.prisma.withTenant(organizationId, (tx) =>
      tx.patient.findFirst({ where: { email } }),
    );
  }

  /**
   * "Me" lookup for an already-authenticated patient — id comes from
   * the verified JWT's `sub`, never from client input, so there's no
   * way to request a different patient's record through this method.
   */
  async findOwnProfile(organizationId: string, patientId: string) {
    return this.prisma.withTenant(organizationId, (tx) =>
      tx.patient.findUnique({
        where: { id: patientId },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          dateOfBirth: true,
          phone: true,
          email: true,
          createdAt: true,
        },
      }),
    );
  }
}
