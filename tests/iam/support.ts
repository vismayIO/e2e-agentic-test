import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import type { beforeEach } from '@e2e-dev/web';
import { expect } from 'e2e';
import { env } from '../../lib/env.ts';
import { latestCode, mailosaurConfigured } from '../../lib/mailosaur.ts';

/**
 * IAM app ke tests ka shared setup. Brief: test_case.md (IAM Business Acceptance Brief).
 *
 * Sign-in ek baar per run, `auth.setup.e2e.ts` me: OTP Mailosaur inbox se padh ke type hota hai.
 * App apna login sessionStorage me rakhta hai, jo e2e ka `session.save` nahi rakhta (woh cookies,
 * localStorage, IndexedDB rakhta hai) — isliye setup sessionStorage ko localStorage me copy karke save
 * karta hai, aur har test page load se pehle use wapas sessionStorage me daal deta hai.
 *
 * Har test apna data `iam-e2e-<run>-…` naam se banata hai; pichhle runs ka bacha data setup saaf karta hai.
 */

/** Web test ke fixtures (app, browser, screen, agent, …) — package inka type naam se export nahi karta. */
export type Fx = Parameters<Parameters<typeof beforeEach>[0]>[0];
type Screen = Fx['screen'];
type Browser = Fx['browser'];

/** Kaun sign in karta hai — Mailosaur address (…@<server>.mailosaur.net), isi pe OTP aata hai. */
export const IAM_ADMIN_EMAIL = env('IAM_ADMIN_EMAIL') ?? '';
/** Setup ka saved session — IAM describes `session: IAM_SESSION` lagate hain. */
export const IAM_SESSION = 'iam-admin';

/** Admin email ya Mailosaur na ho to IAM suite skip — baaki nightly chalta rahe. */
export const IAM_SKIP: string | false = !IAM_ADMIN_EMAIL
  ? 'IAM_ADMIN_EMAIL set nahi hai'
  : !mailosaurConfigured()
    ? 'MAILOSAUR_API_KEY / MAILOSAUR_SERVER_ID set nahi hai'
    : false;

/** Tenant Owner ka email (app list me owner ka nishaan nahi dikhata). Na ho to owner tests skip. */
export const IAM_TENANT_OWNER_EMAIL = env('IAM_TENANT_OWNER_EMAIL') ?? '';

/** localStorage ki woh key jisme setup sessionStorage ki copy rakhta hai. */
const SESSION_STORAGE_COPY = 'e2e.sessionStorage';

export type Perspective = 'MSP Console' | 'Direct customer' | 'Client Operator';

/** Deployed tenant MSP view hai (ek org "motadata"); mock ke dusre perspectives yahan nahi. */
export const TENANT = {
  /** CFG-IAM-C: MSP organisation */
  msp: 'MSP Console',
} as const satisfies Record<string, Perspective>;

/** Is process ka chhota run id — test apna data `iam-e2e-<run>-…` naam se banata hai. */
export const RUN_ID = Date.now().toString(36);

/** Ek naya Mailosaur address (kisi asli insaan ko mail nahi jaata). */
export function testAddress(label: string): string {
  return `iam-e2e-${RUN_ID}-${label}@${env('MAILOSAUR_SERVER_ID')}.mailosaur.net`;
}

/**
 * Disposable active users — setup har run me banata hai (invite → Mailosaur OTP se pehla sign-in → naam),
 * taaki disable / delete / sessions wale tests asli logon ko na chhuein. Har label ek hi test ka hai.
 */
export const POOL = [
  'shared', // sirf dialog dekhne wale tests — kuch save nahi hota
  'disabled', // ek ke baad ek: disable → "kisne kiya" → enable
  'disabled-sessions', // disable → koi session nahi (alag, taaki finding baaki checks na roke)
  'sessions', // admin is person ke saare sessions khatam karta hai
  'delete', // ek ke baad ek: delete → wahi email dobara invite
  'bulk-a', 'bulk-b', // bulk delete ko do log chahiye
  'sa-owner', // service account ka owner (owner guard)
] as const;
export type PoolLabel = (typeof POOL)[number];
export interface PoolUser { email: string; name: string }
export const POOL_FILE = '.e2e/iam-pool.json';

