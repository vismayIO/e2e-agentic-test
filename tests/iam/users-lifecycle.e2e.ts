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
 * Disable/delete only on the setup's disposable users (poolUser) — each test has its own. A test that only
 * looks at a dialog never submits it. On a real person (directory-managed) the steps are exact code and the
 * agent only reads the screen. The Tenant Owner's guards are not automated — see coverage.ts.
 */

describe('IAM person lifecycle', { session: IAM_SESSION, agentContext: IAM_CONTEXT }, () => {
  describe('disable, enable, delete', { tags: ['SIT-IAM-07', 'BEH-IAM-12', 'P1'] }, () => {
    test('the disable confirmation says sessions end and teams are kept', { tags: ['SIT-IAM-14'] }, async ({ agent, screen, users }) => {
      const user = poolUser('shared');
      await users.open();
      await users.search(user.email);

      await agent.act('choose "Disable user" in the row actions menu of {email} and stop at the dialog that opens; do not confirm, type or press anything in it', { params: { email: unique(user.email) } });

      const d = screen.getByTestId('disable-confirm');
      // Only the dialog's own sentence: the items of the `disable-what` list below it change.
      await expect(d).toContainText(/every session ends/i);
      await expect(d).toContainText(/kept and restored on enable/i);
      await agent.assert('the disable confirmation for {name} says access ends immediately and every session ends, and that teams, access profiles and scope are kept and restored on enable', { params: { name: unique(user.name) } });
      await d.getByTestId('confirm-cancel').tap();
      await expect(users.status(user.email)).toHaveText('Active');
    });

    // Code decides who gets deleted (search + exactly 2 rows + selection), not the agent: bulk delete has no
    // guard, and a wrong selection would remove real people.
    test('a bulk delete reports an outcome for every selected person', knownBug('23 Nov 2026: bulk jobs stay `queued` (processed_rows 0), and the results show only "Still running"', 'EX-IAM-12.1'), async ({ agent, screen, users }) => {
      const [a, b] = [poolUser('bulk-a'), poolUser('bulk-b')];
      const prefix = a.email.slice(0, a.email.indexOf('bulk-a') + 'bulk-'.length); // only bulk-a, bulk-b
      await users.open();
      await users.search(b.email);
      await users.disable(b.email); // one Inactive, one Active — the brief's "two of them still active"
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

  // retries 0: this changes a fixed pool user's state one way (disable / delete / sessions); a retry would get the changed user and its error would hide the real cause.
  test('a disabled person keeps no session', { tags: ['BEH-IAM-05', 'BEH-IAM-12', 'P1'], retries: 0 }, async ({ agent, users }) => {
    const user = poolUser('disabled-sessions');
    await users.open();
    await users.search(user.email);
    let drawer = await users.openProfile(user.email);
    await drawer.openSessions();
    await expect(drawer.sessions.first(), 'the session from the setup sign-in should be listed').toBeVisible();
    await drawer.close();

    await agent.act('disable the user {email} from its row actions menu and confirm the disable', { params: { email: unique(user.email) } });

    await expect(users.status(user.email)).toHaveText('Inactive');
    drawer = await users.openProfile(user.email);
    await drawer.openSessions();
    // The sessions list reloads after the disable — wait for the old row to go, then the agent looks.
    await expect(drawer.sessions).toHaveCount(0);
    await expect(drawer.terminateAll).toBeDisabled();
    await agent.assert('the Sessions tab of this person lists no session and says there are no active sessions');
  });

  /** On one disposable person, in this order: disable → who did it → enable. retries 0: the group is one-way. */
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

  /** On one disposable person: the delete lock → delete → invite the same email again. retries 0: the group is one-way. */
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
     * On a real directory-managed person: pressing confirm would make them Manual for good. So the steps up to
     * the dialog are exact code and code presses only Cancel; the agent only checks what the warning means.
     */
    test('moving someone to Manual warns that offboarding them becomes the admins’ job', {
      tags: ['EX-IAM-06.1', 'SIT-IAM-04'],
      skip: !IAM_SCIM_USER_EMAIL && 'IAM_SCIM_USER_EMAIL is not set',
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
    test('an account end date can be set on a person', knownBug('23 Nov 2026: "Set an account expiry" is always disabled — "Account expiry can\'t be set yet"'), async ({ agent, screen, users }) => {
      const user = poolUser('shared');
      await users.open();
      await users.search(user.email);
      await users.openProfile(user.email);

      await agent.act('click Edit on this profile and stop at the form that opens; do not change or save anything');
      // With the switch disabled the agent has nothing to do (it reports "blocked", not a failure) — so code asks first.
      const expiry = screen.getByTestId('edit-expiry-switch');
      await expect(expiry, 'brief: an account can have an end date').toBeEnabled();

      await agent.act('turn on "Set an account expiry"; do not save');
      await expect(expiry).toBeChecked();
      await agent.assert('the account expiry is switched on and offers an end date for this account');
    });
  });

  describe('service-account owner guard', { tags: ['BEH-IAM-14', 'SIT-IAM-09', 'P1'] }, () => {
    test('an owner of an active service account cannot be disabled', knownBug('23 Nov 2026: the owner of a service account also gets the normal Disable dialog — no guard', 'EX-IAM-14.1'), async ({ agent, screen, users, serviceAccounts }) => {
      const user = poolUser('sa-owner'); // the setup gave this user an access profile, so they are in the owner picker
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
