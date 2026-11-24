import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { expect, unique } from 'e2e';
import { parseCsv } from '../../lib/csv.ts';
import { describe, test } from './fixtures.ts';
import { IAM_CONTEXT, IAM_SESSION, iamNames, poolUser } from './iam.ts';

const data = iamNames();

/**
 * CSV import: upload → map → job → results file.
 * Brief: SIT-IAM-10 · BEH-IAM-09, 10, 11 · EX-IAM-10.1 (disabled person stays disabled)
 *
 * One CSV (Mailosaur addresses only — nothing reaches a real person), in three tests one after another:
 *   2 new people (one with the formula `=1+1` as first name), one existing member (a pool user, under their
 *   own name → updated, nothing changes), a duplicate of the first new one, and one invalid email. The Tenant
 *   Owner is not in the file: an import changes an existing member's details, so a broken guard would rename
 *   the real owner (coverage.ts → BEH-IAM-13).
 * The CSV is written inside the test (the pool can only be read after setup); the serial group's three tests
 * share one file — on a group retry the file is imported again, so a new CSV and new addresses.
 * The Mailosaur domain is outside the tenant's allowed domains (gmail.com), so "allow outside" stays on.
 * Imported people become Active directly; a later IAM setup deletes them.
 */
function writeCsv(label: string) {
  const fresh = data.address(`${label}-new`);
  const member = poolUser('shared');
  const rows = [
    ['first_name', 'last_name', 'email'],
    ['E2E', `new-${label}`, fresh],
    ['=1+1', `formula-${label}`, data.address(`${label}-formula`)],
    ['E2E', member.name.replace(/^E2E /, ''), member.email],
    ['E2E', `dup-${label}`, fresh],
    ['E2E', `bad-${label}`, 'not-an-email'],
  ];
  mkdirSync('tmp/iam-import', { recursive: true });
  const file = `tmp/iam-import/${data.name(label)}.csv`;
  writeFileSync(file, rows.map((r) => r.join(',')).join('\n') + '\n');
  // people = the distinct people in the file that get imported: 2 new + 1 existing member; the other rows are not imported.
  return { file, name: file.split('/').pop()!, total: rows.length - 1, people: 3, fresh, member: member.email };
}

let shared: ReturnType<typeof writeCsv> | undefined;
/** The serial group's one CSV — written on the first call. */
const groupCsv = () => (shared ??= writeCsv('import'));

const IMPORT = 'import the file {file}: open Invite users, choose Import users, upload it, keep the automatic column mapping, turn on allowing users outside the allowed domains, and finish the import once';

describe('IAM CSV import', { session: IAM_SESSION, tags: ['SIT-IAM-10'], agentContext: IAM_CONTEXT }, () => {
  // Only looks at upload and mapping — the import is not completed.
  test('the MSP import maps an access profile column, not a role column', { tags: ['EX-IAM-10.1', 'P2'] }, async ({ agent, screen, users, invite }) => {
    const csv = writeCsv('columns');
    await users.open();

    await agent.act('open Invite users, choose Import users, upload the file {file} and continue to the column mapping step; stop there', { params: { file: unique(csv.file) } });

    const mapping = screen.getByTestId('map-fields');
    await expect(mapping.getByTestId('map-access_profile')).toBeVisible();
    await expect(mapping.getByRole('combobox', /^Role$/)).toHaveCount(0);
    await agent.assert('the column mapping offers an Access profile field and no Role field, and first name, last name and email are already matched to the file’s columns');
    await invite.cancelImport();
  });

  /** One CSV (2 new addresses), in this order: import → the same file again → results file. `sanity` is on the first test: a serial group runs as a whole. */
  describe('one file', { serial: true }, () => {
    test('the import reports how many rows were invited, updated and not imported', { tags: ['sanity', 'BEH-IAM-10', 'P1'] }, async ({ agent, users, invite }) => {
      const csv = groupCsv();
      await users.open();

      await agent.act(IMPORT, { params: { file: unique(csv.file) } });

      await expect(invite.importBanner(csv.name)).toBeVisible({ timeout: 120_000 });
      await agent.assert('the import-complete message for {file} says how many users were invited, how many were updated, and that {rest} rows were not imported', {
        params: { file: csv.name, rest: String(csv.total - csv.people) },
      });
    });

    test('re-uploading the same file invites nobody twice and keeps a disabled person disabled', { tags: ['BEH-IAM-10', 'EX-IAM-10.1', 'P1'] }, async ({ agent, users, invite }) => {
      const csv = groupCsv();
      await users.open();
      await users.search(csv.fresh);
      await users.disable(csv.fresh); // the person the first import created

      await users.open();

      await agent.act(IMPORT, { params: { file: unique(csv.file) } });

      // On a re-upload everyone already exists: banner "Import of <file> is complete: 3 users were updated and
      // 2 rows were not imported." — the 2 people added the first time + the existing member are "updated", nobody "invited".
      const banner = invite.importBanner(csv.name);
      await expect(banner).toContainText(`${csv.people} users were updated`, { timeout: 120_000 });
      await expect(banner, 'a re-upload must not invite anyone again').not.toContainText('invited');
      await agent.assert('the import-complete message for {file} says {people} users were updated and some rows were not imported, and it does not say that anyone was invited', {
        params: { file: csv.name, people: String(csv.people) },
      });
      await users.search(csv.fresh);
      await expect(users.status(csv.fresh), 'an import updates a disabled person but does not enable them').toHaveText('Inactive');
    });

    test('the results file explains every row and never runs a formula', { tags: ['BEH-IAM-10', 'P1'] }, async ({ agent, browser, users, invitations }) => {
      const csv = groupCsv();
      await users.open();
      await invitations.openImports();
      await expect(invitations.importRow(csv.name).getByTestId('import-download')).toBeEnabled({ timeout: 120_000 }); // Processing has finished

      const download = await browser.waitForDownload(async () => {
        await agent.act('download the results file of the newest import of {file}', { params: { file: unique(csv.name) } });
      });

      const rows = parseCsv(readFileSync(download.absolutePath, 'utf8'));

      const status = (r: Record<string, string>) => `${r['Result: Status']} ${r['Result: Errors']} ${r['Result: Warnings']}`;
      const forEmail = (email: string) => rows.filter((r) => r.email?.toLowerCase() === email.toLowerCase());
      expect(rows).toHaveLength(csv.total); // one outcome per input row
      expect(status(forEmail('not-an-email')[0])).toMatch(/invalid|valid email|format/i);
      expect(forEmail(csv.fresh)).toHaveLength(2);
      expect(status(forEmail(csv.fresh)[1])).toMatch(/duplicate/i);
      expect(status(forEmail(csv.member)[0])).toMatch(/updat|already|existing/i);
      // No cell may start with = + - @ — it would become a formula as soon as a spreadsheet opens it.
      const risky = rows.flatMap((r) => Object.values(r)).filter((v) => /^[=+\-@]/.test(v));
      expect(risky).toEqual([]);
    });
  });
});
