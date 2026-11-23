/**
 * Claude API list prices, USD per million tokens, first-party (global routing, no batch, no fast mode).
 * Source: https://platform.claude.com/docs/en/about-claude/pricing — checked 2026-11-23.
 * Update this table when the price page changes; models missing here are reported as "price unknown".
 */
export interface Price {
  input: number;
  /** 5-minute cache write. The AI SDK's `ephemeral` cache_control default is 5 minutes. */
  cacheWrite5m: number;
  cacheRead: number;
  output: number;
}

interface PriceRow { price: Price; /** prompt-length ceiling (tokens) this row applies to */ maxPromptTokens?: number }

export const PRICES_CHECKED_ON = '2026-11-23';

const TABLE: Record<string, PriceRow[]> = {
  'claude-opus-5-5': [{ price: { input: 4, cacheWrite5m: 5, cacheRead: 0.2, output: 20 } }],
  'claude-sonnet-5-5': [{ price: { input: 2, cacheWrite5m: 2.5, cacheRead: 0.1, output: 10 } }],
  // Haiku 5.5 is priced by prompt length (all input incl. cache reads/writes), per request.
  'claude-haiku-5-5': [
    { maxPromptTokens: 100_000, price: { input: 0.1, cacheWrite5m: 0.125, cacheRead: 0.01, output: 0.5 } },
    { price: { input: 0.5, cacheWrite5m: 0.625, cacheRead: 0.05, output: 2.5 } },
  ],
};

/** Price for a model at a given per-request prompt size; undefined when the model is not in the table. */
export function priceFor(model: string, promptTokens = 0): Price | undefined {
  const rows = TABLE[model];
  return rows?.find((r) => r.maxPromptTokens === undefined || promptTokens <= r.maxPromptTokens)?.price;
}

export interface TokenUsage { inputTokens: number; cacheReadTokens: number; cacheWriteTokens: number; outputTokens: number }

/**
 * USD for one usage record. AI SDK `inputTokens` already includes cache reads and writes,
 * so fresh input = input − reads − writes (never charged twice).
 */
export function costUsd(price: Price, u: TokenUsage): number {
  const fresh = Math.max(0, u.inputTokens - u.cacheReadTokens - u.cacheWriteTokens);
  return (fresh * price.input + u.cacheReadTokens * price.cacheRead + u.cacheWriteTokens * price.cacheWrite5m + u.outputTokens * price.output) / 1_000_000;
}
