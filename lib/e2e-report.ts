/**
 * Reads e2e's report.json (schema "report-1") and builds the nightly summary and verdict (docs/testing.md).
 * Uses only fields that are in the schema (node_modules/e2e/schema/report-v1.schema.json).
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { INTERRUPTED } from './run-e2e.ts';
import type { NightlyConfig, PhaseRun, Verdict } from './types.ts';

// ---------- minimal types for report.json ----------
interface Artifact { id: string; kind?: string; mediaType?: string; path?: string; url?: string }
interface E2EError { code?: string; message?: string; category?: string; source?: { file: string; line: number } }
interface Step { artifacts?: Artifact[] }
/** `expectedFailure`: the attempt was marked with `test.fail` (knownBug) — the reason, and the failure that made it pass. */
interface Attempt { status: string; artifacts?: Artifact[]; steps?: Step[]; error?: E2EError; failure?: { url?: string; screenshot?: string }; expectedFailure?: { reason: string; error?: E2EError } }
interface Result {
  kind: 'test' | 'setup'; titlePath: string[]; file: string; source?: { file: string; line: number }; tags?: string[]; selected: boolean;
  status: 'passed' | 'flaky' | 'failed' | 'timed-out' | 'interrupted' | 'skipped'; attempts?: Attempt[];
  expectedFailure?: { reason: string };
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
    status: 'passed' | 'failed' | 'blocked' | 'error' | 'interrupted'; exitCode: number; startedAt: string; finishedAt: string;
    results: Result[]; errors?: E2EError[];
    usage?: { modelTokens?: number };
    explore?: ExploreRecord;
  };
}

// ---------- nightly summary types ----------
interface TestRef { title: string; file: string; line?: number }
export interface TestFailure extends TestRef {
  /** Setup test (login, a module's test data): when it fails, every test that depends on it is skipped. */
  setup: boolean;
  tags: string[]; code?: string; message?: string; url?: string;
  screenshot?: string; trace?: string; video?: string;
}
export interface FindingView extends ExploreFinding { screenshot?: string }
export interface ExploreView {
  id: string; label: string; goal: string; ended: string; summary?: string;
  /** e2e's run status (when report.json was found): `blocked` = the agent could not explore anything, `error` = it never ran. */
  status?: Report['run']['status'];
  /** The setup test of `--session` failed — the exploration never started. */
  setupFailures: TestFailure[];
  steps: ExploreRecord['steps']; findings: FindingView[]; exitCode: number | null;
  durationMs: number; skipped?: string; runErrors: E2EError[]; modelTokens: number;
  module?: string; persona?: string; charter?: 'charter' | 'monkey';
}
/**
 * The result of one `e2e run` (smoke or regression). Counts and failures leave out known bugs (knownBug).
 * `skipped` = the whole stage did not run (with the reason); `skippedTests` = tests skipped within a run that did.
 */
export interface RunView {
  present: boolean; exitCode: number | null; durationMs: number; skipped?: string;
  passed: number; failed: number; flaky: number; skippedTests: number; total: number;
  failures: TestFailure[]; flakyTests: TestFailure[]; runErrors: E2EError[]; modelTokens: number;
  htmlReport?: string;
}
/** knownBug tests: `failing` the bug is still there (the runner counted an expected failure), `fixed` now passes (UNEXPECTED_PASS) — remove the mark. */
export interface KnownBugs { failing: TestFailure[]; fixed: TestRef[] }
export interface NightlySummary {
  verdict: Verdict; reasons: string[];
  smoke: RunView; regression: RunView; knownBugs: KnownBugs; explore: ExploreView[];
  issues: number; warnings: number; modelTokens: number;
}

/** This phase's raw output inside the final report folder: nightly.ts copies it here, the report's links point here. */
export const rawBase = (p: PhaseRun): string => (p.kind === 'explore' ? `raw/explore/${p.id}` : `raw/${p.kind}`);

/** Where the test is written: `file:line`. */
export const where = (t: TestRef): string => `${t.file}${t.line ? `:${t.line}` : ''}`;

