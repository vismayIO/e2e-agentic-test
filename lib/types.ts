/** The nightly pipeline: smoke gate → full run (regression + known bugs) → exploratory charters → monkey. docs/testing.md */
export interface NightlyConfig {
  appName: string;
  /**
   * Each stage has its own time limit (`maxMinutes`): the night ends by itself and the report is always written —
   * keep the CI job's timeout above the sum of them (a CI kill leaves no report).
   * First gate: if smoke fails the other stages do not run (a broken build must not burn model calls).
   */
  smoke: { enabled: boolean; maxMinutes: number };
  /** The whole suite in one run; known bugs (knownBug) are counted separately in the report. */
  regression: { enabled: boolean; maxMinutes: number };
  /**
   * The night's exploration budget — more modules must not make the night longer, so the counts are fixed here:
   * every night `charters` written charters (from all modules, rotating by seed) + `monkey.count` monkey.
   */
  explore: {
    enabled: boolean;
    /** How many written charters every night. */
    charters: number;
    /** Exploration steps of one charter (1–100), when the charter does not say. */
    maxSteps: number;
    /** Time limit of one charter, minutes (3–120). */
    charterMinutes: number;
    /** This many random monkey charters every night (0 = off), and the steps of each. */
    monkey: { count: number; maxSteps: number };
  };
  verdict: { failOnIssueSeverity: number };
  failPipelineOn: 'red' | 'never';
  historyLimit: number;
}

export type Verdict = 'green' | 'yellow' | 'red';

export interface PhaseRun {
  kind: 'smoke' | 'regression' | 'explore';
  id: string;
  /** The name shown in the report; for explore, the charter's goal. */
  label: string;
  /** e2e output dir for this phase (relative to repo root) */
  outputDir: string;
  exitCode: number | null;
  durationMs: number;
  skipped?: string;
  /** Explore: which module's charter, with which persona, written charter or monkey. */
  module?: string;
  persona?: string;
  charter?: 'charter' | 'monkey';
}

export interface NightlyRunMeta {
  appName: string;
  appUrl: string;
  startedAt: string;
  finishedAt: string;
  ciRunUrl?: string;
  model?: string;
  /** The monkey charters' seed — give the same seed again to get the same routes. */
  monkeySeed?: number;
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
