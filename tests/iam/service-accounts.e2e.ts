import { expect, unique } from 'e2e';
import { LOGIN_SKIP } from '../app/auth.ts';
import { describe, test } from './fixtures.ts';
import { SA_ROLE } from './pages/service-accounts.ts';
import { IAM_CONTEXT, IAM_SESSION, iamNames, poolUser } from './iam.ts';

const data = iamNames();
/** Pool user jise setup ne access profile diya — owner picker sirf direct profile wale members dikhata hai. */
const owner = () => poolUser('sa-owner').name;

/**
 * Service accounts (MSP view, organization "motadata"): credentials, owner, switch off/on, delete.
 * Brief: SIT-IAM-09, SIT-IAM-16 · BEH-IAM-12, 14, 23
 *
 * Precondition (account, pehle se bane credentials) page objects se; jaancha jaane wala kaam agent karta hai,
 * aur nateeja agent.assert + code dono jaanchte hain. Har test apna account `iam-e2e-<id>-…` banata hai
 * (role SA_ROLE, owner pool ka 'sa-owner'); agle run ka setup unhe hatata hai. Owner guard (owner disable nahi
 * ho sakta) users-lifecycle.e2e.ts me hai. Generated secrets kabhi log ya assert message me nahi jaate.
 */
const SA_CONTEXT = `${IAM_CONTEXT} A service account drawer lists its credentials; "Add credential" creates an OAuth client or an API key.`;

