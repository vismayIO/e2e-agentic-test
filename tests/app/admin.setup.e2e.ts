import { test } from '@e2e-dev/web';
import { ADMIN_SESSION, adminSignIn } from './auth.ts';

/**
 * Setup of the `admin` session: the admin login only, no test data. Smoke tests and explore charters run on
 * it, so it is light — seconds when the saved login works, with no OTP and no model call.
 *
 * Timeout: in the worst case it waits for another setup's OTP login in progress and then does an OTP login
 * of its own — see `adminSignIn` in auth.ts.
 */
test.setup('sign in as the admin', { sessions: [ADMIN_SESSION], timeout: 6 * 60_000 }, async ({ app, browser, screen, session }) => {
  console.log(`[admin setup] admin login: ${(await adminSignIn({ app, browser, screen })) === 'reused' ? 'saved login reused, no OTP' : 'new OTP login'}`);
  await session.save(ADMIN_SESSION);
});
