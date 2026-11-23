import type { Locator, Screen } from 'e2e';
import { expect } from 'e2e';
import { type Ctx, Dialog, ListPage, chooseAction, dialog, openPage, toast } from '../../app/ui.ts';

/**
 * Service accounts ke liye non-admin role. "End User" deployed app pe offer nahi hota, aur Tenant Admin /
 * Read-Only Auditor pe ek extra admin-tier confirm aata hai.
 */
export const SA_ROLE = 'Vendor';

/** /service-accounts — list, create form, drawer, credentials, owner. DOM map: service-accounts.md */
export class ServiceAccountsPage extends ListPage {
  readonly form: Locator;

  constructor(fx: Ctx) {
    super(fx, fx.screen.getByTestId('service-accounts-table'), { keyCell: (table) => table.getByTestId(/^sa-name-\d+$/) });
    this.form = fx.screen.getByTestId('sa-form-create');
  }

  async open(): Promise<void> {
    await openPage(this.fx, '/service-accounts', 'Service accounts');
  }

  /** Naam prefix share karte hain, isliye poore naam wala cell. */
  owner(name: string): Locator {
    return this.row(name).getByTestId('sa-owner');
  }

  status(name: string): Locator {
    return this.row(name).getByTestId('sa-status');
  }

  /**
   * Owner hamesha picker se chuno (display name; picker email se nahi dhoondhta). Form "Defaults to you"
   * kehta hai, par picker sirf direct access profile wale members dikhata hai — admin bhi nahi (23 Nov 2026).
   */
  async create(name: string, { owner, role = SA_ROLE }: { owner: string; role?: string }): Promise<void> {
    const { screen } = this.fx;
    await screen.getByTestId('create-service-account', { visible: true }).tap();
    await this.form.getByTestId('sa-name-input').fill(name);
    const ownerTrigger = this.form.getByTestId('sa-owner-trigger');
    if ((await ownerTrigger.textContent())?.trim() !== owner) {
      await ownerTrigger.tap();
      const popover = screen.getByTestId('sa-owner-popover');
      await popover.getByRole('button', owner).tap(); // members der se aate hain; tab tak "No options"
      await popover.getByTestId('sa-owner-popover-search').press('Escape');
    }
    await expect(ownerTrigger).toHaveText(owner);
    await this.form.getByTestId('sa-roles-picker-trigger').tap();
    const roles = screen.getByTestId('sa-roles-picker-popover');
    await roles.getByRole('button', role).tap();
    await roles.getByTestId('sa-roles-picker-popover-search').press('Escape');
    await this.form.getByTestId('sa-form-submit').tap();
    await this.form.waitFor({ state: 'detached', timeout: 30_000 });
    await expect(toast(screen, `Service account "${name}" created.`)).toBeVisible();
    await this.search(name);
    await expect(this.row(name)).toBeVisible();
  }

  async openAccount(name: string): Promise<AccountDrawer> {
    await this.row(name).getByText(name).tap();
    const drawer = new AccountDrawer(this.screen);
    await expect(drawer.title).toHaveText(name, { timeout: 30_000 });
    await drawer.root.getByTestId('credentials-loading').waitFor({ state: 'detached', timeout: 30_000 });
    return drawer;
  }

  async openAction(name: string, item: 'reassign' | 'disable' | 'enable' | 'delete', testId: string): Promise<Dialog> {
    await chooseAction(this.screen, this.row(name), item);
    const d = dialog(this.screen, testId);
    await d.root.waitFor();
    return d;
  }

  async disable(name: string): Promise<void> {
    await (await this.openAction(name, 'disable', 'sa-disable')).confirm();
    await expect(this.status(name)).toHaveText('Inactive');
  }


  async delete(name: string): Promise<void> {
    const d = await this.openAction(name, 'delete', 'sa-delete');
    await d.confirmWord.fill('delete');
    await d.confirm();
    await expect(this.row(name)).toHaveCount(0);
  }

}

/** Service account drawer: identity band + credentials. */
export class AccountDrawer {
  readonly root: Locator;
  readonly title: Locator;
  readonly secret: Locator;

  readonly screen: Screen;

  constructor(screen: Screen) {
    this.screen = screen;
    this.root = screen.getByTestId('sa-drawer');
    this.title = this.root.getByTestId('sa-title');
    this.secret = screen.getByTestId('credential-secret');
  }

  credential(name: string): Locator {
    return this.root.getByTestId('sa-credentials').getByRole('listitem').filter({ hasText: name });
  }

  /** Add credential form tak (naam + method), Generate se pehle. */
  async startCredential(name: string, method: 'static_api_key' | 'oauth2' = 'static_api_key'): Promise<Locator> {
    await this.root.getByTestId('add-credential').tap();
    const form = this.screen.getByTestId('add-credential-drawer');
    await form.getByTestId('cred-name-input').fill(name);
    await form.getByTestId(`cred-method-${method}`).check();
    return form;
  }

  /** Generate → "Credential created" dialog (secret sirf yahin, ek baar). */
  async generate(name: string, method: 'static_api_key' | 'oauth2' = 'static_api_key'): Promise<void> {
    const form = await this.startCredential(name, method);
    await form.getByTestId('add-credential-submit').tap();
    await this.secret.waitFor({ timeout: 30_000 });
  }

  /** Secret dialog ka Done → wapas credentials list. */
  async done(): Promise<void> {
    await this.secret.getByTestId('confirm-submit').tap();
    await this.secret.waitFor({ state: 'detached' });
  }

  async addApiKey(name: string): Promise<void> {
    await this.generate(name);
    await this.done();
    await expect(this.credential(name).getByTestId('credential-status')).toHaveText('Active');
  }

}
