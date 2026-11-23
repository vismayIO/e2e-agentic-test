import { test as base } from '@e2e-dev/web';
import { IAM_TEAM, iamNames } from './iam.ts';
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
  /** Ek naya profile jo maujooda team `IAM_TEAM` ko diya gaya hai; test ke baad hat jaata hai. Lautata hai profile ka naam. */
  teamProfile: string;
}>({
  users: async ({ app, browser, screen }, use) => use(new UsersPage({ app, browser, screen })),
  invite: async ({ app, browser, screen }, use) => use(new InviteDrawer({ app, browser, screen })),
  invitations: async ({ app, browser, screen }, use) => use(new InvitationsDrawer({ app, browser, screen })),
  mySessions: async ({ app, browser, screen }, use) => use(new MySessionsPage({ app, browser, screen })),
  roles: async ({ app, browser, screen }, use) => use(new RolesPage({ app, browser, screen })),
  profiles: async ({ app, browser, screen }, use) => use(new AccessProfilesPage({ app, browser, screen })),
  serviceAccounts: async ({ app, browser, screen }, use) => use(new ServiceAccountsPage({ app, browser, screen })),
  // Team asli hai: jab tak profile rahe, uske har sadasya ke paas us profile ka access hai. Isliye hatana fixture
  // ke teardown me — woh test fail ya time out hone pe bhi apne budget (cleanupTimeout) ke saath chalta hai.
  teamProfile: async ({ profiles }, use) => {
    const name = iamNames().name('team');
    await profiles.open();
    const drawer = await profiles.create(name);
    await drawer.addHolder('teams', IAM_TEAM!.name);
    await use(name);
    await profiles.open();
    await profiles.search(name);
    await profiles.delete(name);
  },
});

export { describe } from '@e2e-dev/web';
