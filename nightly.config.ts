import { env } from './lib/env.ts';
import type { NightlyConfig } from './lib/types.ts';

/**
 * Raat ko kya chalega aur kitna — yahi file badlo. Pipeline: docs/testing.md → "Nightly pipeline".
 * Nightly hamesha sab modules pe chalta hai; ek module ya ek suite ke liye `npm run suite -- …`.
 *
 * 1. smoke      : `smoke` tag wale tests. Fail to baaki stages nahi chalte.
 * 2. regression : sab tests ek hi run me; known bugs (knownBug) report me "Known bugs" me alag dikhte hain.
 * 3. explore    : likhe hue charters (tests/<module>/charters.ts) me se kuch, phir random monkey charters.
 *
 * Charters yahan nahi likhe jaate — woh modules se aate hain. Yahan sirf kya chale aur budget.
 * Cost: explore ka har step model calls karta hai. (charters × maxSteps) + (monkey.count × monkey.maxSteps) = raat
 * ka budget — modules badhne se yeh nahi badhta, seed (aaj ki tareekh) har raat alag charters chunta hai.
 */
const config: NightlyConfig = {
  appName: env('APP_NAME') ?? 'Motadata console',

  // Har stage ki time limit (minutes). In sab ka jod + install CI job ke timeout se kam rahe (abhi 10 + 45 + 6×8 = 103).
  smoke: { enabled: true, maxMinutes: 10 },

  regression: { enabled: true, maxMinutes: 45 },

  explore: {
    enabled: true,
    // Har raat itne likhe hue charters, sab modules me se
    charters: 4,
    // Ek charter ke steps, jab charter khud maxSteps na bataye
    maxSteps: 8,
    // Ek charter ki time limit
    charterMinutes: 8,
    // Har raat itne random create forms pe fuzzer (0 = band), aur har ek ke steps
    monkey: { count: 2, maxSteps: 6 },
  },

  verdict: {
    // Is severity ya usse upar ka explore "issue" → RED. (5 critical, 4 high, 3 medium, 2 low, 1 trivial)
    failOnIssueSeverity: 4,
  },

  // Pipeline kab fail ho: 'red' (default) | 'never' (env NIGHTLY_FAIL_ON=never)
  failPipelineOn: env('NIGHTLY_FAIL_ON') === 'never' ? 'never' : 'red',

  historyLimit: 30,
};

export default config;
