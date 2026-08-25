# Engineering notes

Decisions, open problems and traps that are not derivable from the code. Kept
because each one cost time to discover and would cost it again.

Last updated: 2026-08-25.

---

## 1. Open problem: the app reports balances on two bases

The single most likely source of "these numbers disagree" reports.

| Surface | Basis |
| --- | --- |
| Table tab (year-by-year) | one deterministic run |
| Roth conversion ladder | one deterministic run |
| Social Security claiming ladder | one deterministic run |
| Summary tile "At retirement" | **median of 10,000 volatile runs** |
| Summary tile "Peak balance" | **median of 10,000 volatile runs** |

Measured on plan 219:

```
deterministic balance at retirement   $1,002,514
Monte Carlo median                      $910,559     -10%
deterministic peak                    $1,096,730
Monte Carlo median peak               $1,121,903      +2%
```

**The gap is not consistent in direction.** Volatility drag pulls the median
below a smooth path at retirement; a random path's highest point tends to
overshoot a smooth one's, so the median peak sits above. There is no wrong
number here to fix — only an unstated basis.

**Done (2026-08-25):** `BasisNote` in `components/planner/plan-summary.tsx`,
rendered inside the info popover of both simulated tiles. The claiming ladder's
glossary names its own basis and tells the reader the highlighted row agrees
with the last line of the Table tab to the dollar. That promise is enforced by
a test in `lib/claiming.test.ts` ("matches the year-by-year table to the
dollar, as the card promises").

**Not done, deliberately:** giving the deterministic run a named identity in the
UI — "the steady path" or similar — used consistently by the table and both
ladders, so a reader learns there are two lenses rather than discovering it as
an inconsistency. Larger copy change across several surfaces; wanted an explicit
decision first.

---

## 2. Parked: survivor / one-person household

`survivorFromAge` still exists on `PlanInputs` and in the `retirement_plans`
table, and the logic that used it was removed. **Nothing models a household
becoming one person.**

This matters more than it looks, because the omission runs one way:

- The survivor keeps the larger of two Social Security benefits; the smaller
  stops.
- They file single from then on, on roughly half the brackets.
- So delaying the higher earner's claim raises the survivor's income for life —
  often the strongest argument for waiting, and worth more than the break-even.

Every married claiming-ladder row therefore **understates the case for claiming
later, by an amount the plan cannot currently quantify.** The card says so in
its own words (`ClaimingLadder`, gated on `survivorUnpriced`), and a test
asserts a married plan sets that flag. `plan-inputs.tsx` carries the same
caveat in the Social Security panel.

Do not ship anything that ranks claim ages for couples without that caveat
visible.

---

## 3. The Medicare surcharge figure is mostly an assumption

`lib/irmaa.ts` grows surcharges at `ASSUMED_PREMIUM_GROWTH = 0.06` while
thresholds index at `ASSUMED_INDEXATION = 0.025`.

On plan 220 (a 59-year horizon) this produced a lifetime IRMAA of **$839,821**,
of which **$702,349 — 84% — is the growth assumption rather than the
household's income.** Priced at today's surcharge rates the same tiers cost
$137,472. IRMAA came to 68% of the entire lifetime tax bill, which is the tell.

The rationale in the file is sound for a decade and not for six. 3.4% real
growth sustained for 59 years implies Medicare premiums become ~7× more
expensive relative to everything else; no actuarial projection assumes that.

**Done:** the insight in `lib/insights.ts` discloses the assumption, states the
two rates, and computes the plan's own real multiple (7.2× on plan 220, 3.6× on
a shorter plan). Gated behind `realMultiple >= 1.5` so short plans do not carry
an irrelevant caveat.

**Not done:** decaying the excess growth toward the indexation rate over ~20
years. One constant plus a test, but it moves every plan's IRMAA figure, so it
needs an explicit decision.

---

## 3b. The projection does not charge health premiums

