-- CreateEnum / CreateTable / CreateIndex / AddForeignKey sections below
-- generated via `prisma migrate diff --from-url <live db> --to-schema-datamodel
-- schema.prisma --script` (not `migrate dev`, which needs an interactive
-- TTY this environment doesn't have) — verified against the actual live
-- database state, same pattern as every other migration in this project.
-- Everything after the "hand-written" banner is hand-written — Prisma
-- supports none of CHECK constraints, RLS, or REVOKE.

-- CreateEnum
CREATE TYPE "ReviewStage" AS ENUM ('AFTER_SECOND_CONSULTATION', 'AFTER_FIRST_FOLLOW_UP', 'AFTER_PROCEDURE');

-- CreateEnum
CREATE TYPE "ReviewRequestStatus" AS ENUM ('REQUESTED', 'SUBMITTED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ReviewFormat" AS ENUM ('TEXT', 'VIDEO');

-- CreateEnum
CREATE TYPE "ReviewModerationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "LeadSource" AS ENUM ('WEBSITE', 'SOCIAL_MEDIA', 'CAMPAIGN', 'REFERRAL', 'CAMP', 'WALK_IN');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'CONTACTED', 'NURTURING', 'APPOINTMENT_BOOKED', 'CONVERTED', 'LOST');

-- CreateEnum
CREATE TYPE "LeadActivityType" AS ENUM ('CALL', 'MESSAGE', 'EMAIL', 'MEETING', 'NOTE', 'EDUCATION_SENT', 'STATUS_CHANGE');

-- CreateEnum
CREATE TYPE "CampaignType" AS ENUM ('DIGITAL', 'HEALTH_CAMP', 'EVENT', 'REFERRAL_PROGRAM', 'OTHER');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('PLANNED', 'ACTIVE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InsuranceCaseStatus" AS ENUM ('ELIGIBILITY_CHECK', 'PRE_AUTH_REQUESTED', 'PRE_AUTH_APPROVED', 'PRE_AUTH_DENIED', 'CLAIM_SUBMITTED', 'CLAIM_APPROVED', 'CLAIM_PARTIALLY_APPROVED', 'CLAIM_REJECTED', 'SETTLED', 'CLOSED');

-- CreateEnum
CREATE TYPE "TaskPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('PHARMACY_PREPARE', 'LAB_PREPARE', 'LAB_RESULT_READY', 'REFERRAL_RECEIVED', 'FOLLOW_UP_ESCALATED', 'TASK_ASSIGNED', 'MESSAGE_RECEIVED', 'GENERAL');

-- CreateEnum
CREATE TYPE "MessageThreadStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "MessageSenderType" AS ENUM ('USER', 'PATIENT');

-- AlterEnum
ALTER TYPE "PaymentMethod" ADD VALUE 'INSURANCE';

-- AlterTable
ALTER TABLE "clinical_notes" ADD COLUMN     "templateVersionId" TEXT;

-- CreateTable
CREATE TABLE "review_requests" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "stage" "ReviewStage" NOT NULL,
    "procedureId" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "status" "ReviewRequestStatus" NOT NULL DEFAULT 'REQUESTED',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "requestedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "review_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reviews" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "stage" "ReviewStage" NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "format" "ReviewFormat" NOT NULL DEFAULT 'TEXT',
    "videoStorageKey" TEXT,
    "publishConsent" BOOLEAN NOT NULL DEFAULT false,
    "moderationStatus" "ReviewModerationStatus" NOT NULL DEFAULT 'PENDING',
    "moderatedById" TEXT,
    "moderatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaigns" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "CampaignType" NOT NULL,
    "channel" TEXT,
    "status" "CampaignStatus" NOT NULL DEFAULT 'PLANNED',
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "location" TEXT,
    "budgetMinor" INTEGER,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "source" "LeadSource" NOT NULL,
    "campaignId" TEXT,
    "referredByPatientId" TEXT,
    "ownerId" TEXT,
    "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
    "enquiry" TEXT,
    "consentToContact" BOOLEAN NOT NULL DEFAULT false,
    "consentRecordedAt" TIMESTAMP(3),
    "nextFollowUpAt" TIMESTAMP(3),
    "lostReason" TEXT,
    "convertedPatientId" TEXT,
    "convertedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_activities" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "type" "LeadActivityType" NOT NULL,
    "notes" TEXT,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "insurance_policies" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "insurerName" TEXT NOT NULL,
    "tpaName" TEXT,
    "policyNumber" TEXT NOT NULL,
    "memberId" TEXT,
    "sumInsuredMinor" INTEGER,
    "validFrom" DATE,
    "validTo" DATE,
    "cardDocumentId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "insurance_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "insurance_cases" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "encounterId" TEXT,
    "procedureId" TEXT,
    "invoiceId" TEXT,
    "status" "InsuranceCaseStatus" NOT NULL DEFAULT 'ELIGIBILITY_CHECK',
    "requestedAmountMinor" INTEGER,
    "approvedAmountMinor" INTEGER,
    "settledAmountMinor" INTEGER,
    "preAuthReference" TEXT,
    "claimReference" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "insurance_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "insurance_case_events" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "fromStatus" "InsuranceCaseStatus",
    "toStatus" "InsuranceCaseStatus" NOT NULL,
    "amountMinor" INTEGER,
    "note" TEXT,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "insurance_case_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinical_templates" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "noteType" "ClinicalNoteType" NOT NULL,
    "specialty" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "currentVersion" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clinical_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinical_template_versions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "body" JSONB NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clinical_template_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "doctor_availability" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "clinicId" TEXT,
    "dayOfWeek" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "slotMinutes" INTEGER NOT NULL DEFAULT 15,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "doctor_availability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_tasks" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "assigneeId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "patientId" TEXT,
    "dueAt" TIMESTAMP(3),
    "priority" "TaskPriority" NOT NULL DEFAULT 'NORMAL',
    "status" "TaskStatus" NOT NULL DEFAULT 'OPEN',
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "recipientUserId" TEXT,
    "recipientRole" "StaffRole",
    "recipientPatientId" TEXT,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "entityType" TEXT,
    "entityId" TEXT,
    "readAt" TIMESTAMP(3),
    "readById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_threads" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "status" "MessageThreadStatus" NOT NULL DEFAULT 'OPEN',
    "assignedToId" TEXT,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "message_threads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "senderType" "MessageSenderType" NOT NULL,
    "senderUserId" TEXT,
    "body" TEXT NOT NULL,
    "readByPatientAt" TIMESTAMP(3),
    "readByStaffAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "review_requests_organizationId_status_idx" ON "review_requests"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "review_requests_organizationId_patientId_dedupeKey_key" ON "review_requests"("organizationId", "patientId", "dedupeKey");

-- CreateIndex
CREATE UNIQUE INDEX "reviews_requestId_key" ON "reviews"("requestId");

-- CreateIndex
CREATE INDEX "reviews_organizationId_moderationStatus_idx" ON "reviews"("organizationId", "moderationStatus");

-- CreateIndex
CREATE INDEX "reviews_patientId_idx" ON "reviews"("patientId");

-- CreateIndex
CREATE INDEX "campaigns_organizationId_deletedAt_idx" ON "campaigns"("organizationId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "leads_convertedPatientId_key" ON "leads"("convertedPatientId");

-- CreateIndex
CREATE INDEX "leads_organizationId_status_idx" ON "leads"("organizationId", "status");

-- CreateIndex
CREATE INDEX "leads_organizationId_deletedAt_idx" ON "leads"("organizationId", "deletedAt");

-- CreateIndex
CREATE INDEX "leads_phone_idx" ON "leads"("phone");

-- CreateIndex
CREATE INDEX "leads_ownerId_nextFollowUpAt_idx" ON "leads"("ownerId", "nextFollowUpAt");

-- CreateIndex
CREATE INDEX "lead_activities_organizationId_idx" ON "lead_activities"("organizationId");

-- CreateIndex
CREATE INDEX "lead_activities_leadId_createdAt_idx" ON "lead_activities"("leadId", "createdAt");

-- CreateIndex
CREATE INDEX "insurance_policies_organizationId_deletedAt_idx" ON "insurance_policies"("organizationId", "deletedAt");

-- CreateIndex
CREATE INDEX "insurance_policies_patientId_idx" ON "insurance_policies"("patientId");

-- CreateIndex
CREATE INDEX "insurance_cases_organizationId_status_idx" ON "insurance_cases"("organizationId", "status");

-- CreateIndex
CREATE INDEX "insurance_cases_patientId_idx" ON "insurance_cases"("patientId");

-- CreateIndex
CREATE INDEX "insurance_case_events_organizationId_idx" ON "insurance_case_events"("organizationId");

-- CreateIndex
CREATE INDEX "insurance_case_events_caseId_createdAt_idx" ON "insurance_case_events"("caseId", "createdAt");

-- CreateIndex
CREATE INDEX "clinical_templates_organizationId_deletedAt_idx" ON "clinical_templates"("organizationId", "deletedAt");

-- CreateIndex
CREATE INDEX "clinical_templates_organizationId_noteType_idx" ON "clinical_templates"("organizationId", "noteType");

-- CreateIndex
CREATE INDEX "clinical_template_versions_organizationId_idx" ON "clinical_template_versions"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "clinical_template_versions_templateId_version_key" ON "clinical_template_versions"("templateId", "version");

-- CreateIndex
CREATE INDEX "doctor_availability_organizationId_doctorId_dayOfWeek_idx" ON "doctor_availability"("organizationId", "doctorId", "dayOfWeek");

-- CreateIndex
CREATE INDEX "staff_tasks_organizationId_assigneeId_status_idx" ON "staff_tasks"("organizationId", "assigneeId", "status");

-- CreateIndex
CREATE INDEX "notifications_organizationId_recipientUserId_readAt_idx" ON "notifications"("organizationId", "recipientUserId", "readAt");

-- CreateIndex
CREATE INDEX "notifications_organizationId_recipientRole_readAt_idx" ON "notifications"("organizationId", "recipientRole", "readAt");

-- CreateIndex
CREATE INDEX "notifications_organizationId_recipientPatientId_readAt_idx" ON "notifications"("organizationId", "recipientPatientId", "readAt");

-- CreateIndex
CREATE INDEX "message_threads_organizationId_status_lastMessageAt_idx" ON "message_threads"("organizationId", "status", "lastMessageAt");

-- CreateIndex
CREATE INDEX "message_threads_patientId_idx" ON "message_threads"("patientId");

-- CreateIndex
CREATE INDEX "messages_organizationId_idx" ON "messages"("organizationId");

-- CreateIndex
CREATE INDEX "messages_threadId_createdAt_idx" ON "messages"("threadId", "createdAt");

-- AddForeignKey
ALTER TABLE "clinical_notes" ADD CONSTRAINT "clinical_notes_templateVersionId_fkey" FOREIGN KEY ("templateVersionId") REFERENCES "clinical_template_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_requests" ADD CONSTRAINT "review_requests_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_requests" ADD CONSTRAINT "review_requests_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_requests" ADD CONSTRAINT "review_requests_procedureId_fkey" FOREIGN KEY ("procedureId") REFERENCES "procedures"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_requests" ADD CONSTRAINT "review_requests_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "review_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_moderatedById_fkey" FOREIGN KEY ("moderatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_referredByPatientId_fkey" FOREIGN KEY ("referredByPatientId") REFERENCES "patients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_convertedPatientId_fkey" FOREIGN KEY ("convertedPatientId") REFERENCES "patients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insurance_policies" ADD CONSTRAINT "insurance_policies_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insurance_policies" ADD CONSTRAINT "insurance_policies_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insurance_policies" ADD CONSTRAINT "insurance_policies_cardDocumentId_fkey" FOREIGN KEY ("cardDocumentId") REFERENCES "patient_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insurance_cases" ADD CONSTRAINT "insurance_cases_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insurance_cases" ADD CONSTRAINT "insurance_cases_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insurance_cases" ADD CONSTRAINT "insurance_cases_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "insurance_policies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insurance_cases" ADD CONSTRAINT "insurance_cases_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "encounters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insurance_cases" ADD CONSTRAINT "insurance_cases_procedureId_fkey" FOREIGN KEY ("procedureId") REFERENCES "procedures"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insurance_cases" ADD CONSTRAINT "insurance_cases_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insurance_cases" ADD CONSTRAINT "insurance_cases_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insurance_case_events" ADD CONSTRAINT "insurance_case_events_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insurance_case_events" ADD CONSTRAINT "insurance_case_events_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "insurance_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insurance_case_events" ADD CONSTRAINT "insurance_case_events_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_templates" ADD CONSTRAINT "clinical_templates_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_templates" ADD CONSTRAINT "clinical_templates_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_template_versions" ADD CONSTRAINT "clinical_template_versions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_template_versions" ADD CONSTRAINT "clinical_template_versions_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "clinical_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_template_versions" ADD CONSTRAINT "clinical_template_versions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doctor_availability" ADD CONSTRAINT "doctor_availability_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doctor_availability" ADD CONSTRAINT "doctor_availability_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doctor_availability" ADD CONSTRAINT "doctor_availability_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_tasks" ADD CONSTRAINT "staff_tasks_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_tasks" ADD CONSTRAINT "staff_tasks_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_tasks" ADD CONSTRAINT "staff_tasks_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_tasks" ADD CONSTRAINT "staff_tasks_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipientPatientId_fkey" FOREIGN KEY ("recipientPatientId") REFERENCES "patients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_threads" ADD CONSTRAINT "message_threads_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_threads" ADD CONSTRAINT "message_threads_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_threads" ADD CONSTRAINT "message_threads_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "message_threads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_senderUserId_fkey" FOREIGN KEY ("senderUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- =============================================================================
-- hand-written
-- =============================================================================

ALTER TABLE "reviews" ADD CONSTRAINT "reviews_content_check" CHECK (
  "rating" BETWEEN 1 AND 5 AND ("format" = 'TEXT' OR "videoStorageKey" IS NOT NULL)
);
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_budget_check" CHECK ("budgetMinor" IS NULL OR "budgetMinor" >= 0);
ALTER TABLE "insurance_policies" ADD CONSTRAINT "insurance_policies_amount_check" CHECK ("sumInsuredMinor" IS NULL OR "sumInsuredMinor" >= 0);
ALTER TABLE "insurance_cases" ADD CONSTRAINT "insurance_cases_amounts_check" CHECK (
  ("requestedAmountMinor" IS NULL OR "requestedAmountMinor" >= 0)
  AND ("approvedAmountMinor" IS NULL OR "approvedAmountMinor" >= 0)
  AND ("settledAmountMinor" IS NULL OR "settledAmountMinor" >= 0)
);
ALTER TABLE "doctor_availability" ADD CONSTRAINT "doctor_availability_check" CHECK (
  "dayOfWeek" BETWEEN 0 AND 6
  AND "startTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
  AND "endTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
  AND "startTime" < "endTime"
  AND "slotMinutes" BETWEEN 5 AND 240
);
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_one_recipient_check" CHECK (
  num_nonnulls("recipientUserId", "recipientRole", "recipientPatientId") = 1
);
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_check" CHECK (
  ("senderType" = 'USER' AND "senderUserId" IS NOT NULL) OR ("senderType" = 'PATIENT' AND "senderUserId" IS NULL)
);
-- A message body is never edited once sent; only read stamps change.
REVOKE UPDATE ON "messages" FROM serenemed_app;
GRANT UPDATE ("readByPatientAt", "readByStaffAt") ON "messages" TO serenemed_app;
REVOKE DELETE ON "messages" FROM serenemed_app;

-- Row-level tenant isolation — see prisma/migrations/20260921000000_init/migration.sql
-- for the FORCE/fail-closed rationale.
ALTER TABLE "review_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "review_requests" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "review_requests"
  USING ("organizationId" = current_setting('app.current_organization_id', true));
ALTER TABLE "reviews" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "reviews" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "reviews"
  USING ("organizationId" = current_setting('app.current_organization_id', true));
ALTER TABLE "campaigns" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "campaigns" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "campaigns"
  USING ("organizationId" = current_setting('app.current_organization_id', true));
ALTER TABLE "leads" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "leads" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "leads"
  USING ("organizationId" = current_setting('app.current_organization_id', true));
ALTER TABLE "lead_activities" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "lead_activities" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "lead_activities"
  USING ("organizationId" = current_setting('app.current_organization_id', true));
ALTER TABLE "insurance_policies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "insurance_policies" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "insurance_policies"
  USING ("organizationId" = current_setting('app.current_organization_id', true));
ALTER TABLE "insurance_cases" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "insurance_cases" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "insurance_cases"
  USING ("organizationId" = current_setting('app.current_organization_id', true));
ALTER TABLE "insurance_case_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "insurance_case_events" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "insurance_case_events"
  USING ("organizationId" = current_setting('app.current_organization_id', true));
ALTER TABLE "clinical_templates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "clinical_templates" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "clinical_templates"
  USING ("organizationId" = current_setting('app.current_organization_id', true));
ALTER TABLE "clinical_template_versions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "clinical_template_versions" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "clinical_template_versions"
  USING ("organizationId" = current_setting('app.current_organization_id', true));
ALTER TABLE "doctor_availability" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "doctor_availability" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "doctor_availability"
  USING ("organizationId" = current_setting('app.current_organization_id', true));
ALTER TABLE "staff_tasks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "staff_tasks" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "staff_tasks"
  USING ("organizationId" = current_setting('app.current_organization_id', true));
ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notifications" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "notifications"
  USING ("organizationId" = current_setting('app.current_organization_id', true));
ALTER TABLE "message_threads" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "message_threads" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "message_threads"
  USING ("organizationId" = current_setting('app.current_organization_id', true));
ALTER TABLE "messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "messages" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "messages"
  USING ("organizationId" = current_setting('app.current_organization_id', true));

-- Append-only tables: the app role can never edit or remove a row.
REVOKE UPDATE, DELETE ON "lead_activities" FROM serenemed_app;
REVOKE UPDATE, DELETE ON "insurance_case_events" FROM serenemed_app;
REVOKE UPDATE, DELETE ON "clinical_template_versions" FROM serenemed_app;
