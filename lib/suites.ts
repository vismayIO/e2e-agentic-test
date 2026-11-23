import { modulePaths } from './modules.ts';

/**
 * Test suites — ek hi jagah. Suite = tags se chuna hua tests ka hissa; module = `tests/<module>` path.
 * `scripts/suite.ts` (haath se / CI se) aur `scripts/nightly.ts` (raat ki pipeline) dono yahi padhte hain,
 * aur `scripts/verify.ts` jaanchta hai ki package.json ke shortcuts isi list se milte hain.
 * Strategy: docs/testing.md.
 *
 * Tags sirf yeh hain (scripts/verify.ts jaanchta hai):
 *   suite    smoke | sanity          — test kis chhote suite me bhi hai (regression me sab hain)
 *   state    bug                     — known defect; hamesha `knownBug()` se (neeche), haath se nahi
 *   priority P0 | P1 | P2            — har test pe theek ek
 *   brief id SIT-IAM-01, BEH-IAM-12… — docs/<module>/acceptance-brief.md se traceability
 * Module ya screen chunne ke liye tag nahi, path: `tests/iam`, `tests/iam/roles.e2e.ts`.
 */
export const SMOKE = 'smoke';
export const SANITY = 'sanity';
export const BUG = 'bug';
export const PRIORITIES = ['P0', 'P1', 'P2'] as const;

/**
 * Known bug wale test ke options: `test('…', knownBug('23 Nov 2026: Next sirf naam se enabled', 'SIT-IAM-11', 'P2'), …)`.
 * e2e ka apna `fail` mark (reference/test → test.fail) + `bug` tag:
 *   - bug maujood hai → test fail hota hai → runner use "passed" ginta hai, wajah report me rehti hai, retry nahi;
 *   - bug fix ho gaya → test pass hota hai → runner `UNEXPECTED_PASS` se fail karta hai: mark hatao, test regression ban gaya.
 * `reason` me tareekh aur kya dikha likho. Serial group ke andar runner khud mana karta hai.
 */
export const knownBug = (reason: string, ...tags: string[]) => ({ fail: reason, tags: [BUG, ...tags] });

export const SUITES = {
  smoke: {
    about: 'Build zinda hai? Har module ke sabse zaroori pages, halke session pe, sirf dekhna. Deploy ke turant baad aur nightly ka pehla gate.',
    args: ['--tag', SMOKE],
  },
  sanity: {
    about: 'Ek module ke mukhya kaam theek hain? Kisi fix ya chhote release ke baad us module pe.',
    args: ['--tag', SANITY],
  },
  regression: {
    about: 'Sab tests. Known bugs (knownBug) fail hone pe pass gine jaate hain; fix hote hi UNEXPECTED_PASS — mark hatao.',
    args: [],
  },
  bugs: {
    about: 'Known defects ka retest: sirf `bug` tag wale tests. Sab pass = sab bugs ab bhi hain; UNEXPECTED_PASS = woh fix ho gaya.',
    args: ['--tag', BUG, '--pass-with-no-tests'],
  },
  retest: {
    about: 'Pichhle run (usi output folder ke) me jo pass nahi hue sirf woh dobara — fix confirm karne ke liye.',
    args: ['--last-failed', '--pass-with-no-tests'],
  },
} as const satisfies Record<string, { about: string; args: readonly string[] }>;

export type SuiteName = keyof typeof SUITES;

export const isSuite = (name: string): name is SuiteName => Object.hasOwn(SUITES, name);

/** `e2e` ke arguments: `run <module paths> <suite flags>`. Module na do to sab modules. */
export function runArgs(suite: SuiteName, mods: readonly string[] = []): string[] {
  return ['run', ...modulePaths(mods), ...SUITES[suite].args];
}

/** Charters wale do rasta (lib/charters.ts): likhe hue charters aur random monkey. */
export const EXPLORATIONS = {
  explore: 'Exploratory: module ke likhe hue charters, persona ke saath (`e2e explore`).',
  monkey: 'Monkey: module ke create forms me se random pe fuzzer persona. MONKEY_SEED se wahi forms dobara.',
} as const;

/** `scripts/suite.ts` jo naam leta hai — package.json me har ek ka shortcut hai. */
export const RUNNABLE: readonly string[] = [...Object.keys(SUITES), ...Object.keys(EXPLORATIONS)];
