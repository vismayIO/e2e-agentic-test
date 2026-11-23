/**
 * Model cost and replay-cache report for one e2e run.
 *
 *   node scripts/cost-report.ts                 # .e2e/report.json
 *   node scripts/cost-report.ts path/to/report.json [--json out.json]
 *
 * Per agent step it reads the runner's own accounting (`step.metrics`, `step.model`, `step.cache`),
 * prices it with lib/pricing.ts, and prints totals by API, by cache outcome and the costliest steps.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { PRICES_CHECKED_ON, costUsd, priceFor } from '../lib/pricing.ts';

interface ModelUsage {
  model: string; calls: number; tokenAccounting?: string;
  inputTokens?: number; outputTokens?: number; cacheReadTokens?: number; cacheWriteTokens?: number; peakTokensPerCall?: number;
}
interface Step {
  kind: string; api: string; label: string; status: string; durationMs?: number;
  metrics?: { modelCalls?: number };
  model?: ModelUsage;
  cache?: { mode?: string; reason?: string };
}
interface Result { file: string; titlePath: string[]; selected: boolean; attempts?: { steps?: Step[] }[] }
interface Report { run: { startedAt: string; status: string; summary: Record<string, number>; results: Result[] } }

const args = process.argv.slice(2);
const jsonOut = args.includes('--json') ? args[args.indexOf('--json') + 1] : undefined;
const file = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--json') ?? '.e2e/report.json';
const { run } = JSON.parse(readFileSync(file, 'utf8')) as Report;

interface Row {
  test: string; api: string; label: string; status: string; calls: number; usd?: number;
  cache?: string; reason?: string; tokens: number; model?: string;
}
const rows: Row[] = [];
const unknownModels = new Set<string>();

for (const result of run.results.filter((r) => r.selected)) {
  for (const attempt of result.attempts ?? []) {
    for (const step of attempt.steps ?? []) {
      if (step.kind !== 'agent') continue;
      const m = step.model;
      const usage = {
        inputTokens: m?.inputTokens ?? 0, cacheReadTokens: m?.cacheReadTokens ?? 0,
        cacheWriteTokens: m?.cacheWriteTokens ?? 0, outputTokens: m?.outputTokens ?? 0,
      };
      // Haiku's tier is per request; the step's peak call is the closest per-request figure the report has.
      const price = m ? priceFor(m.model, m.peakTokensPerCall ?? 0) : undefined;
      if (m && !price) unknownModels.add(m.model);
      rows.push({
        test: `${result.file} › ${result.titlePath.join(' › ')}`,
        api: step.api, label: step.label, status: step.status,
        calls: m?.calls ?? step.metrics?.modelCalls ?? 0,
        usd: m ? (price ? costUsd(price, usage) : undefined) : 0, // no model block = fully replayed, zero cost
        cache: step.cache?.mode, reason: step.cache?.reason,
        tokens: usage.inputTokens + usage.outputTokens, model: m?.model,
      });
    }
  }
}

const sum = (xs: Row[]) => ({
  steps: xs.length,
  calls: xs.reduce((n, r) => n + r.calls, 0),
  usd: xs.reduce((n, r) => n + (r.usd ?? 0), 0),
});
const groupBy = (key: (r: Row) => string) => {
  const g = new Map<string, Row[]>();
  for (const r of rows) g.set(key(r), [...(g.get(key(r)) ?? []), r]);
  return [...g.entries()].map(([k, xs]) => ({ key: k, ...sum(xs) })).sort((a, b) => b.calls - a.calls);
};
const usd = (n: number) => `$${n.toFixed(4)}`;
const table = (title: string, items: { key: string; steps: number; calls: number; usd: number }[]) => [
  `\n${title}`,
  ...items.map((i) => `  ${i.key.padEnd(34)} steps ${String(i.steps).padStart(4)}   calls ${String(i.calls).padStart(5)}   ${usd(i.usd)}`),
].join('\n');

const total = sum(rows);
const acts = rows.filter((r) => r.api === 'agent.act');
const replayed = acts.filter((r) => r.calls === 0).length;

console.log(`Run ${run.startedAt} · ${run.status} · ${JSON.stringify(run.summary)}`);
console.log(`AI steps ${total.steps} · model calls ${total.calls} · estimated ${usd(total.usd)} (list prices checked ${PRICES_CHECKED_ON})`);
console.log(`agent.act replayed with zero model calls: ${replayed}/${acts.length} (${acts.length ? Math.round((100 * replayed) / acts.length) : 0}%)`);
console.log(table('By API', groupBy((r) => r.api)));
console.log(table('agent.act by cache outcome', groupBy((r) => (r.api === 'agent.act' ? `${r.cache ?? 'none'}${r.reason ? ` (${r.reason})` : ''}` : '—')).filter((g) => g.key !== '—')));
console.log('\nCostliest steps');
for (const r of [...rows].sort((a, b) => (b.usd ?? 0) - (a.usd ?? 0) || b.calls - a.calls).slice(0, 10)) {
  console.log(`  ${usd(r.usd ?? 0)}  ${String(r.calls).padStart(3)} calls  ${r.api.padEnd(13)} ${r.label.slice(0, 70)}\n             ${r.test}`);
}
if (unknownModels.size) console.log(`\nPrice unknown (add to lib/pricing.ts): ${[...unknownModels].join(', ')}`);

if (jsonOut) writeFileSync(jsonOut, JSON.stringify({ report: file, pricesCheckedOn: PRICES_CHECKED_ON, total, byApi: groupBy((r) => r.api), steps: rows }, null, 2) + '\n');
