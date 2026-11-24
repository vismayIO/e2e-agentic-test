# Testing strategy — which kind of testing, when and how

This repo tests the deployed Motadata console with the [`e2e`](https://e2e.com/docs) runner. The tests are **agent-driven**: the action under test is performed by the agent (`agent.act`), and the outcome is checked twice (a code `expect`, then `agent.assert`). This page gives one answer for every testing type: *which tests, which command, when, and what happens on failure*. How to run the repo, its layout and the rules for writing tests are in the [README](../README.md).

Everything is built from four things, and each one is a documented e2e feature:

| Thing | In e2e | In this repo |
|---|---|---|
| **Suite** — a subset of the written tests | tags + `e2e run --tag / --last-failed` | `lib/suites.ts` (the single definition) |
| **Known bug** — a test that is expected to fail for now | the `fail` option (`test.fail`): expected failure | `knownBug()` in `lib/suites.ts` |
| **Module** — one part of the console | positional path `e2e run tests/<module>` | the `tests/<module>/` folder |
| **Charter** — a goal for the agent, with no test file | `e2e explore '<goal>' --agent <persona> --session <s>` | `tests/<module>/charters.ts` |

## Testing types

| Type | Question | What runs | Command | When |
|---|---|---|---|---|
| **Smoke** | Is the build alive? | The `smoke` tag: the most important pages of every module, on the light `admin` session, read-only (creates and changes nothing) | `npm run smoke` | Right after every deploy; the first gate of the nightly |
| **Sanity** | Do this module's main jobs work? | The `sanity` tag, one module | `npm run sanity -- iam` | After a fix or small release, on that module |
| **Regression** | Did anything else break? | Every test. Known bugs run too — when they fail they count as passed (expected failure) | `npm run regression` (or `-- iam`) | Before a release; every night (second stage of the nightly) |
| **Retesting** | Is the fix really in? | (a) whatever did not pass in the previous run · (b) only the known defects (`bug` tag) | `npm run retest` · `npm run bugs` | After a fix is deployed |
| **Exploratory** | What did nobody think of? | The module's written charters, each with a persona | `npm run explore -- iam` | On a new feature; a few every night (within the budget) |
| **Ad-hoc** | "Just have a look at this" | Any single goal, right now | `npx e2e explore --session admin --agent explorer --output .e2e/explore/adhoc '<goal>'` | Whenever you like — no file needed |
| **Monkey** | Does careless input break the app? | The `fuzzer` persona on randomly picked create forms of the modules, with a seed | `npm run monkey` (or `-- iam`) | A little every night; more before a release |

`npm run suite -- <suite> [module…] [-- e2e flags]` is the real entry point for all of these (`scripts/suite.ts`); the names above are shortcuts for it (`npm run verify` checks that every one has a shortcut in `package.json`). Any e2e flag can be passed along, for example to watch the browser: `npm run sanity -- iam -- --headed`.

- **The "previous run" for retest** is the last run in the same output folder (`--last-failed` reads that folder's `report.json`). `npm run retest` reads the default folder `.e2e`, where suites started by hand write. The nightly's regression runs in `.e2e/nightly/regression`, so for its failures use `npm run retest -- -- --output .e2e/nightly/regression`. If nothing failed, retest passes with no tests.
- **`npm run bugs`**: everything passing means every known bug is still there; `UNEXPECTED_PASS` means that bug has been fixed.

To pick one screen or one test, use a path, not a tag: `npx e2e run tests/iam/roles.e2e.ts`, `npx e2e run tests/iam/roles.e2e.ts:31`.

## Tags — only these four kinds

| Tag | Meaning | Rule |
|---|---|---|
| `smoke`, `sanity` | The test is also in this small suite | Regression is every test, so it has no tag. A smoke test runs on the `admin` session and changes nothing. Every module has at least one smoke test. |
| `bug` | Known defect: behaviour the brief asks for that the app does not have yet | Always through `knownBug(...)` (below), never by hand. Not on a smoke test. |
| `P0` / `P1` / `P2` | Priority | Exactly one per test (it may come from the `describe`). |
| `SIT-IAM-01`, `EX-IAM-07.2`, … | An ID from the brief | Must be defined in some module's brief (below). |

No other tags. The names live in `lib/suites.ts` (`SMOKE`, `SANITY`, `BUG`, `PRIORITIES`).

A **known bug** is written with `knownBug(reason, ...tags)` from `lib/suites.ts`. It is e2e's own expected-failure mark (the `fail` option, docs: reference/test → `test.fail`) plus the `bug` tag:

```ts
test('a custom role cannot move on without a description',
  knownBug('23 Nov 2026: "Next" is enabled with only a name — the description is optional', 'SIT-IAM-11', 'P2'),
  async ({ agent, screen, roles }) => { … });
```

- The bug is present → the test fails → the runner counts it as **passed** (the reason and the real failure stay in the report) and does not retry it. So known bugs never turn smoke / sanity / regression red.
- The bug is fixed → the test passes → the runner fails it with **`UNEXPECTED_PASS`**: remove `knownBug(...)` and write plain tags.
- Put the date and what was seen in `reason` — that text is what the report shows.
- The runner itself refuses the mark inside a serial group (collection error).

A **brief ID** has the shape `<KIND>-<MODULE>-<n>[.<n>]`, where `<MODULE>` is the module's folder name in upper case (`tests/iam` → `SIT-IAM-01`, `BEH-IAM-12`, `EX-IAM-07.2`). An ID is whatever appears in `docs/<module>/acceptance-brief.md` as a `### <id>` heading or as the first cell of a table row (`| <id> | … |`). A test may carry an ID from any module's brief (a Tickets test can cover IAM's `SIT-IAM-07`); a brief ID is covered once any test carries it.

`npm run verify` checks all of this without opening the app (a misspelled tag would silently drop a test from its suite): tags, a smoke test per module, brief coverage, charters, and the `package.json` shortcuts. `npm test` = typecheck + verify; CI runs it before every run and on every push / pull request.

## Life of a bug: exploratory → retest → regression

1. **Found** — an explore/monkey finding, or behaviour from the brief that the app does not have.
2. **Proven** — write a test for the finding: the steps as `agent.act`, the expected behaviour at the end as a code `expect` + `agent.assert`. The test is only a bug report if it fails *for that reason* (e2e docs: bug bash → "Verify"). Mark it `knownBug('<date>: <what was seen>', …)`.
3. **Tracked** — the nightly report's "Known bugs" section (and `npm run bugs`) says which bugs are still present, with the reason.
4. **Fixed** — the same test starts passing: the runner reports `UNEXPECTED_PASS`, and the nightly report lists it under "Fixed" in its Known bugs section.
5. **Regression** — replace `knownBug(...)` with plain tags. It is now an ordinary regression test.

## Nightly pipeline (`npm run nightly`)

```
smoke ──fail──▶ RED, the other stages do not run (a broken build must not burn model calls)
  │pass
regression (every test, one run)  → regression result  +  known bugs (still present / fixed)
  │
exploration: a few written charters  →  monkey (random create forms)
  │
report (HTML + summary) → verdict → Slack/Teams
```

- The nightly always runs on all modules. For one module or one suite use `npm run suite -- …`.
- **RED**: smoke fails, any setup fails, any regression test fails, a run errors (config / engine / model / a stage's time limit), or exploration reports a high/critical issue.
- **YELLOW**: flaky tests (passed on retry), small issues / warnings, blocked or incomplete exploration, a run stopped with Ctrl-C, or a known bug that got fixed (the mark still has to be removed — good news about the app, so not RED).
- A known bug that is still present does not change the verdict — it is already known.
- All tests run in a single run because every `e2e` run executes its setups again (and so rebuilds each module's test data).
- **Every stage has its own time limit** (`nightly.config.ts`: smoke, regression, each charter), so the night ends by itself and the report is always written. Keep the CI job timeout above the sum of those limits — when CI kills the job, no report is written.
- **The exploration budget is fixed**, so the night does not get longer as modules are added: each night runs `explore.charters` of the written charters across all modules (picked by seed, so different every night) plus `explore.monkey.count` monkey forms. The seed is today's date (`YYYYMMDD`) and is printed in the report.
- Flags after `--` go to every stage's e2e run: `npm run nightly -- --headed`.

What runs and how much is set in `nightly.config.ts`. Charters come from the modules; the config only holds the budget.

## Exploratory, ad-hoc, monkey

`e2e explore` gives the agent a goal, not a test file: it plans the steps, drives the app and reports every defect with evidence (an `issue` fails the run, a `warning` does not).

- A **charter** = one area + one posture + one sentence, with a start route. The postures and their personas (`lib/charters.ts` → `PERSONAS`; each one's stance is in `e2e.config.ts` → `agents`):

  | Persona | Posture | Shape of the charter |
  |---|---|---|
  | `explorer` | A new user; state (after reload/back); error paths | `Starting at /users, invite a person and follow the invitation list like a first-time admin; report anything confusing, broken or inconsistent` |
  | `skeptic` | Numbers and copy | `Starting at /users, compare every count, status and date on the page with the same fact elsewhere; report any that disagree` |
  | `fuzzer` | Edge input | `Starting at /roles, open Create role and try as the role name: left empty, 300 characters, unicode, leading spaces; report validation that is missing or wrong` |

- **Monkey** = the same `fuzzer`, but with a random target: a few **create forms** (`{ route, form }`) are picked from the modules' `monkey` lists, and the agent works only inside that form. Not the whole screen — the forms of existing records hold real people's data. The seed is in the report: `MONKEY_SEED=<seed> npm run monkey` picks the same forms again.
- **Ad-hoc** needs no code: `npx e2e explore --session admin --agent explorer --output .e2e/explore/adhoc 'Starting at /roles, …'`. Without `--agent` the `default` agent runs, whose stance is written for a single test step, not for exploration; without `--output` the report is written to `.e2e/report.json`, and the next `npm run retest` takes it for the "previous run". Say in the goal that nothing should be changed, or that anything created must have a name starting with `<module>-e2e-x-` (only then does the module's cleanup remove it).
- The shared-tenant rules are in every agent's `context` (never the admin's own account/sessions, the Tenant Owner or the SSO settings; no mail to real people) and at the end of every charter (`lib/charters.ts`): whatever you save gets a name starting with `<module>-e2e-x-<run id>-`; a record you did not create may only be opened to read it.
- Findings are the agent's claims. Before filing a bug, do the "Proven" step above.

## Adding a module

Create `tests/<module>/` — that is all. Suites, charters, verify and the nightly find it by themselves; nothing in the shared code changes. Step by step: [adding-a-module.md](adding-a-module.md). The guide for whoever writes the acceptance brief: [writing-an-acceptance-brief.md](writing-an-acceptance-brief.md).

```
tests/<module>/
  <module>.ts            session name, data prefix, agent context
  <module>.setup.e2e.ts  adminSignIn → sweep its own old data → create its test data → session.save
  smoke.e2e.ts           `smoke` tests on the `admin` session (at least one — required)
  charters.ts            exploratory charters + the create forms for monkey
  pages/  fixtures.ts    page objects (built on tests/app/ui.ts)
  coverage.ts            brief IDs that cannot be automated, with the reason (`GAPS`)
  *.e2e.ts               tests — some tagged `sanity`
docs/<module>/acceptance-brief.md   IDs `<KIND>-<MODULE>-<n>` (see "brief ID" above)
```

- **Data:** its own prefix (`<module>-e2e`) and its own session name. Names come from `freshNames(prefix)` — new for every attempt, and the name carries its creation time.
- **Cleanup:** the setup uses `sweep()` to remove old data with its prefix, but leaves anything younger than 3 hours alone — it may belong to a run in progress (the nightly, a run on another machine, an explorer). If something cannot be removed, the setup fails. Do not start two runs at the same time in one checkout: the test data a setup creates (such as IAM's `.e2e/iam-pool.json`) belongs to that checkout.
- **Login:** `adminSignIn` (`tests/app/auth.ts`). Login is required: without `APP_ADMIN_EMAIL` and the Mailosaur settings the admin setup fails and the run is red — nothing is skipped silently.
- **Shared code:** login, the UI kit, naming, cleanup and the console's own smoke tests are in `tests/app/`. If you need another module's page, import it from there (`tests/iam/pages/users.ts`).
- Finish with `npm run verify -- <module>`.

## Cost and the replay cache

- A passing `agent.act` step is recorded in `.e2e/cache/` and replayed next time without a model call; if the screen has changed, the agent takes over from that point (self-healing). `agent.assert` and exploration call the model every time.
- The e2e docs recommend committing the cache; in CI it is read-only.
- `npm run cost` shows what one run cost (`.e2e/report.json`, or `npm run cost -- <report.json>`): tokens, replays and USD for every agent step. The rates are in `lib/pricing.ts`, with their date — before using a new model, add its rate there.
- Smoke and sanity are small for this reason — running them often has to stay cheap. Exploration's cost is bounded by the budget in `nightly.config.ts`: (`charters` × `maxSteps`) + (`monkey.count` × `monkey.maxSteps`) steps per night.

## CI

- **Every push / pull request:** `npm test` (typecheck + verify) — the app is not opened, no model calls.
- **Nightly** (schedule): `npm test`, then `npm run nightly`.
- **By hand** (workflow dispatch): `suite` (nightly / smoke / sanity / regression / bugs / explore / monkey) + `module`. This is how smoke is run after a deploy.
- `retest` is not among the CI choices: it needs the previous run's `report.json` on the same machine, and a CI runner is new every time. In CI, re-run the failed job.

Setup (variables, secrets, where the report ends up): [README → CI](../README.md#ci).
