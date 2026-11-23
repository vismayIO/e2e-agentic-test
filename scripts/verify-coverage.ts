/**
 * Brief → test traceability for one module.
 *
 *   node scripts/verify-coverage.ts <module>        # e.g. iam  (npm run coverage -- iam)
 *
 * Every id the brief docs/<module>/acceptance-brief.md defines (`### SIT-IAM-01`, `### EX-IAM-12.1`
 * headings and `| BEH-IAM-07 |` table rows — the <KIND>-<MODULE>-<n> shape) must be either tagged on at
 * least one test under tests/<module>/ (`e2e list --reporter json`) or listed in
 * tests/<module>/coverage.ts (`GAPS`) with the reason it is not automated. Fails on: an id with neither,
 * a tag naming an id the brief does not define, and a GAPS entry for an id the brief does not define.
 * An id with tests AND a gap entry is "partial".
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const module = process.argv[2];
if (!module || !/^[a-z][a-z0-9-]*$/.test(module)) throw new Error('usage: node scripts/verify-coverage.ts <module>   (e.g. iam)');
const BRIEF = `docs/${module}/acceptance-brief.md`;
const GAPS_FILE = `tests/${module}/coverage.ts`;
if (!existsSync(BRIEF)) throw new Error(`${BRIEF} nahi mila`);
const { GAPS } = (existsSync(GAPS_FILE) ? await import(pathToFileURL(GAPS_FILE).href) : { GAPS: {} }) as { GAPS: Readonly<Record<string, string>> };

const KEY = module.toUpperCase();
const ID = new RegExp(`^[A-Z]+-${KEY}-\\d+(\\.\\d+)?$`);

// Definitions only: headings and the first column of tables.
const defined = new Set(
  readFileSync(BRIEF, 'utf8').split('\n').flatMap((line) => {
    const m = line.match(new RegExp(`^### ([A-Z]+-${KEY}-[\\d.]+)\\b`)) ?? line.match(new RegExp(`^\\| ([A-Z]+-${KEY}-\\d+) \\|`));
    return m ? [m[1]] : [];
  }),
);

interface Pair { file: string; titlePath: string[]; tags: string[]; disposition: string }
const { pairs } = JSON.parse(
  execFileSync('npx', ['e2e', 'list', '--reporter', 'json'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }),
) as { pairs: Pair[] };

const testsById = new Map<string, Pair[]>();
const unknownTags: string[] = [];
for (const pair of pairs.filter((p) => p.file.startsWith(`tests/${module}/`))) {
  for (const tag of pair.tags.filter((t) => ID.test(t))) {
    if (!defined.has(tag)) unknownTags.push(`${tag} on ${pair.file} › ${pair.titlePath.join(' › ')}`);
    testsById.set(tag, [...(testsById.get(tag) ?? []), pair]);
  }
}

const unknownGaps = Object.keys(GAPS).filter((id) => !defined.has(id));
const rows = [...defined].sort((a, b) => a.localeCompare(b, 'en', { numeric: true })).map((id) => {
  const tests = testsById.get(id) ?? [];
  const runnable = tests.filter((t) => t.disposition === 'run').length;
  const gap = GAPS[id];
  const status = tests.length && gap ? 'partial' : tests.length ? 'covered' : gap ? 'not automated' : 'MISSING';
  return { id, status, tests: tests.length, runnable, gap };
});

for (const r of rows) {
  console.log(`${r.id.padEnd(12)} ${r.status.padEnd(14)} tests ${String(r.tests).padStart(2)} (runnable now ${r.runnable})${r.gap ? `  — ${r.gap}` : ''}`);
}
const count = (s: string) => rows.filter((r) => r.status === s).length;
console.log(`\n${defined.size} brief ids: ${count('covered')} covered, ${count('partial')} partial, ${count('not automated')} not automated, ${count('MISSING')} missing`);

const problems = [
  ...rows.filter((r) => r.status === 'MISSING').map((r) => `${r.id}: no test and no entry in ${GAPS_FILE}`),
  ...unknownTags.map((t) => `unknown brief id in tag: ${t}`),
  ...unknownGaps.map((id) => `${GAPS_FILE} lists ${id}, which the brief does not define`),
];
if (problems.length) {
  console.error(`\n${problems.length} problem(s):\n  ${problems.join('\n  ')}`);
  process.exitCode = 1;
}
