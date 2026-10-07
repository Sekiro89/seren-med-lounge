import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  INTEGRATION_CATALOG,
  INTEGRATION_PROVIDERS,
  type IntegrationProvider,
  type IntegrationView,
  type SaveIntegrationInput,
} from '@serenemed/validation';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { decryptSecrets, encryptSecrets, secretHint } from './secret-box';

type Row = {
  provider: string;
  enabled: boolean;
  config: unknown;
  secretsEncrypted: string | null;
  secretHints: unknown;
  updatedAt: Date;
  updatedBy: { fullName: string } | null;
};

/**
 * Keeps the API keys and connection details for outside services.
 *
 * - Secrets are encrypted at rest (secret-box.ts) and NEVER returned by
 *   any HTTP route: the list shows only whether each is set plus a masked
 *   hint. `getDecrypted` is for server-side provider adapters (the
 *   integrations/* ports) once a provider is contracted; no route exposes it.
 * - Audit entries record which fields changed, never their values.
 * - Nothing here contacts a provider. A saved connection is "configured",
 *   not "verified", until a real adapter can test it.
 */
@Injectable()
export class IntegrationSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly config: ConfigService,
  ) {}

  private get encryptionKey(): string | undefined {
    return this.config.get<string>('INTEGRATION_ENCRYPTION_KEY');
  }

  async list(organizationId: string): Promise<IntegrationView[]> {
    const rows = await this.prisma.withTenant(organizationId, (tx) =>
      tx.integrationSetting.findMany({ include: { updatedBy: { select: { fullName: true } } } }),
    );
    const byProvider = new Map(rows.map((row) => [row.provider, row as Row]));
    return INTEGRATION_PROVIDERS.map((provider) => this.toView(provider, byProvider.get(provider)));
  }

  async save(
    organizationId: string,
    actorId: string,
    provider: IntegrationProvider,
    input: SaveIntegrationInput,
  ) {
    const fields = INTEGRATION_CATALOG[provider].fields as ReadonlyArray<{
      key: string;
      secret: boolean;
      required: boolean;
      kind: string;
      options?: readonly string[];
    }>;
    const known = new Map(fields.map((f) => [f.key, f]));

    for (const key of [...Object.keys(input.values), ...(input.clear ?? [])]) {
      if (!known.has(key)) {
        throw new BadRequestException(`Unknown field "${key}" for this integration.`);
      }
    }
    for (const [key, value] of Object.entries(input.values)) {
      const field = known.get(key)!;
      if (field.kind === 'select' && value !== '' && !field.options?.includes(value)) {
        throw new BadRequestException(`"${key}" must be one of: ${field.options?.join(', ')}.`);
      }
      if (field.kind === 'url' && value !== '' && !/^https?:\/\/\S+$/i.test(value)) {
        throw new BadRequestException(
          `"${key}" must be a web address starting with http:// or https://.`,
        );
      }
    }

    return this.prisma.withTenant(organizationId, async (tx) => {
      const existing = await tx.integrationSetting.findUnique({
        where: { organizationId_provider: { organizationId, provider } },
      });

      const config: Record<string, string> = {
        ...((existing?.config as Record<string, string>) ?? {}),
      };
      const secrets: Record<string, string> = existing?.secretsEncrypted
        ? decryptSecrets(existing.secretsEncrypted, this.encryptionKey)
        : {};
      const changed: string[] = [];

      for (const [key, value] of Object.entries(input.values)) {
        if (known.get(key)!.secret) {
          if (value !== '') {
            secrets[key] = value;
            changed.push(key);
          }
        } else if (config[key] !== value) {
          if (value === '') delete config[key];
          else config[key] = value;
          changed.push(key);
        }
      }
      for (const key of input.clear ?? []) {
        if (known.get(key)!.secret ? delete secrets[key] : delete config[key]) changed.push(key);
      }

      const configured = fields
        .filter((f) => f.required)
        .every((f) => (f.secret ? Boolean(secrets[f.key]) : Boolean(config[f.key])));
      const enabled = input.enabled ?? existing?.enabled ?? false;
      if (enabled && !configured) {
        throw new ConflictException(
          'Fill in every required field before turning this integration on.',
        );
      }

      const hints: Record<string, string> = {};
      for (const [key, value] of Object.entries(secrets)) {
        const hint = secretHint(value);
        if (hint) hints[key] = hint;
      }
      const data = {
        enabled,
        config,
        secretsEncrypted: Object.keys(secrets).length
          ? encryptSecrets(secrets, this.encryptionKey)
          : null,
        secretHints: hints,
        updatedById: actorId,
      };

      await tx.integrationSetting.upsert({
        where: { organizationId_provider: { organizationId, provider } },
        create: { organizationId, provider, ...data },
        update: data,
      });

      await this.auditService.record(tx, organizationId, {
        actorType: 'USER',
        actorId,
        action: 'integration.update',
        entityType: 'IntegrationSetting',
        entityId: provider,
        // Field names only. Never a value, never a hint.
        metadata: { provider, changedFields: changed, enabled },
      });

      const saved = await tx.integrationSetting.findUniqueOrThrow({
        where: { organizationId_provider: { organizationId, provider } },
        include: { updatedBy: { select: { fullName: true } } },
      });
      return this.toView(provider, saved as Row);
    });
  }

  /** Forgets the connection entirely: values, secrets and the on switch. */
  async remove(organizationId: string, actorId: string, provider: IntegrationProvider) {
    return this.prisma.withTenant(organizationId, async (tx) => {
      const { count } = await tx.integrationSetting.deleteMany({
        where: { organizationId, provider },
      });
      await this.auditService.record(tx, organizationId, {
        actorType: 'USER',
        actorId,
        action: 'integration.remove',
        entityType: 'IntegrationSetting',
        entityId: provider,
        metadata: { provider, hadSettings: count > 0 },
      });
      return this.toView(provider, undefined);
    });
  }

  /**
   * SERVER-SIDE ONLY. For provider adapters that need the real keys. Not
   * reachable from any controller; do not add a route for it.
   */
  async getDecrypted(organizationId: string, provider: IntegrationProvider) {
    const row = await this.prisma.withTenant(organizationId, (tx) =>
      tx.integrationSetting.findUnique({
        where: { organizationId_provider: { organizationId, provider } },
      }),
    );
    if (!row || !row.enabled) return null;
    return {
      ...((row.config as Record<string, string>) ?? {}),
      ...(row.secretsEncrypted ? decryptSecrets(row.secretsEncrypted, this.encryptionKey) : {}),
    };
  }

  private toView(provider: IntegrationProvider, row: Row | undefined): IntegrationView {
    const fields = INTEGRATION_CATALOG[provider].fields as ReadonlyArray<{
      key: string;
      secret: boolean;
      required: boolean;
    }>;
    const config = (row?.config as Record<string, string>) ?? {};
    const hints = (row?.secretHints as Record<string, string>) ?? {};
    const hasSecrets = row?.secretsEncrypted
      ? Object.keys(decryptSecrets(row.secretsEncrypted, this.encryptionKey))
      : [];

    const secrets: IntegrationView['secrets'] = {};
    for (const field of fields.filter((f) => f.secret)) {
      secrets[field.key] = { set: hasSecrets.includes(field.key), hint: hints[field.key] ?? null };
    }
    const configured = fields
      .filter((f) => f.required)
      .every((f) => (f.secret ? secrets[f.key]?.set : Boolean(config[f.key])));

    return {
      provider,
      enabled: row?.enabled ?? false,
      configured,
      values: config,
      secrets,
      updatedAt: row ? row.updatedAt.toISOString() : null,
      updatedBy: row?.updatedBy?.fullName ?? null,
    };
  }
}
