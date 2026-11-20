import { describe, test } from '@e2e-dev/web';
import { hasLogin } from '../lib/env.ts';

/**
 * Generic smoke checks — kisi bhi web app pe bina badlaav ke chalte hain.
 * Apne app ke critical flows `tests/flows/` me likho (example wahan hai).
 */
describe('smoke', { tags: ['smoke'] }, () => {
  test('home page loads real content', async ({ app, agent }) => {
    await app.open('/');

    await agent.assert(
      'the page shows real content: not blank, not an error page, not a 404/500, and not stuck on a loading spinner',
    );
  });

  test('main navigation opens a working page', async ({ app, agent }) => {
    await app.open('/');

    await agent.act('use the main navigation or header menu to open a different page of the site');

    await agent.assert('the newly opened page shows real content and no error message or 404');
  });
});

if (hasLogin()) {
  describe('signed in', { session: 'qa', tags: ['smoke', 'auth'] }, () => {
    test('signed-in user sees their account', async ({ app, agent }) => {
      await app.open('/');

      await agent.assert('the user is signed in and their own account area or dashboard is reachable');
    });
  });
}
