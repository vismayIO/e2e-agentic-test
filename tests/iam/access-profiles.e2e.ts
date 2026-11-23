import { expect, unique } from 'e2e';
import { knownBug } from '../../lib/suites.ts';
import { daysFromNow, shortDate } from '../app/ui.ts';
import { describe, test } from './fixtures.ts';
import { IAM_CONTEXT, IAM_SESSION, IAM_TEAM, iamNames, poolUser } from './iam.ts';

/**
 * Access profiles (MSP view, organization "motadata").
 * Brief: SIT-IAM-02, 08, 11 · BEH-IAM-15, 19, 20 · EX-IAM-19.1 · Points to note
 *
 * Precondition (profile, holders) page objects se; jaancha jaane wala kaam agent karta hai, aur nateeja
 * code + agent.assert dono jaanchte hain — code pehle, kyunki woh load hone ka intezaar karta hai aur
 * agent.assert screen ko ek hi baar dekhta hai. Har test apna profile `iam-e2e-<id>-…` banata hai (role Approver,
 * apni organization) aur holders sirf pool users hote hain; baad ka IAM setup profile hatata hai (holders ke
 * saath). Sirf "team ka profile sadasya pe" wala test maujooda team (`IAM_TEAM`) ko holder banata hai, aur
 * apna profile khud hi hata deta hai.
 */
const data = iamNames();

