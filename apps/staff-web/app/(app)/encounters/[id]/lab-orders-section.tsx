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
import { clearKeysRhf, clearOnEditRhf } from '../../../../lib/forms';

const EMPTY_ITEM = { testName: '' };

/** Whitespace alone is not an entry, so trim before the schema sees it. */
const trimValue = (value: string) => (typeof value === 'string' ? value.trim() : value);

function itemErrorsOf(errors: unknown, index: number) {
  const list = (errors as { items?: unknown[] } | undefined)?.items;
  return list?.[index] as
    Partial<Record<'testName' | 'instructions', { type?: string }>> | undefined;
}

function RecordResultForm({ item, onDone }: { item: LabOrderItem; onDone: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, clearErrors, formState } = useForm<RecordLabResultInput>({
    resolver: zodResolver(recordLabResultSchema),
    reValidateMode: 'onSubmit',
  });

  const onSubmit = async (data: RecordLabResultInput) => {
    if (formState.isSubmitting) return;
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
      onChange={clearOnEditRhf(clearErrors, () => setError(null))}
      className="mt-2 flex flex-wrap items-start gap-3"
      noValidate
    >
      <div className="w-32">
        <Field
          label="Result"
          htmlFor={`res-value-${item.id}`}
          error={
            formState.errors.resultValue
              ? formState.errors.resultValue.type === 'too_big'
                ? 'Result can be at most 500 characters.'
                : 'Enter the result value.'
              : undefined
          }
        >
          <Input
            id={`res-value-${item.id}`}
            required
            aria-required="true"
            maxLength={500}
            aria-invalid={formState.errors.resultValue ? true : undefined}
            {...register('resultValue', { setValueAs: trimValue })}
          />
        </Field>
      </div>
      <div className="w-28">
        <Field
          label="Unit (optional)"
          htmlFor={`res-unit-${item.id}`}
          error={formState.errors.unit && 'Unit can be at most 50 characters.'}
        >
          <Input
            id={`res-unit-${item.id}`}
            maxLength={50}
            {...register('unit', { setValueAs: (v: string) => trimValue(v) || undefined })}
          />
        </Field>
      </div>
      <div className="w-40">
        <Field
          label="Reference range (optional)"
          htmlFor={`res-range-${item.id}`}
          error={formState.errors.referenceRange && 'Range can be at most 200 characters.'}
        >
          <Input
            id={`res-range-${item.id}`}
            maxLength={200}
            {...register('referenceRange', {
              setValueAs: (v: string) => trimValue(v) || undefined,
            })}
          />
        </Field>
      </div>
      <Button
        type="submit"
        variant="secondary"
        className="sm:mt-[1.625rem]"
        loading={formState.isSubmitting}
      >
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

  const { register, control, handleSubmit, reset, clearErrors, formState } =
    useForm<CreateLabOrderInput>({
      resolver: zodResolver(createLabOrderSchema),
      reValidateMode: 'onSubmit',
      defaultValues: { encounterId, items: [EMPTY_ITEM] },
    });
  // The "add at least one test" error belongs to the whole list.
  const GROUP = ['items.root', 'items.message'] as const;
  const { fields, append, remove } = useFieldArray({ control, name: 'items' });

  const onSubmit = async (data: CreateLabOrderInput) => {
    if (formState.isSubmitting) return;
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
          <form
            onSubmit={handleSubmit(onSubmit)}
            onChange={clearOnEditRhf(clearErrors, () => setFormError(null), { '*': [...GROUP] })}
            className="flex flex-col gap-4"
            noValidate
          >
            {fields.map((field, index) => {
              const itemErrors = itemErrorsOf(formState.errors, index);
              return (
                <div key={field.id} className="flex flex-wrap items-start gap-3">
                  <div className="w-56">
                    <Field
                      label="Test name"
                      htmlFor={`lab-test-${index}`}
                      helper="For example CBC"
                      error={
                        itemErrors?.testName
                          ? itemErrors.testName.type === 'too_big'
                            ? 'Test name can be at most 200 characters.'
                            : 'Enter the test name.'
                          : undefined
                      }
                    >
                      <Input
                        id={`lab-test-${index}`}
                        required
                        aria-required="true"
                        maxLength={200}
                        aria-invalid={itemErrors?.testName ? true : undefined}
                        {...register(`items.${index}.testName`, { setValueAs: trimValue })}
                      />
                    </Field>
                  </div>
                  <div className="w-56">
                    <Field
                      label="Instructions (optional)"
                      htmlFor={`lab-instr-${index}`}
                      error={
                        itemErrors?.instructions && 'Instructions can be at most 1000 characters.'
                      }
                    >
                      <Input
                        id={`lab-instr-${index}`}
                        maxLength={1000}
                        {...register(`items.${index}.instructions`, {
                          setValueAs: (v: string) => trimValue(v) || undefined,
                        })}
                      />
                    </Field>
                  </div>
                  {fields.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      className="sm:mt-[1.625rem]"
                      aria-label={`Remove test ${index + 1}`}
                      icon={<Trash size={20} aria-hidden="true" />}
                      onClick={() => {
                        remove(index);
                        clearKeysRhf(clearErrors, [...GROUP]);
                      }}
                    />
                  )}
                </div>
              );
            })}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="self-start"
              icon={<Plus size={16} aria-hidden="true" />}
              onClick={() => {
                append(EMPTY_ITEM);
                clearKeysRhf(clearErrors, [...GROUP]);
              }}
            >
              Add another test
            </Button>
            {(formState.errors.items?.message || formState.errors.items?.root?.message) && (
              <p role="alert" className="text-[13px] text-danger-fg">
                Add at least one test.
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