`lib/aca.ts` is imported by `lib/conversions.ts` and by **nothing in
`lib/retirement.ts`**. The base projection charges the IRMAA *surcharge*
(`irmaaSurcharge`) and never the standard Part B premium, and never a
marketplace premium at all.

That division is defensible — the surcharge depends on the plan's own income,
the premium does not — but it means **every health premium reaches the plan
only if somebody types it into the spending figure.** For anyone retiring
before 65 that is the largest single line in their early retirement, and until
2026-08-25 the expense estimator did not even offer a box for it: the health
category listed Medicare items only, so an early retiree saw nothing that
applied to them and entered nothing.

**Resolved, 2026-08-25: the projection now prices it.** `healthCoverBefore65`
on `PlanInputs` takes `marketplace` (priced per year), `own` (a figure the
household enters, for retiree cover or COBRA) or `none`. The estimator no
longer asks for a marketplace figure at all, and says why.

The switch is what makes it safe. Double-counting was the objection to
projecting it, and the answer is that the question changed: *"what does
marketplace cover cost you"* is unanswerable, *"will you be on the
marketplace"* is answerable by anyone. One control replaces a guess.

**The circularity, and why the year is solved more than once.** The premium is
set by the same year's income, and withdrawing to pay it raises that income.
IRMAA escapes this with its two-year lookback; ACA cannot. `simulate` therefore
runs the withdrawal solve up to `HEALTH_SOLVE_PASSES` times per retirement year
until the figure settles. Two properties matter and both are tested in
`lib/health-cover.test.ts`:

- **Monotone.** The premium is never revised downward. The sequence only rises,
  so the larger value is where it would land anyway — and it terminates at the
  400% cliff, where the step is not gradual and a naive iteration oscillates.
- **The row adds up.** The loop breaks on the figure the *solve actually
  funded*, never on the one just computed from it. A row reporting a premium
  larger than the withdrawal raised to pay for it would be lying about its own
  arithmetic, and the year-by-year table would show it.

The cliff is not theoretical. On a plan retiring at 58 with $150k brokerage and
$1.1M deferred, the premium runs $1,420 a year at 58–59 (brokerage draws keep
countable income low, subsidy ~$10,500), then $4,911 at 60, then **$13,113 at
61 with the subsidy gone entirely** — the brokerage is spent, withdrawals come
from the 401(k), and MAGI crosses 400%. Lifetime cover: $62,047, and $220,000
off the closing balance. None of that was in any projection before.

**Still true:** the standard Part B premium is charged nowhere. From 65 the
plan charges only `irmaaSurcharge`, and the expense estimator's health category
covers 65-onward costs — that division is now stated in the category hint.

---

## 4. Rollback map

Recent features were built to be removed cleanly. Each is new files plus a
named, small edit.

### "What's still open" (windows)

- `lib/windows.ts`, `lib/windows.test.ts`, `components/planner/whats-still-open.tsx`
- `retirement-planner.tsx`: one import, one `{inputs && result && <WhatsStillOpen … />}`

Delete the three files, revert those lines. Nothing else references it.

### Social Security claiming ladder

- `lib/claiming.ts`, `lib/claiming.test.ts`, `components/planner/claiming-ladder.tsx`
- `tax-phases.tsx`: import, a `useMemo(() => compareClaiming(inputs))` inside
  `SuggestedActions`, and one render line
- `lib/windows.ts`: one sentence in the claiming window pointing at it

**Note the container change.** `SuggestedActions` used to be gated entirely on
`conversions` being non-null:

```tsx
{conversions && <SuggestedActions conversions={conversions} inputs={inputs} />}
```

That gate could not survive a second action: a plan with nothing deferred has
no conversion ladder but still has a claiming decision, and the whole section
disappeared for it. The component is now rendered unconditionally, takes
`ConversionComparison | null`, and decides its own emptiness.

It decides it from **one list**, which is the part to preserve:

