import { ApiError } from '@serenemed/api-client';

/** The identity fields GET /patients returns for each row. */
export interface PatientSummary {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string | null;
  dateOfBirth: string;
  /** Patient number, `SM-004812`. Older records may not have one yet. */
  mrn?: string | null;
  sex?: 'FEMALE' | 'MALE' | 'OTHER' | null;
}

/** GET /patients/:id. */
export interface PatientDetail extends PatientProfile {
  hasAccount: boolean;
}

/** The fuller profile POST /patients and the claim endpoints return. */
export interface PatientProfile extends PatientSummary {
  createdAt: string;
}

/** `34 yrs`, or months for infants. DOB is a calendar date, so compare in UTC. */
export function ageLabel(dateOfBirth: string): string {
  const dob = new Date(dateOfBirth);
  const now = new Date();
  let years = now.getUTCFullYear() - dob.getUTCFullYear();
  const beforeBirthday =
    now.getUTCMonth() < dob.getUTCMonth() ||
    (now.getUTCMonth() === dob.getUTCMonth() && now.getUTCDate() < dob.getUTCDate());
  if (beforeBirthday) years -= 1;
  if (years < 1) {
    const months = Math.max(
      0,
      (now.getUTCFullYear() - dob.getUTCFullYear()) * 12 + now.getUTCMonth() - dob.getUTCMonth(),
    );
    return `${months} mo`;
  }
  return `${years} yrs`;
}

const SEX_LETTER = { FEMALE: 'F', MALE: 'M', OTHER: 'Other' } as const;
const SEX_WORD = { FEMALE: 'Female', MALE: 'Male', OTHER: 'Other' } as const;

/** `F`, `M`, `Other`, or undefined when not recorded. */
export function sexLetter(sex: PatientSummary['sex']): string | undefined {
  return sex ? SEX_LETTER[sex] : undefined;
}

export function sexWord(sex: PatientSummary['sex']): string | undefined {
  return sex ? SEX_WORD[sex] : undefined;
}

/** `+91 98901 23456` for a 10-digit Indian mobile; anything else unchanged. */
export function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  const local = digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits;
  if (local.length === 10) return `+91 ${local.slice(0, 5)} ${local.slice(5)}`;
  return phone;
}

/** The server's own message when it sent one, otherwise the fallback. */
export function apiMessage(error: unknown, fallback: string): string {
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
