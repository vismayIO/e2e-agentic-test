import type { Locator } from 'e2e';
import { expect } from 'e2e';
import type { Ctx } from '../../app/ui.ts';

/**
 * The "Invite users" drawer of the Users page: email invite and CSV import, and "Invitations & imports".
 * The drawer's test id changes with the step (invite-drawer → invite-email / import-csv).
 */
export class InviteDrawer {
  readonly form: Locator;
  readonly emails: Locator;
  readonly domainWarning: Locator;
  readonly allowOutside: Locator;
  readonly send: Locator;
  /** The result after Send ("1 invited · 7 refused: … (the email address is already in use)"). */
  readonly banner: Locator;
  readonly importer: Locator;
  readonly importBanner: (file: string) => Locator;

  readonly fx: Ctx;

  constructor(fx: Ctx) {
    this.fx = fx;
    const { screen } = fx;
    this.form = screen.getByTestId('invite-email');
    this.emails = this.form.getByTestId('invite-emails'); // plain text input, comma-separated addresses (no chips)
    this.domainWarning = this.form.getByTestId('domain-mismatch');
    this.allowOutside = this.form.getByTestId('allow-outside');
    this.send = this.form.getByTestId('send-invite');
    this.importer = screen.getByTestId('import-csv');
    this.banner = this.form.getByTestId('invite-banner');
    this.importBanner = (file) => screen.getByTestId('import-complete').filter({ hasText: file });
  }

  private async choose(method: 'email' | 'csv'): Promise<void> {
    await this.fx.screen.getByTestId('invite-users', { visible: true }).tap();
    await this.fx.screen.getByTestId(`invite-method-${method}`).tap();
  }

  async openEmailForm(): Promise<void> {
    await this.choose('email');
    await this.form.waitFor();
  }

  /**
   * Type the addresses and tick "allow outside". Test addresses are Mailosaur's, which is outside the tenant's
   * allowed domains — the warning comes a little late (the allowed-domain list is from the server), so wait for it.
   */
  async enter(addresses: string[]): Promise<void> {
    await this.emails.fill(addresses.join(', '));
    await this.domainWarning.waitFor();
    await this.allowOutside.check();
  }

  /**
   * Send once, and wait for the server's response. If all were sent the drawer closes; if an address was
   * refused (such as "already in use") the drawer stays open and `banner` shows "<n> invited · <m> refused: …".
   */
  async submit(): Promise<void> {
    await expect(this.send).toBeEnabled();
    const [response] = await Promise.all([
      this.fx.browser.waitForResponse('**/v1/platform/invitation'),
      this.send.tap(),
    ]);
    expect(response.status, 'POST /v1/platform/invitation').toBeLessThan(300);
    // Either the banner shows or the drawer closes. (The header button behind the drawer also counts as "visible", so it is no signal.)
    await expect
      .poll(async () => (await this.banner.isVisible()) || !(await this.form.isVisible()), { timeout: 15_000, message: 'invite drawer neither closed nor showed a result' })
      .toBe(true);
  }

  /** Send the invite; if any address is refused, fail with the banner's text. */
  async invite(addresses: string[]): Promise<void> {
    await this.openEmailForm();
    await this.enter(addresses);
    await this.submit();
    if (await this.banner.isVisible()) throw new Error(`invite refused: ${await this.banner.textContent()}`);
  }

  async cancelImport(): Promise<void> {
    await this.importer.getByRole('button', 'Cancel').tap();
    await this.importer.waitFor({ state: 'detached' });
  }
}

/** "Invitations & imports" drawer. */
export class InvitationsDrawer {
  readonly root: Locator;

  readonly fx: Ctx;

  constructor(fx: Ctx) {
    this.fx = fx;
    this.root = fx.screen.getByTestId('invitations-drawer');
  }

  /** Open the drawer, on the Imports tab. */
  async openImports(): Promise<void> {
    await this.fx.screen.getByTestId('invitations-imports', { visible: true }).tap();
    await this.root.getByTestId('tab-imports').tap();
  }

  /** Newest to oldest: when the same file name repeats, the newest comes first. */
  importRow(file: string): Locator {
    return this.root.getByTestId('import-rows').getByRole('listitem').filter({ hasText: file }).first();
  }
}