```tsx
const actions = [
  conversions ? <RothConversions key="roth" … /> : null,
  claiming ? <ClaimingLadder key="claiming" … /> : null,
].filter(Boolean)

if (actions.length === 0) return null
```

The heading is only worth rendering if something follows it. Writing that as a
guard naming every action plus a body naming them all again is two lists to be
kept in agreement by hand, and they do not stay in agreement — add a third
action and forget the guard, and a section with content is hidden; remove one
and forget it, and a heading is left with nothing under it. Deriving the guard
from the list makes both impossible.

**So adding or removing an action here is one line.** Do not reintroduce a
separate guard.

### Health cover before 65

Touches the withdrawal loop, so it is the least isolated change here.

- `lib/retirement.ts`: `healthCoverBefore65` / `healthPremiumMonthly` on
  `PlanInputs`, `healthPremium` / `healthSubsidy` on `YearRow`,
  `totalHealthPremium` on `PlanResult`, `HEALTH_SOLVE_PASSES`, and the
  settling loop wrapping the withdrawal solve.
- `lib/db/schema.ts`: two columns, both with defaults. **Needs `db:push`.**
- `lib/plan.ts`: the mapping, which coerces an unrecognised stored value to
  `marketplace` rather than trusting it.
- `lib/tax.ts`: `totalHealthPremium` on the phase summary.
- `plan-inputs.tsx`: the `HealthCover` control. `tax-phases.tsx`: one `Line`.
- `lib/health-cover.test.ts` is new.

**Reverting changes every early-retirement plan's numbers back**, which is the
point of it existing. The DB columns can stay — they are additive and unread if
the code goes.

### Expense estimator reframing

- `lib/expenses.ts`: `note?: string` on `ExpenseItem`, the `marketplace` line,
  four notes.
- `expense-estimator.tsx`: renders `item.note`, retitled dialog, rewritten
  footnote.
- `lib/expenses.test.ts` is new.

Adding a key is safe for stored figures: `readExpenses` starts from
`emptyExpenses()` and only overwrites keys it recognises, so an older
sessionStorage payload loads with the new line at zero. Removing a key is also
safe for the same reason. Note that these figures live in **sessionStorage**,
so they do not survive the tab — see §8 item 2 on keeping the split.

### Insights deep link

- `components/planner/insights-link.tsx` holds both `InsightsLink` and
  `INSIGHTS_ID`, on purpose: an anchor whose target has been renamed fails
  silently — the click does nothing and the reader concludes the section does
  not exist.
- `retirement-planner.tsx`: `<Card id={INSIGHTS_ID} … scroll-mt-20>`. The
  `scroll-mt-20` clears the `h-16` sticky header; without it the browser scrolls
  the heading under the header.
- Three link sites in `tax-phases.tsx`.

---

## 5. Engine traps

**`socialSecurityMonthly` is the benefit at full retirement age, not at the
claim age.** The input is labelled "Monthly benefit at 67" and `simulate`
applies `benefitFactor(socialSecurityAge)` itself. Applying the factor again in
calling code scales it twice. This shipped as a bug in `compareClaiming` and was
caught before release; there is now a test pinning $5,000 → $3,500 at 62 and
$6,200 at 70.

**`endAge` is exclusive.** With `endAge: 92` the last simulated row is age 91;
its `endBalance` is the balance as you turn 92. The UI labels these figures with
`endAge` throughout, which is consistent and defensible — do not "fix" one
surface in isolation.

**Depletion is detected from `unfunded > 0`, never from `endBalance <= 0`.** The
mid-year growth convention (`bal + flow + (bal + flow/2) * rate`) credits return
on half of each outflow, so a pot drawn to nothing approaches zero without
crossing it.

**Monte Carlo must net RMD surplus out of withdrawals**
(`(row.withdrawals - row.surplus) * inflator`). Without it a forced distribution
larger than the year's need is spent twice; a $3M plan reported 59% confidence
instead of 86%.

