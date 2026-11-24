import { expect, unique } from 'e2e';
import { describe, test } from './fixtures.ts';
import { SA_ROLE } from './pages/service-accounts.ts';
import { IAM_CONTEXT, IAM_SESSION, iamNames, poolUser } from './iam.ts';

const data = iamNames();
/** The pool user the setup gave an access profile — the owner picker lists only members with a direct profile. */
const owner = () => poolUser('sa-owner').name;

/**
 * Service accounts (MSP view, organization "motadata"): credentials, owner, switch off/on, delete.
 * Brief: SIT-IAM-09, SIT-IAM-16 · BEH-IAM-12, 14, 23
 *
 * Preconditions (account, existing credentials) come from page objects; the agent does the work under test,
 * and both code and agent.assert check the result — code first, because it waits for loading while
 * agent.assert looks at the screen only once. Each test creates its own account `iam-e2e-<id>-…`
 * (role SA_ROLE, owner the pool's 'sa-owner'); a later IAM setup removes them. The owner guard (an owner
 * cannot be disabled) is in users-lifecycle.e2e.ts. Generated secrets never go into a log or an assert message.
 */
const SA_CONTEXT = `${IAM_CONTEXT} A service account drawer lists its credentials; "Add credential" creates an OAuth client or an API key.`;