describe('IAM service accounts', { skip: LOGIN_SKIP, session: IAM_SESSION, tags: ['iam', 'service-accounts'], agentContext: SA_CONTEXT }, () => {
  describe('credentials', { tags: ['BEH-IAM-23', 'P0'] }, () => {
    test('a new API key’s secret is shown once with a warning to save it', { tags: ['SIT-IAM-09'] }, async ({ agent, serviceAccounts }) => {
      const name = data.name('secret-once');
      await serviceAccounts.open();
      await serviceAccounts.create(name, { owner: owner() });
      const drawer = await serviceAccounts.openAccount(name);

      await agent.act('add an API key credential named {key} to this service account, generate it, and stop on the result that shows the key', { params: { key: unique(`${name}-key`) } });

      await agent.assert('the generated API key is shown once, with a warning to copy it now because it cannot be retrieved again, and a way to copy it');
      await expect(drawer.secret).toContainText('Copy this secret now — it is shown once and cannot be retrieved again.');
      await expect(drawer.secret.getByTestId('secret-value')).toHaveText(/^mda1\.sk\.\S+$/);
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

      await agent.act('close the generated key result with Done, then open the credential {key} in the list and look for a way to see its secret again; do not change anything', { params: { key: unique(key) } });

      await agent.assert('{key} is listed as Active with an expiry, and nowhere on the screen is its secret value shown or offered to be shown again', { params: { key: unique(key) } });
      await expect(drawer.credential(key).getByTestId('credential-status')).toHaveText('Active');
      await expect(screen.getByTestId('secret-value')).toHaveCount(0);
      expect(await screen.getByText(secret, { exact: false }).count(), 'the secret must not be on screen any more').toBe(0);
    });

    // Deployed app: API key hamesha generate hone ke 90 din baad expire hoti hai (custom date nahi).
    test('a new API key always expires within 365 days', async ({ agent, screen, serviceAccounts }) => {
      const name = data.name('max-365');
      await serviceAccounts.open();
      await serviceAccounts.create(name, { owner: owner() });
      await serviceAccounts.openAccount(name);

      await agent.act('start adding a credential named {key}, choose the API key method, and stop before generating it', { params: { key: unique(`${name}-key`) } });

      await agent.assert('the API key form says when the key expires, and that is at most one year (365 days) after it is generated; no expiry longer than that can be chosen');
      const note = (await screen.getByTestId('cred-expiry-note').textContent()) ?? '';
      const days = Number(note.match(/expires (\d+) days after/)?.[1]);
      expect(days, `expiry note: "${note}"`).toBeGreaterThan(0);
      expect(days).toBeLessThanOrEqual(365);
    });

    test('a rotated key works beside the old one until the old one is disabled', { tags: ['SIT-IAM-09'] }, async ({ agent, serviceAccounts }) => {
      const name = data.name('rotate');
      const [oldKey, newKey] = [`${name}-old`, `${name}-new`];
      await serviceAccounts.open();
      await serviceAccounts.create(name, { owner: owner() });
      const drawer = await serviceAccounts.openAccount(name);
      await drawer.addApiKey(oldKey);

      await agent.act('rotate the key: add a new API key credential named {new} and close its result with Done, then disable the credential {old}', {
        params: { new: unique(newKey), old: unique(oldKey) },
      });

      await agent.assert('{old} is still listed but disabled, and {new} is listed as Active', { params: { old: unique(oldKey), new: unique(newKey) } });
      await expect(drawer.credential(oldKey).getByTestId('credential-status')).toHaveText('Disabled');
      await expect(drawer.credential(newKey).getByTestId('credential-status')).toHaveText('Active');
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
      await agent.assert('the confirmation says the credential stops working immediately, cannot be re-enabled, and suggests disabling plus issuing a new one to rotate without downtime');
      await expect(confirm).toContainText('It stops working immediately and cannot be re-enabled');
      await confirm.getByTestId('confirm-cancel').tap();
      await expect(drawer.credential(key).getByTestId('credential-status')).toHaveText('Active');
    });
  });

  describe('owner and switch off/on', { tags: ['P1'] }, () => {
    test('a service account always shows an accountable owner', { tags: ['BEH-IAM-14'] }, async ({ agent, serviceAccounts }) => {
      const name = data.name('owner');
      await serviceAccounts.open();

      await agent.act('create a service account named {name} with the role {role}, the organization motadata and {owner} as its owner', {
        params: { name: unique(name), role: SA_ROLE, owner: unique(owner()) },
      });

      await serviceAccounts.open();
      await serviceAccounts.search(name);
      await agent.assert('the service accounts list shows {name} as Active, owned by {owner}', { params: { name: unique(name), owner: unique(owner()) } });
      await expect(serviceAccounts.owner(name)).toContainText(owner(), { timeout: 15_000 }); // owner cell der se bharta hai
    });

    test('a service account can be reassigned to another member', { tags: ['SIT-IAM-09', 'SIT-IAM-16', 'BEH-IAM-14'] }, async ({ agent, serviceAccounts }) => {
      const name = data.name('reassign');
      const newOwner = poolUser('shared').name; // setup ne ise bhi owner banne layak profile diya
      await serviceAccounts.open();
      await serviceAccounts.create(name, { owner: owner() });

      await agent.act('reassign the owner of the service account {name} to {owner} and confirm', { params: { name: unique(name), owner: unique(newOwner) } });

      await agent.assert('a confirmation says the owner of {name} was reassigned, and its credentials and role were left as they were', { params: { name: unique(name) } });
      await expect(serviceAccounts.owner(name)).toContainText(newOwner, { timeout: 15_000 });
    });

    test('enabling a disabled service account makes it active again', { tags: ['BEH-IAM-12'] }, async ({ agent, serviceAccounts }) => {
      const name = data.name('off-on');
      await serviceAccounts.open();
      await serviceAccounts.create(name, { owner: owner() });
      await serviceAccounts.disable(name);

      await agent.act('enable the service account {name} from its row actions menu and confirm', { params: { name: unique(name) } });

      await agent.assert('{name} is Active again', { params: { name: unique(name) } });
      await expect(serviceAccounts.status(name)).toHaveText('Active');
    });

    test('deleting a service account needs the word delete', { tags: ['BEH-IAM-12'] }, async ({ agent, screen, serviceAccounts }) => {
      const name = data.name('delete-gate');
      await serviceAccounts.open();
      await serviceAccounts.create(name, { owner: owner() });

      await agent.act('choose "Delete account" for {name}, type {word} in the confirmation box and stop; do not press delete', { params: { name: unique(name), word: 'remove' } });

      const d = screen.getByTestId('sa-delete');
      await agent.assert('the delete confirmation says the account and its credentials are removed for good, and its delete button is disabled because the typed word is not delete');
      await expect(d.getByTestId('confirm-submit')).toBeDisabled();
      await d.getByTestId('confirm-word').fill('delete');
      await expect(d.getByTestId('confirm-submit')).toBeEnabled();
      await d.getByTestId('confirm-cancel').tap();
    });
  });
});
