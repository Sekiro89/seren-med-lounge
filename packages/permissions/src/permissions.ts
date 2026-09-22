/**
 * Coarse-grained permission identifiers. Kept as a flat string union (not
 * per-module enums) so the matrix below stays readable as one table.
 *
 * NOTE: This is a scaffold. The real permission set will grow alongside
 * each domain module (see apps/api/src/*). Enforcement always happens in
 * the NestJS guards/services — this package is shared vocabulary, not the
 * authority.
 */
export type Permission =
  | 'patient:read'
  | 'patient:write'
  | 'patient-record:read-clinical'
  | 'patient-record:write-clinical'
  | 'lead:read'
  | 'lead:write'
  | 'appointment:read'
  | 'appointment:write'
  | 'queue:manage'
  | 'vitals:write'
  | 'clinical-note:write-draft'
  | 'clinical-note:sign-off'
  | 'diagnosis:write-draft'
  | 'diagnosis:sign-off'
  | 'prescription:write'
  | 'lab-order:write'
  | 'lab-result:write'
  | 'procedure:manage'
  | 'surgery:manage'
  | 'pharmacy:dispense'
  | 'inventory:manage'
  | 'invoice:manage'
  | 'payment:manage'
  | 'refund:issue'
  | 'insurance:manage'
  | 'follow-up:manage'
  | 'campaign:manage'
  | 'user:manage'
  | 'role:manage'
  | 'audit-log:read';