describe('IAM access profiles', { session: IAM_SESSION, agentContext: IAM_CONTEXT }, () => {
  test('a profile cannot be created without roles and organisations', { tags: ['SIT-IAM-02', 'P1'] }, async ({ agent, profiles }) => {
    await profiles.open();

    await agent.act('click Create access profile, enter the name {name}, choose no roles and no organizations, and click the create button once', { params: { name: unique(data.name('empty')) } });

    await expect(profiles.form.getByTestId('field-error')).toContainText(['Choose at least one role.', 'Choose at least one organization, or give access to all.']);
    await agent.assert('the Create access profile form is still open and says at least one role is needed and at least one organization (or access to all) is needed');
  });

  test('"All organizations" says it includes organisations added later', { tags: ['EX-IAM-19.1', 'BEH-IAM-19', 'P1'] }, async ({ agent, screen, profiles }) => {
    await profiles.open();

    await agent.act('open the access profile "Tenant administration" from the list and stop on its Details tab');

    const orgs = screen.getByTestId('profile-drawer').getByTestId('panel-details').getByTestId('profile-org');
    await expect(orgs).toContainText('All organizations');
    await expect(orgs).toContainText(/including ones added later/i);
    await agent.assert('the Details tab lists All organizations under Organizations and says this includes organizations added later');
  });

  test('an admin gives a person a new profile', { tags: ['sanity', 'SIT-IAM-02', 'P1'] }, async ({ agent, profiles }) => {
    const name = data.name('journey');
    const holder = poolUser('shared');
    await profiles.open();

    await agent.act('create an access profile named {name} with the role Approver and the MSP owner organization', { params: { name: unique(name) } });

    await profiles.open();
    await profiles.search(name);
    const drawer = await profiles.openProfile(name);
    await drawer.tab('details');
    await expect(drawer.root.getByTestId('panel-details').getByTestId('profile-role')).toHaveText('Approver');

    await agent.act('give this access profile directly to the person {email} with no expiry, and assign it', { params: { email: unique(holder.email) } });

    await drawer.tab('people');
    // Holders alag request se aate hain ("Loading who holds this access profile…") — pehle unka intezaar.
    await expect(drawer.holder(holder.name).getByTestId('holder-line')).toHaveText('Person · Permanent');
    await agent.assert('the People tab of the access profile {name} lists {person} under Assigned directly as a permanent holder', { params: { name: unique(name), person: unique(holder.name) } });
  });

  test('a team’s profile shows read-only on a member’s profile', { tags: ['SIT-IAM-02', 'BEH-IAM-19', 'P1'], skip: !IAM_TEAM && 'IAM_TEAM / IAM_TEAM_MEMBER_EMAIL set nahi hai' }, async ({ agent, screen, users, teamProfile }) => {
    const team = IAM_TEAM!;
    await users.open();

    await agent.act("search the users list for {email}, open that person's profile and stop on its Access profiles tab", { params: { email: team.member } });

    const row = screen.getByTestId('user-drawer').getByRole('region', 'Assigned via team').getByRole('listitem').filter({ hasText: teamProfile });
    await expect(row).toContainText(new RegExp(`through ${team.name}`, 'i'));
    await expect(row.getByTestId('row-actions-trigger')).toHaveCount(0);
    await agent.assert('{name} is listed under Assigned via team as coming through the team {team}, and its row has no actions button', { params: { name: unique(teamProfile), team: team.name } });
  });

  test('an assignment ending tomorrow shows as expiring', { tags: ['SIT-IAM-08', 'BEH-IAM-15', 'P1'] }, async ({ agent, profiles }) => {
    const holder = poolUser('shared');
    const tomorrow = shortDate(daysFromNow(1));
    await profiles.open();
    const drawer = await profiles.create(data.name('expiring'));

    await agent.act('on this profile, add the person {email} as a holder with a custom expiry that ends on {date}, and assign it', {
      params: { email: unique(holder.email), date: unique(tomorrow) },
    });

    // Holders alag request se aate hain — pehle code unka intezaar kare, phir agent screen dekhe.
    await expect(drawer.holder(holder.name).getByTestId('holder-status')).toHaveText('Expiring');
    // Row tareekh nahi, "Ends in N days" dikhata hai — isliye agent sirf woh kahe jo screen pe hai.
    await agent.assert('{person} is listed under Assigned directly and is marked Expiring', { params: { person: unique(holder.name) } });
  });

  test('extending one holder leaves the other holder’s end date alone', knownBug('23 Nov 2026: do holders wale profile pe Change expiry ka Save "revision is invalid (required)" deta hai', 'SIT-IAM-08', 'BEH-IAM-19', 'P1'), async ({ agent, profiles }) => {
    const [extended, other] = [poolUser('shared'), poolUser('sa-owner')];
    const inAYear = new Date();
    inAYear.setFullYear(inAYear.getFullYear() + 1);
    await profiles.open();
    const drawer = await profiles.create(data.name('two-holders'));
    await drawer.addHolder('people', extended.email, 'd7', extended.name);
    await drawer.addHolder('people', other.email, 'd7', other.name);

    await agent.act('change the expiry of {person} on this profile to 1 year and save; leave every other holder unchanged', { params: { person: unique(extended.name) } });

    await expect(drawer.holder(extended.name).getByTestId('holder-line')).toHaveText(`Person · Ends ${shortDate(inAYear)}`);
    await expect(drawer.holder(other.name).getByTestId('holder-line')).toHaveText(`Person · Ends ${shortDate(daysFromNow(7))}`);
    await agent.assert('the People tab lists {extended} with the end date {extendedEnd} and {other} with the end date {otherEnd}', {
      params: { extended: unique(extended.name), extendedEnd: unique(shortDate(inAYear)), other: unique(other.name), otherEnd: unique(shortDate(daysFromNow(7))) },
    });
  });

  test('editing a held profile shows how many people it affects before saving', { tags: ['SIT-IAM-11', 'BEH-IAM-19', 'P1'] }, async ({ agent, screen, profiles }) => {
    const holder = poolUser('shared');
    await profiles.open();
    const drawer = await profiles.create(data.name('edit'));
    await drawer.addHolder('people', holder.email, 'permanent', holder.name);

    await agent.act('edit this profile, add the role Technician, click Save changes once and stop at what appears; do not confirm anything');

    const impact = screen.getByTestId('profile-impact');
    await expect(impact).toContainText(/changes access for 1 person/i);
    await agent.assert('a confirmation dialog asks whether to save the changes to this profile and says the change affects access for 1 person');
    await impact.getByTestId('confirm-cancel').tap(); // kuch save nahi
  });

  test('replacing a profile with a new one keeps the old one until the new one is created', { tags: ['BEH-IAM-20', 'SIT-IAM-11', 'P1'] }, async ({ agent, profiles }) => {
    const name = data.name('replace-me');
    const holder = poolUser('shared');
    await profiles.open();
    const drawer = await profiles.create(name);
    await drawer.addHolder('people', holder.email, 'permanent', holder.name);
    await drawer.close();
    await profiles.search(name);

    await agent.act('open the delete dialog of the access profile {name} from its row actions menu, choose "Replace with a new access profile", type {word} in the confirmation box and press "Delete & build replacement" once; stop at the form that opens for the new profile and do not change or submit it', {
      params: { name: unique(name), word: 'delete' },
    });

    await expect(profiles.form, 'the form for the replacement profile should open').toBeVisible();

    await agent.act('cancel this form without creating the access profile; if the app asks about unsaved changes, discard them');

    await expect(profiles.form).toHaveCount(0);
    await profiles.open();
    await profiles.search(name);
    await expect(profiles.row(name)).toBeVisible();
    await agent.assert('{name} is still listed in the access profiles list', { params: { name: unique(name) } });
  });

  test('deleting a held profile shows who holds it', { tags: ['BEH-IAM-20', 'P1'] }, async ({ agent, screen, profiles }) => {
    const name = data.name('held');
    const holder = poolUser('shared');
    await profiles.open();
    const drawer = await profiles.create(name);
    await drawer.addHolder('people', holder.email, 'permanent', holder.name);
    await drawer.close();
    await profiles.search(name);

    await agent.act('open the delete dialog of {name} from its row actions menu and stop there; do not type anything and do not delete', { params: { name: unique(name) } });

    const d = screen.getByTestId('delete-profile');
    // Dialog pehle "Loading" dikhata hai — impact aane ka intezaar.
    await expect(d.getByTestId('delete-impact')).toContainText('Held by 1 person', { timeout: 30_000 });
    for (const outcome of ['replace_existing', 'replace_new', 'remove']) await expect(d.getByTestId(`outcome-${outcome}`)).toBeAttached();
    await agent.assert('the delete dialog says the profile is held by 1 person, explains what happens to holders, and asks whether to replace it with an existing profile, replace it with a new one, or remove it without replacement');
  });

  // Points to note: "Deleting an access profile nobody holds needs no dialog."
  test('a profile nobody holds is deleted without a dialog', knownBug('23 Nov 2026: unheld profile pe bhi confirm dialog aata hai ("No one holds it, so no one loses access.")', 'P2'), async ({ agent, screen, profiles }) => {
    const name = data.name('unused');
    await profiles.open();
    const drawer = await profiles.create(name);
    await drawer.close();
    await profiles.search(name);

    await agent.act('click "Delete access profile" in the row actions menu of {name} once and stop at whatever happens next; do not confirm anything', { params: { name: unique(name) } });

    await expect(screen.getByTestId('delete-profile'), 'brief: an unheld profile is deleted straight away, with no dialog').toHaveCount(0);
    await expect(profiles.row(name)).toHaveCount(0);
    await agent.assert('the access profiles list is searched for {name} and says no access profiles match', { params: { name: unique(name) } });
  });
});
