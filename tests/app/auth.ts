import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { expect } from 'e2e';
import { env } from '../../lib/env.ts';
import { latestCode, mailosaurConfigured } from '../../lib/mailosaur.ts';
import type { Ctx } from './ui.ts';

/**
 * Login to the Motadata console — one for every module's setup.
 *
 * Sign-in is by email code; the code is read from the Mailosaur inbox (lib/mailosaur.ts), not a fixed OTP.
 * The app keeps the login in httpOnly cookies, and e2e's `session.save` keeps cookies and localStorage —
 * so the session a setup saves opens signed in, in tests and in `e2e explore` alike.
 *
 * A session lives for one run only, and each run (and each module's setup) should not ask for a new OTP, so
 * the login state is also written to `.auth/admin.json`: the next setup applies that first, and a new OTP is
 * needed only once it has expired. `.auth/` is gitignored: it holds tokens. Setups run at the same time in
 * separate worker processes, so the file is written atomically and the OTP login happens inside a lock
 * (`adminSignIn`).
 */

/** The admin's display name, as the app shows it ("Invited by", "Disabled by", owner). */
export const ADMIN_NAME = env('APP_ADMIN_NAME') ?? 'Test User';

/**
 * The light signed-in session: the admin login only, no test data (made by `admin.setup.e2e.ts`). Smoke tests
 * and explore charters run on it — its setup takes seconds. A module that needs data of its own
 * makes its own session (such as `iam`).
 */
export const ADMIN_SESSION = 'admin';

/**
 * The console admin's Mailosaur address (…@<server>.mailosaur.net); the OTP arrives here. Login is required:
 * without the settings, a clear error right here — the setup fails and the run ends non-zero, no silent skip.
 * Not at config load, so that `e2e list` and `npm run verify` run without secrets.
 */
function adminEmail(): string {
  const email = env('APP_ADMIN_EMAIL');
  if (!email || !mailosaurConfigured()) {
    throw new Error('set APP_ADMIN_EMAIL, MAILOSAUR_API_KEY and MAILOSAUR_SERVER_ID for the admin login (see .env.example)');
  }
  return email;
}

/**
 * One sign-in attempt: enter the email on /login and request a code, read the code that arrived in Mailosaur
 * after that request, type it. The code has 6 separate boxes (one digit each, then focus moves on), so type
 * key by key into the first box; the app verifies by itself once the sixth digit is typed.
 * Returns the app's error message if it showed an alert instead of signing in, otherwise `undefined` (signed in).
 */
async function signInOnce({ app, screen, browser }: Ctx, email: string): Promise<string | undefined> {
  const alert = screen.getByRole('alert').first();
  await app.open('/login');
  await screen.getByRole('textbox', 'Work email').fill(email);
  const requestedAt = new Date();
  await screen.getByRole('button', 'Email me a sign-in code').tap();
  const otp = screen.getByRole('textbox', 'OTP digit 1 of 6');
  await expect(otp.or(alert)).toBeVisible({ timeout: 60_000 });
  if (!(await otp.isVisible())) return (await alert.textContent()) ?? '';

  await otp.pressSequentially(await latestCode(email, requestedAt));
  const left = async () => !/\/login/.test(await browser.url());
  await expect
    .poll(async () => (await left()) || (await alert.isVisible()), { timeout: 60_000, message: `sign-in (${email}): after the code, neither the app opened nor an error appeared` })
    .toBe(true);
  return (await left()) ? undefined : ((await alert.textContent()) ?? '');
}

/**
 * Sign in by email code. After being idle, the test environment's sign-in service fails its first one or two
 * requests (23–24 Nov 2026, the first sign-in of every run: "Request timed out.", or "Your code was accepted,
 * but the sign-in service did not open a session. Request a new code and try again."), and a failed code does
 * not work again. So do what the app says: request a new code and retry, at most 3 attempts, every error logged.
 * This is setup provisioning; the sign-in tests themselves do not go through this helper.
 */
export async function signIn(fx: Ctx, email: string): Promise<void> {
  const errors: string[] = [];
  while (errors.length < 3) {
    const error = await signInOnce(fx, email);
    if (error === undefined) return;
    errors.push(error);
    console.warn(`[login] ${email}: the app did not sign in ("${error}") — attempt ${errors.length}/3`);
  }
  throw new Error(`sign-in (${email}): failed after 3 attempts — ${errors.join(' | ')}`);
}

/** An invitee's first sign-in: the name on /welcome (required), the other details skipped. */
export async function completeWelcome({ screen, browser }: Pick<Ctx, 'browser' | 'screen'>, given: string, last: string): Promise<void> {
  await expect(browser).toHaveURL(/\/welcome/, { timeout: 30_000 });
  await screen.getByRole('textbox', /^Given name/).fill(given);
  await screen.getByRole('textbox', /^Last name/).fill(last);
  await screen.getByRole('button', 'Next').tap();
  await screen.getByRole('button', 'Skip for now').or(screen.getByRole('button', 'Continue')).first().tap();
  await expect(browser).not.toHaveURL(/\/welcome/, { timeout: 30_000 });
}

