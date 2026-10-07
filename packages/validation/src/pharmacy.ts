import { z } from 'zod';

const quantity = z.number().int().positive().max(1_000_000);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.');

export const createMedicationSchema = z.object({
  name: z.string().min(1).max(200),
  genericName: z.string().max(200).optional(),
  form: z.enum(['TABLET', 'CAPSULE', 'SYRUP', 'INJECTION', 'CREAM', 'DROPS', 'INHALER', 'OTHER']),
  strength: z.string().max(100).optional(),
  unit: z.string().min(1).max(50),
  unitPriceMinor: z.number().int().nonnegative().max(100_000_000).optional(),
  reorderLevel: z.number().int().nonnegative().max(1_000_000).optional(),
});

export type CreateMedicationInput = z.infer<typeof createMedicationSchema>;

export const receiveStockSchema = z.object({
  medicationId: z.string().min(1),
  batchNumber: z.string().min(1).max(100),
  expiryDate: isoDate,
  quantity,
  unitCostMinor: z.number().int().nonnegative().max(100_000_000).optional(),
  supplier: z.string().max(200).optional(),
});

export type ReceiveStockInput = z.infer<typeof receiveStockSchema>;

/** Stock-count correction (either sign) or wastage (expired/damaged: always a removal). */
export const adjustStockSchema = z
  .object({
    type: z.enum(['ADJUSTMENT', 'WASTAGE']),
    quantityDelta: z.number().int().min(-1_000_000).max(1_000_000),
    reason: z.string().min(1).max(500),
  })
  .refine((v) => v.quantityDelta !== 0, { message: 'quantityDelta cannot be 0.' })
  .refine((v) => v.type !== 'WASTAGE' || v.quantityDelta < 0, {
    message: 'WASTAGE must remove stock (negative quantityDelta).',
  });

export type AdjustStockInput = z.infer<typeof adjustStockSchema>;

export const createDispensingSchema = z
  .object({
    prescriptionItemId: z.string().min(1),
    medicationId: z.string().min(1),
    quantity,
    mode: z.enum(['PICKUP', 'HOME_DELIVERY']),
    deliveryAddress: z.string().min(1).max(500).optional(),
  })
  .refine((v) => v.mode === 'PICKUP' || v.deliveryAddress, {
    message: 'deliveryAddress is required for HOME_DELIVERY.',
  });

export type CreateDispensingInput = z.infer<typeof createDispensingSchema>;
