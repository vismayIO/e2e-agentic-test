import type { Locator } from 'e2e';
import { expect } from 'e2e';
import type { Ctx } from '../../app/ui.ts';

/**
 * Users page ke "Invite users" drawer: email invite aur CSV import, aur "Invitations & imports".
 * Drawer ka test id step ke saath badalta hai (invite-drawer → invite-email / import-csv). DOM map: invite-import.md
 */
export class InviteDrawer {
  readonly form: Locator;
  readonly emails: Locator;
  readonly domainWarning: Locator;
  readonly allowOutside: Locator;
  readonly send: Locator;
  /** Send ke baad ka nateeja ("1 invited · 7 refused: … (the email address is already in use)"). */
  readonly banner: Locator;
  readonly importer: Locator;
  readonly importBanner: (file: string) => Locator;

  readonly fx: Ctx;

  constructor(fx: Ctx) {
    this.fx = fx;
    const { screen } = fx;
    this.form = screen.getByTestId('invite-email');
    this.emails = this.form.getByTestId('invite-emails'); // plain text input, comma se alag addresses (chips nahi)
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
   * Addresses likho aur "allow outside" tick karo. Test addresses Mailosaur ke hain, jo tenant ke allowed
   * domains ke bahar hai — warning thodi der se aati hai (allowed-domain list server se), uska intezaar.
   */
  async enter(addresses: string[]): Promise<void> {
    await this.emails.fill(addresses.join(', '));
    await this.domainWarning.waitFor();
    await this.allowOutside.check();
  }

  /**
   * Send ek baar, aur server ke jawab tak ruko. Sab bhej diye to drawer band hota hai; koi address refuse
   * hua (jaise "already in use") to drawer khula rehta hai aur `banner` me "<n> invited · <m> refused: …".
   */
  async submit(): Promise<void> {
    await expect(this.send).toBeEnabled();
    const [response] = await Promise.all([
      this.fx.browser.waitForResponse('**/v1/platform/invitation'),
      this.send.tap(),
    ]);
    expect(response.status, 'POST /v1/platform/invitation').toBeLessThan(300);
    // Ya banner aaye ya drawer band ho. (Drawer ke peeche ka header button bhi "visible" ginta hai, isliye woh signal nahi.)
    await expect
      .poll(async () => (await this.banner.isVisible()) || !(await this.form.isVisible()), { timeout: 15_000, message: 'invite drawer neither closed nor showed a result' })
      .toBe(true);
  }

  /** Invite bhejo; koi bhi address refuse ho to banner ke text ke saath fail. */
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

  async open(tab: 'Invitations' | 'Imports'): Promise<void> {
    await this.fx.screen.getByTestId('invitations-imports', { visible: true }).tap();
    await this.root.getByTestId(tab === 'Imports' ? 'tab-imports' : 'tab-invitations').tap();
  }

  /** Naye se purana: ek hi file naam dobara ho to sabse naya pehle. */
  importRow(file: string): Locator {
    return this.root.getByTestId('import-rows').getByRole('listitem').filter({ hasText: file }).first();
  }

}
