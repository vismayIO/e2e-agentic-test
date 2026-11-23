/**
 * Ek suite chalao — haath se ya CI se. Kaun sa suite kab: docs/testing.md.
 *
 *   node scripts/suite.ts <suite> [module…] [-- <e2e flags>]
 *
 *   node scripts/suite.ts smoke                     # sab modules ka smoke
 *   node scripts/suite.ts sanity iam -- --headed    # ek module, e2e flag ke saath
 *   node scripts/suite.ts explore iam               # module ke exploratory charters
 *   MONKEY_SEED=20261123 node scripts/suite.ts monkey   # wahi random forms dobara
 *
 * Suites lib/suites.ts me hain, charters tests/<module>/charters.ts me, explore/monkey ka budget nightly.config.ts me.
 * Repo root se chalao (npm run suite -- …).
 * Exit: e2e ka exit code; explore/monkey me 1 agar koi exploration pass nahi hui; 2 galat suite ya module pe.
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
    `Modules: ${modules().join(', ')} (na do to sab)`,
  ].join('\n');
}

/** Galat input (anjaan module, kharab MONKEY_SEED): sirf message, exit 2. */
function checked<T>(read: () => T): T {
  try {
    return read();
  } catch (err) {
    console.error((err as Error).message);
    process.exit(2);
  }
}

/** Har exploration ke charters kahan se aate hain (lib/suites.ts → EXPLORATIONS). */
const PLAN: Record<keyof typeof EXPLORATIONS, (scope: string[]) => Promise<PlannedCharter[]>> = {
  explore: charters,
  monkey: (scope) => {
    const { count, maxSteps } = config.explore.monkey;
    const seed = checked(seedOfTheDay);
    console.log(`Monkey seed ${seed} — MONKEY_SEED=${seed} ke saath yahi command wahi forms dobara chunta hai.`);
    return monkeyCharters(scope, count, seed, maxSteps);
  },
};

/** Charters ek ke baad ek (shared tenant pe load kam, logs saaf); har ek ka output `.e2e/explore/<id>` me. */
async function explore(planned: PlannedCharter[]): Promise<number> {
  if (!planned.length) console.log('Koi charter nahi mila — tests/<module>/charters.ts dekho.');
  let exit = 0;
  for (const c of planned) {
    const { code } = await runE2E([...exploreArgs(c, `.e2e/explore/${c.id}`, config.explore), ...extra]);
    if (code === INTERRUPTED) return INTERRUPTED; // roka gaya: baaki charters shuru nahi hote
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
    console.error(`Suite "${suite}" nahi hai.\n\n${usage()}`);
    return 2;
  }
  const scope = checked(() => resolveModules(mods));
  if (isSuite(suite)) return (await runE2E([...runArgs(suite, mods), ...extra])).code ?? 1;
  return explore(await PLAN[suite as keyof typeof EXPLORATIONS](scope));
}

process.exit(await main());
