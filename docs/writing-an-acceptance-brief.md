# Writing an acceptance brief

This guide is for the person who knows how a module is meant to work: its product manager, business analyst or domain expert. You do not need access to the code or to any tool. You write one document, the QA team turns it into automated tests.

## What the brief is

An acceptance brief describes how the module is expected to behave for real customers, in business terms. It is **not** a list of test steps and it does not describe screens or buttons.

What happens to it after you hand it over:

- Every numbered item in the brief gets one or more automated tests. The tests run every night against the deployed application.
- The nightly report lists results by your item numbers, so a failure reads as "BEH-TICKETS-04 is broken", not as a technical error.
- Where the application does not yet do what your brief says, the item is reported as a **known bug** every night until it is fixed.
- Where an item cannot be tested automatically (it needs an external system, or weeks to pass), it is listed as **not automated** with the reason. Nothing is dropped silently.

So the brief is the definition of "working". If a rule is not in it, nobody checks it.

## Before you start

Agree one thing with the QA team: the module's short code — one word, upper case, such as `TICKETS` or `IAM`. It appears in every item number.

## Item numbers (IDs)

Every item has an ID of the form `<KIND>-<MODULE>-<number>`.

| Kind | What it is | Example |
|---|---|---|
| `SIT` | **Situation** — a real customer story, from start to finish | `SIT-TICKETS-03` |
| `BEH` | **Expected behaviour** — a rule that must hold in every situation | `BEH-TICKETS-07` |
| `EX` | **Example** — one concrete case of a behaviour. `EX-TICKETS-07.2` is the second example of `BEH-TICKETS-07`. | `EX-TICKETS-07.2` |
| `CFG` | **Configuration** — a type of customer set-up. Uses a letter: `CFG-TICKETS-A`. | `CFG-TICKETS-A` |

Three rules about IDs:

1. **An ID never changes and is never reused.** Tests and bug reports refer to it for years. If you remove an item, its number retires with it.
2. **Gaps in the numbering are fine.** Do not renumber to close them.
3. **Write each ID exactly in one of two places:** at the start of a heading (`### SIT-TICKETS-03 — …`) or in the first column of a table row (`| BEH-TICKETS-07 | … |`). That is how the item is recognised.

## The parts of a brief

A brief has a short header and five parts. For a small module, **part 2 alone is enough to start**; add the others as the module grows.

| Part | Contains | Has IDs |
|---|---|---|
| Header | Title, date updated, owner, who reads it | — |
| How to read this | What the parts are and what the priorities mean | — |
| Words used here | The module's terms, each defined in one or two sentences | — |
| 1. Situations | Customer stories that run across several features | `SIT` |
| 2. Expected behaviours | The rules, one per table row, each with a priority | `BEH` |
| 3. Examples | Selected behaviours as one Given / When / Then case each | `EX` |
| 4. Points to note | Edge cases and reminders, as bullets | none |
| 5. Configurations | The customer set-ups the situations run under | `CFG` |

### Part 1 — Situations

A whole customer journey. The heading is the customer's own sentence, in quotes. Under it:

- **Who** — the people in the story, with their roles. **Where** — the configuration it runs under.
- **The story** — numbered steps, in the order they happen.
- **Success looks like** — one sentence: what is true at the end.
- **Watch for** — the ways this story goes wrong.
- **Related behaviours** — the `BEH` IDs this story relies on.
- **Depends on** — what other modules must already provide.

### Part 2 — Expected behaviours

One rule per table row, grouped under headings by area. Four columns: `id`, `expected behaviour`, `priority`, `why it matters`.

Priority:

- **P0** — a failure would go unnoticed, would leak from one customer to another, or could not be undone.
- **P1** — a failure is visible and can be put right.
- **P2** — minor.

### Part 3 — Examples

Pick the behaviours that are easy to misread and show each as one concrete case with real-looking names:

- **Given** — the starting state.
- **When** — what someone does.
- **Then** — what must be true afterwards.

The heading names the behaviour it illustrates: `### EX-TICKETS-01.1 — BEH-TICKETS-01: <short title>`.

### Part 4 — Points to note

Bullets under bold labels. These have no IDs, so they are **not tracked by tests**. Anything that must be checked belongs in part 2 or 3.

### Part 5 — Configurations

A table of the customer types (direct customer, MSP, client of an MSP, …), then for each one a short sample setup: which organisation, which people, which settings. Configurations are for reference; they do not get tests of their own.

## Template

Copy this and replace the content. Keep the headings and the table columns as they are.

```markdown
# Tickets — Business Acceptance Brief

**Updated** 2026-11-24 · **Owner** Tickets PM, <name> · **Readers** engineering, leadership, other module PMs

## How to read this

Situations are customer stories. Expected behaviours are rules that always hold; each has a priority
(P0 unnoticed, cross-customer or cannot be undone; P1 visible and fixable; P2 minor). Examples show
selected behaviours as one case each. IDs do not change; numbering may have gaps.

## Words used here

- **Queue.** A list of tickets one team works from.
- **Assignee.** The one person responsible for a ticket right now.

## 1. Situations (1)

### SIT-TICKETS-01 — "A customer emailed us. Get it to the right team."

**Who:** Asha (agent), Ravi (team lead)  ·  Where: CFG-TICKETS-A

**The story:**

1. An email arrives and becomes a ticket in the Inbox queue.
2. Asha opens it, sets the category and assigns it to the Network team.
3. The ticket leaves the Inbox queue and appears in the Network queue.

**Success looks like:** the ticket is with the right team within a minute, and its history shows who moved it.

**Watch for:** the ticket in two queues at once; the move missing from the history.

**Related behaviours:** BEH-TICKETS-01, 04.

**Depends on:** IAM: Asha holds a role that may assign tickets.

## 2. Expected behaviours (2)

### Assignment

| id | expected behaviour | priority | why it matters |
|---|---|---|---|
| BEH-TICKETS-01 | A ticket is in exactly one queue at a time; moving it removes it from the old queue at once. | P0 | Two teams work one ticket, or none does. |
| BEH-TICKETS-04 | Every change of assignee or queue is in the ticket's history with who made it and when. | P1 | Nobody can answer "who moved this?". |

## 3. Examples (1)

### EX-TICKETS-01.1 — BEH-TICKETS-01: a moved ticket leaves the old queue

- **Given** ticket "Printer offline" is in the Inbox queue
- **When** Asha assigns it to the Network team
- **Then** the Inbox queue no longer lists it and the Network queue does.

## 4. Points to note

**Queues**

- A closed ticket stays in its last queue and is hidden by the default filter.

## 5. Configurations (1)

| id | name | what it holds |
|---|---|---|
| CFG-TICKETS-A | Single team, email intake | one Inbox queue, one team queue, two agents |
```

