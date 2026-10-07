export interface PendingItem {
  id: string;
  medicationName: string;
  dosage: string;
  frequency: string;
  durationDays: number | null;
  instructions: string | null;
  prescription: {
    id: string;
    createdAt: string;
    patient: { id: string; firstName: string; lastName: string };
  };
}

export type DispensingStatus =
  'PREPARED' | 'OUT_FOR_DELIVERY' | 'HANDED_OVER' | 'DELIVERED' | 'CANCELLED';

export interface DispensingRow {
  id: string;
  patientId: string;
  patient: { id: string; firstName: string; lastName: string };
  prescriptionItemId: string;
  quantity: number;
  status: DispensingStatus;
  mode: 'PICKUP' | 'HOME_DELIVERY';
  deliveryAddress: string | null;
  createdAt: string;
  medication: { name: string; strength: string | null; unit: string };
}

export interface MedicationOption {
  id: string;
  name: string;
  genericName: string | null;
  strength: string | null;
  unit: string;
  isActive: boolean;
}

export interface BatchRow {
  id: string;
  batchNumber: string;
  expiryDate: string;
  quantityOnHand: number;
}

/** Whole-day or hour-level "how long ago" for a timestamp. */
export function timeAgo(iso: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (minutes < 60) return minutes <= 1 ? 'Just now' : `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? '1 day ago' : `${days} days ago`;
}
