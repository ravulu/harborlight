# Engineering notes

Decisions, open problems and traps that are not derivable from the code. Kept
because each one cost time to discover and would cost it again.

Last updated: 2026-08-27.

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

## 3c. Holdings is the start of a family balance sheet

`/holdings` looks like an alternative-investments screen. It is the first
piece of something larger: a household balance sheet and its future cash
flows, decided 2026-08-26. Read it that way before changing it.

Two consequences that are already live:

**`Holding.counted` is a placeholder, not dead code.** It currently does one
thing — moves a holding's equity between the two totals at the top of the
screen. Its label says "Count it in the plan", which promises a reach into the
retirement projection that does not exist: nothing outside `/holdings` imports
`lib/holdings.ts`. That mismatch is known and deliberately left alone until the
integration is designed. **Do not delete it as unused, and do not wire it to
`simulate` without that design.**

**The planner already holds part of the balance sheet.** Brokerage, 401(k),
IRA, Roth and HSA live on `PlanInputs`. When the two are joined, those must
appear once and not twice — the obvious failure is a net-worth figure that
double-counts every retirement account. Whatever merges them needs a single
owner for each balance, not two stores that happen to agree.

Not yet modelled and worth naming before the shape hardens: liabilities with no
asset attached (student loans, cards, car loans), non-investment assets (cash,
vehicles, 529s), ownership between spouses, and the outgoing side of the cash
flows. The projection models spending as one figure; a balance sheet models it
as a set of obligations, and those are different enough that merging them is a
design decision rather than a merge.

### The ownership rule, decided 2026-08-26

**Liquid balances belong to `PlanInputs`. Illiquid belong to `Holding`. Neither
may hold the other's kind.** Brokerage, 401(k), IRA, Roth and HSA stay in the
planner; property, private equity, funds, business stakes and notes stay here.

That is what makes the join need no reconciliation at all:

```
family net worth at age N
  = simulate(plan).rows[N].endBalance     ← liquid, already projected per year
  + Σ holdings' value at N, less debt     ← illiquid, own growth rate
```

Nothing appears twice by construction, so there is no dedupe step to get wrong.
Worth enforcing rather than trusting: a test that `HOLDING_KINDS` never grows a
liquid member, and that `lib/holdings.ts` never imports a balance field from the
planner, catches a double-count when it is introduced rather than in a net-worth
figure nobody reconciles.

### One abstraction covers the lot

Every holding, and every plan for one, is a **timeline of cash flows**: an
outflow to acquire, a stream while held, an inflow on disposal.

| | acquire | while held | dispose |
| --- | --- | --- | --- |
| Rental | — | rent less costs | sale, after recapture and gains |
| Keep the house | — | tax, insurance, upkeep | step-up at death |
| Downsize | new home price | lower running costs | sale proceeds |
| Sell and rent | — | rent, rising with inflation | sale proceeds |
| Second home | purchase at an age | running costs, maybe rent | sale, or held |

So a second-home plan is not a separate feature — it is the same machinery with
the acquisition leg filled in. Build the timeline once.

### The property ladder, when it comes

Keep / downsize / sell-and-rent is structurally the conversion ladder and the
claiming ladder again: every option priced, no winner named, same tests. Three
things have to be in it or it is not a fair comparison:

- **§121** — $250k single, $500k married of gain excluded on a main home.
  Already implemented in `lib/holdings.ts`.
- **Stepped-up basis.** Hold until death and heirs take the property at market
  value; the whole lifetime gain escapes capital gains tax. A comparison
  counting only cash flow will always favour selling and will be wrong for any
  household that wants to leave something.
- **Rent inflation.** Selling gives a fixed lump; renting costs more every year
  for thirty. The crossover age is the whole question, and it is the same shape
  as the Social Security break-even already shipped.

### Build order

1. Net worth over time — liquid plus illiquid, by year.
2. The cash-flow ledger — rent, interest, debt service, running costs.
3. The property ladder, with the step-up column.
4. Second home, as the acquisition leg on the same timeline.

