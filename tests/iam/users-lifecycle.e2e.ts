import { describe, test } from '@e2e-dev/web';
import { unique } from 'e2e';
import { IAM_CONTEXT, IAM_SESSION, IAM_SKIP, IAM_TENANT_OWNER_EMAIL, TENANT, openAs, poolUser } from './support.ts';

/**
 * Person lifecycle: Tenant Owner guard, disable / enable / delete, source of truth, end date, owner guard.
 * Brief: SIT-IAM-01, 04, 07, 08, 09, 15, 16 · BEH-IAM-06, 12, 13, 14, 15 · EX-IAM-06.1, 12.1, 13.1
 *
 * Disable/delete sirf setup ke disposable users pe (poolUser) — har test ka apna. Tenant Owner tests
 * sirf block message dekhte hain, kabhi kuch confirm nahi karte (guard toota ho to bhi owner off na ho).
 */
const STOP = 'Do not confirm anything and do not press any button in a dialog that appears.';

describe('IAM person lifecycle', { skip: IAM_SKIP, session: IAM_SESSION, tags: ['iam', 'users'], agentContext: IAM_CONTEXT }, () => {
  describe('Tenant Owner', { tags: ['BEH-IAM-13', 'P0'], skip: !IAM_TENANT_OWNER_EMAIL && 'IAM_TENANT_OWNER_EMAIL set nahi hai', agentContext: `${IAM_CONTEXT} ${STOP}` }, () => {
    const owner = { email: IAM_TENANT_OWNER_EMAIL };

    test('the Tenant Owner cannot be disabled from the users list', { tags: ['SIT-IAM-16', 'SIT-IAM-01'] }, async ({ app, browser, screen, agent }) => {
      await openAs({ app, browser, screen }, TENANT.msp, '/users');

      await agent.act('search the users list for {email} and choose "Disable user" in its row actions menu', { params: owner });

      await agent.assert('a message says the Tenant Owner cannot be disabled and the designation must be transferred first');
    });

    test('the Tenant Owner cannot be deleted from the users list', { tags: ['SIT-IAM-16'] }, async ({ app, browser, screen, agent }) => {
      await openAs({ app, browser, screen }, TENANT.msp, '/users');

      await agent.act('search the users list for {email} and choose "Delete user" in its row actions menu', { params: owner });

      await agent.assert('a message says the Tenant Owner cannot be deleted and the designation must be transferred first');
    });

    test('the Tenant Owner cannot be disabled from their profile', { tags: ['SIT-IAM-16'] }, async ({ app, browser, screen, agent }) => {
      await openAs({ app, browser, screen }, TENANT.msp, '/users');
      await agent.act("search the users list for {email} and open that person's profile", { params: owner });
      await agent.waitFor('the profile drawer is open');

      await agent.act('choose "Disable user" from the More actions menu');

      await agent.assert('the app says the Tenant Owner cannot be disabled');
    });

    test('the Tenant Owner cannot be given an account end date', { tags: ['SIT-IAM-01', 'SIT-IAM-08'] }, async ({ app, browser, screen, agent }) => {
      await openAs({ app, browser, screen }, TENANT.msp, '/users');
      await agent.act("search the users list for {email}, open that person's profile and click Edit", { params: owner });
      await agent.waitFor('the edit form of the profile is shown');

      await agent.act('turn on "Set an account expiry"');

      await agent.assert('a message says an expiry cannot be set on the Tenant Owner');
    });

    test('a bulk disable warns that the Tenant Owner row will fail', { tags: ['SIT-IAM-16', 'EX-IAM-13.1'] }, async ({ app, browser, screen, agent }) => {
      await openAs({ app, browser, screen }, TENANT.msp, '/users');
      await agent.act('search the users list for {email} and select its checkbox', { params: owner });
      await agent.waitFor('1 user is selected');

      await agent.act('click Disable in the selection bar');

      await agent.assert('the confirmation warns that the Tenant Owner will be blocked and reported as failed');
    });
  });

  describe('disable, enable, delete', { tags: ['SIT-IAM-07', 'BEH-IAM-12', 'P1'] }, () => {
    test('the disable confirmation says sessions end and teams are kept', { tags: ['SIT-IAM-14'] }, async ({ app, browser, screen, agent }) => {
      const user = poolUser('shared');
      await openAs({ app, browser, screen }, TENANT.msp, '/users');

      await agent.act('search the users list for {email} and choose "Disable user" in its row actions menu', { params: { email: unique(user.email) } });

      await agent.assert('the confirmation says active sessions end, team memberships are kept, and the disable can be undone');
    });

    test('a bulk delete reports an outcome for every selected person', { tags: ['EX-IAM-12.1'] }, async ({ app, browser, screen, agent }) => {
      const [a, b] = [poolUser('bulk-a'), poolUser('bulk-b')];
      await openAs({ app, browser, screen }, TENANT.msp, '/users');
      await agent.act('search the users list for {email}, disable that user from the row actions menu and confirm', { params: { email: unique(b.email) } });
      await agent.waitFor('the user is shown as Inactive');
      await agent.act('search the users list for {prefix} and select the checkboxes of {a} and {b}', {
        params: { prefix: unique(a.email.split('-bulk-')[0]), a: unique(a.email), b: unique(b.email) },
      });
      await agent.waitFor('2 users are selected');

      await agent.act('click Delete in the selection bar; if the app first asks to disable active users, choose "Disable and continue"; then type {word}, wait until the Delete button is enabled, click it once and wait until the deletion has finished', { params: { word: 'delete' } });

      await agent.assert('the delete results give an outcome for each of the two selected users');
    });
  });

  test('a disabled person keeps no session', { tags: ['BEH-IAM-05', 'BEH-IAM-12', 'P1'] }, async ({ app, browser, screen, agent }) => {
    const user = poolUser('disabled-sessions');
    await openAs({ app, browser, screen }, TENANT.msp, '/users');
    await agent.act('search the users list for {email}, disable that user from the row actions menu and confirm', { params: { email: unique(user.email) } });
    await agent.waitFor('the user is shown as Inactive');

    await agent.act("open that user's profile and go to the Sessions tab");

    await agent.assert('the person has no active sessions');
  });

  /** Ek hi disposable person pe, is order me: disable → kisne kiya → enable. */
  describe('a disabled person', { serial: true, tags: ['BEH-IAM-12', 'P1'] }, () => {
    test('an admin-disabled person’s record says an admin disabled them', { tags: ['SIT-IAM-15', 'EX-IAM-07.2', 'BEH-IAM-07'] }, async ({ app, browser, screen, agent }) => {
      const user = poolUser('disabled');
      await openAs({ app, browser, screen }, TENANT.msp, '/users');
      await agent.act('search the users list for {email}, disable that user from the row actions menu and confirm', { params: { email: unique(user.email) } });
      await agent.waitFor('the user is shown as Inactive');

      await agent.act("open that user's profile");

      await agent.assert('the profile shows the user is inactive and names who disabled them: the admin {admin}', { params: { admin: 'Test User' } });
    });

    test('enabling a disabled person makes them active again', { tags: ['SIT-IAM-07'] }, async ({ app, browser, screen, agent }) => {
      const user = poolUser('disabled');
      await openAs({ app, browser, screen }, TENANT.msp, '/users');

      await agent.act('search the users list for {email}, enable that user from the row actions menu and confirm', { params: { email: unique(user.email) } });

      await agent.assert('the user {email} is shown as Active', { params: { email: unique(user.email) } });
    });
  });

  /** Ek hi disposable person pe: delete ka lock → delete → wahi email naye insaan ke liye dobara invite. */
  describe('a deleted person', { serial: true, tags: ['SIT-IAM-07', 'BEH-IAM-12', 'P1'] }, () => {
    test('delete stays locked until the word delete is typed', async ({ app, browser, screen, agent }) => {
      const user = poolUser('delete');
      await openAs({ app, browser, screen }, TENANT.msp, '/users');
      await agent.act('search the users list for {email} and choose "Delete user" in its row actions menu; if the app first asks to disable the user, choose "Disable and continue"', {
        params: { email: unique(user.email) },
      });
      await agent.waitFor('a delete confirmation asks to type a word to confirm');

      await agent.act('type {word} in the confirmation box', { params: { word: 'remove' } });

      await agent.assert('the button that would delete the user is disabled');
    });

    test('typing delete removes the person for good', async ({ app, browser, screen, agent }) => {
      const user = poolUser('delete');
      await openAs({ app, browser, screen }, TENANT.msp, '/users');
      await agent.act('search the users list for {email}, choose "Delete user" in its row actions menu; if the app first asks to disable the user, choose "Disable and continue"; then type {word}, click Delete once and wait until the deletion has finished', {
        params: { email: unique(user.email), word: 'delete' },
      });
      await agent.waitFor('a toast says the user was deleted');

      await agent.act('search the users list for {email}', { params: { email: unique(user.email) } });

      await agent.assert('no user with the email {email} is listed', { params: { email: unique(user.email) } });
    });

    test('a deleted person’s email can be invited again as a fresh person', async ({ app, browser, screen, agent }) => {
      const user = poolUser('delete');
      await openAs({ app, browser, screen }, TENANT.msp, '/users');
      await agent.act('open Invite users and choose Invite via email');

      await agent.act('type {email} into the email field and press Enter; if a domain warning appears, tick the box allowing outside users', {
        params: { email: unique(user.email) },
      });

      await agent.assert('the address is accepted for the invitation, with no error saying a member with this email already exists');
    });
  });

  describe('who switched someone off', { tags: ['BEH-IAM-06', 'BEH-IAM-07', 'P1'] }, () => {
    test('moving someone to Manual warns that offboarding them becomes the admins’ job', { tags: ['bug', 'EX-IAM-06.1', 'SIT-IAM-04'] }, async ({ app, browser, screen, agent }) => {
      // Tenant ka akela SCIM-managed user (Meet Dadhania). Test sirf warning dekhta hai — kuch save nahi hota.
      await openAs({ app, browser, screen }, TENANT.msp, '/users');
      await agent.act("search the users list for {email}, open that person's profile and click Edit", { params: { email: 'md@gmail.com' } });
      await agent.waitFor('the edit form of the profile is shown');

      await agent.act(`change the source of truth to Manual. ${STOP}`);

      await agent.assert('a confirmation warns that the directory will no longer switch this person off and that disabling them becomes the admins’ job');
    });
  });

  describe('account end date', { tags: ['BEH-IAM-15', 'SIT-IAM-08', 'P1'] }, () => {
    // Deployed app (20 Nov 2026): "Set an account expiry" disabled — "This field can't be edited here yet."
    test('an account end date shows on the person', { tags: ['bug'] }, async ({ app, browser, screen, agent }) => {
      const user = poolUser('shared');
      const in30Days = new Date(Date.now() + 30 * 86_400_000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      await openAs({ app, browser, screen }, TENANT.msp, '/users');
      await agent.act("search the users list for {email}, open that person's profile and click Edit", { params: { email: unique(user.email) } });
      await agent.waitFor('the edit form of the profile is shown');

      await agent.act('turn on "Set an account expiry", pick 30 days, and save the changes');

      await agent.assert('the profile shows the access ends on {date} instead of Permanent', { params: { date: in30Days } });
    });
  });

  describe('service-account owner guard', { tags: ['BEH-IAM-14', 'SIT-IAM-09', 'P1'] }, () => {
    test('an owner of an active service account cannot be disabled', { tags: ['EX-IAM-14.1'] }, async ({ app, browser, screen, agent }) => {
      // Deployed app (20 Nov 2026): naye user owner picker me nahi aate jab tak unke paas koi role na ho.
      const user = poolUser('sa-owner');
      await openAs({ app, browser, screen }, TENANT.msp, '/users');
      await agent.act("search the users list for {email}, open that person's profile and give them the access profile {profile} with no expiry", {
        params: { email: unique(user.email), profile: 'Testing CSV' },
      });
      await agent.waitFor('the access profile Testing CSV is listed on the profile');
      await agent.act('go to Service accounts in the left navigation');
      await agent.act('create a service account named {name} with the role End User and the organization motadata, with {owner} as its owner', {
        params: { name: unique(`${user.name.replace(/\s+/g, '-').toLowerCase()}-bot`), owner: unique(user.name) },
      });
      await agent.waitFor('the new service account is listed with {owner} as owner', { params: { owner: unique(user.name) } });
      await agent.act('go to Users in the left navigation');

      await agent.act(`search the users list for {email} and choose "Disable user" in its row actions menu. ${STOP}`, { params: { email: unique(user.email) } });

      await agent.assert('a message says the service accounts this user owns must be reassigned or disabled first, and names the service account');
    });
  });
});
