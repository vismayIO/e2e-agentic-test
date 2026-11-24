/** Nightly report — one self-contained HTML page (light + dark) that opens without a server. */
import type { HistoryEntry, NightlyRunMeta, Verdict } from './types.ts';
import type { ExploreView, FindingView, KnownBugs, NightlySummary, RunView, TestFailure } from './e2e-report.ts';
import { SEVERITY, firstLine, monkeyRerun, passedOfTotal, where } from './e2e-report.ts';

const esc = (s: unknown): string =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const fmtDur = (ms: number): string => {
  if (!ms) return '—';
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
};
const fmtNum = (n: number): string => new Intl.NumberFormat('en-US', { notation: n >= 10000 ? 'compact' : 'standard' }).format(n);

const VERDICT_LABEL: Record<Verdict, string> = { green: 'Healthy', yellow: 'Needs attention', red: 'Broken' };
const VERDICT_ICON: Record<Verdict, string> = { green: '✓', yellow: '!', red: '✕' };

function sevChip(f: FindingView): string {
  const name = f.kind === 'warning' ? 'warning' : SEVERITY[f.severity] ?? `sev ${f.severity}`;
  const cls = f.kind === 'warning' ? 'sev-low' : f.severity >= 5 ? 'sev-critical' : f.severity >= 4 ? 'sev-high' : f.severity >= 3 ? 'sev-medium' : 'sev-low';
  const icon = cls === 'sev-critical' || cls === 'sev-high' ? '✕' : cls === 'sev-medium' ? '!' : 'i';
  return `<span class="chip ${cls}"><span aria-hidden="true">${icon}</span>${esc(name)}</span>`;
}

function shot(href: string | undefined, alt: string): string {
  if (!href) return '';
  return `<a class="shot" href="${esc(href)}" target="_blank" rel="noopener"><img loading="lazy" src="${esc(href)}" alt="${esc(alt)}"></a>`;
}

function failureCard(t: TestFailure, kind: 'failed' | 'flaky' | 'known bug'): string {
  const links = [
    t.trace && `<a href="${esc(t.trace)}" target="_blank" rel="noopener">trace.md</a>`,
    t.video && `<a href="${esc(t.video)}" target="_blank" rel="noopener">video</a>`,
    t.url && `<a href="${esc(t.url)}" target="_blank" rel="noopener">page</a>`,
  ].filter(Boolean).join(' · ');
  return `<article class="card">
    <div class="card-body">
      <div class="card-head">
        <span class="chip ${kind === 'failed' ? 'sev-critical' : 'sev-medium'}"><span aria-hidden="true">${kind === 'failed' ? '✕' : '!'}</span>${t.setup ? 'setup ' : ''}${kind}</span>
        <h3>${esc(t.title)}</h3>
      </div>
      <div class="meta mono">${esc(where(t))}${t.tags.length ? ` · ${t.tags.map((x) => `#${esc(x)}`).join(' ')}` : ''}</div>
      ${t.code || t.message ? `<pre class="err"><b>${esc(t.code ?? '')}</b>${t.message ? `\n${esc(t.message)}` : ''}</pre>` : ''}
      ${links ? `<div class="links">${links}</div>` : ''}
    </div>
    ${shot(t.screenshot, `Screenshot at failure: ${t.title}`)}
  </article>`;
}

function findingCard(f: FindingView): string {
  return `<article class="card finding">
    <div class="card-body">
      <div class="card-head">${sevChip(f)}<h3>${esc(f.title)}</h3></div>
      ${f.path ? `<div class="meta mono">${esc(f.path)}</div>` : ''}
      <dl class="ea">
        ${f.expected ? `<dt>Expected</dt><dd>${esc(f.expected)}</dd>` : ''}
        ${f.actual ? `<dt>Actual</dt><dd>${esc(f.actual)}</dd>` : ''}
      </dl>
      ${f.reproduction?.length ? `<details><summary>Reproduce (${f.reproduction.length} steps)</summary><ol>${f.reproduction.map((s) => `<li>${esc(s)}</li>`).join('')}</ol></details>` : ''}
    </div>
    ${shot(f.screenshot, `Evidence: ${f.title}`)}
  </article>`;
}

const errors = (list: { code?: string; message?: string }[]): string =>
  list.map((e) => `<pre class="err"><b>${esc(e.code ?? 'ERROR')}</b>\n${esc(e.message ?? '')}</pre>`).join('');

