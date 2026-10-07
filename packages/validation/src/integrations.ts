import { z } from 'zod';

/**
 * The outside services an administrator can connect, and the exact fields
 * each one needs. One catalogue shared by the API (what it accepts) and
 * the staff screen (what form to draw), so they can't disagree.
 *
 * `secret: true` fields are encrypted at rest, never sent back to the
 * browser (only a masked hint), and never written to the audit log.
 * Provider names are deliberately free text where no provider has been
 * chosen yet (payment gateway, AI, messaging): the clinic decides later
 * and nothing here talks to any of them. See docs/architecture/integrations.md.
 */
export type IntegrationFieldKind = 'text' | 'url' | 'select';

export interface IntegrationField {
  key: string;
  label: string;
  kind: IntegrationFieldKind;
  secret: boolean;
  required: boolean;
  helper?: string;
  options?: string[];
}

export interface IntegrationDefinition {
  label: string;
  description: string;
  group: 'Payments' | 'AI' | 'Messaging' | 'Accounting' | 'Storage' | 'Clinical partners' | 'Video';
  fields: IntegrationField[];
}

const providerName = (helper?: string): IntegrationField => ({
  key: 'providerName',
  label: 'Provider',
  kind: 'text',
  secret: false,
  required: true,
  helper: helper ?? 'The service you chose, for example the company name.',
});

