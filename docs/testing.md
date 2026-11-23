# Testing strategy — kaun sa testing kab, kaise

Yeh repo deployed Motadata console ko test karta hai, [`e2e`](https://e2e.com/docs) runner se. Tests **agent-driven** hain: jo kaam jaancha ja raha hai woh agent karta hai (`agent.act`), aur nateeja do baar jaancha jaata hai (code `expect`, phir `agent.assert`). Is page pe har testing type ka ek hi jawab hai: *kaun se tests, kaun si command, kab, aur fail hone pe kya*. Repo chalana, layout aur test likhne ke niyam: [README](../README.md).

Sab kuch teen cheezon se banta hai, aur teeno e2e ki apni documented cheezein hain:

| Cheez | e2e me | Is repo me |
|---|---|---|
| **Suite** — likhe hue tests ka ek hissa | tags + `e2e run --tag / --last-failed` | `lib/suites.ts` (ek hi definition) |
| **Known bug** — test jo abhi fail hona hi hai | `fail` option (`test.fail`): expected failure | `knownBug()` in `lib/suites.ts` |
| **Module** — console ka ek hissa | positional path `e2e run tests/<module>` | `tests/<module>/` folder |
| **Charter** — bina test ke agent ko ek goal | `e2e explore '<goal>' --agent <persona> --session <s>` | `tests/<module>/charters.ts` |

## Testing types

| Type | Sawaal | Kya chalta hai | Command | Kab |
|---|---|---|---|---|
| **Smoke** | Build zinda hai? | `smoke` tag: har module ke sabse zaroori pages, halke `admin` session pe, sirf dekhna (kuch banata/badalta nahi) | `npm run smoke` | Har deploy ke turant baad; nightly ka pehla gate |
| **Sanity** | Is module ke mukhya kaam theek hain? | `sanity` tag, ek module | `npm run sanity -- iam` | Kisi fix / chhote release ke baad us module pe |
| **Regression** | Kuch aur to nahi toota? | Sab tests. Known bugs bhi chalte hain — fail hon to pass gine jaate hain (expected failure) | `npm run regression` (ya `-- iam`) | Release se pehle; har raat (nightly ka doosra stage) |
| **Retesting** | Fix sach me hua? | (a) pichhle run me jo pass nahi hue · (b) sirf known defects (`bug` tag) | `npm run retest` · `npm run bugs` | Fix deploy hone ke baad |
| **Exploratory** | Jo kisi ne socha nahi, woh? | Module ke likhe hue charters, persona ke saath | `npm run explore -- iam` | Naye feature pe; har raat kuch (budget ke andar) |
| **Ad-hoc** | "Zara yeh dekh lo" | Koi bhi ek goal, abhi | `npx e2e explore --session admin --agent explorer --output .e2e/explore/adhoc '<goal>'` | Jab mann kare — koi file nahi |
| **Monkey** | Ulta-seedha input app ko todta hai? | Modules ke create forms me se random pe `fuzzer` persona, seed ke saath | `npm run monkey` (ya `-- iam`) | Har raat thoda; release se pehle zyada |

`npm run suite -- <suite> [module…] [-- e2e flags]` in sab ka asli rasta hai (`scripts/suite.ts`); upar ke naam uske shortcuts hain (`npm run verify` jaanchta hai ki har ek ka shortcut `package.json` me hai). Koi bhi e2e flag aage de sakte ho: `npm run sanity -- iam -- --headed`.

- **Retest ka "pichhla run"** = usi output folder ka aakhri run (`--last-failed` us folder ka `report.json` padhta hai). `npm run retest` default folder `.e2e` padhta hai, jahan haath se chalaye suites likhte hain. Nightly ka run `.e2e/nightly/regression` me hota hai, to uske failures ke liye: `npm run retest -- -- --output .e2e/nightly/regression`. Kuch fail na hua ho to retest khaali pass hota hai.
- **`npm run bugs`** me sab pass = sab known bugs ab bhi hain; `UNEXPECTED_PASS` = woh bug fix ho gaya.

Screen ya ek test chunne ke liye tag nahi, path: `npx e2e run tests/iam/roles.e2e.ts`, `npx e2e run tests/iam/roles.e2e.ts:31`.

## Tags — bas yeh chaar tarah ke

| Tag | Matlab | Niyam |
|---|---|---|
| `smoke`, `sanity` | Test is chhote suite me bhi hai | Regression me sab tests hote hain, uska tag nahi. Smoke test `admin` session pe chale aur kuch na badle. Har module me kam se kam ek smoke test. |
| `bug` | Known defect: brief ka behaviour jo app abhi nahi karta | Hamesha `knownBug(...)` se (neeche), haath se nahi. Smoke test pe nahi. |
| `P0` / `P1` / `P2` | Priority | Har test pe theek ek (describe se bhi aa sakta hai). |
| `SIT-IAM-01`, `EX-IAM-07.2`, … | Brief ka ID | Kisi module ke brief me define hona chahiye (neeche). |

Koi aur tag nahi. Naam `lib/suites.ts` me hain (`SMOKE`, `SANITY`, `BUG`, `PRIORITIES`).

**Known bug** `lib/suites.ts` ke `knownBug(reason, ...tags)` se likha jaata hai. Yeh e2e ka apna expected-failure mark hai (`fail` option, docs: reference/test → `test.fail`) + `bug` tag:

```ts
test('a custom role cannot move on without a description',
  knownBug('23 Nov 2026: sirf naam se hi "Next" enabled — description optional hai', 'SIT-IAM-11', 'P2'),
  async ({ agent, screen, roles }) => { … });
```

- Bug maujood hai → test fail hota hai → runner use **passed** ginta hai (wajah aur asli failure report me rehte hain), aur retry nahi karta. Isliye known bugs smoke / sanity / regression ko red nahi karte.
- Bug fix ho gaya → test pass hota hai → runner use **`UNEXPECTED_PASS`** se fail karta hai: `knownBug(...)` hatao, saadhe tags likho.
- `reason` me tareekh aur kya dikha likho — wahi report me dikhta hai.
- Serial group ke andar runner khud mana karta hai (collection error).

**Brief ID** ka shape `<KIND>-<MODULE>-<n>[.<n>]` hai, jahan `<MODULE>` module ke folder ka naam hai, bade aksharon me (`tests/iam` → `SIT-IAM-01`, `BEH-IAM-12`, `EX-IAM-07.2`). ID wahi hai jo `docs/<module>/acceptance-brief.md` me `### <id>` heading ho, ya kisi table row ka pehla cell (`| <id> | … |`). Test kisi bhi module ke brief ka ID le sakta hai (Tickets ka test IAM ka `SIT-IAM-07` cover kar sakta hai); brief ka ID tab covered hai jab koi bhi test use le.

`npm run verify` yeh sab bina app ke jaanchta hai (galat spelling wala tag test ko chupchaap suite se bahar kar deta): tags, har module ka smoke test, brief ka coverage, charters, aur `package.json` ke shortcuts. `npm test` = typecheck + verify; CI ise har run se pehle aur har push / pull request pe chalata hai.

## Bug ka safar: exploratory → retest → regression

1. **Mila** — explore/monkey finding, ya brief ka koi behaviour jo app nahi karta.
2. **Saabit** — us finding ka test likho: steps `agent.act`, expected behaviour aakhir me code `expect` + `agent.assert`. Test tabhi bug hai jab woh *usi wajah se* fail ho (e2e docs: bug bash → "Verify"). `knownBug('<tareekh>: <kya dikha>', …)`.
3. **Track** — nightly report ka "Known bugs" (aur `npm run bugs`) batata hai kaun se bugs ab bhi hain, wajah ke saath.
4. **Fix hua** — wahi test pass hone lagta hai: runner `UNEXPECTED_PASS` deta hai, nightly use "Fixed — knownBug mark hatao" me dikhata hai.
5. **Regression** — `knownBug(...)` ki jagah saadhe tags likho. Ab woh ek aam regression test hai.

## Nightly pipeline (`npm run nightly`)

```
smoke ──fail──▶ RED, baaki stages nahi chalte (toota build model calls na khaaye)
  │pass
regression (sab tests, ek hi run)  → regression nateeja  +  known bugs (ab bhi hain / fixed)
  │
exploration: kuch likhe hue charters  →  monkey (random create forms)
  │
report (HTML + summary) → verdict → Slack/Teams
```

- Nightly hamesha sab modules pe chalta hai. Ek module ya ek suite ke liye `npm run suite -- …`.
- **RED**: smoke fail, koi setup fail, regression me koi test fail, kisi run ka error (config / engine / model / stage ki time limit), ya explore me high/critical issue.
- **YELLOW**: flaky tests (retry pe pass), chhote issues / warnings, blocked ya adhoori exploration, Ctrl-C se roka gaya run, ya koi known bug fix ho gaya (mark hatana baaki — app ki sehat ki khabar achhi hai, isliye RED nahi).
- Known bug ka ab bhi hona verdict nahi badalta — woh pehle se pata hai.
- Sab tests ek hi run me chalte hain kyunki har `e2e` run apne setup dobara chalata hai (module ka test data dobara banta).
- **Har stage ki apni time limit** hai (`nightly.config.ts`: smoke, regression, har charter), to raat khud khatam hoti hai aur report hamesha banti hai. CI job ka timeout in sab ke jod se upar rakho — CI jab job ko maarta hai tab report nahi banti.
- **Exploration ka budget tay hai**, modules badhne se raat lambi nahi hoti: har raat sab modules ke likhe hue charters me se `explore.charters` (seed se chune, to har raat alag) + `explore.monkey.count` monkey forms. Seed aaj ki tareekh hai (`YYYYMMDD`) aur report me likha hota hai.

Kya chale aur kitna, `nightly.config.ts` me. Charters modules se aate hain, config me sirf budget hai.

## Exploratory, ad-hoc, monkey

`e2e explore` agent ko test file nahi, goal deta hai: woh steps plan karta hai, app chalata hai, aur har defect evidence ke saath report karta hai (`issue` run fail karta hai, `warning` nahi).

- **Charter** = ek area + ek posture + ek sentence, start route ke saath. Postures aur unke personas (`lib/charters.ts` → `PERSONAS`; har ek ka stance `e2e.config.ts` → `agents` me):

  | Persona | Posture | Charter ka shape |
  |---|---|---|
  | `explorer` | Naya user; state (reload/back ke baad); error paths | `Starting at /users, invite a person and follow the invitation list like a first-time admin; report anything confusing, broken or inconsistent` |
  | `skeptic` | Numbers aur copy | `Starting at /users, compare every count, status and date on the page with the same fact elsewhere; report any that disagree` |
  | `fuzzer` | Edge input | `Starting at /roles, open Create role and try as the role name: left empty, 300 characters, unicode, leading spaces; report validation that is missing or wrong` |

- **Monkey** = wahi `fuzzer`, lekin nishaana random: modules ki `monkey` list ke **create forms** (`{ route, form }`) me se kuch chune jaate hain, aur agent sirf us form ke andar kaam karta hai. Poori screen nahi — maujooda records ke forms me asli logon ka data hota hai. Seed report me hota hai: `MONKEY_SEED=<seed> npm run monkey` wahi forms dobara chunta hai.
- **Ad-hoc** ke liye koi code nahi: `npx e2e explore --session admin --agent explorer --output .e2e/explore/adhoc 'Starting at /roles, …'`. `--agent` ke bina `default` agent chalta hai, jiska stance ek test step ke liye bana hai, exploration ke liye nahi; `--output` ke bina report `.e2e/report.json` pe likhi jaati hai aur agla `npm run retest` use "pichhla run" samajh leta hai. Goal me likho ki kuch na badle, ya jo bane uska naam `<module>-e2e-x-` se shuru ho (tabhi module ka cleanup use hatata hai).
- Shared tenant ke niyam har agent ke `context` me hain (admin ka apna account/sessions, Tenant Owner, SSO settings kabhi nahi; asli logon ko mail nahi) aur har charter ke aakhir me (`lib/charters.ts`): jo save karo uska naam `<module>-e2e-x-<run id>-` se shuru; jo tumne nahi banaya use sirf padhne ke liye kholo.
- Findings agent ke claims hain. Bug file karne se pehle upar ka "Saabit" step.

## Naya module jodna

`tests/<module>/` banao — bas. Suites, charters, verify aur nightly use khud dhoondh lete hain; shared code me koi badlav nahi.

```
tests/<module>/
  <module>.ts            session naam, data prefix, agent context
  <module>.setup.e2e.ts  adminSignIn → apna purana data sweep → apna test data → session.save
  smoke.e2e.ts           `smoke` tests, `admin` session pe (kam se kam ek — zaroori)
  charters.ts            exploratory charters + monkey ke create forms
  pages/  fixtures.ts    page objects (tests/app/ui.ts pe)
  coverage.ts            brief ke jo IDs automate nahi ho sakte, wajah ke saath (`GAPS`)
  *.e2e.ts               tests — kuch pe `sanity`
docs/<module>/acceptance-brief.md   IDs `<KIND>-<MODULE>-<n>` (upar "Brief ID")
```

- **Data:** apna prefix (`<module>-e2e`) aur apna session naam. Naam `freshNames(prefix)` se — har attempt ke naye, aur naam me banne ka samay hota hai.
- **Cleanup:** setup `sweep()` se apne prefix wala purana data hatata hai, lekin 3 ghante se naya data nahi chhedta — woh kisi chal rahe run ka ho sakta hai (nightly, kisi doosri machine ka run, ek explorer). Kuch na hate to setup fail hota hai. Ek hi checkout me do runs ek saath mat chalao: setup ka banaya test data (jaise IAM ka `.e2e/iam-pool.json`) us checkout ka hota hai.
- **Login:** `adminSignIn` (`tests/app/auth.ts`). Login zaroori hai: `APP_ADMIN_EMAIL` aur Mailosaur settings ke bina admin setup fail hota hai aur run red — kuch chupchaap skip nahi hota.
- **Shared code:** login, UI kit, naming, cleanup aur console ka apna smoke `tests/app/` me hain. Kisi doosre module ka page chahiye to wahi import karo (`tests/iam/pages/users.ts`).
- Aakhir me `npm run verify -- <module>`.

## Kharcha aur replay cache

- Pass hua `agent.act` step `.e2e/cache/` me record hota hai aur agli baar bina model call ke replay hota hai; screen badle to agent wahin se sambhal leta hai (self-healing). `agent.assert` aur exploration har baar model call karte hain.
- e2e docs ki salaah: cache commit karo, CI me woh read-only rehta hai.
- `npm run cost` ek run ka kharcha dikhata hai (`.e2e/report.json`, ya `npm run cost -- <report.json>`): har agent step ke tokens, replay aur USD. Rates `lib/pricing.ts` me hain, tareekh ke saath — naya model use karo to pehle wahan uska rate.
- Smoke aur sanity chhote isiliye hain — unhe baar-baar chalana sasta rehna chahiye. Exploration ka kharcha `nightly.config.ts` ke budget se bandha hai: (`charters` × `maxSteps`) + (`monkey.count` × `monkey.maxSteps`) steps har raat.

## CI

- **Har push / pull request:** `npm test` (typecheck + verify) — app nahi khulta, model call nahi.
- **Nightly** (schedule): `npm test`, phir `npm run nightly`.
- **Haath se** (workflow dispatch): `suite` (nightly / smoke / sanity / regression / bugs / explore / monkey) + `module`. Deploy ke baad smoke isi se.
- `retest` CI ke choices me nahi hai: use pichhle run ka `report.json` usi machine pe chahiye, aur CI ka runner har baar naya hota hai. CI me failed job dobara chalao.

Setup (variables, secrets, report kahan milti hai): [README → CI](../README.md#ci).
