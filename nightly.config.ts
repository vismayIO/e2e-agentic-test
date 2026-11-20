import type { NightlyConfig } from './lib/types.ts';

/**
 * Raat ko kya chalega — yahi file badlo.
 *
 * 1. regression : tests/ ke saare tests (`e2e run`)
 * 2. explore    : har goal pe AI agent app me ghoom ke bugs dhoondhta hai (`e2e explore`)
 *
 * Cost: explore ka har step model calls karta hai. maxSteps × goals = raat ka budget.
 */
const config: NightlyConfig = {
  appName: process.env.APP_NAME?.trim() || 'My App',

  regression: {
    enabled: true,
    // Sirf kuch tags chalane ho to: tags: ['smoke', 'critical']  (ya env NIGHTLY_TAGS=smoke,critical)
    tags: process.env.NIGHTLY_TAGS?.split(',').map((t) => t.trim()).filter(Boolean) ?? [],
    workers: 2,
  },

  explore: [
    {
      id: 'first-time-visitor',
      goal: 'Explore the app like a first-time visitor: open the main pages, use navigation, search and forms, and report anything broken, wrong, or confusing',
      maxSteps: 8,
    },
    {
      id: 'forms-and-links',
      goal: 'Hunt for broken forms, dead links, error messages, validation bugs, and broken layouts',
      maxSteps: 6,
    },
    {
      id: 'signed-in-user',
      goal: 'As a signed-in user, explore the main features of the account and report any defect',
      maxSteps: 8,
      session: 'qa', // E2E_USER_QA_* set nahi hai to yeh goal skip hoga
    },
  ],

  verdict: {
    // Is severity ya usse upar ka explore "issue" → RED. (5 critical, 4 high, 3 medium, 2 low, 1 trivial)
    failOnIssueSeverity: 4,
    // Flaky tests (retry pe pass) → YELLOW
    flakyIsWarning: true,
  },

  // Pipeline kab fail ho: 'red' (default) | 'never'
  failPipelineOn: (process.env.NIGHTLY_FAIL_ON as 'red' | 'never') || 'red',

  historyLimit: 30,
};

export default config;
