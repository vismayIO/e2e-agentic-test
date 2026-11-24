/**
 * Run one suite — by hand or from CI. Which suite when: docs/testing.md.
 *
 *   node scripts/suite.ts <suite> [module…] [-- <e2e flags>]
 *
 *   node scripts/suite.ts smoke                     # smoke for all modules
 *   node scripts/suite.ts sanity iam -- --headed    # one module, with an e2e flag
 *   node scripts/suite.ts explore iam               # the module's exploratory charters
 *   MONKEY_SEED=20261123 node scripts/suite.ts monkey   # the same random forms again
 *
 * Suites are in lib/suites.ts, charters in tests/<module>/charters.ts, the explore/monkey budget in nightly.config.ts.
 * Run from the repo root (npm run suite -- …).
 * Exit: e2e's exit code; for explore/monkey 1 if any exploration did not pass; 2 on a wrong suite or module.
 */
import config from '../nightly.config.ts';
import { charters, exploreArgs, monkeyCharters, seedOfTheDay, type PlannedCharter } from '../lib/charters.ts';
import { modules, resolveModules } from '../lib/modules.ts';
import { INTERRUPTED, runE2E } from '../lib/run-e2e.ts';
import { EXPLORATIONS, RUNNABLE, SUITES, isSuite, runArgs } from '../lib/suites.ts';

const argv = process.argv.slice(2);
const split = argv.indexOf('--');
const own = split < 0 ? argv : argv.slice(0, split);
const [suite, ...mods] = own;
const extra = split < 0 ? [] : argv.slice(split + 1);

function usage(): string {
  const rows = [...Object.entries(SUITES).map(([name, s]) => [name, s.about]), ...Object.entries(EXPLORATIONS)];
  return [
    'Usage: node scripts/suite.ts <suite> [module…] [-- <e2e flags>]',
    '',
    'Suites:',
    ...rows.map(([name, about]) => `  ${name.padEnd(12)}${about}`),
    '',
    `Modules: ${modules().join(', ')} (all when none is given)`,
  ].join('\n');
}

/** Bad input (unknown module, bad MONKEY_SEED): message only, exit 2. */
function checked<T>(read: () => T): T {
  try {
    return read();
  } catch (err) {
    console.error((err as Error).message);
    process.exit(2);
  }
}

/** Where each exploration's charters come from (lib/suites.ts → EXPLORATIONS). */
const PLAN: Record<keyof typeof EXPLORATIONS, (scope: string[]) => Promise<PlannedCharter[]>> = {
  explore: charters,
  monkey: (scope) => {
    const { count, maxSteps } = config.explore.monkey;
    const seed = checked(seedOfTheDay);
    console.log(`Monkey seed ${seed} — this command with MONKEY_SEED=${seed} picks the same forms again.`);
    return monkeyCharters(scope, count, seed, maxSteps);
  },
};

/** Charters one after another (less load on the shared tenant, clean logs); each one's output in `.e2e/explore/<id>`. */
async function explore(planned: PlannedCharter[]): Promise<number> {
  if (!planned.length) console.log('No charter found — see tests/<module>/charters.ts.');
  let exit = 0;
  for (const c of planned) {
    const { code } = await runE2E([...exploreArgs(c, `.e2e/explore/${c.id}`, config.explore), ...extra]);
    if (code === INTERRUPTED) return INTERRUPTED; // interrupted: the remaining charters do not start
    if (code !== 0) exit = 1;
  }
  return exit;
}

async function main(): Promise<number> {
  if (!suite || own.includes('--help')) {
    console.log(usage());
    return 0;
  }
  if (!RUNNABLE.includes(suite)) {
    console.error(`There is no suite "${suite}".\n\n${usage()}`);
    return 2;
  }
  const scope = checked(() => resolveModules(mods));
  if (isSuite(suite)) return (await runE2E([...runArgs(suite, mods), ...extra])).code ?? 1;
  return explore(await PLAN[suite as keyof typeof EXPLORATIONS](scope));
}

process.exit(await main());
