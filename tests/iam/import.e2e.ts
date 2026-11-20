import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, test } from '@e2e-dev/web';
import { expect, unique } from 'e2e';
import { IAM_ADMIN_EMAIL, IAM_CONTEXT, IAM_SESSION, IAM_SKIP, IAM_TENANT_OWNER_EMAIL, RUN_ID, TENANT, openAs, testAddress, type Fx } from './support.ts';

/**
 * CSV import: upload → map → job → results file.
 * Brief: SIT-IAM-10 · BEH-IAM-09, 10, 11, 13
 *
 * Ek hi CSV (sirf Mailosaur addresses — kisi asli insaan ko invite nahi jaata), teen tests me ek ke baad ek:
 *   2 naye log (ek ka first name formula `=1+1`), admin khud (already a member → updated),
 *   pehle naye ka duplicate, ek galat email, aur (set ho to) Tenant Owner.
 * Mailosaur domain tenant ke allowed domains (gmail.com) ke bahar hai, isliye "allow outside" on rehta hai.
 * Bane invites agle run ka setup cancel karta hai.
 */
const IMPORT_CONTEXT = `${IAM_CONTEXT} To import, click the "Invite users" button in the Users page header, then choose "Import users": upload a CSV, map the columns, then finish. ("Invitations & imports" only lists past imports.)`;

function writeCsv(label: string) {
  const fresh = testAddress(`${label}-new`);
  const rows = [
    ['first_name', 'last_name', 'email'],
    ['E2E', `new-${RUN_ID}`, fresh],
    ['=1+1', `formula-${RUN_ID}`, testAddress(`${label}-formula`)],
    ['Test', 'User', IAM_ADMIN_EMAIL],
    ['E2E', `dup-${RUN_ID}`, fresh],
    ['E2E', `bad-${RUN_ID}`, 'not-an-email'],
    ...(IAM_TENANT_OWNER_EMAIL ? [['Tenant', 'Owner', IAM_TENANT_OWNER_EMAIL]] : []),
  ];
  mkdirSync('tmp/iam-import', { recursive: true });
  const file = `tmp/iam-import/iam-e2e-${RUN_ID}-${label}.csv`;
  writeFileSync(file, rows.map((r) => r.join(',')).join('\n') + '\n');
  return { file, name: file.split('/').pop()!, total: rows.length - 1, fresh };
}

async function importCsv({ agent }: Pick<Fx, 'agent'>, file: string) {
  await agent.act('open Invite users, choose Import users, upload the file {file} and continue to the column mapping', { params: { file: unique(file) } });
  await agent.waitFor('the column mapping step is shown');
  await agent.act('map first name, last name and email to the first_name, last_name and email columns, allow users outside the allowed domains, and finish the import');
}

describe('IAM CSV import', { skip: IAM_SKIP, session: IAM_SESSION, tags: ['iam', 'import', 'SIT-IAM-10'], agentContext: IMPORT_CONTEXT }, () => {
  // Column mapping dekhna — sirf upload, import poora nahi hota, koi invite nahi.
  test('the MSP import maps an access profile column, not a role column', { tags: ['P2'] }, async ({ app, browser, screen, agent }) => {
    const csv = writeCsv('columns');
    await openAs({ app, browser, screen }, TENANT.msp, '/users');

    await agent.act('open Invite users, choose Import users, upload the file {file} and continue to the column mapping', { params: { file: unique(csv.file) } });

    await agent.assert('the column mapping offers an access profile column and no role column');
  });

  /** Ek hi CSV (2 naye addresses), is order me: import → wahi file dobara → results file. */
  describe('one file', { serial: true }, () => {
    const csv = writeCsv('import');

    test('the import reports how many rows were invited, updated and not imported', { tags: ['BEH-IAM-10', 'P1'] }, async ({ app, browser, screen, agent }) => {
      await openAs({ app, browser, screen }, TENANT.msp, '/users');

      await importCsv({ agent }, csv.file);

      await agent.waitFor('the import of {name} has finished', { params: { name: unique(csv.name) }, timeout: 120_000 });
      await agent.assert('the import result says 2 users were invited, 1 was updated, and {rest} rows were not imported', {
        params: { rest: String(csv.total - 3) },
      });
    });

    test('re-uploading the same file invites nobody twice', { tags: ['BEH-IAM-10', 'P1'] }, async ({ app, browser, screen, agent }) => {
      await openAs({ app, browser, screen }, TENANT.msp, '/users');

      await importCsv({ agent }, csv.file);

      await agent.waitFor('a result for the import of {name} is shown', { params: { name: unique(csv.name) }, timeout: 120_000 });
      await agent.assert('the latest import result says no users were invited; the rows invited the first time are counted as updated instead');
    });

    test('the results file explains every row and never runs a formula', { tags: ['BEH-IAM-10', 'BEH-IAM-13', 'P1'] }, async ({ app, browser, screen, agent }) => {
      await openAs({ app, browser, screen }, TENANT.msp, '/users');
      await agent.act('open Invitations & imports, go to the Imports tab and find the import of {name}', { params: { name: unique(csv.name) } });

      const download = await browser.waitForDownload(async () => {
        await agent.act('download the results file of the import {name}', { params: { name: unique(csv.name) } });
      });

      const lines = readFileSync(download.absolutePath, 'utf8').trim().split(/\r?\n/);
      const rowFor = (needle: string) => lines.filter((l) => l.toLowerCase().includes(needle.toLowerCase()));
      expect(lines).toHaveLength(csv.total + 1); // header + har row ka ek outcome
      expect(rowFor('not-an-email')[0]).toMatch(/invalid|format/i);
      expect(rowFor(csv.fresh)).toHaveLength(2);
      expect(rowFor(csv.fresh).some((l) => /duplicate/i.test(l))).toBe(true);
      expect(rowFor(IAM_ADMIN_EMAIL)[0]).toMatch(/updat|already/i);
      if (IAM_TENANT_OWNER_EMAIL) expect(rowFor(IAM_TENANT_OWNER_EMAIL)[0]).toMatch(/tenant owner/i);
      // Koi cell = + - @ se shuru na ho (spreadsheet me formula ban jaata)
      expect(lines.slice(1).every((l) => !/(^|,)"?[=+\-@]/.test(l))).toBe(true);
    });
  });
});
