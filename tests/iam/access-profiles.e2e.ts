import { expect, unique } from 'e2e';
import { LOGIN_SKIP } from '../app/auth.ts';
import { daysFromNow, shortDate, toast } from '../app/ui.ts';
import { describe, test } from './fixtures.ts';
import { IAM_CONTEXT, IAM_SESSION, IAM_TEAM, iamNames, poolUser } from './iam.ts';

/**
 * Access profiles (MSP view, organization "motadata").
 * Brief: SIT-IAM-02, 08, 11 · BEH-IAM-15, 19, 20 · EX-IAM-19.1 · Points to note
 *
 * Precondition (profile, holders) page objects se; jaancha jaane wala kaam agent karta hai, aur nateeja
 * agent.assert + code dono jaanchte hain. Har test apna profile `iam-e2e-<id>-…` banata hai (role Approver,
 * apni organization) aur holders sirf pool users hote hain; agle run ka setup profile hatata hai (holders ke
 * saath). Sirf "team ka profile sadasya pe" wala test maujooda team (`IAM_TEAM`) ko holder banata hai.
 */
const data = iamNames();

describe('IAM access profiles', { skip: LOGIN_SKIP, session: IAM_SESSION, tags: ['iam', 'access-profiles'], agentContext: IAM_CONTEXT }, () => {
  test('a profile cannot be created without roles and organisations', { tags: ['SIT-IAM-02', 'P1'] }, async ({ agent, profiles }) => {
    await profiles.open();

    await agent.act('click Create access profile, enter the name {name}, choose no roles and no organizations, and click the create button once', { params: { name: unique(data.name('empty')) } });

    await agent.assert('the profile was not created: the form is still open and says at least one role is needed and at least one organization (or access to all) is needed');
    await expect(profiles.form.getByTestId('field-error')).toContainText(['Choose at least one role.', 'Choose at least one organization, or give access to all.']);
  });

  test('"All organizations" says it includes organisations added later', { tags: ['EX-IAM-19.1', 'BEH-IAM-19', 'P1'] }, async ({ agent, screen, profiles }) => {
    await profiles.open();

    await agent.act('open the access profile "Tenant administration" and look at its details');

    await agent.assert('the profile reaches All organizations, and the details say this includes organizations added later');
    const orgs = screen.getByTestId('profile-drawer').getByTestId('panel-details').getByTestId('profile-org');
    await expect(orgs).toContainText('All organizations');
    await expect(orgs).toContainText(/including ones added later/i);
  });

  test('an admin gives a person a new profile', { tags: ['SIT-IAM-02', 'P1'] }, async ({ agent, profiles }) => {
    const name = data.name('journey');
    const holder = poolUser('shared');
    await profiles.open();

    await agent.act('create an access profile named {name} with the role Approver and the MSP owner organization, then give it directly to the person {email} with no expiry', {
      params: { name: unique(name), email: unique(holder.email) },
    });

    await profiles.open();
    await profiles.search(name);
    const drawer = await profiles.openProfile(name);
    await drawer.tab('people');
    await agent.assert('the profile {name} has the role Approver, and {person} holds it directly with no end date', { params: { name: unique(name), person: unique(holder.name) } });
    await expect(drawer.holder(holder.name).getByTestId('holder-line')).toHaveText('Person · Permanent');
  });

  test('a team’s profile shows read-only on a member’s profile', { tags: ['SIT-IAM-02', 'BEH-IAM-19', 'P1'], skip: !IAM_TEAM && 'IAM_TEAM / IAM_TEAM_MEMBER_EMAIL set nahi hai' }, async ({ agent, screen, profiles, users }) => {
    const team = IAM_TEAM!;
    const name = data.name('team');
    await profiles.open();
    const drawer = await profiles.create(name);
    await drawer.addHolder('teams', team.name);
    await users.open();

    await agent.act("search the users list for {email}, open that person's profile and go to its Access profiles tab", { params: { email: team.member } });

    await agent.assert('{name} is listed as assigned through the team {team}, and this person’s profile offers no action to change or revoke it', { params: { name: unique(name), team: team.name } });
    const row = screen.getByTestId('user-drawer').getByRole('region', 'Assigned via team').getByRole('listitem').filter({ hasText: name });
    await expect(row).toContainText(new RegExp(`through ${team.name}`, 'i'));
    await expect(row.getByTestId('row-actions-trigger')).toHaveCount(0);
  });

  test('an assignment ending tomorrow shows as expiring', { tags: ['SIT-IAM-08', 'BEH-IAM-15', 'P1'] }, async ({ agent, profiles }) => {
    const holder = poolUser('shared');
    await profiles.open();
    const drawer = await profiles.create(data.name('expiring'));

    await agent.act('on this profile, add the person {email} as a holder with a custom expiry that ends on {date}, and assign it', {
      params: { email: unique(holder.email), date: unique(shortDate(daysFromNow(1))) },
    });

    await agent.assert('{person} is listed on the profile with an end date tomorrow and is marked Expiring', { params: { person: unique(holder.name) } });
    await expect(drawer.holder(holder.name).getByTestId('holder-status')).toHaveText('Expiring');
  });

  test('extending one holder leaves the other holder’s end date alone', { tags: ['SIT-IAM-08', 'BEH-IAM-19', 'P1'] }, async ({ agent, profiles }) => {
    const [extended, other] = [poolUser('shared'), poolUser('sa-owner')];
    const inAYear = new Date();
    inAYear.setFullYear(inAYear.getFullYear() + 1);
    await profiles.open();
    const drawer = await profiles.create(data.name('two-holders'));
    await drawer.addHolder('people', extended.email, 'd7', extended.name);
    await drawer.addHolder('people', other.email, 'd7', other.name);

    await agent.act('change the expiry of {person} on this profile to 1 year and save; leave every other holder unchanged', { params: { person: unique(extended.name) } });

    await agent.assert('{extended} now ends in about a year, and {other} still ends in 7 days, on {date}', {
      params: { extended: unique(extended.name), other: unique(other.name), date: unique(shortDate(daysFromNow(7))) },
    });
    await expect(drawer.holder(extended.name).getByTestId('holder-line')).toHaveText(`Person · Ends ${shortDate(inAYear)}`);
    await expect(drawer.holder(other.name).getByTestId('holder-line')).toHaveText(`Person · Ends ${shortDate(daysFromNow(7))}`);
  });

  test('editing a held profile shows how many people it affects before saving', { tags: ['SIT-IAM-11', 'BEH-IAM-19', 'P1'] }, async ({ agent, screen, profiles }) => {
    const holder = poolUser('shared');
    await profiles.open();
    const drawer = await profiles.create(data.name('edit'));
    await drawer.addHolder('people', holder.email, 'permanent', holder.name);

    await agent.act('edit this profile, add the role Technician, click Save changes once and stop at what appears; do not confirm anything');

    const impact = screen.getByTestId('profile-impact');
    await agent.assert('before anything is saved, a confirmation says how many people the change affects (1 person) and asks to confirm the save');
    await expect(impact).toContainText(/changes access for 1 person/i);
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

    await agent.act('delete the access profile {name} choosing "Replace with a new access profile" and typing {word}, continue, then cancel the form for the new profile without creating it', {
      params: { name: unique(name), word: 'delete' },
    });

    await profiles.open();
    await profiles.search(name);
    await agent.assert('{name} is still listed in the access profiles list', { params: { name: unique(name) } });
    await expect(profiles.row(name)).toBeVisible();
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
    await agent.assert('the delete dialog says the profile is held by 1 person, explains what happens to holders, and asks whether to replace it with an existing profile, replace it with a new one, or remove it without replacement');
    await expect(d.getByTestId('delete-impact')).toContainText('Held by 1 person');
    for (const outcome of ['replace_existing', 'replace_new', 'remove']) await expect(d.getByTestId(`outcome-${outcome}`)).toBeAttached();
  });

  // Points to note: "Deleting an access profile nobody holds needs no dialog."
  // Deployed app (20 + 23 Nov 2026): phir bhi confirm dialog ("No one holds it, so no one loses access.").
  test('a profile nobody holds is deleted without a dialog', { tags: ['bug', 'P2'] }, async ({ agent, screen, profiles }) => {
    const name = data.name('unused');
    await profiles.open();
    const drawer = await profiles.create(name);
    await drawer.close();
    await profiles.search(name);

    await agent.act('click "Delete access profile" in the row actions menu of {name} once and stop at whatever happens next; do not confirm anything', { params: { name: unique(name) } });

    await agent.assert('{name} was deleted straight away, with no confirmation dialog', { params: { name: unique(name) } });
    await expect(screen.getByTestId('delete-profile'), 'brief: an unheld profile is deleted straight away, with no dialog').toHaveCount(0);
    await expect(toast(screen, `${name} deleted`)).toBeVisible();
  });
});
