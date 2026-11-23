# nightly-qa — Motadata console ka agent-driven QA

Yeh repo deployed Motadata console ko bahar se test karta hai — app ka code yahan nahi hai, sirf uska URL. Tests **agent-driven** hain: jo kaam jaancha ja raha hai woh AI agent karta hai, aur nateeja code aur agent dono jaanchte hain. Teen cheezein milti hain:

| Hissa | Kya | Kahan se |
|---|---|---|
| **Suites** | Likhe hue tests ke hisse: smoke, sanity, regression, bugs, retest | `npm run <suite> -- [module]` |
| **Nightly pipeline** | Smoke gate → poora run → exploration → HTML report, verdict, Slack/Teams | `npm run nightly` (CI har raat) |
| **Exploration** | Bina test likhe: agent ko ek goal (charter) do, woh app chalata hai aur defects report karta hai | `npm run explore`, `npm run monkey`, `npx e2e explore` |

**Strategy [docs/testing.md](docs/testing.md) me hai** — kaun sa testing kab aur kyun, tags, bug ka safar, nightly ka verdict, charters, naya module, kharcha. Yeh page repo ka darwaza hai: chalana, layout, test likhne ke niyam, CI ka setup.

Engine: [e2e](https://e2e.com/docs) (`e2e` + `@e2e-dev/web`). Version `package.json` me exact pinned hai — 1.0 se pehle minor releases me API badal sakti hai. Is version ke docs `node_modules/e2e/docs/` me hain.

## Quick start

```bash
npm ci
npx e2e-web install chromium
cp .env.example .env        # neeche ki values bharo

npm test                    # typecheck + verify — app nahi kholta
npm run smoke               # build zinda hai?
npm run sanity -- iam       # ek module ke mukhya kaam
npm run nightly             # poori pipeline → nightly-report/index.html
```

`.env` me chahiye (poori list `.env.example` me; scripts aur e2e dono ise `lib/env.ts` se padhte hain):

| Variable | Kya |
|---|---|
| `APP_URL` | Deployed console ka URL |
| `APP_ADMIN_EMAIL` | Console admin ka Mailosaur address — sign-in code isi inbox me aata hai |
| `MAILOSAUR_API_KEY`, `MAILOSAUR_SERVER_ID` | Us inbox se code padhne ke liye |
| Ek model key | `AZURE_API_KEY` + `AZURE_RESOURCE_NAME` (+ `AZURE_OPENAI_DEPLOYMENT`), ya `ANTHROPIC_API_KEY`, ya `OPENAI_API_KEY`, ya `AI_GATEWAY_API_KEY` |

Yeh sab zaroori hain. Login ke bina (`APP_ADMIN_EMAIL` / Mailosaur) admin setup fail hota hai aur run red — kuch chupchaap skip nahi hota. `APP_NAME` (default "Motadata console") report ka naam hai; `APP_ADMIN_NAME` (default "Test User") admin ka naam, jaisa app dikhata hai.

## Commands

```bash
npm run smoke                                 # sab modules ka smoke
npm run sanity -- iam                         # ek module ka sanity
npm run regression                            # sab tests, known bugs chhod ke (ya: -- iam)
npm run bugs                                  # known bugs ka retest
npm run retest                                # pichhle run (.e2e) me jo pass nahi hue
npm run retest -- -- --output .e2e/nightly/regression     # nightly ke failures
npm run explore -- iam                        # module ke exploratory charters
npm run monkey                                # random create forms pe fuzzer (MONKEY_SEED=<seed> se wahi dobara)
npx e2e explore --session admin --agent explorer --output .e2e/explore/adhoc '<goal>'   # ad-hoc

npm run suite -- sanity iam -- --headed       # koi bhi suite; e2e flags `--` ke baad
npx e2e run tests/iam/roles.e2e.ts            # ek file (screen chunne ke liye tag nahi, path)
npx e2e run tests/iam/roles.e2e.ts:31         # ek test
npm run verify                                # tags, smoke, brief coverage, charters, npm shortcuts (ya: -- iam)
npm run cost                                  # last run ka model kharcha + replay cache
npm run nightly                               # poori pipeline
```

Ad-hoc command me `--agent explorer` exploration ka persona deta hai (bina iske test-step wala `default` agent chalta hai), aur apna `--output` folder `.e2e/report.json` ko bachata hai, jise `npm run retest` padhta hai. Har type kab chalana hai: [docs/testing.md → "Testing types"](docs/testing.md#testing-types).

## Repo layout

```
e2e.config.ts          target (APP_URL), model, agents (default + explorer / skeptic / fuzzer), limits, reporters
nightly.config.ts      raat ko kya chale aur kitna: stages, exploration budget, verdict threshold
lib/
  suites.ts            suites aur tags ki ek hi definition: tags → e2e flags; `knownBug`
  modules.ts           modules = tests/ ke folders
  charters.ts          personas; modules ke charters → `e2e explore` arguments; monkey (seed se)
  env.ts  model.ts     `.env` ka ek hi loader; model ka chunaav
  run-e2e.ts           e2e CLI chalana
  e2e-report.ts  html.ts  notify.ts  types.ts     nightly report: parsing, HTML/markdown, Slack/Teams
  mailosaur.ts  csv.ts  pricing.ts                sign-in code ka inbox, CSV, model ke list prices
scripts/
  suite.ts             ek suite ya exploration: `npm run suite -- <suite> [module…] [-- e2e flags]`
  nightly.ts           pipeline: smoke → regression → charters → monkey → report → notify
  verify.ts            suite ki safai, app ke bina: tags, smoke, brief coverage, charters, npm shortcuts
  cost-report.ts       ek run ka model kharcha aur replay cache
tests/
  app/                 jo sab modules me same hai (neeche)
  <module>/            console ka ek module — abhi: iam/
docs/
  testing.md           strategy
  <module>/acceptance-brief.md    module se kya umeed hai; tests ke tags isi ke IDs hain
.github/workflows/nightly.yml  ·  .github/workflows/test.yml  ·  azure-pipelines.yml     CI
```

`tests/app/` — har module isi pe banta hai, dobara mat likho:

| File | Kya |
|---|---|
| `auth.ts` | Admin login: email code Mailosaur se (`lib/mailosaur.ts`). Login `.auth/admin.json` me save hota hai, isliye naya code sirf tab jab saved login expire ho — modules kitne bhi hon. |
| `admin.setup.e2e.ts` | Halka `admin` session: sirf login, koi test data nahi. Smoke tests aur exploration isi pe. |
| `smoke.e2e.ts` | Console ka apna smoke: sign-in page, aur signed-in navigation. |
| `ui.ts` | UI kit: `openPage`, `pageLoaded`, `toast`, `Dialog`, row ka "⋯" menu, `ListPage` (search + rows), dates. Locators app ke test ids se. |
| `data.ts` | `freshNames(prefix)`: har attempt ke naye naam aur Mailosaur addresses. |
| `cleanup.ts` | `sweep()`: module ke prefix wala purana data ek-ek karke hatao (3 ghante se naya nahi — woh kisi chal rahe run ka ho sakta hai). |

## Test likhna

Niyam ek hi hai: **kaam agent kare, nateeja do baar jaancho.**

```ts
const data = iamNames(); // file ke module scope me: har attempt ke naye naam

test('a new custom role is listed as Custom', { tags: ['sanity', 'SIT-IAM-11', 'P1'] }, async ({ agent, roles }) => {
  const name = data.name('release-engineer');
  const description = 'Edits tickets owned by the person’s teams';
  await roles.open(); // Given: exact code

  // When: agent, ek atomic goal jo batata hai kahan rukna hai
  await agent.act('create a custom role named {name} with the description {description}; on the permissions step tick only the "Read Role" permission, then save the role', {
    params: { name: unique(name), description },
  });

  await roles.open();
  await roles.search(name);
  // Then, pehle code se: asli state (expect rukta hai jab tak list aa na jaaye)
  await expect(roles.row(name).getByTestId('type-chip')).toHaveText('Custom');
  await expect(roles.row(name).getByTestId('permission-count')).toHaveText('1 permission');
  // Then, phir agent se: screen ko ek baar dekh ke
  await agent.assert('the roles list shows {name} as a Custom role with the description {description} and 1 permission', { params: { name: unique(name), description } });
});
```

- **When — `agent.act`:** admin ki zubaan me ek atomic goal, jisme likha ho kahan rukna hai ("…and stop at the form that opens; do not save"). Do nateeje hon to do goals, beech me check. Har agent call ki chhat `e2e.config.ts` me hai; goal usme poora na ho to goal todo, chhat mat badhao.
- **Then — do baar, isi kram me:** pehle code `expect` (page object ke locators) asli state pakki kare — woh rukta hai jab tak state aa na jaaye; phir `agent.assert` sirf woh kahe jo us pal ki screen dikha sakti hai (beeti hui baat ya "kal" jaisi tareekh nahi). Dono pass hon tabhi test pass: agent ki galat "ho gaya" code pakadta hai, aur jo wording code nahi samajhta woh agent.
- **Exact code sirf wahan jahan test ka sawaal nahi:** precondition (*Given* — jiska fail hona nateeja na bigaade), setup / cleanup, aur asli logon pe kaam (jaise directory-managed person ki source-of-truth warning: dialog kholo, kabhi confirm nahi).
- **Tags:** har test pe theek ek priority (`P0` / `P1` / `P2`, describe se bhi aa sakti hai); brief ka ID (`SIT-IAM-11`); chhote suite ke liye `smoke` ya `sanity`. Koi aur tag nahi — `npm run verify` galat tag pakadta hai. Smoke test `admin` session pe chale aur kuch na badle. Poore niyam: [docs/testing.md → "Tags"](docs/testing.md#tags--bas-yeh-chaar-tarah-ke).
- **Known bug** (brief ka behaviour jo app abhi nahi karta): `knownBug('<tareekh>: <kya dikha>', 'BEH-IAM-20', 'P1')` se likho — e2e ka expected-failure mark (`fail`) + `bug` tag. Bug rahe to test pass gina jaata hai (wajah report me), fix ho to `UNEXPECTED_PASS` — tab mark hatao. Serial group ke andar runner mana karta hai.
- **Data:** sirf apne module ke prefix se, naam `freshNames` se (test file ke module scope me — retry pe file dobara import hoti hai, to har attempt ko naye naam milte hain). Destructive kaam sirf apne banaye data pe.
- **`retries: 0`** un tests pe jo kisi fixed (setup ke) user ka state ek taraf badalte hain — disable, delete, sessions khatam (serial group pe bhi). Retry ko badla hua user milta, aur uska error asli wajah chhupa deta. Apne naye data wale tests retry kar sakte hain.
- Brief ka jo ID automate nahi ho sakta, use `tests/<module>/coverage.ts` (`GAPS`) me thos wajah ke saath likho — kya kam hai (data, permission, infrastructure), "mushkil hai" nahi.

## Modules

Naya module = `tests/<module>/` folder, shared code me koi badlav nahi: [docs/testing.md → "Naya module jodna"](docs/testing.md#naya-module-jodna).

### IAM (`tests/iam/`)

Brief: [docs/iam/acceptance-brief.md](docs/iam/acceptance-brief.md). Setup pehle khatam ho chuke runs ka `iam-e2e-` data hatata hai (kuch na hate to setup fail hota hai), phir 8 disposable users ka pool banata hai (har ek ka pehla sign-in Mailosaur ke code se) taaki disable / delete / sessions wale tests asli logon ko na chhuein. Tests ke holders aur owners sirf pool users hain.

Optional env — na hon to sirf woh tests skip:

| Variable | Kis test ke liye |
|---|---|
| `IAM_SCIM_USER_EMAIL` | Tenant ka ek directory-managed (SCIM / LDAP) person: source of truth ko Manual pe le jaane ki warning (test warning dekh ke Cancel karta hai) |
| `IAM_TEAM` + `IAM_TEAM_MEMBER_EMAIL` | Maujooda team aur uska ek sadasya: team ka profile sadasya pe dikhe |

## Nightly report

`npm run nightly` → `nightly-report/index.html` (+ `summary.md`, `summary.json`, `raw/` me har stage ka e2e output aur screenshots). Pichhli 30 raaton ka trend `.nightly-history/history.json` se aata hai. Verdict (RED / YELLOW / GREEN) ke niyam: [docs/testing.md → "Nightly pipeline"](docs/testing.md#nightly-pipeline-npm-run-nightly). RED pe `npm run nightly` exit 1 deta hai (`NIGHTLY_FAIL_ON=never` se nahi); threshold `nightly.config.ts → verdict` me.

## CI

- **GitHub Actions:** `.github/workflows/nightly.yml` (nightly + haath se koi bhi suite) aur `.github/workflows/test.yml` (har push / pull request pe `npm test`). Settings me variables aur secrets daalo — list `nightly.yml` ke upar hai.
- **Azure DevOps:** `azure-pipelines.yml` se pipeline banao, Library me `nightly-qa` variable group (file ke upar steps hain).

Dono roz **20:17 UTC (1:47 AM IST)** pe nightly pipeline chalate hain; time badalna ho to `cron` line (UTC). Haath se chalane pe do inputs: `suite` aur `module` (khaali = sab) — deploy ke baad smoke isi se. Har run pehle `npm test` chalata hai.

- Nightly ka nateeja: run ke **Artifacts → nightly-report** download karo, `index.html` kholo (`raw/` folder saath rehna chahiye). RED pe job fail hota hai, to GitHub/Azure ki failure email bhi aati hai; Slack/Teams ke liye webhook secret daalo.
- Baaki suites ka nateeja: artifact **e2e-\<suite\>** — e2e ka `report.json`, `junit.xml`, aur `results/` me har test ka trace aur screenshots.

## Dhyan rakhne wali baatein

- **Shared tenant:** console ek deployed, saajha tenant hai. Agent forms bharta hai aur buttons dabata hai — production pe mat chalao. Alag machines ke runs ek saath chal sakte hain (cleanup 3 ghante se naya data nahi chhedta); ek hi checkout me do runs ek saath mat chalao. CI apne runs ek ke baad ek chalata hai (`concurrency`).
- **Asli logon ko mat chhedo:** tests sirf apne prefix wala data banate / hatate hain. Shared tenant ke niyam har agent ke `context` me hain (admin ka apna account / sessions, Tenant Owner aur SSO settings kabhi nahi), aur har charter ke aakhir me: jo banao woh `<module>-e2e-x-<run id>-` se shuru. Tenant Owner ke guards automate nahi hain (wajah: `tests/iam/coverage.ts`).
- **Findings claims hain:** exploration ki finding agent ka daava + screenshot hai. Bug file karne se pehle use test se saabit karo ([docs/testing.md → "Bug ka safar"](docs/testing.md#bug-ka-safar-exploratory--retest--regression)).
- **Tokens:** `.auth/` me saved logins hain aur `.env` me keys — dono gitignore me, kabhi commit mat karo.
- **Replay cache:** `.e2e/cache/` commit karo — CI me woh read-only hai.
- GitHub pe **public** repo me 60 din tak koi commit na ho to scheduled workflows band ho jaate hain.
