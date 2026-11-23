import { expect, unique } from 'e2e';
import { knownBug } from '../../lib/suites.ts';
import { dialog } from '../app/ui.ts';
import { ADMIN_NAME } from '../app/auth.ts';
import { describe, test } from './fixtures.ts';
import { IAM_CONTEXT, IAM_SCIM_USER_EMAIL, IAM_SESSION, iamNames, poolUser } from './iam.ts';

const data = iamNames();

/**
 * Person lifecycle: disable / enable / delete, source of truth, end date, service-account owner guard.
 * Brief: SIT-IAM-04, 07, 08, 09, 14, 15 · BEH-IAM-05, 06, 07, 12, 14, 15 · EX-IAM-06.1, 07.2, 12.1, 14.1
 *
 * Disable/delete sirf setup ke disposable users pe (poolUser) — har test ka apna. Jo test sirf dialog
 * dekhta hai woh kabhi submit nahi karta. Asli insaan (directory-managed person) pe steps exact code hain,
 * agent sirf screen padhta hai. Tenant Owner ke guards automate nahi hain — coverage.ts dekho.
 */

describe('IAM person lifecycle', { session: IAM_SESSION, agentContext: IAM_CONTEXT }, () => {
  describe('disable, enable, delete', { tags: ['SIT-IAM-07', 'BEH-IAM-12', 'P1'] }, () => {
    test('the disable confirmation says sessions end and teams are kept', { tags: ['SIT-IAM-14'] }, async ({ agent, screen, users }) => {
      const user = poolUser('shared');
      await users.open();
      await users.search(user.email);

      await agent.act('choose "Disable user" in the row actions menu of {email} and stop at the dialog that opens; do not confirm, type or press anything in it', { params: { email: unique(user.email) } });

      const d = screen.getByTestId('disable-confirm');
      // Sirf dialog ka apna vaakya: uske neeche ki `disable-what` list ke items badal jaate hain.
      await expect(d).toContainText(/every session ends/i);
      await expect(d).toContainText(/kept and restored on enable/i);
      await agent.assert('the disable confirmation for {name} says access ends immediately and every session ends, and that teams, access profiles and scope are kept and restored on enable', { params: { name: unique(user.name) } });
      await d.getByTestId('confirm-cancel').tap();
      await expect(users.status(user.email)).toHaveText('Active');
    });

    // Kaun delete hoga yeh code tay karta hai (search + theek 2 rows + selection), agent nahi: bulk delete me koi
    // guard nahi, aur galat selection asli logon ko hata deta.
    test('a bulk delete reports an outcome for every selected person', knownBug('23 Nov 2026: bulk jobs `queued` hi rehte hain (processed_rows 0), results me sirf "Still running"', 'EX-IAM-12.1'), async ({ agent, screen, users }) => {
      const [a, b] = [poolUser('bulk-a'), poolUser('bulk-b')];
      const prefix = a.email.slice(0, a.email.indexOf('bulk-a') + 'bulk-'.length); // sirf bulk-a, bulk-b
      await users.open();
      await users.search(b.email);
      await users.disable(b.email); // ek Inactive, ek Active — brief ka "two of them still active"
      await users.search(prefix);
      await expect(users.rows).toHaveCount(2);
      await users.select([a.email, b.email]);

      await agent.act('delete the 2 selected users from the selection bar: type {word} in the confirmation box and press Delete once; stop when a results dialog opens or the dialog stops changing', {
        params: { word: 'delete' },
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
    await drawer.openSessions();
    await expect(drawer.sessions.first(), 'setup ke sign-in ka session dikhna chahiye').toBeVisible();
    await drawer.close();

    await agent.act('disable the user {email} from its row actions menu and confirm the disable', { params: { email: unique(user.email) } });

    await expect(users.status(user.email)).toHaveText('Inactive');
    drawer = await users.openProfile(user.email);
    await drawer.openSessions();
    // Sessions ki list disable ke baad dobara load hoti hai — purani row hatne ka intezaar, phir agent dekhe.
    await expect(drawer.sessions).toHaveCount(0);
    await expect(drawer.terminateAll).toBeDisabled();
    await agent.assert('the Sessions tab of this person lists no session and says there are no active sessions');
  });

  /** Ek hi disposable person pe, is order me: disable → kisne kiya → enable. retries 0: group ek-tarfa hai. */
  describe('a disabled person', { serial: true, retries: 0, tags: ['sanity', 'BEH-IAM-12', 'P1'] }, () => {
    test('an admin-disabled person’s record says an admin disabled them', { tags: ['SIT-IAM-15', 'EX-IAM-07.2', 'BEH-IAM-07'] }, async ({ agent, users }) => {
      const user = poolUser('disabled');
      await users.open();
      await users.search(user.email);

      await agent.act('disable the user {email} from its row actions menu and confirm the disable', { params: { email: unique(user.email) } });

      await expect(users.status(user.email)).toHaveText('Inactive');
      const drawer = await users.openProfile(user.email);
      await expect(drawer.status).toHaveText('Inactive');
      await expect(drawer.disabledBy).toHaveText(ADMIN_NAME);
      await agent.assert('the profile shows the status Inactive and names {admin} as the one who disabled this person', { params: { admin: ADMIN_NAME } });
    });

    test('enabling a disabled person makes them active again', { tags: ['SIT-IAM-07'] }, async ({ agent, users }) => {
      const user = poolUser('disabled');
      await users.open();
      await users.search(user.email);

      await agent.act('enable the user {email} from its row actions menu and confirm', { params: { email: unique(user.email) } });

      await expect(users.status(user.email)).toHaveText('Active');
      await agent.assert('the users list shows {email} with the status Active', { params: { email: unique(user.email) } });
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
      await expect(d.getByTestId('confirm-submit')).toBeDisabled();
      await agent.assert('the delete confirmation says the person will be deleted and their data anonymized and that this cannot be undone; the confirmation box holds the word remove and the Delete button is disabled');
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
      await expect(users.empty).toContainText('No users match');
      await agent.assert('the users list is searched for {email} and says no users match', { params: { email: unique(user.email) } });
    });

    test('a deleted person’s email can be invited again as a fresh person', async ({ agent, users }) => {
      const user = poolUser('delete');
      await users.open();

      await agent.act('invite {email} by email from Invite users ("Invite via email"), tick the box that allows users from outside the permitted domains, and send the invitation once', {
        params: { email: unique(user.email) },
      });

      await users.open();
      await users.search(user.email);
      await expect(users.status(user.email)).toHaveText('Invited');
      await agent.assert('the users list shows {email} with the status Invited', { params: { email: unique(user.email) } });
    });
  });

  describe('who switched someone off', { tags: ['BEH-IAM-06', 'BEH-IAM-07', 'P1'] }, () => {
    /**
     * Asli directory-managed person pe: confirm dabte hi woh hamesha ke liye Manual ho jaata. Isliye dialog tak ke
     * steps exact code hain aur code sirf Cancel dabata hai; agent sirf warning ka matlab jaanchta hai.
     */
    test('moving someone to Manual warns that offboarding them becomes the admins’ job', {
      tags: ['EX-IAM-06.1', 'SIT-IAM-04'],
      skip: !IAM_SCIM_USER_EMAIL && 'IAM_SCIM_USER_EMAIL set nahi hai',
    }, async ({ agent, screen, users }) => {
      await users.open();
      await users.search(IAM_SCIM_USER_EMAIL);
      const drawer = await users.openProfile(IAM_SCIM_USER_EMAIL);
      const source = drawer.root.getByTestId('source-selector').getByRole('combobox', 'Source of truth');
      const directory = (await source.textContent())?.trim() ?? '';
      expect(directory, 'IAM_SCIM_USER_EMAIL should be a directory-managed person').not.toBe('Manual');

      await source.tap();
      await screen.getByRole('option', 'Manual').tap();

      const confirm = dialog(screen, 'source-confirm');
      await expect(confirm.root).toContainText(/will not be disabled automatically/i);
      await expect(confirm.root).toContainText(/switching them off becomes your job/i);
      await agent.assert('a confirmation warns that this person will not be disabled automatically when the directory reports them gone, and that switching them off becomes the admin’s job');
      await confirm.dismiss();
      await expect(source, 'cancelling must leave the person with their directory').toHaveText(directory);
    });
  });

  describe('account end date', { tags: ['BEH-IAM-15', 'SIT-IAM-08', 'P1'] }, () => {
    test('an account end date can be set on a person', knownBug('23 Nov 2026: "Set an account expiry" hamesha disabled — "Account expiry can\'t be set yet"'), async ({ agent, screen, users }) => {
      const user = poolUser('shared');
      await users.open();
      await users.search(user.email);
      await users.openProfile(user.email);

      await agent.act('click Edit on this profile and turn on "Set an account expiry"; do not save');

      await expect(screen.getByTestId('edit-expiry-switch'), 'brief: an account can have an end date').toBeChecked();
      await agent.assert('the account expiry is switched on and offers an end date for this account');
    });
  });

  describe('service-account owner guard', { tags: ['BEH-IAM-14', 'SIT-IAM-09', 'P1'] }, () => {
    test('an owner of an active service account cannot be disabled', knownBug('23 Nov 2026: service account ke owner pe bhi normal Disable dialog — koi guard nahi', 'EX-IAM-14.1'), async ({ agent, screen, users, serviceAccounts }) => {
      const user = poolUser('sa-owner'); // setup ne ise access profile diya, isliye owner picker me hai
      const account = data.name('owner-bot');
      await serviceAccounts.open();
      await serviceAccounts.create(account, { owner: user.name });
      await users.open();
      await users.search(user.email);

      await agent.act('choose "Disable user" in the row actions menu of {email} and stop at the dialog that opens; do not confirm, type or press anything in it', { params: { email: unique(user.email) } });

      await expect(screen.getByRole('dialog').filter({ hasText: account }), 'the block message should name the owned account').toBeVisible();
      await expect(screen.getByTestId('disable-confirm')).toHaveCount(0);
      await agent.assert('the app refuses to disable this person because they own an active service account, and the message names the service account {account}', { params: { account: unique(account) } });
    });
  });
});
