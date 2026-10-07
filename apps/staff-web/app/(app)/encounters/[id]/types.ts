// Mirrors EncountersService.getDetail's include shape
// (apps/api/src/encounters/encounters.service.ts). Kept as a local
// frontend type rather than a shared package since nothing outside this
// route needs it yet; promote to @serenemed/api-client if a second
// consumer shows up.

import { ApiError } from '@serenemed/api-client';
import type { Tone } from '../../../../lib/status';

export interface Vital {
  id: string;
  bloodPressureSystolic: number | null;
  bloodPressureDiastolic: number | null;
  pulseBpm: number | null;
  spo2Percent: number | null;
  temperatureCelsius: number | null;
  bmi: number | null;
  respiratoryRate: number | null;
  heightCm: number | null;
  weightKg: number | null;
  recordedAt: string;
  /** Who took the reading; null for older rows. */
  recordedBy?: { fullName: string; role: string } | null;
}

export interface DiagnosisVersion {
  id: string;
  versionNumber: number;
  status: string;
  icdCode: string | null;
  description: string;
  createdAt: string;
}

export interface Diagnosis {
  id: string;
  status: string;
  currentVersionNumber: number;
  versions: DiagnosisVersion[];
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
  status: string;
  items: PrescriptionItem[];
  createdAt: string;
}

export interface LabResult {
  id: string;
  resultValue: string;
  unit: string | null;
  referenceRange: string | null;
  createdAt: string;
}

export interface LabOrderItem {
  id: string;
  testName: string;
  instructions: string | null;
  results: LabResult[];
}

export interface LabOrder {
  id: string;
  status: string;
  items: LabOrderItem[];
  createdAt: string;
}

export interface MetabolicWorkup {
  id: string;
  glucoseMgDl: number | null;
  glucoseContext: string | null;
  hba1cPercent: number | null;
  totalCholesterolMgDl: number | null;
  ldlMgDl: number | null;
  hdlMgDl: number | null;
  triglyceridesMgDl: number | null;
  bodyFatPercent: number | null;
  muscleMassKg: number | null;
  visceralFatLevel: number | null;
  createdAt: string;
}

export interface Referral {
  id: string;
  type: string;
  toName: string | null;
  toFacility: string | null;
  toSpecialty: string | null;
  reason: string;
  urgency: string;
  status: string;
  createdAt: string;
}

export interface Procedure {
  id: string;
  kind: string;
  name: string;
  notes: string | null;
  status: string;
  scheduledAt: string | null;
  location: string | null;
  createdAt: string;
}

export interface ClinicalNoteVersion {
  id: string;
  versionNumber: number;
  status: string;
  subjective: string | null;
  objective: string | null;
  assessment: string | null;
  plan: string | null;
  createdAt: string;
}

export interface ClinicalNote {
  id: string;
  status: string;
  noteType: string;
  /** The template version the note was started from, if any. */
  templateVersionId?: string | null;
  templateVersion?: { version: number; template: { name: string } } | null;
  createdAt?: string;
  versions: ClinicalNoteVersion[];
}

export interface Registration {
  id: string;
  visitType: string;
  consultationRoute: string;
  idProofVerified: boolean;
  cancerScreeningRequired: boolean;
  notes: string | null;
}

export interface QueueEntry {
  id: string;
  tokenNumber: number;
  station: string;
  status: string;
}

export interface FollowUp {
  id: string;
  type: string;
  dueAt: string;
  notes: string | null;
  status: string;
}

export interface CarePlan {
  id: string;
  title: string;
  status: string;
  followUps: FollowUp[];
}

export interface EncounterDetail {
  id: string;
  status: string;
  startedAt: string;
  endedAt?: string | null;
  patientId: string;
  /** The API includes the patient's identity with the visit. */
  patient?: PatientInfo;
  registration: Registration | null;
  queueEntry: QueueEntry | null;
  vitals: Vital[];
  metabolicWorkups: MetabolicWorkup[];
  referrals: Referral[];
  procedures: Procedure[];
  clinicalNotes: ClinicalNote[];
  diagnoses: Diagnosis[];
  prescriptions: Prescription[];
  labOrders: LabOrder[];
  /** Care plans with their follow-ups (present in the API detail). */
  carePlans?: CarePlan[];
  /** The booking, for the reason the patient gave. */
  appointment?: { notes: string | null; scheduledAt: string } | null;
  /** Medicines still running from earlier visits' prescriptions. */
  currentMedication?: CurrentMedicationItem[];
}

export interface CurrentMedicationItem {
  id: string;
  medicationName: string;
  dosage: string;
  frequency: string;
  prescribedAt: string;
  encounterId: string;
}

export interface PatientInfo {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  phone: string;
  /** Patient number; tolerated when the API does not send it yet. */
  mrn?: string | null;
  /** FEMALE, MALE or OTHER when recorded at registration. */
  sex?: string | null;
}

/** A medical history row (allergies, conditions, current medication). */
export interface HistoryEntry {
  id: string;
  category: string;
  description: string;
  severity: string | null;
  status: string;
}

/** True for a record that has not been signed off yet. */
export function isUnsigned(status: string): boolean {
  return status === 'DRAFT' || status === 'AI_DRAFT';
}

/** ONE tone mapping for order-like statuses on this page. */
export function orderTone(status: string): Tone {
  switch (status) {
    case 'ACTIVE':
    case 'COMPLETED':
    case 'DISPENSED':
      return 'success';
    case 'ORDERED':
    case 'OPEN':
    case 'SCHEDULED':
    case 'IN_PROGRESS':
      return 'info';
    case 'CANCELLED':
      return 'danger';
    default:
      return 'neutral';
  }
}

export function apiErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    const body = error.body;
    if (typeof body === 'object' && body && 'message' in body) {
      const message = (body as { message: unknown }).message;
      if (typeof message === 'string') return message;
      if (Array.isArray(message)) return message.join(', ');
    }
    return fallback;
  }
  return 'Could not reach the server. Please try again.';
}
