import { apiEnvSchema } from '@serenemed/config';

/**
 * Production must refuse to boot with anything that only exists for local
 * development: placeholder secrets, dev DB credentials, and the demo
 * clinics the seed scripts create (they ship well-known passwords).
 */
describe('production boot guards', () => {
  const realProduction = {
    NODE_ENV: 'production',
    JWT_SECRET: 'a-long-random-secret-that-is-definitely-not-the-placeholder-0123456789',
    DATABASE_URL: 'postgresql://app_prod:s3cret@db.internal:5432/serenemed?sslmode=require',
    DIRECT_DATABASE_URL:
      'postgresql://owner_prod:s3cret@db.internal:5432/serenemed?sslmode=require',
    REDIS_URL: 'rediss://cache.internal:6379',
    INTEGRATION_ENCRYPTION_KEY: 'a-real-long-random-integration-key-0123456789abcdef',
  };

  const issuePaths = (env: Record<string, string>) => {
    const result = apiEnvSchema.safeParse(env);
    return result.success ? [] : result.error.issues.map((i) => i.path.join('.'));
  };

  it.each(['seed-org', 'demo-clinic'])(
    'rejects the dev clinic "%s" as the production default',
    (id) => {
      expect(issuePaths({ ...realProduction, DEFAULT_ORGANIZATION_ID: id })).toContain(
        'DEFAULT_ORGANIZATION_ID',
      );
    },
  );

  it('accepts a real clinic id, or none, in production', () => {
    expect(
      issuePaths({ ...realProduction, DEFAULT_ORGANIZATION_ID: 'clinic-kochi-001' }),
    ).not.toContain('DEFAULT_ORGANIZATION_ID');
    expect(issuePaths(realProduction)).not.toContain('DEFAULT_ORGANIZATION_ID');
  });

  it('allows the dev clinic outside production', () => {
    expect(
      issuePaths({
        ...realProduction,
        NODE_ENV: 'development',
        DEFAULT_ORGANIZATION_ID: 'demo-clinic',
      }),
    ).not.toContain('DEFAULT_ORGANIZATION_ID');
  });

  it('refuses production without a real integration encryption key', () => {
    const withoutKey: Record<string, string> = { ...realProduction };
    delete withoutKey.INTEGRATION_ENCRYPTION_KEY;
    expect(issuePaths(withoutKey)).toContain('INTEGRATION_ENCRYPTION_KEY');
    expect(
      issuePaths({
        ...realProduction,
        INTEGRATION_ENCRYPTION_KEY: 'replace-with-another-long-random-string-for-integrations',
      }),
    ).toContain('INTEGRATION_ENCRYPTION_KEY');
    expect(issuePaths(realProduction)).not.toContain('INTEGRATION_ENCRYPTION_KEY');
  });
});
