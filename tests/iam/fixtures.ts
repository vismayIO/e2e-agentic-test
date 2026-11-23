import { test as base } from '@e2e-dev/web';
import { AccessProfilesPage } from './pages/access-profiles.ts';
import { InvitationsDrawer, InviteDrawer } from './pages/invite.ts';
import { RolesPage } from './pages/roles.ts';
import { ServiceAccountsPage } from './pages/service-accounts.ts';
import { MySessionsPage, UsersPage } from './pages/users.ts';

/**
 * IAM tests ka `test`: page objects fixtures ke roop me. e2e fixture tabhi banata hai jab test use naam
 * se maange, isliye ek hi `test` me saare rakhna sasta hai. `agent` jaan-boojh ke kisi fixture me nahi —
 * jo method agent chalata hai woh use argument me leta hai, taaki exact tests ko model na chahiye.
 */
export const test = base.extend<{
  users: UsersPage;
  invite: InviteDrawer;
  invitations: InvitationsDrawer;
  mySessions: MySessionsPage;
  roles: RolesPage;
  profiles: AccessProfilesPage;
  serviceAccounts: ServiceAccountsPage;
}>({
  users: async ({ app, browser, screen }, use) => use(new UsersPage({ app, browser, screen })),
  invite: async ({ app, browser, screen }, use) => use(new InviteDrawer({ app, browser, screen })),
  invitations: async ({ app, browser, screen }, use) => use(new InvitationsDrawer({ app, browser, screen })),
  mySessions: async ({ app, browser, screen }, use) => use(new MySessionsPage({ app, browser, screen })),
  roles: async ({ app, browser, screen }, use) => use(new RolesPage({ app, browser, screen })),
  profiles: async ({ app, browser, screen }, use) => use(new AccessProfilesPage({ app, browser, screen })),
  serviceAccounts: async ({ app, browser, screen }, use) => use(new ServiceAccountsPage({ app, browser, screen })),
});

export { describe } from '@e2e-dev/web';
