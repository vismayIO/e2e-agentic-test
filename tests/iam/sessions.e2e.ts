import { describe, test } from '@e2e-dev/web';
import { unique } from 'e2e';
import { IAM_CONTEXT, IAM_SESSION, IAM_SKIP, TENANT, openAs, poolUser } from './support.ts';

/**
 * Sessions: admin kisi ke saare sessions khatam kare, ek session, disabled person, apne sessions.
 * Brief: SIT-IAM-14 · BEH-IAM-05, 12 · Points to note ("Ending a single session asks for confirmation")
 *
 * Disposable users (poolUser) ka ek session setup me unke pehle sign-in se bana hai. Admin ke apne
 * "Terminate all" wala test nahi: woh saved admin session hi khatam kar dega aur baaki tests gir jaayenge.
 */
describe('IAM sessions', { skip: IAM_SKIP, session: IAM_SESSION, tags: ['iam', 'sessions', 'BEH-IAM-05', 'P1'], agentContext: IAM_CONTEXT }, () => {
  // Deployed app (20 Nov 2026): "Revoke session" bina confirmation ke turant revoke karta hai.
  test('ending a single session asks for confirmation', { tags: ['bug', 'SIT-IAM-14'] }, async ({ app, browser, screen, agent }) => {
    const user = poolUser('shared'); // shared ka bhi ek session hai; baaki shared tests sirf dialog dekhte hain
    await openAs({ app, browser, screen }, TENANT.msp, '/users');
    await agent.act("search the users list for {email}, open that person's profile and go to the Sessions tab", { params: { email: unique(user.email) } });
    await agent.waitFor('at least one active session is listed');

    await agent.act('choose "Revoke session" in the actions of the first session, and do nothing else');

    await agent.assert('a confirmation asks before the session is ended, and the session is still listed');
  });

  test('an admin ends every session of a person', { tags: ['SIT-IAM-14'] }, async ({ app, browser, screen, agent }) => {
    const user = poolUser('sessions');
    await openAs({ app, browser, screen }, TENANT.msp, '/users');
    await agent.act("search the users list for {email}, open that person's profile and go to the Sessions tab", { params: { email: unique(user.email) } });
    await agent.waitFor('at least one active session is listed');

    await agent.act('terminate all sessions of this person and confirm');

    await agent.assert('the person has no active sessions');
  });

  test('my sessions lists the current session', { tags: ['SIT-IAM-14'] }, async ({ app, browser, screen, agent }) => {
    await openAs({ app, browser, screen }, TENANT.msp, '/users');

    await agent.act('open My sessions from the left navigation');

    await agent.assert('the My sessions page lists at least one active session and marks the one in use now as current');
  });
});
