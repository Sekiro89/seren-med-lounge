import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ClinicalNoteType } from '@prisma/client';
import {
  createClinicalTemplateSchema,
  createClinicalTemplateVersionSchema,
  type CreateClinicalTemplateInput,
  type CreateClinicalTemplateVersionInput,
} from '@serenemed/validation';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { TenantContextService } from '../prisma/tenant-context.service';
import { ClinicalTemplatesService } from './clinical-templates.service';

/**
 * Writes need clinical-template:manage (ADMINISTRATOR, SENIOR_DOCTOR).
 * Reads need clinical-note:write-draft so any doctor can pick a template
 * when starting a note (POST /clinical-notes with templateVersionId).
 */
@Controller('clinical-templates')
export class ClinicalTemplatesController {
  constructor(
    private readonly templatesService: ClinicalTemplatesService,
    private readonly tenantContext: TenantContextService,
  ) {}

  private get org() {
    return this.tenantContext.organizationId;
  }

  /** `?noteType=CONSULTATION` and `?active=true|false`. */
  @Get()
  @RequirePermissions('clinical-note:write-draft')
  list(@Query('noteType') noteType?: string, @Query('active') active?: string) {
    if (noteType && !(noteType in ClinicalNoteType)) {
      throw new BadRequestException('Unknown noteType.');
    }
    if (active !== undefined && active !== 'true' && active !== 'false') {
      throw new BadRequestException('active must be true or false.');
    }
    return this.templatesService.list(this.org, {
      noteType: noteType as ClinicalNoteType | undefined,
      active: active === undefined ? undefined : active === 'true',
    });
  }

  @Get(':id')
  @RequirePermissions('clinical-note:write-draft')
  get(@Param('id') id: string) {
    return this.templatesService.get(this.org, id);
  }

  @Get(':id/versions/:version')
  @RequirePermissions('clinical-note:write-draft')
  getVersion(@Param('id') id: string, @Param('version', ParseIntPipe) version: number) {
    return this.templatesService.getVersion(this.org, id, version);
  }

  @Post()
  @RequirePermissions('clinical-template:manage')
  create(
    @Body(new ZodValidationPipe(createClinicalTemplateSchema)) body: CreateClinicalTemplateInput,
  ) {
    return this.templatesService.create(this.org, this.tenantContext.userId, body);
  }

  @Post(':id/versions')
  @RequirePermissions('clinical-template:manage')
  addVersion(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(createClinicalTemplateVersionSchema))
    body: CreateClinicalTemplateVersionInput,
  ) {
    return this.templatesService.addVersion(this.org, this.tenantContext.userId, id, body);
  }

  @Post(':id/deactivate')
  @RequirePermissions('clinical-template:manage')
  deactivate(@Param('id') id: string) {
    return this.templatesService.setActive(this.org, this.tenantContext.userId, id, false);
  }

  @Post(':id/activate')
  @RequirePermissions('clinical-template:manage')
  activate(@Param('id') id: string) {
    return this.templatesService.setActive(this.org, this.tenantContext.userId, id, true);
  }
}
