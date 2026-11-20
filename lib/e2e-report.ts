/**
 * e2e ke report.json (schema "report-1") ko padh ke nightly summary banata hai.
 * Sirf woh fields use karte hain jo docs me documented hain; baaki optional maan ke chalte hain.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { NightlyConfig, PhaseRun, Verdict } from './types.ts';

// ---------- report.json ke minimal types ----------
interface Artifact { id: string; kind?: string; mediaType?: string; path?: string; url?: string }
interface E2EError { code?: string; message?: string; category?: string; source?: { file: string; line: number } }
interface Step { artifacts?: Artifact[] }
interface Attempt { status: string; durationMs?: number; artifacts?: Artifact[]; steps?: Step[]; error?: E2EError; failure?: { url?: string; screenshot?: string } }
interface Result {
  id: string; kind?: string; titlePath: string[]; file: string; source?: { file: string; line: number };
  tags?: string[]; selected: boolean; status: string; attempts?: Attempt[]; error?: E2EError;
}
interface ExploreFinding {
  id: string; step?: number; kind: 'issue' | 'warning'; severity: number; title: string;
  expected?: string; actual?: string; reproduction?: string[]; path?: string; artifactId?: string;
}
interface ExploreRecord {
  goal: string; ended: string; summary?: string;
  steps: { index: number; title: string; status: string; summary?: string; errorCode?: string; durationMs?: number }[];
  findings: ExploreFinding[];
}
interface Report {
  schemaVersion: string;
  run: {
    status: string; exitCode: number; startedAt: string; finishedAt: string;
    results: Result[]; errors?: E2EError[];
    summary?: { selected: number; passed: number; failed: number; flaky: number; skipped: number; interrupted: number };
    usage?: { modelTokens?: number };
    explore?: ExploreRecord;
  };
}

// ---------- nightly summary types ----------
export interface TestFailure {
  title: string; file: string; line?: number; tags: string[];
  code?: string; message?: string; url?: string;
  screenshot?: string; trace?: string; video?: string;
}
export interface FindingView extends ExploreFinding { screenshot?: string }
export interface ExploreView {
  id: string; label: string; goal: string; ended: string; summary?: string;
  steps: ExploreRecord['steps']; findings: FindingView[]; exitCode: number | null;
  durationMs: number; skipped?: string; runErrors: E2EError[]; modelTokens: number;
}
export interface RegressionView {
  present: boolean; exitCode: number | null; durationMs: number; skipped?: string;
  passed: number; failed: number; flaky: number; skipped_: number; interrupted: number; total: number;
  failures: TestFailure[]; flakyTests: TestFailure[]; runErrors: E2EError[]; modelTokens: number;
  htmlReport?: string;
}
export interface NightlySummary {
  verdict: Verdict; reasons: string[];
  regression: RegressionView; explore: ExploreView[];
  issues: number; warnings: number; modelTokens: number;
}

function readReport(dir: string): Report | undefined {
  const file = join(dir, 'report.json');
  if (!existsSync(file)) return undefined;
  try {
    const r = JSON.parse(readFileSync(file, 'utf8')) as Report;
    return r?.run ? r : undefined;
  } catch {
    return undefined;
  }
}

/** artifact id → path (relative to <output>/results) — results, attempts aur steps sab me dhoondo */
function artifactIndex(report: Report): Map<string, Artifact> {
  const map = new Map<string, Artifact>();
  for (const r of report.run.results ?? []) {
    for (const a of r.attempts ?? []) {
      for (const art of a.artifacts ?? []) map.set(art.id, art);
      for (const s of a.steps ?? []) for (const art of s.artifacts ?? []) map.set(art.id, art);
    }
  }
  return map;
}

/** rawBase: final report folder ke andar is phase ka raw output (jaise "raw/regression") */
function artifactHref(art: Artifact | undefined, rawBase: string): string | undefined {
  if (!art) return undefined;
  if (art.url) return art.url;
  if (!art.path) return undefined;
  return `${rawBase}/results/${art.path}`;
}

