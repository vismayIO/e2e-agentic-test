import { type ModuleCharters, explorerNames } from '../../lib/charters.ts';
import { ADMIN_SESSION } from '../app/auth.ts';
import { IAM_PREFIX } from './iam.ts';

/**
 * IAM's exploratory charters and the create forms for monkey (docs/testing.md → "Exploratory, ad-hoc, monkey").
 * Brief: docs/iam/acceptance-brief.md.
 *
 * Each charter is one area + one posture + one sentence. lib/charters.ts appends the shared tenant's rule to
 * every goal (anything saved has a name starting with `iam-e2e-x-<id>-`; open what you did not create only to read it),
 * and every charter here is written inside that rule:
 *   - explorer / fuzzer work only on things they created, and every saved name starts with `X`;
 *   - skeptic changes nothing — it only reads and compares;
 *   - the fuzzer's matrix is the text AFTER the prefix; an input that cannot take the prefix (empty, 1 character,
 *     an existing name) is only typed to read the validation, never saved.
 * A service account's owner must be a test user ("E2E …") only — no real person becomes responsible for a test account.
 */

/** This run's explorer names (`iam-e2e-x-<id>-…`) — the same ones the lib/charters.ts rule writes into every goal. */
const run = explorerNames(IAM_PREFIX);
const X = run.name('');
/** An address in our Mailosaur inbox — no mail goes to a real person. */
const invitee = run.address('invitee');

export default {
  session: ADMIN_SESSION,
  prefix: IAM_PREFIX,
  monkey: [
    { route: '/users', form: 'the "Invite via email" form under "Invite users"' },
    { route: '/roles', form: 'the "Create role" form' },
    { route: '/access-profiles', form: 'the "Create access profile" form' },
    { route: '/service-accounts', form: 'the "Create service account" form' },
  ],
  charters: [
    {
      id: 'invite-journey',
      persona: 'explorer',
      goal: `Starting at /users, invite the address ${invitee} by email like a first-time admin (allow users from outside the permitted domains for this invite; invite no other address), then follow that one invitation in the users list, the Pending invites tile and the "Invitations & imports" drawer; report anything confusing, broken or inconsistent.`,
    },
    {
      id: 'access-state',
      persona: 'explorer',
      goal: `Starting at /roles, create a custom role named "${X}role" with one permission, then on /access-profiles create an access profile named "${X}profile" that carries that role for the MSP owner organization, reloading the page and going back after each step; report state that is lost, stale or different after a reload.`,
    },
    {
      id: 'service-account-errors',
      persona: 'explorer',
      goal: `Starting at /service-accounts, open "Create service account" and, using the name "${X}bot" whenever a name is filled in and, as its owner, only a person whose name starts with "E2E " (a test user; if none is offered, cancel and report that), try to create an account without a name, then without an owner, then without a role, cancel a half-filled form, then pick an admin-tier role, press create and cancel the confirmation that follows, create the account with a role that needs no such confirmation instead, and on that account try to add a credential without a name; report errors that are missing, misleading or leak technical detail.`,
    },
    {
      id: 'users-numbers',
      persona: 'skeptic',
      goal: 'Starting at /users, without changing anything and without opening any person, compare the summary tiles (total, active, pending invites) with the status filter results and the pagination total, and check that the rows shown under each status filter and each sort order carry that status and follow that order; report every count, status or date that disagrees.',
    },
    {
      id: 'access-numbers',
      persona: 'skeptic',
      goal: 'Starting at /roles, without changing anything and without opening any role or access profile, compare the summary tiles (total, built-in and custom, assigned and unused) with the type filter results and the rows of the table, then on /access-profiles compare the status filter results with the rows of that table; report every count or status that disagrees.',
    },
    {
      id: 'service-account-numbers',
      persona: 'skeptic',
      goal: 'Starting at /service-accounts, without changing anything and without opening any service account, compare the status and organization filter results with the rows of the table, and read the status, credential count, owner, role and organization access of every listed row; report every count that disagrees and every value that stays unresolved, such as a dash or a bare number where a name belongs.',
    },
    {
      id: 'role-inputs',
      persona: 'fuzzer',
      goal: `Starting at /roles, open "Create role" and run this matrix on the role name, judging each entry before the next: first, typed only and never saved, an empty name, a single character, a name with leading spaces and the name of a role already in the list; then, each saved as its own role with one permission, "${X}" followed by unicode and emoji, by <b>x</b>, by trailing spaces, and by padding to 300 characters in total together with a 300-character description, and last the name of a role you just saved a second time; report validation that is missing or wrong and any saved name that the roles list shows differently from what was typed.`,
    },
    {
      id: 'profile-inputs',
      persona: 'fuzzer',
      goal: `Starting at /access-profiles, open "Create access profile" and run this matrix on the profile name, judging each entry before the next: "${X}" followed by unicode and emoji, by <b>x</b>, by trailing spaces, by padding to exactly 100 characters in total, and by padding to 101 characters, each submitted once with no role and no organization chosen and once with a role and the MSP owner organization, and last the name of a profile you just created a second time; report validation that is missing or wrong and any created name that the list shows differently from what was typed.`,
    },
  ],
} satisfies ModuleCharters;
