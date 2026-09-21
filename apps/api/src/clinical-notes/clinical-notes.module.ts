import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ClinicalNotesController } from './clinical-notes.controller';
import { ClinicalNotesService } from './clinical-notes.service';

@Module({
  imports: [AuditModule],
  controllers: [ClinicalNotesController],
  providers: [ClinicalNotesService],
  exports: [ClinicalNotesService],
})
export class ClinicalNotesModule {}
