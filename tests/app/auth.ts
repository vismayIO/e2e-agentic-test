import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { expect } from 'e2e';
import { env } from '../../lib/env.ts';
import { latestCode, mailosaurConfigured } from '../../lib/mailosaur.ts';
import type { Ctx } from './ui.ts';

/**
 * Motadata console ka login — har module ke setup ke liye ek hi.
 *
 * Sign-in email code se hota hai; code Mailosaur inbox se padha jaata hai (lib/mailosaur.ts), fixed OTP nahi.
 * App login ko httpOnly cookies me rakhta hai, aur e2e ka `session.save` cookies aur localStorage rakhta hai —
 * isliye setup ka save kiya session tests aur `e2e explore` dono me seedha signed-in khulta hai.
 *
 * Session ek hi run tak jeeta hai, aur har run (aur har module ka setup) naya OTP na maange, isliye login
 * ki state `.auth/admin.json` me bhi likhi jaati hai: agla setup pehle wahi lagata hai, naya OTP sirf tab jab
 * woh expire ho chuka ho. `.auth/` gitignore me hai: isme tokens hain. Setups alag worker processes me ek
 * saath chalte hain, isliye file atomically likhi jaati hai aur OTP login ek lock ke andar hota hai
 * (`adminSignIn`).
 */

/** Admin ka display name, jaise app dikhata hai ("Invited by", "Disabled by", owner). */
export const ADMIN_NAME = env('APP_ADMIN_NAME') ?? 'Test User';

/**
 * Halka signed-in session: sirf admin login, koi test data nahi (`admin.setup.e2e.ts` banata hai). Smoke tests
 * aur explore charters isi pe chalte hain — iska setup seconds me hota hai. Jis module ko apna data chahiye
 * woh apna session banata hai (jaise `iam`).
 */
export const ADMIN_SESSION = 'admin';

/**
 * Console admin ka Mailosaur address (…@<server>.mailosaur.net), isi pe OTP aata hai. Login zaroori hai:
 * settings na hon to yahin saaf error — setup fail hota hai aur run non-zero pe khatam, chupchaap skip nahi.
 * Config load pe nahi, taaki `e2e list` aur `npm run verify` bina secrets ke chalein.
 */
function adminEmail(): string {
  const email = env('APP_ADMIN_EMAIL');
  if (!email || !mailosaurConfigured()) {
    throw new Error('admin login ke liye APP_ADMIN_EMAIL, MAILOSAUR_API_KEY aur MAILOSAUR_SERVER_ID set karo (.env.example dekho)');
  }
  return email;
}

/**
 * Sign-in ki ek koshish: /login pe email daal ke code mangwao, Mailosaur se usi request ke baad aaya code
 * padho, type karo. Code ke 6 alag boxes hain (har box ek digit, phir agle pe focus), isliye pehle box me
 * key-by-key; chhatha digit likhte hi app khud verify karta hai.
 * `false` = app ne apna "Request timed out." dikhaya (code maangte ya verify karte): sign-in service ne waqt
 * pe jawab nahi diya.
 */
async function signInOnce({ app, screen, browser }: Ctx, email: string): Promise<boolean> {
  const timedOut = screen.getByRole('alert').filter({ hasText: 'Request timed out.' });
  await app.open('/login');
  await screen.getByRole('textbox', 'Work email').fill(email);
  const requestedAt = new Date();
  await screen.getByRole('button', 'Email me a sign-in code').tap();
  const otp = screen.getByRole('textbox', 'OTP digit 1 of 6');
  await expect(otp.or(timedOut)).toBeVisible({ timeout: 60_000 });
  if (await timedOut.isVisible()) return false;

  await otp.pressSequentially(await latestCode(email, requestedAt));
  const left = async () => !/\/login/.test(await browser.url());
  await expect
    .poll(async () => (await left()) || (await timedOut.isVisible()), { timeout: 60_000, message: `sign-in (${email}): code ke baad na app khula, na "Request timed out." aaya` })
    .toBe(true);
  return left();
}

/**
 * Email code se sign in. Test environment ki sign-in service idle ke baad pehli request pe aksar time out
 * hoti hai (23 Nov 2026: har run ka pehla sign-in), aur time out hua code dobara nahi chalta — app khud kehta
 * hai "Request a new code and try again". Isliye us haal me poora sign-in ek baar dobara, naye code se, aur
 * warning log me. Yeh setup ki provisioning hai; sign-in ke apne tests is helper se nahi guzarte.
 */
