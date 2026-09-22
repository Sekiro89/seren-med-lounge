import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AppointmentsModule } from '../appointments/appointments.module';
import { DiagnosesModule } from '../diagnoses/diagnoses.module';
import { PrescriptionsModule } from '../prescriptions/prescriptions.module';
import { LabsModule } from '../labs/labs.module';
import { PatientsController } from './patients.controller';
import { PatientsService } from './patients.service';

@Module({
  // The last four are only for the /patients/me/* read routes (their
  // own controllers/routes stay entirely separate and unaffected) — see
  // PatientsController's doc comment on why those live here rather than
  // as new routes on each of those controllers.
  imports: [AuditModule, AppointmentsModule, DiagnosesModule, PrescriptionsModule, LabsModule],
  controllers: [PatientsController],
  providers: [PatientsService],
  exports: [PatientsService],
})
export class PatientsModule {}
