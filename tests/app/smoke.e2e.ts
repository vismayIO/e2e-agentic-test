import { describe, test } from '@e2e-dev/web';
import { expect } from 'e2e';
import { ADMIN_SESSION } from './auth.ts';
import { openPage, pageLoaded } from './ui.ts';

/**
 * Console ka apna smoke (docs/testing.md → "Smoke"): build zinda hai? Sirf dekhna — kuch banata ya badalta nahi.
 * Har module apne zaroori pages apne `smoke.e2e.ts` me jaanchta hai; yahan woh jo sab modules se pehle chahiye:
 * sign-in page aata hai, aur signed-in console khulta hai aur uska navigation chalta hai.
 */
describe('console smoke', { tags: ['smoke', 'P0'] }, () => {
  // Session nahi: test naye browser context me, yaani signed out, shuru hota hai.
  test('signed out, the sign-in page offers an email sign-in code', async ({ app, agent, screen }) => {
    await app.open('/login');

    await expect(screen.getByRole('textbox', 'Work email')).toBeVisible({ timeout: 30_000 });
    await expect(screen.getByRole('button', 'Email me a sign-in code')).toBeVisible();
    await agent.assert('this is a sign-in page: it asks for a work email and offers to email a sign-in code, and it shows no error message');
  });

  test('signed in, the left navigation opens a page', { session: ADMIN_SESSION }, async ({ app, agent, browser, screen }) => {
    await openPage({ app, browser, screen }, '/'); // sign-in page aaye to yahin saaf failure

    await agent.act('open "Roles" from the left navigation and stop as soon as the Roles page is shown');

    // URL /roles hai, yaani app sign-in pe wapas nahi gaya; data aane tak ruko, phir agent screen ko ek baar jaanche.
    await expect(browser).toHaveURL(/\/roles$/);
    await expect(screen.getByRole('heading', 'Roles', { visible: true })).toBeVisible({ timeout: 30_000 });
    await pageLoaded(screen);
    await agent.assert('the page titled "Roles" shows a list of roles, and shows no error message and no blank or still-loading area');
  });
});
