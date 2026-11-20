import { describe, test } from '@e2e-dev/web';
import { expect } from 'e2e';
import { IAM_ADMIN_EMAIL, IAM_CONTEXT, IAM_SKIP, testAddress } from './support.ts';

/**
 * Sign-in page.
 * Brief: SIT-IAM-01 · BEH-IAM-01 · EX-IAM-01.1
 *
 * Email-code sign-in khud `auth.setup.e2e.ts` me hota hai (OTP Mailosaur se). Require SSO wale tests
 * (SIT-IAM-06, BEH-IAM-03) yahan nahi: shared tenant pe SSO required karne se sabka email sign-in band
 * ho jaata hai, agle run ka OTP login bhi.
 */
const SIGN_IN_CONTEXT = `${IAM_CONTEXT} Sign in with the email-code path ("Email me a sign-in code"); never use the "Continue with …" SSO buttons.`;

describe('IAM sign-in', { skip: IAM_SKIP, tags: ['iam', 'sign-in'], agentContext: SIGN_IN_CONTEXT }, () => {
  test('a known and an unknown email see the same code screen', { tags: ['BEH-IAM-01', 'EX-IAM-01.1', 'P0'] }, async ({ app, agent, screen }) => {
    const requestCode = async (email: string) => {
      await screen.getByRole('textbox', 'Work email').fill(email);
      await screen.getByRole('button', 'Email me a sign-in code').tap();
      await expect(screen.getByRole('heading', 'Check your email')).toBeVisible({ timeout: 45_000 });
    };
    await app.open('/login');
    await requestCode(IAM_ADMIN_EMAIL);
    await screen.getByRole('button', 'Use a different email').tap();

    await requestCode(testAddress('nobody'));

    await agent.assert('the code screen only asks for a 6-digit code sent to the address; nothing on it says whether this address has an account');
  });

  test('an invalid email is refused before any code is sent', { tags: ['SIT-IAM-01', 'P2'] }, async ({ app, agent }) => {
    await app.open('/login');

    await agent.act('replace the work email with {email} and ask for a sign-in code', { params: { email: 'not-an-email' } });

    await agent.assert('the page is still the sign-in page asking for a work email; it did not move on to the "Check your email" code screen');
  });
});
