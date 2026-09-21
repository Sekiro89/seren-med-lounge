/**
 * Lifecycle status for anything subject to the clinical-record-immutability
 * rule (clinical notes, diagnoses, prescriptions, procedure notes, reports).
 * Finalized records are never mutated in place — see docs/architecture/security.md.
 */
export enum ClinicalRecordStatus {
  DRAFT = 'DRAFT',
  AI_DRAFT = 'AI_DRAFT',
  REVIEWED = 'REVIEWED',
  FINALIZED = 'FINALIZED',
  AMENDED = 'AMENDED',
}

export enum ClinicalRecordSource {
  MANUAL = 'MANUAL',
  AI_ASSISTED = 'AI_ASSISTED',
}
