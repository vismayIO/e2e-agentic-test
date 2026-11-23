import { env } from '../../lib/env.ts';

/**
 * Test data ke naam aur Mailosaur addresses. Har module apna prefix rakhta hai (jaise `iam-e2e`), aur uska
 * setup pichhle runs ka usi prefix wala data saaf karta hai (cleanup.ts).
 *
 * Test file (ya setup file) ke module scope me bulao. e2e retry aur serial group pe test file dobara import
 * karta hai, isliye har attempt ko naye naam milte hain — pehle attempt ka bacha data ("already exists",
 * "already in use") agle se nahi takrata. Ek attempt ke andar naam stable rehte hain.
 */
export function freshNames(prefix: string) {
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 4)}`;
  const name = (label: string) => `${prefix}-${id}-${label}`;
  return {
    /** Is attempt ka id — sab naamon me yahi, isliye ek prefix se is attempt ka saara data mil jaata hai. */
    id,
    name,
    /** Mailosaur address — kisi asli insaan ko mail nahi jaata. */
    address: (label: string) => `${name(label)}@${env('MAILOSAUR_SERVER_ID')}.mailosaur.net`,
  };
}
