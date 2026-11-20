import { describe, test } from '@e2e-dev/web';
import { unique } from 'e2e';
import { IAM_CONTEXT, IAM_SESSION, IAM_SKIP, RUN_ID, TENANT, openAs, type Fx } from './support.ts';

/**
 * Access profiles + teams (MSP view, tenant "motadata").
 * Brief: SIT-IAM-02, 08, 11 · BEH-IAM-15, 19, 20 · EX-IAM-19.1 · Points to note
 *
 * Har test apna profile `iam-e2e-<run>-…` banata hai (role Approver, organization motadata); bacha data
 * agle run ka setup saaf karta hai (profile delete hone pe uske holders bhi hat jaate hain). Team wale tests
 * maujooda team "qa-pw-team" ko holder banate hain — profile delete hote hi woh assignment bhi jaata hai.
 */
const TEAM = 'qa-pw-team';

describe('IAM access profiles', { skip: IAM_SKIP, session: IAM_SESSION, tags: ['iam', 'access-profiles'], agentContext: IAM_CONTEXT }, () => {
  const newProfile = (label: string) => {
    const name = `iam-e2e-${RUN_ID}-${label}`;
    return name;
  };
  type Agent = Fx['agent'];
  const createProfile = (agent: Agent, name: string) =>
    agent.act('create an access profile named {name} with the role Approver and the organization motadata, then close its drawer', {
      params: { name: unique(name) },
    });


  test('a profile cannot be created without roles and organisations', { tags: ['SIT-IAM-02', 'P1'] }, async ({ app, browser, screen, agent }) => {
    await openAs({ app, browser, screen }, TENANT.msp, '/access-profiles');
    await agent.act('click Create access profile');

    await agent.act('enter the name {name} and choose no roles and no organizations', { params: { name: unique(`iam-e2e-${RUN_ID}-empty`) } });

    await agent.assert('the profile cannot be created yet because it has no roles and no organizations');
  });

  test('"All organizations" says it includes organisations added later', { tags: ['EX-IAM-19.1', 'BEH-IAM-19', 'P1'] }, async ({ app, browser, screen, agent }) => {
    await openAs({ app, browser, screen }, TENANT.msp, '/access-profiles');

    await agent.act('open the access profile Tenant administration');

    await agent.assert('its organizations say All organizations, and that this includes organizations added later');
  });

  test('a team’s profile shows read-only on a member’s profile', { tags: ['SIT-IAM-02', 'BEH-IAM-19', 'P1'] }, async ({ app, browser, screen, agent }) => {
    const name = newProfile('team');
    await openAs({ app, browser, screen }, TENANT.msp, '/access-profiles');
    await createProfile(agent, name);
    await agent.act('open {name}, go to its Teams tab and assign it to the team {team} with no expiry', { params: { name: unique(name), team: TEAM } });
    await agent.waitFor('{team} is listed as a holder of the profile', { params: { team: TEAM } });
    await agent.act('go to Users in the left navigation');

    await agent.act("open raj samani's profile and go to the Access profiles tab");

    await agent.assert('{name} is listed as assigned via team through {team}, with no actions to change it on this person', {
      params: { name: unique(name), team: TEAM },
    });
  });

  // Deployed app (20 Nov 2026): 7 din wala row "Active" dikhta hai, Expiring nahi.
  test('an assignment close to its end shows as expiring', { tags: ['bug', 'SIT-IAM-08', 'BEH-IAM-15', 'P1'] }, async ({ app, browser, screen, agent }) => {
    const name = newProfile('expiring');
    await openAs({ app, browser, screen }, TENANT.msp, '/access-profiles');
    await createProfile(agent, name);

    await agent.act('open {name}, go to its Teams tab and assign it to the team {team} with an expiry of 7 days', { params: { name: unique(name), team: TEAM } });

    await agent.assert('the {team} row of the profile is marked Expiring', { params: { team: TEAM } });
  });

  test('extending one holder leaves the other holder’s end date alone', { tags: ['SIT-IAM-08', 'BEH-IAM-19', 'P1'] }, async ({ app, browser, screen, agent }) => {
    const name = newProfile('two-holders');
    const in7Days = new Date(Date.now() + 7 * 86_400_000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    await openAs({ app, browser, screen }, TENANT.msp, '/access-profiles');
    await createProfile(agent, name);
    await agent.act('open {name}, go to its Teams tab and assign it to the team {team} with an expiry of 7 days', { params: { name: unique(name), team: TEAM } });
    await agent.waitFor('{team} is listed on the Teams tab', { params: { team: TEAM } });
    await agent.act('go to the People tab and assign the profile to the person raj samani with an expiry of 7 days');
    await agent.waitFor('raj samani is listed on the People tab');

    await agent.act("change raj samani's expiry on this profile to 1 year and save, then open the Teams tab");

    await agent.assert('the {team} row on the Teams tab still ends on {date}', { params: { team: TEAM, date: in7Days } });
  });

  // Brief SIT-IAM-11 / BEH-IAM-19: profile ka edit, save se pehle dikhaye kitne log affect honge.
  // Deployed app (20 Nov 2026): seedha save ho jaata hai ("… updated" toast), koi count nahi.
  test('editing a held profile shows how many people it affects before saving', { tags: ['bug', 'SIT-IAM-11', 'BEH-IAM-19', 'P1'] }, async ({ app, browser, screen, agent }) => {
    const name = newProfile('edit');
    await openAs({ app, browser, screen }, TENANT.msp, '/access-profiles');
    await createProfile(agent, name);
    await agent.act('open {name}, go to its Teams tab and assign it to the team {team} with no expiry', { params: { name: unique(name), team: TEAM } });
    await agent.waitFor('{team} is listed as a holder of the profile', { params: { team: TEAM } });
    await agent.act('click Edit on the profile and add the role Technician');

    await agent.act('click Save changes once');

    await agent.assert('a confirmation dialog is open that shows how many people the change affects and asks to confirm it');
  });

  test('replacing a profile with a new one keeps the old one until the new one is created', { tags: ['BEH-IAM-20', 'SIT-IAM-11', 'P1'] }, async ({ app, browser, screen, agent }) => {
    const name = newProfile('replace-me');
    await openAs({ app, browser, screen }, TENANT.msp, '/access-profiles');
    await createProfile(agent, name);
    await agent.act('open {name}, go to its Teams tab and assign it to the team {team} with no expiry, then close the drawer', {
      params: { name: unique(name), team: TEAM },
    });
    await agent.waitFor('the access profiles list is shown');
    await agent.act('choose "Delete access profile" for {name}, pick "Replace with a new access profile", type {word} if asked and continue', {
      params: { name: unique(name), word: 'delete' },
    });
    await agent.waitFor('a form to create the new access profile is open');

    await agent.act('cancel creating the new access profile');

    await agent.assert('{name} is still in the access profiles list', { params: { name: unique(name) } });
  });

  test('deleting a held profile shows who holds it', { tags: ['BEH-IAM-20', 'P1'] }, async ({ app, browser, screen, agent }) => {
    const name = newProfile('held');
    await openAs({ app, browser, screen }, TENANT.msp, '/access-profiles');
    await createProfile(agent, name);
    await agent.act('open {name}, go to its Teams tab and assign it to the team {team} with no expiry, then close the drawer', {
      params: { name: unique(name), team: TEAM },
    });
    await agent.waitFor('the access profiles list is shown');

    await agent.act('open the delete dialog of {name} from its row actions menu and leave it open', { params: { name: unique(name) } });

    await agent.assert('the open delete dialog says who holds the profile and asks how its holders should be handled');
  });

  // Points to note: "Deleting an access profile nobody holds needs no dialog."
  // Deployed app (20 Nov 2026): phir bhi confirm dialog ("No one holds it, so no one loses access.").
  test('a profile nobody holds is deleted without a dialog', { tags: ['bug', 'P2'] }, async ({ app, browser, screen, agent }) => {
    const name = newProfile('unused');
    await openAs({ app, browser, screen }, TENANT.msp, '/access-profiles');
    await createProfile(agent, name);
    await agent.waitFor('{name} is listed in the access profiles list', { params: { name: unique(name) } });

    await agent.act('click "Delete access profile" in the row actions menu of {name} once', { params: { name: unique(name) } });

    await agent.assert('no confirmation dialog is open and {name} is gone from the list', { params: { name: unique(name) } });
  });
});
