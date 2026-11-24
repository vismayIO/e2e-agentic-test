# nightly-qa — agent-driven QA for the Motadata console

This repo tests the deployed Motadata console from the outside — the app's code is not here, only its URL. The tests are **agent-driven**: the action under test is performed by an AI agent, and the outcome is checked by both code and the agent. It gives you three things:

| Part | What | How |
|---|---|---|
| **Suites** | Subsets of the written tests: smoke, sanity, regression, bugs, retest | `npm run <suite> -- [module]` |
| **Nightly pipeline** | Smoke gate → regression → exploration → HTML report, verdict, Slack/Teams | `npm run nightly` (CI, every night) |
| **Exploration** | No test file: give the agent a goal (a charter), it drives the app and reports defects | `npm run explore`, `npm run monkey`, `npx e2e explore` |

**The strategy is in [docs/testing.md](docs/testing.md)** — which kind of testing when and why, tags, the life of a bug, the nightly verdict, charters, adding a module, cost. This page is the way in: running the repo, its layout, the rules for writing tests, and the CI setup.

Engine: [e2e](https://e2e.com/docs) (`e2e` + `@e2e-dev/web`). The version is pinned exactly in `package.json` — before 1.0 the API can change in minor releases. The docs for the installed version are in `node_modules/e2e/docs/`.

## Quick start

```bash
npm ci
npx e2e-web install chromium
cp .env.example .env        # fill in the values below

npm test                    # typecheck + verify — does not open the app
npm run smoke               # is the build alive?
npm run sanity -- iam       # one module's main jobs
npm run nightly             # the whole pipeline → nightly-report/index.html
```

`.env` needs these (full list in `.env.example`; the scripts and e2e both read it through `lib/env.ts`):

| Variable | What |
|---|---|
| `APP_URL` | URL of the deployed console |
| `APP_ADMIN_EMAIL` | The console admin's Mailosaur address — the sign-in code arrives in this inbox |
| `MAILOSAUR_API_KEY`, `MAILOSAUR_SERVER_ID` | To read the code from that inbox |
| One model key | `AZURE_API_KEY` + `AZURE_RESOURCE_NAME` (+ `AZURE_OPENAI_DEPLOYMENT`), or `ANTHROPIC_API_KEY`, or `OPENAI_API_KEY`, or `AI_GATEWAY_API_KEY` |

All of these are required. Without the login (`APP_ADMIN_EMAIL` / Mailosaur) the admin setup fails and the run is red — nothing is skipped silently. `APP_NAME` (default "Motadata console") is the name used in the report; `APP_ADMIN_NAME` (default "Test User") is the admin's name as the app shows it.

## Commands

```bash
npm run smoke                                 # smoke for all modules
npm run sanity -- iam                         # sanity for one module
npm run regression                            # every test; known bugs count as expected failures (or: -- iam)
npm run bugs                                  # retest the known bugs
npm run retest                                # whatever did not pass in the previous run (.e2e)
npm run retest -- -- --output .e2e/nightly/regression     # the nightly's failures
npm run explore -- iam                        # the module's exploratory charters
npm run monkey                                # fuzzer on random create forms (MONKEY_SEED=<seed> repeats the same pick)
npx e2e explore --session admin --agent explorer --output .e2e/explore/adhoc '<goal>'   # ad-hoc

npm run suite -- sanity iam -- --headed       # any suite; e2e flags go after `--`
npx e2e run tests/iam/roles.e2e.ts            # one file (pick a screen by path, not by tag)
npx e2e run tests/iam/roles.e2e.ts:31         # one test
npm run verify                                # tags, smoke, brief coverage, charters, npm shortcuts (or: -- iam)
npm run cost                                  # model cost + replay cache of the last run
npm run nightly                               # the whole pipeline
npm run nightly -- --headed                   # the same, with the browser visible
```

Every command, with headed variants and runner flags: [docs/commands.md](docs/commands.md).

In the ad-hoc command, `--agent explorer` selects the exploration persona (without it the `default` agent runs, which is meant for a single test step), and its own `--output` folder protects `.e2e/report.json`, which `npm run retest` reads. When to run each type: [docs/testing.md → "Testing types"](docs/testing.md#testing-types).

## Repo layout

```
e2e.config.ts          target (APP_URL), model, agents (default + explorer / skeptic / fuzzer), limits, reporters
nightly.config.ts      what runs at night and how much: stages, exploration budget, verdict threshold
lib/
  suites.ts            the single definition of suites and tags: tags → e2e flags; `knownBug`
  modules.ts           modules = the folders under tests/
  charters.ts          personas; module charters → `e2e explore` arguments; monkey (seeded)
  names.ts             `freshNames(prefix)`: new names and Mailosaur addresses for every attempt
  env.ts  model.ts     the single `.env` loader; model selection
  run-e2e.ts           runs the e2e CLI
  e2e-report.ts  html.ts  notify.ts  types.ts     nightly report: parsing, HTML/markdown, Slack/Teams
  mailosaur.ts  csv.ts  pricing.ts                the sign-in code inbox, CSV, model list prices
scripts/
  suite.ts             one suite or exploration: `npm run suite -- <suite> [module…] [-- e2e flags]`
  nightly.ts           pipeline: smoke → regression → charters → monkey → report → notify
  verify.ts            checks the suite without the app: tags, smoke, brief coverage, charters, npm shortcuts
  cost-report.ts       model cost and replay cache of one run
tests/
  app/                 what is the same for every module (below)
  <module>/            one module of the console — currently: iam/
docs/
  testing.md           strategy
  commands.md          every command you can run
  adding-a-module.md   from a brief to a module's tests: who does what, and the steps
  writing-an-acceptance-brief.md   for the brief's author (PM / BA) — needs no repo access
  <module>/acceptance-brief.md    what is expected of the module; test tags are its IDs
.github/workflows/nightly.yml  ·  .github/workflows/test.yml  ·  azure-pipelines.yml     CI
```

`tests/app/` — every module builds on this; do not rewrite it:

| File | What |
|---|---|
| `auth.ts` | Admin login: email code from Mailosaur (`lib/mailosaur.ts`). The login is saved in `.auth/admin.json`, so a new code is only needed when the saved login has expired — no matter how many modules there are. |
| `admin.setup.e2e.ts` | The light `admin` session: login only, no test data. Smoke tests and exploration run on it. |
| `smoke.e2e.ts` | The console's own smoke: the sign-in page, and signed-in navigation. |
| `ui.ts` | UI kit: `openPage`, `pageLoaded`, `toast`, `Dialog`, a row's "⋯" menu, `ListPage` (search + rows), dates. Locators use the app's test ids. |
| `cleanup.ts` | `sweep()`: removes old data with the module's prefix one by one (nothing younger than 3 hours — it may belong to a run in progress). |

## Writing a test

There is one rule: **the agent does the work, the outcome is checked twice.**

```ts
const data = iamNames(); // at the file's module scope: new names for every attempt

test('a new custom role is listed as Custom', { tags: ['sanity', 'SIT-IAM-11', 'P1'] }, async ({ agent, roles }) => {
  const name = data.name('release-engineer');
  const description = 'Edits tickets owned by the person’s teams';
  await roles.open(); // Given: exact code

  // When: the agent, one atomic goal that says where to stop
  await agent.act('create a custom role named {name} with the description {description}; on the permissions step tick only the "Read Role" permission, then save the role', {
    params: { name: unique(name), description },
  });

  await roles.open();
  await roles.search(name);
  // Then, first in code: the real state (expect waits until the list has loaded)
  await expect(roles.row(name).getByTestId('type-chip')).toHaveText('Custom');
  await expect(roles.row(name).getByTestId('permission-count')).toHaveText('1 permission');
  // Then, by the agent: one look at the screen
  await agent.assert('the roles list shows {name} as a Custom role with the description {description} and 1 permission', { params: { name: unique(name), description } });
});
```

- **When — `agent.act`:** one atomic goal in the admin's own words, which says where to stop ("…and stop at the form that opens; do not save"). Two outcomes means two goals with a check in between. Every agent call has a ceiling set in `e2e.config.ts`; if a goal does not fit, split the goal — do not raise the ceiling.
- **Then — twice, in this order:** first a code `expect` (page-object locators) pins down the real state — it waits until the state arrives; then `agent.assert` states only what the screen can show at that moment (nothing about the past, no dates like "tomorrow"). The test passes only if both pass: code catches an agent that wrongly says "done", and the agent catches wording that code cannot judge.
- **Exact code only where it is not what the test is asking:** the precondition (*Given* — something whose failure must not distort the result), setup / cleanup, and actions on real people (for example the source-of-truth warning for a directory-managed person: open the dialog, never confirm).
- **Tags:** exactly one priority per test (`P0` / `P1` / `P2`, it may come from the `describe`); the brief ID (`SIT-IAM-11`); `smoke` or `sanity` for the small suites. No other tags — `npm run verify` catches a wrong one. A smoke test runs on the `admin` session and changes nothing. Full rules: [docs/testing.md → "Tags"](docs/testing.md#tags--only-these-four-kinds).
- **Known bug** (behaviour the brief asks for that the app does not have yet): write it with `knownBug('<date>: <what was seen>', 'BEH-IAM-20', 'P1')` — e2e's expected-failure mark (`fail`) plus the `bug` tag. While the bug is there the test counts as passed (the reason is in the report); once it is fixed the runner reports `UNEXPECTED_PASS` — then remove the mark. The runner refuses the mark inside a serial group.
- **Data:** only with your module's prefix, names from `freshNames` (at the test file's module scope — the file is imported again on a retry, so every attempt gets new names). Destructive actions only on data you created.
- **`retries: 0`** on tests that change the state of a fixed (setup-created) user in one direction — disable, delete, end sessions (also on the serial group). A retry would find the user already changed, and its error would hide the real cause. Tests that use their own fresh data can retry.
- A brief ID that cannot be automated goes into `tests/<module>/coverage.ts` (`GAPS`) with a concrete reason — what is missing (data, permission, infrastructure), not "it is hard".

## Modules

A new module is a `tests/<module>/` folder, with no change to the shared code: [docs/adding-a-module.md](docs/adding-a-module.md). The module's PM writes the acceptance brief from [docs/writing-an-acceptance-brief.md](docs/writing-an-acceptance-brief.md), which needs no access to this repo.

### IAM (`tests/iam/`)

Brief: [docs/iam/acceptance-brief.md](docs/iam/acceptance-brief.md). The setup removes the `iam-e2e-` data of runs that have already finished (if something cannot be removed, the setup fails), then creates a pool of 8 disposable users (each one's first sign-in uses a Mailosaur code) so that the disable / delete / sessions tests never touch real people. The holders and owners used in tests are always pool users.

Optional env — without them only those tests are skipped:

| Variable | For which test |
|---|---|
| `IAM_SCIM_USER_EMAIL` | A directory-managed (SCIM / LDAP) person in the tenant: the warning shown when moving the source of truth to Manual (the test reads the warning and cancels) |
| `IAM_TEAM` + `IAM_TEAM_MEMBER_EMAIL` | An existing team and one of its members: the team's profile shows on the member |

## Nightly report

`npm run nightly` → `nightly-report/index.html` (+ `summary.md`, `summary.json`, and `raw/` with every stage's e2e output and screenshots). The trend over the last 30 nights comes from `.nightly-history/history.json`. The verdict rules (RED / YELLOW / GREEN): [docs/testing.md → "Nightly pipeline"](docs/testing.md#nightly-pipeline-npm-run-nightly). On RED, `npm run nightly` exits 1 (not with `NIGHTLY_FAIL_ON=never`); the threshold is in `nightly.config.ts → verdict`.

## CI

- **GitHub Actions:** `.github/workflows/nightly.yml` (the nightly + any suite by hand) and `.github/workflows/test.yml` (`npm test` on every push / pull request). Add the variables and secrets in Settings — the list is at the top of `nightly.yml`.
- **Azure DevOps:** create a pipeline from `azure-pipelines.yml` and a `nightly-qa` variable group in Library (the steps are at the top of the file).

Both run the nightly pipeline every day at **20:17 UTC (1:47 AM IST)**; to change the time, edit the `cron` line (UTC). A manual run takes two inputs: `suite` and `module` (empty = all) — this is how smoke is run after a deploy. Every run starts with `npm test`.

- Nightly result: download **Artifacts → nightly-report** from the run and open `index.html` (keep the `raw/` folder next to it). On RED the job fails, so the GitHub/Azure failure email is sent too; for Slack/Teams add the webhook secret.
- Result of the other suites: the **e2e-\<suite\>** artifact — e2e's `report.json`, `junit.xml`, and each test's trace and screenshots under `results/`.

## Things to keep in mind

- **Shared tenant:** the console is a deployed, shared tenant. The agent fills in forms and presses buttons — do not point it at production. Runs on different machines may overlap (cleanup leaves data younger than 3 hours alone); do not start two runs at the same time in one checkout. CI runs its jobs one after another (`concurrency`).
- **Leave real people alone:** tests only create and remove data with their own prefix. The shared-tenant rules are in every agent's `context` (never the admin's own account / sessions, the Tenant Owner or the SSO settings), and at the end of every charter: whatever you create starts with `<module>-e2e-x-<run id>-`. The Tenant Owner guards are not automated (reason: `tests/iam/coverage.ts`).
- **Findings are claims:** an exploration finding is the agent's claim plus a screenshot. Prove it with a test before filing a bug ([docs/testing.md → "Life of a bug"](docs/testing.md#life-of-a-bug-exploratory--retest--regression)).
- **Tokens:** `.auth/` holds saved logins and `.env` holds keys — both are gitignored; never commit them.
- **Replay cache:** commit `.e2e/cache/` — in CI it is read-only.
- **Long runs on a laptop:** if the machine goes to sleep mid-run, saved logins expire and the remaining tests fail. Keep it awake, e.g. `systemd-inhibit --what=idle:sleep npm run nightly`.
- On GitHub, scheduled workflows in a **public** repo are disabled after 60 days without a commit.
