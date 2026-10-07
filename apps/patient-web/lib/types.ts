// Shapes of the /patients/me/* read routes
// (apps/api/src/patients/patients.controller.ts), only the fields the
// patient app uses.

export interface Profile {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string;
  dateOfBirth: string;
}

export type AppointmentStatus =
  'REQUESTED' | 'CONFIRMED' | 'CHECKED_IN' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';

export interface Appointment {
  id: string;
  status: AppointmentStatus;
  scheduledAt: string;
  entrySource: 'ONLINE_BOOKING' | 'RECEPTION_WALK_IN' | 'VIDEO_CONSULTATION' | 'CAMP';
  doctor: { fullName: string } | null;
}

export type QueueStation =
  'VITALS' | 'JUNIOR_DOCTOR' | 'SENIOR_DOCTOR' | 'LAB' | 'BILLING' | 'PHARMACY';

export interface QueueToken {
  id: string;
  tokenNumber: number;
  station: QueueStation;
  status: 'WAITING' | 'CALLED' | 'IN_SERVICE' | 'COMPLETED' | 'SKIPPED';
  /** People waiting ahead at the same desk (0 unless waiting). */
  ahead: number;
  /** The token's stage history, oldest first (absent on older API builds). */
  history?: QueueEvent[];
}

/** One step of a token's day: where it was and what happened, when. */
export interface QueueEvent {
  station: QueueStation;
  status: QueueToken['status'];
  at: string;
}

export interface PrescriptionItem {
  id: string;
  medicationName: string;
  dosage: string;
  frequency: string;
  durationDays: number | null;
  instructions: string | null;
}

export interface Prescription {
  id: string;
  status: 'ACTIVE' | 'CANCELLED' | string;
  createdAt: string;
  author: { fullName: string } | null;
  items: PrescriptionItem[];
}

export interface LabResult {
  id: string;
  resultValue: string;
  unit: string | null;
  referenceRange: string | null;
  createdAt: string;
}

export interface LabOrder {
  id: string;
  status: 'ORDERED' | 'CANCELLED';
  createdAt: string;
  items: Array<{ id: string; testName: string; results: LabResult[] }>;
}

export interface Diagnosis {
  id: string;
  createdAt: string;
  versions: Array<{ icdCode: string | null; description: string; createdAt: string }>;
}

export interface Invoice {
  id: string;
  number: number;
  status: 'ISSUED' | 'PARTIALLY_PAID' | 'PAID' | 'VOID' | string;
  totalMinor: number;
  paidMinor: number;
  createdAt: string;
  items: Array<{ id: string; description: string; lineTotalMinor: number }>;
}

export interface HistoryEntry {
  id: string;
  category:
    | 'ALLERGY'
    | 'CONDITION'
    | 'PAST_SURGERY'
    | 'CURRENT_MEDICATION'
    | 'FAMILY_HISTORY'
    | 'SOCIAL_HISTORY';
  description: string;
  severity: 'MILD' | 'MODERATE' | 'SEVERE' | null;
  status: 'ACTIVE' | 'RESOLVED' | string;
}

export interface MessageThread {
  id: string;
  subject: string;
  status: string;
  lastMessageAt: string;
}

export interface ThreadMessage {
  id: string;
  senderType: 'PATIENT' | 'USER' | string;
  body: string;
  createdAt: string;
}

/** GET /patients/me/message-threads/:id (opening it marks clinic replies read). */
export interface MessageThreadDetail extends MessageThread {
  messages: ThreadMessage[];
}

// ---- Online booking and visit records (/patients/me/booking/*, /patients/me/appointments/:id)

export interface BookingDoctor {
  id: string;
  fullName: string;
  role: 'JUNIOR_DOCTOR' | 'SENIOR_DOCTOR';
  /** Weekdays the doctor sees patients, 0 = Sunday. */
  days: number[];
}

export interface Slot {
  start: string;
  end: string;
}

export type BookingMode = 'IN_PERSON' | 'VIDEO';

