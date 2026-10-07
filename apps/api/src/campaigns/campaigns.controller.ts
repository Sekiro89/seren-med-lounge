import { BadRequestException, Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CampaignStatus, CampaignType } from '@prisma/client';
import {
  campaignStatusSchema,
  createCampaignSchema,
  type CampaignStatusInput,
  type CreateCampaignInput,
} from '@serenemed/validation';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { TenantContextService } from '../prisma/tenant-context.service';
import { CampaignsService } from './campaigns.service';

/** Every route needs campaign:manage (MARKETING, ADMINISTRATOR). */
@Controller('campaigns')
export class CampaignsController {
  constructor(
    private readonly campaignsService: CampaignsService,
    private readonly tenantContext: TenantContextService,
  ) {}

  private get org() {
    return this.tenantContext.organizationId;
  }

  @Post()
  @RequirePermissions('campaign:manage')
  create(@Body(new ZodValidationPipe(createCampaignSchema)) body: CreateCampaignInput) {
    return this.campaignsService.create(this.org, this.tenantContext.userId, body);
  }

  /** `?status=`, `?type=`. */
  @Get()
  @RequirePermissions('campaign:manage')
  list(@Query('status') status?: string, @Query('type') type?: string) {
    if (status && !(status in CampaignStatus)) {
      throw new BadRequestException('Unknown status.');
    }
    if (type && !(type in CampaignType)) {
      throw new BadRequestException('Unknown type.');
    }
    return this.campaignsService.list(this.org, {
      status: status as CampaignStatus | undefined,
      type: type as CampaignType | undefined,
    });
  }

  @Get(':id')
  @RequirePermissions('campaign:manage')
  get(@Param('id') id: string) {
    return this.campaignsService.get(this.org, id);
  }

  @Post(':id/status')
  @RequirePermissions('campaign:manage')
  setStatus(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(campaignStatusSchema)) body: CampaignStatusInput,
  ) {
    return this.campaignsService.setStatus(this.org, this.tenantContext.userId, id, body);
  }
}
