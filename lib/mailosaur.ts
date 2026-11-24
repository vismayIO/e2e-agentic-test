/**
 * Reading emails from Mailosaur — REST API, no extra package.
 *   MAILOSAUR_API_KEY   : Mailosaur API key (Basic auth username)
 *   MAILOSAUR_SERVER_ID : inbox (server) id, such as "abc123" → addresses …@abc123.mailosaur.net
 *   MAILOSAUR_BASE_URL  : optional, default https://mailosaur.com/
 * Mailosaur extracts the codes from an email itself (`text.codes` / `html.codes`).
 */
import { env } from './env.ts';

interface Code { value: string }
interface Message { text?: { codes?: Code[] }; html?: { codes?: Code[] } }

export function mailosaurConfigured(): boolean {
  return Boolean(env('MAILOSAUR_API_KEY') && env('MAILOSAUR_SERVER_ID'));
}

/**
 * Give `pick` the emails sent to `sentTo` after `since`, newest first; the first non-undefined it returns is
 * the result. If nothing is found, ask again after Mailosaur's `x-ms-delay`, until `timeoutMs`.
 */
async function waitForMessage<T>(sentTo: string, since: Date, timeoutMs: number, what: string, pick: (msg: Message) => T | undefined): Promise<T> {
  const key = env('MAILOSAUR_API_KEY');
  const server = env('MAILOSAUR_SERVER_ID');
  if (!key || !server) throw new Error('Set MAILOSAUR_API_KEY / MAILOSAUR_SERVER_ID');
  const BASE = env('MAILOSAUR_BASE_URL') ?? 'https://mailosaur.com/';

  const auth = { authorization: `Basic ${Buffer.from(`${key}:`).toString('base64')}` };
  // From 5s earlier: a small clock difference between this machine and Mailosaur must not miss the email
  const query = new URLSearchParams({ server, receivedAfter: new Date(since.getTime() - 5_000).toISOString() });
  const deadline = Date.now() + timeoutMs;
  const seen = new Set<string>(); // do not reopen an email that was of no use

  for (;;) {
    const res = await fetch(`${BASE}api/messages/search?${query}`, {
      method: 'POST',
      headers: { ...auth, 'content-type': 'application/json' },
      body: JSON.stringify({ sentTo }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`Mailosaur search failed: HTTP ${res.status} ${await res.text().catch(() => '')}`.slice(0, 300));
    const { items } = (await res.json()) as { items: { id: string }[] };

    for (const item of items) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      const full = await fetch(`${BASE}api/messages/${item.id}`, { headers: auth, signal: AbortSignal.timeout(15_000) });
      if (!full.ok) throw new Error(`Mailosaur message failed: HTTP ${full.status}`);
      const found = pick((await full.json()) as Message);
      if (found !== undefined) return found;
    }

    const delay = Number(res.headers.get('x-ms-delay')?.split(',')[0]) || 1000;
    if (Date.now() + delay > deadline) throw new Error(`Mailosaur: no ${what} arrived for ${sentTo} in ${timeoutMs / 1000}s (${seen.size} other emails)`);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}

/** The newest email after `since` that carries a sign-in code — skipping those without one (such as an invitation). */
export function latestCode(sentTo: string, since: Date, timeoutMs = 60_000): Promise<string> {
  return waitForMessage(sentTo, since, timeoutMs, 'email with a code', (msg) => msg.text?.codes?.[0]?.value ?? msg.html?.codes?.[0]?.value);
}
