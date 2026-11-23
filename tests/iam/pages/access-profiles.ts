import type { Locator, Screen } from 'e2e';
import { expect } from 'e2e';
import { type Ctx, Dialog, ListPage, chooseAction, dialog, openPage, toast } from '../../app/ui.ts';

/** Tenant ki apni organization ka naam profile form me (list aur drawer me yahi "motadata" dikhta hai). */
export const OWN_ORG = 'MSP owner organization';

export type Expiry = 'permanent' | 'd7' | 'd30' | 'd90' | 'y1';

/** Add holders ka expiry block (Change expiry me bhi wahi, `change-expiry-` prefix ke saath). */
async function setExpiry(scope: Locator, prefix: 'add-holders-expiry', expiry: Expiry): Promise<void> {
  const toggle = scope.getByTestId(`${prefix}-switch`);
  if (expiry === 'permanent') {
    await toggle.uncheck();
    return;
  }
  await toggle.check();
  await scope.getByTestId(`${prefix}-${expiry}`).check();
}

/** /access-profiles — list, create/edit form, profile drawer, delete dialog. DOM map: access-model.md (ACCESS PROFILES) */
export class AccessProfilesPage extends ListPage {
  readonly form: Locator;

  constructor(fx: Ctx) {
    super(fx, fx.screen.getByTestId('access-profiles-table'), { keyCell: (table) => table.getByTestId(/^ap-name-\d+$/) });
    this.form = fx.screen.getByTestId('profile-form');
  }

  async open(): Promise<void> {
    await openPage(this.fx, '/access-profiles', 'Access profiles');
  }

  async startCreate(): Promise<void> {
    await this.screen.getByTestId('create-profile', { visible: true }).tap();
    await this.form.waitFor();
  }

  /** Popover multi-select: option buttons hain (options nahi), aur pick ke baad popover khula rehta hai. */
  async pickRoles(roles: string[]): Promise<void> {
    // Role chips trigger ke upar aa jaate hain aur tap rok lete hain (edit form) — keyboard se kholo.
    await this.form.getByTestId('profile-roles-trigger').press('Enter');
    const popover = this.screen.getByTestId('profile-roles-popover');
    for (const role of roles) await popover.getByRole('button', role).tap();
    await popover.getByTestId('profile-roles-popover-search').press('Escape');
  }

  /**
   * Profile banao; app create ke baad uska drawer khud kholta hai — wahi lautao.
   * `orgs: 'all'` = "Access to all organizations", warna tenant ki apni organization.
   */
  async create(name: string, { roles = ['Approver'], orgs = 'own' as 'own' | 'all' } = {}): Promise<ProfileDrawer> {
    await this.startCreate();
    await this.form.getByTestId('profile-name').fill(name);
    await this.pickRoles(roles);
    if (orgs === 'all') {
      await this.form.getByTestId('profile-all-orgs').check();
    } else {
      await this.form.getByTestId('profile-orgs-trigger').tap();
      const popover = this.screen.getByTestId('profile-orgs-popover');
      await popover.getByRole('button', OWN_ORG).tap();
      await popover.getByTestId('profile-orgs-popover-search').press('Escape');
    }
    await this.form.getByTestId('profile-submit').tap();
    await this.form.waitFor({ state: 'detached', timeout: 30_000 });
    await expect(toast(this.screen, `${name} created`)).toBeVisible();
    const drawer = new ProfileDrawer(this.fx);
    await expect(drawer.title).toHaveText(name, { timeout: 30_000 });
    return drawer;
  }

  async openProfile(name: string): Promise<ProfileDrawer> {
    await this.row(name).getByText(name).tap();
    const drawer = new ProfileDrawer(this.fx);
    await expect(drawer.title).toHaveText(name, { timeout: 30_000 });
    return drawer;
  }

  /** List row ke menu me "Delete access profile" — dialog aaye ya na aaye. */
  async rowDelete(name: string): Promise<void> {
    await chooseAction(this.screen, this.row(name), 'delete');
  }

  /** List row ke menu se delete dialog; pehle "Loading" aata hai. */
  async openDelete(name: string): Promise<Dialog> {
    await this.rowDelete(name);
    const d = dialog(this.screen, 'delete-profile');
    await d.root.waitFor();
    await expect(d.root.getByRole('status', 'Loading')).toHaveCount(0, { timeout: 30_000 });
    return d;
  }

  /** Held profile: "Remove without replacement" + word; unheld: seedha confirm. */
  async delete(name: string): Promise<void> {
    const d = await this.openDelete(name);
    if (await d.confirmWord.isVisible()) {
      await d.root.getByTestId('outcome-remove').check();
      await d.confirmWord.fill('delete');
    }
    await d.confirm();
    await expect(this.row(name)).toHaveCount(0, { timeout: 15_000 });
  }
}

/** Profile drawer: Details / People / Teams tabs aur holders. */
export class ProfileDrawer {
  readonly root: Locator;
  readonly title: Locator;

  readonly fx: Ctx;
  readonly screen: Screen;

  constructor(fx: Ctx) {
    this.fx = fx;
    const screen = (this.screen = fx.screen);
    this.root = screen.getByTestId('profile-drawer');
    this.title = this.root.getByTestId('profile-title');
  }

  async tab(name: 'details' | 'people' | 'teams'): Promise<void> {
    await this.root.getByTestId(`tab-${name}`).tap();
  }

  /**
   * People ya Teams tab pe ek holder jo profile seedha rakhta hai (naam / email substring se). People tab pe
   * team ke through wale holders alag list (`holder-via-team`) me hote hain — ek hi insaan dono me ho sakta hai.
   */
  holder(text: string): Locator {
    return this.root.getByTestId(/^holder-(direct|teams)$/).getByTestId(/^holder-\d+$/).filter({ hasText: text });
  }


  /**
   * Add teams / Add people → holder chuno → expiry → Assign. `match` = team naam ya person ka email;
   * holder list me person apne naam se dikhta hai, isliye `shownAs`.
   */
  async addHolder(kind: 'teams' | 'people', match: string, expiry: Expiry = 'permanent', shownAs = match): Promise<void> {
    await this.tab(kind);
    await this.root.getByTestId(kind === 'teams' ? 'add-teams' : 'add-people').tap();
    const add = this.screen.getByTestId('add-holders');
    await add.getByTestId('holders-search').fill(match);
    await add.getByTestId('holders-list').getByRole('listitem').filter({ hasText: match }).getByRole('checkbox').check();
    await add.getByTestId('add-holders-next').tap();
    await setExpiry(add.getByTestId('add-holders-expiry'), 'add-holders-expiry', expiry);
    await add.getByTestId('add-holders-submit').tap();
    await add.waitFor({ state: 'detached', timeout: 30_000 });
    await expect(this.holder(shownAs)).toBeVisible({ timeout: 15_000 });
  }



  async close(): Promise<void> {
    await this.root.getByRole('button', 'Close').tap();
    await this.root.waitFor({ state: 'detached' });
  }
}
