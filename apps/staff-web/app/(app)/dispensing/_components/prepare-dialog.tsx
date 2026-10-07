'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { CheckCircle } from '@phosphor-icons/react';
import { ApiError } from '@serenemed/api-client';
import { createDispensingSchema } from '@serenemed/validation';
import { Button } from '../../../../components/ui/button';
import { Dialog } from '../../../../components/ui/dialog';
import { Field, Input, Select, Textarea } from '../../../../components/ui/fields';
import { SearchBox } from '../../../../components/ui/search-box';
import { apiClient } from '../../../../lib/api-client';
import { clinicToday, formatDate, fullName } from '../../../../lib/format';
import { clearOnEdit, makeClearError, type FieldErrors } from '../../../../lib/forms';
import { useApi } from '../../../../lib/use-api';
import type { BatchRow, MedicationOption, PendingItem } from './types';

interface Created {
  allocations: { batchId: string; batchNumber: string; quantity: number }[];
}

function errorText(e: unknown): string {
  if (e instanceof ApiError) {
    const message = (e.body as { message?: string | string[] } | undefined)?.message;
    const text = Array.isArray(message) ? message.join(' ') : message;
    if (text) return text;
    if (e.status === 409) return 'This line has already been prepared or cannot be filled.';
  }
  return 'That did not go through. Please try again.';
}

export function PrepareDialog({
  item,
  onClose,
  onDone,
}: {
  item: PendingItem | null;
  onClose: () => void;
  onDone: (item: PendingItem) => void;
}) {
  if (!item) return null;
  return <PrepareBody key={item.id} item={item} onClose={onClose} onDone={onDone} />;
}

