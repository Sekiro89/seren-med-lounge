// Mirrors the /patients/me/* read routes' shapes
// (apps/api/src/patients/patients.controller.ts). Kept local rather
// than a shared package since nothing outside this route needs it yet.

export interface AppointmentSummary {
  id: string;
  status: string;
  entrySource: string;
  scheduledAt: string;
}

export interface DiagnosisVersion {
  id: string;
  status: string;
  icdCode: string | null;
  description: string;
  createdAt: string;
}

export interface DiagnosisSummary {
  id: string;
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

export interface PrescriptionSummary {
  id: string;
  status: string;
  items: PrescriptionItem[];
  createdAt: string;
}

export interface LabResultSummary {
  id: string;
  resultValue: string;
  unit: string | null;
  referenceRange: string | null;
  createdAt: string;
}

export interface LabOrderItemSummary {
  id: string;
  testName: string;
  results: LabResultSummary[];
}

export interface LabOrderSummary {
  id: string;
  status: string;
  items: LabOrderItemSummary[];
  createdAt: string;
}
