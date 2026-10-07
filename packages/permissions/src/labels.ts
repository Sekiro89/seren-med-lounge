import type { Permission } from './permissions';

export type PermissionArea =
  'Front desk' | 'Clinical' | 'Pharmacy' | 'Finance' | 'Growth' | 'Team' | 'Administration';

/**
 * Plain-language names for every permission, grouped by area. Used by the
 * access screen and kept in step with docs/product/RBAC_CONFIRMATION.md
 * (generated from the same permission matrix). The `Record<Permission, ...>`
 * type makes adding a permission without a label a compile error.
 */
export const PERMISSION_LABELS: Record<Permission, { area: PermissionArea; label: string }> = {
  'patient:read': { area: 'Front desk', label: 'View patient details' },
  'patient:write': { area: 'Front desk', label: 'Register patients and resolve duplicate claims' },
  'appointment:read': { area: 'Front desk', label: 'View appointments' },
  'appointment:write': { area: 'Front desk', label: 'Book and check in appointments' },
  'queue:manage': { area: 'Front desk', label: 'Run the token queue' },
  'schedule:manage': { area: 'Front desk', label: 'Set doctor schedules' },

  'patient-record:read-clinical': { area: 'Clinical', label: 'View clinical records' },
  'patient-record:write-clinical': { area: 'Clinical', label: 'Discharge a visit' },
  'vitals:write': { area: 'Clinical', label: 'Record vitals and metabolic workup' },
  'medical-history:write': { area: 'Clinical', label: 'Record allergies and medical history' },
  'clinical-note:write-draft': { area: 'Clinical', label: 'Write draft clinical notes' },
  'clinical-note:sign-off': { area: 'Clinical', label: 'Sign off clinical notes' },
  'diagnosis:write-draft': { area: 'Clinical', label: 'Write draft diagnoses' },
  'diagnosis:sign-off': { area: 'Clinical', label: 'Sign off diagnoses' },
  'prescription:write': { area: 'Clinical', label: 'Issue prescriptions' },
  'lab-order:write': { area: 'Clinical', label: 'Order lab tests' },
  'lab-result:write': { area: 'Clinical', label: 'Enter lab results' },
  'procedure:manage': { area: 'Clinical', label: 'Plan and run procedures' },
  'surgery:manage': { area: 'Clinical', label: 'Plan and run surgeries' },
  'referral:write': { area: 'Clinical', label: 'Create referrals' },
  'follow-up:manage': { area: 'Clinical', label: 'Manage follow-ups and care plans' },
  'clinical-template:manage': { area: 'Clinical', label: 'Manage note templates' },

  'pharmacy:dispense': { area: 'Pharmacy', label: 'Dispense medicines' },
  'inventory:manage': { area: 'Pharmacy', label: 'Manage medicines and stock' },

  'invoice:manage': { area: 'Finance', label: 'Issue and void invoices' },
  'payment:manage': { area: 'Finance', label: 'Record payments' },
  'refund:issue': { area: 'Finance', label: 'Issue refunds' },
  'insurance:manage': { area: 'Finance', label: 'Manage insurance cases' },

  'lead:read': { area: 'Growth', label: 'View leads' },
  'lead:write': { area: 'Growth', label: 'Manage and convert leads' },
  'campaign:manage': { area: 'Growth', label: 'Manage campaigns' },
  'review:manage': { area: 'Growth', label: 'Request and moderate reviews' },

  'message:manage': { area: 'Team', label: 'Answer patient messages' },

  'user:manage': { area: 'Administration', label: 'Manage staff accounts' },
  'role:manage': { area: 'Administration', label: 'Manage roles' },
  'audit-log:read': { area: 'Administration', label: 'Read the audit log' },
};

export const AREA_ORDER: PermissionArea[] = [
  'Front desk',
  'Clinical',
  'Pharmacy',
  'Finance',
  'Growth',
  'Team',
  'Administration',
];
