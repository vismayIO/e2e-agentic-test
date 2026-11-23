# nightly-qa — AI se deployed app ki nightly testing

Yeh ek alag repo hai. Aapka frontend kahin bhi deployed ho, yeh har raat us URL pe do kaam karta hai aur ek HTML report deta hai:

| Hissa | Kya karta hai | Command |
|---|---|---|
| **Regression** | `tests/` ke flows chalata hai (AI steps + exact checks) | `e2e run` |
| **Explore** | AI agent ko ek goal deta hai; woh khud app chalata hai aur bugs report karta hai, bina test likhe | `e2e explore` |
| **Report** | Dono ko milake verdict (Healthy / Needs attention / Broken), screenshots, 30 raaton ka trend | `nightly-report/index.html` |

Engine: [e2e](https://github.com/e2e-inc/e2e) (version `package.json` me exact pinned hai — 1.0 se pehle minor releases me API badal sakti hai).

## Structure

```
e2e.config.ts            APP_URL, model, login, basic auth, reporters
nightly.config.ts        ← raat ko kya chalega: explore goals, verdict rules
tests/
  auth.setup.e2e.ts      QA user login → session "qa" (credentials set hon tab)
  smoke.e2e.ts           generic checks, kisi bhi app pe chalte hain
  flows/                 ← apne critical flows yahan (example template hai)
  app/                   Motadata console ka shared hissa — har module isi pe
  <module>/              ek module ke tests (abhi: iam/) — neeche "Modules"
docs/<module>/           us module ka acceptance brief
scripts/nightly.ts       orchestrator: run → explore → report → notify
scripts/cost-report.ts   last run ka model kharcha + replay cache
scripts/verify-coverage.ts  brief ka har ID: test hai ya wajah
lib/                     report parsing, HTML, Slack/Teams, Mailosaur, CSV, pricing
.github/workflows/nightly.yml   GitHub Actions schedule
azure-pipelines.yml             Azure DevOps schedule
```

## Local pe chalao

```bash
npm ci
npx e2e-web install chromium
cp .env.example .env        # APP_URL + ek model key bharo
npm run nightly             # poora run
open nightly-report/index.html
```

Sirf ek hissa: `npm run nightly -- --only regression` ya `--only explore`.
Report dobara banana (bina tests chalaye): `npm run report`.

## CI me lagao

- **GitHub Actions:** `.github/workflows/nightly.yml` — Settings me `APP_URL` variable aur model key secret daalo. Actions tab se "Run workflow" se turant bhi chala sakte ho.
- **Azure DevOps:** `azure-pipelines.yml` se pipeline banao, Library me `nightly-qa` variable group banao (file ke upar steps likhe hain).

Dono roz **20:17 UTC (1:47 AM IST)** pe chalte hain. Time badalna ho to `cron` line badlo (UTC me hota hai).

Report kahan milegi: run ke **Artifacts → nightly-report** download karo, `index.html` kholo (`raw/` folder saath rehna chahiye — screenshots wahan hain).
RED hone pe pipeline fail hoti hai, to GitHub/Azure ki default failure email bhi aati hai. Slack/Teams ke liye webhook secret daalo.

## Apne tests likhna

`tests/flows/example-search.e2e.ts` dekho. Pattern:

```ts
import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

test('user can add to cart', { tags: ['critical'] }, async ({ app, agent, screen }) => {
  await app.open('/products');
  await agent.act('add the first product to the cart');        // AI step
  await expect(screen.getByRole('status')).toContainText('1'); // exact check, model call nahi
  await agent.assert('the cart shows one item');               // AI check
});
```

- Login chahiye to `describe('...', { session: 'qa' }, ...)`.
- Locally pass hua `agent.act` step `.e2e/cache/` me record hota hai. **Is folder ko commit karo** — CI me woh bina model call ke replay hota hai (tez + sasta). App badal gaya aur replay fit nahi hua to agent khud sambhal leta hai.

## Modules (`tests/<module>/`)

Console ke har module (IAM, aage aur) ka ek folder. Jo sab modules me same hai woh `tests/app/` me ek baar:

| `tests/app/` | Kya |
|---|---|
| `auth.ts` | Admin login: email code Mailosaur se (`lib/mailosaur.ts`), saved login `.auth/admin.json` — har account ka OTP ek hi baar, modules kitne bhi hon. App ka sessionStorage login session me rakhna. |
| `ui.ts` | UI kit: `openPage`, `toast`, `Dialog`, row "⋯" menu, `ListPage` (search + rows), date picker. Locators app ke test ids se. |
| `data.ts` | `freshNames(prefix)`: har attempt ke naye naam/Mailosaur addresses (retry purane data se nahi takrata). |
| `cleanup.ts` | `sweep()`: module ke prefix wala purana data ek-ek karke hatao. |

Ek module folder ka shape (IAM jaisa):

```
tests/<module>/
  <module>.ts            module constants: session naam, data prefix, agent context
  <module>.setup.e2e.ts  adminSignIn → apna purana data sweep → apna test data → session.save
  pages/                 har screen ka page object (tests/app/ui.ts pe)
  fixtures.ts            test.extend: page objects fixtures ke roop me
  coverage.ts            brief ke jo IDs automate nahi ho sakte, wajah ke saath
  *.e2e.ts               tests: tags me brief IDs + P0/P1/P2
docs/<module>/acceptance-brief.md
```

**Naya module:** upar ka shape banao — apna prefix (`<module>-e2e`), apna session naam, aur setup me sirf apna data (pehle `sweep` se apna purana data, phir naya). Login, UI kit, naming, cleanup dobara mat likho; kisi doosre module ka page chahiye to wahi import karo (`tests/iam/pages/users.ts`). Phir `npm run coverage -- <module>`.

**Likhne ke niyam (har module):**
- **Agent-driven, do taraf se jaancha hua:** har test me jo kaam jaancha ja raha hai (*When*) woh agent karta hai — admin ki zubaan me ek chhota goal (`agent.act`, kahan rukna hai woh bhi likha). Nateeja (*Then*) do baar: `agent.assert` brief ki har baat naam se jaanchta hai, aur code (`expect` + page object locators) screen ki asli state pakki karta hai. Dono pass hon tabhi test pass — agent ki galat "ho gaya" baat code pakad leta hai, aur jo wording code nahi samajhta use agent.
- **Exact code sirf wahan jahan test ka sawaal nahi:** precondition (*Given* — jaise ek bana hua profile, jiska fail hona test ka nateeja na bigaade), setup / cleanup, aur asli logon pe khatarnaak kaam (Tenant Owner). Har agent call ki chhat `e2e.config.ts` me (`maxSteps` 25, `maxModelCalls` 25); goal us chhat me poora na ho to use todo.
- Pehla run zyada model calls leta hai; uske baad goals replay cache (`.e2e/cache/`) se bina model ke chalte hain, jab tak screen na badle (`npm run cost` dikhata hai kitne replay hue).
- Data sirf apne prefix se, naam `freshNames` se (test file ke module scope me). Destructive kaam sirf apne banaye data pe.
- Tag `bug` = brief ka behaviour jo app abhi nahi karta (jaan-boojh ke fail, comment me tareekh + kya dikha).
- Jo test kisi fixed (setup ke) user ka state ek taraf badle — disable, delete, sessions khatam — use `retries: 0` (serial group pe bhi): retry ko badla hua user milta aur uska error asli wajah chhupa deta. Apne naye data wale tests retry kar sakte hain (`freshNames` har attempt naye naam deta hai).

```sh
npx e2e run tests/iam                             # ek module
npx e2e run tests/iam --exclude-tag bug           # sirf jo pass hona chahiye
npx e2e run tests/iam --last-failed --headed      # fail hue dobara, browser dikhta hua
npm run coverage -- iam                           # brief coverage
npm run cost                                      # last run ka model kharcha + replay cache
```

**Chahiye** (`.env`): `APP_URL`, `APP_ADMIN_EMAIL` (Mailosaur address), `MAILOSAUR_API_KEY`, `MAILOSAUR_SERVER_ID`; optional `APP_ADMIN_NAME` (default "Test User"). Na ho to signed-in suites skip.

### IAM (`tests/iam/`)

Brief `docs/iam/acceptance-brief.md`. Setup pehle pichhle runs ka `iam-e2e-` data hatata hai (service accounts → access profiles → roles → users; kuch na hate to setup fail hota hai), phir 8 disposable users ka pool banata hai (ek invite, har ek ka pehla sign-in OTP se) taaki disable/delete/sessions asli logon ko na chhuein, aur apna ek access profile do pool users ko deta hai (service-account owner picker sirf direct access profile wale members dikhata hai). Tests ke holders aur owners sirf pool users hain. Optional env: `IAM_TENANT_OWNER_EMAIL`, `IAM_ATTRIBUTES_ENABLED=1`, `IAM_TEAM` + `IAM_TEAM_MEMBER_EMAIL` (team → member wala test).

**Cost:** `scripts/cost-report.ts` `.e2e/report.json` se har agent step ke tokens, cache (replay) aur USD (list prices `lib/pricing.ts`, tareekh ke saath). Naya model use karo to pehle `lib/pricing.ts` me uska rate.

## Explore goals

`nightly.config.ts` me. Har goal ek sentence: kahan jaana hai + kis nazariye se.

```ts
{ id: 'checkout', goal: 'Buy the cheapest product as a new customer and report anything off', maxSteps: 10, session: 'qa' }
```

Cost: explore ka cache nahi hota, har raat model calls lagte hain — roughly `goals × maxSteps`. Report me "AI tokens" tile se kharcha dekhte raho.

## Verdict

| | Kab |
|---|---|
| 🔴 Broken | koi regression test fail, ya explore me high/critical issue, ya site/model hi nahi chala |
| 🟡 Needs attention | flaky tests, medium/low issues, warnings |
| 🟢 Healthy | baaki sab |

Threshold `nightly.config.ts → verdict.failOnIssueSeverity` me badlo.

## Dhyan rakhne wali baatein

- **Production pe mat chalao** jab tak QA user ka data alag na ho. Agent forms bharta hai, buttons dabata hai. System prompt use real orders/deletes se rokta hai, lekin staging sabse safe hai.
- Explore findings agent ke claims + screenshot hain. Bug file karne se pehle screenshot dekh lo.
- GitHub pe **public** repo me 60 din tak koi commit na ho to scheduled workflows band ho jaate hain.
