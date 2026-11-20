import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { test } from '@e2e-dev/web';
import { unique } from 'e2e';
import {
  IAM_CONTEXT, IAM_SESSION, IAM_SKIP, POOL, POOL_FILE, RUN_ID, TENANT,
  adminSignIn, backToAdmin, captureAuth, completeWelcome, keepSessionStorage, openAs, pageLoaded, saveAuth, signIn, testAddress,
  type PoolLabel, type PoolUser,
} from './support.ts';

/**
 * IAM suite ka setup, har run me ek baar:
 *   1. admin login: `.auth/iam-admin.json` chal raha ho to wahi (koi OTP nahi), warna ek baar OTP se
 *      sign in karke file likho — har account ka login ek hi baar
 *   2. pichhle runs ka bacha test data saaf (sirf `iam-e2e-` naam/email wala)
 *   3. disposable active users ka pool: invite → har naya user apna ek pehla sign-in (Mailosaur OTP) → naam
 *   4. admin ka pakda hua login wapas (dusra OTP nahi), session save — saare IAM tests yahi reuse karte hain
 *
 * OTP fixed nahi hai: jab login chahiye, naya code Mailosaur inbox se padha jaata hai (lib/mailosaur.ts).
 */
const SWEEP_CONTEXT = `${IAM_CONTEXT} Only ever touch items whose name or email contains "iam-e2e-"; leave everything else exactly as it is.`;

if (!IAM_SKIP) {
  test.setup('sign in as the IAM admin and prepare disposable users', {
    sessions: [IAM_SESSION],
    timeout: 20 * 60_000,
    agentContext: SWEEP_CONTEXT,
  }, async ({ app, browser, screen, session, agent }) => {
    const login = await adminSignIn({ app, browser, screen });
    console.log(`[iam setup] admin login: ${login === 'reused' ? 'saved login chala, OTP nahi' : 'naya OTP login, .auth/iam-admin.json likha'}`);

    // 1. Pichhle runs ka bacha data — pehle saaf, taaki jama na ho. Yeh housekeeping hai: koi step fail
    //    ho to warning log karke aage badho (agla run phir koshish karega); asli tests isse nahi rukte.
    const sweep = async (path: string, goal: string) => {
      await app.open(path);
      await pageLoaded(screen);
      try {
        await agent.act(goal, { params: { prefix: 'iam-e2e-', word: 'delete' } });
      } catch (err) {
        console.warn(`[iam setup] ${path} ka purana test data poora saaf nahi hua: ${(err as Error).message}`);
      }
    };
    // Bulk delete server pe background job hai: dialog thodi der "in progress" rehta hai (buttons disabled).
    await sweep('/users', 'search the users list for {prefix}; if any users are listed, select all of them, click Delete, type {word} and click Delete once, then wait until the deletion has finished and the dialog shows its result or closes; if none are listed, do nothing');
    await sweep('/users', 'open Invitations & imports and cancel every pending invitation whose email contains {prefix}, then close the drawer; if none, do nothing');
    await sweep('/roles', 'delete every role whose name contains {prefix}, without replacement, typing {word} to confirm; if none, do nothing');
    await sweep('/access-profiles', 'delete every access profile whose name contains {prefix}, without replacement, typing {word} if asked; if none, do nothing');
    await sweep('/service-accounts', 'delete every service account whose name contains {prefix}, typing {word} to confirm; if none, do nothing');

    // 2. Pool: sab ek saath invite, phir har invitee ek baar sign in karke Active banta hai.
    const pool = Object.fromEntries(
      POOL.map((label) => [label, { email: testAddress(label), name: `E2E ${label}-${RUN_ID}` }]),
    ) as Record<PoolLabel, PoolUser>;
    await openAs({ app, browser, screen }, TENANT.msp, '/users');
    const admin = await captureAuth(browser);
    // Goal dohraane layak hai: replay pehle hi invite bhej de to dusri baar "already in use" aata hai — theek hai.
    // Har pool user ka sign-in (neeche) hi saabit karta hai ki invite sach me bana.
    await agent.act('make sure every address in {emails} has a pending invitation: open Invite users, choose Invite via email, add the addresses, tick the box allowing outside users and send. If the app says some of them are already invited or in use, that is fine — the goal is only that each address has an invitation', {
      params: { emails: unique(POOL.map((l) => pool[l].email).join(', ')) },
    });

    for (const label of POOL) {
      await app.clearState();
      await signIn({ app, browser, screen }, pool[label].email);
      await completeWelcome({ screen, browser }, 'E2E', `${label}-${RUN_ID}`);
    }
    mkdirSync(dirname(POOL_FILE), { recursive: true });
    writeFileSync(POOL_FILE, JSON.stringify(pool, null, 2));

    // 3. Admin wapas — pakda hua login, naya OTP nahi. Tokens refresh hue hon to file bhi taaza.
    await backToAdmin({ app, browser, screen }, admin);
    saveAuth('iam-admin', await captureAuth(browser));
    await keepSessionStorage(browser);
    await session.save(IAM_SESSION);
  });
}
