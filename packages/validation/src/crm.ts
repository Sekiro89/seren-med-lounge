import { z } from 'zod';

/**
 * Marketing funnel & CRM: campaigns (incl. health camps) and leads with
 * their nurture activity log. See apps/api/src/leads and
 * apps/api/src/campaigns.
 */

const isoDateTime = z.string().datetime({ offset: true });

export const createCampaignSchema = z
  .object({
    name: z.string().min(1).max(200),
    type: z.enum(['DIGITAL', 'HEALTH_CAMP', 'EVENT', 'REFERRAL_PROGRAM', 'OTHER']),
    channel: z.string().max(100).optional(),
    startsAt: isoDateTime.optional(),
    endsAt: isoDateTime.optional(),
    location: z.string().min(1).max(300).optional(),
    budgetMinor: z.number().int().nonnegative().max(10_000_000_000).optional(),
    notes: z.string().max(2000).optional(),
  })
  .refine((v) => v.type !== 'HEALTH_CAMP' || (v.location && v.startsAt), {
    message: 'A HEALTH_CAMP needs a location and startsAt.',
  })
  .refine((v) => !v.startsAt || !v.endsAt || Date.parse(v.endsAt) >= Date.parse(v.startsAt), {
    message: 'endsAt cannot be before startsAt.',
  });

export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;

export const campaignStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'COMPLETED', 'CANCELLED']),
});

export type CampaignStatusInput = z.infer<typeof campaignStatusSchema>;

export const createLeadSchema = z
  .object({
    firstName: z.string().min(1).max(100),
    lastName: z.string().min(1).max(100).optional(),
    phone: z.string().min(7).max(20),
    email: z.string().email().optional(),
    source: z.enum(['WEBSITE', 'SOCIAL_MEDIA', 'CAMPAIGN', 'REFERRAL', 'CAMP', 'WALK_IN']),
    campaignId: z.string().min(1).optional(),
    referredByPatientId: z.string().min(1).optional(),
    ownerId: z.string().min(1).optional(),
    enquiry: z.string().max(2000).optional(),
    consentToContact: z.boolean(),
  })
  .refine((v) => !['CAMPAIGN', 'CAMP'].includes(v.source) || Boolean(v.campaignId), {
    message: 'campaignId is required for source CAMPAIGN or CAMP.',
  })
  .refine((v) => v.source === 'REFERRAL' || !v.referredByPatientId, {
    message: 'referredByPatientId is only valid for source REFERRAL.',
  });

export type CreateLeadInput = z.infer<typeof createLeadSchema>;

/** STATUS_CHANGE is written by the server only, never posted. */
export const leadActivitySchema = z.object({
  type: z.enum(['CALL', 'MESSAGE', 'EMAIL', 'MEETING', 'NOTE', 'EDUCATION_SENT']),
  notes: z.string().max(2000).optional(),
  nextFollowUpAt: isoDateTime.optional(),
});

export type LeadActivityInput = z.infer<typeof leadActivitySchema>;

/** CONVERTED is reachable only through POST /leads/:id/convert. */
export const leadStatusSchema = z
  .object({
    status: z.enum(['NURTURING', 'APPOINTMENT_BOOKED', 'LOST']),
    lostReason: z.string().min(1).max(500).optional(),
  })
  .refine((v) => v.status !== 'LOST' || Boolean(v.lostReason?.trim()), {
    message: 'lostReason is required when marking a lead LOST.',
  });

export type LeadStatusInput = z.infer<typeof leadStatusSchema>;

/**
 * Either link an existing patient (`patientId`) or register one from the
 * lead's details plus the date of birth (any field given here overrides
 * the lead's own value).
 */
export const convertLeadSchema = z.union([
  z.object({ patientId: z.string().min(1) }).strict(),
  z
    .object({
      dateOfBirth: z.string().date(),
      firstName: z.string().min(1).max(100).optional(),
      lastName: z.string().min(1).max(100).optional(),
      phone: z.string().min(7).max(20).optional(),
      email: z.string().email().optional(),
    })
    .strict(),
]);

export type ConvertLeadInput = z.infer<typeof convertLeadSchema>;
