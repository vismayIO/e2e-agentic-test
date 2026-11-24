import { anthropic } from '@ai-sdk/anthropic';
import { azure } from '@ai-sdk/azure';
import { openai } from '@ai-sdk/openai';
import { gateway } from 'ai';
import { env } from './env.ts';

/**
 * The agent's model — the provider whose key is set (first from the top). One table builds both the model and
 * the name shown in the report, so the two never differ. With no key, AI Gateway.
 */
const PROVIDERS = [
  { key: 'AZURE_API_KEY', name: 'azure', id: () => env('AZURE_OPENAI_DEPLOYMENT') ?? 'gpt-6-luna', make: azure },
  { key: 'ANTHROPIC_API_KEY', name: 'anthropic', id: () => env('ANTHROPIC_MODEL') ?? 'claude-sonnet-5-5', make: anthropic },
  { key: 'OPENAI_API_KEY', name: 'openai', id: () => env('OPENAI_MODEL') ?? 'gpt-6-luna', make: openai },
] as const;
const GATEWAY = { name: 'gateway', id: () => env('AI_GATEWAY_MODEL') ?? 'openai/gpt-6-luna-fast', make: gateway };

const provider = () => PROVIDERS.find((p) => env(p.key)) ?? GATEWAY;

export const pickModel = () => {
  const p = provider();
  return p.make(p.id());
};

/** "anthropic/claude-sonnet-5-5" — for the nightly report and the notification. */
export const modelLabel = () => {
  const p = provider();
  return `${p.name}/${p.id()}`;
};
