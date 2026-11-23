/** Raat ki pipeline: smoke gate → full run (regression + known bugs) → exploratory charters → monkey. docs/testing.md */
export interface NightlyConfig {
  appName: string;
  /**
   * Har stage ki apni time limit (`maxMinutes`): raat khud khatam ho aur report hamesha bane — CI job ka
   * timeout in sab ke jod se upar rakho (CI kill pe report nahi banti).
   * Pehla gate: smoke fail to baaki stages nahi chalte (toota build model calls na khaaye).
   */
  smoke: { enabled: boolean; maxMinutes: number };
  /** Poora suite ek hi run me; known bugs (knownBug) report me alag gine jaate hain. */
  regression: { enabled: boolean; maxMinutes: number };
  /**
   * Raat ka exploration budget — modules badhne se raat lambi na ho, isliye ginti yahan tay hai:
   * har raat `charters` likhe hue charters (sab modules me se, seed se ghoomte hue) + `monkey.count` monkey.
   */
  explore: {
    enabled: boolean;
    /** Har raat kitne likhe hue charters. */
    charters: number;
    /** Ek charter ke exploration steps (1–100), jab charter khud na bataye. */
    maxSteps: number;
    /** Ek charter ki time limit, minutes (3–120). */
    charterMinutes: number;
    /** Har raat itne random monkey charters (0 = band), aur har ek ke steps. */
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
  /** Report me dikhne wala naam; explore ke liye charter ka goal. */
  label: string;
  /** e2e output dir for this phase (relative to repo root) */
  outputDir: string;
  exitCode: number | null;
  durationMs: number;
  skipped?: string;
  /** Explore: kis module ka charter, kis persona se, likha hua charter ya monkey. */
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
  /** Monkey charters ka seed — wahi seed dobara do to wahi routes milte hain. */
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
