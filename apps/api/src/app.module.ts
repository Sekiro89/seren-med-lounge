import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { PermissionsGuard } from './common/guards/permissions.guard';

import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { RolesModule } from './roles/roles.module';
import { PermissionsModule } from './permissions/permissions.module';
import { PatientsModule } from './patients/patients.module';
import { PatientDocumentsModule } from './patient-documents/patient-documents.module';
import { PatientConsentModule } from './patient-consent/patient-consent.module';
import { PatientTimelineModule } from './patient-timeline/patient-timeline.module';
import { LeadsModule } from './leads/leads.module';
import { CrmModule } from './crm/crm.module';
import { MarketingModule } from './marketing/marketing.module';
import { CampaignsModule } from './campaigns/campaigns.module';
import { AppointmentsModule } from './appointments/appointments.module';
import { SchedulingModule } from './scheduling/scheduling.module';
import { RegistrationModule } from './registration/registration.module';
import { QueueModule } from './queue/queue.module';
import { EncountersModule } from './encounters/encounters.module';
import { VitalsModule } from './vitals/vitals.module';
import { MedicalHistoryModule } from './medical-history/medical-history.module';
import { DiagnosesModule } from './diagnoses/diagnoses.module';
import { ClinicalNotesModule } from './clinical-notes/clinical-notes.module';
import { ClinicalTemplatesModule } from './clinical-templates/clinical-templates.module';
import { PrescriptionsModule } from './prescriptions/prescriptions.module';
import { ReferralsModule } from './referrals/referrals.module';
import { LabsModule } from './labs/labs.module';
import { ProceduresModule } from './procedures/procedures.module';
import { SurgeryModule } from './surgery/surgery.module';
import { PharmacyModule } from './pharmacy/pharmacy.module';
import { InventoryModule } from './inventory/inventory.module';
import { BillingModule } from './billing/billing.module';
import { InvoicesModule } from './invoices/invoices.module';
import { PaymentsModule } from './payments/payments.module';
import { InsuranceModule } from './insurance/insurance.module';
import { AccountingModule } from './accounting/accounting.module';
import { FollowupsModule } from './followups/followups.module';
import { CarePlansModule } from './care-plans/care-plans.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ReviewsModule } from './reviews/reviews.module';
import { AiModule } from './ai/ai.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { AuditModule } from './audit/audit.module';
import { ReportsModule } from './reports/reports.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,

    // --- identity & access ---
    AuthModule,
    UsersModule,
    RolesModule,
    PermissionsModule,

    // --- unified patient record: profile & consent ---
    PatientsModule,
    PatientDocumentsModule,
    PatientConsentModule,
    PatientTimelineModule,

    // --- marketing / CRM funnel (pre-patient) ---
    LeadsModule,
    CrmModule,
    MarketingModule,
    CampaignsModule,

    // --- clinic journey ---
    AppointmentsModule,
    SchedulingModule,
    RegistrationModule,
    QueueModule,

    // --- clinical spine ---
    EncountersModule,
    VitalsModule,
    MedicalHistoryModule,
    DiagnosesModule,
    ClinicalNotesModule,
    ClinicalTemplatesModule,
    PrescriptionsModule,
    ReferralsModule,
    LabsModule,
    ProceduresModule,
    SurgeryModule,

    // --- pharmacy / inventory ---
    PharmacyModule,
    InventoryModule,

    // --- billing / money ---
    BillingModule,
    InvoicesModule,
    PaymentsModule,
    InsuranceModule,
    AccountingModule,

    // --- retention ---
    FollowupsModule,
    CarePlansModule,
    NotificationsModule,
    ReviewsModule,

    // --- cross-cutting ---
    AiModule,
    IntegrationsModule,
    AuditModule,
    ReportsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Applies to every route by default. A route with no @RequirePermissions
    // is open — see docs/architecture/open-questions.md for the pending
    // decision on default-deny once the auth guard populates req.user.
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
