'use client';

import { useState, type FormEvent } from 'react';
import { createLeadSchema } from '@serenemed/validation';
import { Button } from '../../../../components/ui/button';
import { Dialog } from '../../../../components/ui/dialog';
import { Field, Input, Select, Textarea } from '../../../../components/ui/fields';
import { apiClient } from '../../../../lib/api-client';
import { humanize } from '../../../../lib/format';
import { PatientPicker, type PatientOption } from './patient-picker';
import {
  FormError,
  LEAD_SOURCES,
  SOURCE_LABELS,
  messageOf,
  type LeadRow,
  type StaffOption,
} from './shared';

export interface CampaignOption {
  id: string;
  name: string;
  type: string;
  status: string;
}

interface CreatedLead extends LeadRow {
  possibleDuplicateLeadIds: string[];
}

export function AddLeadDialog(props: {
  open: boolean;
  onClose: () => void;
  onSaved: (lead: CreatedLead) => void;
  campaigns: CampaignOption[];
  owners: StaffOption[];
  presetCampaignId?: string;
}) {
  // Mounted only while open so the form starts empty every time.
  return props.open ? <AddLeadForm {...props} /> : null;
}

function AddLeadForm({
  open,
  onClose,
  onSaved,
  campaigns,
  owners,
  presetCampaignId,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (lead: CreatedLead) => void;
  campaigns: CampaignOption[];
  owners: StaffOption[];
  presetCampaignId?: string;
}) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [source, setSource] = useState<string>(
    presetCampaignId
      ? campaigns.find((c) => c.id === presetCampaignId)?.type === 'HEALTH_CAMP'
        ? 'CAMP'
        : 'CAMPAIGN'
      : 'WALK_IN',
  );
  const [campaignId, setCampaignId] = useState(presetCampaignId ?? '');
  const [referrer, setReferrer] = useState<PatientOption>();
  const [ownerId, setOwnerId] = useState('');
  const [enquiry, setEnquiry] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const needsCampaign = source === 'CAMPAIGN' || source === 'CAMP';
  // A health camp lead must point at a health camp campaign.
  const campaignChoices = campaigns.filter(
    (c) => c.status !== 'CANCELLED' && (source !== 'CAMP' || c.type === 'HEALTH_CAMP'),
  );

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const parsed = createLeadSchema.safeParse({
      firstName: firstName.trim(),
      lastName: lastName.trim() || undefined,
      phone: phone.trim(),
      email: email.trim() || undefined,
      source,
      campaignId: needsCampaign ? campaignId || undefined : undefined,
      referredByPatientId: source === 'REFERRAL' ? referrer?.id : undefined,
      ownerId: ownerId || undefined,
      enquiry: enquiry.trim() || undefined,
      consentToContact: consent,
    });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const field = issue?.path[0];
      if (field === 'phone') return setError('Enter a phone number with at least 7 digits.');
      if (field === 'email') return setError('Enter a valid email address, or leave it empty.');
      if (field === 'firstName') return setError('Enter the first name.');
      if (needsCampaign && !campaignId)
        return setError('Choose which campaign this lead came from.');
      return setError(issue?.message ?? 'Check the form.');
    }
    setBusy(true);
    setError(undefined);
    try {
      const created = await apiClient.post<CreatedLead>('/leads', parsed.data);
      onSaved(created);
      onClose();
    } catch (e) {
      setError(messageOf(e, 'The lead was not saved. Please try again.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Add lead"
      description="Someone who has enquired but is not yet a patient."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="add-lead-form" loading={busy}>
            Add lead
          </Button>
        </>
      }
    >
      <form id="add-lead-form" onSubmit={submit} className="flex flex-col gap-5">
        <div className="grid grid-cols-2 gap-4">
          <Field label="First name" htmlFor="lead-first">
            <Input
              id="lead-first"
              value={firstName}
              maxLength={100}
              autoComplete="off"
              onChange={(e) => setFirstName(e.target.value)}
            />
          </Field>
          <Field label="Last name (optional)" htmlFor="lead-last">
            <Input
              id="lead-last"
              value={lastName}
              maxLength={100}
              autoComplete="off"
              onChange={(e) => setLastName(e.target.value)}
            />
          </Field>
        </div>
        <Field label="Phone" htmlFor="lead-phone">
          <Input
            id="lead-phone"
            type="tel"
            value={phone}
            maxLength={20}
            autoComplete="off"
            onChange={(e) => setPhone(e.target.value)}
          />
        </Field>
        <Field label="Email (optional)" htmlFor="lead-email">
          <Input
            id="lead-email"
            type="email"
            value={email}
            autoComplete="off"
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label="Where did they hear about us" htmlFor="lead-source">
          <Select
            id="lead-source"
            value={source}
            onChange={(e) => {
              setSource(e.target.value);
              setCampaignId(e.target.value === 'CAMP' ? '' : campaignId);
            }}
          >
            {LEAD_SOURCES.map((s) => (
              <option key={s} value={s}>
                {SOURCE_LABELS[s]}
              </option>
            ))}
          </Select>
        </Field>
        {needsCampaign && (
          <Field
            label={source === 'CAMP' ? 'Health camp' : 'Campaign'}
            htmlFor="lead-campaign"
            helper={
              campaignChoices.length === 0
                ? source === 'CAMP'
                  ? 'There is no health camp yet. Create one under Campaigns first.'
                  : 'There is no campaign yet. Create one under Campaigns first.'
                : undefined
            }
          >
            <Select
              id="lead-campaign"
              value={campaignId}
              onChange={(e) => setCampaignId(e.target.value)}
            >
              <option value="">Choose one</option>
              {campaignChoices.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({humanize(c.type)})
                </option>
              ))}
            </Select>
          </Field>
        )}
        {source === 'REFERRAL' && (
          <Field
            label="Referred by (optional)"
            htmlFor="lead-referrer"
            helper="The existing patient who recommended us."
          >
            <PatientPicker id="lead-referrer" value={referrer} onChange={setReferrer} />
          </Field>
        )}
        {owners.length > 0 && (
          <Field label="Owner (optional)" htmlFor="lead-owner">
            <Select id="lead-owner" value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
              <option value="">Unassigned</option>
              {owners.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.fullName} ({humanize(o.role)})
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="What they asked about (optional)" htmlFor="lead-enquiry">
          <Textarea
            id="lead-enquiry"
            value={enquiry}
            maxLength={2000}
            onChange={(e) => setEnquiry(e.target.value)}
          />
        </Field>
        <div className="rounded-control bg-surface-muted px-4 py-4">
          <label htmlFor="lead-consent" className="flex cursor-pointer items-start gap-3">
            <input
              id="lead-consent"
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-0.5 size-5 shrink-0 cursor-pointer accent-primary"
            />
            <span className="text-sm text-fg">
              This person agreed to be contacted by the clinic
              <span className="mt-1 block text-[13px] text-fg-muted">
                Tick this only if they said yes, in person, by phone or in writing. Without it you
                can add notes and meetings, but calls, messages and emails are not allowed.
              </span>
            </span>
          </label>
        </div>
        <FormError message={error} />
      </form>
    </Dialog>
  );
}
