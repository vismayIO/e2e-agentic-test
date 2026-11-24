import { expect } from 'e2e';
import { ADMIN_SESSION } from '../app/auth.ts';
import { describe, test } from './fixtures.ts';
import { IAM_CONTEXT } from './iam.ts';

/**
 * IAM's smoke (docs/testing.md → "Smoke"): is the build alive? Every IAM page opens from the left navigation
 * and shows real data. On the light `admin` session — the IAM setup (user pool) does not run here — and
 * read-only: no test creates, changes or removes anything.
 *
 * Each test starts on another IAM page, the agent opens the page from the navigation, code waits for real
 * rows (the page objects' locators), then the agent says what the list is showing.
 */
const LIST_TIMEOUT = 30_000; // the list comes from the server; `openPage` waits this long too
const goTo = (page: string) => `open "${page}" from the left navigation and stop when that page is shown; do not click anything else`;

describe('IAM smoke', { session: ADMIN_SESSION, tags: ['smoke', 'P0'], agentContext: IAM_CONTEXT }, () => {
  test('Users lists people', async ({ agent, roles, users }) => {
    await roles.open();

    await agent.act(goTo('Users'));

    await expect(users.rows).not.toHaveCount(0, { timeout: LIST_TIMEOUT });
    await agent.assert('the Users page lists people in a table, each row with a name, an email and a status, and shows no error');
  });

  test('Roles lists roles', async ({ agent, users, roles }) => {
    await users.open();

    await agent.act(goTo('Roles'));

    await expect(roles.rows).not.toHaveCount(0, { timeout: LIST_TIMEOUT });
    await agent.assert('the Roles page lists roles in a table, each row with a name, a type of Built-in or Custom and a permission count, and shows no error');
  });

  test('Access profiles lists profiles', async ({ agent, users, profiles }) => {
    await users.open();

    await agent.act(goTo('Access profiles'));

    await expect(profiles.rows).not.toHaveCount(0, { timeout: LIST_TIMEOUT });
    await agent.assert('the Access profiles page lists access profiles in a table, each row with a name and a status, and shows no error');
  });

  test('Service accounts lists accounts', async ({ agent, users, serviceAccounts }) => {
    await users.open();

    await agent.act(goTo('Service accounts'));

    await expect(serviceAccounts.rows).not.toHaveCount(0, { timeout: LIST_TIMEOUT });
    await agent.assert('the Service accounts page lists service accounts in a table, each row with a name and a status of Active or Inactive, and shows no error');
  });

  test('My sessions lists the current session', async ({ agent, users, mySessions }) => {
    await users.open();

    await agent.act(goTo('My sessions'));

    await expect(mySessions.current).toHaveCount(1, { timeout: LIST_TIMEOUT });
    await agent.assert('the My sessions page lists at least one session and marks one session as Current');
  });
});