/** "12/14 · 2 skipped" — skipped tests show next to the count, so a partial run does not look complete. */
export const passedOfTotal = (r: RunView): string => `${r.passed}/${r.total}${r.skippedTests ? ` · ${r.skippedTests} skipped` : ''}`;

/** The command that reruns the nightly's monkey charters with the same seed (the nightly runs on all modules; so does this). */
export const monkeyRerun = (seed: number): string => `MONKEY_SEED=${seed} npm run monkey`;

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

/** artifact id → path (relative to <output>/results) — looked up across results, attempts and steps */
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

/** base: `rawBase(phase)` */
function artifactHref(art: Artifact | undefined, base: string): string | undefined {
  if (!art) return undefined;
  if (art.url) return art.url;
  if (!art.path) return undefined;
  return `${base}/results/${art.path}`;
}

const toRef = (r: Result): TestRef => ({ title: r.titlePath.join(' › '), file: r.file, line: r.source?.line });

const failed = (r: Result): boolean => r.status === 'failed' || r.status === 'timed-out';

function toFailure(r: Result, idx: Map<string, Artifact>, phase: PhaseRun): TestFailure {
  const base = rawBase(phase);
  const failedAttempt = r.attempts?.findLast((a) => a.status !== 'passed') ?? r.attempts?.at(-1);
  const err = failedAttempt?.error;
  const shot =
    artifactHref(failedAttempt?.failure?.screenshot ? idx.get(failedAttempt.failure.screenshot) : undefined, base) ??
    artifactHref(failedAttempt?.artifacts?.find((a) => a.kind === 'screenshot'), base);
  const video = artifactHref(failedAttempt?.artifacts?.find((a) => a.kind === 'video' || a.mediaType?.startsWith('video/')), base);
  // trace.md: results/<test-dir>/trace.md — test-dir is the first segment of an artifact path
  const anyPath = failedAttempt?.artifacts?.find((a) => a.path)?.path;
  const testDir = anyPath?.split('/')[0];
  const trace = testDir && existsSync(join(phase.outputDir, 'results', testDir, 'trace.md'))
    ? `${base}/results/${testDir}/trace.md` : undefined;
  return {
    ...toRef(r), setup: r.kind === 'setup', tags: r.tags ?? [],
    code: err?.code, message: err?.message, url: failedAttempt?.failure?.url,
    screenshot: shot, trace, video,
  };
}

/**
 * The result of one `e2e run`, from each test's own result (not the run's summary numbers). Known bugs are
 * recognised by the runner's `test.fail` mark (lib/suites.ts → knownBug): expected failure = the bug is still there,
 * UNEXPECTED_PASS = it is fixed. Both go under "known bugs", the other tests into the counts and failures.
 */
function summarizeRun(phase: PhaseRun | undefined): { view: RunView; knownBugs: KnownBugs } {
  const view: RunView = {
    present: false, exitCode: phase?.exitCode ?? null, durationMs: phase?.durationMs ?? 0, skipped: phase?.skipped,
    passed: 0, failed: 0, flaky: 0, skippedTests: 0, total: 0,
    failures: [], flakyTests: [], runErrors: [], modelTokens: 0,
  };
  const knownBugs: KnownBugs = { failing: [], fixed: [] };
  if (!phase || phase.skipped) return { view, knownBugs };
  const report = readReport(phase.outputDir);
  if (!report) {
    view.runErrors.push({ code: 'NO_REPORT', message: `e2e run wrote no report.json (exit ${phase.exitCode}). See the CI log.` });
    return { view, knownBugs };
  }
  const idx = artifactIndex(report);
  const evidence = (r: Result) => toFailure(r, idx, phase);
  // Setup tests (login) included: a broken login must show up first
  const selected = report.run.results.filter((r) => r.selected);
  const stillBugs = selected.filter((r) => r.status === 'passed' && r.expectedFailure);
  const fixedBugs = selected.filter((r) => failed(r) && r.attempts?.at(-1)?.error?.code === 'UNEXPECTED_PASS');
  const tests = selected.filter((r) => !stillBugs.includes(r) && !fixedBugs.includes(r));
  const failures = tests.filter(failed).map(evidence);
  const flakyTests = tests.filter((r) => r.status === 'flaky').map(evidence);
  return {
    view: {
      ...view, present: true,
      passed: tests.filter((r) => r.status === 'passed').length,
      failed: failures.length,
      flaky: flakyTests.length,
      skippedTests: tests.filter((r) => r.status === 'skipped').length,
      total: tests.length,
      failures, flakyTests,
      runErrors: report.run.errors ?? [],
      modelTokens: report.run.usage?.modelTokens ?? 0,
      htmlReport: existsSync(join(phase.outputDir, 'report.html')) ? `${rawBase(phase)}/report.html` : undefined,
    },
    knownBugs: {
      failing: stillBugs.map((r) => {
        const cause = r.attempts?.at(-1)?.expectedFailure?.error;
        return { ...evidence(r), code: cause?.code, message: [r.expectedFailure!.reason, cause?.message].filter(Boolean).join('\n') };
      }),
      fixed: fixedBugs.map(toRef),
    },
  };
}

