import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PatientDocumentsController } from './patient-documents.controller';
import { PatientDocumentsService } from './patient-documents.service';

@Module({
  imports: [AuditModule],
  controllers: [PatientDocumentsController],
  providers: [PatientDocumentsService],
  exports: [PatientDocumentsService],
})
export class PatientDocumentsModule {}
