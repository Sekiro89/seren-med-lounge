// Mirrors EncountersService.getDetail's include shape
// (apps/api/src/encounters/encounters.service.ts) — kept as a local
// frontend type rather than a shared package since nothing outside this
// route needs it yet; promote to @serenemed/api-client if a second
// consumer shows up.

export interface Vital {
  id: string;
  bloodPressureSystolic: number | null;
  bloodPressureDiastolic: number | null;
  pulseBpm: number | null;
  spo2Percent: number | null;
  temperatureCelsius: number | null;
  bmi: number | null;
  recordedAt: string;
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

export interface EncounterDetail {
  id: string;
  status: string;
  startedAt: string;
  vitals: Vital[];
  diagnoses: Diagnosis[];
  prescriptions: Prescription[];
  labOrders: LabOrder[];
}

import { ApiError } from '@serenemed/api-client';

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
