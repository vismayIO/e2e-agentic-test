import { env } from './lib/env.ts';
import type { NightlyConfig } from './lib/types.ts';

/**
 * What runs at night and how much — change this file. Pipeline: docs/testing.md → "Nightly pipeline".
 * The nightly always runs on all modules; for one module or one suite use `npm run suite -- …`.
 *
 * 1. smoke      : tests tagged `smoke`. If it fails the other stages do not run.
 * 2. regression : all tests in one run; known bugs (knownBug) are shown apart under "Known bugs" in the report.
 * 3. explore    : some of the written charters (tests/<module>/charters.ts), then random monkey charters.
 *
 * Charters are not written here — they come from the modules. Here only what runs and the budget.
 * Cost: every explore step makes model calls. (charters × maxSteps) + (monkey.count × monkey.maxSteps) = the night's
 * budget — it does not grow with more modules; the seed (today's date) picks different charters every night.
 */
const config: NightlyConfig = {
  appName: env('APP_NAME') ?? 'Motadata console',

  // Time limit of each stage (minutes). Their sum + install must stay under the CI job's timeout (now 10 + 45 + 6×8 = 103).
  smoke: { enabled: true, maxMinutes: 10 },

  regression: { enabled: true, maxMinutes: 45 },

  explore: {
    enabled: true,
    // This many written charters every night, from all modules
    charters: 4,
    // Steps of one charter, when the charter does not give its own maxSteps
    maxSteps: 8,
    // Time limit of one charter
    charterMinutes: 8,
    // The fuzzer on this many random create forms every night (0 = off), and the steps of each
    monkey: { count: 2, maxSteps: 6 },
  },

  verdict: {
    // An explore "issue" of this severity or higher → RED. (5 critical, 4 high, 3 medium, 2 low, 1 trivial)
    failOnIssueSeverity: 4,
  },

  // When the pipeline fails: 'red' (default) | 'never' (env NIGHTLY_FAIL_ON=never)
  failPipelineOn: env('NIGHTLY_FAIL_ON') === 'never' ? 'never' : 'red',

  historyLimit: 30,
};

export default config;