**The decision deferred:** a ladder needs a metric, and the honest one is what
happens to the household, which lives in the projection. Until the two join,
the ladder reports a balance-sheet metric only — net worth at end age, cash flow
per year — and cannot say "this is worth two years of retirement".

---

## 3d. Open task: recreate plan3

`ravi@bat-vc.com` had two plans and now has none. They went between the
household migration on 2026-08-26 and shortly after it. Nothing in the balance
sheet work can delete a plan — the only path is `deletePlan` in
`app/actions/plans.ts`, reachable from the saved-plans list alone, and the new
writes delete from `holdings` and `liabilities` scoped by `userId`. Cause
unknown; recorded rather than guessed at.

The household row survives with the values it was seeded from, which is why
those figures still read age 30, married.

"plan3" can be rebuilt exactly from the analysis it was used for:

```
currentAge 30 · retirementAge 65 · endAge 90 · married · no state
brokerage 3,000,000 (gainShare 50) · 401k 1,000,000 · IRA 0 · Roth 0
monthlyRetirementSpending 20,000
  step 1: age 75 -> 17,000     step 2: age 85 -> 19,000
socialSecurityMonthly 3,000 at 67 · spouseBenefitMonthly 2,000 at 67
preRetirementReturn 7 · postRetirementReturn 7 · inflationRate 2.5
```

### The question integration has to answer first

When the balance sheet feeds the projection, "save this plan" stops being a
simple act. A plan is a version, and the balance sheet is a live statement of
what the household has right now — the two change on different clocks.

Three things follow, and none of them are decided:

- **Does a saved plan snapshot the balance sheet or point at it?** Snapshot and
  a plan saved in March still assumes a rental sold in May. Point at it and a
  saved plan silently reports different figures each time it is opened, which
  makes comparing two plans a comparison of two moments as much as two
  strategies.
- **What does Save mean then?** Today the button keeps a plan and the balance
  sheet writes itself continuously, which is right while they are separate. It
  will not stay right.
- **What does Compare mean?** Two plans built against different balance sheets
  are not comparable on the figures that matter.

The current labelling assumes they are separate and says so: the button reads
"Save plan", and the household tile says the balance sheet saves as you type.
Both will need revisiting on the day the two are joined.

### One of those three is now decided

The register belongs to the **plan**, not the user — `getPlanRegister(planId)`
and `savePlanRegister(planId, register)` in `app/actions/balance-sheet.ts`, with
`planId` a cascading foreign key on both tables. So a saved plan **snapshots**
its assets and liabilities, and one Save covers both tabs.

That answers the first bullet and makes Compare meaningful again: two plans
carry their own registers, so comparing them compares two strategies rather
than two moments. What is still undecided is the second bullet — the household
tile auto-saves as you type while the register waits for Save, which is two
clocks on one screen.

---

## 3e. Connecting the two tabs: four phases

Written 2026-08-26, before any of it is built. Nothing here is implemented.

### Where the wire runs today

One way, and display-only. The planner computes `ordinaryByAge`
(`components/planner/retirement-planner.tsx`), the workspace parks it in
`useState`, and the holdings screen uses it to price each sale's tax band. It
exists so a gain is charged against the income of the year it is realised in
rather than one figure somebody typed.

`lib/retirement.ts` has **no** knowledge of holdings — no import, no reference.

### Why `otherIncomeMonthly` is the wrong wire

The obvious move is to populate the planner's "Other monthly income" from the
register. It gives wrong tax, for four separate reasons.

**One number is doing two jobs.** `otherIncome` reduces the year's shortfall as
cash *and* enters the tax solve as ordinary income — the same figure both
times. But `annualIncome` returns `{cash, taxable, shelter}` and for everything
that matters the first two differ: a rental's depreciation, a syndication's
K-1 shelter, an accruing note that pays no cash at all until it matures. Feed
it `cash` and it overtaxes; feed it `taxable` and the plan thinks there is less
money than there is.

