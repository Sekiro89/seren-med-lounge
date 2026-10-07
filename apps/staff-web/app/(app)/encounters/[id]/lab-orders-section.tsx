'use client';

import { useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Trash } from '@phosphor-icons/react';
import {
  createLabOrderSchema,
  recordLabResultSchema,
  type CreateLabOrderInput,
  type RecordLabResultInput,
} from '@serenemed/validation';
import type { StaffRole } from '@serenemed/types';
import { Badge } from '../../../../components/ui/badge';
import { Button } from '../../../../components/ui/button';
import { Card, CardHeader } from '../../../../components/ui/card';
import { Dialog } from '../../../../components/ui/dialog';
import { Field, Input } from '../../../../components/ui/fields';
import { apiClient } from '../../../../lib/api-client';
import { formatDate, humanize } from '../../../../lib/format';
import { can } from '../../../../lib/permissions';
import { apiErrorMessage, orderTone, type LabOrder, type LabOrderItem } from './types';

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
      className="mt-2 flex flex-wrap items-end gap-3"
      noValidate
    >
      <div className="w-32">
        <Field
          label="Result"
          htmlFor={`res-value-${item.id}`}
          error={formState.errors.resultValue?.message}
        >
          <Input id={`res-value-${item.id}`} {...register('resultValue')} />
        </Field>
      </div>
      <div className="w-28">
        <Field label="Unit (optional)" htmlFor={`res-unit-${item.id}`}>
          <Input id={`res-unit-${item.id}`} {...register('unit')} />
        </Field>
      </div>
      <div className="w-40">
        <Field label="Reference range (optional)" htmlFor={`res-range-${item.id}`}>
          <Input id={`res-range-${item.id}`} {...register('referenceRange')} />
        </Field>
      </div>
      <Button type="submit" variant="secondary" loading={formState.isSubmitting}>
        Record result
      </Button>
      {error && (
        <p role="alert" className="w-full text-[13px] text-danger-fg">
          {error}
        </p>
      )}
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
  const [confirming, setConfirming] = useState<LabOrder | null>(null);
  const [cancelling, setCancelling] = useState(false);
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

  const cancelOrder = async (order: LabOrder) => {
    setCancelling(true);
    setFormError(null);
    try {
      await apiClient.post(`/lab-orders/${order.id}/cancel`);
      setConfirming(null);
      onChange();
    } catch (error) {
      setConfirming(null);
      setFormError(apiErrorMessage(error, 'Could not cancel this lab order.'));
    } finally {
      setCancelling(false);
    }
  };

  return (
    <Card>
      <CardHeader title="Lab orders" />
      <div className="p-5">
        {labOrders.length === 0 ? (
          <p className="mb-4 text-sm text-fg-muted">No lab orders yet.</p>
        ) : (
          <ul className="mb-5 flex flex-col gap-2">
            {labOrders.map((order) => (
              <li key={order.id} className="rounded-control bg-surface-muted px-3 py-2 text-sm">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <Badge tone={orderTone(order.status)}>{humanize(order.status)}</Badge>
                  {order.status === 'ORDERED' && can(role, 'lab-order:write') && (
                    <Button variant="danger" size="sm" onClick={() => setConfirming(order)}>
                      Cancel
                    </Button>
                  )}
                </div>
                <ul className="flex flex-col gap-2 text-fg">
                  {order.items.map((item) => {
                    const latestResult = item.results[item.results.length - 1];
                    return (
                      <li key={item.id}>
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium">{item.testName}</span>
                          {latestResult ? (
                            <span className="tabular text-[13px] text-fg-muted">
                              {latestResult.resultValue}
                              {latestResult.unit ? ` ${latestResult.unit}` : ''}
                            </span>
                          ) : (
                            can(role, 'lab-result:write') && (
                              <Button
                                variant="ghost"
                                size="sm"
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
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
            {fields.map((field, index) => (
              <div key={field.id} className="flex flex-wrap items-end gap-3">
                <div className="w-56">
                  <Field label="Test name" htmlFor={`lab-test-${index}`} helper="For example CBC">
                    <Input id={`lab-test-${index}`} {...register(`items.${index}.testName`)} />
                  </Field>
                </div>
                <div className="w-56">
                  <Field label="Instructions (optional)" htmlFor={`lab-instr-${index}`}>
                    <Input id={`lab-instr-${index}`} {...register(`items.${index}.instructions`)} />
                  </Field>
                </div>
                {fields.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    aria-label={`Remove test ${index + 1}`}
                    icon={<Trash size={20} aria-hidden="true" />}
                    onClick={() => remove(index)}
                  />
                )}
              </div>
            ))}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="self-start"
              icon={<Plus size={16} aria-hidden="true" />}
              onClick={() => append(EMPTY_ITEM)}
            >
              Add another test
            </Button>
            {formState.errors.items && (
              <p role="alert" className="text-[13px] text-danger-fg">
                Check the test fields above.
              </p>
            )}
            {formError && (
              <p role="alert" className="text-[13px] text-danger-fg">
                {formError}
              </p>
            )}
            <Button type="submit" loading={formState.isSubmitting} className="self-start">
              Order tests
            </Button>
          </form>
        )}
        {!can(role, 'lab-order:write') && formError && (
          <p role="alert" className="mt-3 text-[13px] text-danger-fg">
            {formError}
          </p>
        )}
      </div>

      <Dialog
        open={confirming !== null}
        onClose={() => setConfirming(null)}
        title="Cancel lab order"
        description={
          confirming
            ? `Ordered ${formatDate(confirming.createdAt)}. This cannot be undone.`
            : undefined
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirming(null)}>
              Keep order
            </Button>
            <Button
              variant="danger"
              loading={cancelling}
              onClick={() => confirming && cancelOrder(confirming)}
            >
              Cancel lab order
            </Button>
          </>
        }
      >
        <ul className="text-sm text-fg">
          {confirming?.items.map((item) => (
            <li key={item.id}>{item.testName}</li>
          ))}
        </ul>
      </Dialog>
    </Card>
  );
}
