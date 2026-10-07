import { BadRequestException, Body, Controller, Delete, Get, Param, Put } from '@nestjs/common';
import {
  isIntegrationProvider,
  saveIntegrationSchema,
  type IntegrationProvider,
  type SaveIntegrationInput,
} from '@serenemed/validation';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { TenantContextService } from '../prisma/tenant-context.service';
import { IntegrationSettingsService } from './integration-settings.service';

/**
 * Administrators only. No route here ever returns a saved secret; the
 * list carries just "set" and a masked hint per secret field.
 */
@Controller('integrations')
export class IntegrationSettingsController {
  constructor(
    private readonly service: IntegrationSettingsService,
    private readonly tenantContext: TenantContextService,
  ) {}

  @Get()
  @RequirePermissions('integration:manage')
  list() {
    return this.service.list(this.tenantContext.organizationId);
  }

  @Put(':provider')
  @RequirePermissions('integration:manage')
  save(
    @Param('provider') provider: string,
    @Body(new ZodValidationPipe(saveIntegrationSchema)) body: SaveIntegrationInput,
  ) {
    return this.service.save(
      this.tenantContext.organizationId,
      this.tenantContext.userId,
      this.known(provider),
      body,
    );
  }

  @Delete(':provider')
  @RequirePermissions('integration:manage')
  remove(@Param('provider') provider: string) {
    return this.service.remove(
      this.tenantContext.organizationId,
      this.tenantContext.userId,
      this.known(provider),
    );
  }

  private known(provider: string): IntegrationProvider {
    if (!isIntegrationProvider(provider)) {
      throw new BadRequestException('Unknown integration.');
    }
    return provider;
  }
}
