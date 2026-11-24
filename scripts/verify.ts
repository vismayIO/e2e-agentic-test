/**
 * Suite hygiene — without the app, without a model. The same rules for every module; a new module needs no shared change.
 *
 *   node scripts/verify.ts            # all modules   (npm run verify)
 *   node scripts/verify.ts iam        # only these module(s)
 *
 * Takes every test from `e2e list --reporter json` (it counts tests, it does not open the app) and checks:
 *   tags     — only lib/suites.ts tags or an id from some module's brief; exactly one priority per test; a smoke
 *              test has no `bug` and either no session or the light `admin` one; a `bug` test is not in a serial group.
 *   smoke    — at least one `smoke` test per module (otherwise that module is outside the smoke gate).
 *   brief    — every id in docs/<module>/acceptance-brief.md is a tag on some test (of any module), or is in
 *              tests/<module>/coverage.ts (`GAPS`) with a reason; both = "partial". An id in GAPS that is not
 *              in the brief is a problem.
 *   charters — tests/<module>/charters.ts: ids unique and slug-shaped, persona from lib/charters.ts, maxSteps 1–100,
 *              goal starts with "Starting at /"; every monkey form's route starts with "/" and its form is not
 *              empty; the final goal of every charter and every possible monkey charter is within e2e's limit.
 *   scripts  — a shortcut in package.json for every runnable name in lib/suites.ts.
 * Problems are printed by group; one or more → exit 1 (2 on an unknown module). Strategy: docs/testing.md.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { PERSONAS, charters, moduleCharters, monkeyCharters } from '../lib/charters.ts';
import { moduleFile, modules, resolveModules } from '../lib/modules.ts';
import { BUG, PRIORITIES, RUNNABLE, SANITY, SMOKE } from '../lib/suites.ts';
import { ADMIN_SESSION } from '../tests/app/auth.ts';

/** One test-target pair from `e2e list --reporter json` (e2e docs: reference/cli → e2e list). */
interface Pair {
  file: string;
  titlePath: string[];
  kind: 'test' | 'setup';
  tags: string[];
  session?: string;
  /** Only on tests in a serial group. */
  serialId?: string;
  disposition: 'run' | 'skip' | 'filtered';
}

const FIXED_TAGS: readonly string[] = [SMOKE, SANITY, BUG, ...PRIORITIES];
/** e2e docs (reference/runner): "goal is at most 2,000 characters". */
const GOAL_LIMIT = 2000;
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * The brief id convention — this one regular expression (docs/testing.md → "Tags"):
 * id = <KIND>-<MODULE FOLDER NAME, UPPER CASE>-<n>[.<n>] (SIT-IAM-01, EX-IAM-07.2), and its definition is the
 * line in docs/<module>/acceptance-brief.md that is a `### <id>` heading or has it as a table row's first cell (`| <id> |`).
 */
const briefIdLine = (module: string) => new RegExp(`^(?:### |\\| )([A-Z]+-${module.toUpperCase()}-\\d+(?:\\.\\d+)?)(?= |$)`, 'gm');
const briefPath = (module: string) => `docs/${module}/acceptance-brief.md`;

const name = (p: Pair) => `${p.file} › ${p.titlePath.join(' › ')}`;

/** The ids defined in the module's brief; none when there is no brief. */
function briefIds(module: string): Set<string> {
  const brief = briefPath(module);
  return new Set(existsSync(brief) ? [...readFileSync(brief, 'utf8').matchAll(briefIdLine(module))].map((m) => m[1]) : []);
}

