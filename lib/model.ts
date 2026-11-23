import { anthropic } from '@ai-sdk/anthropic';
import { azure } from '@ai-sdk/azure';
import { openai } from '@ai-sdk/openai';
import { gateway } from 'ai';
import { env } from './env.ts';

/**
 * Agent ka model — jo key mili, wahi provider (upar se neeche pehla). Ek hi table se model bhi banta hai aur
 * report me dikhne wala naam bhi, taaki dono kabhi alag na hon. Key na ho to AI Gateway.
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

/** "anthropic/claude-sonnet-5-5" — nightly report aur notification ke liye. */
export const modelLabel = () => {
  const p = provider();
  return `${p.name}/${p.id()}`;
};
