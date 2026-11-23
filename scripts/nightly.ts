/**
 * Nightly QA pipeline — docs/testing.md → "Nightly pipeline"
 *
 *   node scripts/nightly.ts    # smoke → regression (+ known bugs) → explore + monkey → report → notify
 *
 * Smoke fail to baaki stages nahi chalte (toota build model calls na khaaye).
 * Kaun se stages aur kitna: nightly.config.ts. Ek hi suite ya module: scripts/suite.ts. Repo root se chalao (npm run nightly).
 *
 * Har stage ki apni time limit hai (nightly.config.ts), to raat khud khatam hoti hai. Report hamesha banti hai:
 * Ctrl-C se roka jaaye to jo stages poore hue unki.
 *
 * Output:  nightly-report/index.html  (+ summary.md, summary.json, raw/)
 * History: .nightly-history/history.json  (CI cache me rakho → trend chart)
 * Exit:    130 agar beech me roka gaya, 1 agar verdict RED (aur failPipelineOn = 'red'), warna 0
 */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import config from '../nightly.config.ts';
import { charters, exploreArgs, monkeyCharters, pick, seedOfTheDay, type PlannedCharter } from '../lib/charters.ts';
import { env } from '../lib/env.ts';
import { rawBase, summarize } from '../lib/e2e-report.ts';
import { renderHtml, renderMarkdown } from '../lib/html.ts';
import { modelLabel } from '../lib/model.ts';
import { modules } from '../lib/modules.ts';
import { notify } from '../lib/notify.ts';
import { INTERRUPTED, runE2E } from '../lib/run-e2e.ts';
import { runArgs } from '../lib/suites.ts';
import type { HistoryEntry, NightlyRunMeta, PhaseRun } from '../lib/types.ts';

const RAW = '.e2e/nightly';
const OUT = 'nightly-report';
const HISTORY_FILE = '.nightly-history/history.json';

type StageRuns = Pick<NightlyRunMeta, 'phases' | 'monkeySeed'>;
type Stage = Omit<PhaseRun, 'exitCode' | 'durationMs' | 'skipped'>;

function ciRunUrl(): string | undefined {
  if (env('GITHUB_RUN_ID')) {
    return `${env('GITHUB_SERVER_URL') ?? 'https://github.com'}/${env('GITHUB_REPOSITORY')}/actions/runs/${env('GITHUB_RUN_ID')}`;
  }
  if (env('BUILD_BUILDID') && env('SYSTEM_COLLECTIONURI')) {
    return `${env('SYSTEM_COLLECTIONURI')}${encodeURIComponent(env('SYSTEM_TEAMPROJECT') ?? '')}/_build/results?buildId=${env('BUILD_BUILDID')}`;
  }
  return undefined;
}

/** Aaj raat ke charters: likhe hue me se `explore.charters` (seed se chune), phir monkey — wahi seed. Sab modules. */
async function plan(seed: number): Promise<PlannedCharter[]> {
  const { charters: count, monkey } = config.explore;
  const mods = modules();
  return [...pick(await charters(mods), count, seed), ...await monkeyCharters(mods, monkey.count, seed, monkey.maxSteps)];
}

