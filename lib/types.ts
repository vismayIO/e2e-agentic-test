export interface ExploreGoal {
  /** Folder/report ke liye chhota naam: a-z, 0-9, - */
  id: string;
  /** Ek sentence: kahan jaana hai aur kis nazariye se */
  goal: string;
  /** 1–100, default 8 */
  maxSteps?: number;
  /** ms, 180000–7200000, default 600000 */
  timeoutMs?: number;
  /** Setup test ka session (jaise 'qa'); login configure na ho to goal skip */
  session?: string;
}

export interface NightlyConfig {
  appName: string;
  regression: { enabled: boolean; tags?: string[]; workers?: number };
  explore: ExploreGoal[];
  verdict: { failOnIssueSeverity: number; flakyIsWarning: boolean };
  failPipelineOn: 'red' | 'never';
  historyLimit: number;
}

export type Verdict = 'green' | 'yellow' | 'red';

export interface PhaseRun {
  kind: 'regression' | 'explore';
  id: string;
  label: string;
  /** e2e output dir for this phase (relative to repo root) */
  outputDir: string;
  exitCode: number | null;
  durationMs: number;
  skipped?: string;
}

export interface NightlyRunMeta {
  appName: string;
  appUrl: string;
  startedAt: string;
  finishedAt: string;
  ciRunUrl?: string;
  model?: string;
  phases: PhaseRun[];
}

/** One line of history.json — enough to draw the trend */
export interface HistoryEntry {
  date: string;
  verdict: Verdict;
  passed: number;
  failed: number;
  flaky: number;
  issues: number;
  warnings: number;
  durationMs: number;
  runUrl?: string;
}
