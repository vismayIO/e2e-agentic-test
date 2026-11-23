import { expect } from 'e2e';
import { ADMIN_SESSION } from '../app/auth.ts';
import { describe, test } from './fixtures.ts';
import { IAM_CONTEXT } from './iam.ts';

/**
 * IAM ka smoke (docs/testing.md → "Smoke"): build zinda hai? Har IAM page left navigation se khulta hai aur
 * asli data dikhata hai. Halke `admin` session pe — IAM ka setup (user pool) yahan nahi chalta — aur sirf
 * dekhna: koi test kuch banata, badalta ya hatata nahi.
 *
 * Har test ek doosre IAM page se shuru hota hai, agent navigation se page kholta hai, code asli rows ka
 * intezaar karta hai (page objects ke locators), phir agent batata hai ki list kya dikha rahi hai.
 */
const LIST_TIMEOUT = 30_000; // list server se aati hai; `openPage` bhi itna hi rukta hai
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
