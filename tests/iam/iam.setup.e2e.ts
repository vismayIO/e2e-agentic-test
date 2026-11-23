import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { adminSignIn, completeWelcome, rememberAdmin, signIn } from '../app/auth.ts';
import { sweep } from '../app/cleanup.ts';
import { test } from './fixtures.ts';
import { IAM_PREFIX, IAM_SESSION, POOL, POOL_FILE, iamNames, type PoolLabel, type PoolUser } from './iam.ts';

/**
 * IAM ka setup, har run me ek baar, bina model call ke:
 *   1. admin login (app/auth.ts): saved login chale to wahi, warna ek OTP
 *   2. khatam ho chuke runs ka `iam-e2e-` data ek-ek karke saaf — 3 ghante se naya data kisi chal rahe run ka
 *      ho sakta hai, use sweep nahi chhedta (app/cleanup.ts). Ek-ek karke, kyunki bulk delete ka background job
 *      deployed backend pe chalta hi nahi (23 Nov 2026). Order: service accounts (owner users se pehle), access
 *      profiles (holders aur role references ke saath), roles, users.
 *   3. disposable users ka pool: ek invite → har ek ka pehla sign-in (Mailosaur OTP) → naam
 *   4. apna ek access profile 'sa-owner' aur 'shared' ko: service-account owner picker sirf direct access
 *      profile wale members dikhata hai (admin bhi nahi, 23 Nov 2026)
 *   5. session save — saare IAM tests yahi reuse karte hain
 *
 * Naam is file ke scope me bante hain: retry pe file dobara import hoti hai, to retry naya pool banata hai.
 * Pichhle attempt ka adhoora pool tab hatta hai jab woh 3 ghante se purana ho chuka ho — usse pehle ka setup
 * use chal rahe run ka data maan ke chhod deta hai.
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
  console.log(`[iam setup] admin login: ${(await adminSignIn(fx)) === 'reused' ? 'saved login chala, OTP nahi' : 'naya OTP login'}`);

  await sweep('service accounts', serviceAccounts, () => serviceAccounts.open(), IAM_PREFIX, (key) => serviceAccounts.delete(key));
  await sweep('access profiles', profiles, () => profiles.open(), IAM_PREFIX, (key) => profiles.delete(key));
  await sweep('roles', roles, () => roles.open(), IAM_PREFIX, (key) => roles.delete(key));
  await sweep('users', users, () => users.open(), IAM_PREFIX, async (email) => {
    if ((await users.row(email).getAttribute('data-status')) === 'invited') await users.cancelInvite(email);
    else await users.delete(email);
  });

  await users.open();
  await invite.invite(POOL.map((l) => pool[l].email));
  await rememberAdmin(fx); // abhi ke tokens file me — pool sign-ins ke baad admin isi se wapas
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
