import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AppointmentsModule } from '../appointments/appointments.module';
import { DiagnosesModule } from '../diagnoses/diagnoses.module';
import { PrescriptionsModule } from '../prescriptions/prescriptions.module';
import { LabsModule } from '../labs/labs.module';
import { InvoicesModule } from '../invoices/invoices.module';
import { MedicalHistoryModule } from '../medical-history/medical-history.module';
import { QueueModule } from '../queue/queue.module';
import { PharmacyModule } from '../pharmacy/pharmacy.module';
import { PatientsController } from './patients.controller';
import { PatientsService } from './patients.service';

@Module({
  // Everything after AuditModule is only for the /patients/me/* read
  // routes (their own controllers/routes stay entirely separate) — see
  // PatientsController's doc comment on why those live here rather than
  // as new routes on each of those controllers.
  imports: [
    AuditModule,
    AppointmentsModule,
    DiagnosesModule,
    PrescriptionsModule,
    LabsModule,
    InvoicesModule,
    MedicalHistoryModule,
    QueueModule,
    PharmacyModule,
  ],
  controllers: [PatientsController],
  providers: [PatientsService],
  exports: [PatientsService],
})
export class PatientsModule {}
