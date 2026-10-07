import { StaffRole } from '@serenemed/types';
import type { Permission } from './permissions';

/**
 * Draft role → permission matrix. This encodes an initial, conservative
 * assumption per docs/architecture/open-questions.md (exact permission
 * boundaries per role need product sign-off). The grants added with the
 * 2026-10 backend build (medical-history, referral, follow-up, queue for
 * doctors, templates, reviews, schedules, messages) are listed in
 * open-questions.md#16 for that same sign-off. ADMINISTRATOR is granted
 * everything; every other role starts scoped to its named workspace.
 */
export const ROLE_PERMISSIONS: Record<StaffRole, Permission[]> = {
  [StaffRole.ADMINISTRATOR]: [
    'patient:read',
    'patient:write',
    'patient-record:read-clinical',
    'patient-record:write-clinical',
    'lead:read',
    'lead:write',
    'appointment:read',
    'appointment:write',
    'queue:manage',
    'vitals:write',
    'clinical-note:write-draft',
    'clinical-note:sign-off',
    'diagnosis:write-draft',
    'diagnosis:sign-off',
    'prescription:write',
    'lab-order:write',
    'lab-result:write',
    'procedure:manage',
    'surgery:manage',
    'pharmacy:dispense',
    'inventory:manage',
    'invoice:manage',
    'payment:manage',
    'refund:issue',
    'insurance:manage',
    'follow-up:manage',
    'campaign:manage',
    'user:manage',
    'role:manage',
    'audit-log:read',
    'medical-history:write',
    'referral:write',
    'clinical-template:manage',
    'review:manage',
    'schedule:manage',
    'message:manage',
    'integration:manage',
  ],
  [StaffRole.RECEPTION]: [
    'patient:read',
    'patient:write',
    'appointment:read',
    'appointment:write',
    'queue:manage',
    'lead:read',
    'schedule:manage',
    'message:manage',
  ],
  [StaffRole.NURSE]: [
    'patient:read',
    'appointment:read',
    'patient-record:read-clinical',
    'vitals:write',
    'queue:manage',
    'medical-history:write',
    'follow-up:manage',
    'message:manage',
  ],
  [StaffRole.JUNIOR_DOCTOR]: [
    'patient:read',
    'appointment:read',
    'patient-record:read-clinical',
    'clinical-note:write-draft',
    'diagnosis:write-draft',
    'prescription:write',
    'lab-order:write',
    'procedure:manage',
    'queue:manage',
    'medical-history:write',
    'referral:write',
    'follow-up:manage',
    'message:manage',
  ],
  [StaffRole.SENIOR_DOCTOR]: [
    'patient:read',
    'appointment:read',
    'patient-record:read-clinical',
    'patient-record:write-clinical',
    'clinical-note:write-draft',
    'clinical-note:sign-off',
    'diagnosis:write-draft',
    'diagnosis:sign-off',
    'prescription:write',
    'lab-order:write',
    'procedure:manage',
    'surgery:manage',
    'queue:manage',
    'medical-history:write',
    'referral:write',
    'follow-up:manage',
    'clinical-template:manage',
    'message:manage',
  ],
  [StaffRole.SURGERY_COORDINATOR]: [
    'patient:read',
    'patient-record:read-clinical',
    'surgery:manage',
    'procedure:manage',
  ],
  // Closes the gap flagged in docs/architecture/security.md's LabOrder
  // section: lab-result:write previously had only ADMINISTRATOR behind
  // it because this role didn't exist. Deliberately NOT granted
  // lab-order:write — ordering a test is a doctor's decision, not this
  // desk's; see LabsController's doc comment on the permission split.
  [StaffRole.LAB_TECHNICIAN]: ['patient:read', 'patient-record:read-clinical', 'lab-result:write'],
  [StaffRole.PHARMACY]: ['patient:read', 'pharmacy:dispense', 'inventory:manage'],
  [StaffRole.BILLING]: ['patient:read', 'invoice:manage', 'payment:manage', 'refund:issue'],
  [StaffRole.INSURANCE]: ['patient:read', 'insurance:manage'],
  [StaffRole.MARKETING]: ['lead:read', 'lead:write', 'campaign:manage', 'review:manage'],
};

export function roleHasPermission(role: StaffRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}