const skippedLine = (reason: string): string => `<p><b>Skipped</b> — ${esc(reason)}</p>`;

/** One `e2e run` (smoke or regression): failures, flaky, the count of skipped tests, and a link to e2e's own full report. */
function runSection(name: 'Smoke' | 'Regression', r: RunView): string {
  const clean = r.present && !r.failures.length && !r.runErrors.length;
  return `<section>
  <h2>${name} tests ${r.present ? `<span class="muted" style="font-weight:400">· ${passedOfTotal(r)} · ${fmtDur(r.durationMs)}</span>` : ''}</h2>
  ${r.skipped ? skippedLine(r.skipped) : !r.present && !r.runErrors.length ? '<p class="muted">This stage did not run in this run.</p>' : ''}
  ${errors(r.runErrors)}
  ${r.failures.length ? `<div class="cards">${r.failures.map((t) => failureCard(t, 'failed')).join('')}</div>` : ''}
  ${clean ? `<p class="ok-line"><span aria-hidden="true">✓</span> ${r.skippedTests ? `The ${r.passed} tests that ran passed` : `All ${r.passed} tests passed`}</p>` : ''}
  ${r.skippedTests ? `<p class="muted">${r.skippedTests} tests were skipped (did not run) — which ones and why is in the full report below.</p>` : ''}
  ${r.flakyTests.length ? `<h3 style="margin-top:16px">Flaky (passed on retry)</h3><div class="cards">${r.flakyTests.map((t) => failureCard(t, 'flaky')).join('')}</div>` : ''}
  ${r.htmlReport ? `<p><a href="${esc(r.htmlReport)}" target="_blank" rel="noopener">Full ${name.toLowerCase()} report (every test's steps, screenshots, video) →</a></p>` : ''}
</section>`;
}

/** Known bugs: those that now pass (mark still to remove) first, then those still failing. Only "fixed" changes the verdict. */
function knownBugsSection(k: KnownBugs): string {
  if (!k.fixed.length && !k.failing.length) return '';
  const fixed = k.fixed.map((t) => `<article class="card">
    <div class="card-body">
      <div class="card-head"><span class="chip v-chip-green"><span aria-hidden="true">✓</span>fixed</span><h3>${esc(t.title)}</h3></div>
      <div class="meta mono">${esc(where(t))}</div>
    </div>
  </article>`).join('');
  return `<section>
  <h2>Known bugs <span class="muted" style="font-weight:400">· tests marked <span class="mono">knownBug</span></span></h2>
  ${fixed ? `<h3>Fixed — remove the <span class="mono">knownBug</span> mark (${k.fixed.length})</h3><p class="muted">These tests pass now. Once the mark is removed they are ordinary regression tests.</p><div class="cards">${fixed}</div>` : ''}
  ${k.failing.length ? `<h3 style="margin-top:16px">Still failing (${k.failing.length})</h3><p class="muted">Already known — does not change the verdict.</p><div class="cards">${k.failing.map((t) => failureCard(t, 'known bug')).join('')}</div>` : ''}
</section>`;
}

function exploreSection(x: ExploreView): string {
  if (x.skipped) {
    return `<section class="explore skipped"><h3 class="goal-id mono">${esc(x.id)}</h3>${skippedLine(x.skipped)}</section>`;
  }
  const origin = [x.module && `module ${x.module}`, x.persona && `persona ${x.persona}`, x.charter === 'monkey' && 'monkey charter'].filter(Boolean).join(' · ');
  const issues = x.findings.filter((f) => f.kind === 'issue').length;
  const warns = x.findings.length - issues;
  const stepRows = x.steps.map((s) => `<tr><td class="num">${s.index}</td><td>${esc(s.title)}</td><td><span class="st st-${esc(s.status)}">${esc(s.status)}</span>${s.errorCode ? ` <span class="mono muted">${esc(s.errorCode)}</span>` : ''}</td><td class="num">${fmtDur(s.durationMs ?? 0)}</td></tr>`).join('');
  return `<section class="explore">
    <div class="explore-head">
      <h3 class="goal-id mono">${esc(x.id)}</h3>
      <span class="muted">${origin ? `${esc(origin)} · ` : ''}${issues} issue · ${warns} warning · ${x.steps.length} steps · ended: ${esc(x.ended)} · ${fmtDur(x.durationMs)}</span>
    </div>
    <p class="goal">“${esc(x.goal)}”</p>
    ${x.setupFailures.length ? `<div class="cards">${x.setupFailures.map((t) => failureCard(t, 'failed')).join('')}</div>` : ''}
    ${errors(x.runErrors)}
    ${x.status === 'blocked' ? '<p><b class="st-blocked">Blocked</b> — the agent could not explore anything for this goal (no step ran, or every step got stuck). See the steps below.</p>' : ''}
    ${x.summary ? `<div class="assessment"><div class="label">Agent assessment</div><p>${esc(x.summary)}</p></div>` : ''}
    ${x.findings.length ? `<div class="cards">${x.findings.map(findingCard).join('')}</div>` : x.status === 'passed' ? '<p class="ok-line"><span aria-hidden="true">✓</span> No findings for this goal</p>' : ''}
    ${x.steps.length ? `<details><summary>What the agent did (${x.steps.length} steps)</summary><table class="tbl"><thead><tr><th>#</th><th>Step</th><th>Status</th><th>Time</th></tr></thead><tbody>${stepRows}</tbody></table></details>` : ''}
  </section>`;
}

/** Last N nights — status cells; each cell has an icon + hover tooltip, with a table view below */
function trend(history: HistoryEntry[]): string {
  if (!history.length) return '';
  const cells = history.map((h, i) => {
    const d = new Date(h.date);
    const label = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
    const tip = `${label} — ${VERDICT_LABEL[h.verdict]} · ${h.failed} failed · ${h.flaky} flaky · ${h.issues} issues`;
    const inner = `<span aria-hidden="true">${VERDICT_ICON[h.verdict]}</span>`;
    const el = h.runUrl
      ? `<a class="cell v-${h.verdict}" href="${esc(h.runUrl)}" target="_blank" rel="noopener" data-tip="${esc(tip)}" aria-label="${esc(tip)}">${inner}</a>`
      : `<span class="cell v-${h.verdict}" tabindex="0" data-tip="${esc(tip)}" aria-label="${esc(tip)}">${inner}</span>`;
    return i === history.length - 1 ? el.replace('class="cell', 'class="cell latest') : el;
  }).join('');
  const rows = [...history].reverse().map((h) => `<tr><td>${esc(new Date(h.date).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }))}</td><td><span class="chip v-chip-${h.verdict}"><span aria-hidden="true">${VERDICT_ICON[h.verdict]}</span>${VERDICT_LABEL[h.verdict]}</span></td><td class="num">${h.passed}</td><td class="num">${h.failed}</td><td class="num">${h.flaky}</td><td class="num">${h.issues}</td><td class="num">${h.warnings}</td><td class="num">${fmtDur(h.durationMs)}</td></tr>`).join('');
  return `<section>
    <h2>Last ${history.length} nights</h2>
    <div class="trend" role="list">${cells}</div>
    <div class="legend"><span><i class="sw v-green"></i>✓ Healthy</span><span><i class="sw v-yellow"></i>! Needs attention</span><span><i class="sw v-red"></i>✕ Broken</span><span class="muted">← older · today →</span></div>
    <details><summary>Table view</summary><table class="tbl"><thead><tr><th>Night</th><th>Verdict</th><th>Passed</th><th>Failed</th><th>Flaky</th><th>Issues</th><th>Warnings</th><th>Duration</th></tr></thead><tbody>${rows}</tbody></table></details>
  </section>`;
}

export function renderHtml(meta: NightlyRunMeta, s: NightlySummary, history: HistoryEntry[]): string {
  const r = s.regression;
  const bugs = s.knownBugs;
  const date = new Date(meta.startedAt);
  const totalMs = meta.phases.reduce((n, p) => n + (p.durationMs ?? 0), 0);
  const tiles = [
    { label: 'Smoke passed', value: s.smoke.present ? `${s.smoke.passed}<small>/${s.smoke.total}</small>` : '—', alert: s.smoke.failed > 0 },
    { label: 'Tests passed', value: r.present ? `${r.passed}<small>/${r.total}</small>` : '—' },
    { label: 'Tests failed', value: r.present ? String(r.failed) : '—', alert: r.failed > 0 },
    { label: 'Tests skipped', value: r.present ? String(r.skippedTests) : '—' },
    { label: 'Flaky', value: r.present ? String(r.flaky) : '—' },
    { label: 'Known bugs', value: r.present ? `${bugs.failing.length}${bugs.fixed.length ? `<small> · ${bugs.fixed.length} fixed</small>` : ''}` : '—' },
    { label: 'Explore issues', value: String(s.issues), alert: s.verdict === 'red' && s.issues > 0 },
    { label: 'Warnings', value: String(s.warnings) },
    { label: 'AI tokens', value: s.modelTokens ? fmtNum(s.modelTokens) : '0' },
  ];

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(meta.appName)} — Nightly QA ${esc(date.toISOString().slice(0, 10))} — ${VERDICT_LABEL[s.verdict]}</title>
<style>
:root{
  --surface-0:#f4f4f1; --surface-1:#fcfcfb; --border:#e3e2dd;
  --ink:#0b0b0b; --ink-2:#52514e; --ink-3:#7a7974;
  --good:#0ca30c; --warn:#fab219; --serious:#ec835a; --critical:#d03b3b;
  --good-ink:#006300; --warn-ink:#7a5200; --critical-ink:#a31f1f;
  --code-bg:#f1f0ec; --accent:#2a62d4;
  color-scheme: light dark;
}
@media (prefers-color-scheme: dark){
  :root{ --surface-0:#121211; --surface-1:#1a1a19; --border:#2e2e2c; --ink:#f0efec; --ink-2:#c3c2b7; --ink-3:#8f8e86;
    --good-ink:#5fd35f; --warn-ink:#fab219; --critical-ink:#ff8a8a; --code-bg:#232321; --accent:#7aa5ff; }
}
*{box-sizing:border-box}
body{margin:0;background:var(--surface-0);color:var(--ink);font:15px/1.5 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.wrap{max-width:1080px;margin:0 auto;padding:32px 20px 64px}
a{color:var(--accent)}
.mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:13px}
.muted{color:var(--ink-3)}
h1{font-size:26px;margin:0 0 4px;letter-spacing:-.01em}
h2{font-size:17px;margin:36px 0 12px}
h3{font-size:15px;margin:0}
header .sub{color:var(--ink-2)}
.banner{display:flex;gap:16px;align-items:flex-start;margin:20px 0;padding:18px 20px;border-radius:12px;background:var(--surface-1);border:1px solid var(--border);border-left:6px solid var(--v)}
.banner .big{font-size:22px;font-weight:650;display:flex;gap:10px;align-items:center}
.banner .ico{display:inline-grid;place-items:center;width:30px;height:30px;border-radius:50%;background:var(--v);color:#fff;font-size:16px;font-weight:700}
.banner ul{margin:8px 0 0;padding-left:18px;color:var(--ink-2)}
.v-green{--v:var(--good)} .v-yellow{--v:var(--warn)} .v-red{--v:var(--critical)}
.banner.v-yellow .ico{color:#2b1d00}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px}
.tile{background:var(--surface-1);border:1px solid var(--border);border-radius:10px;padding:12px 14px}
.tile .v{font-size:26px;font-weight:650;font-variant-numeric:tabular-nums}
.tile .v small{font-size:14px;color:var(--ink-3);font-weight:500}
.tile .l{color:var(--ink-2);font-size:13px}
.tile.alert .v{color:var(--critical-ink)}
.trend{display:flex;gap:2px;flex-wrap:wrap}
.cell{display:inline-grid;place-items:center;width:22px;height:30px;border-radius:4px;background:var(--v);color:#fff;font-size:12px;font-weight:700;text-decoration:none;outline-offset:2px}
.cell.v-yellow{color:#2b1d00}
.cell.latest{box-shadow:0 0 0 2px var(--surface-0),0 0 0 4px var(--ink-2)}
.legend{display:flex;gap:16px;flex-wrap:wrap;margin-top:10px;font-size:13px;color:var(--ink-2)}
.sw{display:inline-block;width:10px;height:10px;border-radius:3px;background:var(--v);margin-right:6px;vertical-align:-1px}
#tip{position:fixed;pointer-events:none;background:var(--ink);color:var(--surface-1);padding:6px 9px;border-radius:6px;font-size:12px;opacity:0;transition:opacity .08s;z-index:9;max-width:320px}
.cards{display:grid;gap:10px}
.card{display:grid;grid-template-columns:1fr auto;gap:14px;background:var(--surface-1);border:1px solid var(--border);border-radius:10px;padding:14px 16px}
.card-head{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:4px}
.meta{color:var(--ink-3);margin-bottom:6px;word-break:break-all}
.shot img{display:block;width:220px;max-height:150px;object-fit:cover;object-position:top;border-radius:6px;border:1px solid var(--border)}
pre.err{white-space:pre-wrap;word-break:break-word;background:var(--code-bg);border-radius:6px;padding:8px 10px;margin:6px 0;font:12.5px/1.45 ui-monospace,Menlo,Consolas,monospace;color:var(--ink-2)}
pre.err b{color:var(--critical-ink)}
.links{font-size:13px}
.chip{display:inline-flex;gap:5px;align-items:center;font-size:12px;font-weight:600;padding:2px 8px;border-radius:999px;border:1px solid currentColor;white-space:nowrap;text-transform:capitalize}
.sev-critical{color:var(--critical-ink)} .sev-high{color:var(--critical-ink)} .sev-medium{color:var(--warn-ink)} .sev-low{color:var(--ink-2)}
.v-chip-green{color:var(--good-ink)} .v-chip-yellow{color:var(--warn-ink)} .v-chip-red{color:var(--critical-ink)}
dl.ea{display:grid;grid-template-columns:auto 1fr;gap:2px 12px;margin:6px 0}
dl.ea dt{color:var(--ink-3);font-size:13px} dl.ea dd{margin:0}
.explore{background:transparent;border-top:1px solid var(--border);padding:18px 0 6px}
.explore-head{display:flex;gap:12px;align-items:baseline;flex-wrap:wrap}
.goal{color:var(--ink-2);margin:4px 0 10px;font-style:italic}
.assessment{background:var(--surface-1);border:1px solid var(--border);border-radius:10px;padding:10px 14px;margin-bottom:10px}
.assessment .label{font-size:12px;color:var(--ink-3);text-transform:uppercase;letter-spacing:.04em}
.assessment p{margin:2px 0 0}
.ok-line{color:var(--good-ink)}
details{margin:10px 0}
summary{cursor:pointer;color:var(--ink-2)}
.tbl{border-collapse:collapse;width:100%;margin-top:8px;font-size:13.5px;background:var(--surface-1)}
.tbl th,.tbl td{border-bottom:1px solid var(--border);padding:6px 10px;text-align:left}
.tbl .num{text-align:right;font-variant-numeric:tabular-nums}
.st{font-weight:600}.st-passed{color:var(--good-ink)}.st-failed{color:var(--critical-ink)}.st-blocked,.st-exhausted{color:var(--warn-ink)}
footer{margin-top:48px;color:var(--ink-3);font-size:13px}
@media (max-width:640px){.card{grid-template-columns:1fr}.shot img{width:100%}}
@media print{details{display:block}.cell{print-color-adjust:exact;-webkit-print-color-adjust:exact}}
</style>
</head>
<body>
<div class="wrap">
<header>
  <h1>${esc(meta.appName)} · Nightly QA</h1>
  <div class="sub"><a href="${esc(meta.appUrl)}" target="_blank" rel="noopener">${esc(meta.appUrl)}</a> · ${esc(date.toLocaleString('en-GB', { dateStyle: 'full', timeStyle: 'short', timeZone: 'UTC' }))} UTC · ${fmtDur(totalMs)}${meta.model ? ` · model <span class="mono">${esc(meta.model)}</span>` : ''}${meta.ciRunUrl ? ` · <a href="${esc(meta.ciRunUrl)}" target="_blank" rel="noopener">CI run</a>` : ''}</div>
</header>

<div class="banner v-${s.verdict}" role="status">
  <span class="ico" aria-hidden="true">${VERDICT_ICON[s.verdict]}</span>
  <div>
    <div class="big">${VERDICT_LABEL[s.verdict]}</div>
    <ul>${s.reasons.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
  </div>
</div>

<div class="tiles">${tiles.map((t) => `<div class="tile${t.alert ? ' alert' : ''}"><div class="v">${t.value}</div><div class="l">${t.label}</div></div>`).join('')}</div>

${trend(history)}

${runSection('Smoke', s.smoke)}

${runSection('Regression', r)}

${knownBugsSection(bugs)}

<section>
  <h2>AI exploration</h2>
  ${meta.monkeySeed !== undefined ? `<p class="muted">Seed <span class="mono">${meta.monkeySeed}</span> — today's charters and monkey forms were picked with it. The same monkey forms again: <span class="mono">${esc(monkeyRerun(meta.monkeySeed))}</span></p>` : ''}
  ${s.explore.length ? s.explore.map(exploreSection).join('') : '<p class="muted">No exploration ran in this run. Charters: <span class="mono">tests/&lt;module&gt;/charters.ts</span></p>'}
  <p class="muted" style="font-size:13px">Findings are the agent's claims + screenshot evidence. Before filing a bug, check “Actual” against the screenshot.</p>
