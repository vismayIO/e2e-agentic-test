import { spawn } from 'node:child_process';

/** e2e ka exit code jab run roka gaya (Ctrl-C / CI cancel): e2e docs → reference/cli → "Exit codes". */
export const INTERRUPTED = 130;

/**
 * `e2e` CLI ko child process me chalata hai — scripts/suite.ts aur scripts/nightly.ts dono isi se.
 * Repo root se chalao (npm scripts yahi karte hain). Output seedha terminal pe jaata hai.
 * Exit codes: e2e docs → reference/cli → "Exit codes". `code` null = process signal se mara.
 *
 * Rokna (e2e docs → reference/cli → "Signals": pehla signal cleanup karke report likhta hai aur exit 130,
 * doosra zabardasti rokta hai — isliye child ko signal ek hi baar pahunchna chahiye):
 *   SIGINT  (Ctrl-C)    terminal use poore process group ko deta hai, child ko bhi. Yahan se aage nahi bhejte;
 *                       khaali handler sirf isliye ki parent zinda rahe aur apni report likh sake.
 *   SIGTERM (CI cancel) sirf parent ko milta hai, isliye child ko aage bhejte hain.
 *
 * Shell ke bina, taaki charter goals (jinme `< > " %` hote hain) jaise ke taise pahunchein — isliye
 * Linux/macOS: Windows ka `.cmd` shim shell ke bina nahi chalta.
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
      console.error(`e2e start nahi hua: ${err.message}`);
      finish(4);
    });
  });
}