export async function signIn(fx: Ctx, email: string): Promise<void> {
  if (await signInOnce(fx, email)) return;
  console.warn(`[login] ${email}: app ne "Request timed out." dikhaya — naye code se ek baar dobara`);
  if (!(await signInOnce(fx, email))) throw new Error(`sign-in (${email}): app ne do baar "Request timed out." dikhaya`);
}

/** Invitee ka pehla sign-in: /welcome pe naam (zaroori), baaki details skip. */
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

/** Abhi ke browser ka login: cookies + localStorage. */
async function captureAuth({ browser }: Pick<Ctx, 'browser'>): Promise<AuthState> {
  const local = (await browser.evaluate(() => Object.fromEntries(Object.entries(localStorage)))) as AuthState['local'];
  return { cookies: await browser.cookies(), local };
}

/** Saved login lagao: cookies, aur app ke origin pe localStorage — agla page load unhe padhta hai. */
async function restoreAuth({ app, browser }: Pick<Ctx, 'app' | 'browser'>, state: AuthState): Promise<void> {
  if (state.cookies.length) await browser.setCookies(state.cookies);
  await app.open('/login');
  await browser.evaluate((local: AuthState['local']) => {
    for (const [k, v] of Object.entries(local)) localStorage.setItem(k, v);
    return null;
  }, state.local);
}

/** Login chal raha hai? Signed-in console `main` dikhata hai, warna app sign-in page pe bhejta hai. */
async function signedIn({ app, screen }: Ctx): Promise<boolean> {
  await app.open('/');
  const signInButton = screen.getByRole('button', 'Email me a sign-in code');
  await expect(screen.getByRole('main').or(signInButton)).toBeVisible({ timeout: 30_000 });
  return !(await signInButton.isVisible());
}

/** Saved admin login is browser me lagao; `true` agar app use maan le. */
async function reuseAdminLogin(fx: Ctx): Promise<boolean> {
  await fx.app.clearState();
  if (!existsSync(ADMIN_AUTH)) return false;
  await restoreAuth(fx, JSON.parse(readFileSync(ADMIN_AUTH, 'utf8')) as AuthState);
  return signedIn(fx);
}

const ADMIN_LOCK = '.auth/admin.lock';
/** Lock ka zinda holder itne me chhod deta hai: saved login dobara dekhna + ek OTP login, apne timeouts ke saath. */
const LOCK_WAIT_MS = 3 * 60_000;

/** Lock file me likha holder ka pid; lock na ho (ya holder abhi pid likh raha ho) to `undefined`. */
function lockHolder(): number | undefined {
  try {
    return Number(readFileSync(ADMIN_LOCK, 'utf8')) || undefined;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    return undefined;
  }
}

/** Process chal raha hai? Signal 0 kuch bhejta nahi, sirf poochta hai; ESRCH = aisa koi process nahi. */
function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code !== 'ESRCH';
  }
}

/**
 * Lock file apne pid ke saath banao (`wx`: sirf tab jab na ho). Kisi aur ka ho to `false`; uska holder mar
 * chuka ho (crash / kill hua setup) to lock hatao — agla poll use le lega.
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
 * Admin login: saved login chal raha ho to wahi (koi OTP nahi), warna ek OTP login aur file taazi.
 * Setup ke aakhir me (doosre users ke sign-in ke baad) bhi yahi bulao — admin wapas aa jaata hai.
 *
 * OTP wala rasta ek cross-process lock ke andar hai: saved login expire ho to ek saath chal rahe setups
 * (admin ka aur modules ke, alag worker processes) sab code maangte, aur har naya code pichhle ko bekaar kar
 * deta hai. Lock milne ke baad saved login dobara dekho — intezaar ke dauraan doosra process use taaza kar
 * chuka ho sakta hai.
 */
export async function adminSignIn(fx: Ctx): Promise<'reused' | 'signed-in'> {
  const email = adminEmail();
  mkdirSync('.auth', { recursive: true });
  if (await reuseAdminLogin(fx)) return 'reused';
  await expect
    .poll(takeAdminLock, { timeout: LOCK_WAIT_MS, interval: 1_000, message: `${ADMIN_LOCK} nahi mila: uska holder process abhi bhi admin OTP login me hai` })
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
 * Tokens refresh hote rehte hain: setup ke aakhir me abhi ka admin login file me. Pehle temp file, phir
 * rename: doosre process ka setup kabhi aadhi likhi file na padhe.
 */
export async function rememberAdmin(fx: Pick<Ctx, 'browser'>): Promise<void> {
  const tmp = `${ADMIN_AUTH}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(await captureAuth(fx), null, 2), { mode: 0o600 });
  renameSync(tmp, ADMIN_AUTH);
}
