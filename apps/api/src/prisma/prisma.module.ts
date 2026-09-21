import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { TenantContextService } from './tenant-context.service';

/**
 * Global so every domain module can inject PrismaService without each one
 * re-importing this module. Deliberately the only place that talks to the
 * database directly — domain services depend on PrismaService, never on
 * `@prisma/client` types leaking past their own repository/service layer
 * where avoidable.
 */
@Global()
@Module({
  providers: [PrismaService, TenantContextService],
  exports: [PrismaService, TenantContextService],
})
export class PrismaModule {}