type Cookie = Awaited<ReturnType<Ctx['browser']['cookies']>>[number];
interface AuthState { cookies: Cookie[]; local: Record<string, string> }

const ADMIN_AUTH = '.auth/admin.json';

/** The current browser's login: cookies + localStorage. */
async function captureAuth({ browser }: Pick<Ctx, 'browser'>): Promise<AuthState> {
  const local = (await browser.evaluate(() => Object.fromEntries(Object.entries(localStorage)))) as AuthState['local'];
  return { cookies: await browser.cookies(), local };
}

/** Apply a saved login: cookies, and localStorage on the app's origin — the next page load reads them. */
async function restoreAuth({ app, browser }: Pick<Ctx, 'app' | 'browser'>, state: AuthState): Promise<void> {
  if (state.cookies.length) await browser.setCookies(state.cookies);
  await app.open('/login');
  await browser.evaluate((local: AuthState['local']) => {
    for (const [k, v] of Object.entries(local)) localStorage.setItem(k, v);
    return null;
  }, state.local);
}

/** Does the login work? A signed-in console shows `main`; otherwise the app sends you to the sign-in page. */
async function signedIn({ app, screen }: Ctx): Promise<boolean> {
  await app.open('/');
  const signInButton = screen.getByRole('button', 'Email me a sign-in code');
  await expect(screen.getByRole('main').or(signInButton)).toBeVisible({ timeout: 30_000 });
  return !(await signInButton.isVisible());
}

/** Apply the saved admin login to this browser; `true` if the app accepts it. */
async function reuseAdminLogin(fx: Ctx): Promise<boolean> {
  await fx.app.clearState();
  if (!existsSync(ADMIN_AUTH)) return false;
  await restoreAuth(fx, JSON.parse(readFileSync(ADMIN_AUTH, 'utf8')) as AuthState);
  return signedIn(fx);
}

const ADMIN_LOCK = '.auth/admin.lock';
/** A live lock holder lets go within this: a second look at the saved login + one OTP login, with their timeouts. */
const LOCK_WAIT_MS = 3 * 60_000;

/** The holder's pid written in the lock file; `undefined` if there is no lock (or the holder is still writing its pid). */
function lockHolder(): number | undefined {
  try {
    return Number(readFileSync(ADMIN_LOCK, 'utf8')) || undefined;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    return undefined;
  }
}

/** Is the process running? Signal 0 sends nothing, it only asks; ESRCH = no such process. */
function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code !== 'ESRCH';
  }
}

/**
 * Create the lock file with our pid (`wx`: only if it does not exist). `false` if someone else holds it; if
 * its holder is dead (a crashed / killed setup), remove the lock — the next poll takes it.
 */
function takeAdminLock(): boolean {
  try {
    writeFileSync(ADMIN_LOCK, String(process.pid), { flag: 'wx' });
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
    const holder = lockHolder();
    if (holder && !alive(holder)) rmSync(ADMIN_LOCK, { force: true });
    return false;
  }
}

/**
 * Admin login: the saved login if it works (no OTP), otherwise one OTP login and a refreshed file.
 * Call it at the end of a setup too (after other users have signed in) — the admin comes back.
 *
 * The OTP path is inside a cross-process lock: when the saved login has expired, setups running at the same
 * time (the admin's and the modules', in separate worker processes) would all request a code, and each new
 * code invalidates the previous one. After getting the lock, look at the saved login again — another process
 * may have refreshed it during the wait.
 */
export async function adminSignIn(fx: Ctx): Promise<'reused' | 'signed-in'> {
  const email = adminEmail();
  mkdirSync('.auth', { recursive: true });
  if (await reuseAdminLogin(fx)) return 'reused';
  await expect
    .poll(takeAdminLock, { timeout: LOCK_WAIT_MS, interval: 1_000, message: `could not take ${ADMIN_LOCK}: its holder process is still in the admin OTP login` })
    .toBe(true);
  try {
    if (await reuseAdminLogin(fx)) return 'reused';
    await fx.app.clearState();
    await signIn(fx, email);
    await rememberAdmin(fx);
    return 'signed-in';
  } finally {
    if (lockHolder() === process.pid) rmSync(ADMIN_LOCK, { force: true });
  }
}

/**
 * Tokens keep refreshing: at the end of a setup, write the current admin login to the file. Temp file first,
 * then rename: another process's setup must never read a half-written file.
 */
export async function rememberAdmin(fx: Pick<Ctx, 'browser'>): Promise<void> {
  const tmp = `${ADMIN_AUTH}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(await captureAuth(fx), null, 2), { mode: 0o600 });
  renameSync(tmp, ADMIN_AUTH);
}
