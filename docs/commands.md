# Command reference

Every command you can type in this repo. Run them from the repo root. What each kind of testing is for and when to use it: [testing.md](testing.md).

**Showing the browser:** add `--headed`. With an npm shortcut the flag goes after a second `--` — the first `--` ends npm's own arguments, the second starts the flags for the runner:

```bash
npm run sanity -- iam -- --headed     # with a module
npm run smoke -- -- --headed          # without a module
```

## 1. Without opening the app (instant, free)

```bash
npm test                      # typecheck + verify
npm run verify                # check tags, smoke, brief coverage, charters, npm shortcuts
npm run verify -- iam         # one module only
npm run typecheck             # TypeScript only
npm run suite                 # list every suite and module (help)
npx e2e list                  # list every test
```

## 2. Suites (the written tests)

```bash
npm run smoke                     # smoke for all modules (~2 min)
npm run smoke -- iam              # IAM smoke only
npm run sanity -- iam             # IAM's main jobs (~9 min)
npm run regression                # every test (~17 min)
npm run regression -- iam         # IAM only
npm run bugs                      # only the known bugs
npm run retest                    # whatever did not pass in the previous run
npm run retest -- -- --output .e2e/nightly/regression    # the nightly's failures
```

With the browser visible:

```bash
npm run smoke -- -- --headed
npm run sanity -- iam -- --headed
npm run regression -- iam -- --headed
npm run bugs -- -- --headed
```

The general form behind all of these:

```bash
npm run suite -- <suite> [module…] [-- <runner flags>]
```

## 3. One file or one test

```bash
npx e2e run tests/iam/roles.e2e.ts --headed            # one file
npx e2e run tests/iam/roles.e2e.ts:31 --headed         # one test (by line number)
npx e2e run tests/iam --grep "custom role" --headed    # by title
npx e2e run tests/app/smoke.e2e.ts --headed            # the console's own smoke
```

IAM test files (all `tests/iam/<name>.e2e.ts`): `access-profiles`, `import`, `invite`, `roles`, `service-accounts`, `sessions`, `sign-in`, `smoke`, `users-lifecycle`. Every file except `smoke` first runs the IAM setup (about 5–7 minutes: it signs in 8 test users).

## 4. Exploration (no test file)

```bash
npm run monkey -- iam -- --headed       # fuzzer on 2 random create forms (~13 min)
MONKEY_SEED=20261123 npm run monkey -- iam -- --headed   # the same forms again
npm run explore -- iam -- --headed      # all 8 IAM charters (~1 hour)
```

Ad-hoc — any goal of your own, in one sentence. The persona can be `explorer`, `skeptic` or `fuzzer`:

```bash
npx e2e explore --session admin --agent explorer --headed --output .e2e/explore/adhoc \
  'Starting at /roles, look around like a first-time admin without saving anything; report anything confusing or broken'

npx e2e explore --session admin --agent skeptic --headed --output .e2e/explore/adhoc \
  'Starting at /users, compare every count, status and date on the page with the same fact elsewhere; change nothing; report any that disagree'

npx e2e explore --session admin --agent fuzzer --headed --max-steps 4 --output .e2e/explore/adhoc \
  'Starting at /roles, open Create role and try as the role name: left empty, 300 characters, unicode, leading spaces; do not save; report validation that is missing or wrong'
```

In an ad-hoc goal, either say that nothing should be changed, or that anything created must have a name starting with `<module>-e2e-x-` (only then does the module's cleanup remove it).

## 5. Nightly pipeline (everything, ~1 hour)

```bash
npm run nightly                                          # smoke → regression → exploration → report
npm run nightly -- --headed                              # with the browser visible
systemd-inhibit --what=idle:sleep npm run nightly        # keep the laptop awake while it runs
NIGHTLY_FAIL_ON=never npm run nightly                    # exit 0 even on a RED verdict
```

## 6. Looking at results

```bash
xdg-open .e2e/report.html                 # report of the last suite run
xdg-open nightly-report/index.html        # nightly report
cat .e2e/summary.md                       # short text summary
npm run cost                              # model cost of the last run
npm run cost -- .e2e/nightly/regression/report.json      # cost of the nightly's regression
```

## 7. Useful runner flags

These work with `npx e2e run …` and, after `--`, with any suite:

| Flag | Effect |
|---|---|
| `--headed` | Show the browser |
| `--video` | Record a video of every attempt |
| `--step` | Run step by step, pausing before each one (debugging) |
| `--debug` | Print phase timings and the agent step table |
| `--retries 0` | No retries |
| `--max-failures 1` | Stop at the first failure |
| `--tag P0` | Only tests with this tag |
| `--grep "<text>"` | Only tests whose title matches |
| `--workers 1` | One test at a time |

Example: `npm run sanity -- iam -- --headed --max-failures 1`

For `npx e2e explore …`: `--agent <persona>`, `--session <name>`, `--max-steps <1–100>` (default 8), `--timeout <ms>`, `--headed`, `--output <dir>`.

## Keep in mind

- In a headed run, do not close the browser windows — the remaining tests fail with "browser launch failed".
- Start only one run at a time in one checkout.
- If the laptop goes to sleep mid-run, saved logins expire and the remaining tests fail; use `systemd-inhibit` for long runs.
- The times above were measured on 23–24 Nov 2026 against the test tenant; they depend on how fast the app answers.
