import { readFileSync } from 'node:fs';
import { env } from '../../lib/env.ts';
import { freshNames } from '../../lib/names.ts';

/**
 * IAM module: brief docs/iam/acceptance-brief.md. Login, UI kit, naming and cleanup are shared with every
 * module (tests/app/); only IAM's own things are here.
 */

/** The IAM setup's session (admin + pool), made by `iam.setup.e2e.ts`. */
export const IAM_SESSION = 'iam';

/** The prefix of all IAM test data; the IAM setup removes finished runs' data that has this prefix. */
export const IAM_PREFIX = 'iam-e2e';
/** In the module scope of every test (or setup) file: `const { name, address } = iamNames();` */
export const iamNames = () => freshNames(IAM_PREFIX);

/**
 * A directory-managed (SCIM / LDAP) person of the tenant — for the "moving to Manual" warning; the suite cannot
 * create a directory user itself. The test only looks at the warning and cancels. If not set, that test is skipped.
 */
export const IAM_SCIM_USER_EMAIL = env('IAM_SCIM_USER_EMAIL') ?? '';

/**
 * An existing team of the tenant and one of its members — for "a team's profile shows read-only on a member"
 * (the suite does not create teams itself). If not set, that test is skipped.
 */
export const IAM_TEAM = env('IAM_TEAM') && env('IAM_TEAM_MEMBER_EMAIL')
  ? { name: env('IAM_TEAM')!, member: env('IAM_TEAM_MEMBER_EMAIL')! }
  : undefined;

/**
 * Disposable active users — the setup makes them in every run (invite → first sign-in by Mailosaur OTP → name),
 * so that the disable / delete / sessions tests never touch real people. Each label belongs to one test only.
 */
export const POOL = [
  'shared', // tests that only look at a dialog + profile holder; service-account owner (the reassign target)
  'disabled', // one after another: disable → "who did it" → enable
  'disabled-sessions', // disable → no sessions
  'sessions', // the admin ends all of this person's sessions
  'delete', // one after another: delete → the same email invited again
  'bulk-a', 'bulk-b', // bulk delete needs two people (one search prefix)
  'sa-owner', // service-account owner (owner guard, service-account tests) + profile holder
] as const;
export type PoolLabel = (typeof POOL)[number];
export interface PoolUser { email: string; name: string }
export const POOL_FILE = '.e2e/iam-pool.json';

/** A disposable user made by the setup (read it inside a test, not at file import — the setup may not have run yet). */
export function poolUser(label: PoolLabel): PoolUser {
  const pool = JSON.parse(readFileSync(POOL_FILE, 'utf8')) as Record<PoolLabel, PoolUser>;
  if (!pool[label]) throw new Error(`"${label}" is not in ${POOL_FILE} — did the IAM setup run?`);
  return pool[label];
}

/**
 * `agentContext` on every IAM describe — IAM's vocabulary only. What holds for the whole console (navigation,
 * lists, dialogs, loading) is in the agent `context` in e2e.config.ts.
 */
export const IAM_CONTEXT = [
  'The identity and access pages are under "People & Access" in the navigation: Users, Service accounts, Teams, Roles and Access profiles.',
  'A disabled person shows status "Inactive". The source of truth of a person is Manual, SCIM or LDAP.',
].join(' ');