function checkTags(pairs: readonly Pair[], validIds: ReadonlySet<string>): string[] {
  return pairs.flatMap((p) => {
    const unknown = p.tags.filter((t) => !FIXED_TAGS.includes(t) && !validIds.has(t));
    const priorities = p.tags.filter((t) => (PRIORITIES as readonly string[]).includes(t));
    const smoke = p.tags.includes(SMOKE);
    const bug = p.tags.includes(BUG);
    return [
      ...unknown.map((t) => `tag: unknown tag "${t}" (neither a lib/suites.ts tag nor an id from a brief) — ${name(p)}`),
      ...(p.kind === 'test' && priorities.length !== 1
        ? [`tag: exactly one priority (${PRIORITIES.join(' / ')}) is needed, found ${priorities.length} — ${name(p)}`]
        : []),
      ...(smoke && bug ? [`tag: a smoke test cannot have \`${BUG}\` — ${name(p)}`] : []),
      ...(smoke && p.session !== undefined && p.session !== ADMIN_SESSION
        ? [`tag: smoke test is on session "${p.session}"; smoke runs with no session or on the light "${ADMIN_SESSION}" session — ${name(p)}`]
        : []),
      // A serial group runs whole when any member is selected: the smoke gate would also run its untagged tests.
      ...(smoke && p.serialId !== undefined
        ? [`tag: smoke test is in a serial group; \`--tag ${SMOKE}\` runs every test of that group — write it outside the group: ${name(p)}`]
        : []),
    ];
  });
}

/** Brief → test traceability: prints the per-id table and summary, returns the problems. `pairs` = the tests of all modules. */
async function checkBrief(module: string, defined: ReadonlySet<string>, pairs: readonly Pair[]): Promise<string[]> {
  const brief = briefPath(module);
  const gapsFile = moduleFile(module, 'coverage.ts');
  const gaps = gapsFile ? ((await import(pathToFileURL(gapsFile).href)) as { GAPS: Readonly<Record<string, string>> }).GAPS : {};

  const rows = [...defined].sort((a, b) => a.localeCompare(b, 'en', { numeric: true })).map((id) => {
    const tests = pairs.filter((p) => p.tags.includes(id));
    const gap = gaps[id];
    const status = tests.length && gap ? 'partial' : tests.length ? 'covered' : gap ? 'not automated' : 'MISSING';
    return { id, status, tests: tests.length, runnable: tests.filter((t) => t.disposition === 'run').length, gap };
  });
  if (rows.length) {
    console.log(`\n${module} — ${brief}`);
    for (const r of rows) {
      console.log(`${r.id.padEnd(12)} ${r.status.padEnd(14)} tests ${String(r.tests).padStart(2)}${r.tests ? ` (${r.runnable ? `runnable now ${r.runnable}` : 'skipped here'})` : ''}${r.gap ? `  — ${r.gap}` : ''}`);
    }
    const count = (s: string) => rows.filter((r) => r.status === s).length;
    console.log(`\n${rows.length} brief ids: ${count('covered')} covered, ${count('partial')} partial, ${count('not automated')} not automated, ${count('MISSING')} missing`);
  }

  return [
    ...(existsSync(brief) && !defined.size
      ? [`brief: no id found in ${brief} — an id is <KIND>-${module.toUpperCase()}-<n>[.<n>], in a \`### <id>\` heading or the first cell of a table row`]
      : []),
    ...rows.filter((r) => r.status === 'MISSING').map((r) => `brief: ${r.id} has neither a test nor a reason in tests/${module}/coverage.ts (GAPS)`),
    ...Object.keys(gaps).filter((id) => !defined.has(id)).map((id) => `brief: ${gapsFile} has ${id}, which is not in ${brief}`),
  ];
}

