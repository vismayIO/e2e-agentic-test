import type { Locator, Screen, TestFixtures } from 'e2e';
import { expect } from 'e2e';
import type { WebFixtures } from '@e2e-dev/web';

/**
 * The Motadata console's UI kit — every module's page objects are built on it. Locators use the deployed
 * app's test ids: every dialog, menu, toast and drawer renders in a portal outside `<main>`, and test ids
 * such as `confirm-submit`, `row-actions-trigger`, `row-actions-menu` are repeated everywhere —
 * so every locator is first scoped inside its own dialog/row.
 */
export type Ctx = Pick<TestFixtures & WebFixtures, 'app' | 'browser' | 'screen'>;

/**
 * Open `path` with the saved session: wait until either the page's heading or the sign-in page shows —
 * whichever comes first — and fail with a clear message if it was sign-in.
 */
export async function openPage({ app, screen }: Ctx, path: string, heading?: string): Promise<void> {
  await app.open(path);
  const signIn = screen.getByRole('button', 'Email me a sign-in code');
  const page = heading ? screen.getByRole('heading', heading, { visible: true }) : screen.getByRole('main');
  await expect(page.or(signIn)).toBeVisible({ timeout: 30_000 });
  await expect(signIn, 'the saved admin login was not accepted; the app sent the test to sign-in').toHaveCount(0);
  await pageLoaded(screen);
}

/** Data comes from the server: wait until no "Loading …" status is left. */
export async function pageLoaded(screen: Screen): Promise<void> {
  await screen.getByRole('main').waitFor();
  await expect(screen.getByRole('status', /^Loading/)).toHaveCount(0, { timeout: 30_000 });
}

/** Toasts stack (newest on top) and stay for a few seconds: always filter by title. */
export const toast = (screen: Screen, title: string | RegExp): Locator =>
  screen.getByTestId('toast').filter({ hasText: title }).first();

/** A confirm dialog (every dialog has `confirm-submit` / `confirm-cancel`, a delete one also `confirm-word`). */
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

  /** Submit once, and wait until the dialog closes (the buttons stay disabled during the submit). */
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

/** Open the "⋯" menu of a row (or drawer header) and choose an item. The menu is a portal, so from screen. */
export async function chooseAction(screen: Screen, scope: Locator, item: string): Promise<void> {
  await scope.getByTestId('row-actions-trigger').tap();
  await screen.getByTestId('row-actions-menu').getByTestId(`row-actions-menu-${item}`).tap();
}

/**
 * List page: search box, data rows, and `keyCell` — the table nodes whose text is only the item's name or
 * email (such as `role-name-<id>`). A row's full text joins the cells without spaces ("…@x.netActiveManual"),
 * so the key is not read from there.
 *
 * Some lists search server-side and debounced (`queryUrl`): with the fill, also wait for that request's
 * response, or the previous query's result (such as "No … match") would be taken as the new one. Some lists
 * re-apply their previous search state shortly after load and wipe a `fill` done right away — so fill again
 * when the box does not hold the value. Settled = load finished (rows or empty state) and no row that does
 * not match the query.
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

  /** The row whose key cell holds exactly this text — "Technician" does not match "Client Technician". */
  row(key: string): Locator {
    return this.rows.filter({ has: this.screen.getByText(key) });
  }

  /** Keys of the visible rows that start with `prefix` (case-insensitive). */
  async keys(prefix: string): Promise<string[]> {
    const p = prefix.toLowerCase();
    return (await this.keyCell.allTextContents())
      .map((t) => t.trim())
      .filter((t) => t.toLowerCase().startsWith(p));
  }
}

/** The date tomorrow / N days from now, for the app's formats. */
export function daysFromNow(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}
/** "30 Nov 2026" — the format of holder lines and assignment rows. */
export const shortDate = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
