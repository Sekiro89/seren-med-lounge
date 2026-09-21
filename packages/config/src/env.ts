import { z } from 'zod';

// The exact placeholder from .env.example and the exact local-dev
// credentials from infrastructure/docker/postgres-init/01-app-role.sql
// / docker-compose.yml. All three are real, working values in their own
// context (a fresh dev checkout should just work) — the danger is only
// when NODE_ENV=production and one of them is still in place, meaning
// nobody actually set a real secret/credential for this deployment.
const PLACEHOLDER_JWT_SECRET = 'replace-with-a-long-random-string';
const DEV_APP_DB_CREDENTIAL = 'serenemed_app:serenemed_app';
const DEV_SUPERUSER_DB_CREDENTIAL = 'serenemed:serenemed';

/**
 * Server-side environment schema (API only — never import this from a
 * browser bundle). Frontend apps read only NEXT_PUBLIC_* vars directly
 * via Next.js's own env handling.
 */
export const apiEnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    DATABASE_URL: z.string().url(),
    // Privileged connection used only by `prisma migrate` (see prisma
    // schema's `directUrl`) — optional here because it's not read via
    // ConfigService anywhere; Prisma resolves it from process.env
    // directly. Listed so the schema stays an accurate description of
    // every env var this app actually uses.
    DIRECT_DATABASE_URL: z.string().url().optional(),
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
    // Optional-until-configured, same shape as the integration keys above
    // — unset means Sentry.init() never runs (see main.ts) and error
    // tracking is a no-op, not a crash.
    SENTRY_DSN: z.string().optional(),
    API_PORT: z.coerce.number().default(4000),
    // Comma-separated allowed origins for CORS — see main.ts. Defaults to
    // the two local frontend dev ports if unset.
    CORS_ORIGINS: z.string().default('http://localhost:3000,http://localhost:3001'),
  })
  /**
   * A schema that only checks JWT_SECRET.min(16) would happily accept
   * .env.example's literal placeholder text — it's 34 characters long,
   * so "longer than 16" is true, and the app would boot fine in
   * production with a secret every attacker already knows because it's
   * sitting in this repo's git history. Same idea for the two
   * hardcoded local-dev database credentials: real, working values for
   * local dev, but a real incident if still in place in production.
   * Only checked when NODE_ENV=production — local dev and CI are
   * expected to use exactly these values.
   */
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') {
      return;
    }

    if (env.JWT_SECRET === PLACEHOLDER_JWT_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['JWT_SECRET'],
        message:
          'JWT_SECRET is still the placeholder value from .env.example. Generate a real one ' +
          '(see docs/architecture/deployment.md#secrets) before deploying to production.',
      });
    }

    if (env.DATABASE_URL.includes(DEV_APP_DB_CREDENTIAL)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['DATABASE_URL'],
        message:
          `DATABASE_URL is still using the local-dev "${DEV_APP_DB_CREDENTIAL}" credential ` +
          '(infrastructure/docker/postgres-init/01-app-role.sql). Production needs its own ' +
          'database with its own credentials — see docs/architecture/deployment.md#production-postgres.',
      });
    }

    if (env.DIRECT_DATABASE_URL?.includes(DEV_SUPERUSER_DB_CREDENTIAL)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['DIRECT_DATABASE_URL'],
        message:
          `DIRECT_DATABASE_URL is still using the local-dev "${DEV_SUPERUSER_DB_CREDENTIAL}" ` +
          'superuser credential. Production needs its own — see ' +
          'docs/architecture/deployment.md#production-postgres.',
      });
    }
  });

export type ApiEnv = z.infer<typeof apiEnvSchema>;

export function parseApiEnv(env: NodeJS.ProcessEnv = process.env): ApiEnv {
  return apiEnvSchema.parse(env);
}
