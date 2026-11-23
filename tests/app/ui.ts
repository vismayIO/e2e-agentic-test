import type { Locator, Screen, TestFixtures } from 'e2e';
import { expect } from 'e2e';
import type { WebFixtures } from '@e2e-dev/web';

/**
 * Motadata console ka UI kit — har module ke page objects isi pe bante hain. Locators deployed app ke
 * DOM maps se hain (tmp/dom/maps/*.md):
 * har dialog, menu, toast aur drawer `<main>` ke bahar portal me render hota hai, aur `confirm-submit`,
 * `row-actions-trigger`, `row-actions-menu` jaise test ids har jagah dohraaye jaate hain — isliye har
 * locator pehle apne dialog/row ke andar scope hota hai.
 */
export type Ctx = Pick<TestFixtures & WebFixtures, 'app' | 'browser' | 'screen'>;

/** localStorage ki woh key jisme setup app ki sessionStorage (login) ki copy rakhta hai — auth.ts dekho. */
export const SESSION_STORAGE_COPY = 'e2e.sessionStorage';

const restoring = new WeakSet<object>();

/**
 * Saved session ke saath `path` kholo: page ke apne scripts se pehle sessionStorage wapas, phir tab tak
 * ruko jab tak ya to page ka heading dikhe ya sign-in page — dono me se jo bhi pehle aaye — aur sign-in
 * aaya ho to saaf message ke saath fail.
 */
export async function openPage({ app, browser, screen }: Ctx, path: string, heading?: string): Promise<void> {
  if (!restoring.has(browser)) {
    restoring.add(browser);
    await browser.addInitScript((key: string) => {
      const copy = localStorage.getItem(key);
      if (copy) for (const [k, v] of Object.entries(JSON.parse(copy) as Record<string, string>)) sessionStorage.setItem(k, v);
    }, SESSION_STORAGE_COPY);
  }
  await app.open(path);
  const signIn = screen.getByRole('button', 'Email me a sign-in code');
  const page = heading ? screen.getByRole('heading', heading, { visible: true }) : screen.getByRole('main');
  await expect(page.or(signIn)).toBeVisible({ timeout: 30_000 });
  await expect(signIn, 'the saved admin login was not accepted; the app sent the test to sign-in').toHaveCount(0);
  await pageLoaded(screen);
}

/** Data server se aata hai: tab tak ruko jab tak koi "Loading …" status na bache. */
async function pageLoaded(screen: Screen): Promise<void> {
  await screen.getByRole('main').waitFor();
  await expect(screen.getByRole('status', /^Loading/)).toHaveCount(0, { timeout: 30_000 });
}

/** Toasts stack hote hain (naya sabse upar) aur kuch second rehte hain: hamesha title se filter karo. */
export const toast = (screen: Screen, title: string | RegExp): Locator =>
  screen.getByTestId('toast').filter({ hasText: title }).first();

/** Ek confirm dialog (har dialog me `confirm-submit` / `confirm-cancel`, delete wale me `confirm-word`). */
export class Dialog {
  readonly submit: Locator;
  readonly cancel: Locator;
  readonly confirmWord: Locator;

  readonly root: Locator;

  constructor(root: Locator) {
    this.root = root;
    this.submit = root.getByTestId('confirm-submit');
    this.cancel = root.getByTestId('confirm-cancel');
    this.confirmWord = root.getByTestId('confirm-word');
  }

  /** Submit ek baar, aur tab tak ruko jab tak dialog band na ho (submit ke dauraan buttons disabled rehte hain). */
  async confirm(timeout = 30_000): Promise<void> {
    await expect(this.submit).toBeEnabled({ timeout });
    await this.submit.tap();
    await this.root.waitFor({ state: 'detached', timeout });
  }

  async dismiss(): Promise<void> {
    await this.cancel.tap();
    await this.root.waitFor({ state: 'detached' });
  }
}

export const dialog = (screen: Screen, testId: string) => new Dialog(screen.getByTestId(testId));

/** Row (ya drawer header) ka "⋯" menu kholo aur ek item chuno. Menu portal hai, isliye screen se. */
export async function chooseAction(screen: Screen, scope: Locator, item: string): Promise<void> {
  await scope.getByTestId('row-actions-trigger').tap();
  await screen.getByTestId('row-actions-menu').getByTestId(`row-actions-menu-${item}`).tap();
}

/**
 * List page: search box, data rows, aur `keyCell` — table ke woh nodes jinka text sirf item ka naam ya email
 * ho (jaise `role-name-<id>`). Row ka poora text cells ko bina space ke jod deta hai ("…@x.netActiveManual"),
 * isliye key wahan se nahi padhte.
 *
 * Kuch lists ka search server-side aur debounced hai (`queryUrl`): fill ke saath us request ka jawab bhi
 * ruko, warna pichhli query ka nateeja (jaise "No … match") naya maan liya jaata. Kuch lists load ke thodi
 * der baad apni pichhli search state wapas lagati hain aur turant kiya `fill` mita deti hain — isliye box
 * me value na ho to dobara bharo. Settled = load khatam (rows ya empty state) aur query se bemel koi row nahi.
 */
export class ListPage {
  readonly fx: Ctx;
  readonly screen: Screen;
  readonly searchBox: Locator;
  readonly rows: Locator;
  readonly empty: Locator;
  private readonly keyCell: Locator;
  private readonly queryUrl?: string;

  constructor(fx: Ctx, table: Locator, { keyCell, queryUrl }: { keyCell: (table: Locator) => Locator; queryUrl?: string }) {
    this.fx = fx;
    this.screen = fx.screen;
    this.searchBox = fx.screen.getByTestId('strip-search');
    this.rows = table.getByRole('row').filter({ has: fx.screen.getByRole('cell') });
    this.empty = fx.screen.getByTestId('state-empty');
    this.keyCell = keyCell(table);
    this.queryUrl = queryUrl;
  }

  async search(query: string): Promise<void> {
    const fill = async () => {
      if (!this.queryUrl) return this.searchBox.fill(query);
      await Promise.all([this.fx.browser.waitForResponse(this.queryUrl), this.searchBox.fill(query)]);
    };
    await expect
      .poll(async () => {
        if ((await this.searchBox.inputValue()) !== query) await fill();
        const shown = (await this.rows.count()) > 0 || (await this.empty.isVisible());
        return shown ? this.rows.filter({ hasNotText: query }).count() : -1;
      }, { timeout: 30_000, message: `the list never settled on the search "${query}"` })
      .toBe(0);
  }

  /** Woh row jiske key cell me yahi poora text ho — "Technician" "Client Technician" se nahi milta. */
  row(key: string): Locator {
    return this.rows.filter({ has: this.screen.getByText(key) });
  }

  /** Dikh rahi rows ke keys jo `prefix` se shuru hon (case ka farak nahi). */
  async keys(prefix: string): Promise<string[]> {
    const p = prefix.toLowerCase();
    return (await this.keyCell.allTextContents())
      .map((t) => t.trim())
      .filter((t) => t.toLowerCase().startsWith(p));
  }
}

/** Kal / N din baad ki tareekh, app ke formats me. */
export function daysFromNow(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}
/** "30 Nov 2026" — holder lines aur assignment rows ka format. */
export const shortDate = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
