import { test as base } from '@e2e-dev/web';
import { IAM_TEAM, iamNames } from './iam.ts';
import { AccessProfilesPage } from './pages/access-profiles.ts';
import { InvitationsDrawer, InviteDrawer } from './pages/invite.ts';
import { RolesPage } from './pages/roles.ts';
import { ServiceAccountsPage } from './pages/service-accounts.ts';
import { MySessionsPage, UsersPage } from './pages/users.ts';

/**
 * The `test` of the IAM tests: page objects as fixtures. e2e builds a fixture only when a test asks for it by
 * name, so keeping them all in one `test` is cheap. `agent` is deliberately in no fixture — a method that
 * drives the agent takes it as an argument, so that exact tests need no model.
 */
export const test = base.extend<{
  users: UsersPage;
  invite: InviteDrawer;
  invitations: InvitationsDrawer;
  mySessions: MySessionsPage;
  roles: RolesPage;
  profiles: AccessProfilesPage;
  serviceAccounts: ServiceAccountsPage;
  /** A new profile given to the existing team `IAM_TEAM`; removed after the test. Returns the profile's name. */
  teamProfile: string;
}>({
  users: async ({ app, browser, screen }, use) => use(new UsersPage({ app, browser, screen })),
  invite: async ({ app, browser, screen }, use) => use(new InviteDrawer({ app, browser, screen })),
  invitations: async ({ app, browser, screen }, use) => use(new InvitationsDrawer({ app, browser, screen })),
  mySessions: async ({ app, browser, screen }, use) => use(new MySessionsPage({ app, browser, screen })),
  roles: async ({ app, browser, screen }, use) => use(new RolesPage({ app, browser, screen })),
  profiles: async ({ app, browser, screen }, use) => use(new AccessProfilesPage({ app, browser, screen })),
  serviceAccounts: async ({ app, browser, screen }, use) => use(new ServiceAccountsPage({ app, browser, screen })),
  // The team is real: while the profile exists, every member has that profile's access. So the removal is in the
  // fixture's teardown — it runs with its own budget (cleanupTimeout) even when the test fails or times out.
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