A complete, real brief is the IAM one ([iam/acceptance-brief.md](iam/acceptance-brief.md)). If you received this guide on its own, ask the QA team for that file.

## Writing a good item

- **Say what the customer experiences, not how the screen is built.** "A disabled person cannot sign in" stays true after a redesign. "The Disable button turns grey" does not.
- **One rule per behaviour.** If a row needs "and also", split it into two rows.
- **Make it checkable.** "Fast", "intuitive" and "secure" cannot fail a test. "The list shows the new ticket without a reload" can.
- **Write what should happen, even where the application does not do it yet.** Do not adjust the brief to match today's bugs — that gap is exactly what the nightly run reports.
- **Name the limits.** Numbers, dates and counts ("within 365 days", "at most 500 rows") are the easiest things to test and the easiest to get wrong.
- **Say what must never happen.** Rules like "never visible to another organisation" are usually the P0s.
- **Give "why it matters" in one sentence.** It is the first thing someone reads when the item turns red.

## Drafting the brief with an AI assistant

Any AI assistant can draft the brief; it needs no access to the code. It produces the same format every time only if it gets the same five things every time:

| Give it | Why |
|---|---|
| 1. **This guide**, whole | The format: parts, ID rules, table columns, priorities. |
| 2. **The IAM brief**, whole | A finished example. It sets the depth and the tone better than any description. |
| 3. **The module's short code** | `TICKETS`. Without it the assistant invents its own, and every ID is wrong. |
| 4. **The business logic** | PRD, spec, user stories, rules and limits, roles and permissions, customer types, what the module depends on in other modules. Everything in the brief comes from here. |
| 5. **The existing brief**, if there is one | So that existing IDs are kept and new items get the next free numbers. |

Then this prompt:

```
You are writing a business acceptance brief for the <MODULE NAME> module. Module code: <CODE>.

Attached: (1) the guide "Writing an acceptance brief", (2) the IAM brief as a finished example,
(3) the business logic for this module<, (4) the current brief for this module>.

Write the complete brief as one Markdown file.
- Follow the guide exactly: same parts in the same order, same headings, same table columns, IDs in the
  form <KIND>-<CODE>-<number>, each at the start of a heading or in the first column of a table row.
- Match the IAM brief in depth and tone.
- Use only what is in the business logic. Do not invent rules, limits or numbers. Where the business
  logic is silent or contradicts itself, do not guess: list the question under a final heading
  "Open questions".
- Describe what the customer experiences. No buttons, colours, layouts or page names.
- One rule per behaviour. Give every behaviour a priority using the guide's definitions and a
  one-sentence "why it matters".
- <If a current brief is attached:> keep every existing ID and its meaning; give new items the next
  free numbers; list the IDs you changed or removed at the end.
```

Three things to know:

- **The format will match; the wording will not.** Two runs on the same input give the same structure and different sentences. So generate once, review it, and from then on **edit that file** — do not regenerate it. A regenerated brief renumbers and rewords items that tests already refer to.
- **Review every item.** The assistant writes plausible rules. You are the one who knows whether they are true. Answer the "Open questions" and remove that heading before you send the brief.
- **Run the checklist** at the end of this guide before sending.

## What else to tell the QA team

These do not go in the brief; send them alongside it.

1. **Where the module is in the application** — the names of its pages as they appear in the navigation.
2. **What test data may be created and removed** — and what must never be touched (real customers' records, organisation-wide settings, anything that sends email to real people).
3. **What cannot be created on demand** — things a test would need but that only exist through another system or over time (a directory-synced user, a ticket that is 30 days old). Either name an existing one the tests may read, or expect that item to be listed as not automated.

## Format and delivery

- One file, named `acceptance-brief.md`, in plain Markdown as in the template. Any text editor will do.
- Use the same spelling for every term throughout, and the same names for people and organisations across situations and examples.

## Changing the brief later

- New rule → a new ID with the next free number. Update the **Updated** date.
- Changed rule → keep the ID, change the text, and tell the QA team which IDs changed so their tests are rewritten.
- Removed rule → delete the item and tell the QA team; its number is not used again.

## Checklist before you send it

- [ ] Every item has an ID in the right form, at the start of a heading or in the first column of a table row.
- [ ] No ID appears twice as a definition.
- [ ] Every behaviour has a priority and a "why it matters".
- [ ] Every example names the behaviour it illustrates.
- [ ] Nothing that must be tested sits only in "Points to note".
- [ ] No item describes a button, colour or layout.
- [ ] The three notes for the QA team are attached.
