'use client';

import { useState } from 'react';
import { createInsuranceCaseSchema, createInsurancePolicySchema } from '@serenemed/validation';
import { Button } from '../../../../components/ui/button';
import { Dialog } from '../../../../components/ui/dialog';
import { Field, Input, Select } from '../../../../components/ui/fields';
import { Skeleton } from '../../../../components/ui/skeleton';
import { apiClient } from '../../../../lib/api-client';
import { formatMoney } from '../../../../lib/format';
import {
  focusFirst,
  invalidProps,
  isClean,
  req,
  requiredProps,
  type FieldErrors,
  clearOnEdit,
  makeClearError,
} from '../../../../lib/forms';
import { can } from '../../../../lib/permissions';
import { useStaff } from '../../../../lib/staff-context';
import { useApi } from '../../../../lib/use-api';
import {
  errorText,
  invoiceLabel,
  rupeesToPaise,
  type CaseDetail,
  type InvoiceOption,
  type PolicyRow,
} from './insurance-types';
import { PatientPicker, type PatientOption } from './patient-picker';

interface PolicyDraft {
  insurerName: string;
  policyNumber: string;
  tpaName: string;
  memberId: string;
}

const blankPolicy: PolicyDraft = { insurerName: '', policyNumber: '', tpaName: '', memberId: '' };

