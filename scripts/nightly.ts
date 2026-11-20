/**
 * Nightly QA orchestrator
 *
 *   node scripts/nightly.ts                 # poora run: regression → explore → report → notify
 *   node scripts/nightly.ts --only regression
 *   node scripts/nightly.ts --only explore
 *   node scripts/nightly.ts --report-only   # pichhle outputs se sirf report dobara banao
 *
 * Output:  nightly-report/index.html  (+ summary.md, summary.json, raw/)
 * History: .nightly-history/history.json  (CI cache me rakho → trend chart)
 * Exit:    1 agar verdict RED (aur failPipelineOn = 'red'), warna 0
 */
import { spawn } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import config from '../nightly.config.ts';
import { env, hasLogin } from '../lib/env.ts';
import { summarize } from '../lib/e2e-report.ts';
import { renderHtml, renderMarkdown } from '../lib/html.ts';
import { notify } from '../lib/notify.ts';
import type { HistoryEntry, NightlyRunMeta, PhaseRun } from '../lib/types.ts';

const ROOT = resolve(import.meta.dirname, '..');
const RAW = join(ROOT, '.e2e', 'nightly');
const OUT = join(ROOT, env('NIGHTLY_REPORT_DIR') ?? 'nightly-report');
const HISTORY_DIR = join(ROOT, env('NIGHTLY_HISTORY_DIR') ?? '.nightly-history');
const E2E_BIN = join(ROOT, 'node_modules', '.bin', process.platform === 'win32' ? 'e2e.cmd' : 'e2e');

const args = process.argv.slice(2);
const reportOnly = args.includes('--report-only');
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : undefined;

function ciRunUrl(): string | undefined {
  if (env('GITHUB_RUN_ID')) {
    return `${env('GITHUB_SERVER_URL') ?? 'https://github.com'}/${env('GITHUB_REPOSITORY')}/actions/runs/${env('GITHUB_RUN_ID')}`;
  }
  if (env('BUILD_BUILDID') && env('SYSTEM_COLLECTIONURI')) {
    return `${env('SYSTEM_COLLECTIONURI')}${encodeURIComponent(env('SYSTEM_TEAMPROJECT') ?? '')}/_build/results?buildId=${env('BUILD_BUILDID')}`;
  }
  return undefined;
}

function modelLabel(): string | undefined {
  if (env('AZURE_API_KEY')) return `azure/${env('AZURE_OPENAI_DEPLOYMENT') ?? 'gpt-6-luna'}`;
  if (env('ANTHROPIC_API_KEY')) return `anthropic/${env('ANTHROPIC_MODEL') ?? 'claude-sonnet-5-5'}`;
  if (env('OPENAI_API_KEY')) return `openai/${env('OPENAI_MODEL') ?? 'gpt-6-luna'}`;
  if (env('AI_GATEWAY_API_KEY')) return `gateway/${env('AI_GATEWAY_MODEL') ?? 'openai/gpt-6-luna-fast'}`;
  return undefined;
}

function runE2E(argv: string[]): Promise<{ code: number | null; ms: number }> {
  const t0 = Date.now();
  console.log(`\n$ e2e ${argv.map((a) => (/\s/.test(a) ? JSON.stringify(a) : a)).join(' ')}`);
  return new Promise((done) => {
    const child = spawn(E2E_BIN, argv, { cwd: ROOT, stdio: 'inherit', env: process.env, shell: process.platform === 'win32' });
    const stop = () => child.kill('SIGINT');
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
    child.on('close', (code) => {
      process.off('SIGINT', stop);
      process.off('SIGTERM', stop);
      done({ code, ms: Date.now() - t0 });
    });
    child.on('error', (err) => {
      console.error(`e2e start nahi hua: ${err.message}`);
      done({ code: 4, ms: Date.now() - t0 });
    });
  });
}

