import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { adminSignIn, completeWelcome, rememberAdmin, signIn } from '../app/auth.ts';
import { sweep } from '../app/cleanup.ts';
import { test } from './fixtures.ts';
import { IAM_PREFIX, IAM_SESSION, POOL, POOL_FILE, iamNames, type PoolLabel, type PoolUser } from './iam.ts';

/**
 * IAM setup, once per run, with no model call:
 *   1. admin login (app/auth.ts): the saved login if it works, otherwise one OTP
 *   2. remove the `iam-e2e-` data of finished runs one by one — data younger than 3 hours may belong to a run
 *      in progress, so sweep leaves it alone (app/cleanup.ts). One by one, because the bulk delete background
 *      job does not run at all on the deployed backend (23 Nov 2026). Order: service accounts (before their
 *      owner users), access profiles (with their holders and role references), roles, users.
 *   3. the pool of disposable users: one invite → each one's first sign-in (Mailosaur OTP) → name
 *   4. an access profile of its own for 'sa-owner' and 'shared': the service-account owner picker lists only
 *      members with a direct access profile (not even the admin, 23 Nov 2026)
 *   5. session save — every IAM test reuses it
 *
 * Names are made in this file's scope: a retry imports the file again, so a retry makes a new pool.
 * The half-made pool of the previous attempt is removed once it is older than 3 hours — a setup that runs
 * before then treats it as the data of a run in progress and leaves it.
 */
const { id, address, name } = iamNames();
const pool = Object.fromEntries(
  POOL.map((label) => [label, { email: address(label), name: `E2E ${label}-${id}` }]),
) as Record<PoolLabel, PoolUser>;

test.setup('sign in as the admin and prepare IAM test users', {
  sessions: [IAM_SESSION],
  timeout: 30 * 60_000,
}, async ({ app, browser, screen, session, users, invite, roles, profiles, serviceAccounts }) => {
  const fx = { app, browser, screen };
  console.log(`[iam setup] admin login: ${(await adminSignIn(fx)) === 'reused' ? 'saved login reused, no OTP' : 'new OTP login'}`);

  await sweep('service accounts', serviceAccounts, () => serviceAccounts.open(), IAM_PREFIX, (key) => serviceAccounts.delete(key));
  await sweep('access profiles', profiles, () => profiles.open(), IAM_PREFIX, (key) => profiles.delete(key));
  await sweep('roles', roles, () => roles.open(), IAM_PREFIX, (key) => roles.delete(key));
  await sweep('users', users, () => users.open(), IAM_PREFIX, async (email) => {
    if ((await users.row(email).getAttribute('data-status')) === 'invited') await users.cancelInvite(email);
    else await users.delete(email);
  });

  await users.open();
  await invite.invite(POOL.map((l) => pool[l].email));
  await rememberAdmin(fx); // the current tokens into the file — after the pool sign-ins the admin comes back from it
  for (const label of POOL) {
    await app.clearState();
    await signIn(fx, pool[label].email);
    await completeWelcome(fx, 'E2E', `${label}-${id}`); // = pool[label].name
  }
  mkdirSync(dirname(POOL_FILE), { recursive: true });
  writeFileSync(POOL_FILE, JSON.stringify(pool, null, 2));
  await adminSignIn(fx);

  await profiles.open();
  const owners = await profiles.create(name('sa-owners'));
  for (const label of ['sa-owner', 'shared'] as const) await owners.addHolder('people', pool[label].email, 'permanent', pool[label].name);

  await rememberAdmin(fx);
  await session.save(IAM_SESSION);
});
