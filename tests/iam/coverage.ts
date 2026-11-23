/**
 * Brief ids (docs/iam/acceptance-brief.md) the IAM suite does not automate, or only partly, and why.
 * `npm run coverage -- iam` fails if a brief id has neither a tagged test nor an entry here.
 * Keep each reason concrete: what is missing (data, permission, infrastructure) — not "hard to test".
 */
export const GAPS: Readonly<Record<string, string>> = {
  // Directory / IdP driven: needs an IdP or AD that the test can drive (SCIM push, LDAP run, JIT on SSO).
  'SIT-IAM-03': 'needs a client organization with its own SSO connection (JIT) and an IdP the test can drive',
  'SIT-IAM-04': 'needs an IdP that pushes SCIM deactivations on demand',
  'SIT-IAM-05': 'needs an Active Directory + collector the test can change',
  'BEH-IAM-07': 'directory-driven disable + 30-day auto-delete need an IdP push and time to pass',
  'BEH-IAM-08': 'needs SSO sign-ins / sync runs to prove a directory never sets access',
  'EX-IAM-06.1': 'only the move-to-Manual warning is automated; the IdP deactivation after it needs SCIM',
  'EX-IAM-07.1': 'needs an IdP to deactivate a SCIM-owned person and 30 days to pass',
  'EX-IAM-08.1': 'needs a JIT-created account and a changed IdP profile',
  'EX-IAM-09.1': 'needs an LDAP run carrying a recycled address with a new directory ID',
  'EX-IAM-14.1': 'only the single-disable guard is automated; the SCIM/LDAP-blocked disable needs a directory',
  'EX-IAM-14.2': 'needs a SCIM-owned owner and an IdP deactivation',

  // SSO-only: turning it on would lock every email-code user (and the next run's OTP login) out of the shared tenant.
  'SIT-IAM-06': 'Require SSO on the shared tenant would lock out email-code sign-in for everyone',
  'BEH-IAM-03': 'Require SSO on the shared tenant would lock out email-code sign-in for everyone',

  // MSP reach: client org "acme" exists, but these need a second, partly-reaching admin or a client-org user
  // who signs in — the suite has one full admin and pool users in the MSP organization only.
  'SIT-IAM-02': 'partly: profile → team/member is automated; per-client reach needs a second admin limited to some clients',
  'BEH-IAM-02': 'needs a user of client org acme who signs in, to prove a sign-in never opens another org',
  'BEH-IAM-16': 'needs a second admin whose reach excludes a client org, to prove its data is invisible',
  'BEH-IAM-18': 'needs a second admin with partial reach over client orgs',
  'EX-IAM-02.1': 'needs a second admin who reaches client org acme only through an access profile, signed in',
  'EX-IAM-05.1': 'needs a second admin signed in while their profile to a client org expires',
  'EX-IAM-18.1': 'needs a second admin with partial reach over client orgs',

  // Custom fields: "Create attribute" is disabled for the test admin (user_attribute.manage).
  'SIT-IAM-13': 'Create attribute is disabled for the test admin; MSP→client fields also need the client-org (acme) view',
  'BEH-IAM-27': 'Create attribute is disabled for the test admin (tests exist, skipped until IAM_ATTRIBUTES_ENABLED=1)',
  'BEH-IAM-28': 'needs MSP fields (Create attribute is disabled) and the client-org (acme) view, not mapped yet',
  'EX-IAM-27.1': 'Create attribute is disabled for the test admin (test exists, skipped until IAM_ATTRIBUTES_ENABLED=1)',

  // Not observable from the console UI.
  'BEH-IAM-04': 'no Tier 3 (fresh email code) action found in the console to exercise',
  'EX-IAM-04.1': 'no Tier 3 (fresh email code) action found in the console to exercise',
  'BEH-IAM-24': 'audit events are not visible in the console UI',
  'EX-IAM-24.1': 'needs the audit service to be made unavailable',
  'BEH-IAM-25': 'lifecycle signals to other modules and notifications are not visible in the console UI',
  'SIT-IAM-15': 'partly: role holders and who-disabled are automated; audit history by date is not in the UI',

  // Partly automated situations: the rest of the story needs time, directories or other modules.
  'SIT-IAM-01': 'partly: invite, domain warning, owner guards; invitation expiry and first sign-in of the invitee are not',
  'SIT-IAM-07': 'partly: disable/enable/delete; reassignment of open work belongs to Tickets/Approvals',
  'SIT-IAM-08': 'partly: expiry indicators; access ending on the date needs time to pass',
  'SIT-IAM-09': 'partly: owner guard and credentials; directory-blocked disables need SCIM/LDAP',
  'SIT-IAM-10': 'partly: import counts/results/re-upload; role column permission gate needs a second admin role',
  'EX-IAM-10.1': 'partly: no role column and disabled-stays-disabled; "admin without role permission" needs a second admin role',
  'SIT-IAM-11': 'partly: profile/role edits on one tenant; reach changes across clients need client orgs',
  'SIT-IAM-14': 'partly: ending sessions; IdP password reset is outside the platform',
  'SIT-IAM-16': 'partly: owner guards; ownership transfer with a fresh code is a Tenant Management flow',
  'BEH-IAM-15': 'partly: expiring indicators and Invited rows; access ending on its date needs time to pass',
  'EX-IAM-15.1': 'needs an assignment whose end date has already passed',
  'BEH-IAM-17': 'needs a person holding one role both directly and through a team',
  'EX-IAM-17.1': 'needs a person holding one role both directly and through a team',
  'BEH-IAM-26': 'setup signs every pool user in for the first time, but no test watches one person go Invited → Active',
};
