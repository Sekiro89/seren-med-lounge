import { z } from 'zod';

const clockTime = z
  .string()
  .regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/, 'Time must be HH:MM (24-hour, 00:00-23:59).');

export const createDoctorAvailabilitySchema = z
  .object({
    doctorId: z.string().min(1),
    clinicId: z.string().min(1).optional(),
    dayOfWeek: z.number().int().min(0).max(6),
    startTime: clockTime,
    endTime: clockTime,
    slotMinutes: z.number().int().min(5).max(240).optional(),
  })
  .refine((v) => v.startTime < v.endTime, {
    message: 'endTime must be after startTime.',
    path: ['endTime'],
  });

export type CreateDoctorAvailabilityInput = z.infer<typeof createDoctorAvailabilitySchema>;

export const createTaskSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(2000).optional(),
  assigneeId: z.string().min(1).optional(),
  patientId: z.string().min(1).optional(),
  dueAt: z.string().datetime({ offset: true }).optional(),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).optional(),
});

export type CreateTaskInput = z.infer<typeof createTaskSchema>;

export const setTaskStatusSchema = z.object({
  status: z.enum(['OPEN', 'IN_PROGRESS', 'DONE', 'CANCELLED']),
});

export type SetTaskStatusInput = z.infer<typeof setTaskStatusSchema>;
