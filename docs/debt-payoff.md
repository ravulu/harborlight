# Debt payoff: snowball and avalanche

**Written 2026-08-28, before any of it is built.** A design to argue with.

Two surfaces, one engine: a standalone calculator for somebody who arrived from
a search wanting an answer in a minute, and the same thing in place on Assets &
liabilities for somebody who has already entered their debts and wants to try
scenarios.

---

## 1. Most of the inputs already exist

| | Where |
| --- | --- |
| `Liability` — balance, rate, monthly payment, five kinds | `lib/liabilities.ts` |
| Entry UI, already showing each debt's payoff | `components/holdings/liabilities-list.tsx` |
| Single-debt amortisation, **including the never-clears case** | `payoff()` |
| Totals | `totalOwed`, `totalMonthlyPayments`, `annualInterest` |
| Storage, per plan, with a foreign key | `liabilities` table |

`payoff()` already gets right the thing most calculators get wrong: a payment
at or below the monthly interest returns *never* rather than a number in the
hundreds. Minimum payments on a card sit close to that line by design.

---

## 2. What is actually new: the rollover

`payoff()` prices one debt alone. Snowball and avalanche are about what happens
to the **others**.

Pay the minimum on everything, put the surplus against one target, and when
that target clears, **its whole payment rolls into the next**. That compounding
rollover is the mechanism, it is what makes either method beat paying minimums,
and none of it exists today.

```
order:      snowball → smallest balance first
            avalanche → highest rate first
each month: charge interest, pay minimums, put the surplus on the target,
            clear anything that reaches zero, roll its payment forward
```

A month-by-month loop rather than a closed form, because the order changes as
debts clear and there is no formula for that. Roughly 150 lines.

**One new input: the monthly budget.** Everything else is already entered.
Below the sum of the minimums there is no surplus and the two methods are
identical — refuse that plainly rather than showing two identical answers,
which reads as a broken calculator.

---

## 3. The two surfaces, and the mistake to avoid

**The one on Assets & liabilities must not be a link to the other page.**
Somebody who has already entered every debt would arrive at a blank form and
type them again — the worst outcome for exactly the reader it is meant to
serve.

It is the **same component**, rendered in place, seeded from
`register.liabilities`. Standalone gets empty state and its own inputs; the
register surface gets the debts already there. The affordance reads as a
disclosure — *"see how fast these clear"* — not as somewhere to go.

`/goal` is the precedent for the standalone half: its own metadata and
keywords, a calculation that stores nothing, and a link that carries the answer
into the planner while recording `goal_handoff`.

---

## 4. One engine, one owner of the data

The risk in two surfaces is two copies of the same debts giving two answers.
This codebase has been bitten by that more than once — the register wipe, the
household blanking, and §3c's warning about "two stores that happen to agree".
So, the same shape that worked for persistence:

- **`lib/debt-payoff.ts`** is pure. It takes `Liability[]` and a budget and
  returns both schedules. It never learns where the debts came from.
- **The register owns the data.** The in-place surface reads it directly. No
  copy, no synchronisation, nothing to drift.
- **The standalone page stores nothing.** Figures live in the page and a
  refresh clears them — the rule `lib/holdings-store.ts` already states for a
  signed-out balance sheet, for the same reason.
- **Handoff runs one way only**: standalone → register, *"carry these into my
  plan"*. Never the reverse, because the reverse is the second store.

---

## 5. It names no winner

`lib/windows.test.ts` fails the build on `you should`, `we recommend`,
`the best`, `is best`. That is house style and it is enforced, so this is a
constraint to design to rather than discover.

Avalanche always wins on interest. Snowball usually wins on **first debt
cleared**, which is the whole reason people choose it. Report both and let the
reader decide:

> Avalanche clears everything 14 months sooner and pays $3,200 less interest.
> Snowball clears your first debt 9 months sooner.

Same treatment as the claiming and conversion ladders: every option priced, no
winner named, and the figure that would change the answer stated.

---

## 6. The monthly payment on a mortgage

