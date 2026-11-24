import { expect, unique } from 'e2e';
import { describe, test } from './fixtures.ts';
import { IAM_CONTEXT, IAM_SESSION, iamNames, poolUser } from './iam.ts';

const data = iamNames();

/**
 * Sign-in page, signed out.
 * Brief: SIT-IAM-01 · BEH-IAM-01 · EX-IAM-01.1
 *
 * The email-code sign-in itself happens in setup (app/auth.ts, OTP from Mailosaur). The "known email" is a
 * pool user, not the admin: asking for a new code for the admin could void the code of a setup sign-in in
 * progress. So this describe is on the IAM session (it runs after setup) and each test clears state first.
 * The Require SSO tests (SIT-IAM-06, BEH-IAM-03) are not here: requiring SSO on the shared tenant turns off
 * email sign-in for everyone, the next run's OTP login included.
 */
describe('IAM sign-in', { session: IAM_SESSION, agentContext: IAM_CONTEXT }, () => {
  test('a known and an unknown email see the same code screen', { tags: ['sanity', 'BEH-IAM-01', 'EX-IAM-01.1', 'P0'] }, async ({ app, agent, screen }) => {
    const codeScreen = screen.getByRole('heading', 'Check your email');
    const requestCode = (email: string) => agent.act('ask for a sign-in code for the work email {email} and stop on the screen that follows', { params: { email: unique(email) } });
    await app.clearState();
    await app.open('/login');
    await requestCode(poolUser('shared').email);
    await expect(codeScreen).toBeVisible({ timeout: 45_000 });
    await agent.assert('the screen asks for a 6-digit code sent to the address');
    await screen.getByRole('button', 'Use a different email').tap();

    await requestCode(data.address('nobody')); // an address that has no account

    await expect(codeScreen).toBeVisible({ timeout: 45_000 });
    await expect(screen.getByRole('textbox', 'OTP digit 1 of 6')).toBeVisible();
    await agent.assert('the screen asks for a 6-digit code sent to the address; nothing on it says that this address has no account, is unknown or cannot sign in');
  });

  test('an invalid email is refused before any code is sent', { tags: ['SIT-IAM-01', 'P2'] }, async ({ app, agent, screen }) => {
    await app.clearState();
    await app.open('/login');

    // The correct result is a refusal, so the goal is not "ask for a code": type, press the button once, stop at what shows.
    await agent.act('type {email} in the work email field, press "Email me a sign-in code" once and stop at whatever the page shows next', { params: { email: 'not-an-email' } });

    await expect(screen.getByRole('textbox', 'Work email')).toBeVisible();
    await expect(screen.getByRole('textbox', 'OTP digit 1 of 6')).toHaveCount(0);
    await agent.assert('the sign-in page still shows the work email field and tells the person the email is not valid');
  });
});
