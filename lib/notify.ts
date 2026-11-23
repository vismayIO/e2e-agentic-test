/**
 * Slack / Microsoft Teams notification. Webhook set na ho to kuch nahi bhejta.
 *   SLACK_WEBHOOK_URL  : Slack incoming webhook
 *   TEAMS_WEBHOOK_URL  : Teams "Workflows" (Power Automate) webhook — Adaptive Card
 *   NOTIFY_ON          : always (default) | problems  (sirf yellow/red pe)
 */
import type { NightlyRunMeta, Verdict } from './types.ts';
import type { NightlySummary, RunView } from './e2e-report.ts';
import { SEVERITY, monkeyRerun, passedOfTotal } from './e2e-report.ts';
import { env } from './env.ts';

const EMOJI: Record<Verdict, string> = { green: '✅', yellow: '⚠️', red: '🔴' };
const LABEL: Record<Verdict, string> = { green: 'Healthy', yellow: 'Needs attention', red: 'Broken' };

const runFact = (r: RunView, extra = ''): string =>
  r.present ? `${passedOfTotal(r)} passed · ${r.failed} failed${extra}` : r.skipped ? `nahi chala — ${r.skipped}` : 'nahi chala';

function lines(meta: NightlyRunMeta, s: NightlySummary): { title: string; facts: [string, string][]; bullets: string[] } {
  const r = s.regression;
  const bugs = s.knownBugs;
  const bullets = [...s.reasons];
  for (const t of [...s.smoke.failures, ...r.failures].slice(0, 5)) bullets.push(`Failed: ${t.title}`);
  const top = s.explore.flatMap((x) => x.findings.filter((f) => f.kind === 'issue')).slice(0, 5);
  for (const f of top) bullets.push(`[${SEVERITY[f.severity] ?? f.severity}] ${f.title}${f.path ? ` (${f.path})` : ''}`);
  return {
    title: `${EMOJI[s.verdict]} ${meta.appName} nightly QA — ${LABEL[s.verdict]}`,
    facts: [
      ['Smoke', runFact(s.smoke)],
      ['Tests', runFact(r, ` · ${r.flaky} flaky`)],
      ['Known bugs', `${bugs.failing.length} ab bhi fail · ${bugs.fixed.length} fixed (knownBug mark hatao)`],
      ['Explore', `${s.issues} issues · ${s.warnings} warnings${meta.monkeySeed !== undefined ? ` · ${monkeyRerun(meta.monkeySeed)}` : ''}`],
      ['App', meta.appUrl],
    ],
    bullets: [...new Set(bullets)].slice(0, 10),
  };
}

async function post(url: string, body: unknown): Promise<void> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${await res.text().catch(() => '')}`.slice(0, 300));
}

export async function notify(meta: NightlyRunMeta, s: NightlySummary): Promise<void> {
  const when = env('NOTIFY_ON') ?? 'always';
  if (when === 'problems' && s.verdict === 'green') {
    console.log('notify: green run, NOTIFY_ON=problems → skip');
    return;
  }
  const { title, facts, bullets } = lines(meta, s);
  const link = meta.ciRunUrl;

  const slack = env('SLACK_WEBHOOK_URL');
  if (slack) {
    const text = [
      `*${title}*`,
      facts.map(([k, v]) => `*${k}:* ${v}`).join('\n'),
      bullets.map((b) => `• ${b}`).join('\n'),
      link ? `<${link}|Report kholo>` : '',
    ].filter(Boolean).join('\n\n');
    try {
      await post(slack, { text });
      console.log('notify: Slack bheja');
    } catch (e) {
      console.warn(`notify: Slack fail — ${(e as Error).message}`);
    }
  }

  const teams = env('TEAMS_WEBHOOK_URL');
  if (teams) {
    const card = {
      type: 'message',
      attachments: [{
        contentType: 'application/vnd.microsoft.card.adaptive',
        content: {
          $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
          type: 'AdaptiveCard',
          version: '1.4',
          body: [
            { type: 'TextBlock', text: title, weight: 'Bolder', size: 'Medium', wrap: true,
              color: s.verdict === 'red' ? 'Attention' : s.verdict === 'yellow' ? 'Warning' : 'Good' },
            { type: 'FactSet', facts: facts.map(([title, value]) => ({ title, value })) },
            { type: 'TextBlock', text: bullets.map((b) => `- ${b}`).join('\n'), wrap: true },
          ],
          actions: link ? [{ type: 'Action.OpenUrl', title: 'Report kholo', url: link }] : [],
        },
      }],
    };
    try {
      await post(teams, card);
      console.log('notify: Teams bheja');
    } catch (e) {
      console.warn(`notify: Teams fail — ${(e as Error).message}`);
    }
  }
}
