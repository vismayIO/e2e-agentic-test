import { expect } from 'e2e';
import { knownBug } from '../../lib/suites.ts';
import { describe, test } from './fixtures.ts';
import { IAM_CONTEXT, IAM_SESSION, poolUser } from './iam.ts';

/**
 * Sessions: an admin ends all of someone's sessions, a single session, one's own sessions.
 * Brief: SIT-IAM-14 · BEH-IAM-05 · Points to note ("Ending a single session asks for confirmation")
 *
 * Each pool user has one session, from their first sign-in during setup. The admin's own sessions are never
 * ended: that would end the saved admin session itself (and in the admin's drawer "Revoke session" on the
 * current session is enabled — never press it).
 */
describe('IAM sessions', { session: IAM_SESSION, tags: ['BEH-IAM-05', 'P1'], agentContext: IAM_CONTEXT }, () => {
  test('ending a single session asks for confirmation', knownBug('23 Nov 2026: "Revoke session" revokes at once, without a confirmation', 'SIT-IAM-14'), async ({ agent, screen, users }) => {
    const user = poolUser('shared'); // the other tests on shared only look at dialogs and do not depend on the session
    await users.open();
    await users.search(user.email);
    const drawer = await users.openProfile(user.email);
    await drawer.openSessions();
    const session = drawer.sessions.first();
    await expect(session, 'the session from the setup sign-in should be listed').toBeVisible();

    await agent.act('choose "Revoke session" in the actions of the first session listed, and stop at whatever happens next; do not confirm anything');

    const confirmation = screen.getByRole('dialog').filter({ has: screen.getByTestId('confirm-submit') });
    await expect(confirmation, 'a confirmation should open before the session ends').toBeVisible({ timeout: 5_000 });
    await agent.assert('a confirmation dialog asks before the session is ended');
    await confirmation.getByTestId('confirm-cancel').tap();
    await expect(drawer.sessions).not.toHaveCount(0);
  });

  // retries 0: this changes a fixed pool user's state one way (disable / delete / sessions); a retry would get the changed user and its error would hide the real cause.
  test('an admin ends every session of a person', { tags: ['sanity', 'SIT-IAM-14'], retries: 0 }, async ({ agent, users }) => {
    const user = poolUser('sessions');
    await users.open();
    await users.search(user.email);
    const drawer = await users.openProfile(user.email);
    await drawer.openSessions();
    await expect(drawer.sessions.first(), 'the session from the setup sign-in should be listed').toBeVisible();

    await agent.act('terminate all sessions of this person and confirm');

    await expect(drawer.sessions).toHaveCount(0);
    await expect(drawer.root.getByTestId('panel-sessions').getByTestId('state-empty')).toContainText('No active sessions');
    await agent.assert('the Sessions tab of this person lists no session and says there are no active sessions');
  });

  test('my sessions lists the current session', { tags: ['SIT-IAM-14'] }, async ({ agent, screen, users, mySessions }) => {
    await users.open();

    await agent.act('open My sessions from the left navigation and stop when that page is shown');

    await expect(mySessions.current).toHaveCount(1, { timeout: 30_000 });
    await agent.assert('the My sessions page lists at least one session and marks one session as Current');
    await mySessions.current.getByTestId('row-actions-trigger').tap();
    // One's own current session cannot be ended from here (signing out does that).
    await expect(screen.getByTestId('row-actions-menu').getByTestId('row-actions-menu-terminate')).toBeDisabled();
    await screen.getByTestId('row-actions-menu').press('Escape');
  });
});