async function runStages(): Promise<StageRuns> {
  // Charters pehle hi: kharab MONKEY_SEED ya kisi charters.ts ka error yahin pakdo, do stages chalne ke baad nahi
  const seed = config.explore.enabled ? seedOfTheDay() : undefined;
  const planned = seed === undefined ? [] : await plan(seed);
  rmSync(RAW, { recursive: true, force: true });
  mkdirSync(RAW, { recursive: true });

  const runs: StageRuns = { phases: [], monkeySeed: seed };
  /** Aage ke stages kyun nahi chalenge: smoke fail hua, ya run roka gaya. */
  let stopped: string | undefined;
  const record = (p: PhaseRun) => runs.phases.push(p);
  const skip = (p: Stage) => record({ ...p, exitCode: null, durationMs: 0, skipped: stopped });
  /** Ek e2e process. Roka gaya stage (exit 130) adhoora hai: woh "nahi chala" darj hota hai aur agla shuru nahi hota. */
  const stage = async (p: Stage, argv: string[]): Promise<number | null> => {
    const { code, ms } = await runE2E(argv);
    if (code === INTERRUPTED) stopped = 'run beech me roka gaya (Ctrl-C / CI cancel)';
    record({ ...p, exitCode: code, durationMs: ms, skipped: code === INTERRUPTED ? stopped : undefined });
    return code;
  };

  // 1) Smoke — gate
  if (config.smoke.enabled) {
    const outputDir = join(RAW, 'smoke');
    const code = await stage({ kind: 'smoke', id: 'smoke', label: 'Smoke tests', outputDir }, [...runArgs('smoke'), '--output', outputDir, '--max-duration', String(config.smoke.maxMinutes * 60_000)]);
    if (code !== 0) stopped ??= `smoke pass nahi hua (exit ${code ?? 'signal'})`;
  }

  // 2) Regression — sab tests ek hi run me; known bugs (knownBug) isi report se alag nikalte hain
  if (config.regression.enabled) {
    const outputDir = join(RAW, 'regression');
    const p: Stage = { kind: 'regression', id: 'regression', label: 'Regression tests', outputDir };
    if (stopped) skip(p);
    else await stage(p, [...runArgs('regression'), '--output', outputDir, '--max-duration', String(config.regression.maxMinutes * 60_000)]);
  }

  // 3) Exploration — raat ke charters ek ke baad ek (shared tenant pe load kam, logs saaf)
  if (config.explore.enabled) {
    if (stopped) skip({ kind: 'explore', id: 'explore', label: 'Exploratory aur monkey charters', outputDir: join(RAW, 'explore') });
    else {
      for (const c of planned) {
        const outputDir = join(RAW, 'explore', c.id);
        await stage({ kind: 'explore', id: c.id, label: c.goal, outputDir, module: c.module, persona: c.persona, charter: c.kind },
          exploreArgs(c, outputDir, config.explore));
        if (stopped) break;
      }
    }
  }
  return runs;
}

/** raw outputs report folder me copy — sessions (login state) aur ai-trace kabhi nahi */
function copyRaw(phases: PhaseRun[]): void {
  for (const p of phases) {
    if (p.skipped || !existsSync(p.outputDir)) continue;
    cpSync(p.outputDir, join(OUT, rawBase(p)), {
      recursive: true,
      filter: (src) => !/[\\/](sessions)([\\/]|$)/.test(src) && !src.endsWith('ai-trace.json'),
    });
  }
}

function loadHistory(): HistoryEntry[] {
  if (!existsSync(HISTORY_FILE)) return [];
  try {
    const h = JSON.parse(readFileSync(HISTORY_FILE, 'utf8'));
    return Array.isArray(h) ? h : [];
  } catch {
    return [];
  }
}

async function main() {
  const startedAt = new Date().toISOString();
  const appUrl = env('APP_URL');
  if (!appUrl) {
    console.error('APP_URL set karo — jis deployed console ko test karna hai (.env.example dekho)');
    process.exit(2);
  }

  const { phases, monkeySeed } = await runStages();

  const summary = summarize(phases, config);
  const meta: NightlyRunMeta = {
    appName: config.appName, appUrl, startedAt, finishedAt: new Date().toISOString(),
    ciRunUrl: ciRunUrl(), model: modelLabel(), monkeySeed, phases,
  };

  // History (trend)
  const history = loadHistory();
  history.push({
    date: startedAt, verdict: summary.verdict,
    passed: summary.regression.passed, failed: summary.regression.failed, flaky: summary.regression.flaky,
    issues: summary.issues, warnings: summary.warnings,
    durationMs: phases.reduce((n, p) => n + p.durationMs, 0), runUrl: meta.ciRunUrl,
  });
  const trimmed = history.slice(-config.historyLimit);
  mkdirSync(dirname(HISTORY_FILE), { recursive: true });
  writeFileSync(HISTORY_FILE, JSON.stringify(trimmed, null, 2));

  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  copyRaw(phases);
  writeFileSync(join(OUT, 'index.html'), renderHtml(meta, summary, trimmed));
  const md = renderMarkdown(meta, summary);
  writeFileSync(join(OUT, 'summary.md'), md);
  writeFileSync(join(OUT, 'summary.json'), JSON.stringify({ meta, summary }, null, 2));
  writeFileSync(join(OUT, 'history.json'), JSON.stringify(trimmed, null, 2));

  // GitHub Actions job summary
  if (env('GITHUB_STEP_SUMMARY')) writeFileSync(env('GITHUB_STEP_SUMMARY')!, md, { flag: 'a' });

  console.log(`\n${md}`);
  console.log(`Report: ${resolve(OUT, 'index.html')}`);

  await notify(meta, summary);
  if (phases.some((p) => p.exitCode === INTERRUPTED)) process.exit(INTERRUPTED);
  if (config.failPipelineOn === 'red' && summary.verdict === 'red') process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(4);
});
