import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ClinicalTemplatesController } from './clinical-templates.controller';
import { ClinicalTemplatesService } from './clinical-templates.service';

@Module({
  imports: [AuditModule],
  controllers: [ClinicalTemplatesController],
  providers: [ClinicalTemplatesService],
  exports: [ClinicalTemplatesService],
})
export class ClinicalTemplatesModule {}
