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
 * Ek hi CSV (sirf Mailosaur addresses — kisi asli insaan ko kuch nahi jaata), teen tests me ek ke baad ek:
 *   2 naye log (ek ka first name formula `=1+1`), ek maujooda member (pool user, apne hi naam se → updated,
 *   kuch nahi badalta), pehle naye ka duplicate, aur ek galat email. Tenant Owner file me nahi: import maujooda
 *   member ke details badalta hai, to toota guard asli owner ka naam badal deta (coverage.ts → BEH-IAM-13).
 * CSV test ke andar banti hai (pool setup ke baad hi padha ja sakta hai); serial group ki teeno tests ek hi
 * file use karti hain — group retry pe file dobara import hoti hai, to nayi CSV aur naye addresses.
 * Mailosaur domain tenant ke allowed domains (gmail.com) ke bahar hai, isliye "allow outside" on rehta hai.
 * Imported log seedha Active bante hain; baad ka IAM setup unhe delete karta hai.
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
  // people = file ke alag log jo import hote hain: 2 naye + 1 maujooda member; baaki rows import nahi hoti.
  return { file, name: file.split('/').pop()!, total: rows.length - 1, people: 3, fresh, member: member.email };
}

let shared: ReturnType<typeof writeCsv> | undefined;
/** Serial group ki ek hi CSV — pehli baar bulane pe banti hai. */
const groupCsv = () => (shared ??= writeCsv('import'));

const IMPORT = 'import the file {file}: open Invite users, choose Import users, upload it, keep the automatic column mapping, turn on allowing users outside the allowed domains, and finish the import once';

describe('IAM CSV import', { session: IAM_SESSION, tags: ['SIT-IAM-10'], agentContext: IAM_CONTEXT }, () => {
  // Sirf upload aur mapping dekhna — import poora nahi hota.
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

  /** Ek hi CSV (2 naye addresses), is order me: import → wahi file dobara → results file. `sanity` pehle test pe: serial group poora chalta hai. */
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
      await users.disable(csv.fresh); // pehle import ka banaya person

      await users.open();

      await agent.act(IMPORT, { params: { file: unique(csv.file) } });

      // Dobara upload pe sab log pehle se hain: banner "Import of <file> is complete: 3 users were updated and
      // 2 rows were not imported." — pehli baar jude 2 log + maujooda member "updated", koi "invited" nahi.
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
      await expect(invitations.importRow(csv.name).getByTestId('import-download')).toBeEnabled({ timeout: 120_000 }); // Processing khatam

      const download = await browser.waitForDownload(async () => {
        await agent.act('download the results file of the newest import of {file}', { params: { file: unique(csv.name) } });
      });

      const rows = parseCsv(readFileSync(download.absolutePath, 'utf8'));

      const status = (r: Record<string, string>) => `${r['Result: Status']} ${r['Result: Errors']} ${r['Result: Warnings']}`;
      const forEmail = (email: string) => rows.filter((r) => r.email?.toLowerCase() === email.toLowerCase());
      expect(rows).toHaveLength(csv.total); // har input row ka ek outcome
      expect(status(forEmail('not-an-email')[0])).toMatch(/invalid|valid email|format/i);
      expect(forEmail(csv.fresh)).toHaveLength(2);
      expect(status(forEmail(csv.fresh)[1])).toMatch(/duplicate/i);
      expect(status(forEmail(csv.member)[0])).toMatch(/updat|already|existing/i);
      // Koi cell = + - @ se shuru na ho — spreadsheet me khulte hi formula ban jaata.
      const risky = rows.flatMap((r) => Object.values(r)).filter((v) => /^[=+\-@]/.test(v));
      expect(risky).toEqual([]);
    });
  });
});
