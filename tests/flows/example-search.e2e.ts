import { describe, test } from '@e2e-dev/web';
import { expect } from 'e2e';

/**
 * TEMPLATE — apne app ka ek critical flow aise likho, phir yeh file hata do
 * ya `test.skip` ko `test` kar do.
 *
 * Pattern: arrange (sahi screen kholo) → act (ek goal, agent.act) → assert.
 * Jahan exact value pata ho wahan `expect(...)` use karo — woh model call nahi karta
 * aur sasta + deterministic hai. `agent.assert` tab jab baat describe karni pade.
 */
describe('search', { tags: ['critical'] }, () => {
  test.skip('searching a product shows matching results', async ({ app, agent, screen, browser }) => {
    await app.open('/');

    await agent.act('search for {query}', { params: { query: 'laptop' } });

    await expect(browser).toHaveURL(/search|q=/);
    await expect(screen.getByRole('heading', { level: 1 })).toBeVisible();
    await agent.assert('the results list shows items related to laptops');
  });

  // Login wala flow: describe/test pe { session: 'qa' } lagao (tests/auth.setup.e2e.ts dekho)
});
