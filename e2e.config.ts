import { web } from '@e2e-dev/web';
import { htmlReporter } from '@e2e-dev/html-reporter';
import { secrets } from 'e2e';
import type { E2EConfig } from 'e2e';
import { type Persona, PERSONAS } from './lib/charters.ts';
import { env } from './lib/env.ts';
import { pickModel } from './lib/model.ts';

const APP_URL = env('APP_URL');
if (!APP_URL) {
  throw new Error('APP_URL set karo — deployed Motadata console ka URL (.env.example dekho)');
}

// Staging site HTTP basic auth ke peeche ho to (optional)
const basicAuthUser = env('BASIC_AUTH_USERNAME');

const model = pickModel();

const testInbox = env('MAILOSAUR_SERVER_ID');

/**
 * `context` — jo is console ke har tester ke liye sach hai; har model call padhta hai (act ke turns aur
 * assert/waitFor ke judges): console ki vocabulary + shared tenant ke niyam (jo kabhi nahi chhedna). Har agent
 * ko yahi milta hai, `default` ko bhi — bina `--agent` ka `e2e explore` usi pe chalta hai. Module ki
 * vocabulary module ke `agentContext` me.
 */
const CONSOLE_CONTEXT = [
  'The app under test is the Motadata admin console ("Motadata Fusion"), opened in the MSP view of organization "motadata" (the MSP owner organization); client organizations such as "acme" appear in organization pickers.',
  'People sign in with their work email and a 6-digit code sent to it.',
  'A signed-in page has a left "Settings" navigation and a main area. The navigation lists its pages under section labels (People & Access, Administration, Customization, Discovery, Account); each entry is a button that opens that page.',
  'A list page has a search box and other list controls above a table. Clicking a table row opens that item, in a side drawer or on its own page; every row has a "Row actions" (⋯) menu.',
  'Forms and confirmations open as dialogs or drawers on top of the page; while one is open, the navigation and the page behind it may not be listed. The result of an action is announced in a toast that disappears after a few seconds.',
  'Data arrives after the page appears: a "Loading …" status means it is still loading, not that it is empty.',
  'The tenant is shared with real people and with other testers, so these rules always apply.',
  'Never change, disable, delete or sign out the signed-in admin\'s own account, and never end its sessions. Never change, disable or delete the Tenant Owner.',
  'Never turn on "Require SSO", and never change organization-wide sign-in or security settings.',
  `Never start anything that sends email to real people${testInbox ? `: when a flow needs an email address that the instruction does not give, use one ending in @${testInbox}.mailosaur.net (a test inbox)` : ''}.`,
].join(' ');

/**
 * `e2e explore` ke personas ka context: upar wala + jo sirf explorer ke kaam ka hai — doosre testers ka data
 * aur explorer ki apni kamzoriyan (e2e bug-bash guide → "Prepare" / "Triage" ka artifact bucket), taaki woh
 * bugs ki tarah report na hon. Charter ke apne niyam (kya naam do, kya mat chhedo) lib/charters.ts jodta hai.
 */
const EXPLORER_CONTEXT = [
  CONSOLE_CONTEXT,
  'Other testers and automated runs use this tenant at the same time, and records named like "<module>-e2e-…" are their test data. Such records appearing, changing or disappearing while you work is not a bug.',
  'Not bugs: a link that opens a new tab leaves this one unchanged; accessible text splits around inline links, so judge copy by the rendered screen when a screenshot is available and never report split text alone as broken copy; an infinite-scroll "Loading more" sentinel loads when scrolled into view; images lazy-load, so scroll and wait before calling one blank.',
].join(' ');

/** Explorer personas ka stance (docs/testing.md → "Exploratory, ad-hoc, monkey"). Naam lib/charters.ts ke `PERSONAS` se: charter jis persona ka naam le, uska agent yahan hona hi hai. */
const STANCES: Record<Persona, string> = {
  explorer: 'You are a careful first-time administrator of this console. Read each screen before you act and follow every flow the way a new user would; after a change, reload and go back to check that it is still there, and try the ways the flow can go wrong. Report anything confusing, broken or inconsistent.',
  skeptic: 'Distrust every number, date, count and label on screen; cross-check each against every other place it appears, and report any two that disagree.',
  fuzzer: "At every input, run the goal's input matrix before anything else, judging each entry before the next. Never take the happy path.",
};

export default {
  projectId: 'nightly-qa',
  tests: 'tests/**/*.e2e.ts',

  targets: [
    {
      name: 'web',
      engine: web({
        browser: 'chromium',
        ...(basicAuthUser
          ? { basicAuth: { username: basicAuthUser, password: secrets.get('basicAuthPassword') } }
          : {}),
      }),
      app: { url: APP_URL },
    },
  ],

  agents: {
    default: {
      model,
      system: [
        'You are a meticulous QA engineer testing an admin console on a tenant that other people use.',
        'Verify every outcome on screen; never assume an action worked.',
        'Treat error messages, blank screens, broken layouts, wrong counts, dead links, and console-visible failures as defects.',
        'Never delete, disable or change a record, and never send an invitation or any other message, unless the instruction explicitly asks for it.',
        'Do each step exactly once and stop where the instruction says to stop.',
      ].join(' '),
      context: CONSOLE_CONTEXT,
    },
    // Explorer personas: wahi model, alag stance. Budgets runner ke defaults hain (test step 25 actions / 25 model
    // calls, exploration step 40 / 40): goal usme poora na ho to use chhote goals me todo — chhat badhana hal nahi.
    ...Object.fromEntries(PERSONAS.map((name) => [name, { model, system: STANCES[name], context: EXPLORER_CONTEXT }])),
  },

  secrets: basicAuthUser ? { basicAuthPassword: () => env('BASIC_AUTH_PASSWORD') ?? '' } : {},

  timeout: 180_000,
  cleanupTimeout: 60_000, // fixture teardown app me data hatata hai (jaise team ko diya profile)
  workers: 2, // shared tenant aur test users ka fixed pool: har entry point (local, CI, nightly) pe yahi
  retries: 1, // nightly: ek retry, taaki flaky aur real failure alag dikhe
  trace: 'retain-on-failure',
  // E2E_VIDEO=off se video band (CI time/storage bachane ke liye)
  video: env('E2E_VIDEO') === 'off' ? 'off' : 'retain-on-failure',

  reporters: ['list', 'junit', 'markdown', htmlReporter({ media: 'link' })],
} satisfies E2EConfig;