function toFailure(r: Result, idx: Map<string, Artifact>, rawBase: string, outputDir: string): TestFailure {
  const attempts = r.attempts ?? [];
  const last = attempts[attempts.length - 1];
  const failedAttempt = [...attempts].reverse().find((a) => a.status !== 'passed') ?? last;
  const err = r.error ?? failedAttempt?.error;
  const shot =
    artifactHref(failedAttempt?.failure?.screenshot ? idx.get(failedAttempt.failure.screenshot) : undefined, rawBase) ??
    artifactHref(failedAttempt?.artifacts?.find((a) => a.kind === 'screenshot'), rawBase);
  const video = artifactHref(failedAttempt?.artifacts?.find((a) => a.kind === 'video' || a.mediaType?.startsWith('video/')), rawBase);
  // trace.md: results/<test-dir>/trace.md — test-dir artifact path ka pehla segment hai
  const anyPath = failedAttempt?.artifacts?.find((a) => a.path)?.path;
  const testDir = anyPath?.split('/')[0];
  const trace = testDir && existsSync(join(outputDir, 'results', testDir, 'trace.md'))
    ? `${rawBase}/results/${testDir}/trace.md` : undefined;
  return {
    title: r.titlePath.join(' › '), file: r.file, line: r.source?.line, tags: r.tags ?? [],
    code: err?.code, message: err?.message, url: failedAttempt?.failure?.url,
    screenshot: shot, trace, video,
  };
}

export function summarizeRegression(phase: PhaseRun | undefined, rawBase: string): RegressionView {
  const empty: RegressionView = {
    present: false, exitCode: phase?.exitCode ?? null, durationMs: phase?.durationMs ?? 0, skipped: phase?.skipped,
    passed: 0, failed: 0, flaky: 0, skipped_: 0, interrupted: 0, total: 0,
    failures: [], flakyTests: [], runErrors: [], modelTokens: 0,
  };
  if (!phase || phase.skipped) return empty;
  const report = readReport(phase.outputDir);
  if (!report) {
    return { ...empty, runErrors: [{ code: 'NO_REPORT', message: `e2e run ne report.json nahi likha (exit ${phase.exitCode}). CI log dekho.` }] };
  }
  const idx = artifactIndex(report);
  // Setup tests (login) bhi shaamil: login toota to woh sabse pehle dikhna chahiye
  const selected = report.run.results.filter((r) => r.selected);
  const s = report.run.summary;
  const failures = selected.filter((r) => r.status === 'failed' || r.status === 'timedOut' || r.status === 'timed-out')
    .map((r) => toFailure(r, idx, rawBase, phase.outputDir));
  const flakyTests = selected.filter((r) => r.status === 'flaky').map((r) => toFailure(r, idx, rawBase, phase.outputDir));
  return {
    present: true, exitCode: phase.exitCode, durationMs: phase.durationMs,
    passed: s?.passed ?? selected.filter((r) => r.status === 'passed').length,
    failed: s?.failed ?? failures.length,
    flaky: s?.flaky ?? flakyTests.length,
    skipped_: s?.skipped ?? 0,
    interrupted: s?.interrupted ?? 0,
    total: s?.selected ?? selected.length,
    failures, flakyTests,
    runErrors: report.run.errors ?? [],
    modelTokens: report.run.usage?.modelTokens ?? 0,
    htmlReport: existsSync(join(phase.outputDir, 'report.html')) ? `${rawBase}/report.html` : undefined,
  };
}

