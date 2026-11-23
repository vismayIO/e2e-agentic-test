import { expect } from 'e2e';
import { LOGIN_SKIP } from '../app/auth.ts';
import { describe, test } from './fixtures.ts';
import { IAM_CONTEXT, IAM_SESSION, poolUser } from './iam.ts';

/**
 * Sessions: admin kisi ke saare sessions khatam kare, ek session, apne sessions.
 * Brief: SIT-IAM-14 · BEH-IAM-05 · Points to note ("Ending a single session asks for confirmation")
 *
 * Pool users ka ek session setup me unke pehle sign-in se bana hai. Admin ke apne sessions kabhi khatam
 * nahi karte: woh saved admin session hi khatam kar dega (aur admin ke drawer me current session ka
 * "Revoke session" enabled hai — kabhi mat dabana).
 */
const SESSIONS_CONTEXT = `${IAM_CONTEXT} Never revoke or terminate a session of the signed-in admin (Test User / My sessions); only act on the person named in the goal.`;

describe('IAM sessions', { skip: LOGIN_SKIP, session: IAM_SESSION, tags: ['iam', 'sessions', 'BEH-IAM-05', 'P1'], agentContext: SESSIONS_CONTEXT }, () => {
  // Deployed app (20 + 23 Nov 2026): "Revoke session" bina confirmation ke turant revoke karta hai.
  // retries 0: yeh ek fixed pool user ka state ek taraf badalta hai (disable / delete / sessions); retry ko badla hua user milta aur uska error asli wajah chhupa deta.
  test('ending a single session asks for confirmation', { tags: ['bug', 'SIT-IAM-14'], retries: 0 }, async ({ agent, screen, users }) => {
    const user = poolUser('shared'); // shared ke baaki tests sirf dialog dekhte hain, session pe depend nahi
    await users.open();
    await users.search(user.email);
    const drawer = await users.openProfile(user.email);
    await drawer.tab('Sessions');
    const session = drawer.sessions.first();
    await expect(session, 'setup ke sign-in ka session dikhna chahiye').toBeVisible();

    await agent.act('choose "Revoke session" in the actions of the first session listed, and stop at whatever happens next; do not confirm anything');

    await agent.assert('a confirmation asks before the session is ended, and the session is still listed');
    const confirmation = screen.getByRole('dialog').filter({ has: screen.getByTestId('confirm-submit') });
    await expect(confirmation, 'a confirmation should open before the session ends').toBeVisible({ timeout: 5_000 });
    await confirmation.getByTestId('confirm-cancel').tap();
    await expect(drawer.sessions).not.toHaveCount(0);
  });

  // retries 0: yeh ek fixed pool user ka state ek taraf badalta hai (disable / delete / sessions); retry ko badla hua user milta aur uska error asli wajah chhupa deta.
  test('an admin ends every session of a person', { tags: ['SIT-IAM-14'], retries: 0 }, async ({ agent, users }) => {
    const user = poolUser('sessions');
    await users.open();
    await users.search(user.email);
    const drawer = await users.openProfile(user.email);
    await drawer.tab('Sessions');
    await expect(drawer.sessions.first(), 'setup ke sign-in ka session dikhna chahiye').toBeVisible();

    await agent.act('terminate all sessions of this person and confirm');

    await agent.assert('the person has no active sessions any more, and a confirmation says their sessions were terminated');
    await expect(drawer.sessions).toHaveCount(0);
    await expect(drawer.root.getByTestId('panel-sessions').getByTestId('state-empty')).toContainText('No active sessions');
  });

  test('my sessions lists the current session', { tags: ['SIT-IAM-14'] }, async ({ agent, screen, users, mySessions }) => {
    await users.open();

    await agent.act('open My sessions from the left navigation');

    await agent.assert('My sessions lists every device the admin is signed in on, and marks the session in use now as Current');

    await expect(mySessions.current).toHaveCount(1);
    await mySessions.current.getByTestId('row-actions-trigger').tap();
    // Apna current session yahan se khatam nahi hota (sign out se hota hai).
    await expect(screen.getByTestId('row-actions-menu').getByTestId('row-actions-menu-terminate')).toBeDisabled();
    await screen.getByTestId('row-actions-menu').press('Escape');
  });
});
