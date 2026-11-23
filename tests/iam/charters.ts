import { type ModuleCharters, explorerNames } from '../../lib/charters.ts';
import { ADMIN_SESSION } from '../app/auth.ts';
import { IAM_PREFIX } from './iam.ts';

/**
 * IAM ke exploratory charters aur monkey ke create forms (docs/testing.md → "Exploratory, ad-hoc, monkey").
 * Brief: docs/iam/acceptance-brief.md.
 *
 * Har charter ek area + ek posture + ek sentence hai. lib/charters.ts har goal ke aakhir me shared tenant ka
 * niyam jodta hai (jo save ho uska naam `iam-e2e-x-<id>-` se shuru; jo tumne nahi banaya use sirf padhne ke liye kholo),
 * aur yahan ka har charter usi niyam ke andar likha hai:
 *   - explorer / fuzzer sirf apni banayi cheezon pe kaam karte hain, aur har save hone wale naam ka shuru `X` hai;
 *   - skeptic kuch nahi badalta — sirf padhta aur milata hai;
 *   - fuzzer ka matrix prefix ke BAAD ka text hai; jo input prefix nahi le sakta (khaali, 1 character, maujooda
 *     naam) woh sirf likh ke validation padhne ke liye hai, save ke liye nahi.
 * Service account ka owner sirf test user ("E2E …") ho — asli insaan kisi test account ka zimmedaar na bane.
 */

/** Is run ke explorer naam (`iam-e2e-x-<id>-…`) — wahi jo lib/charters.ts ka niyam har goal me likhta hai. */
const run = explorerNames(IAM_PREFIX);
const X = run.name('');
/** Hamare Mailosaur inbox ka address — kisi asli insaan ko mail nahi jaata. */
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