export function summarizeExplore(phase: PhaseRun, rawBase: string): ExploreView {
  const base: ExploreView = {
    id: phase.id, label: phase.label, goal: phase.label, ended: phase.skipped ? 'skipped' : 'no-report',
    steps: [], findings: [], exitCode: phase.exitCode, durationMs: phase.durationMs, skipped: phase.skipped,
    runErrors: [], modelTokens: 0,
  };
  if (phase.skipped) return base;
  const report = readReport(phase.outputDir);
  const ex = report?.run.explore;
  if (!report || !ex) {
    return {
      ...base,
      runErrors: report?.run.errors?.length
        ? report.run.errors
        : [{ code: 'NO_REPORT', message: `e2e explore ne exploration record nahi likha (exit ${phase.exitCode}). CI log dekho.` }],
    };
  }
  const idx = artifactIndex(report);
  // Explore khud chal hi nahi paaya (model key, site down, config) → result/attempt ka error uthao
  const runErrors: E2EError[] = [...(report.run.errors ?? [])];
  if (!runErrors.length && (phase.exitCode ?? 0) >= 2) {
    const res = report.run.results.find((r) => r.selected);
    const err = res?.error ?? res?.attempts?.map((a) => a.error).find(Boolean);
    runErrors.push(err ?? { code: `EXIT_${phase.exitCode}`, message: `e2e explore exit ${phase.exitCode} (2 = config/model, 3 = site/infra). CI log dekho.` });
  }
  const findings = [...(ex.findings ?? [])]
    .sort((a, b) => (a.kind === b.kind ? b.severity - a.severity : a.kind === 'issue' ? -1 : 1))
    .map((f) => ({ ...f, screenshot: artifactHref(f.artifactId ? idx.get(f.artifactId) : undefined, rawBase) }));
  return {
    ...base, goal: ex.goal, ended: ex.ended, summary: ex.summary, steps: ex.steps ?? [], findings,
    runErrors, modelTokens: report.run.usage?.modelTokens ?? 0,
  };
}

export const SEVERITY: Record<number, string> = { 5: 'critical', 4: 'high', 3: 'medium', 2: 'low', 1: 'trivial' };

export function decideVerdict(
  regression: RegressionView, explore: ExploreView[], cfg: NightlyConfig,
): { verdict: Verdict; reasons: string[] } {
  const red: string[] = [];
  const yellow: string[] = [];

  for (const e of regression.runErrors) red.push(`Regression run error: ${e.code ?? 'ERROR'}${e.message ? ` — ${firstLine(e.message)}` : ''}`);
  if (regression.failed > 0) red.push(`${regression.failed} regression test fail`);
  if (regression.interrupted > 0) yellow.push(`${regression.interrupted} test beech me ruk gaye (interrupted)`);
  if (cfg.verdict.flakyIsWarning && regression.flaky > 0) yellow.push(`${regression.flaky} flaky test (retry pe pass)`);

  for (const x of explore) {
    if (x.skipped) continue;
    for (const e of x.runErrors) red.push(`Explore "${x.id}": ${e.code ?? 'ERROR'}${e.message ? ` — ${firstLine(e.message)}` : ''}`);
    const bad = x.findings.filter((f) => f.kind === 'issue' && f.severity >= cfg.verdict.failOnIssueSeverity);
    const minor = x.findings.filter((f) => !(f.kind === 'issue' && f.severity >= cfg.verdict.failOnIssueSeverity));
    if (bad.length) red.push(`Explore "${x.id}": ${bad.length} ${SEVERITY[cfg.verdict.failOnIssueSeverity]}+ issue`);
    if (minor.length) yellow.push(`Explore "${x.id}": ${minor.length} chhote issue/warning`);
    if (!x.runErrors.length && (x.ended === 'stuck' || x.ended === 'aborted')) yellow.push(`Explore "${x.id}" poora nahi hua (${x.ended})`);
  }

  if (red.length) return { verdict: 'red', reasons: [...red, ...yellow] };
  if (yellow.length) return { verdict: 'yellow', reasons: yellow };
  return { verdict: 'green', reasons: ['Sab tests pass, koi bada issue nahi mila'] };
}

export function summarize(phases: PhaseRun[], cfg: NightlyConfig): NightlySummary {
  const regression = summarizeRegression(phases.find((p) => p.kind === 'regression'), 'raw/regression');
  const explore = phases.filter((p) => p.kind === 'explore').map((p) => summarizeExplore(p, `raw/explore/${p.id}`));
  const { verdict, reasons } = decideVerdict(regression, explore, cfg);
  const all = explore.flatMap((x) => x.findings);
  return {
    verdict, reasons, regression, explore,
    issues: all.filter((f) => f.kind === 'issue').length,
    warnings: all.filter((f) => f.kind === 'warning').length,
    modelTokens: regression.modelTokens + explore.reduce((n, x) => n + x.modelTokens, 0),
  };
}

export function firstLine(s: string): string {
  return s.split('\n')[0].slice(0, 200);
}
