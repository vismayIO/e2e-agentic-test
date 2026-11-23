import { expect, unique } from 'e2e';
import { chooseAction, toast } from '../app/ui.ts';
import { ADMIN_NAME, LOGIN_SKIP } from '../app/auth.ts';
import { describe, test } from './fixtures.ts';
import { UserDrawer } from './pages/users.ts';
import { IAM_CONTEXT, IAM_SESSION, IAM_TENANT_OWNER_EMAIL, iamNames, poolUser } from './iam.ts';

const data = iamNames();

/**
 * Person lifecycle: Tenant Owner guard, disable / enable / delete, source of truth, end date, owner guard.
 * Brief: SIT-IAM-01, 04, 07, 08, 09, 15, 16 · BEH-IAM-06, 12, 13, 14, 15 · EX-IAM-06.1, 12.1, 13.1, 14.1
 *
 * Disable/delete sirf setup ke disposable users pe (poolUser) — har test ka apna. Jo test sirf dialog
 * dekhta hai woh kabhi submit nahi karta.
 */

describe('IAM person lifecycle', { skip: LOGIN_SKIP, session: IAM_SESSION, tags: ['iam', 'users'], agentContext: IAM_CONTEXT }, () => {
  /**
   * Tenant Owner ke block messages ka DOM abhi map nahi hua (owner ka email chahiye). Steps exact code hain
   * aur code kabhi submit nahi dabata — guard toota ho to bhi owner off na ho; sirf message ka matlab agent
   * jaanchta hai.
   */
  describe('Tenant Owner', { tags: ['BEH-IAM-13', 'P0'], skip: !IAM_TENANT_OWNER_EMAIL && 'IAM_TENANT_OWNER_EMAIL set nahi hai' }, () => {
    const owner = IAM_TENANT_OWNER_EMAIL;

    test('the Tenant Owner cannot be disabled from the users list', { tags: ['SIT-IAM-16', 'SIT-IAM-01'] }, async ({ agent, screen, users }) => {
      await users.open();
      await users.search(owner);

      await users.rowAction(owner, 'disable');

      await expect(screen.getByTestId('action-gate')).toHaveCount(0, { timeout: 15_000 });
      await expect(screen.getByTestId('disable-confirm'), 'the Tenant Owner must not get a disable confirmation').toHaveCount(0);
      await agent.assert('a message says the Tenant Owner cannot be disabled and the designation must be transferred first');
    });

    test('the Tenant Owner cannot be deleted from the users list', { tags: ['SIT-IAM-16'] }, async ({ agent, screen, users }) => {
      await users.open();
      await users.search(owner);

      await users.rowAction(owner, 'delete');

      await expect(screen.getByTestId('action-gate')).toHaveCount(0, { timeout: 15_000 });
      await expect(screen.getByTestId('disable-confirm').or(screen.getByTestId('delete-confirm'))).toHaveCount(0);
      await agent.assert('a message says the Tenant Owner cannot be deleted and the designation must be transferred first');
    });

    test('the Tenant Owner cannot be disabled from their profile', { tags: ['SIT-IAM-16'] }, async ({ agent, screen, users }) => {
      await users.open();
      await users.search(owner);
      const drawer = await users.openProfile(owner);

      await chooseAction(screen, drawer.root.getByTestId('user-header'), 'disable');

      await expect(screen.getByTestId('action-gate')).toHaveCount(0, { timeout: 15_000 });
      await expect(screen.getByTestId('disable-confirm')).toHaveCount(0);
      await agent.assert('the app says the Tenant Owner cannot be disabled');
    });

    test('a bulk disable warns that the Tenant Owner row will fail', { tags: ['SIT-IAM-16', 'EX-IAM-13.1'] }, async ({ agent, screen, users }) => {
      await users.open();
      await users.search(owner);
      await users.select([owner]);

      await users.bulkBar.getByTestId('bulk-disable').tap();

      const confirm = screen.getByTestId('bulk-disable-confirm');
      await expect(confirm.getByText('Checking the selection…')).toHaveCount(0, { timeout: 30_000 });
      await agent.assert('the disable confirmation warns that the Tenant Owner will be blocked and reported as failed');
    });
  });

  describe('disable, enable, delete', { tags: ['SIT-IAM-07', 'BEH-IAM-12', 'P1'] }, () => {
    test('the disable confirmation says sessions end and teams are kept', { tags: ['SIT-IAM-14'] }, async ({ agent, screen, users }) => {
      const user = poolUser('shared');
      await users.open();
      await users.search(user.email);

      await agent.act('choose "Disable user" in the row actions menu of {email} and stop at the dialog that opens; do not confirm, type or press anything in it', { params: { email: unique(user.email) } });

      const d = screen.getByTestId('disable-confirm');
      await agent.assert('the disable confirmation for {name} says access ends immediately and every session ends, that teams, access profiles and scope are kept and restored on enable, and that open tickets and approvals are preserved', { params: { name: unique(user.name) } });
      // Pehli list submit se pehle dikhti hai; submit ke baad server wali list aati hai (DOM map critic b1).
      await expect(d).toContainText(/every session ends/i);
      await expect(d).toContainText(/kept and restored on enable/i);
      await expect(d.getByTestId('disable-what')).toContainText(/sessions are ended/i);
      await expect(d.getByTestId('disable-what')).toContainText(/team memberships are preserved/i);
      await d.getByTestId('confirm-cancel').tap();
      await expect(users.status(user.email)).toHaveText('Active');
    });

    // Deployed app (23 Nov 2026): bulk jobs `queued` hi rehte hain (processed_rows 0), results me sirf "Still running".
    // retries 0: yeh ek fixed pool user ka state ek taraf badalta hai (disable / delete / sessions); retry ko badla hua user milta aur uska error asli wajah chhupa deta.
    test('a bulk delete reports an outcome for every selected person', { tags: ['bug', 'EX-IAM-12.1'], retries: 0 }, async ({ agent, screen, users }) => {
      const [a, b] = [poolUser('bulk-a'), poolUser('bulk-b')];
      const prefix = a.email.slice(0, a.email.indexOf('bulk-a') + 'bulk-'.length); // sirf bulk-a, bulk-b
      await users.open();
      await users.search(b.email);
      await users.disable(b.email); // ek Inactive, ek Active — brief ka "two of them still active"
      await users.open();

      await agent.act('search the users list for {prefix}, select both listed users, delete them from the selection bar by typing {word} and pressing Delete once, then wait for the result', {
        params: { prefix: unique(prefix), word: 'delete' },
      });

      const outcome = screen.getByTestId('bulk-outcome');
      await expect(outcome).toContainText(a.name, { timeout: 90_000 });
      await expect(outcome).toContainText(b.name);
      await expect(outcome, 'both deletions should finish with their own outcome').toContainText('2 succeeded', { timeout: 120_000 });
      await agent.assert('the results list both {a} and {b}, each with its own finished outcome (deleted), and none is still running', { params: { a: unique(a.name), b: unique(b.name) } });
    });
  });

  // retries 0: yeh ek fixed pool user ka state ek taraf badalta hai (disable / delete / sessions); retry ko badla hua user milta aur uska error asli wajah chhupa deta.
  test('a disabled person keeps no session', { tags: ['BEH-IAM-05', 'BEH-IAM-12', 'P1'], retries: 0 }, async ({ agent, users }) => {
    const user = poolUser('disabled-sessions');
    await users.open();
    await users.search(user.email);
    let drawer = await users.openProfile(user.email);
    await drawer.tab('Sessions');
    await expect(drawer.sessions.first(), 'setup ke sign-in ka session dikhna chahiye').toBeVisible();
    await drawer.close();

    await agent.act('disable the user {email} from its row actions menu and confirm the disable', { params: { email: unique(user.email) } });

    await expect(users.status(user.email)).toHaveText('Inactive');
    drawer = await users.openProfile(user.email);
    await drawer.tab('Sessions');
    await agent.assert('the person’s Sessions tab says they have no active sessions');
    await expect(drawer.sessions).toHaveCount(0);
    await expect(drawer.terminateAll).toBeDisabled();
  });

  /** Ek hi disposable person pe, is order me: disable → kisne kiya → enable. retries 0: group ek-tarfa hai. */
  describe('a disabled person', { serial: true, retries: 0, tags: ['BEH-IAM-12', 'P1'] }, () => {
    test('an admin-disabled person’s record says an admin disabled them', { tags: ['SIT-IAM-15', 'EX-IAM-07.2', 'BEH-IAM-07'] }, async ({ agent, screen, users }) => {
      const user = poolUser('disabled');
      await users.open();
      await users.search(user.email);

      await agent.act('disable the user {email} from its row actions menu and confirm the disable, then open that person’s profile', { params: { email: unique(user.email) } });

      await agent.assert('the profile shows the person as Inactive and says who disabled them: the admin {admin}', { params: { admin: ADMIN_NAME } });
      const drawer = new UserDrawer(screen);
      await expect(drawer.status).toHaveText('Inactive');
      await expect(drawer.disabledBy).toHaveText(ADMIN_NAME);
    });

    test('enabling a disabled person makes them active again', { tags: ['SIT-IAM-07'] }, async ({ agent, users }) => {
      const user = poolUser('disabled');
      await users.open();
      await users.search(user.email);

      await agent.act('enable the user {email} from its row actions menu and confirm', { params: { email: unique(user.email) } });

      await agent.assert('{email} is shown as Active, and a confirmation says the person was enabled', { params: { email: unique(user.email) } });
      await expect(users.status(user.email)).toHaveText('Active');
    });
  });

  /** Ek hi disposable person pe: delete ka lock → delete → wahi email dobara invite. retries 0: group ek-tarfa hai. */
  describe('a deleted person', { serial: true, retries: 0, tags: ['SIT-IAM-07', 'BEH-IAM-12', 'P1'] }, () => {
    test('delete stays locked until the word delete is typed', async ({ agent, screen, users }) => {
      const user = poolUser('delete');
      await users.open();
      await users.search(user.email);

      await agent.act('choose "Delete user" in the row actions menu of {email}; if the app first asks to disable the user, choose "Disable and continue"; then type {word} in the confirmation box and stop; do not press delete', {
        params: { email: unique(user.email), word: 'remove' },
      });

      const d = screen.getByTestId('delete-confirm');
      await agent.assert('the delete confirmation says the person will be deleted and their data anonymized, that this cannot be undone, and its delete button is disabled because the typed word is not delete');
      await expect(d.getByTestId('confirm-submit')).toBeDisabled();
      await d.getByTestId('confirm-word').fill('delete');
      await expect(d.getByTestId('confirm-submit')).toBeEnabled();
      await d.getByTestId('confirm-cancel').tap();
    });

    test('typing delete removes the person for good', async ({ agent, users }) => {
      const user = poolUser('delete');
      await users.open();
      await users.search(user.email);

      await agent.act('delete the user {email} from its row actions menu, typing {word} to confirm and pressing Delete once', { params: { email: unique(user.email), word: 'delete' } });

      await users.open();
      await users.search(user.email);
      await agent.assert('no user with the email {email} is listed any more', { params: { email: unique(user.email) } });
      await expect(users.empty).toContainText('No users match');
    });

    test('a deleted person’s email can be invited again as a fresh person', async ({ agent, users }) => {
      const user = poolUser('delete');
      await users.open();

      await agent.act('invite {email} by email from Invite users ("Invite via email"), tick the box that allows users from outside the permitted domains, and send the invitation once', {
        params: { email: unique(user.email) },
      });

      await agent.assert('the invitation was sent with no error saying a member with this email already exists');
      await users.open();
      await users.search(user.email);
      await expect(users.status(user.email)).toHaveText('Invited');
    });
  });

  describe('who switched someone off', { tags: ['BEH-IAM-06', 'BEH-IAM-07', 'P1'] }, () => {
    test('moving someone to Manual warns that offboarding them becomes the admins’ job', { tags: ['EX-IAM-06.1', 'SIT-IAM-04'] }, async ({ agent, screen, users }) => {
      // Tenant ka akela SCIM-managed user. Sirf warning dekhte hain — Cancel, kuch save nahi hota.
      const scimUser = 'md@gmail.com';
      await users.open();
      await users.search(scimUser);
      const drawer = await users.openProfile(scimUser);

      await agent.act('on this profile, change the source of truth to Manual and stop at the dialog that opens; do not confirm, type or press anything in it');

      const d = screen.getByTestId('source-confirm');
      await agent.assert('a confirmation warns that the directory will no longer switch this person off when it reports them gone, and that disabling them becomes the admins’ job');
      await expect(d).toContainText(/will not be disabled automatically/i);
      await expect(d).toContainText(/switching them off becomes your job/i);
      await d.getByTestId('confirm-cancel').tap();
      await expect(drawer.root.getByTestId('source-selector').getByRole('combobox', 'Source of truth')).toHaveText('SCIM directory');
    });
  });

  describe('account end date', { tags: ['BEH-IAM-15', 'SIT-IAM-08', 'P1'] }, () => {
    // Deployed app (20 + 23 Nov 2026): switch hamesha disabled — "Account expiry can't be set yet".
    test('an account end date can be set on a person', { tags: ['bug'] }, async ({ agent, screen, users }) => {
      const user = poolUser('shared');
      await users.open();
      await users.search(user.email);
      await users.openProfile(user.email);

      await agent.act('click Edit on this profile and turn on "Set an account expiry"; do not save');

      await agent.assert('the account expiry is switched on and offers an end date for this account');
      await expect(screen.getByTestId('edit-expiry-switch'), 'brief: an account can have an end date').toBeChecked();
    });
  });

  describe('service-account owner guard', { tags: ['BEH-IAM-14', 'SIT-IAM-09', 'P1'] }, () => {
    // Deployed app (23 Nov 2026): ek service account ke owner pe bhi normal Disable dialog — koi guard nahi.
    test('an owner of an active service account cannot be disabled', { tags: ['bug', 'EX-IAM-14.1'] }, async ({ agent, screen, users, serviceAccounts }) => {
      const user = poolUser('sa-owner'); // setup ne ise access profile diya, isliye owner picker me hai
      const account = data.name('owner-bot');
      await serviceAccounts.open();
      await serviceAccounts.create(account, { owner: user.name });
      await users.open();
      await users.search(user.email);

      await agent.act('choose "Disable user" in the row actions menu of {email} and stop at the dialog that opens; do not confirm, type or press anything in it', { params: { email: unique(user.email) } });

      await agent.assert('the app refuses to disable this person because they own an active service account, and the message names the service account {account}', { params: { account: unique(account) } });
      await expect(screen.getByRole('dialog').filter({ hasText: account }), 'the block message should name the owned account').toBeVisible();
      await expect(screen.getByTestId('disable-confirm')).toHaveCount(0);
    });
  });
});
