import type { Locator, Screen } from 'e2e';
import { expect } from 'e2e';
import { type Ctx, Dialog, ListPage, chooseAction, dialog, openPage, toast } from '../../app/ui.ts';

/** /users — the list of members and pending invitations, row menus, bulk bar. */
export class UsersPage extends ListPage {
  readonly bulkBar: Locator;

  constructor(fx: Ctx) {
    // Key = email cell (its name is the email only; the contact cell's name is "Copy email: …"). Search is server-side.
    super(fx, fx.screen.getByTestId('users-table'), {
      keyCell: (table) => table.getByRole('cell', /^[^\s:]+@[^\s]+$/),
      queryUrl: '**/v1/platform/membership/query',
    });
    this.bulkBar = fx.screen.getByTestId('bulk-bar');
  }

  async open(): Promise<void> {
    await openPage(this.fx, '/users', 'Users');
  }

  /** The email cell is plain text, full match. */
  status(email: string): Locator {
    return this.row(email).getByTestId('status-badge');
  }

  async rowAction(email: string, item: 'disable' | 'delete' | 'cancel-invite'): Promise<void> {
    await chooseAction(this.screen, this.row(email), item);
  }

  /** The Disable dialog — a short "Checking before disabling…" gate shows first, then this. */
  async openDisable(email: string): Promise<Dialog> {
    await this.rowAction(email, 'disable');
    const d = dialog(this.screen, 'disable-confirm');
    await d.root.waitFor();
    return d;
  }

  async disable(email: string): Promise<void> {
    await (await this.openDisable(email)).confirm();
    await expect(this.status(email)).toHaveText('Inactive');
  }

  /**
   * Up to the Delete confirm dialog. For an Active person the app first shows the Disable dialog ("Disable and
   * continue") and that same dialog then turns into Delete; for an Inactive one, Delete directly.
   */
  async openDelete(email: string): Promise<Dialog> {
    await this.rowAction(email, 'delete');
    const disableFirst = dialog(this.screen, 'disable-confirm');
    const del = dialog(this.screen, 'delete-confirm');
    await expect(disableFirst.root.or(del.root)).toBeVisible();
    if (await disableFirst.root.isVisible()) {
      await expect(disableFirst.submit).toHaveText('Disable and continue');
      await disableFirst.submit.tap();
    }
    await del.root.waitFor({ timeout: 30_000 });
    return del;
  }

  async delete(email: string): Promise<void> {
    const d = await this.openDelete(email);
    await d.confirmWord.fill('delete');
    await d.confirm();
    await expect(toast(this.screen, 'User deleted')).toBeVisible();
    await expect(this.row(email)).toHaveCount(0);
  }

  async cancelInvite(email: string): Promise<void> {
    await this.rowAction(email, 'cancel-invite');
    await dialog(this.screen, 'cancel-invite-confirm').confirm();
    await expect(this.row(email)).toHaveCount(0, { timeout: 15_000 });
  }

  /** Bulk select: all rows must be in one search — changing the search clears the selection. */
  async select(emails: string[]): Promise<void> {
    for (const email of emails) {
      const row = this.row(email);
      await row.hover(); // the checkbox enters the tree only on hover
      await row.getByRole('checkbox').check();
    }
    await expect(this.bulkBar).toHaveAttribute('data-count', String(emails.length));
  }

  /** A tap on the name opens the profile drawer (on an Invited row nothing happens). */
  async openProfile(email: string): Promise<UserDrawer> {
    await this.row(email).getByTestId(/^user-name-/).tap();
    const drawer = new UserDrawer(this.screen);
    await drawer.root.waitFor();
    return drawer;
  }
}

/** Profile drawer ("User management"). While the drawer is open, the tree shows only this. */
export class UserDrawer {
  readonly root: Locator;
  readonly disabledBy: Locator;
  readonly status: Locator;
  readonly sessions: Locator;
  readonly terminateAll: Locator;

  readonly screen: Screen;

  constructor(screen: Screen) {
    this.screen = screen;
    this.root = screen.getByTestId('user-drawer');
    this.disabledBy = this.root.getByTestId('disabled-by');
    this.status = this.root.getByTestId('about-others').getByTestId('badge-label');
    this.sessions = this.root.getByTestId('panel-sessions').getByTestId(/^session-[0-9a-f]{32}$/);
    this.terminateAll = this.root.getByTestId('terminate-all');
  }

  async openSessions(): Promise<void> {
    await this.root.getByRole('tab', 'Sessions').tap();
    await expect(this.screen.getByRole('status', /^Loading/)).toHaveCount(0, { timeout: 30_000 });
  }


  async close(): Promise<void> {
    await this.root.getByRole('button', 'Close').tap();
    await this.root.waitFor({ state: 'detached' });
  }
}

/** /account/sessions — the admin's own sessions. */
export class MySessionsPage {
  readonly sessions: Locator;
  readonly current: Locator;

  readonly fx: Ctx;

  constructor(fx: Ctx) {
    this.fx = fx;
    const panel = fx.screen.getByTestId('my-sessions-region').getByTestId('panel-sessions');
    this.sessions = panel.getByTestId(/^session-[0-9a-f]{32}$/);
    this.current = this.sessions.filter({ has: fx.screen.getByTestId('session-current') });
  }

  async open(): Promise<void> {
    await openPage(this.fx, '/account/sessions', 'My sessions');
  }
}
