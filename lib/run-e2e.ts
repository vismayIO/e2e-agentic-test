import { spawn } from 'node:child_process';

/** e2e's exit code when the run was interrupted (Ctrl-C / CI cancel): e2e docs → reference/cli → "Exit codes". */
export const INTERRUPTED = 130;

/**
 * Runs the `e2e` CLI in a child process — both scripts/suite.ts and scripts/nightly.ts use this.
 * Run from the repo root (the npm scripts do). Output goes straight to the terminal.
 * Exit codes: e2e docs → reference/cli → "Exit codes". `code` null = the process was killed by a signal.
 *
 * Stopping (e2e docs → reference/cli → "Signals": the first signal cleans up, writes the report and exits 130,
 * the second stops by force — so a signal must reach the child only once):
 *   SIGINT  (Ctrl-C)    the terminal gives it to the whole process group, the child too. Not forwarded from here;
 *                       the empty handler only keeps the parent alive so it can write its report.
 *   SIGTERM (CI cancel) reaches only the parent, so it is forwarded to the child.
 *
 * Without a shell, so that charter goals (which contain `< > " %`) arrive as they are — hence
 * Linux/macOS: Windows' `.cmd` shim does not run without a shell.
 */
export function runE2E(argv: readonly string[]): Promise<{ code: number | null; ms: number }> {
  const t0 = Date.now();
  console.log(`\n$ e2e ${argv.map((a) => (/\s/.test(a) ? JSON.stringify(a) : a)).join(' ')}`);
  return new Promise((done) => {
    const child = spawn('node_modules/.bin/e2e', argv, { stdio: 'inherit' });
    const survive = () => {};
    const forward = () => child.kill('SIGTERM');
    process.on('SIGINT', survive);
    process.on('SIGTERM', forward);
    const finish = (code: number | null) => {
      process.off('SIGINT', survive);
      process.off('SIGTERM', forward);
      done({ code, ms: Date.now() - t0 });
    };
    child.on('close', finish);
    child.on('error', (err) => {
      console.error(`e2e did not start: ${err.message}`);
      finish(4);
    });
  });
}
