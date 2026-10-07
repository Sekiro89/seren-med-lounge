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