async function runPhases(): Promise<PhaseRun[]> {
  const phases: PhaseRun[] = [];
  rmSync(RAW, { recursive: true, force: true });
  mkdirSync(RAW, { recursive: true });

  // 1) Regression suite
  if (config.regression.enabled && only !== 'explore') {
    const outputDir = join(RAW, 'regression');
    const argv = ['run', '--output', outputDir, '--pass-with-no-tests'];
    for (const t of config.regression.tags ?? []) argv.push('--tag', t);
    if (config.regression.workers) argv.push('--workers', String(config.regression.workers));
    const { code, ms } = await runE2E(argv);
    phases.push({ kind: 'regression', id: 'regression', label: 'Regression tests', outputDir, exitCode: code, durationMs: ms });
  }

  // 2) Agentic exploration — ek goal ek ke baad ek (site pe load kam, logs saaf)
  if (only !== 'regression') {
    for (const g of config.explore) {
      const outputDir = join(RAW, 'explore', g.id);
      if (g.session && !hasLogin()) {
        phases.push({ kind: 'explore', id: g.id, label: g.goal, outputDir, exitCode: null, durationMs: 0,
          skipped: `session "${g.session}" ke liye E2E_USER_QA_USERNAME / E2E_USER_QA_PASSWORD set nahi hai` });
        continue;
      }
      const argv = ['explore', g.goal, '--output', outputDir, '--reporter', 'list,markdown',
        '--max-steps', String(g.maxSteps ?? 8)];
      if (g.timeoutMs) argv.push('--timeout', String(g.timeoutMs));
      if (g.session) argv.push('--session', g.session);
      const { code, ms } = await runE2E(argv);
      phases.push({ kind: 'explore', id: g.id, label: g.goal, outputDir, exitCode: code, durationMs: ms });
    }
  }
  writeFileSync(join(RAW, 'phases.json'), JSON.stringify(phases, null, 2));
  return phases;
}

/** raw outputs report folder me copy — sessions (login state) aur ai-trace kabhi nahi */
function copyRaw(phases: PhaseRun[]): void {
  for (const p of phases) {
    if (p.skipped || !existsSync(p.outputDir)) continue;
    const dest = p.kind === 'regression' ? join(OUT, 'raw', 'regression') : join(OUT, 'raw', 'explore', p.id);
    cpSync(p.outputDir, dest, {
      recursive: true,
      filter: (src) => !/[\\/](sessions)([\\/]|$)/.test(src) && !src.endsWith('ai-trace.json'),
    });
  }
}

function loadHistory(): HistoryEntry[] {
  const file = join(HISTORY_DIR, 'history.json');
  if (!existsSync(file)) return [];
  try {
    const h = JSON.parse(readFileSync(file, 'utf8'));
    return Array.isArray(h) ? h : [];
  } catch {
    return [];
  }
}

async function main() {
  const startedAt = new Date().toISOString();
  const appUrl = env('APP_URL');
  if (!appUrl) {
    console.error('APP_URL set karo (jaise https://staging.myapp.com)');
    process.exit(2);
  }

  let phases: PhaseRun[];
  if (reportOnly) {
    const f = join(RAW, 'phases.json');
    if (!existsSync(f)) {
      console.error(`${f} nahi mila — pehle poora run chalao`);
      process.exit(2);
    }
    phases = JSON.parse(readFileSync(f, 'utf8'));
  } else {
    phases = await runPhases();
  }

  const summary = summarize(phases, config);
  const meta: NightlyRunMeta = {
    appName: config.appName, appUrl, startedAt, finishedAt: new Date().toISOString(),
    ciRunUrl: ciRunUrl(), model: modelLabel(), phases,
  };

  // History (trend) — report-only rerun pe duplicate entry na bane
  const history = loadHistory();
  if (!reportOnly) {
    history.push({
      date: startedAt, verdict: summary.verdict,
      passed: summary.regression.passed, failed: summary.regression.failed, flaky: summary.regression.flaky,
      issues: summary.issues, warnings: summary.warnings,
      durationMs: phases.reduce((n, p) => n + (p.durationMs ?? 0), 0), runUrl: meta.ciRunUrl,
    });
  }
  const trimmed = history.slice(-config.historyLimit);
  mkdirSync(HISTORY_DIR, { recursive: true });
  writeFileSync(join(HISTORY_DIR, 'history.json'), JSON.stringify(trimmed, null, 2));

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
  console.log(`Report: ${join(OUT, 'index.html')}`);

  if (!reportOnly || args.includes('--notify')) await notify(meta, summary, env('NIGHTLY_REPORT_URL'));

  if (config.failPipelineOn === 'red' && summary.verdict === 'red') process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(4);
});
