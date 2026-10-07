import { z } from 'zod';
import { AppointmentEntrySource } from '@serenemed/types';

export const createAppointmentSchema = z.object({
  patientId: z.string().min(1),
  clinicId: z.string().min(1).optional(),
  doctorId: z.string().min(1).optional(),
  entrySource: z.nativeEnum(AppointmentEntrySource),
  scheduledAt: z.string().datetime(),
  notes: z.string().max(2000).optional(),
});

export type CreateAppointmentInput = z.infer<typeof createAppointmentSchema>;

/**
 * Patient self-booking (POST /patients/me/appointments). The patient
 * picks one of the doctor's free slots; the server re-checks that the
 * time is a real, still-free slot before booking. `mode` decides whether
 * it is a visit to the clinic or a video consultation.
 */
export const patientBookingSchema = z.object({
  doctorId: z.string().min(1),
  scheduledAt: z.string().datetime(),
  mode: z.enum(['IN_PERSON', 'VIDEO']),
  reason: z.string().trim().max(500).optional(),
});

export type PatientBookingInput = z.infer<typeof patientBookingSchema>;
