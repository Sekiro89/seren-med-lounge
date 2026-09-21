import { z } from 'zod';
import { AppointmentEntrySource } from '@serenemed/types';

export const createAppointmentSchema = z.object({
  patientId: z.string().min(1),
  clinicId: z.string().min(1).optional(),
  entrySource: z.nativeEnum(AppointmentEntrySource),
  scheduledAt: z.string().datetime(),
  notes: z.string().max(2000).optional(),
});

export type CreateAppointmentInput = z.infer<typeof createAppointmentSchema>;
