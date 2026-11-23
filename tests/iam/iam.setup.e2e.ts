import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { LOGIN_SKIP, adminSignIn, completeWelcome, keepSessionStorage, rememberAdmin, signIn } from '../app/auth.ts';
import { waitForEmail } from '../../lib/mailosaur.ts';
import { sweep } from '../app/cleanup.ts';
import { test } from './fixtures.ts';
import { IAM_PREFIX, IAM_SESSION, POOL, POOL_FILE, iamNames, type PoolLabel, type PoolUser } from './iam.ts';

/**
 * IAM ka setup, har run me ek baar, bina model call ke:
 *   1. admin login (app/auth.ts): saved login chale to wahi, warna ek OTP
 *   2. pichhle runs ka `iam-e2e-` data ek-ek karke saaf (bulk delete ka background job deployed backend pe
 *      chalta hi nahi, 23 Nov 2026). Order: service accounts (owner users se pehle), access profiles (holders
 *      aur role references ke saath), roles, users.
 *   3. disposable users ka pool: ek invite → har ek ka pehla sign-in (Mailosaur OTP) → naam
 *   4. apna ek access profile 'sa-owner' aur 'shared' ko: service-account owner picker sirf direct access
 *      profile wale members dikhata hai (admin bhi nahi, 23 Nov 2026)
 *   5. session save — saare IAM tests yahi reuse karte hain
 *
 * Naam is file ke scope me bante hain: retry pe file dobara import hoti hai, to retry naya pool banata hai
 * aur pichhle attempt ka adhoora pool agle run ke cleanup me purane data ki tarah hat jaata hai.
 */
const { id, address, name } = iamNames();
const pool = Object.fromEntries(
  POOL.map((label) => [label, { email: address(label), name: `E2E ${label}-${id}` }]),
) as Record<PoolLabel, PoolUser>;

if (!LOGIN_SKIP) {
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
    const invitedAt = new Date();
    await invite.invite(POOL.map((l) => pool[l].email));
    // Har invitation inbox me aane tak ruko: invite sach me gaya, aur backend ke mail bhejte hue code maangne
    // pe "Request timed out." aata tha (23 Nov 2026, pehle pool user pe teen baar).
    await Promise.all(POOL.map((l) => waitForEmail(pool[l].email, invitedAt)));
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
    await keepSessionStorage(fx);
    await session.save(IAM_SESSION);
  });
}
