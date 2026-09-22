import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PatientConsentController } from './patient-consent.controller';
import { PatientConsentService } from './patient-consent.service';

@Module({
  imports: [AuditModule],
  controllers: [PatientConsentController],
  providers: [PatientConsentService],
  exports: [PatientConsentService],
})
export class PatientConsentModule {}
