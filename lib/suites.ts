import { modulePaths } from './modules.ts';

/**
 * Test suites — in one place. Suite = a part of the tests chosen by tags; module = the `tests/<module>` path.
 * `scripts/suite.ts` (by hand / from CI) and `scripts/nightly.ts` (the nightly pipeline) both read this,
 * and `scripts/verify.ts` checks that the package.json shortcuts match this list.
 * Strategy: docs/testing.md.
 *
 * These are the only tags (scripts/verify.ts checks):
 *   suite    smoke | sanity          — which small suite the test is also in (regression has them all)
 *   state    bug                     — known defect; always through `knownBug()` (below), never by hand
 *   priority P0 | P1 | P2            — exactly one per test
 *   brief id SIT-IAM-01, BEH-IAM-12… — traceability to docs/<module>/acceptance-brief.md
 * To choose a module or a screen, use a path, not a tag: `tests/iam`, `tests/iam/roles.e2e.ts`.
 */
export const SMOKE = 'smoke';
export const SANITY = 'sanity';
export const BUG = 'bug';
export const PRIORITIES = ['P0', 'P1', 'P2'] as const;

/**
 * Options for a known-bug test: `test('…', knownBug('23 Nov 2026: Next is enabled with only a name', 'SIT-IAM-11', 'P2'), …)`.
 * e2e's own `fail` mark (reference/test → test.fail) + the `bug` tag:
 *   - the bug is present → the test fails → the runner counts it as "passed", the reason stays in the report, no retry;
 *   - the bug is fixed → the test passes → the runner fails it with `UNEXPECTED_PASS`: remove the mark, it is a regression test now.
 * Put the date and what was seen in `reason`. Inside a serial group the runner itself refuses the mark.
 */
export const knownBug = (reason: string, ...tags: string[]) => ({ fail: reason, tags: [BUG, ...tags] });

export const SUITES = {
  smoke: {
    about: 'Is the build alive? The most important pages of each module, on the light `admin` session, read-only. Right after a deploy, and the first gate of the nightly.',
    args: ['--tag', SMOKE],
  },
  sanity: {
    about: 'Do the main jobs of a module work? On that module, after a fix or a small release.',
    args: ['--tag', SANITY],
  },
  regression: {
    about: 'Every test. Known bugs (knownBug) count as passed while they fail; once fixed, UNEXPECTED_PASS — remove the mark.',
    args: [],
  },
  bugs: {
    about: 'Retest of known defects: only the tests tagged `bug`. All pass = every bug is still there; UNEXPECTED_PASS = that one is fixed.',
    args: ['--tag', BUG, '--pass-with-no-tests'],
  },
  retest: {
    about: 'Only what did not pass in the previous run (of the same output folder), again — to confirm a fix.',
    args: ['--last-failed', '--pass-with-no-tests'],
  },
} as const satisfies Record<string, { about: string; args: readonly string[] }>;

export type SuiteName = keyof typeof SUITES;

export const isSuite = (name: string): name is SuiteName => Object.hasOwn(SUITES, name);

/** Arguments for `e2e`: `run <module paths> <suite flags>`. With no module, all modules. */
export function runArgs(suite: SuiteName, mods: readonly string[] = []): string[] {
  return ['run', ...modulePaths(mods), ...SUITES[suite].args];
}

/** The two charter-based ways (lib/charters.ts): written charters and random monkey. */
export const EXPLORATIONS = {
  explore: 'Exploratory: the written charters of a module, each with its persona (`e2e explore`).',
  monkey: 'Monkey: the fuzzer persona on random create forms of a module. MONKEY_SEED repeats the same forms.',
} as const;

/** The names `scripts/suite.ts` accepts — each has a shortcut in package.json. */
export const RUNNABLE: readonly string[] = [...Object.keys(SUITES), ...Object.keys(EXPLORATIONS)];