</section>

<footer>e2e nightly · ${esc(meta.startedAt)} → ${esc(meta.finishedAt)} · phases: ${meta.phases.map((p) => `${esc(p.id)} (exit ${p.exitCode ?? '—'}${p.skipped ? ', skipped' : ''})`).join(', ')}</footer>
</div>
<div id="tip" role="tooltip"></div>
<script>
(() => {
  const tip = document.getElementById('tip');
  const show = (el, x, y) => { tip.textContent = el.dataset.tip; tip.style.opacity = 1;
    const w = tip.offsetWidth; tip.style.left = Math.min(x + 12, innerWidth - w - 8) + 'px'; tip.style.top = (y + 14) + 'px'; };
  const hide = () => { tip.style.opacity = 0; };
  document.querySelectorAll('[data-tip]').forEach((el) => {
    el.addEventListener('pointermove', (e) => show(el, e.clientX, e.clientY));
    el.addEventListener('pointerleave', hide);
    el.addEventListener('focus', () => { const r = el.getBoundingClientRect(); show(el, r.left, r.bottom); });
    el.addEventListener('blur', hide);
  });
})();
</script>
</body>
</html>`;
}

/** Short markdown fit to paste into Slack/Teams/a PR */
export function renderMarkdown(meta: NightlyRunMeta, s: NightlySummary): string {
  const r = s.regression;
  const bugs = s.knownBugs;
  const failed = (heading: string, tests: TestFailure[]) => (tests.length
    ? ['', heading, ...tests.map((t) => `- **${t.title}** (\`${where(t)}\`) — ${t.code ?? ''} ${t.message ? firstLine(t.message) : ''}`)]
    : []);
  const lines = [
    `## ${VERDICT_ICON[s.verdict]} ${meta.appName} nightly QA — ${VERDICT_LABEL[s.verdict]}`,
    '',
    `${meta.appUrl} · ${meta.startedAt.slice(0, 10)}${meta.ciRunUrl ? ` · [CI run](${meta.ciRunUrl})` : ''}`,
    '',
    ...s.reasons.map((x) => `- ${x}`),
    '',
    `| Smoke | Passed | Failed | Flaky | Known bugs | Explore issues | Warnings |`,
    `|---|---|---|---|---|---|---|`,
    `| ${s.smoke.present ? passedOfTotal(s.smoke) : '—'} | ${r.present ? passedOfTotal(r) : '—'} | ${r.failed} | ${r.flaky} | ${bugs.failing.length} fail · ${bugs.fixed.length} fixed | ${s.issues} | ${s.warnings} |`,
    ...failed('### Failed smoke tests', s.smoke.failures),
    ...failed('### Failed tests', r.failures),
  ];
  if (bugs.fixed.length) {
    lines.push('', '### Known bugs fixed — remove the knownBug mark');
    for (const t of bugs.fixed) lines.push(`- **${t.title}** (\`${where(t)}\`)`);
  }
  const top = s.explore.flatMap((x) => x.findings.map((f) => ({ x, f }))).filter(({ f }) => f.kind === 'issue');
  if (top.length) {
    lines.push('', '### Explore issues');
    for (const { x, f } of top.slice(0, 15)) lines.push(`- [${SEVERITY[f.severity] ?? f.severity}] **${f.title}**${f.path ? ` (\`${f.path}\`)` : ''} — _${x.id}_`);
  }
  if (meta.monkeySeed !== undefined) lines.push('', `Seed ${meta.monkeySeed} — the same monkey forms again: \`${monkeyRerun(meta.monkeySeed)}\``);
  return lines.join('\n') + '\n';
}
