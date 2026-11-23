import { readFileSync } from 'node:fs';
import { env } from '../../lib/env.ts';
import { freshNames } from '../../lib/names.ts';

/**
 * IAM module: brief docs/iam/acceptance-brief.md. Login, UI kit, naming aur cleanup sab modules ke saath
 * share hote hain (tests/app/); yahan sirf IAM ki cheezein.
 */

/** IAM setup ka session (admin + pool), `iam.setup.e2e.ts` banata hai. */
export const IAM_SESSION = 'iam';

/** IAM ke saare test data ka prefix; IAM setup khatam ho chuke runs ka is prefix wala data saaf karta hai. */
export const IAM_PREFIX = 'iam-e2e';
/** Har test (ya setup) file ke module scope me: `const { name, address } = iamNames();` */
export const iamNames = () => freshNames(IAM_PREFIX);

/**
 * Tenant ka ek directory-managed (SCIM / LDAP) person — "Manual pe le jaane ki warning" ke liye; suite directory
 * user khud nahi bana sakta. Test sirf warning dekh ke Cancel karta hai. Na ho to woh test skip.
 */
export const IAM_SCIM_USER_EMAIL = env('IAM_SCIM_USER_EMAIL') ?? '';

/**
 * Tenant ki ek maujooda team aur uska ek sadasya — "team ka profile sadasya pe read-only dikhe" ke liye
 * (team suite khud nahi banata). Na ho to woh test skip.
 */
export const IAM_TEAM = env('IAM_TEAM') && env('IAM_TEAM_MEMBER_EMAIL')
  ? { name: env('IAM_TEAM')!, member: env('IAM_TEAM_MEMBER_EMAIL')! }
  : undefined;

/**
 * Disposable active users — setup har run me banata hai (invite → Mailosaur OTP se pehla sign-in → naam),
 * taaki disable / delete / sessions wale tests asli logon ko na chhuein. Har label ek hi test ka hai.
 */
export const POOL = [
  'shared', // dialog dekhne wale tests + profile holder; service-account owner (reassign ka target)
  'disabled', // ek ke baad ek: disable → "kisne kiya" → enable
  'disabled-sessions', // disable → koi session nahi
  'sessions', // admin is person ke saare sessions khatam karta hai
  'delete', // ek ke baad ek: delete → wahi email dobara invite
  'bulk-a', 'bulk-b', // bulk delete ko do log chahiye (ek hi search prefix)
  'sa-owner', // service-account owner (owner guard, service-account tests) + profile holder
] as const;
export type PoolLabel = (typeof POOL)[number];
export interface PoolUser { email: string; name: string }
export const POOL_FILE = '.e2e/iam-pool.json';

/** Setup ka banaya disposable user (test ke andar padho, file import pe nahi — tab tak setup chala na ho). */
export function poolUser(label: PoolLabel): PoolUser {
  const pool = JSON.parse(readFileSync(POOL_FILE, 'utf8')) as Record<PoolLabel, PoolUser>;
  if (!pool[label]) throw new Error(`${POOL_FILE} me "${label}" nahi — IAM setup chala?`);
  return pool[label];
}

/**
 * Har IAM describe pe `agentContext` — sirf IAM ki vocabulary. Poore console ki baatein (navigation, lists,
 * dialogs, loading) e2e.config.ts ke agent `context` me hain.
 */
export const IAM_CONTEXT = [
  'The identity and access pages are under "People & Access" in the navigation: Users, Service accounts, Teams, Roles and Access profiles.',
  'A disabled person shows status "Inactive". The source of truth of a person is Manual, SCIM or LDAP.',
].join(' ');
