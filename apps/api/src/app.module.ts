import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { parseApiEnv } from '@serenemed/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';

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
    ConfigModule.forRoot({ isGlobal: true, validate: parseApiEnv }),
    PrismaModule,
    RedisModule,
    // General default for every route; /auth/login overrides this with a
    // much stricter limit via @Throttle() — see auth.controller.ts and
    // docs/architecture/security.md#rate-limiting. In-memory storage
    // (the default): correct for one instance, NOT shared across
    // multiple — see the doc for the Redis-backed storage this needs
    // before scaling out.
    //
    // skipIf disables throttling only under Jest (NODE_ENV=test is set
    // automatically by Jest, not something this app sets itself) — the
    // e2e suite logs in ~8 times across its test cases, which would
    // otherwise trip the 5/min login limit and fail tests for a reason
    // that has nothing to do with what they're checking. The real limit
    // is unchanged for every other environment.
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', ttl: 60_000, limit: 100 }],
      skipIf: () => process.env.NODE_ENV === 'test',
    }),

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
    // Order matters: NestJS runs multiple APP_GUARD providers in
    // registration order.
    // 1. ThrottlerGuard first — reject abusive traffic before spending
    //    any work on auth (JWT verification, Redis blacklist lookup).
    // 2. JwtAuthGuard — populates request.user. Every route requires a
    //    valid Bearer token by default; @Public() (see
    //    common/decorators/public.decorator.ts) is the explicit opt-out,
    //    used today only by /health and /auth/login.
    // 3. PermissionsGuard — reads request.user for RBAC.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
