import { test } from '@e2e-dev/web';
import { ADMIN_SESSION, adminSignIn } from './auth.ts';

/**
 * `admin` session ka setup: sirf admin login, koi test data nahi. Smoke tests aur explore charters isi pe
 * chalte hain, isliye yeh halka hai — saved login chale to seconds me, bina OTP aur bina model call ke.
 *
 * Timeout: bura se bura case me yeh kisi doosre setup ke chal rahe OTP login ka intezaar karta hai aur phir
 * khud OTP login karta hai — auth.ts ka `adminSignIn` dekho.
 */
test.setup('sign in as the admin', { sessions: [ADMIN_SESSION], timeout: 6 * 60_000 }, async ({ app, browser, screen, session }) => {
  console.log(`[admin setup] admin login: ${(await adminSignIn({ app, browser, screen })) === 'reused' ? 'saved login chala, OTP nahi' : 'naya OTP login'}`);
  await session.save(ADMIN_SESSION);
});