async function checkCharters(module: string): Promise<string[]> {
  const written = await moduleCharters(module);
  if (!written) return [];
  const ids = written.charters.map((c) => c.id);
  // Count = all forms, so the pick includes every form: the final goal of every possible monkey charter (seed and steps do not matter here).
  const everyMonkey = await monkeyCharters([module], written.monkey.length, 0, 1);
  return [
    ...ids.filter((id) => !SLUG.test(id)).map((id) => `charter: id "${id}" is not a slug (a-z, 0-9, -)`),
    ...[...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))].map((id) => `charter: id "${id}" appears more than once`),
    ...written.charters.flatMap((c) => [
      ...((PERSONAS as readonly string[]).includes(c.persona) ? [] : [`charter: ${c.id} has persona "${c.persona}", which does not exist — ${PERSONAS.join(' / ')}`]),
      ...(c.maxSteps === undefined || (Number.isInteger(c.maxSteps) && c.maxSteps >= 1 && c.maxSteps <= 100)
        ? []
        : [`charter: ${c.id} has maxSteps ${c.maxSteps}; it must be a whole number from 1 to 100`]),
      ...(c.goal.startsWith('Starting at /') ? [] : [`charter: the goal of ${c.id} does not start with "Starting at /<route>, …"`]),
    ]),
    ...written.monkey.flatMap((f) => [
      ...(f.route.startsWith('/') ? [] : [`charter: monkey route "${f.route}" does not start with "/"`]),
      ...(f.form.trim() ? [] : [`charter: the form of monkey route "${f.route}" is empty`]),
    ]),
    ...[...(await charters([module])), ...everyMonkey]
      .filter((c) => c.goal.length > GOAL_LIMIT)
      .map((c) => `charter: the goal of ${c.id} is ${c.goal.length} characters (including the rules sentence); e2e's limit is ${GOAL_LIMIT}`),
  ];
}

/** package.json: a shortcut for every runnable name (except nightly-only ones), so the docs' `npm run <name>` always works. */
function checkScripts(): string[] {
  const { scripts } = JSON.parse(readFileSync('package.json', 'utf8')) as { scripts: Record<string, string> };
  return RUNNABLE.flatMap((suite) => {
    const want = `node scripts/suite.ts ${suite}`;
    return scripts[suite] === want ? [] : [`scripts.${suite} should be "${want}", now it ${scripts[suite] === undefined ? 'does not exist' : `is "${scripts[suite]}"`}`];
  });
}

let mods: string[];
try {
  mods = resolveModules(process.argv.slice(2));
} catch (err) {
  console.error((err as Error).message);
  process.exit(2);
}

// Always all tests: a brief id may also be on another module's test.
const listed = spawnSync('npx', ['e2e', 'list', '--reporter', 'json'], {
  encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'inherit'],
});
// Config or collection error: e2e has printed it above, and that is this check's result.
if (listed.status !== 0) process.exit(listed.status ?? 1);
const { pairs } = JSON.parse(listed.stdout) as { pairs: Pair[] };

const known = modules();
const briefs = new Map(known.map((module) => [module, briefIds(module)]));
const validIds = new Set([...briefs.values()].flatMap((ids) => [...ids]));

const problems = new Map<string, string[]>();
for (const module of mods) {
  const own = pairs.filter((p) => p.file.startsWith(`tests/${module}/`));
  problems.set(module, [
    ...checkTags(own, validIds),
    ...(own.some((p) => p.kind === 'test' && p.tags.includes(SMOKE)) ? [] : [`smoke: the module has no \`${SMOKE}\` test — write tests/${module}/smoke.e2e.ts`]),
    ...(await checkBrief(module, briefs.get(module)!, pairs)),
    ...(await checkCharters(module)),
  ]);
}
// A test file outside a module folder is in no suite's module path, and would also escape the checks above.
const stray = [...new Set(pairs.map((p) => p.file))].filter((file) => !known.some((m) => file.startsWith(`tests/${m}/`)));
problems.set('outside a module', stray.map((file) => `${file} is not in a module folder (tests/<module>/)`));
problems.set('package.json', checkScripts());

const total = [...problems.values()].reduce((n, list) => n + list.length, 0);
if (total) {
  console.log(`\n${total} problem(s):`);
  for (const [group, list] of problems) {
    if (list.length) console.log(`\n${group} (${list.length})\n  ${list.join('\n  ')}`);
  }
  process.exitCode = 1;
} else {
  console.log(`\nverify: ${mods.join(', ')} — ${pairs.length} tests, all good`);
}