**It is a series, not a monthly constant.** Income stops at a sale or a
maturity, and a rental's shelter runs out at 27.5 years — taxable income jumps
with no change in cash. `otherIncomeMonthly` is one figure times an inflator
from a start age and cannot express any of that.

**`annualIncome(h, currentAge)` ignores its own `currentAge`.** It reports
income for a holding already sold. Correct for a "today" tile, wrong for a
projection.

**Character is missing.** The planner taxes other income as wholly ordinary.
Rental and passive syndication income attract NIIT; sponsor fees attract
self-employment tax instead, which is modelled nowhere in the codebase.
`annualIncome` has no character field to carry the difference.

### The double-count traps

Two, and the second is the larger.

- **Income.** Anyone who already typed rental income into "Other monthly
  income" gets it twice the moment the register populates it.
- **Costs.** `annualCosts` returns upkeep and liabilities carry
  `monthlyPayment`, but `monthlyRetirementSpending` is user-typed and probably
  already includes the mortgage and the property tax. Charging both is a large
  error in the wrong direction.

A related trap: a fixed mortgage payment is **nominal** and the projection works
in today's money, so it shrinks in real terms every year. Rent inflates. A fixed
CD coupon does not.

### Why sales are the hard half

`realise` gives `netProceeds` at an age, but the planner has no channel for a
lump sum. Proceeds have to land somewhere, the tax has to be paid that year, the
mortgage payoff has to clear the liability, and the holding's income and costs
have to stop.

Then it closes the loop. A sale's tax depends on that year's other income, and
if the proceeds are part of that income the year has to be solved for a fixed
point. **The open loop is what makes today's `useState` wire safe.** Close it
and React state cannot host it — that is a render loop.

Precedent exists: the ACA premium solve does exactly this with
`HEALTH_SOLVE_PASSES = 4`. But it lives *inside* `simulate`. So the register has
to become an argument — `simulate(inputs, register)` — rather than a sibling
component passing maps through the workspace. **That is the architectural
change, and it gates everything else.**

Two consequences to expect:

- **A sale year fires IRMAA and the ACA cliff on its own.** Both are already
  modelled. A sale can cost far more than its capital gains tax, and this is
  the most valuable thing the integration would surface. Saved plans will move.
- **Monte Carlo runs 10,000 times.** Holdings would be deterministic overlays
  at first, so property growth is certain while markets are not. Defensible,
  but it has to be said on the page rather than left implicit.

### The four phases

| Phase | What | Gated on |
| --- | --- | --- |
| 1 | Income only, no sales | `simulate(inputs, register)`; per-age series carrying cash and taxable apart; age-aware `annualIncome` |
| 2 | Costs and liability payments | the double-count decision; nominal vs real |
| 3 | Sales | the year solved to a fixed point, as health cover already is |
| 4 | NIIT and self-employment tax | a character field on `annualIncome`; an SE module that does not exist |

Phase 1 leaves the loop open, so it needs no fixed point and earns its keep
soonest. Phase 3 is where the app starts saying something a reader cannot work
out themselves — a sale year that costs three years of Medicare surcharge is
genuinely hard to see coming.

### Decisions needed before phase 1

1. Does "Other monthly income" survive as a field, become derived and
   read-only, or keep a typed figure beside a derived one?
2. Do costs and debt payments get charged? If so, does
   `monthlyRetirementSpending` change meaning to "everything except what is in
   Assets & liabilities"?
3. Do sale proceeds land in the brokerage, or does the reader choose?

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

---

## 9. The admin surface

`/admin` holds support tools that read other people's finances:
`lookupPlansByEmail` and `getPlanForAdmin` in `app/actions/admin.ts` return
another account's plans by email address. Everything below follows from that
one fact.

### What guards it, and where

- **An env allowlist, not a role column.** `ADMIN_EMAILS` in `lib/admin.ts`.
  A role in the database is one bad UPDATE away from being granted to whoever
  asks for it; this list changes only on the server, by someone with deploy
  access. It fails closed — unset means nobody is an admin, including you.