function summarizeExplore(phase: PhaseRun): ExploreView {
  const base: ExploreView = {
    id: phase.id, label: phase.label, goal: phase.label, ended: phase.skipped ? 'skipped' : 'no-report',
    setupFailures: [], steps: [], findings: [], exitCode: phase.exitCode, durationMs: phase.durationMs, skipped: phase.skipped,
    runErrors: [], modelTokens: 0, module: phase.module, persona: phase.persona, charter: phase.charter,
  };
  if (phase.skipped) return base;
  const report = readReport(phase.outputDir);
  if (!report) {
    return { ...base, runErrors: [{ code: 'NO_REPORT', message: `e2e explore wrote no report.json (exit ${phase.exitCode}). See the CI log.` }] };
  }
  const { status, results, explore: ex } = report.run;
  const idx = artifactIndex(report);
  const setupFailures = results.filter((r) => r.kind === 'setup' && failed(r)).map((r) => toFailure(r, idx, phase));
  const runErrors: E2EError[] = [...(report.run.errors ?? [])];
  // The exploration never ran (model key, site down, config) and e2e gave no run error → take the attempt's error
  if (!runErrors.length && !setupFailures.length && (status === 'error' || !ex)) {
    const err = results.flatMap((r) => r.attempts ?? []).map((a) => a.error).find(Boolean);
    runErrors.push(err ?? { code: `EXIT_${phase.exitCode}`, message: `e2e explore could not run (exit ${phase.exitCode}: 2 = config/model, 3 = site/infra). See the CI log.` });
  }
  const findings = [...(ex?.findings ?? [])]
    .sort((a, b) => (a.kind === b.kind ? b.severity - a.severity : a.kind === 'issue' ? -1 : 1))
    .map((f) => ({ ...f, screenshot: artifactHref(f.artifactId ? idx.get(f.artifactId) : undefined, rawBase(phase)) }));
  return {
    ...base, status, setupFailures, goal: ex?.goal ?? base.goal, ended: ex?.ended ?? base.ended, summary: ex?.summary,
    steps: ex?.steps ?? [], findings, runErrors, modelTokens: report.run.usage?.modelTokens ?? 0,
  };
}

export const SEVERITY: Record<number, string> = { 5: 'critical', 4: 'high', 3: 'medium', 2: 'low', 1: 'trivial' };

/**
 * The verdict rules: docs/testing.md → "Nightly pipeline". A known bug failing changes nothing — it is already known.
 * `interruptedAt` = the stage during which the run was interrupted (its result is not in the report).
 */
