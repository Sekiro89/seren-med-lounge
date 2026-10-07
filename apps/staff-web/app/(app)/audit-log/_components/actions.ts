/** Filter areas: each sets the action prefix sent to the API. */
export const AREAS: { label: string; prefix: string }[] = [
  { label: 'All activity', prefix: '' },
  { label: 'Patients', prefix: 'patient' },
  { label: 'Appointments', prefix: 'appointment.' },
  { label: 'Visits', prefix: 'encounter.' },
  { label: 'Clinical notes', prefix: 'clinical_note.' },
  { label: 'Diagnoses', prefix: 'diagnosis.' },
  { label: 'Prescriptions', prefix: 'prescription.' },
  { label: 'Lab', prefix: 'lab_' },
  { label: 'Invoices', prefix: 'invoice.' },
  { label: 'Payments', prefix: 'payment.' },
  { label: 'Refunds', prefix: 'refund.' },
  { label: 'Insurance', prefix: 'insurance.' },
  { label: 'Stock', prefix: 'stock.' },
  { label: 'Staff accounts', prefix: 'user.' },
  { label: 'Integrations', prefix: 'integration.' },
];

const SENTENCES: Record<string, string> = {
  'appointment.check_in': 'Checked a patient in',
  'clinical_note.create_draft': 'Started a clinical note',
  'clinical_note.amend': 'Amended a clinical note',
  'clinical_note.sign_off': 'Signed off a clinical note',
  'diagnosis.create_draft': 'Started a diagnosis',
  'diagnosis.amend': 'Amended a diagnosis',
  'diagnosis.sign_off': 'Signed off a diagnosis',
  'dispensing.prepare': 'Prepared a dispensing',
  'doctor_availability.create': 'Added doctor availability',
  'doctor_availability.deactivate': 'Removed doctor availability',
  'encounter.discharge': 'Discharged a patient',
  'insurance.case_create': 'Opened an insurance case',
  'insurance.case_note': 'Added a note to an insurance case',
  'insurance.case_settle': 'Settled an insurance case',
  'insurance.case_transition': 'Moved an insurance case to a new stage',
  'insurance.policy_create': 'Added an insurance policy',
  'insurance.policy_deactivate': 'Deactivated an insurance policy',
  'integration.update': 'Changed an integration setting',
  'integration.remove': 'Removed an integration setting',
  'invoice.issue': 'Issued an invoice',
  'invoice.void': 'Voided an invoice',
  'lab_order.create': 'Ordered a lab test',
  'lab_order.cancel': 'Cancelled a lab order',
  'lab_result.record': 'Recorded a lab result',
  'medical_history.create': 'Added to a medical history',
  'medical_history.status_change': 'Changed a medical history entry',
  'medication.create': 'Added a medication',
  'message.send': 'Sent a message',
  'metabolic_workup.record': 'Recorded a metabolic workup',
  'patient.register': 'Registered a patient',
  'patient.self_register': 'A patient registered themselves',
  'patient.phone_changed': 'Changed a patient phone number',
  'patient.existing_match_detected': 'Found a possible existing patient record',
  'patient.existing_match_confirmed': 'Confirmed an existing patient record',
  'patient_account.activation_requested': 'A patient asked to activate their account',
  'patient_account.claim_created': 'A patient asked to claim a record',
  'patient_account.claim_escalated': 'Escalated a record claim',
  'patient_account.claim_resolved': 'Resolved a record claim',
  'patient_account.claim_resubmitted': 'A patient resubmitted a record claim',
  'patient_account.linked': 'Linked a patient account to a record',
  'patient_consent.record': 'Recorded patient consent',
  'patient_document.register': 'Added a patient document',
  'patient_document.remove': 'Removed a patient document',
  'payment.record': 'Recorded a payment',
  'prescription.create': 'Wrote a prescription',
  'prescription.cancel': 'Cancelled a prescription',
  'queue.update': 'Updated the queue',
  'referral.create': 'Made a referral',
  'refund.issue': 'Issued a refund',
  'registration.create': 'Created a registration',
  'review.moderate': 'Moderated a review',
  'review.submit': 'A patient submitted a review',
  'stock.adjust': 'Adjusted stock',
  'stock.receive': 'Received stock',
  'thread.create': 'Started a message thread',
  'user.create': 'Added a staff account',
  'user.update': 'Changed a staff account',
  'vitals.record': 'Recorded vitals',
};

function humanizeAction(action: string): string {
  const text = action.replace(/[._]/g, ' ').trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function describeAction(action: string): string {
  return SENTENCES[action] ?? humanizeAction(action);
}

export function labelKey(key: string): string {
  const text = key
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function formatMetaValue(value: unknown): string {
  if (value === null || value === undefined) return 'None';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
