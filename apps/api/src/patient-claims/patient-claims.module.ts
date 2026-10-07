import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PatientsModule } from '../patients/patients.module';
import { PatientClaimsController } from './patient-claims.controller';
import { PatientClaimsService } from './patient-claims.service';

@Module({
  imports: [AuditModule, PatientsModule],
  controllers: [PatientClaimsController],
  providers: [PatientClaimsService],
  exports: [PatientClaimsService],
})
export class PatientClaimsModule {}
