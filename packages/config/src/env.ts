import { z } from 'zod';

/**
 * Server-side environment schema (API only — never import this from a
 * browser bundle). Frontend apps read only NEXT_PUBLIC_* vars directly
 * via Next.js's own env handling.
 */
export const apiEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  JWT_SECRET: z.string().min(16),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('7d'),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),
  PAYMENT_API_KEY: z.string().optional(),
  PAYMENT_WEBHOOK_SECRET: z.string().optional(),
  WHATSAPP_API_KEY: z.string().optional(),
  MESSAGING_API_KEY: z.string().optional(),
  AI_API_KEY: z.string().optional(),
  ZOHO_CLIENT_ID: z.string().optional(),
  ZOHO_CLIENT_SECRET: z.string().optional(),
  ZOHO_REFRESH_TOKEN: z.string().optional(),
  LAB_API_URL: z.string().optional(),
  INSURANCE_API_URL: z.string().optional(),
  API_PORT: z.coerce.number().default(4000),
});

export type ApiEnv = z.infer<typeof apiEnvSchema>;

export function parseApiEnv(env: NodeJS.ProcessEnv = process.env): ApiEnv {
  return apiEnvSchema.parse(env);
}