function decideVerdict(
  { smoke, regression, knownBugs, explore }: Pick<NightlySummary, 'smoke' | 'regression' | 'knownBugs' | 'explore'>,
  cfg: NightlyConfig, interruptedAt: string | undefined,
): { verdict: Verdict; reasons: string[] } {
  const red: string[] = [];
  const yellow: string[] = [];
  const errorLine = (e: E2EError) => `${e.code ?? 'ERROR'}${e.message ? ` — ${firstLine(e.message)}` : ''}`;
  // Setup failed = the rest of that run's tests never ran: this reason goes first, each setup once (with the number of runs)
  const setups = new Map<string, number>();
  const setupFailed = (tests: TestFailure[]) => {
    for (const t of tests) {
      const line = `Setup failed: "${t.title}" (${where(t)}) — ${errorLine(t)}`;
      setups.set(line, (setups.get(line) ?? 0) + 1);
    }
  };

  if (interruptedAt) yellow.push(`Run interrupted (during "${interruptedAt}") — the report covers only the stages that finished`);

  // Gate: a non-zero smoke exit code means the build is broken, and nightly.ts did not run the other stages
  if (!smoke.skipped && smoke.exitCode) {
    const notRun = [regression.skipped && 'regression', explore.some((x) => x.skipped) && 'exploration'].filter(Boolean);
    red.push(`Smoke did not pass (exit ${smoke.exitCode})${notRun.length ? ` — ${notRun.join(' and ')} did not run` : ''}`);
  }
  for (const [name, run] of [['Smoke', smoke], ['Regression', regression]] as const) {
    setupFailed(run.failures.filter((t) => t.setup));
    const broken = run.failures.filter((t) => !t.setup).length;
    for (const e of run.runErrors) red.push(`${name} run error: ${errorLine(e)}`);
    if (broken) red.push(`${broken} ${name.toLowerCase()} test(s) failed`);
    if (run.flaky > 0) yellow.push(`${run.flaky} flaky ${name.toLowerCase()} test(s) (passed on retry)`);
  }
  for (const t of knownBugs.fixed) yellow.push(`Known bug now passes: "${t.title}" — remove the knownBug mark (${where(t)})`);

  for (const x of explore) {
    if (x.skipped) continue;
    setupFailed(x.setupFailures);
    for (const e of x.runErrors) red.push(`Explore "${x.id}" error: ${errorLine(e)}`);
    const bad = x.findings.filter((f) => f.kind === 'issue' && f.severity >= cfg.verdict.failOnIssueSeverity);
    const minor = x.findings.length - bad.length;
    if (bad.length) red.push(`Explore "${x.id}": ${bad.length} ${SEVERITY[cfg.verdict.failOnIssueSeverity]}+ issue`);
    if (minor) yellow.push(`Explore "${x.id}": ${minor} minor issue/warning`);
    if (x.status === 'blocked') yellow.push(`Explore "${x.id}" blocked — the agent could not explore anything`);
    else if (!x.runErrors.length && (x.ended === 'stuck' || x.ended === 'aborted')) yellow.push(`Explore "${x.id}" did not finish (${x.ended})`);
  }

  const lead = [...setups].map(([line, runs]) => `${line}${runs > 1 ? ` — in ${runs} runs` : ''}`);
  if (lead.length || red.length) return { verdict: 'red', reasons: [...lead, ...red, ...yellow] };
  if (yellow.length) return { verdict: 'yellow', reasons: yellow };
  return { verdict: 'green', reasons: ['All tests passed, no major issue found'] };
}

export function summarize(phases: PhaseRun[], cfg: NightlyConfig): NightlySummary {
  const smoke = summarizeRun(phases.find((p) => p.kind === 'smoke')).view;
  const { view: regression, knownBugs } = summarizeRun(phases.find((p) => p.kind === 'regression'));
  const explore = phases.filter((p) => p.kind === 'explore').map(summarizeExplore);
  const findings = explore.flatMap((x) => x.findings);
  const interruptedAt = phases.find((p) => p.exitCode === INTERRUPTED)?.id;
  return {
    ...decideVerdict({ smoke, regression, knownBugs, explore }, cfg, interruptedAt), smoke, regression, knownBugs, explore,
    issues: findings.filter((f) => f.kind === 'issue').length,
    warnings: findings.filter((f) => f.kind === 'warning').length,
    modelTokens: smoke.modelTokens + regression.modelTokens + explore.reduce((n, x) => n + x.modelTokens, 0),
  };
}

export function firstLine(s: string): string {
  return s.split('\n')[0].slice(0, 200);
}
