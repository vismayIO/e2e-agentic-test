import { describe, test } from '@e2e-dev/web';
import { unique } from 'e2e';
import { IAM_CONTEXT, IAM_SESSION, IAM_SKIP, RUN_ID, TENANT, openAs, type Fx } from './support.ts';

/**
 * Service accounts (MSP view, tenant "motadata"): credentials, owner, switch off/on, delete.
 * Brief: SIT-IAM-09, SIT-IAM-16 · BEH-IAM-12, 14, 23
 *
 * Har test apna service account `iam-e2e-<run>-…` banata hai (role End User; admin-tier role pe extra confirm aata hai); bacha data agle
 * run ka setup saaf karta hai. Owner guard (BEH-IAM-14: owner disable nahi ho sakta) yahan nahi — uske liye ek
 * disposable active user chahiye jise disable kiya ja sake (phase 2).
 */
const SA_CONTEXT = `${IAM_CONTEXT} A service account drawer lists its credentials; "Add credential" creates an OAuth client or an API key.`;

describe('IAM service accounts', { skip: IAM_SKIP, session: IAM_SESSION, tags: ['iam', 'service-accounts'], agentContext: SA_CONTEXT }, () => {
  const newAccount = (label: string) => {
    const name = `iam-e2e-${RUN_ID}-${label}`;
    return name;
  };
  type Agent = Fx['agent'];
  const createAccount = async (agent: Agent, name: string) => {
    await agent.act('create a service account named {name} with the role End User and the organization motadata, keeping the default owner', {
      params: { name: unique(name) },
    });
    await agent.waitFor('{name} is listed in the service accounts list', { params: { name: unique(name) } });
  };
  /** API key banao aur us page pe ruko jahan generated key dikhti hai. */
  const generateApiKey = (agent: Agent, key: string) =>
    agent.act('open the service account, add an API key credential named {key}, generate it, and stay on the page that shows the generated key', {
      params: { key: unique(key) },
    });
  /** API key banao, "copied" confirm karo, credentials list pe wapas. */
  const addApiKey = async (agent: Agent, key: string) => {
    await generateApiKey(agent, key);
    await agent.act('confirm the key has been copied and return to the credentials');
    await agent.waitFor('{key} is listed among the credentials', { params: { key: unique(key) } });
  };


  describe('credentials', { tags: ['BEH-IAM-23', 'P0'] }, () => {
    test('a new API key’s secret is shown once with a warning to save it', { tags: ['SIT-IAM-09'] }, async ({ app, browser, screen, agent }) => {
      const name = newAccount('secret-once');
      await openAs({ app, browser, screen }, TENANT.msp, '/service-accounts');
      await createAccount(agent, name);

      await generateApiKey(agent, `${name}-key`);

      await agent.assert('the generated API key is shown with a warning to save it now because it cannot be seen again');
    });

    test('the secret cannot be read back after leaving the result page', { tags: ['SIT-IAM-09'] }, async ({ app, browser, screen, agent }) => {
      const name = newAccount('no-readback');
      await openAs({ app, browser, screen }, TENANT.msp, '/service-accounts');
      await createAccount(agent, name);
      await generateApiKey(agent, `${name}-key`);
      await agent.waitFor('the generated API key is shown with a warning to save it');

      await agent.act('confirm the key has been copied and return to the credentials');

      await agent.assert('{key} is listed as Active with an expiry, and no API key or secret value is visible anywhere on the screen', {
        params: { key: unique(`${name}-key`) },
      });
    });

    // Deployed app: API key hamesha generate hone ke 90 din baad expire hoti hai (custom date nahi).
    test('a new API key always expires within 365 days', async ({ app, browser, screen, agent }) => {
      const name = newAccount('max-365');
      await openAs({ app, browser, screen }, TENANT.msp, '/service-accounts');
      await createAccount(agent, name);

      await agent.act('open the service account, start adding a credential named {key} and choose the API key method', {
        params: { key: unique(`${name}-key`) },
      });

      await agent.assert('the API key form says the key expires, and the expiry is at most 365 days (one year) after it is generated');
    });

    test('a rotated key works beside the old one until the old one is disabled', { tags: ['SIT-IAM-09'] }, async ({ app, browser, screen, agent }) => {
      const name = newAccount('rotate');
      await openAs({ app, browser, screen }, TENANT.msp, '/service-accounts');
      await createAccount(agent, name);
      await addApiKey(agent, `${name}-old`);
      await addApiKey(agent, `${name}-new`);
      await agent.waitFor('both {old} and {new} are listed as Active', { params: { old: unique(`${name}-old`), new: unique(`${name}-new`) } });

      await agent.act('disable the credential {old}', { params: { old: unique(`${name}-old`) } });

      await agent.assert('{old} is still listed but no longer active (shown as disabled or inactive), and {new} is still Active', {
        params: { old: unique(`${name}-old`), new: unique(`${name}-new`) },
      });
    });

    test('revoking a credential warns that it is final', async ({ app, browser, screen, agent }) => {
      const name = newAccount('revoke');
      await openAs({ app, browser, screen }, TENANT.msp, '/service-accounts');
      await createAccount(agent, name);
      await addApiKey(agent, `${name}-key`);

      await agent.act('choose "Revoke credential" for {key}', { params: { key: unique(`${name}-key`) } });

      await agent.assert('the confirmation says the credential stops working immediately and cannot be re-enabled');
    });
  });

  describe('owner and switch off/on', { tags: ['P1'] }, () => {
    test('a service account always shows an accountable owner', { tags: ['BEH-IAM-14'] }, async ({ app, browser, screen, agent }) => {
      const name = newAccount('owner');
      await openAs({ app, browser, screen }, TENANT.msp, '/service-accounts');

      await createAccount(agent, name);

      await agent.assert('the service accounts list shows a named owner for {name}', { params: { name: unique(name) } });
    });

    test('a service account can be reassigned to another member', { tags: ['SIT-IAM-09', 'SIT-IAM-16', 'BEH-IAM-14'] }, async ({ app, browser, screen, agent }) => {
      const name = newAccount('reassign');
      await openAs({ app, browser, screen }, TENANT.msp, '/service-accounts');
      await createAccount(agent, name);

      await agent.act('reassign the owner of {name} to the first person the new-owner picker offers other than Test User', { params: { name: unique(name) } });

      await agent.assert('{name} is now owned by someone other than Test User, as its drawer or the service accounts list shows', { params: { name: unique(name) } });
    });

    test('enabling a disabled service account makes it active again', { tags: ['BEH-IAM-12'] }, async ({ app, browser, screen, agent }) => {
      const name = newAccount('off-on');
      await openAs({ app, browser, screen }, TENANT.msp, '/service-accounts');
      await createAccount(agent, name);
      await agent.act('disable the service account {name} from its row actions menu and confirm', { params: { name: unique(name) } });
      await agent.waitFor('{name} is Inactive', { params: { name: unique(name) } });

      await agent.act('enable the service account {name} from its row actions menu', { params: { name: unique(name) } });

      await agent.assert('{name} is Active again', { params: { name: unique(name) } });
    });

    test('deleting a service account needs the word delete', { tags: ['BEH-IAM-12'] }, async ({ app, browser, screen, agent }) => {
      const name = newAccount('delete-gate');
      await openAs({ app, browser, screen }, TENANT.msp, '/service-accounts');
      await createAccount(agent, name);
      await agent.act('choose "Delete account" in the row actions menu of {name}', { params: { name: unique(name) } });
      await agent.waitFor('a delete confirmation asks to type a word to confirm');

      await agent.act('type {word} in the confirmation box', { params: { word: 'remove' } });

      await agent.assert('the button that would delete the service account is disabled');
    });
  });
});
