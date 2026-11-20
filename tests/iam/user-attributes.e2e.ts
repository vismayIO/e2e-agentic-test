import { describe, test } from '@e2e-dev/web';
import { expect, unique } from 'e2e';
import { env } from '../../lib/env.ts';
import { IAM_CONTEXT, IAM_SESSION, IAM_SKIP, RUN_ID, TENANT, openAs } from './support.ts';

/**
 * User attributes (custom fields).
 * Brief: SIT-IAM-13 · BEH-IAM-12, 27, 28 · EX-IAM-27.1
 *
 * Deployed tenant (20 Nov 2026) pe "Create attribute" admin ke liye disabled hai — brief ke hisaab se
 * custom fields `user_attribute.manage` permission se chalte hain. Admin ko woh permission milte hi
 * `IAM_ATTRIBUTES_ENABLED=1` set karo. MSP→client read-only wale tests (BEH-IAM-28) tab tak nahi jab
 * tak tenant me koi client organization nahi.
 */
const ATTRIBUTES_SKIP = env('IAM_ATTRIBUTES_ENABLED') === '1'
  ? false
  : '"Create attribute" is admin ke liye disabled hai (user_attribute.manage) — mil jaaye to IAM_ATTRIBUTES_ENABLED=1';

describe('IAM user attributes', { skip: IAM_SKIP || ATTRIBUTES_SKIP, session: IAM_SESSION, tags: ['iam', 'user-attributes'], agentContext: IAM_CONTEXT }, () => {
  const label = (s: string) => `iam-e2e-${RUN_ID}-${s}`;

  test('a label written as markup shows as plain text and runs nothing', { tags: ['EX-IAM-27.1', 'BEH-IAM-27', 'P0'] }, async ({ app, browser, screen, agent }) => {
    const markup = `<img src=x onerror=alert(1)> ${label('xss')}`;
    const dialogs: string[] = [];
    await browser.onDialog(async (d) => {
      dialogs.push(d.message);
      await d.dismiss();
    });
    await openAs({ app, browser, screen }, TENANT.msp, '/fields');

    await agent.act('create a Text attribute named {name}', { params: { name: unique(markup) } });

    await expect(screen.getByText(markup)).toBeVisible();
    expect(dialogs).toEqual([]);
  });

  test('archiving an attribute is undone by restoring it', { tags: ['BEH-IAM-12', 'P1'] }, async ({ app, browser, screen, agent }) => {
    const name = label('archive');
    await openAs({ app, browser, screen }, TENANT.msp, '/fields');
    await agent.act('create a Text attribute named {name}', { params: { name: unique(name) } });
    await agent.act('archive the attribute {name} and confirm', { params: { name: unique(name) } });
    await agent.waitFor('{name} is marked Archived', { params: { name: unique(name) } });

    await agent.act('restore the attribute {name}', { params: { name: unique(name) } });

    await agent.assert('{name} is no longer marked Archived', { params: { name: unique(name) } });
  });

  test('deleting an attribute needs the word delete', { tags: ['SIT-IAM-13', 'BEH-IAM-12', 'P1'] }, async ({ app, browser, screen, agent }) => {
    const name = label('delete');
    await openAs({ app, browser, screen }, TENANT.msp, '/fields');
    await agent.act('create a Text attribute named {name}', { params: { name: unique(name) } });
    await agent.act('choose "Delete attribute" in the row actions menu of {name}', { params: { name: unique(name) } });
    await agent.waitFor('a delete confirmation asks to type a word to confirm');

    await agent.act('type {word} in the confirmation box', { params: { word: 'remove' } });

    await agent.assert('the button that would delete the attribute is disabled');
  });
});
