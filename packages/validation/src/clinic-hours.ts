import { z } from 'zod';

const clockTime = z
  .string()
  .regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/, 'Time must be HH:MM (24-hour, 00:00-23:59).');

/** One open weekday: dayOfWeek 0 = Sunday … 6 = Saturday, clinic-local times. */
export const clinicHoursDaySchema = z
  .object({
    dayOfWeek: z.number().int().min(0).max(6),
    opensAt: clockTime,
    closesAt: clockTime,
  })
  .refine((v) => v.opensAt < v.closesAt, {
    message: 'Closing time must be after opening time.',
    path: ['closesAt'],
  });

/**
 * PUT /clinic/hours — replaces the whole week. List only the days the
 * clinic opens; a weekday left out is closed. Each weekday at most once.
 */
export const setClinicHoursSchema = z.object({
  days: z
    .array(clinicHoursDaySchema)
    .max(7)
    .refine((days) => new Set(days.map((d) => d.dayOfWeek)).size === days.length, {
      message: 'Each day of the week may appear only once.',
    }),
});

export type ClinicHoursDayInput = z.infer<typeof clinicHoursDaySchema>;
export type SetClinicHoursInput = z.infer<typeof setClinicHoursSchema>;
