import { expect, unique } from 'e2e';
import { LOGIN_SKIP } from '../app/auth.ts';
import { describe, test } from './fixtures.ts';
import { IAM_CONTEXT, IAM_SESSION, iamNames } from './iam.ts';

const data = iamNames();

/**
 * Roles (MSP view, tenant "motadata"): custom role, clone, delete.
 * Brief: SIT-IAM-11 (steps 6, 9) · BEH-IAM-20 · Points to note ("A custom role needs a description and can be cloned")
 *
 * Har test apna role `iam-e2e-<id>-…` naam se banata hai; pichhle runs ka bacha data setup saaf karta hai.
 * Clone sirf built-in roles pe hai (custom pe menu item disabled).
 */
const ROLE_CONTEXT = `${IAM_CONTEXT} Roles are on the Roles page; a custom role is created with "Create role" (details, then permissions).`;

describe('IAM roles', { skip: LOGIN_SKIP, session: IAM_SESSION, tags: ['iam', 'roles'], agentContext: ROLE_CONTEXT }, () => {
  // Deployed app (23 Nov 2026): sirf naam se hi "Next" enabled — description optional hai.
  test('a custom role cannot move on without a description', { tags: ['bug', 'SIT-IAM-11', 'P2'] }, async ({ agent, screen, roles }) => {
    await roles.open();

    await agent.act('click Create role, enter the role name {name}, leave the description empty, and try to go to the next step once; do not save anything', {
      params: { name: unique(data.name('nodesc')) },
    });

    await agent.assert('the role builder is still on its Details step and tells the admin that a description is needed');
    await expect(screen.getByTestId('builder-details'), 'brief: a custom role needs a description').toBeVisible();
    await expect(screen.getByTestId('builder-next')).toBeDisabled();
  });

  test('a new custom role is listed as Custom', { tags: ['SIT-IAM-11', 'P1'] }, async ({ agent, roles }) => {
    const name = data.name('release-engineer');
    const description = 'Edits tickets owned by the person’s teams';
    await roles.open();

    await agent.act('create a custom role named {name} with the description {description}; on the permissions step tick only the "Read Role" permission, then save the role', {
      params: { name: unique(name), description },
    });

    await roles.open();
    await roles.search(name);
    await agent.assert('the roles list shows {name} as a Custom role with the description {description} and 1 permission', { params: { name: unique(name), description } });
    await expect(roles.row(name).getByTestId('type-chip')).toHaveText('Custom');
    await expect(roles.row(name).getByTestId('permission-count')).toHaveText('1 permission');
  });

  test('cloning a built-in role starts a copy of it', { tags: ['P2'] }, async ({ agent, screen, roles }) => {
    await roles.open();

    await agent.act('choose "Clone role" in the row actions menu of the built-in role Technician and stop at the form that opens; do not save');

    const form = screen.getByTestId('clone-role');
    await agent.assert('a form to clone Technician is open; its role name marks it as a copy of Technician, its description is empty, and nothing has been saved yet');
    await expect(form.getByTestId('clone-name-input')).toHaveValue('Technician (copy)');
    await form.getByTestId('confirm-cancel').tap();
  });

  test('deleting a role asks what happens to its holders', { tags: ['BEH-IAM-20', 'SIT-IAM-11', 'P1'] }, async ({ agent, screen, roles }) => {
    const name = data.name('to-delete');
    await roles.open();
    await roles.create(name);

    await agent.act('open the delete dialog of the role {name} from its row actions menu and stop there; do not type anything and do not delete', { params: { name: unique(name) } });

    const d = screen.getByTestId('delete-role');
    await agent.assert('the delete dialog says what holds this role today (nothing), asks how holders should be handled with three choices — replace with an existing role, replace with a new role, remove without replacement — and its delete button stays disabled until the word delete is typed');
    await expect(d.getByTestId('delete-impact')).toBeVisible();
    for (const mode of ['replaceExisting', 'replaceNew', 'remove']) await expect(d.getByTestId(`delete-mode-${mode}`)).toBeAttached();
    await expect(d.getByTestId('confirm-submit')).toBeDisabled();
  });

  // Brief BEH-IAM-20: "replace with an existing one, replace with a new one, or remove".
  // Deployed app (20 + 23 Nov 2026): "Replace with a new role" disabled — "Not available yet".
  test('a role held by a profile can be replaced with a new one', { tags: ['bug', 'BEH-IAM-20', 'P1'] }, async ({ agent, screen, roles, profiles }) => {
    const name = data.name('replace-me');
    await roles.open();
    await roles.create(name);
    await profiles.open();
    await profiles.create(data.name('replace-holder'), { roles: [name] }); // ab role kisi profile me hai
    await roles.open();
    await roles.search(name);

    await agent.act('open the delete dialog of the role {name}, choose "Replace with a new role" and stop there; do not type anything and do not delete', { params: { name: unique(name) } });

    await agent.assert('"Replace with a new role" is selected in the delete dialog and offers to build the replacement role');
    await expect(screen.getByTestId('delete-role').getByTestId('delete-mode-replaceNew'), 'brief: a role can be replaced with a new one').toBeChecked();
  });
});
