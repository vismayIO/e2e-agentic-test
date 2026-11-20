/**
 * Mailosaur se sign-in code (OTP) padhna — REST API, bina extra package ke.
 *   MAILOSAUR_API_KEY   : Mailosaur API key (Basic auth username)
 *   MAILOSAUR_SERVER_ID : inbox (server) id, jaise "abc123" → addresses …@abc123.mailosaur.net
 *   MAILOSAUR_BASE_URL  : optional, default https://mailosaur.com/
 * Mailosaur email me se codes khud nikaal deta hai (`text.codes` / `html.codes`).
 */
import { env } from './env.ts';

interface Code { value: string }
interface Message { text?: { codes?: Code[] }; html?: { codes?: Code[] } }

export function mailosaurConfigured(): boolean {
  return Boolean(env('MAILOSAUR_API_KEY') && env('MAILOSAUR_SERVER_ID'));
}

/**
 * `sentTo` ko `since` ke baad aaya sabse naya email dhoondo aur uska pehla code lautao.
 * Email aane tak Mailosaur ke `x-ms-delay` ke hisaab se dobara poochta hai, `timeoutMs` tak.
 */
export async function latestCode(sentTo: string, since: Date, timeoutMs = 60_000): Promise<string> {
  const key = env('MAILOSAUR_API_KEY');
  const server = env('MAILOSAUR_SERVER_ID');
  if (!key || !server) throw new Error('MAILOSAUR_API_KEY / MAILOSAUR_SERVER_ID set karo');
  const BASE = env('MAILOSAUR_BASE_URL') ?? 'https://mailosaur.com/';

  const auth = { authorization: `Basic ${Buffer.from(`${key}:`).toString('base64')}` };
  // 5s pehle se: is machine aur Mailosaur ki ghadi ka chhota farak email miss na karaye
  const query = new URLSearchParams({ server, receivedAfter: new Date(since.getTime() - 5_000).toISOString() });
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    const res = await fetch(`${BASE}api/messages/search?${query}`, {
      method: 'POST',
      headers: { ...auth, 'content-type': 'application/json' },
      body: JSON.stringify({ sentTo }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`Mailosaur search fail: HTTP ${res.status} ${await res.text().catch(() => '')}`.slice(0, 300));
    const { items } = (await res.json()) as { items: { id: string }[] };

    if (items.length) {
      const full = await fetch(`${BASE}api/messages/${items[0].id}`, { headers: auth, signal: AbortSignal.timeout(15_000) });
      if (!full.ok) throw new Error(`Mailosaur message fail: HTTP ${full.status}`);
      const msg = (await full.json()) as Message;
      const code = msg.text?.codes?.[0]?.value ?? msg.html?.codes?.[0]?.value;
      if (!code) throw new Error(`Mailosaur: ${sentTo} ka email mila, par usme koi code nahi`);
      return code;
    }

    const delay = Number(res.headers.get('x-ms-delay')?.split(',')[0]) || 1000;
    if (Date.now() + delay > deadline) throw new Error(`Mailosaur: ${timeoutMs / 1000}s me ${sentTo} ko koi email nahi aaya`);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}