/** Setup ka banaya disposable user (test ke andar padho, import pe nahi). */
export function poolUser(label: PoolLabel): PoolUser {
  const pool = JSON.parse(readFileSync(POOL_FILE, 'utf8')) as Record<PoolLabel, PoolUser>;
  if (!pool[label]) throw new Error(`${POOL_FILE} me "${label}" nahi — setup test chala?`);
  return pool[label];
}

/** Har IAM describe pe `agentContext` — app ki vocabulary aur kya nahi chhoona. */
export const IAM_CONTEXT = [
  'Motadata IAM admin console. The tenant is an MSP view with one organization, "motadata".',
  'The left "Settings" navigation has People & Access (Users, Service accounts, Teams, Roles, Access profiles),',
  'Administration (My Organization, Client Organizations) and Customization (User attributes).',
  'Clicking a table row opens a side drawer; every row has a "Row actions" (⋯) menu.',
  'A disabled person shows status "Inactive". The source of truth of a person is Manual, SCIM or LDAP.',
].join(' ');

/**
 * /login pe email daal ke code mangwao, Mailosaur se usi request ke baad aaya code padho, type karo.
 * Code ke 6 alag boxes hain (har box ek digit, phir agle pe focus), isliye pehle box me key-by-key.
 */
export async function signIn({ app, screen, browser }: Pick<Fx, 'app' | 'browser' | 'screen'>, email = IAM_ADMIN_EMAIL): Promise<void> {
  await app.open('/login');
  await screen.getByRole('textbox', 'Work email').fill(email);
  const requestedAt = new Date();
  await screen.getByRole('button', 'Email me a sign-in code').tap();
  await screen.getByRole('textbox', 'OTP digit 1 of 6').waitFor();

  const code = await latestCode(email, requestedAt);
  await screen.getByRole('textbox', 'OTP digit 1 of 6').pressSequentially(code);
  // Server code verify karta hai ("Verifying…"), phir app sign-in page chhod deta hai.
  await expect(browser).not.toHaveURL(/\/login/, { timeout: 30_000 });
}

/** Invitee ka pehla sign-in: /welcome pe naam (zaroori), baaki details skip. */
export async function completeWelcome({ screen, browser }: Pick<Fx, 'browser' | 'screen'>, given: string, last: string): Promise<void> {
  await expect(browser).toHaveURL(/\/welcome/, { timeout: 30_000 });
  await screen.getByRole('textbox', /^Given name/).fill(given);
  await screen.getByRole('textbox', /^Last name/).fill(last);
  await screen.getByRole('button', 'Next').tap();
  await screen.getByRole('button', 'Skip for now').or(screen.getByRole('button', 'Continue')).first().tap();
  await expect(browser).not.toHaveURL(/\/welcome/, { timeout: 30_000 });
}

/** Setup me: sessionStorage ki copy localStorage me, taaki `session.save` use rakh le. */
export async function keepSessionStorage(browser: Browser): Promise<void> {
  await browser.evaluate(
    (key: string) => {
      localStorage.setItem(key, JSON.stringify(Object.fromEntries(Object.entries(sessionStorage))));
      return null;
    },
    SESSION_STORAGE_COPY,
  );
}

/** Deployed app data server se laata hai: tab tak ruko jab tak page pe koi "Loading …" status na bache. */
export async function pageLoaded(screen: Screen): Promise<void> {
  await screen.getByRole('main').waitFor();
  await expect(screen.getByRole('status', /^Loading/)).toHaveCount(0, { timeout: 30_000 });
}

/** Saved session se sign-in wapas laao (page ke apne scripts se pehle), `path` kholo, data load hone do. */
export async function openAs({ app, browser, screen }: Pick<Fx, 'app' | 'browser' | 'screen'>, _perspective: Perspective, path: string): Promise<void> {
  await browser.addInitScript((key: string) => {
    const copy = localStorage.getItem(key);
    if (copy) for (const [k, v] of Object.entries(JSON.parse(copy) as Record<string, string>)) sessionStorage.setItem(k, v);
  }, SESSION_STORAGE_COPY);
  await app.open(path);
  await expect(browser).not.toHaveURL(/\/login/); // session wapas aaya, sign-in page pe nahi bheja
  await pageLoaded(screen);
}

