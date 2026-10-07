import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/**
 * AES-256-GCM for integration secrets at rest. The key is derived from
 * INTEGRATION_ENCRYPTION_KEY (any string of 32+ characters; production
 * boot refuses a missing or placeholder value). Output is
 * `v1.<iv>.<tag>.<ciphertext>` in base64url, so the format can be
 * versioned if the key ever needs rotating. GCM authenticates the data:
 * a tampered or wrong-key value fails to decrypt instead of returning
 * garbage.
 */
const DEV_FALLBACK_KEY = 'dev-only-integration-encryption-key-not-for-production';

function keyFrom(secret: string | undefined): Buffer {
  return createHash('sha256')
    .update(secret && secret.length > 0 ? secret : DEV_FALLBACK_KEY)
    .digest();
}

export function encryptSecrets(
  secrets: Record<string, string>,
  secret: string | undefined,
): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyFrom(secret), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(secrets), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', iv, tag, body]
    .map((part) => (typeof part === 'string' ? part : part.toString('base64url')))
    .join('.');
}

export function decryptSecrets(
  payload: string,
  secret: string | undefined,
): Record<string, string> {
  const [version, iv, tag, body] = payload.split('.');
  if (version !== 'v1' || !iv || !tag || !body) {
    throw new Error('Unrecognised secret format.');
  }
  const decipher = createDecipheriv('aes-256-gcm', keyFrom(secret), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  const plain = Buffer.concat([decipher.update(Buffer.from(body, 'base64url')), decipher.final()]);
  return JSON.parse(plain.toString('utf8')) as Record<string, string>;
}

/**
 * What the UI may show about a saved secret: the last four characters,
 * but only when the secret is long enough that four characters reveal
 * little. Short secrets show nothing but that one is set.
 */
export function secretHint(value: string): string | null {
  return value.length >= 12 ? `••••${value.slice(-4)}` : null;
}