function PrepareBody({
  item,
  onClose,
  onDone,
}: {
  item: PendingItem;
  onClose: () => void;
  onDone: (item: PendingItem) => void;
}) {
  const [search, setSearch] = useState(item.medicationName);
  const [query, setQuery] = useState(item.medicationName);
  const [medicationId, setMedicationId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [mode, setMode] = useState<'PICKUP' | 'HOME_DELIVERY'>('PICKUP');
  const [address, setAddress] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState<string>();
  const clearBase = makeClearError(setErrors, () => setServerError(undefined));
  // Any edit also drops the form-level "check the details" message.
  const clearError = (...keys: string[]) => clearBase(...keys, 'form');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ batchNumber: string; quantity: number }[]>();

  useEffect(() => {
    const id = window.setTimeout(() => setQuery(search.trim()), 300);
    return () => window.clearTimeout(id);
  }, [search]);

  const meds = useApi<MedicationOption[]>(`/medications?search=${encodeURIComponent(query)}`);
  const options = (meds.data ?? []).filter((m) => m.isActive);

  const batches = useApi<BatchRow[]>(
    medicationId ? `/stock/batches?medicationId=${encodeURIComponent(medicationId)}` : null,
  );

  const today = clinicToday();
  const usable = (batches.data ?? []).filter((b) => b.expiryDate.slice(0, 10) >= today);
  const usableTotal = usable.reduce((sum, b) => sum + b.quantityOnHand, 0);
  const soonest = usable[0]?.expiryDate;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setServerError(undefined);
    const parsed = createDispensingSchema.safeParse({
      prescriptionItemId: item.id,
      medicationId,
      quantity: quantity === '' ? undefined : Number(quantity),
      mode,
      deliveryAddress: mode === 'HOME_DELIVERY' ? address.trim() || undefined : undefined,
    });
    const next: FieldErrors = {};
    if (!medicationId) next.medicationId = 'Choose the medicine to dispense.';
    const units = Number(quantity);
    if (quantity === '' || !Number.isInteger(units) || units < 1) {
      next.quantity = 'Enter a whole number of units, 1 or more.';
    } else if (units > 1_000_000) {
      next.quantity = 'Quantity cannot be more than 1,000,000.';
    } else if (medicationId && !batches.loading && batches.data && units > usableTotal) {
      next.quantity = `Only ${usableTotal} units are usable on hand.`;
    }
    if (mode === 'HOME_DELIVERY' && !address.trim()) {
      next.deliveryAddress = 'A delivery address is required for home delivery.';
    }
    if (Object.keys(next).length === 0 && !parsed.success) {
      next.form = 'Check the details and try again.';
    }
    if (Object.keys(next).length > 0 || !parsed.success) {
      setErrors(next);
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      const created = await apiClient.post<Created>('/dispensings', parsed.data);
      setResult(
        created.allocations.map((a) => ({ batchNumber: a.batchNumber, quantity: a.quantity })),
      );
      onDone(item);
    } catch (e) {
      setServerError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const patient = fullName(item.prescription.patient);

  if (result) {
    return (
      <Dialog
        open
        onClose={onClose}
        title="Prepared"
        footer={<Button onClick={onClose}>Done</Button>}
      >
        <div className="flex items-start gap-3">
          <CheckCircle size={24} aria-hidden="true" className="mt-0.5 shrink-0 text-success-fg" />
          <div>
            <p className="text-sm text-fg">
              {item.medicationName} for {patient} is ready. Stock was drawn from:
            </p>
            <ul className="mt-3 flex flex-col gap-1.5">
              {result.map((r, i) => (
                <li key={i} className="flex justify-between gap-6 text-sm">
                  <span className="font-mono text-fg">{r.batchNumber}</span>
                  <span className="tabular text-fg-muted">{r.quantity} units</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Prepare medicine"
      description={`${patient}: ${item.medicationName}, ${item.dosage}, ${item.frequency}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Close
          </Button>
          <Button type="submit" form="prepare-form" loading={busy}>
            Prepare
          </Button>
        </>
      }
    >
      <form
        id="prepare-form"
        onSubmit={submit}
        onChange={clearOnEdit(clearError, {
          'med-select': ['medicationId', 'quantity'],
          qty: ['quantity'],
          mode: ['deliveryAddress'],
          addr: ['deliveryAddress'],
        })}
        noValidate
        className="flex flex-col gap-4"
      >
        {serverError && (
          <p role="alert" className="rounded-control bg-danger-bg px-3 py-2 text-sm text-danger-fg">
            {serverError}
          </p>
        )}
        {errors.form && (
          <p role="alert" className="rounded-control bg-danger-bg px-3 py-2 text-sm text-danger-fg">
            {errors.form}
          </p>
        )}

        <Field label="Find in catalogue" htmlFor="med-search">
          <SearchBox
            id="med-search"
            aria-label="Find in catalogue"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </Field>

        <Field
          label="Medicine"
          htmlFor="med-select"
          error={errors.medicationId}
          helper={
            !meds.loading && options.length === 0
              ? 'No active medicine matches this search.'
              : undefined
          }
        >
          <Select
            id="med-select"
            required
            aria-required="true"
            aria-invalid={errors.medicationId ? true : undefined}
            value={medicationId}
            onChange={(e) => setMedicationId(e.target.value)}
          >
            <option value="">{meds.loading ? 'Searching...' : 'Choose a medicine'}</option>
            {options.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
                {m.strength ? ` ${m.strength}` : ''} ({m.unit})
              </option>
            ))}
          </Select>
        </Field>

        {medicationId && (
          <p
            className={`rounded-control px-3 py-2 text-sm ${
              usableTotal > 0 ? 'bg-surface-muted text-fg' : 'bg-warning-bg text-warning-fg'
            }`}
          >
            {batches.loading
              ? 'Checking stock...'
              : usableTotal > 0
                ? `${usableTotal} units usable on hand. Soonest expiry ${formatDate(soonest!)}.`
                : 'No usable stock on hand for this medicine.'}
          </p>
        )}

        <Field label="Quantity" htmlFor="qty" error={errors.quantity}>
          <Input
            id="qty"
            type="number"
            inputMode="numeric"
            min={1}
            max={1000000}
            step={1}
            required
            aria-required="true"
            aria-invalid={errors.quantity ? true : undefined}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </Field>

        <Field label="How the patient receives it" htmlFor="mode">
          <Select
            id="mode"
            value={mode}
            onChange={(e) => setMode(e.target.value as 'PICKUP' | 'HOME_DELIVERY')}
          >
            <option value="PICKUP">Pickup at the pharmacy</option>
            <option value="HOME_DELIVERY">Home delivery</option>
          </Select>
        </Field>

        {mode === 'HOME_DELIVERY' && (
          <Field label="Delivery address" htmlFor="addr" error={errors.deliveryAddress}>
            <Textarea
              id="addr"
              required
              aria-required="true"
              aria-invalid={errors.deliveryAddress ? true : undefined}
              value={address}
              maxLength={500}
              onChange={(e) => setAddress(e.target.value)}
            />
          </Field>
        )}
      </form>
    </Dialog>
  );
}