export function NewCaseDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (created: CaseDetail) => void;
}) {
  const user = useStaff();
  const canInvoice = can(user.role, 'invoice:manage');
  const [patient, setPatient] = useState<PatientOption | null>(null);
  const [policyId, setPolicyId] = useState('');
  const [addingPolicy, setAddingPolicy] = useState(false);
  const [draft, setDraft] = useState<PolicyDraft>(blankPolicy);
  const [amount, setAmount] = useState('');
  const [invoiceId, setInvoiceId] = useState('');
  const [error, setError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const clearError = makeClearError(setErrors, () => setError(undefined));

  const policies = useApi<PolicyRow[]>(
    open && patient ? `/insurance/policies?patientId=${encodeURIComponent(patient.id)}` : null,
  );
  const invoices = useApi<InvoiceOption[]>(
    open && patient && canInvoice ? `/invoices?patientId=${encodeURIComponent(patient.id)}` : null,
  );
  const active = (policies.data ?? []).filter((p) => p.isActive);
  const openInvoices = (invoices.data ?? []).filter((i) => i.status !== 'VOID');
  const showPolicyForm = addingPolicy || (!policies.loading && active.length === 0);

  const reset = () => {
    setPatient(null);
    setPolicyId('');
    setAddingPolicy(false);
    setDraft(blankPolicy);
    setAmount('');
    setInvoiceId('');
    setError(undefined);
    setErrors({});
  };
  const close = () => {
    reset();
    onClose();
  };

  const submit = async () => {
    if (submitting) return;
    setError(undefined);
    const next: FieldErrors = {};
    if (!patient) next['case-patient'] = 'Choose a patient first.';
    const requested = amount.trim() === '' ? undefined : Number(amount);
    if (requested !== undefined && (!Number.isFinite(requested) || requested < 0)) {
      next['case-amount'] = 'Enter the requested amount in rupees, for example 25000.';
    } else if (requested !== undefined && requested * 100 > 1_000_000_000) {
      next['case-amount'] = 'That amount is too large.';
    }
    if (patient && !policies.loading) {
      if (showPolicyForm) {
        if (!draft.insurerName.trim()) next['policy-insurer'] = 'Enter the insurer name.';
        else if (draft.insurerName.trim().length > 200) {
          next['policy-insurer'] = 'Use 200 characters or fewer.';
        }
        if (!draft.policyNumber.trim()) next['policy-number'] = 'Enter the policy number.';
        else if (draft.policyNumber.trim().length > 100) {
          next['policy-number'] = 'Use 100 characters or fewer.';
        }
        if (draft.tpaName.trim().length > 200) next['policy-tpa'] = 'Use 200 characters or fewer.';
        if (draft.memberId.trim().length > 100) {
          next['policy-member'] = 'Use 100 characters or fewer.';
        }
      } else if (!(policyId || active[0]?.id))
        next['policy-choice'] = 'Choose the policy this case is for.';
    }
    setErrors(next);
    if (!isClean(next) || !patient) {
      return focusFirst({ ...next, 'case-patient-search': next['case-patient'] }, [
        'case-patient-search',
        'policy-insurer',
        'policy-number',
        'policy-tpa',
        'policy-member',
        'case-amount',
      ]);
    }
    setSubmitting(true);
    try {
      let chosenPolicy = policyId || active[0]?.id || '';
      if (showPolicyForm) {
        const parsed = createInsurancePolicySchema.safeParse({
          patientId: patient.id,
          insurerName: draft.insurerName.trim(),
          policyNumber: draft.policyNumber.trim(),
          ...(draft.tpaName.trim() ? { tpaName: draft.tpaName.trim() } : {}),
          ...(draft.memberId.trim() ? { memberId: draft.memberId.trim() } : {}),
        });
        if (!parsed.success) {
          setError('Enter the insurer name and the policy number.');
          return;
        }
        const policy = await apiClient.post<PolicyRow>('/insurance/policies', parsed.data);
        chosenPolicy = policy.id;
      }
      const parsedCase = createInsuranceCaseSchema.safeParse({
        policyId: chosenPolicy,
        ...(invoiceId ? { invoiceId } : {}),
        ...(requested !== undefined ? { requestedAmountMinor: rupeesToPaise(requested) } : {}),
      });
      if (!parsedCase.success) {
        setError('Choose the policy this case is for.');
        return;
      }
      const created = await apiClient.post<CaseDetail>('/insurance/cases', parsedCase.data);
      reset();
      onCreated(created);
    } catch (e) {
      setError(errorText(e, 'The case was not created. Please try again.'));
      policies.reload();
    } finally {
      setSubmitting(false);
    }
  };

  const set = (key: keyof PolicyDraft) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setDraft((d) => ({ ...d, [key]: e.target.value }));

  return (
    <Dialog
      open={open}
      onClose={close}
      title="New insurance case"
      description="Start with the patient's policy. Later steps are recorded as the insurer replies."
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button loading={submitting} onClick={submit}>
            Create case
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-6"
        noValidate
        onChange={clearOnEdit(clearError, { 'case-patient-search': ['case-patient'] })}
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <PatientPicker
          error={errors['case-patient']}
          value={patient}
          onChange={(p) => {
            setPatient(p);
            setPolicyId('');
            setInvoiceId('');
            setAddingPolicy(false);
            setError(undefined);
            setErrors({});
          }}
        />

        {patient && (
          <>
            {policies.loading ? (
              <Skeleton className="h-16 w-full" />
            ) : policies.errorStatus ? (
              <p role="alert" className="text-sm text-danger-fg">
                The policies could not be loaded. Close this dialog and try again.
              </p>
            ) : (
              <fieldset className="flex flex-col gap-3">
                <legend className="mb-2 text-sm font-medium">{req('Policy')}</legend>
                {active.length > 0 && (
                  <ul className="divide-y divide-line rounded-control border border-line">
                    {active.map((p) => {
                      const checked = (policyId || active[0]!.id) === p.id && !addingPolicy;
                      return (
                        <li key={p.id}>
                          <label className="flex cursor-pointer items-start gap-3 px-4 py-3">
                            <input
                              type="radio"
                              name="policy"
                              className="mt-1 size-4 accent-primary"
                              checked={checked}
                              onChange={() => {
                                setPolicyId(p.id);
                                setAddingPolicy(false);
                                clearError('policy-choice');
                              }}
                            />
                            <span className="min-w-0 text-sm">
                              <span className="block font-medium">{p.insurerName}</span>
                              <span className="tabular block text-[13px] text-fg-muted">
                                Policy {p.policyNumber}
                                {p.tpaName ? `, TPA ${p.tpaName}` : ''}
                              </span>
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {errors['policy-choice'] && (
                  <p role="alert" className="text-[13px] text-danger-fg">
                    {errors['policy-choice']}
                  </p>
                )}
                {active.length === 0 && (
                  <p className="text-[13px] text-fg-subtle">
                    This patient has no active policy yet. Add one to continue.
                  </p>
                )}
                {showPolicyForm ? (
                  <div className="flex flex-col gap-4">
                    <Field
                      label={req('Insurer')}
                      htmlFor="policy-insurer"
                      error={errors['policy-insurer']}
                    >
                      <Input
                        id="policy-insurer"
                        maxLength={200}
                        {...requiredProps}
                        {...invalidProps(errors['policy-insurer'])}
                        value={draft.insurerName}
                        onChange={set('insurerName')}
                      />
                    </Field>
                    <Field
                      label={req('Policy number')}
                      htmlFor="policy-number"
                      error={errors['policy-number']}
                    >
                      <Input
                        id="policy-number"
                        maxLength={100}
                        {...requiredProps}
                        {...invalidProps(errors['policy-number'])}
                        value={draft.policyNumber}
                        onChange={set('policyNumber')}
                      />
                    </Field>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field
                        label="TPA (optional)"
                        htmlFor="policy-tpa"
                        error={errors['policy-tpa']}
                      >
                        <Input
                          id="policy-tpa"
                          maxLength={200}
                          value={draft.tpaName}
                          onChange={set('tpaName')}
                        />
                      </Field>
                      <Field
                        label="Member ID (optional)"
                        htmlFor="policy-member"
                        error={errors['policy-member']}
                      >
                        <Input
                          id="policy-member"
                          maxLength={100}
                          value={draft.memberId}
                          onChange={set('memberId')}
                        />
                      </Field>
                    </div>
                    {active.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setAddingPolicy(false);
                          clearError('policy-choice');
                        }}
                        className="cursor-pointer self-start text-[13px] font-medium text-primary hover:text-primary-hover"
                      >
                        Use an existing policy instead
                      </button>
                    )}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setAddingPolicy(true);
                      clearError('policy-choice');
                    }}
                    className="cursor-pointer self-start text-[13px] font-medium text-primary hover:text-primary-hover"
                  >
                    Add a different policy
                  </button>
                )}
              </fieldset>
            )}

            <Field
              label="Requested amount in rupees (optional)"
              htmlFor="case-amount"
              helper="What the clinic expects to claim. It can be left blank for now."
              error={errors['case-amount']}
            >
              <Input
                id="case-amount"
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                className="tabular text-right"
                value={amount}
                {...invalidProps(errors['case-amount'])}
                onChange={(e) => setAmount(e.target.value)}
              />
            </Field>

            {canInvoice && (
              <Field
                label="Invoice to settle against (optional)"
                htmlFor="case-invoice"
                helper="Settlement is recorded as a payment on this invoice. It can only be linked now."
              >
                <Select
                  id="case-invoice"
                  value={invoiceId}
                  onChange={(e) => setInvoiceId(e.target.value)}
                  disabled={invoices.loading}
                >
                  <option value="">No invoice yet</option>
                  {openInvoices.map((i) => (
                    <option key={i.id} value={i.id}>
                      {invoiceLabel(i.number)}, total {formatMoney(i.totalMinor)}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
          </>
        )}

        {error && (
          <p role="alert" className="rounded-control bg-danger-bg px-3 py-2 text-sm text-danger-fg">
            {error}
          </p>
        )}
        <button type="submit" className="sr-only" tabIndex={-1}>
          Create case
        </button>
      </form>
    </Dialog>
  );
}
