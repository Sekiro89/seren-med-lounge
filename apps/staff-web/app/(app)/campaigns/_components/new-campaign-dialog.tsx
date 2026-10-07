'use client';

import { useState, type FormEvent } from 'react';
import { createCampaignSchema } from '@serenemed/validation';
import { Button } from '../../../../components/ui/button';
import { Dialog } from '../../../../components/ui/dialog';
import { Field, Input, Select, Textarea } from '../../../../components/ui/fields';
import { apiClient } from '../../../../lib/api-client';
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

  const isCamp = type === 'HEALTH_CAMP';

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const rupees = budget.trim() === '' ? undefined : Number(budget);
    if (rupees !== undefined && (!Number.isFinite(rupees) || rupees < 0)) {
      return setError('Enter the budget as a number of rupees, or leave it empty.');
    }
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
      const issue = parsed.error.issues[0];
      if (issue?.path[0] === 'name') return setError('Give the campaign a name.');
      if (isCamp && (!location.trim() || !startsAt)) {
        return setError('A health camp needs a location and a start date.');
      }
      if (endsAt && startsAt && endsAt < startsAt) {
        return setError('The end date cannot be before the start date.');
      }
      return setError(issue?.message ?? 'Check the form.');
    }
    setBusy(true);
    setError(undefined);
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
      <form id="new-campaign-form" onSubmit={submit} className="flex flex-col gap-5">
        <Field label="Name" htmlFor="camp-name">
          <Input
            id="camp-name"
            value={name}
            maxLength={200}
            autoComplete="off"
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field label="Type" htmlFor="camp-type">
          <Select id="camp-type" value={type} onChange={(e) => setType(e.target.value)}>
            {CAMPAIGN_TYPES.map((t) => (
              <option key={t} value={t}>
                {TYPE_LABELS[t]}
              </option>
            ))}
          </Select>
        </Field>
        {isCamp && (
          <Field label="Location" htmlFor="camp-location" helper="Where the camp will be held.">
            <Input
              id="camp-location"
              value={location}
              maxLength={300}
              onChange={(e) => setLocation(e.target.value)}
            />
          </Field>
        )}
        <div className="grid grid-cols-2 gap-4">
          <Field label={isCamp ? 'Start date' : 'Start date (optional)'} htmlFor="camp-start">
            <Input
              id="camp-start"
              type="date"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
            />
          </Field>
          <Field label="End date (optional)" htmlFor="camp-end">
            <Input
              id="camp-end"
              type="date"
              value={endsAt}
              min={startsAt || undefined}
              onChange={(e) => setEndsAt(e.target.value)}
            />
          </Field>
        </div>
        {!isCamp && (
          <Field
            label="Channel (optional)"
            htmlFor="camp-channel"
            helper="For example Instagram, newspaper or WhatsApp."
          >
            <Input
              id="camp-channel"
              value={channel}
              maxLength={100}
              onChange={(e) => setChannel(e.target.value)}
            />
          </Field>
        )}
        <Field label="Budget in rupees (optional)" htmlFor="camp-budget">
          <Input
            id="camp-budget"
            inputMode="decimal"
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
          />
        </Field>
        <Field label="Notes (optional)" htmlFor="camp-notes">
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
