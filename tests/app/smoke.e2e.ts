import { describe, test } from '@e2e-dev/web';
import { expect } from 'e2e';
import { ADMIN_SESSION } from './auth.ts';
import { openPage, pageLoaded } from './ui.ts';

/**
 * The console's own smoke (docs/testing.md → "Smoke"): is the build alive? Looking only — it creates and changes nothing.
 * Each module checks its essential pages in its own `smoke.e2e.ts`; here is what every module needs first:
 * the sign-in page comes up, and the signed-in console opens and its navigation works.
 */
describe('console smoke', { tags: ['smoke', 'P0'] }, () => {
  // No session: the test starts in a new browser context, that is, signed out.
  test('signed out, the sign-in page offers an email sign-in code', async ({ app, agent, screen }) => {
    await app.open('/login');

    await expect(screen.getByRole('textbox', 'Work email')).toBeVisible({ timeout: 30_000 });
    await expect(screen.getByRole('button', 'Email me a sign-in code')).toBeVisible();
    await agent.assert('this is a sign-in page: it asks for a work email and offers to email a sign-in code, and it shows no error message');
  });

  test('signed in, the left navigation opens a page', { session: ADMIN_SESSION }, async ({ app, agent, browser, screen }) => {
    await openPage({ app, browser, screen }, '/'); // a clear failure right here if the sign-in page comes up

    await agent.act('open "Roles" from the left navigation and stop as soon as the Roles page is shown');

    // The URL is /roles, so the app did not go back to sign-in; wait for the data, then the agent checks the screen once.
    await expect(browser).toHaveURL(/\/roles$/);
    await expect(screen.getByRole('heading', 'Roles', { visible: true })).toBeVisible({ timeout: 30_000 });
    await pageLoaded(screen);
    await agent.assert('the page titled "Roles" shows a list of roles, and shows no error message and no blank or still-loading area');
  });
});
