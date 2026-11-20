import { describe, test } from '@e2e-dev/web';
import { unique } from 'e2e';
import { IAM_CONTEXT, IAM_SESSION, IAM_SKIP, RUN_ID, TENANT, openAs } from './support.ts';

/**
 * Roles (MSP view, tenant "motadata"): custom role, clone, delete.
 * Brief: SIT-IAM-11 (steps 6, 9) · BEH-IAM-20 · Points to note ("A custom role needs a description and can be cloned")
 *
 * Har test apna role `iam-e2e-<run>-…` naam se banata hai; pichhle runs ka bacha data setup saaf karta hai.
 */
const ROLE_CONTEXT = `${IAM_CONTEXT} Roles are on the Roles page; a custom role is created with "Create role" (details, then permissions).`;

describe('IAM roles', { skip: IAM_SKIP, session: IAM_SESSION, tags: ['iam', 'roles'], agentContext: ROLE_CONTEXT }, () => {
  const newRole = (label: string) => {
    const name = `iam-e2e-${RUN_ID}-${label}`;
    return name;
  };


  test('a custom role cannot move on without a description', { tags: ['SIT-IAM-11', 'P2'] }, async ({ app, browser, screen, agent }) => {
    await openAs({ app, browser, screen }, TENANT.msp, '/roles');
    await agent.act('click Create role');

    await agent.act('enter the role name {name} and leave the description empty', { params: { name: unique(`iam-e2e-${RUN_ID}-nodesc`) } });

    await agent.assert('the role cannot move on to the next step until it has a description');
  });

  test('a new custom role is listed as Custom', { tags: ['SIT-IAM-11', 'P1'] }, async ({ app, browser, screen, agent }) => {
    const name = newRole('release-engineer');
    await openAs({ app, browser, screen }, TENANT.msp, '/roles');
    await agent.act('click Create role');
    await agent.act('enter the role name {name} and the description {description}, then go to the next step', {
      params: { name: unique(name), description: 'Edits tickets owned by the person’s teams' },
    });
    await agent.waitFor('the permissions step of the role builder is shown');

    await agent.act('save the role');

    await agent.assert('the roles list shows {name} as a Custom role', { params: { name: unique(name) } });
  });

  test('cloning a built-in role starts a copy of it', { tags: ['P2'] }, async ({ app, browser, screen, agent }) => {
    await openAs({ app, browser, screen }, TENANT.msp, '/roles');

    await agent.act('choose "Clone role" in the row actions menu of Technician');

    await agent.waitFor('a form to clone the role is open');
    await agent.assert('the clone form has a role name that marks it as a copy of Technician');
  });

  test('deleting a role asks what happens to its holders', { tags: ['BEH-IAM-20', 'SIT-IAM-11', 'P1'] }, async ({ app, browser, screen, agent }) => {
    const name = newRole('to-delete');
    await openAs({ app, browser, screen }, TENANT.msp, '/roles');
    await agent.act('create a custom role named {name} with the description {description} and save it', {
      params: { name: unique(name), description: 'Temporary role for an e2e test' },
    });
    await agent.waitFor('{name} is listed in the roles list', { params: { name: unique(name) } });

    await agent.act('choose "Delete role" in the row actions menu of {name}', { params: { name: unique(name) } });

    await agent.assert('the delete dialog says who is affected and lists the choices: replace with an existing role, replace with a new role, or remove (the replace choices may be disabled when nothing holds the role)');
  });

  // Brief BEH-IAM-20: "replace with an existing one, replace with a new one, or remove".
  // Deployed app (20 Nov 2026): "Replace with a new role" disabled — "Not available yet".
  test('replacing a role with a new one keeps the old role until the new one is saved', { tags: ['bug', 'BEH-IAM-20', 'P1'] }, async ({ app, browser, screen, agent }) => {
    const name = newRole('replace-me');
    await openAs({ app, browser, screen }, TENANT.msp, '/roles');
    await agent.act('create a custom role named {name} with the description {description} and save it', {
      params: { name: unique(name), description: 'Temporary role for an e2e test' },
    });
    await agent.waitFor('{name} is listed in the roles list', { params: { name: unique(name) } });
    await agent.act('choose "Delete role" for {name}, pick "Replace with a new role" named {newName}, type {word} to confirm and continue', {
      params: { name: unique(name), newName: unique(`${name}-new`), word: 'delete' },
    });
    await agent.waitFor('a form for the new replacement role is open');

    await agent.act('cancel the new role and discard it');

    await agent.assert('{name} is still in the roles list', { params: { name: unique(name) } });
  });
});