export const INTEGRATION_CATALOG = {
  PAYMENT_GATEWAY: {
    label: 'Online payments',
    description:
      'Take card, UPI and wallet payments, including payment before an online consultation.',
    group: 'Payments',
    fields: [
      providerName('The payment gateway company.'),
      {
        key: 'mode',
        label: 'Mode',
        kind: 'select',
        secret: false,
        required: true,
        options: ['Test', 'Live'],
        helper: 'Use Test until the clinic is ready to take real money.',
      },
      { key: 'keyId', label: 'Key ID', kind: 'text', secret: false, required: true },
      { key: 'apiSecret', label: 'API secret', kind: 'text', secret: true, required: true },
      {
        key: 'webhookSecret',
        label: 'Webhook secret',
        kind: 'text',
        secret: true,
        required: false,
      },
    ],
  },
  AI_ASSISTANT: {
    label: 'AI consultation assistant',
    description: 'Speech to text and draft clinical notes. A doctor always reviews and signs.',
    group: 'AI',
    fields: [
      providerName('The AI or speech provider.'),
      { key: 'model', label: 'Model', kind: 'text', secret: false, required: false },
      { key: 'apiKey', label: 'API key', kind: 'text', secret: true, required: true },
    ],
  },
  SMS: {
    label: 'SMS',
    description: 'Text-message reminders and codes.',
    group: 'Messaging',
    fields: [
      providerName(),
      { key: 'senderId', label: 'Sender ID', kind: 'text', secret: false, required: false },
      { key: 'apiKey', label: 'API key', kind: 'text', secret: true, required: true },
    ],
  },
  WHATSAPP: {
    label: 'WhatsApp',
    description: 'WhatsApp Business messages to patients.',
    group: 'Messaging',
    fields: [
      providerName(),
      {
        key: 'phoneNumberId',
        label: 'Phone number ID',
        kind: 'text',
        secret: false,
        required: true,
      },
      { key: 'apiKey', label: 'API key', kind: 'text', secret: true, required: true },
      {
        key: 'webhookSecret',
        label: 'Webhook secret',
        kind: 'text',
        secret: true,
        required: false,
      },
    ],
  },
  EMAIL: {
    label: 'Email',
    description: 'Email to patients and staff.',
    group: 'Messaging',
    fields: [
      providerName(),
      { key: 'fromAddress', label: 'Send from', kind: 'text', secret: false, required: true },
      { key: 'apiKey', label: 'API key', kind: 'text', secret: true, required: true },
    ],
  },
  ACCOUNTING: {
    label: 'Accounting (Zoho)',
    description: 'Send invoices and payments to the accounting system.',
    group: 'Accounting',
    fields: [
      {
        key: 'region',
        label: 'Data centre',
        kind: 'select',
        secret: false,
        required: true,
        options: ['India', 'United States', 'Europe'],
      },
      {
        key: 'zohoOrganizationId',
        label: 'Zoho organization ID',
        kind: 'text',
        secret: false,
        required: true,
      },
      { key: 'clientId', label: 'Client ID', kind: 'text', secret: false, required: true },
      { key: 'clientSecret', label: 'Client secret', kind: 'text', secret: true, required: true },
      { key: 'refreshToken', label: 'Refresh token', kind: 'text', secret: true, required: true },
    ],
  },
  OBJECT_STORAGE: {
    label: 'File storage',
    description: 'Where scanned IDs, consent forms and reports are kept.',
    group: 'Storage',
    fields: [
      { key: 'endpoint', label: 'Endpoint', kind: 'url', secret: false, required: true },
      { key: 'region', label: 'Region', kind: 'text', secret: false, required: false },
      { key: 'bucket', label: 'Bucket', kind: 'text', secret: false, required: true },
      { key: 'accessKey', label: 'Access key', kind: 'text', secret: true, required: true },
      { key: 'secretKey', label: 'Secret key', kind: 'text', secret: true, required: true },
    ],
  },
  LAB_PARTNER: {
    label: 'Laboratory partner',
    description: 'Book tests and pull results from an outside lab.',
    group: 'Clinical partners',
    fields: [
      providerName('The laboratory or lab-software company.'),
      { key: 'baseUrl', label: 'API address', kind: 'url', secret: false, required: true },
      { key: 'apiKey', label: 'API key', kind: 'text', secret: true, required: true },
    ],
  },
  INSURANCE_PARTNER: {
    label: 'Insurance and TPA',
    description: 'Check eligibility and send pre-authorisations and claims.',
    group: 'Clinical partners',
    fields: [
      providerName('The insurer, TPA or claims-platform company.'),
      { key: 'baseUrl', label: 'API address', kind: 'url', secret: false, required: true },
      { key: 'apiKey', label: 'API key', kind: 'text', secret: true, required: true },
    ],
  },
  VIDEO_CONSULTATION: {
    label: 'Video consultation',
    description: 'Video calls for online consultations.',
    group: 'Video',
    fields: [
      providerName(),
      { key: 'apiKey', label: 'API key', kind: 'text', secret: true, required: true },
      { key: 'apiSecret', label: 'API secret', kind: 'text', secret: true, required: false },
    ],
  },
} as const satisfies Record<string, IntegrationDefinition>;

export type IntegrationProvider = keyof typeof INTEGRATION_CATALOG;

export const INTEGRATION_PROVIDERS = Object.keys(INTEGRATION_CATALOG) as IntegrationProvider[];

export function isIntegrationProvider(value: string): value is IntegrationProvider {
  return value in INTEGRATION_CATALOG;
}

/**
 * Save the fields you send; a field you leave out is unchanged. For a
 * secret field, sending an empty string is ignored (so editing a form
 * without retyping a saved key never wipes it); use `clear` to remove one.
 */
export const saveIntegrationSchema = z.object({
  values: z.record(z.string().max(100), z.string().max(4000)).default({}),
  clear: z.array(z.string().max(100)).max(20).optional(),
  enabled: z.boolean().optional(),
});

export type SaveIntegrationInput = z.infer<typeof saveIntegrationSchema>;

/** One provider as the API returns it. Secrets are only ever present as a hint. */
export interface IntegrationView {
  provider: IntegrationProvider;
  enabled: boolean;
  /** Every required field has a value. */
  configured: boolean;
  values: Record<string, string>;
  secrets: Record<string, { set: boolean; hint: string | null }>;
  updatedAt: string | null;
  updatedBy: string | null;
}
