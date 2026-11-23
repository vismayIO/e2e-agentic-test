/**
 * Suite ki safai — app ke bina, model ke bina. Har module pe wahi niyam; naya module koi shared badlav nahi maangta.
 *
 *   node scripts/verify.ts            # sab modules   (npm run verify)
 *   node scripts/verify.ts iam        # sirf yeh module(s)
 *
 * `e2e list --reporter json` (tests ginta hai, app nahi kholta) se sab tests leke:
 *   tags     — sirf lib/suites.ts ke tags ya kisi module ke brief ka id; har test pe theek ek priority; smoke test
 *              pe `bug` nahi aur session ya to koi nahi ya halka `admin`; `bug` test serial group me nahi.
 *   smoke    — har module me kam se kam ek `smoke` test (warna woh module smoke gate ke bahar hai).
 *   brief    — docs/<module>/acceptance-brief.md ka har id kisi test pe tag ho (kisi bhi module ke), ya
 *              tests/<module>/coverage.ts (`GAPS`) me wajah ke saath ho; dono = "partial". GAPS me aisa id jo
 *              brief me nahi, galti hai.
 *   charters — tests/<module>/charters.ts: ids alag aur slug jaise, persona lib/charters.ts ka, maxSteps 1–100,
 *              goal "Starting at /" se shuru; har monkey form ka route "/" se shuru aur form khaali nahi; har
 *              charter aur har mumkin monkey charter ka aakhri goal e2e ki seema ke andar.
 *   scripts  — package.json me lib/suites.ts ke har runnable naam ka shortcut.
 * Galtiyan group ke hisaab se chhapti hain; ek bhi ho to exit 1 (anjaan module pe 2). Strategy: docs/testing.md.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { PERSONAS, charters, moduleCharters, monkeyCharters } from '../lib/charters.ts';
import { moduleFile, modules, resolveModules } from '../lib/modules.ts';
import { BUG, PRIORITIES, RUNNABLE, SANITY, SMOKE } from '../lib/suites.ts';
import { ADMIN_SESSION } from '../tests/app/auth.ts';

/** `e2e list --reporter json` ka ek test-target pair (e2e docs: reference/cli → e2e list). */
interface Pair {
  file: string;
  titlePath: string[];
  kind: 'test' | 'setup';
  tags: string[];
  session?: string;
  /** Sirf serial group ke tests pe. */
  serialId?: string;
  disposition: 'run' | 'skip' | 'filtered';
}

const FIXED_TAGS: readonly string[] = [SMOKE, SANITY, BUG, ...PRIORITIES];
/** e2e docs (reference/runner): "goal is at most 2,000 characters". */
const GOAL_LIMIT = 2000;
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * Brief id ka convention — yahi ek regular expression (docs/testing.md → "Tags"):
 * id = <KIND>-<MODULE FOLDER KA NAAM, UPPER CASE>-<n>[.<n>] (SIT-IAM-01, EX-IAM-07.2), aur uski definition
 * docs/<module>/acceptance-brief.md ki woh line hai jo `### <id>` heading ya table row ka pehla cell (`| <id> |`) ho.
 */
const briefIdLine = (module: string) => new RegExp(`^(?:### |\\| )([A-Z]+-${module.toUpperCase()}-\\d+(?:\\.\\d+)?)(?= |$)`, 'gm');
const briefPath = (module: string) => `docs/${module}/acceptance-brief.md`;

const name = (p: Pair) => `${p.file} › ${p.titlePath.join(' › ')}`;

/** Module ke brief me define hue ids; brief na ho to koi nahi. */
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
      ...unknown.map((t) => `tag: anjaan tag "${t}" (na lib/suites.ts ka tag, na kisi brief ka id) — ${name(p)}`),
      ...(p.kind === 'test' && priorities.length !== 1
        ? [`tag: theek ek priority (${PRIORITIES.join(' / ')}) chahiye, ${priorities.length} hain — ${name(p)}`]
        : []),
      ...(smoke && bug ? [`tag: smoke test pe \`${BUG}\` nahi ho sakta — ${name(p)}`] : []),
      ...(smoke && p.session !== undefined && p.session !== ADMIN_SESSION
        ? [`tag: smoke test session "${p.session}" pe hai; smoke bina session ya halke "${ADMIN_SESSION}" session pe chalta hai — ${name(p)}`]
        : []),
      // Serial group poora chalta hai jab uska koi bhi member chuna jaaye: smoke ka gate bina tag wale tests bhi chalata.
      ...(smoke && p.serialId !== undefined
        ? [`tag: smoke test serial group me hai; \`--tag ${SMOKE}\` us group ke saare tests chala deta hai — group se bahar likho: ${name(p)}`]
        : []),
    ];
  });
}

