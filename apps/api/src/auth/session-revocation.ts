/**
 * Ending a person's open sessions at once (role change, switched off).
 * The API's tokens are stateless and carry the role, so without this a
 * demoted or deactivated user would keep their old access until the token
 * expired. Instead, the moment of the change is stored in Redis; any token
 * issued at or before that moment is refused by JwtAuthGuard. The entry
 * outlives the longest possible token, then Redis drops it.
 */
export const USER_SESSION_REVOCATION_TTL_SECONDS = 60 * 60;

export function userSessionRevocationKey(userId: string): string {
  return `auth:revoked-user-sessions:${userId}`;
}
