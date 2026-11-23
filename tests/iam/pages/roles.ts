import { expect } from 'e2e';
import { type Ctx, Dialog, ListPage, chooseAction, dialog, openPage, toast } from '../../app/ui.ts';

/** /roles — list, builder (/roles/new), clone aur delete dialogs. */
export class RolesPage extends ListPage {
  constructor(fx: Ctx) {
    super(fx, fx.screen.getByTestId('roles-table'), { keyCell: (table) => table.getByTestId(/^role-name-\d+$/) });
  }

  async open(): Promise<void> {
    await openPage(this.fx, '/roles', 'Roles');
  }

  /** Builder: Details (naam, optional description) → Permissions → Save. Wapas list pe aata hai. */
  async startCreate(name: string, description?: string): Promise<void> {
    const { screen } = this.fx;
    await screen.getByTestId('create-role', { visible: true }).tap();
    await screen.getByTestId('builder-name').fill(name);
    if (description) await screen.getByTestId('builder-description').fill(description);
  }

  async create(name: string, description = 'Temporary role for an e2e test'): Promise<void> {
    const { screen } = this.fx;
    await this.startCreate(name, description);
    await screen.getByTestId('builder-next').tap();
    // Bina permission ke app "Save a role with no permissions?" poochta hai; ek read permission kaafi hai.
    await screen.getByTestId('builder-cards').getByRole('checkbox', 'Read Role').check();
    await screen.getByTestId('builder-save').tap();
    await expect(toast(screen, `Role "${name}" saved`)).toBeVisible({ timeout: 30_000 });
    await this.search(name);
    await expect(this.row(name)).toBeVisible();
  }

  /** Delete dialog: pehle "Reading what holds this role" load hota hai. */
  async openDelete(role: string): Promise<Dialog> {
    await chooseAction(this.screen, this.row(role), 'delete');
    const d = dialog(this.screen, 'delete-role');
    await d.root.getByTestId('delete-impact').waitFor({ timeout: 30_000 });
    return d;
  }

  /** "Remove without replacement" (default) ke saath delete. */
  async delete(role: string): Promise<void> {
    const d = await this.openDelete(role);
    await d.root.getByTestId('delete-mode-remove').check();
    await d.confirmWord.fill('delete');
    await d.confirm();
    await expect(this.row(role)).toHaveCount(0);
  }
}
