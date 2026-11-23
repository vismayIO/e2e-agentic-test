import { expect, unique } from 'e2e';
import { LOGIN_SKIP } from '../app/auth.ts';
import { describe, test } from './fixtures.ts';
import { IAM_CONTEXT, IAM_SESSION, iamNames, poolUser } from './iam.ts';

const data = iamNames();

/**
 * Sign-in page, signed out.
 * Brief: SIT-IAM-01 · BEH-IAM-01 · EX-IAM-01.1
 *
 * Email-code sign-in khud setup me hota hai (app/auth.ts, OTP Mailosaur se). "Known email" ek pool user hai,
 * admin nahi: admin ke liye naya code maangna setup ke chal rahe sign-in ka code bekaar kar sakta. Isliye yeh
 * describe IAM session pe hai (setup ke baad chale) aur har test pehle state saaf karta hai. Require SSO wale tests
 * (SIT-IAM-06, BEH-IAM-03) yahan nahi: shared tenant pe SSO required karne se sabka email sign-in band
 * ho jaata hai, agle run ka OTP login bhi.
 */
describe('IAM sign-in', { skip: LOGIN_SKIP, session: IAM_SESSION, tags: ['iam', 'sign-in'], agentContext: IAM_CONTEXT }, () => {
  test('a known and an unknown email see the same code screen', { tags: ['BEH-IAM-01', 'EX-IAM-01.1', 'P0'] }, async ({ app, agent, screen }) => {
    const codeScreen = screen.getByRole('heading', 'Check your email');
    const requestCode = (email: string) => agent.act('ask for a sign-in code for the work email {email} and stop on the screen that follows', { params: { email: unique(email) } });
    await app.clearState();
    await app.open('/login');
    await requestCode(poolUser('shared').email);
    await expect(codeScreen).toBeVisible({ timeout: 45_000 });
    await agent.assert('the screen asks for a 6-digit code sent to the address');
    await screen.getByRole('button', 'Use a different email').tap();

    await requestCode(data.address('nobody')); // aisa address jiska koi account nahi

    await expect(codeScreen).toBeVisible({ timeout: 45_000 });
    await expect(screen.getByRole('textbox', 'OTP digit 1 of 6')).toBeVisible();
    await agent.assert('the screen is the same 6-digit code screen as for the known address; nothing on it says that this address has no account, is unknown or cannot sign in');
  });

  test('an invalid email is refused before any code is sent', { tags: ['SIT-IAM-01', 'P2'] }, async ({ app, agent, screen }) => {
    await app.clearState();
    await app.open('/login');

    await agent.act('type {email} as the work email and ask for a sign-in code', { params: { email: 'not-an-email' } });

    await expect(screen.getByRole('textbox', 'Work email')).toBeVisible();
    await expect(screen.getByRole('textbox', 'OTP digit 1 of 6')).toHaveCount(0);
    await agent.assert('the sign-in page tells the person the work email is not valid, and it did not move on to the "Check your email" code screen');
  });
});
