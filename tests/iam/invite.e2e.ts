import { describe, test } from '@e2e-dev/web';
import { unique } from 'e2e';
import { IAM_ADMIN_EMAIL, IAM_CONTEXT, IAM_SESSION, IAM_SKIP, TENANT, openAs, testAddress } from './support.ts';

/**
 * Email invitation: sirf email, allowed domains, duplicate addresses.
 * Brief: SIT-IAM-01 (steps 3-4) · BEH-IAM-09, 10, 11
 *
 * Tenant "motadata" ka allowed domain `gmail.com` hai, isliye Mailosaur address bahar ka domain hai:
 * invite bhejne ke liye "allow outside" choice zaroori hai. Bache invites agle run ka setup cancel karta hai.
 *
 * serial: pehla test ek address invite karta hai, dusra usi pe dobara invite try karta hai — ek hi email.
 * Baaki tests kisi pe depend nahi karte; jaana-pehchana bug wala test sabse aakhir me, taaki kuch na roke.
 */
describe('IAM email invitation', { skip: IAM_SKIP, session: IAM_SESSION, serial: true, tags: ['iam', 'invite'], agentContext: IAM_CONTEXT }, () => {
  const invitee = testAddress('invitee');

  test('inviting by email address alone adds an Invited row', { tags: ['SIT-IAM-01', 'BEH-IAM-15', 'P1'] }, async ({ app, browser, screen, agent }) => {
    await openAs({ app, browser, screen }, TENANT.msp, '/users');
    await agent.act('open Invite users, choose Invite via email, add the address {email} and tick the box that allows users from outside the permitted domains', {
      params: { email: unique(invitee) },
    });
    await agent.waitFor('the invite form shows the address and its Send invite button is enabled');

    await agent.act('send the invitation, then search the users list for {email}', { params: { email: unique(invitee) } });

    await agent.assert('the users list shows {email} with status Invited', { params: { email: unique(invitee) } });
  });

  // Deployed app (20 Nov 2026): pending invite wale address pe dobara "1 invitation sent" aaya, Pending 1 → 2.
  test('a person with a pending invitation is not invited twice', { tags: ['bug', 'BEH-IAM-10', 'P1'] }, async ({ app, browser, screen, agent }) => {
    await openAs({ app, browser, screen }, TENANT.msp, '/users');
    await agent.act('open Invite users and choose Invite via email');

    await agent.act('type {email} into the email field and press Enter; if a domain warning appears, tick the box allowing outside users', {
      params: { email: unique(invitee) }, // pehle test ne ise invite kiya hai — abhi pending
    });

    await agent.assert('the address is refused because this person already has a pending invitation, and the invite cannot be sent');
  });

  test('an address outside the allowed domains needs an explicit choice', { tags: ['SIT-IAM-01', 'BEH-IAM-11', 'P1'] }, async ({ app, browser, screen, agent }) => {
    await openAs({ app, browser, screen }, TENANT.msp, '/users');
    await agent.act('open Invite users and choose Invite via email');

    await agent.act('add the address {email}', { params: { email: unique(testAddress('outside')) } });

    await agent.assert('a warning says the address is outside the allowed domains, and the invite cannot be sent until the admin ticks the box allowing outside users');
  });

  test('removing the outside address clears the domain warning', { tags: ['SIT-IAM-01', 'BEH-IAM-11', 'P2'] }, async ({ app, browser, screen, agent }) => {
    await openAs({ app, browser, screen }, TENANT.msp, '/users');
    await agent.act('open Invite users and choose Invite via email');
    await agent.act('add the address {email}', { params: { email: unique(testAddress('outside')) } });
    await agent.waitFor('a warning says the address is outside the allowed domains');

    await agent.act('remove the address from the invitation (its chip has a remove control; pressing Backspace in the empty email field also removes the last address)');

    await agent.assert('no domain warning is shown any more');
  });

  // Deployed app (20 Nov 2026): admin ka apna email (kisi bhi case me) existing member nahi pakda gaya, Send enabled.
  test('an existing member is matched however the email is typed', { tags: ['bug', 'BEH-IAM-09', 'P1'] }, async ({ app, browser, screen, agent }) => {
    await openAs({ app, browser, screen }, TENANT.msp, '/users');
    await agent.act('open Invite users and choose Invite via email');

    await agent.act('type {email} into the email field and press Enter; if a domain warning appears, tick the box allowing outside users', {
      params: { email: `  ${IAM_ADMIN_EMAIL.toUpperCase()} ` },
    });

    await agent.assert('the address is refused because a member with this email already exists, and the invite cannot be sent');
  });
});