A `Liability` has a `monthlyPayment`. A mortgage on a `Holding` has a balance
and a rate and **no payment**, so it cannot be amortised — which is why secured
debt cannot appear in this calculator today.

### The trap, and it is a real one

`annualCosts` and `annualIncome` use mortgage **interest, not payment**, on
purpose:

> The principal repaid alongside it is money moving from one pocket to another
> — it leaves the account and arrives as equity — so counting it as a cost
> would report a landlord poorer than they are.

That reasoning is right and the new field must not disturb it. **A payment is a
cash flow, not a cost.** So:

- `annualCosts` and `annualIncome` keep using interest. Unchanged. Untouched.
- The payment is a **new** figure, reported beside them, never folded into
  them.

### What it buys

Three things, which is why it is worth a schema change:

1. Secured debt can join the payoff calculator, which is the largest debt most
   households have.
2. The summary strip can report **what actually leaves the account each
   month** — a cash-out figure beside the upkeep figure. Those are different
   questions and today only one of them can be answered.
3. `payoff()` works on a mortgage, so a holding can say when it clears.

### Every place a field on `Holding` has to be added

Written out because the list is longer than it looks and missing one fails
quietly:

1. `lib/holdings.ts` — the `Holding` interface.
2. `lib/db/schema.ts` — the column, with a default.
3. `npm run db:push`, then **`npm run db:secure`** — the README is explicit
   that a push can clear row-level security on tables it did not touch.
4. `app/actions/balance-sheet.ts` — both `getPlanRegister` (read it back) and
   `savePlanRegister` (the `clean()` list). Miss either and the field saves but
   never returns, or returns but never saves.
5. `lib/store/normalise.ts` — `HOLDING_NUMBERS`, or the local store silently
   drops it.
6. `components/holdings/holdings-screen.tsx` — the input, beside the mortgage
   balance and rate.
7. Tests.

**No export format bump.** The envelope reads forgivingly — start from the
defaults, take only recognised keys — so a file written before this field loads
with it at zero, and one written after it loads in an older build without
failing. That is what that rule was for.

---

## 7. Steps

| # | Step | Effort |
| --- | --- | ---: |
| 1 | `lib/debt-payoff.ts` — ordering, the month loop, the rollover. Pure, no UI. | 1 day |
| 2 | `lib/debt-payoff.test.ts` — never-clears, budget below minimums, equal balances, zero-rate debt, single debt, and the reconciliation that both methods repay the same principal. | 1 day |
| 3 | The shared component — inputs, the two schedules, the comparison sentence. Rendered with debts passed in. | 2 days |
| 4 | `/debt-payoff` standalone page — metadata, keywords, sitemap entry, empty state, stores nothing. | half a day |
| 5 | In place on Assets & liabilities, seeded from `register.liabilities`. Same component. | half a day |
| 6 | Handoff standalone → register, plus `debt_answered` and `debt_handoff` in `lib/events.ts`, matching the goal pair. | half a day |
| 7 | `mortgageMonthlyPayment` on `Holding` — the seven places in §6. | 1 day |
| 8 | Secured debt in the calculator, and the cash-out line on the summary strip. | 1 day |

Steps 1–6 ship a working calculator on unsecured debt. **7 and 8 are separable
and should stay that way**: they are a schema change, and doing them after 1–6
means finding out whether anyone uses the thing before adding a column to a
live table.

---

## 8. Open questions

1. **Route and title.** `/debt-payoff`, titled "Debt Snowball Calculator" —
   snowball is the higher-volume search and avalanche is what people find
   second. Both in the keywords.
2. **Does the standalone page take a mortgage as a plain debt row?** It stores
   nothing and touches no register, so it could — which sidesteps step 7
   entirely for v1 and still answers the question people arrive with.
3. **Extra payments and windfalls.** A one-off lump against a debt changes the
   order. Out of scope for v1; worth knowing it is the first thing people ask
   for.
4. **Does it reach the projection?** No. `simulate` models contributions, not
   debt service, and wiring it in is §3e territory. Standalone, like the
   Savings Estimator.