/** Brief → test traceability: per-id table aur summary chhapta hai, galtiyan lautaata hai. `pairs` = sab modules ke tests. */
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
      console.log(`${r.id.padEnd(12)} ${r.status.padEnd(14)} tests ${String(r.tests).padStart(2)}${r.tests ? ` (${r.runnable ? `runnable now ${r.runnable}` : 'yahan skipped'})` : ''}${r.gap ? `  — ${r.gap}` : ''}`);
    }
    const count = (s: string) => rows.filter((r) => r.status === s).length;
    console.log(`\n${rows.length} brief ids: ${count('covered')} covered, ${count('partial')} partial, ${count('not automated')} not automated, ${count('MISSING')} missing`);
  }

  return [
    ...(existsSync(brief) && !defined.size
      ? [`brief: ${brief} me koi id nahi mila — id <KIND>-${module.toUpperCase()}-<n>[.<n>] hota hai, \`### <id>\` heading ya table row ke pehle cell me`]
      : []),
    ...rows.filter((r) => r.status === 'MISSING').map((r) => `brief: ${r.id} ka na koi test hai, na tests/${module}/coverage.ts (GAPS) me wajah`),
    ...Object.keys(gaps).filter((id) => !defined.has(id)).map((id) => `brief: ${gapsFile} me ${id} hai, jo ${brief} me nahi hai`),
  ];
}

async function checkCharters(module: string): Promise<string[]> {
  const written = await moduleCharters(module);
  if (!written) return [];
  const ids = written.charters.map((c) => c.id);
  // Count = sab forms, to chunaav me har form aata hai: har mumkin monkey charter ka aakhri goal (seed aur steps yahan maayne nahi rakhte).
  const everyMonkey = await monkeyCharters([module], written.monkey.length, 0, 1);
  return [
    ...ids.filter((id) => !SLUG.test(id)).map((id) => `charter: id "${id}" slug nahi hai (a-z, 0-9, -)`),
    ...[...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))].map((id) => `charter: id "${id}" ek se zyada baar hai`),
    ...written.charters.flatMap((c) => [
      ...((PERSONAS as readonly string[]).includes(c.persona) ? [] : [`charter: ${c.id} ka persona "${c.persona}" nahi hai — ${PERSONAS.join(' / ')}`]),
      ...(c.maxSteps === undefined || (Number.isInteger(c.maxSteps) && c.maxSteps >= 1 && c.maxSteps <= 100)
        ? []
        : [`charter: ${c.id} ka maxSteps ${c.maxSteps} hai; 1 se 100 ka poora number chahiye`]),
      ...(c.goal.startsWith('Starting at /') ? [] : [`charter: ${c.id} ka goal "Starting at /<route>, …" se shuru nahi hota`]),
    ]),
    ...written.monkey.flatMap((f) => [
      ...(f.route.startsWith('/') ? [] : [`charter: monkey route "${f.route}" "/" se shuru nahi hota`]),
      ...(f.form.trim() ? [] : [`charter: monkey route "${f.route}" ka form khaali hai`]),
    ]),
    ...[...(await charters([module])), ...everyMonkey]
      .filter((c) => c.goal.length > GOAL_LIMIT)
      .map((c) => `charter: ${c.id} ka goal ${c.goal.length} characters ka hai (rules sentence samet); e2e ki seema ${GOAL_LIMIT}`),
  ];
}

/** package.json: har runnable naam (nightly-only chhod ke) ka shortcut, taaki docs ka `npm run <naam>` hamesha chale. */
function checkScripts(): string[] {
  const { scripts } = JSON.parse(readFileSync('package.json', 'utf8')) as { scripts: Record<string, string> };
  return RUNNABLE.flatMap((suite) => {
    const want = `node scripts/suite.ts ${suite}`;
    return scripts[suite] === want ? [] : [`scripts.${suite} "${want}" hona chahiye, abhi ${scripts[suite] === undefined ? 'hai hi nahi' : `"${scripts[suite]}" hai`}`];
  });
}

let mods: string[];
try {
  mods = resolveModules(process.argv.slice(2));
} catch (err) {
  console.error((err as Error).message);
  process.exit(2);
}

// Hamesha sab tests: brief ka id kisi doosre module ke test pe bhi ho sakta hai.
const listed = spawnSync('npx', ['e2e', 'list', '--reporter', 'json'], {
  encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'inherit'],
});
// Config ya collection error: e2e ne use upar chhaap diya hai, wahi is check ka nateeja hai.
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
    ...(own.some((p) => p.kind === 'test' && p.tags.includes(SMOKE)) ? [] : [`smoke: module me koi \`${SMOKE}\` test nahi hai — tests/${module}/smoke.e2e.ts likho`]),
    ...(await checkBrief(module, briefs.get(module)!, pairs)),
    ...(await checkCharters(module)),
  ]);
}
// Module folder ke bahar ki test file kisi suite ke module path me nahi aati, aur upar ke checks se bhi bach jaati.
const stray = [...new Set(pairs.map((p) => p.file))].filter((file) => !known.some((m) => file.startsWith(`tests/${m}/`)));
problems.set('module ke bahar', stray.map((file) => `${file} kisi module folder (tests/<module>/) me nahi hai`));
problems.set('package.json', checkScripts());

const total = [...problems.values()].reduce((n, list) => n + list.length, 0);
if (total) {
  console.log(`\n${total} galti(yan):`);
  for (const [group, list] of problems) {
    if (list.length) console.log(`\n${group} (${list.length})\n  ${list.join('\n  ')}`);
  }
  process.exitCode = 1;
} else {
  console.log(`\nverify: ${mods.join(', ')} — ${pairs.length} tests, sab theek`);
}
