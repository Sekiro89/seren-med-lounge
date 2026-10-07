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
import { Button } from '../../../../components/ui/button';
import { Dialog } from '../../../../components/ui/dialog';
import { Field, Input } from '../../../../components/ui/fields';
import { apiClient } from '../../../../lib/api-client';
import { formatDate, humanize } from '../../../../lib/format';
import { can } from '../../../../lib/permissions';
import { LinkButton } from './document';
import { apiErrorMessage, type LabOrder, type LabOrderItem } from './types';
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
      className="mt-2 grid grid-cols-2 items-start gap-x-3 gap-y-2 pb-2"
      noValidate
    >
      <div>
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
      <div>
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
      <div className="col-span-2">
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
        size="sm"
        className="col-span-2 justify-self-start"
        loading={formState.isSubmitting}
      >
        Record result
      </Button>
      {error && (
        <p role="alert" className="col-span-2 text-[13px] text-danger-fg">
          {error}
        </p>
      )}
    </form>
  );
}

/** The existing lab order form, opened from the rail's Order. */
function LabOrderFormDialog({
  encounterId,
  onClose,
  onSaved,
}: {
  encounterId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [formError, setFormError] = useState<string | null>(null);
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
      onSaved();
      onClose();
    } catch (error) {
      setFormError(apiErrorMessage(error, 'Could not create the lab order.'));
    }
  };

  return (
    <Dialog
      open
      onClose={() => !formState.isSubmitting && onClose()}
      title="Order tests"
      description="One row per test. The lab desk sees the order straight away."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={formState.isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" form="lab-form" loading={formState.isSubmitting}>
            Order tests
          </Button>
        </>
      }
    >
      <form
        id="lab-form"
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
                  error={itemErrors?.instructions && 'Instructions can be at most 1000 characters.'}
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
      </form>
    </Dialog>
  );
}

export function LabOrdersRail({
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
  const [ordering, setOrdering] = useState(false);
  const [confirming, setConfirming] = useState<LabOrder | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [resultingItemId, setResultingItemId] = useState<string | null>(null);
  const canOrder = can(role, 'lab-order:write');

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
    <section aria-labelledby="rail-tests">
      <div className="section-rule flex min-h-10 items-center justify-between pt-1">
        <h2 id="rail-tests" className="text-sm font-semibold text-fg">
          Tests
        </h2>
        {canOrder && (
          <LinkButton
            icon={<Plus size={14} aria-hidden="true" />}
            onClick={() => setOrdering(true)}
          >
            Order
          </LinkButton>
        )}
      </div>
      {labOrders.length === 0 ? (
        <p className="py-2 text-[13px] text-fg-muted">No tests ordered on this visit.</p>
      ) : (
        <ul className="border-b border-line">
          {labOrders.map((order) => {
            const cancelled = order.status === 'CANCELLED';
            return (
              <li key={order.id} className="border-t border-line first:border-t-0">
                <ul className="divide-y divide-line">
                  {order.items.map((item) => {
                    const latestResult = item.results[item.results.length - 1];
                    return (
                      <li key={item.id} className="py-1.5 text-[13px]">
                        <div className="flex min-h-7 items-center gap-2">
                          <span className={cancelled ? 'text-fg-subtle line-through' : 'text-fg'}>
                            {item.testName}
                          </span>
                          <span className="ml-auto text-right">
                            {latestResult ? (
                              <span className="font-mono text-fg">
                                {latestResult.resultValue}
                                {latestResult.unit
                                  ? latestResult.unit === '%'
                                    ? '%'
                                    : ` ${latestResult.unit}`
                                  : ''}
                              </span>
                            ) : cancelled ? (
                              <span className="text-xs text-fg-muted">Cancelled</span>
                            ) : can(role, 'lab-result:write') ? (
                              <LinkButton
                                tone="muted"
                                onClick={() =>
                                  setResultingItemId(resultingItemId === item.id ? null : item.id)
                                }
                              >
                                {resultingItemId === item.id ? 'Cancel' : 'Add result'}
                              </LinkButton>
                            ) : (
                              <span className="text-xs text-fg-muted">
                                {humanize(order.status)}
                              </span>
                            )}
                          </span>
                        </div>
                        {latestResult?.referenceRange && (
                          <p className="text-xs text-fg-muted">
                            normal {latestResult.referenceRange}
                          </p>
                        )}
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
                {order.status === 'ORDERED' && canOrder && (
                  <div className="-mt-1 flex justify-end pb-1">
                    <LinkButton tone="danger" small onClick={() => setConfirming(order)}>
                      Cancel order
                    </LinkButton>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {formError && (
        <p role="alert" className="mt-2 text-[13px] text-danger-fg">
          {formError}
        </p>
      )}
      {ordering && (
        <LabOrderFormDialog
          encounterId={encounterId}
          onClose={() => setOrdering(false)}
          onSaved={onChange}
        />
      )}
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
    </section>
  );
}
