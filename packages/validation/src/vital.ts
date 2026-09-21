import { z } from 'zod';

export const recordVitalSchema = z
  .object({
    encounterId: z.string().min(1),
    bloodPressureSystolic: z.number().int().min(40).max(300).optional(),
    bloodPressureDiastolic: z.number().int().min(20).max(200).optional(),
    pulseBpm: z.number().int().min(20).max(250).optional(),
    spo2Percent: z.number().int().min(0).max(100).optional(),
    temperatureCelsius: z.number().min(25).max(45).optional(),
    bmi: z.number().min(5).max(100).optional(),
  })
  .refine(
    (data) =>
      Object.entries(data).some(([key, value]) => key !== 'encounterId' && value !== undefined),
    { message: 'At least one vital sign is required.' },
  );

export type RecordVitalInput = z.infer<typeof recordVitalSchema>;
