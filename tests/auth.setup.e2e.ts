import { test } from '@e2e-dev/web';
import { credentials } from 'e2e';
import { env, hasLogin } from '../lib/env.ts';

/**
 * QA user ek baar login karta hai aur session 'qa' naam se save hota hai.
 * Login wale tests ({ session: 'qa' }) aur `e2e explore --session qa` isi ko reuse karte hain.
 *
 * Login form ke locators app ke hisaab se badalte hain, isliye yahan agent login karta hai.
 * Password model ko kabhi nahi dikhta: agent use `type_secret` se naam se bharta hai.
 */
if (hasLogin()) {
  test.setup('sign in as the QA user', { sessions: ['qa'] }, async ({ app, agent, session }) => {
    const qa = credentials.user('qa');

    await app.open(env('LOGIN_PATH') ?? '/');
    await agent.act('Sign in with the provided username and password', {
      params: { username: qa.username, password: qa.password },
    });
    await agent.waitFor(
      'the user is signed in: an account menu, avatar, sign-out option, or a signed-in home/dashboard is visible',
    );

    await session.save('qa');
  });
}
