import type { Locator, Screen } from 'e2e';
import { expect } from 'e2e';
import { type Ctx, Dialog, ListPage, chooseAction, dialog, openPage, toast } from '../../app/ui.ts';

/** The name of the tenant's own organization in the profile form (the list and drawer show it as "motadata"). */
const OWN_ORG = 'MSP owner organization';

type Expiry = 'permanent' | 'd7' | 'd30' | 'd90' | 'y1';

/** The expiry block of Add holders (`add-holders-expiry`): switch off = permanent, otherwise a preset. */
async function setExpiry(block: Locator, expiry: Expiry): Promise<void> {
  const toggle = block.getByTestId('add-holders-expiry-switch');
  if (expiry === 'permanent') {
    await toggle.uncheck();
    return;
  }
  await toggle.check();
  await block.getByTestId(`add-holders-expiry-${expiry}`).check();
}

/** /access-profiles — list, create/edit form, profile drawer, delete dialog. */
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

  /** Popover multi-select: the options are buttons (not options), and the popover stays open after a pick. */
  async pickRoles(roles: string[]): Promise<void> {
    // Role chips end up over the trigger and block the tap (edit form) — open it with the keyboard.
    await this.form.getByTestId('profile-roles-trigger').press('Enter');
    const popover = this.screen.getByTestId('profile-roles-popover');
    for (const role of roles) await popover.getByRole('button', role).tap();
    await popover.getByTestId('profile-roles-popover-search').press('Escape');
  }

  /**
   * Create a profile (the given roles, the tenant's own organization); after create the app opens its drawer by itself — return that.
   */
  async create(name: string, { roles = ['Approver'] } = {}): Promise<ProfileDrawer> {
    await this.startCreate();
    await this.form.getByTestId('profile-name').fill(name);
    await this.pickRoles(roles);
    await this.form.getByTestId('profile-orgs-trigger').tap();
    const popover = this.screen.getByTestId('profile-orgs-popover');
    await popover.getByRole('button', OWN_ORG).tap();
    await popover.getByTestId('profile-orgs-popover-search').press('Escape');
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

  /** "Delete access profile" in the list row's menu — whether or not a dialog follows. */
  async rowDelete(name: string): Promise<void> {
    await chooseAction(this.screen, this.row(name), 'delete');
  }

  /** The delete dialog from the list row's menu; "Loading" shows first. */
  async openDelete(name: string): Promise<Dialog> {
    await this.rowDelete(name);
    const d = dialog(this.screen, 'delete-profile');
    await d.root.waitFor();
    await expect(d.root.getByRole('status', 'Loading')).toHaveCount(0, { timeout: 30_000 });
    return d;
  }

  /** Held profile: "Remove without replacement" + word; unheld: confirm directly. */
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

/** Profile drawer: Details / People / Teams tabs and holders. */
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
   * A holder on the People or Teams tab who holds the profile directly (by name / email substring). On the People
   * tab, holders through a team are in a separate list (`holder-via-team`) — one person can be in both.
   */
  holder(text: string): Locator {
    return this.root.getByTestId(/^holder-(direct|teams)$/).getByTestId(/^holder-\d+$/).filter({ hasText: text });
  }

  /**
   * Add teams / Add people → choose the holder → expiry → Assign. `match` = team name or the person's email;
   * the holder list shows a person by name, hence `shownAs`.
   */
  async addHolder(kind: 'teams' | 'people', match: string, expiry: Expiry = 'permanent', shownAs = match): Promise<void> {
    await this.tab(kind);
    await this.root.getByTestId(kind === 'teams' ? 'add-teams' : 'add-people').tap();
    const add = this.screen.getByTestId('add-holders');
    await add.getByTestId('holders-search').fill(match);
    await add.getByTestId('holders-list').getByRole('listitem').filter({ hasText: match }).getByRole('checkbox').check();
    await add.getByTestId('add-holders-next').tap();
    await setExpiry(add.getByTestId('add-holders-expiry'), expiry);
    await add.getByTestId('add-holders-submit').tap();
    await add.waitFor({ state: 'detached', timeout: 30_000 });
    await expect(this.holder(shownAs)).toBeVisible({ timeout: 15_000 });
  }

  async close(): Promise<void> {
    await this.root.getByRole('button', 'Close').tap();
    await this.root.waitFor({ state: 'detached' });
  }
}
