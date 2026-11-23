import { env } from './env.ts';

/**
 * Test data ke naam aur Mailosaur addresses. Har module apna prefix rakhta hai (jaise `iam-e2e`), aur uska
 * setup pichhle runs ka usi prefix wala data saaf karta hai (tests/app/cleanup.ts).
 *
 * Test file (ya setup file) ke module scope me bulao. e2e retry aur serial group pe test file dobara import
 * karta hai, isliye har attempt ko naye naam milte hain — pehle attempt ka bacha data ("already exists",
 * "already in use") agle se nahi takrata. Ek attempt ke andar naam stable rehte hain.
 */
export function freshNames(prefix: string) {
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 4)}`;
  const name = (label: string) => `${prefix}-${id}-${label}`;
  const inbox = env('MAILOSAUR_SERVER_ID');
  return {
    /** Is attempt ka id — sab naamon me yahi, isliye ek prefix se is attempt ka saara data mil jaata hai. */
    id,
    name,
    /** Mailosaur address — kisi asli insaan ko mail nahi jaata. */
    address: (label: string) => {
      if (!inbox) throw new Error('MAILOSAUR_SERVER_ID set karo — test addresses usi inbox ke hote hain');
      return `${name(label)}@${inbox}.mailosaur.net`;
    },
  };
}

/**
 * `freshNames` ka banaya naam kab bana (id ke shuru me base36 `Date.now()` hai) — cleanup isi se chal rahe
 * runs ka data chhodta hai. Jo naam is shape ka nahi (haath se bana, ya decode hoke aane wale kal ka nikle)
 * uska koi waqt nahi: `undefined`.
 */
export function createdAt(name: string, prefix: string): number | undefined {
  const id = name.toLowerCase().match(new RegExp(`^${prefix}-(?:x-)?([0-9a-z]+)-`))?.[1];
  const ms = id ? parseInt(id.slice(0, -2), 36) : NaN;
  return Number.isFinite(ms) && ms <= Date.now() ? ms : undefined;
}
