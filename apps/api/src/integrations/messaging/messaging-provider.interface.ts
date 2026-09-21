export const MESSAGING_PROVIDER = Symbol('MESSAGING_PROVIDER');

export type MessageChannel = 'EMAIL' | 'SMS' | 'WHATSAPP';

export interface SendMessageInput {
  channel: MessageChannel;
  to: string;
  templateId: string;
  variables: Record<string, string>;
}

/**
 * Port for outbound patient/staff messaging. Real channel behavior (email
 * provider, SMS gateway, WhatsApp Business API) lives behind this — the
 * `notifications` domain module depends only on this interface. See
 * docs/integrations/messaging.md.
 */
export interface MessagingProvider {
  send(input: SendMessageInput): Promise<{ messageId: string }>;
}