describe('IAM service accounts', { session: IAM_SESSION, agentContext: SA_CONTEXT }, () => {
  describe('credentials', { tags: ['BEH-IAM-23', 'P0'] }, () => {
    test('a new API key’s secret is shown once with a warning to save it', { tags: ['sanity', 'SIT-IAM-09'] }, async ({ agent, serviceAccounts }) => {
      const name = data.name('secret-once');
      await serviceAccounts.open();
      await serviceAccounts.create(name, { owner: owner() });
      const drawer = await serviceAccounts.openAccount(name);

      await agent.act('add an API key credential named {key} to this service account, generate it, and stop on the result that shows the key', { params: { key: unique(`${name}-key`) } });

      await expect(drawer.secret).toContainText('Copy this secret now — it is shown once and cannot be retrieved again.');
      await expect(drawer.secret.getByTestId('secret-value')).toHaveText(/^mda1\.sk\.\S+$/);
      await agent.assert('the result shows the generated API key with a warning to copy it now because it is shown once and cannot be retrieved again, and a button to copy it');
    });

    test('the secret cannot be read back after leaving the result page', { tags: ['SIT-IAM-09'] }, async ({ agent, screen, serviceAccounts }) => {
      const name = data.name('no-readback');
      const key = `${name}-key`;
      await serviceAccounts.open();
      await serviceAccounts.create(name, { owner: owner() });
      const drawer = await serviceAccounts.openAccount(name);
      await drawer.generate(key);
      const secret = (await drawer.secret.getByTestId('secret-value').textContent())?.trim() ?? '';
      expect(secret.length).toBeGreaterThan(16);

      await agent.act('close the generated key result with Done and stop on the credentials list');

      await expect(drawer.credential(key).getByTestId('credential-status')).toHaveText('Active');
      await expect(screen.getByTestId('secret-value')).toHaveCount(0);
      expect(await screen.getByText(secret, { exact: false }).count(), 'the secret must not be on screen any more').toBe(0);
      await agent.assert('{key} is listed as Active with an expiry, and nowhere on the screen is its secret value shown or offered to be shown again', { params: { key: unique(key) } });
    });

    // Deployed app: an API key always expires 90 days after it is generated (no custom date).
    test('a new API key always expires within 365 days', async ({ agent, screen, serviceAccounts }) => {
      const name = data.name('max-365');
      await serviceAccounts.open();
      await serviceAccounts.create(name, { owner: owner() });
      await serviceAccounts.openAccount(name);

      await agent.act('start adding a credential named {key}, choose the API key method, and stop before generating it', { params: { key: unique(`${name}-key`) } });

      const note = (await screen.getByTestId('cred-expiry-note').textContent()) ?? '';
      const days = Number(note.match(/expires (\d+) days after/)?.[1]);
      expect(days, `expiry note: "${note}"`).toBeGreaterThan(0);
      expect(days).toBeLessThanOrEqual(365);
      await agent.assert('the add-credential form says the credential expires a fixed number of days after it is generated, that number is at most 365, and the form has no field to choose a different expiry');
    });

    test('a rotated key works beside the old one until the old one is disabled', { tags: ['SIT-IAM-09'] }, async ({ agent, serviceAccounts }) => {
      const name = data.name('rotate');
      const [oldKey, newKey] = [`${name}-old`, `${name}-new`];
      await serviceAccounts.open();
      await serviceAccounts.create(name, { owner: owner() });
      const drawer = await serviceAccounts.openAccount(name);
      await drawer.addApiKey(oldKey);

      await agent.act('add a new API key credential named {new} to this service account, generate it and close its result with Done', { params: { new: unique(newKey) } });

      // Mid-rotation: the new key exists, the old one still works.
      await expect(drawer.credential(newKey).getByTestId('credential-status')).toHaveText('Active');
      await expect(drawer.credential(oldKey).getByTestId('credential-status')).toHaveText('Active');

      await agent.act('disable the credential {old}', { params: { old: unique(oldKey) } });

      await expect(drawer.credential(oldKey).getByTestId('credential-status')).toHaveText('Disabled');
      await expect(drawer.credential(newKey).getByTestId('credential-status')).toHaveText('Active');
      await agent.assert('the credentials list shows {old} as Disabled and {new} as Active', { params: { old: unique(oldKey), new: unique(newKey) } });
    });

    test('revoking a credential warns that it is final', async ({ agent, screen, serviceAccounts }) => {
      const name = data.name('revoke');
      const key = `${name}-key`;
      await serviceAccounts.open();
      await serviceAccounts.create(name, { owner: owner() });
      const drawer = await serviceAccounts.openAccount(name);
      await drawer.addApiKey(key);

      await agent.act('choose "Revoke credential" for {key} and stop at the confirmation; do not confirm it', { params: { key: unique(key) } });

      const confirm = screen.getByTestId('revoke-credential');
      await expect(confirm).toContainText('It stops working immediately and cannot be re-enabled');
      await agent.assert('the confirmation says the credential stops working immediately, cannot be re-enabled, and suggests disabling it and issuing a new one to rotate without downtime');
      await confirm.getByTestId('confirm-cancel').tap();
      await expect(drawer.credential(key).getByTestId('credential-status')).toHaveText('Active');
    });
  });

  describe('owner and switch off/on', { tags: ['P1'] }, () => {
    test('a service account always shows an accountable owner', { tags: ['sanity', 'BEH-IAM-14'] }, async ({ agent, serviceAccounts }) => {
      const name = data.name('owner');
      await serviceAccounts.open();

      await agent.act('create a service account named {name} with the role {role}, the organization motadata and {owner} as its owner', {
        params: { name: unique(name), role: SA_ROLE, owner: unique(owner()) },
      });

      await serviceAccounts.open();
      await serviceAccounts.search(name);
      await expect(serviceAccounts.status(name)).toHaveText('Active');
      await expect(serviceAccounts.owner(name)).toContainText(owner(), { timeout: 15_000 }); // the owner cell fills in late
      await agent.assert('the service accounts list shows {name} as Active, owned by {owner}', { params: { name: unique(name), owner: unique(owner()) } });
    });

    test('a service account can be reassigned to another member', { tags: ['SIT-IAM-09', 'SIT-IAM-16', 'BEH-IAM-14'] }, async ({ agent, serviceAccounts }) => {
      const name = data.name('reassign');
      const newOwner = poolUser('shared').name; // the setup gave this user a profile too, so they can be an owner
      await serviceAccounts.open();
      await serviceAccounts.create(name, { owner: owner() });

      await agent.act('reassign the owner of the service account {name} to {owner} and confirm', { params: { name: unique(name), owner: unique(newOwner) } });

      await expect(serviceAccounts.owner(name)).toContainText(newOwner, { timeout: 15_000 });
      await agent.assert('the service accounts list shows {name} owned by {owner}', { params: { name: unique(name), owner: unique(newOwner) } });
    });

    test('enabling a disabled service account makes it active again', { tags: ['BEH-IAM-12'] }, async ({ agent, serviceAccounts }) => {
      const name = data.name('off-on');
      await serviceAccounts.open();
      await serviceAccounts.create(name, { owner: owner() });
      await serviceAccounts.disable(name);

      await agent.act('enable the service account {name} from its row actions menu and confirm', { params: { name: unique(name) } });

      await expect(serviceAccounts.status(name)).toHaveText('Active');
      await agent.assert('the service accounts list shows {name} with the status Active', { params: { name: unique(name) } });
    });

    test('deleting a service account needs the word delete', { tags: ['BEH-IAM-12'] }, async ({ agent, screen, serviceAccounts }) => {
      const name = data.name('delete-gate');
      await serviceAccounts.open();
      await serviceAccounts.create(name, { owner: owner() });

      await agent.act('choose "Delete account" for {name}, type {word} in the confirmation box and stop; do not press delete', { params: { name: unique(name), word: 'remove' } });

      const d = screen.getByTestId('sa-delete');
      await expect(d.getByTestId('confirm-submit')).toBeDisabled();
      await agent.assert('the delete confirmation says the account and all of its credentials will be permanently deleted and that this cannot be undone; the confirmation box holds the word remove and the Delete account button is disabled');
      await d.getByTestId('confirm-word').fill('delete');
      await expect(d.getByTestId('confirm-submit')).toBeEnabled();
      await d.getByTestId('confirm-cancel').tap();
    });
  });
});
