# Harborlight vs Boldin

**Written 23 August 2026.** Boldin ships changes weekly and their release notes
move faster than this file will, so treat every claim about them as true on
that date and check before relying on it. Claims about Harborlight were taken
from the code — `PlanInputs`, `lib/tax.ts`, `lib/insights.ts` — not from
memory, and go stale the same way.

Boldin was NewRetirement until 2024. Sources are linked throughout; the
paid tier is [PlannerPlus, $12/month or $144/year][pricing].

---

## The short version

Boldin models the whole balance sheet. We model the savings-and-tax core, and
we explain it better than they do.

That is a defensible position — *the planner that shows its work* — but it is
narrower. Said plainly: **we are a very good retirement tax and withdrawal
calculator, not yet a retirement plan.**

---

## Where we are strong

### 1. Explanation, which is the real differentiator

Most planners hand over a number. The tax tab shows the derivation, and every
figure reconciles to the one it ends on:

> $334,641 comes out of the brokerage. Social Security puts $36,873 of ordinary
> income beside it. The $16,100 standard deduction leaves $20,773 in the
> brackets, at $2,245. The gain stacks on top of that, so the first $28,677
> falls in the 0% capital-gains band and the rest meets 15%, at $15,777. That
> is $18,022 against the $334,641 withdrawn, or 5.4%.

$2,245 + $15,777 = $18,022. A reader can check it by hand. The audit asserts
that the pieces add to the total rather than trusting that they do.

### 2. Per-account tax treatment, worked out per year

- Brokerage: only the gain share, at capital-gains rates, **stacked on ordinary
  income** rather than priced separately
- 401(k) and traditional IRA: ordinary income in full
- Roth: not taxed
- Solved as a fixed point each year, because the tax depends on the withdrawal
  and the withdrawal depends on the tax

### 3. Social Security depth

Claim-age factors 62→70, spousal benefits with deemed filing, COLA drift
against the plan's own inflation rate, and Pub 915 provisional-income taxation.
Two spouses claiming on different dates splits retirement into separate tax
stretches — more granular than most consumer tools.

### 4. Free, no account, no card

The planner works signed out. An account exists only to save and compare plans.

### 5. Privacy

The projection and the 10,000 simulations run in the browser. No account
linking means no bank credentials to hand over.

---

## Where we fall short

Ranked by how much it matters.

| Gap | Boldin | Harborlight |
|---|---|---|
| **Healthcare / ACA / Medicare / IRMAA** | Core feature, marketed as ["the number most plans miss by six figures"][healthcare] | **Nothing at all** |
| **Roth conversion optimiser** | [Solves for the amount, capped at a chosen IRMAA bracket][irmaa] | Suggests the window; computes no amount |
| **Home equity / real estate** | Modelled, with drawdown strategies | Absent — and it is most retirees' largest asset |
| **Long-term care** | Modelled | Absent |
| **Debt / mortgage** | Modelled | Absent |
| **Account linking** | Yes | No — deliberate, but still a gap |
| **HSA, employer match** | Modelled | **Named in insight prose, not computed** |
| **Asset allocation / glide path** | Yes | One return and volatility for the whole plan |
| **10% early-withdrawal penalty** | Charged | **Named in the tax tab, not charged** |
| Reports, export, advisor access, classes | Yes | None |

---

## The gap that is a correctness risk, not just a missing feature

**Our Roth conversion advice is incomplete in a way that can cost someone
money.**

We tell people the stretch between 59½ and claiming Social Security is the
cheap time to convert. On income tax alone that is right. But a conversion in
that window can:

- blow through an **ACA subsidy cliff** — unsubsidised premiums for a
  62-year-old run [$1,000–1,800 a month][roth-aca] — or
- push the household into a higher **IRMAA tier two years later**

Boldin's entire conversion tool is built around that constraint. We give the
advice without it.

This is the one to fix first. Not because ACA modelling is easy, but because
we are currently confident about a recommendation whose main downside we do not
model. A tool that shows its work owes the reader the part that argues against
it.

---

## A structural risk worth naming

`FEDERAL`, `CAPITAL_GAINS` and the standard deductions in `lib/tax.ts` are
**2026 constants with no update path**. Boldin ships law changes as they land —
they [corrected IRMAA filing-status handling in February 2026][releases].

Ours will go stale on 1 January and nothing will complain. Options, cheapest
first:

1. A test that fails once the current year passes the bracket year, so it
   becomes loud rather than silent
2. Bracket tables keyed by year, with the year chosen from the clock
3. Pulling the figures from a maintained source at build time

Option 1 costs almost nothing and converts a silent wrong answer into a failing
build. Worth doing regardless of the others.

---

## What we are not competing on

Boldin sells classes, weekly live events, community and advisor access. That is
a different business, not a feature gap, and matching it would mean becoming a
different company. Worth being deliberate about rather than drifting into.

[pricing]: https://www.boldin.com/retirement/pricing/
[healthcare]: https://www.boldin.com/retirement/sp-plp-ob-healthcare/
[irmaa]: https://help.boldin.com/en/articles/12067360-boldin-s-irmaa-bracket-limit-roth-conversion-strategy
[roth-aca]: https://www.boldin.com/retirement/roth-conversion-irmaa-aca-costs/
[releases]: https://www.boldin.com/retirement/release-notes/