/* ── Ek account, ek login ────────────────────────────────────────────────────────────────────
 * Login ke baad uski state (cookies + localStorage + sessionStorage) `.auth/<name>.json` me likhi
 * jaati hai. Agla run pehle wahi wapas lagata hai; sirf tab naya OTP login hota hai jab saved login
 * expire ho chuka ho. `.auth/` gitignore me hai — isme login tokens hain, ise share/commit mat karo.
 */
type Cookie = Awaited<ReturnType<Browser['cookies']>>[number];
export interface AuthState { cookies: Cookie[]; local: Record<string, string>; session: Record<string, string> }

export const authFile = (name: string) => `.auth/${name}.json`;

/** Abhi ke browser ka login (cookies + dono storages). */
export async function captureAuth(browser: Browser): Promise<AuthState> {
  const storage = (await browser.evaluate(() => ({
    local: Object.fromEntries(Object.entries(localStorage)),
    session: Object.fromEntries(Object.entries(sessionStorage)),
  }))) as Pick<AuthState, 'local' | 'session'>;
  return { cookies: await browser.cookies(), ...storage };
}

export function saveAuth(name: string, state: AuthState): void {
  mkdirSync('.auth', { recursive: true });
  writeFileSync(authFile(name), JSON.stringify(state, null, 2), { mode: 0o600 });
}

/**
 * Saved login lagao: cookies, aur app ke origin pe dono storages ek baar likho — agla page load unhe padhta
 * hai (sessionStorage usi tab me reload ke baad bhi rehta hai). Init script nahi: woh baad ke
 * `clearState` + dusre user ke sign-in me admin ka login wapas ghusa deta.
 */
export async function restoreAuth({ app, browser }: Pick<Fx, 'app' | 'browser'>, state: AuthState): Promise<void> {
  if (state.cookies.length) await browser.setCookies(state.cookies);
  await app.open('/login');
  await browser.evaluate((s: { local: Record<string, string>; session: Record<string, string> }) => {
    for (const [k, v] of Object.entries(s.local)) localStorage.setItem(k, v);
    for (const [k, v] of Object.entries(s.session)) sessionStorage.setItem(k, v);
    return null;
  }, { local: state.local, session: state.session });
}

/** Login abhi bhi chal raha hai? App ya to page dikhata hai ya sign-in pe bhej deta hai. */
async function signedIn({ app, browser, screen }: Pick<Fx, 'app' | 'browser' | 'screen'>): Promise<boolean> {
  await app.open('/users');
  await expect(screen.getByRole('heading', 'Users').or(screen.getByRole('button', 'Email me a sign-in code'))).toBeVisible({ timeout: 30_000 });
  return !/\/login/.test(await browser.url());
}

/**
 * Admin ka login: `.auth/iam-admin.json` ho aur chal raha ho to wahi (koi OTP nahi); warna ek baar OTP
 * se sign in karke file likho. Lautata hai ki naya login hua ya purana chala.
 */
export async function adminSignIn(fx: Pick<Fx, 'app' | 'browser' | 'screen'>): Promise<'reused' | 'signed-in'> {
  const file = authFile('iam-admin');
  if (existsSync(file)) {
    await restoreAuth(fx, JSON.parse(readFileSync(file, 'utf8')) as AuthState);
    if (await signedIn(fx)) return 'reused';
    await fx.app.clearState();
  }
  await signIn(fx);
  saveAuth('iam-admin', await captureAuth(fx.browser));
  return 'signed-in';
}

/** Setup ke beech (pool users ke sign-in ke baad) admin ka pakda hua login wapas — dusra OTP nahi. */
export async function backToAdmin(fx: Pick<Fx, 'app' | 'browser' | 'screen'>, admin: AuthState): Promise<void> {
  await fx.app.clearState();
  await restoreAuth(fx, admin);
  if (!(await signedIn(fx))) await adminSignIn(fx);
}
