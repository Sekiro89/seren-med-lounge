/**
 * Staff roles supported by the single staff application.
 * These map 1:1 to role-based workspaces, not separate apps.
 */
export enum StaffRole {
  ADMINISTRATOR = 'ADMINISTRATOR',
  RECEPTION = 'RECEPTION',
  NURSE = 'NURSE',
  JUNIOR_DOCTOR = 'JUNIOR_DOCTOR',
  SENIOR_DOCTOR = 'SENIOR_DOCTOR',
  SURGERY_COORDINATOR = 'SURGERY_COORDINATOR',
  LAB_TECHNICIAN = 'LAB_TECHNICIAN',
  PHARMACY = 'PHARMACY',
  BILLING = 'BILLING',
  INSURANCE = 'INSURANCE',
  MARKETING = 'MARKETING',
}

export enum PatientRole {
  PATIENT = 'PATIENT',
}

export type AppRole = StaffRole | PatientRole;
