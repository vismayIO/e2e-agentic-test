import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { expect } from 'e2e';
import { env } from '../../lib/env.ts';
import { latestCode, mailosaurConfigured } from '../../lib/mailosaur.ts';
import { type Ctx, SESSION_STORAGE_COPY } from './ui.ts';

/**
 * Motadata console ka login — har module ke setup ke liye ek hi.
 *
 * Sign-in email code se hota hai; code Mailosaur inbox se padha jaata hai (lib/mailosaur.ts), fixed OTP nahi.
 * Login ke baad uski state `.auth/<account>.json` me likhi jaati hai, aur agla setup (kisi bhi module ka,
 * kisi bhi run ka) pehle wahi lagata hai — naya OTP sirf tab jab saved login expire ho chuka ho. Isliye
 * modules kitne bhi hon, har account ka OTP login ek hi baar. `.auth/` gitignore me hai: isme tokens hain.
 *
 * App login sessionStorage me rakhta hai, jo e2e ka `session.save` nahi rakhta (woh cookies, localStorage,
 * IndexedDB rakhta hai). Setup ise localStorage me copy karta hai (`keepSessionStorage`) aur `openPage`
 * har page load se pehle wapas sessionStorage me daalta hai.
 */

/** Console admin — Mailosaur address (…@<server>.mailosaur.net), isi pe OTP aata hai. */
export const ADMIN_EMAIL = env('APP_ADMIN_EMAIL') ?? '';
/** Admin ka display name, jaise app dikhata hai ("Invited by", "Disabled by", owner). */
export const ADMIN_NAME = env('APP_ADMIN_NAME') ?? 'Test User';

/** Admin login ke bina koi signed-in test nahi chal sakta: skip ka reason, ya `false`. */
export const LOGIN_SKIP: string | false = !ADMIN_EMAIL
  ? 'APP_ADMIN_EMAIL set nahi hai'
  : !mailosaurConfigured()
    ? 'MAILOSAUR_API_KEY / MAILOSAUR_SERVER_ID set nahi hai'
    : false;

const ADMIN_ACCOUNT = 'admin';

/**
 * /login pe email daal ke code mangwao, Mailosaur se usi request ke baad aaya code padho, type karo.
 * Code ke 6 alag boxes hain (har box ek digit, phir agle pe focus), isliye pehle box me key-by-key.
 */
export async function signIn({ app, screen, browser }: Ctx, email = ADMIN_EMAIL): Promise<void> {
  await app.open('/login');
  await screen.getByRole('textbox', 'Work email').fill(email);
  const requestedAt = new Date();
  // Code request ka server jawab bhi pakdo: na aaye ya error ho to wahi saaf failure (screen pe sirf "Request timed out.").
  const [response] = await Promise.all([
    browser.waitForResponse('**/v1/auth/entry', { timeout: 45_000 }),
    screen.getByRole('button', 'Email me a sign-in code').tap(),
  ]);
  expect(response.status, `sign-in code request for ${email}`).toBeLessThan(300);
  const otp = screen.getByRole('textbox', 'OTP digit 1 of 6');
  await otp.waitFor();

  await otp.pressSequentially(await latestCode(email, requestedAt));
  // Server code verify karta hai ("Verifying…"), phir app sign-in page chhod deta hai.
  await expect(browser).not.toHaveURL(/\/login/, { timeout: 30_000 });
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

/** Setup me, `session.save` se theek pehle: sessionStorage ki copy localStorage me. */
export async function keepSessionStorage({ browser }: Pick<Ctx, 'browser'>): Promise<void> {
  await browser.evaluate((key: string) => {
    localStorage.setItem(key, JSON.stringify(Object.fromEntries(Object.entries(sessionStorage))));
    return null;
  }, SESSION_STORAGE_COPY);
}

type Cookie = Awaited<ReturnType<Ctx['browser']['cookies']>>[number];
interface AuthState { cookies: Cookie[]; local: Record<string, string>; session: Record<string, string> }

const authFile = (account: string) => `.auth/${account}.json`;

/**
 * Abhi ke browser ka login (cookies + dono storages). sessionStorage ki copy wali key chhod do: woh
 * purane tokens hain, aur `openPage` ka init script unhe har page load pe sessionStorage me daal deta.
 */
async function captureAuth({ browser }: Pick<Ctx, 'browser'>): Promise<AuthState> {
  const storage = (await browser.evaluate((skip: string) => ({
    local: Object.fromEntries(Object.entries(localStorage).filter(([k]) => k !== skip)),
    session: Object.fromEntries(Object.entries(sessionStorage)),
  }), SESSION_STORAGE_COPY)) as Pick<AuthState, 'local' | 'session'>;
  return { cookies: await browser.cookies(), ...storage };
}

function saveAuth(account: string, state: AuthState): void {
  mkdirSync('.auth', { recursive: true });
  writeFileSync(authFile(account), JSON.stringify(state, null, 2), { mode: 0o600 });
}

/**
 * Saved login lagao: cookies, aur app ke origin pe dono storages ek baar likho — agla page load unhe
 * padhta hai. Init script nahi: woh baad ke `clearState` + doosre user ke sign-in me admin ka login
 * wapas ghusa deta.
 */
async function restoreAuth({ app, browser }: Pick<Ctx, 'app' | 'browser'>, state: AuthState): Promise<void> {
  if (state.cookies.length) await browser.setCookies(state.cookies);
  await app.open('/login');
  await browser.evaluate((s: { local: Record<string, string>; session: Record<string, string>; skip: string }) => {
    for (const [k, v] of Object.entries(s.local)) if (k !== s.skip) localStorage.setItem(k, v);
    for (const [k, v] of Object.entries(s.session)) sessionStorage.setItem(k, v);
    return null;
  }, { local: state.local, session: state.session, skip: SESSION_STORAGE_COPY });
}

/** Login chal raha hai? Signed-in console `main` dikhata hai, warna app sign-in page pe bhejta hai. */
async function signedIn({ app, screen }: Ctx): Promise<boolean> {
  await app.open('/');
  const signInButton = screen.getByRole('button', 'Email me a sign-in code');
  await expect(screen.getByRole('main').or(signInButton)).toBeVisible({ timeout: 30_000 });
  return !(await signInButton.isVisible());
}

/**
 * Admin login: saved login chal raha ho to wahi (koi OTP nahi), warna ek OTP login aur file taazi.
 * Setup ke aakhir me (doosre users ke sign-in ke baad) bhi yahi bulao — admin wapas aa jaata hai.
 */
export async function adminSignIn(fx: Ctx): Promise<'reused' | 'signed-in'> {
  await fx.app.clearState();
  if (existsSync(authFile(ADMIN_ACCOUNT))) {
    await restoreAuth(fx, JSON.parse(readFileSync(authFile(ADMIN_ACCOUNT), 'utf8')) as AuthState);
    if (await signedIn(fx)) return 'reused';
    await fx.app.clearState();
  }
  await signIn(fx);
  await rememberAdmin(fx);
  return 'signed-in';
}

/** Tokens refresh hote rehte hain: setup ke aakhir me abhi ka admin login file me. */
export async function rememberAdmin(fx: Pick<Ctx, 'browser'>): Promise<void> {
  saveAuth(ADMIN_ACCOUNT, await captureAuth(fx));
}
