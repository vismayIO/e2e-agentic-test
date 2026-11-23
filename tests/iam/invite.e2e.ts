import { expect, unique } from 'e2e';
import { describe, test } from './fixtures.ts';
import { IAM_CONTEXT, IAM_SESSION, iamNames, poolUser } from './iam.ts';

/**
 * Email invitation: sirf email, allowed domains, duplicate addresses.
 * Brief: SIT-IAM-01 (steps 3-4) · BEH-IAM-09, 10, 11
 *
 * Har test me jo kaam jaancha jaata hai woh agent karta hai (admin ki zubaan me); nateeja do tarah jaancha
 * jaata hai — pehle code (screen/list ki asli state, jo load hone ka intezaar karta hai), phir agent.assert
 * (sirf woh jo us pal screen pe dikh raha hai).
 *
 * Tenant "motadata" ka allowed domain `gmail.com` hai, isliye Mailosaur address bahar ka domain hai:
 * invite bhejne ke liye "allow outside" choice zaroori hai. Bache invites baad ka IAM setup cancel karta hai.
 */
const data = iamNames();

/**
 * Jis invite ka sahi nateeja inkaar hai: goal "invite karo" nahi kehta (agent inkaar ko apni nakaami maan ke
 * dobara bhejta ya step fail karta) — sirf form bharna, ek baar Send, aur jo dikhe wahin rukna.
 */
const SEND_ONCE = 'type {email} in the invite email field, tick the box that allows users from outside the permitted domains, press Send invite once and stop at whatever the form shows next';

describe('IAM email invitation', { session: IAM_SESSION, agentContext: IAM_CONTEXT }, () => {
  /** Ek hi address pe, is order me: invite → wahi address dobara. */
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

    // Deployed app (23 Nov 2026): pending invite wale address pe dobara invite refuse hota hai — drawer khula
    // rehta hai aur banner kehta hai "0 invited · 1 refused: <email> (the email address is already in use)".
    test('a person with a pending invitation is not invited twice', { tags: ['BEH-IAM-10', 'P1'] }, async ({ agent, users, invite }) => {
      await users.open();
      await invite.openEmailForm();

      await agent.act(SEND_ONCE, { params: { email: unique(invitee) } }); // pehle test ne ise invite kiya hai — abhi pending

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

    // Warning allowed-domain list ke server jawab ke baad aati hai — pehle uska intezaar.
    await expect(invite.domainWarning).toContainText('is not an allowed domain for this organization');
    await expect(invite.send).toBeDisabled();
    await agent.assert('a warning says the domain of the address is not an allowed domain for this organization, a checkbox offers to allow users from outside the permitted domains, and the Send invite button is disabled');
    await invite.allowOutside.check();
    await expect(invite.send).toBeEnabled();
  });

  test('an address on an allowed domain clears the domain warning', { tags: ['SIT-IAM-01', 'BEH-IAM-11', 'P2'] }, async ({ agent, users, invite }) => {
    const inside = `${data.name('inside')}@gmail.com`; // sirf likha jaata hai, bheja nahi
    await users.open();
    await invite.openEmailForm();
    await invite.emails.fill(data.address('outside'));
    await expect(invite.domainWarning).toBeVisible();

    await agent.act('replace the address in the invite email field with {email} and stop; do not send', { params: { email: unique(inside) } });

    await expect(invite.emails).toHaveValue(inside);
    await expect(invite.domainWarning).toHaveCount(0);
    await agent.assert('the invite form shows no warning about a domain that is not allowed');
  });

  // Pool user (Active member) ka email, upper case aur spaces ke saath — admin ka apna email kabhi nahi bhejte.
  // 23 Nov 2026: app ise Send pe refuse karta hai ("already in use") — pehle (20 Nov) ka known bug ab nahi hai.
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