**IRMAA needs two distinct inflation conversions**, not one — MAGI up into the
table's dollars, the resulting surcharge back down into today's. Using one
factor for both inflated lifetime IRMAA from $13,808 to $44,516.

---

## 6. Testing conventions

- Tests live beside the engine as `lib/*.test.ts`. Vitest 4, node environment,
  `resolve.tsconfigPaths`.
- **Copy claims are tested.** `lib/windows.test.ts` asserts the "What's still
  open" strings never name a dollar amount and never match a directive pattern
  (`you should`, `we recommend`, `the best`…). That is the section's entire
  promise, so it is enforced rather than intended. If a window ever needs to
  recommend an amount, it belongs in Suggested Actions with the alternatives
  beside it.
- **Staleness guards.** Several tests fail when the calendar passes a year
  hard-coded in a table, so a stale bracket cannot sit unnoticed.
- **Reconciliation tests.** Where the UI tells a reader two figures will agree,
  a test asserts they do.
- When a test fails, check the test's premise before the engine's. Roughly half
  the failures during this work were mistaken test authorship — wrong
  tolerances, wrong synthetic plans, an assertion about a cap rather than a
  trigger.

---

## 7. Local environment

- **Do not run `npx prettier --write`.** There is no prettier config; it
  reformats ~200 untouched lines.
- After editing components, run `git diff | grep -E "^[+-].*defaultOpen"` — a
  text replacement silently dropped `defaultOpen` once and collapsed tiles that
  are meant to start expanded.
- Scripts run against the database need `npx tsx --env-file=.env.local`. Bare
  imports like `drizzle-orm` do not resolve from a scratchpad path; select all
  and filter in JS, or put the script in the repo.
- Analytics are not recorded in development at all
  (`app/actions/events.ts`). Localhost carries no `x-forwarded-for`, so an
  IP exclusion list cannot match. `ANALYTICS_IN_DEV=1` overrides.
- `ADMIN_EMAILS` is an environment variable, never a database column.
- Schema changes go through `db:push`; there is no migrations directory. Check
  for drift first — two additive pushes have been run against live Supabase.
- The dev server has been seen on both :3000 and :3001. A second untracked copy
  of the app (`FinApp/finapp`) once held :3000 while this repo ran on :3001,
  which produced an hour of "I don't see your change".

---

## 8. Positioning

The product is framed as a calculator and behaves increasingly like a decision
engine. The homepage subhead and the three meta descriptions were rewritten on
2026-08-25 to lead with decisions while keeping "retirement calculator" as the
search anchor. **The nav item stays "Retirement Planner"** — nav labels are
wayfinding, not positioning, and it pairs with "Savings Estimator".

Gaps between the two framings, roughly in order of value per unit of work:

1. **Decision inventory** — one ranked surface. Mostly re-presentation of maths
   that already exists.
2. **Cost of delay** — "waiting a year costs $X". `compareConversions` already
   takes `fromAge`; differencing is nearly free.
3. **Windows and deadlines** — *done*, `lib/windows.ts`.
4. **Assumption attribution** — partly done for IRMAA (§3). Nobody else in this
   market does it; the most defensible thing here.
5. **Stochastic ranking** — ladders rank on a single deterministic path while
   the plan is judged across 10,000. "Best in 8,400 of 10,000 futures" is a
   different and more honest claim. Cost: Monte Carlo per ladder row is too slow
   to run on every keystroke, so this needs thought.
6. **Sequencing** — decisions interact (claiming later widens the cheap
   conversion window). Nothing models the ordering.

The threshold for renaming the product's promise outright: when a user can point
at three things the app told them that they could not have worked out
themselves. Windows is the first.

**Regulatory note.** Specific, personalised, ranked recommendations edge toward
investment advice. The hedge is structural, not a disclaimer: show the whole
ladder rather than the winner, show what would flip the answer, attribute the
assumptions, and state what is not modelled. This is already house style — keep
it. Nobody here is qualified to say where the line actually sits; get a real
opinion before leaning on decision-engine positioning publicly.
