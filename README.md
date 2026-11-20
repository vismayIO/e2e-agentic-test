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
scripts/nightly.ts       orchestrator: run → explore → report → notify
lib/                     report parsing, HTML, Slack/Teams
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

## IAM suite (`tests/iam/`)

IAM Business Acceptance Brief (`test_case.md`) ke tests, IAM console (next-gen-ui) pe. Har test ke tags me brief ke IDs hain (`--tag BEH-IAM-13`), priority (`P0/P1/P2`) bhi.

- `.env` me `APP_URL`, `IAM_ADMIN_EMAIL` (Mailosaur address), `MAILOSAUR_API_KEY`, `MAILOSAUR_SERVER_ID` chahiye — na ho to IAM suite skip hota hai.
- Sign-in ek baar per run (`tests/iam/auth.setup.e2e.ts`): test email daal ke code mangwata hai, Mailosaur inbox se naya OTP padh ke type karta hai (`lib/mailosaur.ts`) — koi manual step nahi. Baaki saare tests wahi session reuse karte hain.
- App login sessionStorage me rakhta hai, jo e2e `session.save` nahi rakhta — setup use localStorage me copy karke save karta hai, har test page load se pehle wapas daalta hai.
- Tenant perspective se: MSP Console = Northbridge (CFG-IAM-C), Direct customer = Lighthouse (CFG-IAM-A/B), Client Operator = Acme Healthcare (CFG-IAM-E).
- Tag `bug`: brief ka expected behaviour jo app abhi nahi karta — jaan-boojh ke fail. Inke bina chalana: `--exclude-tag bug`.

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
