import { expect, unique } from 'e2e';
import { LOGIN_SKIP } from '../app/auth.ts';
import { describe, test } from './fixtures.ts';
import { IAM_CONTEXT, IAM_SESSION, iamNames, poolUser } from './iam.ts';

/**
 * Email invitation: sirf email, allowed domains, duplicate addresses.
 * Brief: SIT-IAM-01 (steps 3-4) · BEH-IAM-09, 10, 11
 *
 * Har test me jo kaam jaancha jaata hai woh agent karta hai (admin ki zubaan me); nateeja do tarah jaancha
 * jaata hai — agent.assert (brief ki har baat) aur code (screen/list ki asli state).
 *
 * Tenant "motadata" ka allowed domain `gmail.com` hai, isliye Mailosaur address bahar ka domain hai:
 * invite bhejne ke liye "allow outside" choice zaroori hai. Bache invites agle run ka setup cancel karta hai.
 *
 * serial: pehla test ek address invite karta hai, baad wala usi pe dobara invite try karta hai. Jaane-pehchaane
 * bug wale tests sabse aakhir me, taaki unka fail hona baaki ko skip na kare.
 */
const data = iamNames();
const INVITE = 'invite {email} by email from Invite users ("Invite via email"), tick the box that allows users from outside the permitted domains, and send the invitation once';

describe('IAM email invitation', { skip: LOGIN_SKIP, session: IAM_SESSION, serial: true, tags: ['iam', 'invite'], agentContext: IAM_CONTEXT }, () => {
  const invitee = data.address('invitee');

  test('inviting by email address alone adds an Invited row', { tags: ['SIT-IAM-01', 'BEH-IAM-15', 'P1'] }, async ({ agent, users }) => {
    await users.open();

    await agent.act(INVITE, { params: { email: unique(invitee) } });

    await agent.assert('the invitation was sent: a confirmation says one invitation was sent, and no error or refused address is shown');
    await users.open();
    await users.search(invitee);
    await expect(users.status(invitee)).toHaveText('Invited');
    await expect(users.row(invitee).getByTestId('source-chip')).toHaveText('Manual');
  });

  test('an address outside the allowed domains needs an explicit choice', { tags: ['SIT-IAM-01', 'BEH-IAM-11', 'P1'] }, async ({ agent, users, invite }) => {
    await users.open();
    await invite.openEmailForm();

    await agent.act('type {email} into the invite email field and stop; do not tick any box and do not send', { params: { email: unique(data.address('outside')) } });

    await agent.assert('a warning names the domain of the address as not allowed for this organization, offers a box to allow users from outside the permitted domains, and the Send invite button is disabled');
    await expect(invite.domainWarning).toContainText('is not an allowed domain for this organization');
    await expect(invite.send).toBeDisabled();
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

    await agent.assert('no warning about domains outside the allowed domains is shown any more');
    await expect(invite.domainWarning).toHaveCount(0);
    await expect(invite.emails).toHaveValue(inside);
  });

  // Deployed app (20 Nov 2026): pending invite wale address pe dobara "1 invitation sent", Pending 1 → 2.
  test('a person with a pending invitation is not invited twice', { tags: ['bug', 'BEH-IAM-10', 'P1'] }, async ({ agent, users, invite }) => {
    await users.open();

    await agent.act(INVITE, { params: { email: unique(invitee) } }); // pehle test ne ise invite kiya hai — abhi pending

    await agent.assert('the address is refused because this person already has a pending invitation, and no new invitation was sent');
    await expect(invite.banner, 'the pending address should be refused').toContainText(/refused/);
    await expect(invite.banner).toContainText(invitee);
  });

  // Pool user (Active member) ka email, upper case aur spaces ke saath — admin ka apna email kabhi nahi bhejte.
  // Deployed app (20 Nov 2026): alag case me likha existing member inline nahi pakda gaya.
  test('an existing member is matched however the email is typed', { tags: ['bug', 'BEH-IAM-09', 'P1'] }, async ({ agent, users, invite }) => {
    const member = poolUser('shared');
    await users.open();

    await agent.act(INVITE, { params: { email: unique(`  ${member.email.toUpperCase()} `) } });

    await agent.assert('the address is refused because a member with this email already exists, even though it was typed in upper case with spaces; no invitation was sent');
    await expect(invite.banner, 'an existing member should be refused').toContainText(/refused/);
    await expect(invite.banner).toContainText(/already in use|already a member|exists/i);
  });
});
