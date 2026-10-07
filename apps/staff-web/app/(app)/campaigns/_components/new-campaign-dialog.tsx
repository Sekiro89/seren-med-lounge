'use client';

import { useState, type FormEvent } from 'react';
import { createCampaignSchema } from '@serenemed/validation';
import { Button } from '../../../../components/ui/button';
import { Dialog } from '../../../../components/ui/dialog';
import { Field, Input, Select, Textarea } from '../../../../components/ui/fields';
import { apiClient } from '../../../../lib/api-client';
import { clinicToday } from '../../../../lib/format';
import {
  focusFirst,
  invalidProps,
  isClean,
  req,
  requiredProps,
  rupeesError,
  type FieldErrors,
  clearOnEdit,
  makeClearError,
} from '../../../../lib/forms';
import { FormError, messageOf } from '../../leads/_components/shared';
import { CAMPAIGN_TYPES, TYPE_LABELS, dateToIso, type CampaignRow } from './shared';

export function NewCampaignDialog(props: {
  open: boolean;
  onClose: () => void;
  onSaved: (campaign: CampaignRow) => void;
}) {
  return props.open ? <NewCampaignForm {...props} /> : null;
}

function NewCampaignForm({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (campaign: CampaignRow) => void;
}) {
  const [name, setName] = useState('');
  const [type, setType] = useState<string>('DIGITAL');
  const [channel, setChannel] = useState('');
  const [location, setLocation] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [budget, setBudget] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [errors, setErrors] = useState<FieldErrors>({});
  const clearError = makeClearError(setErrors, () => setError(undefined));

  const isCamp = type === 'HEALTH_CAMP';

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setError(undefined);
    const next: FieldErrors = {};
    if (!name.trim()) next['camp-name'] = 'Give the campaign a name.';
    else if (name.trim().length > 200) next['camp-name'] = 'Use 200 characters or fewer.';
    if (isCamp && !location.trim()) next['camp-location'] = 'Enter where the camp will be held.';
    else if (location.length > 300) next['camp-location'] = 'Use 300 characters or fewer.';
    if (isCamp && !startsAt) next['camp-start'] = 'Choose the camp start date.';
    else if (startsAt && startsAt < clinicToday()) {
      next['camp-start'] = 'Choose a start date that is not in the past.';
    }
    if (endsAt && startsAt && endsAt < startsAt) {
      next['camp-end'] = 'The end date cannot be before the start date.';
    } else if (endsAt && endsAt < clinicToday()) {
      next['camp-end'] = 'Choose an end date that is not in the past.';
    }
    if (channel.length > 100) next['camp-channel'] = 'Use 100 characters or fewer.';
    const budgetProblem = rupeesError(budget, { optional: true, maxMinor: 10_000_000_000 });
    if (budgetProblem) next['camp-budget'] = budgetProblem;
    if (notes.length > 2000) next['camp-notes'] = 'Use 2000 characters or fewer.';
    setErrors(next);
    if (!isClean(next)) {
      return focusFirst(next, [
        'camp-name',
        'camp-location',
        'camp-start',
        'camp-end',
        'camp-channel',
        'camp-budget',
        'camp-notes',
      ]);
    }
    const rupees = budget.trim() === '' ? undefined : Number(budget);
    const parsed = createCampaignSchema.safeParse({
      name: name.trim(),
      type,
      channel: channel.trim() || undefined,
      location: location.trim() || undefined,
      startsAt: startsAt ? dateToIso(startsAt) : undefined,
      endsAt: endsAt ? dateToIso(endsAt, true) : undefined,
      budgetMinor: rupees === undefined ? undefined : Math.round(rupees * 100),
      notes: notes.trim() || undefined,
    });
    if (!parsed.success) {
      return setError(parsed.error.issues[0]?.message ?? 'Check the form.');
    }
    setBusy(true);
    try {
      const created = await apiClient.post<CampaignRow>('/campaigns', parsed.data);
      onSaved(created);
      onClose();
    } catch (e) {
      setError(messageOf(e, 'The campaign was not saved. Please try again.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="New campaign"
      description="A marketing effort that brings in leads. It starts as planned."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="new-campaign-form" loading={busy}>
            Create campaign
          </Button>
        </>
      }
    >
      <form
        id="new-campaign-form"
        onSubmit={submit}
        noValidate
        onChange={clearOnEdit(clearError, {
          'camp-type': ['camp-location', 'camp-start'],
          'camp-start': ['camp-end'],
          'camp-end': ['camp-start'],
        })}
        className="flex flex-col gap-5"
      >
        <Field label={req('Name')} htmlFor="camp-name" error={errors['camp-name']}>
          <Input
            id="camp-name"
            value={name}
            maxLength={200}
            {...requiredProps}
            {...invalidProps(errors['camp-name'])}
            autoComplete="off"
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field label={req('Type')} htmlFor="camp-type">
          <Select
            id="camp-type"
            value={type}
            {...requiredProps}
            onChange={(e) => setType(e.target.value)}
          >
            {CAMPAIGN_TYPES.map((t) => (
              <option key={t} value={t}>
                {TYPE_LABELS[t]}
              </option>
            ))}
          </Select>
        </Field>
        {isCamp && (
          <Field
            label={req('Location')}
            htmlFor="camp-location"
            helper="Where the camp will be held."
            error={errors['camp-location']}
          >
            <Input
              id="camp-location"
              value={location}
              maxLength={300}
              {...requiredProps}
              {...invalidProps(errors['camp-location'])}
              onChange={(e) => setLocation(e.target.value)}
            />
          </Field>
        )}
        <div className="grid grid-cols-2 gap-4">
          <Field
            label={isCamp ? req('Start date') : 'Start date (optional)'}
            htmlFor="camp-start"
            error={errors['camp-start']}
          >
            <Input
              id="camp-start"
              type="date"
              value={startsAt}
              min={clinicToday()}
              {...(isCamp ? requiredProps : {})}
              {...invalidProps(errors['camp-start'])}
              onChange={(e) => setStartsAt(e.target.value)}
            />
          </Field>
          <Field label="End date (optional)" htmlFor="camp-end" error={errors['camp-end']}>
            <Input
              id="camp-end"
              type="date"
              value={endsAt}
              min={startsAt || clinicToday()}
              {...invalidProps(errors['camp-end'])}
              onChange={(e) => setEndsAt(e.target.value)}
            />
          </Field>
        </div>
        {!isCamp && (
          <Field
            label="Channel (optional)"
            htmlFor="camp-channel"
            helper="For example Instagram, newspaper or WhatsApp."
            error={errors['camp-channel']}
          >
            <Input
              id="camp-channel"
              value={channel}
              maxLength={100}
              onChange={(e) => setChannel(e.target.value)}
            />
          </Field>
        )}
        <Field
          label="Budget in rupees (optional)"
          htmlFor="camp-budget"
          error={errors['camp-budget']}
        >
          <Input
            id="camp-budget"
            inputMode="decimal"
            value={budget}
            {...invalidProps(errors['camp-budget'])}
            onChange={(e) => setBudget(e.target.value)}
          />
        </Field>
        <Field label="Notes (optional)" htmlFor="camp-notes" error={errors['camp-notes']}>
          <Textarea
            id="camp-notes"
            value={notes}
            maxLength={2000}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>
        <FormError message={error} />
      </form>
    </Dialog>
  );
}
