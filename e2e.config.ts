import { existsSync } from 'node:fs';
import { web } from '@e2e-dev/web';
import { htmlReporter } from '@e2e-dev/html-reporter';
import { azure } from '@ai-sdk/azure';
import { anthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';
import { gateway } from 'ai';
import { secrets } from 'e2e';
import type { E2EConfig } from 'e2e';
import { env, hasLogin } from './lib/env.ts';

// Local machine pe .env se values (CI me pipeline secrets se aati hain)
if (existsSync(new URL('.env', import.meta.url))) {
  process.loadEnvFile(new URL('.env', import.meta.url));
}

const APP_URL = env('APP_URL');
if (!APP_URL) {
  throw new Error('APP_URL set karo — jis deployed frontend ko test karna hai, jaise https://staging.myapp.com');
}

/** Jo key mili, wahi provider. Azure DevOps ke unresolved "$(VAR)" ko env() ignore karta hai. */
function pickModel() {
  if (env('AZURE_API_KEY')) return azure(env('AZURE_OPENAI_DEPLOYMENT') ?? 'gpt-6-luna');
  if (env('ANTHROPIC_API_KEY')) return anthropic(env('ANTHROPIC_MODEL') ?? 'claude-sonnet-5-5');
  if (env('OPENAI_API_KEY')) return openai(env('OPENAI_MODEL') ?? 'gpt-6-luna');
  return gateway(env('AI_GATEWAY_MODEL') ?? 'openai/gpt-6-luna-fast');
}

// Staging site HTTP basic auth ke peeche ho to (optional)
const basicAuthUser = env('BASIC_AUTH_USERNAME');

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
      model: pickModel(),
      system: [
        'You are a meticulous QA engineer testing a production-like web app.',
        'Verify every outcome on screen; never assume an action worked.',
        'Treat error messages, blank screens, broken layouts, wrong totals, dead links, and console-visible failures as defects.',
        'Never delete real data, place real orders, or send real messages unless the instruction explicitly asks for it.',
      ].join(' '),
    },
  },

  // Login wale flows ke liye: E2E_USER_QA_USERNAME / E2E_USER_QA_PASSWORD
  credentials: hasLogin()
    ? { qa: { username: env('E2E_USER_QA_USERNAME')!, password: () => env('E2E_USER_QA_PASSWORD') ?? '' } }
    : {},

  secrets: basicAuthUser ? { basicAuthPassword: () => env('BASIC_AUTH_PASSWORD') ?? '' } : {},

  timeout: 180_000,
  retries: 1, // nightly: ek retry, taaki flaky aur real failure alag dikhe
  trace: 'retain-on-failure',
  // E2E_VIDEO=off se video band (CI time/storage bachane ke liye)
  video: env('E2E_VIDEO') === 'off' ? 'off' : 'retain-on-failure',

  reporters: ['list', 'junit', 'markdown', htmlReporter({ media: 'link' })],
} satisfies E2EConfig;
