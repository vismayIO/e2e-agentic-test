import { expect, unique } from 'e2e';
import { describe, test } from './fixtures.ts';
import { IAM_CONTEXT, IAM_SESSION, iamNames, poolUser } from './iam.ts';

/**
 * Email invitation: email only, allowed domains, duplicate addresses.
 * Brief: SIT-IAM-01 (steps 3-4) · BEH-IAM-09, 10, 11
 *
 * In every test the agent does the work under test (in the admin's words); the result is checked two ways —
 * first by code (the real state of the screen/list, which waits for loading), then by agent.assert (only
 * what is on screen at that moment).
 *
 * Tenant "motadata" has the allowed domain `gmail.com`, so a Mailosaur address is an outside domain: sending
 * the invite needs the "allow outside" choice. A later IAM setup cancels the invites left behind.
 */
const data = iamNames();

/**
 * For an invite whose correct result is a refusal: the goal does not say "invite" (the agent would take the
 * refusal as its own failure and send again or fail the step) — only fill the form, Send once, and stop at what shows.
 */
const SEND_ONCE = 'type {email} in the invite email field, tick the box that allows users from outside the permitted domains, press Send invite once and stop at whatever the form shows next';

describe('IAM email invitation', { session: IAM_SESSION, agentContext: IAM_CONTEXT }, () => {
  /** On one address, in this order: invite → the same address again. */
  describe('one address', { serial: true }, () => {
    const invitee = data.address('invitee');

    test('inviting by email address alone adds an Invited row', { tags: ['sanity', 'SIT-IAM-01', 'BEH-IAM-15', 'P1'] }, async ({ agent, users }) => {
      await users.open();

      await agent.act('invite {email} by email from Invite users ("Invite via email"), tick the box that allows users from outside the permitted domains, and send the invitation once', {
        params: { email: unique(invitee) },
      });

      await users.open();
      await users.search(invitee);
      await expect(users.status(invitee)).toHaveText('Invited');
      await expect(users.row(invitee).getByTestId('source-chip')).toHaveText('Manual');
      await agent.assert('the users list shows {email} with the status Invited and the source of truth Manual', { params: { email: unique(invitee) } });
    });

    // Deployed app (23 Nov 2026): a second invite to an address with a pending invite is refused — the drawer
    // stays open and the banner says "0 invited · 1 refused: <email> (the email address is already in use)".
    test('a person with a pending invitation is not invited twice', { tags: ['BEH-IAM-10', 'P1'] }, async ({ agent, users, invite }) => {
      await users.open();
      await invite.openEmailForm();

      await agent.act(SEND_ONCE, { params: { email: unique(invitee) } }); // the first test invited this address — still pending

      await expect(invite.banner, 'the pending address should be refused').toContainText('0 invited');
      await expect(invite.banner).toContainText(/refused/);
      await expect(invite.banner).toContainText(invitee);
      await agent.assert('the invite form reports that nobody was invited and that the address {email} was refused', { params: { email: unique(invitee) } });
      await users.open();
      await users.search(invitee);
      await expect(users.row(invitee), 'the person should still have exactly one invitation').toHaveCount(1);
    });
  });

  test('an address outside the allowed domains needs an explicit choice', { tags: ['SIT-IAM-01', 'BEH-IAM-11', 'P1'] }, async ({ agent, users, invite }) => {
    await users.open();
    await invite.openEmailForm();

    await agent.act('type {email} into the invite email field and stop; do not tick any box and do not send', { params: { email: unique(data.address('outside')) } });

    // The warning appears after the server returns the allowed-domain list — wait for it first.
    await expect(invite.domainWarning).toContainText('is not an allowed domain for this organization');
    await expect(invite.send).toBeDisabled();
    await agent.assert('a warning says the domain of the address is not an allowed domain for this organization, a checkbox offers to allow users from outside the permitted domains, and the Send invite button is disabled');
    await invite.allowOutside.check();
    await expect(invite.send).toBeEnabled();
  });

  test('an address on an allowed domain clears the domain warning', { tags: ['SIT-IAM-01', 'BEH-IAM-11', 'P2'] }, async ({ agent, users, invite }) => {
    const inside = `${data.name('inside')}@gmail.com`; // only typed, never sent
    await users.open();
    await invite.openEmailForm();
    await invite.emails.fill(data.address('outside'));
    await expect(invite.domainWarning).toBeVisible();

    await agent.act('replace the address in the invite email field with {email} and stop; do not send', { params: { email: unique(inside) } });

    await expect(invite.emails).toHaveValue(inside);
    await expect(invite.domainWarning).toHaveCount(0);
    await agent.assert('the invite form shows no warning about a domain that is not allowed');
  });

  // A pool user's (Active member's) email, in upper case with spaces — the admin's own email is never sent.
  // 23 Nov 2026: the app refuses it on Send ("already in use") — the earlier (20 Nov) known bug is gone.
  test('an existing member is matched however the email is typed', { tags: ['BEH-IAM-09', 'P1'] }, async ({ agent, users, invite }) => {
    const member = poolUser('shared');
    await users.open();
    await invite.openEmailForm();

    await agent.act(SEND_ONCE, { params: { email: unique(`  ${member.email.toUpperCase()} `) } });

    await expect(invite.banner, 'an existing member should be refused').toContainText(/refused/);
    await expect(invite.banner).toContainText(/already in use|already a member|exists/i);
    await agent.assert('the invite form reports that nobody was invited and that the address was refused because it already belongs to someone');
  });
});