export interface VisitDetail {
  id: string;
  status: AppointmentStatus;
  entrySource: 'ONLINE_BOOKING' | 'RECEPTION_WALK_IN' | 'VIDEO_CONSULTATION' | 'CAMP';
  scheduledAt: string;
  notes: string | null;
  doctor: { fullName: string } | null;
  encounter: {
    id: string;
    status: string;
    startedAt: string;
    endedAt: string | null;
    diagnoses: Array<{
      id: string;
      versions: Array<{ icdCode: string | null; description: string }>;
    }>;
    prescriptions: Array<{
      id: string;
      status: string;
      createdAt: string;
      items: PrescriptionItem[];
    }>;
    labOrders: Array<{
      id: string;
      createdAt: string;
      items: Array<{ id: string; testName: string; results: LabResult[] }>;
    }>;
    invoices: Array<{
      id: string;
      number: number;
      status: string;
      totalMinor: number;
      paidMinor: number;
    }>;
  } | null;
}

// ---- Care, feedback and alerts

export interface CarePlan {
  id: string;
  title: string;
  dischargeInstructions: string | null;
  status: 'ACTIVE' | 'COMPLETED' | string;
  createdAt: string;
  followUps: Array<{
    id: string;
    type:
      'REVIEW_APPOINTMENT' | 'MEDICATION_REMINDER' | 'RECOVERY_CHECK' | 'REPORT_ALERT' | 'OTHER';
    dueAt: string;
    notes: string | null;
    status: string;
    appointmentId: string | null;
  }>;
}

export interface ReviewRequest {
  id: string;
  stage: 'AFTER_SECOND_CONSULTATION' | 'AFTER_FIRST_FOLLOW_UP' | 'AFTER_PROCEDURE';
  status: 'REQUESTED' | 'SUBMITTED' | 'EXPIRED' | 'CANCELLED';
  expiresAt: string;
  createdAt: string;
}

export interface PatientNotification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  entityType: string | null;
  entityId: string | null;
  readAt: string | null;
  createdAt: string;
}

/** GET /patients/me/reviews (newest first). */
export interface PatientReview {
  id: string;
  requestId: string;
  stage: ReviewRequest['stage'];
  rating: number;
  comment: string | null;
  publishConsent: boolean;
  moderationStatus: 'PENDING' | 'APPROVED' | 'REJECTED' | string;
  createdAt: string;
}

// ---- Timeline and insurance (/patients/me/timeline, /patients/me/insurance-policies)

export type TimelineKind =
  | 'appointment'
  | 'visit'
  | 'vitals'
  | 'note'
  | 'diagnosis'
  | 'prescription'
  | 'lab_order'
  | 'lab_result'
  | 'procedure'
  | 'dispensing'
  | 'invoice'
  | 'payment'
  | 'follow_up'
  | 'history';

/** One row of GET /patients/me/timeline (newest first, signed-off records only). */
export interface TimelineEntry {
  id: string;
  kind: TimelineKind;
  at: string;
  title: string;
  detail?: string;
  status?: string;
  entityType: string;
  entityId: string;
  encounterId?: string | null;
  /** Visits: the appointment they belong to. */
  appointmentId?: string | null;
  /** Diagnoses: the ICD code, shown small. */
  code?: string | null;
}

/** GET /patients/me/insurance-policies (newest first). */
export interface InsurancePolicy {
  id: string;
  insurerName: string;
  tpaName: string | null;
  policyNumber: string;
  memberId: string | null;
  sumInsuredMinor: number | null;
  validFrom: string | null;
  validTo: string | null;
  isActive: boolean;
}

/** GET /patients/me/documents (newest first); the file itself streams from /patients/me/documents/:id/file. */
export interface PatientDocument {
  id: string;
  documentType: 'PHOTO' | 'ID_PROOF' | 'INSURANCE_CARD' | 'PAN_CARD' | 'CONSENT_FORM' | 'OTHER';
  fileName: string;
  mimeType: string;
  createdAt: string;
}
