# Adding a module

How tests for a new module (Tickets, Discovery, …) get into this repo. The shared code does not change: once `tests/<module>/` exists, the suites, charters, `verify` and the nightly find it by themselves.

Two people are involved:

| Who | Has | Does |
|---|---|---|
| **Brief author** — the module's PM, business analyst or domain expert | The business logic. No access to this repo. | Writes the acceptance brief, following [writing-an-acceptance-brief.md](writing-an-acceptance-brief.md). |
| **QA engineer** — with this repo and Claude Code | The brief, the repo, the deployed app | Turns the brief into tests, following this page. |

## 1. What the brief author sends

Send them [writing-an-acceptance-brief.md](writing-an-acceptance-brief.md) and, as a full example, [iam/acceptance-brief.md](iam/acceptance-brief.md). Both are self-contained; neither needs the repo. Agree the module's short code first (`TICKETS`): it is the folder name in upper case and the middle of every ID.

They send back:

1. **`acceptance-brief.md`** — what the module must do, with an ID on every item.
2. **Where the module is in the app** — its pages, as named in the navigation.
3. **Data rules** — what tests may create and remove, and what must never be touched.
4. **What cannot be created on demand** — records that exist only through another system or over time.

## 2. Taking the brief in

Save it as `docs/<module>/acceptance-brief.md`.

`npm run verify` reads the IDs from it. A line defines an ID when it is a heading (`### SIT-TICKETS-03 — …`) or the first cell of a table row (`| BEH-TICKETS-07 | … |`), and the ID has the shape `<KIND>-<MODULE>-<n>[.<n>]` with `<MODULE>` being the folder name in upper case.

- Every `SIT`, `BEH` and `EX` ID then needs a test tagged with it, or an entry in `tests/<module>/coverage.ts` with the reason it cannot be automated. An ID with neither is `MISSING` and `verify` fails.
- `CFG` IDs end in a letter, so they are not tracked.
- If `verify` reports that the brief has no IDs, the headings or table rows do not match the shape above — fix the brief with its author, do not work around it in the tests.
- When the author changes the brief later, they say which IDs changed; rewrite those tests. A removed ID that a test still carries is reported by `verify` as an unknown tag.

Where the brief is unclear or contradicts the app, ask the author. A test asserts what the brief says; if the app does something else, that is a known-bug test ([testing.md → "Tags"](testing.md#tags--only-these-four-kinds)), not a reason to change the brief.

## 3. What gets created

```
docs/<module>/acceptance-brief.md   the brief, as received
tests/<module>/
  <module>.ts            session name, data prefix, agent context
  <module>.setup.e2e.ts  admin sign-in → sweep its own old data → create its test data → save the session
  pages/  fixtures.ts    page objects (built on tests/app/ui.ts), exposed as fixtures
  smoke.e2e.ts           required: each page opens and shows real data; changes nothing
  *.e2e.ts               the tests; the main jobs are also tagged `sanity`
  charters.ts            exploratory charters + the create forms for monkey
  coverage.ts            brief IDs that cannot be automated, each with the reason (`GAPS`)
```

Use `tests/iam/` as the worked example for every file. Login, the UI kit, naming and cleanup are shared and live in `tests/app/` and `lib/`.

- The author's **data rules** become the module's data prefix (`<module>-e2e`), its setup and cleanup, and the "never touch" sentences in its agent context.
- **Records that cannot be created on demand** become environment variables naming an existing record. A test that needs one is skipped when the variable is not set. New variables go into `.env.example` and the two CI files (`.github/workflows/nightly.yml`, `azure-pipelines.yml`) — the only change outside the module's folders.
- The admin in `APP_ADMIN_EMAIL` must be able to open the module.

## 4. Order of work

1. Save the brief and run `npm run verify -- <module>` — every ID should be listed (all `MISSING` at this point).
2. Open the module's pages in a headed browser and write the page objects.
3. `smoke.e2e.ts` first, and run it.
4. The setup, then the tests, one brief area per file. Run each file on the app as it is written.
5. `coverage.ts` for the IDs that cannot be automated — the reason must say what is missing (data, a permission, infrastructure), not "hard to test".
6. `charters.ts`: a few exploratory goals and the module's create forms.

## 5. Checking it

```bash
npm run verify -- <module>                  # tags, smoke, brief coverage, charters — without opening the app
npm run smoke -- <module> -- --headed
npm run sanity -- <module> -- --headed
npm run regression -- <module> -- --headed
npm run monkey -- <module> -- --headed
```

`verify` prints one row per brief ID: `covered`, `partial`, `not automated` or `MISSING`. The module is done when nothing is `MISSING` and regression is green apart from known bugs. The next `npm run nightly` includes it; nothing has to be registered.

Send the author the `verify` table and the list of known bugs: it shows them, per ID, what is tested, what is not and why.

## 6. Asking Claude Code to write the tests

```
Write the tests for the `<module>` module.
Brief: docs/<module>/acceptance-brief.md (written by the module's PM — do not change it).
Pages: <pages, and where they are in the navigation>.
Data: may create and delete <…> named `<module>-e2e-…`; never touch <…>.
Cannot be created on demand: <…>.
Follow docs/adding-a-module.md and use tests/iam as the example. Start with smoke.
```

More on the rules these tests follow: [testing.md](testing.md). Every command: [commands.md](commands.md).