- **The gate runs in the layout *and* in all five server actions.** This is the
  part that is easy to get wrong. A layout guards what it renders; a server
  action is an endpoint anyone can post to, whatever page it was written for.
  Any new action in `app/actions/admin.ts` needs its own `requireAdmin()` — do
  not rely on it being reachable only from a guarded page.
- `noindex, nofollow, nocache` and `force-dynamic` on the layout, and nothing
  in the product chrome links here.

### One refusal, not two — changed 2026-08-27

`requireAdmin` used to redirect the signed-out case to `/sign-in?next=/admin`
and 404 only the signed-in-but-not-allowlisted case. Now everything that is not
a signed-in admin gets the same 404.

The redirect was the last thing on these pages that answered a stranger's
question: it confirmed that something lives at that path and wants a session,
where a 404 says nothing at all. Giving it up costs an admin close to nothing
*here specifically* — `rememberMe: false` in `components/auth-form.tsx` leaves
the session cookie without an expiry of its own, so it ends with the browser and
an admin signs in on essentially every visit regardless. The redirect saved one
step, once per session, for the two or three people on the list. A bookmark to
`/sign-in?next=/admin` gets that step back privately; the `next` param is
already constrained to same-site paths in `auth-form.tsx`, so it cannot be bent
into an open redirect.

The `returnTo` argument died with the redirect and was removed from the three
call sites that passed one.

**Do not "improve" this by moving the route to a secret path.** That is
obscurity standing in for a gate that already works, and secret URLs leak —
`Referer` headers, browser history, server and CDN logs, error reports, anything
pasted into a ticket. The 404 is the whole mechanism.

### Open task: 2FA for admins

The route being quiet is worth much less than this. A phished admin password
gives up every user's financial data, and how guessable the URL was does not
enter into it. Better Auth 1.7.1 ships `twoFactor` / `twoFactorClient` from
`better-auth/plugins`; both are present, nothing needs installing.

1. `twoFactor({ issuer: 'Fairwater' })` in the `plugins` array in `lib/auth.ts`.
2. Schema: the plugin adds a `twoFactor` table and `user.twoFactorEnabled`. Add
   it to `lib/db/schema.ts` with `onDelete: 'cascade'` on its `userId`, matching
   the other four tables, then `db:push`.
3. `twoFactorClient()` on the client.
4. **The sign-in form is the actual work.** With 2FA on, `signIn.email` stops
   returning a session and returns `twoFactorRedirect: true`; the session exists
   only after `twoFactor.verifyTotp({ code })`. `components/auth-form.tsx`
   assumes sign-in either fails or yields a session, so it needs a second state
   and the `next` routing deferred until after verification. 60–100 lines. Pass
   `trustDevice: false` — "remember this device" contradicts the `rememberMe:
   false` stance the app already takes everywhere else.
5. `requireAdmin` grows a third outcome: allowlisted and enrolled → through;
   allowlisted but not enrolled → redirect to an enrolment page; everything else
   → 404. That reintroduces a redirect, but only for someone who has already
   proven they are an admin, so it leaks nothing.

Two traps, both of which lock you out of your own support tools:

- **Ship the enrolment page in the same deploy as the requirement, or before
  it.** If `requireAdmin` starts demanding `twoFactorEnabled` while nobody has
  enrolled, every admin is locked out and the only way back in is another
  deploy.
- **Show the backup codes once, at enrolment, and mean it.** A lost phone with
  no backup codes is a permanent lockout; recovery would be an env change plus a
  redeploy.

Note that `twoFactorEnabled` is account-wide, not admin-scoped — once enrolled,
ordinary sign-ins want the code too. That is correct: the account can read every
user's finances either way.

### Before launch

Confirm `ADMIN_EMAILS` is actually set in the Vercel production environment. It
fails safe if missing, but "safe" here means locked out of the support tools
with no way in short of a deploy. It belongs with the other origin-sensitive
variables that have to be right before the first real deploy: `BETTER_AUTH_URL`,
`NEXT_PUBLIC_SITE_URL` and `ANALYTICS_EXCLUDE_IPS` (see `docs/deploy-vercel.md`).
