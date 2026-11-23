/**
 * Mailosaur se emails padhna — REST API, bina extra package ke.
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
 * `sentTo` ko `since` ke baad aaye emails, sabse naya pehle, `pick` ko do; jo pehla non-undefined lautaye
 * wahi nateeja. Kuch na mile to Mailosaur ke `x-ms-delay` ke hisaab se dobara poocho, `timeoutMs` tak.
 */
async function waitForMessage<T>(sentTo: string, since: Date, timeoutMs: number, what: string, pick: (msg: Message) => T | undefined): Promise<T> {
  const key = env('MAILOSAUR_API_KEY');
  const server = env('MAILOSAUR_SERVER_ID');
  if (!key || !server) throw new Error('MAILOSAUR_API_KEY / MAILOSAUR_SERVER_ID set karo');
  const BASE = env('MAILOSAUR_BASE_URL') ?? 'https://mailosaur.com/';

  const auth = { authorization: `Basic ${Buffer.from(`${key}:`).toString('base64')}` };
  // 5s pehle se: is machine aur Mailosaur ki ghadi ka chhota farak email miss na karaye
  const query = new URLSearchParams({ server, receivedAfter: new Date(since.getTime() - 5_000).toISOString() });
  const deadline = Date.now() + timeoutMs;
  const seen = new Set<string>(); // jo email kaam ka nahi tha, use dobara mat kholo

  for (;;) {
    const res = await fetch(`${BASE}api/messages/search?${query}`, {
      method: 'POST',
      headers: { ...auth, 'content-type': 'application/json' },
      body: JSON.stringify({ sentTo }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`Mailosaur search fail: HTTP ${res.status} ${await res.text().catch(() => '')}`.slice(0, 300));
    const { items } = (await res.json()) as { items: { id: string }[] };

    for (const item of items) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      const full = await fetch(`${BASE}api/messages/${item.id}`, { headers: auth, signal: AbortSignal.timeout(15_000) });
      if (!full.ok) throw new Error(`Mailosaur message fail: HTTP ${full.status}`);
      const found = pick((await full.json()) as Message);
      if (found !== undefined) return found;
    }

    const delay = Number(res.headers.get('x-ms-delay')?.split(',')[0]) || 1000;
    if (Date.now() + delay > deadline) throw new Error(`Mailosaur: ${timeoutMs / 1000}s me ${sentTo} ko ${what} nahi aaya (${seen.size} doosre emails)`);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}

/** `since` ke baad aaye emails me se sabse naya jisme sign-in code ho — bina code wale (jaise invitation) chhod ke. */
export function latestCode(sentTo: string, since: Date, timeoutMs = 60_000): Promise<string> {
  return waitForMessage(sentTo, since, timeoutMs, 'code wala email', (msg) => msg.text?.codes?.[0]?.value ?? msg.html?.codes?.[0]?.value);
}
