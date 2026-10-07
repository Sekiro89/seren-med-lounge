'use client';

import { useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  createLabOrderSchema,
  recordLabResultSchema,
  type CreateLabOrderInput,
  type RecordLabResultInput,
} from '@serenemed/validation';
import type { StaffRole } from '@serenemed/types';
import { Button, Card } from '@serenemed/ui';
import { apiClient } from '../../../lib/api-client';
import { can } from '../../../lib/permissions';
import { apiErrorMessage, type LabOrder, type LabOrderItem } from './types';

const EMPTY_ITEM = { testName: '' };

function RecordResultForm({ item, onDone }: { item: LabOrderItem; onDone: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm<RecordLabResultInput>({
    resolver: zodResolver(recordLabResultSchema),
  });

  const onSubmit = async (data: RecordLabResultInput) => {
    setError(null);
    try {
      await apiClient.post(`/lab-orders/items/${item.id}/results`, data);
      onDone();
    } catch (submitError) {
      setError(apiErrorMessage(submitError, 'Could not record this result.'));
    }
  };

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="mt-1 flex flex-wrap items-end gap-2"
      noValidate
    >
      <input
        placeholder="Result"
        className="w-28 rounded-md border border-slate-300 px-2 py-1 text-xs"
        {...register('resultValue')}
      />
      <input
        placeholder="Unit (optional)"
        className="w-24 rounded-md border border-slate-300 px-2 py-1 text-xs"
        {...register('unit')}
      />
      <input
        placeholder="Reference range (optional)"
        className="w-32 rounded-md border border-slate-300 px-2 py-1 text-xs"
        {...register('referenceRange')}
      />
      <Button type="submit" variant="secondary" disabled={formState.isSubmitting}>
        {formState.isSubmitting ? 'Saving…' : 'Record result'}
      </Button>
      {error && <p className="w-full text-xs text-red-600">{error}</p>}
    </form>
  );
}

export function LabOrdersSection({
  encounterId,
  labOrders,
  role,
  onChange,
}: {
  encounterId: string;
  labOrders: LabOrder[];
  role: StaffRole | undefined;
  onChange: () => void;
}) {
  const [formError, setFormError] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [resultingItemId, setResultingItemId] = useState<string | null>(null);

  const { register, control, handleSubmit, reset, formState } = useForm<CreateLabOrderInput>({
    resolver: zodResolver(createLabOrderSchema),
    defaultValues: { encounterId, items: [EMPTY_ITEM] },
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'items' });

  const onSubmit = async (data: CreateLabOrderInput) => {
    setFormError(null);
    try {
      await apiClient.post('/lab-orders', { ...data, encounterId });
      reset({ encounterId, items: [EMPTY_ITEM] });
      onChange();
    } catch (error) {
      setFormError(apiErrorMessage(error, 'Could not create the lab order.'));
    }
  };

  const cancelOrder = async (id: string) => {
    setCancellingId(id);
    setFormError(null);
    try {
      await apiClient.post(`/lab-orders/${id}/cancel`);
      onChange();
    } catch (error) {
      setFormError(apiErrorMessage(error, 'Could not cancel this lab order.'));
    } finally {
      setCancellingId(null);
    }
  };

  return (
    <Card>
      <h2 className="mb-3 text-sm font-semibold text-slate-900">Lab orders</h2>
      {labOrders.length === 0 ? (
        <p className="mb-3 text-sm text-slate-500">No lab orders yet.</p>
      ) : (
        <ul className="mb-4 flex flex-col gap-2">
          {labOrders.map((order) => (
            <li key={order.id} className="rounded-md bg-slate-50 px-3 py-2 text-sm">
              <div className="mb-1 flex items-center justify-between">
                <span className="rounded bg-slate-200 px-1.5 py-0.5 text-xs text-slate-700">
                  {order.status}
                </span>
                {order.status === 'ORDERED' && can(role, 'lab-order:write') && (
                  <Button
                    variant="danger"
                    onClick={() => cancelOrder(order.id)}
                    disabled={cancellingId === order.id}
                  >
                    {cancellingId === order.id ? 'Cancelling…' : 'Cancel'}
                  </Button>
                )}
              </div>
              <ul className="flex flex-col gap-2 text-slate-700">
                {order.items.map((item) => {
                  const latestResult = item.results[item.results.length - 1];
                  return (
                    <li key={item.id}>
                      <div className="flex items-center justify-between">
                        <span>{item.testName}</span>
                        {latestResult ? (
                          <span className="text-xs text-slate-500">
                            {latestResult.resultValue}
                            {latestResult.unit ? ` ${latestResult.unit}` : ''}
                          </span>
                        ) : (
                          can(role, 'lab-result:write') && (
                            <Button
                              variant="ghost"
                              onClick={() =>
                                setResultingItemId(resultingItemId === item.id ? null : item.id)
                              }
                            >
                              {resultingItemId === item.id ? 'Cancel' : 'Add result'}
                            </Button>
                          )
                        )}
                      </div>
                      {resultingItemId === item.id && (
                        <RecordResultForm
                          item={item}
                          onDone={() => {
                            setResultingItemId(null);
                            onChange();
                          }}
                        />
                      )}
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
      )}

      {can(role, 'lab-order:write') && (
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3" noValidate>
          {fields.map((field, index) => (
            <div key={field.id} className="flex flex-wrap items-end gap-2">
              <input
                placeholder="Test name (e.g. CBC)"
                className="w-48 rounded-md border border-slate-300 px-3 py-2 text-sm"
                {...register(`items.${index}.testName`)}
              />
              <input
                placeholder="Instructions (optional)"
                className="w-48 rounded-md border border-slate-300 px-3 py-2 text-sm"
                {...register(`items.${index}.instructions`)}
              />
              {fields.length > 1 && (
                <Button type="button" variant="ghost" onClick={() => remove(index)}>
                  Remove
                </Button>
              )}
            </div>
          ))}
          <Button
            type="button"
            variant="ghost"
            className="self-start"
            onClick={() => append(EMPTY_ITEM)}
          >
            + Add another test
          </Button>
          {formState.errors.items && (
            <p className="text-xs text-red-600">Check the test fields above.</p>
          )}
          {formError && <p className="text-xs text-red-600">{formError}</p>}
          <Button type="submit" disabled={formState.isSubmitting} className="self-start">
            {formState.isSubmitting ? 'Ordering…' : 'Order tests'}
          </Button>
        </form>
      )}
    </Card>
  );
}
