# Harborlight vs Boldin

**Rewritten 24 August 2026**, one day after the first version. Boldin ships
changes weekly and [their release notes][releases] move faster than this file
will, so treat every claim about them as true on 23 August and check before
relying on it. Claims about Harborlight were taken from the code and from
running it — `lib/rmd.ts`, `lib/irmaa.ts`, `lib/aca.ts`, `lib/conversions.ts` —
not from memory, and go stale the same way.

Boldin was NewRetirement until 2024. Sources are linked throughout; the
paid tier is [PlannerPlus, $12/month or $144/year][pricing].

---

## The short version

Boldin models the whole balance sheet. We model the savings-and-tax core in
more depth than they do, and we explain it better.

The first version of this file said we were *"a very good retirement tax and
withdrawal calculator, not yet a retirement plan"*. Half of that was generous:
the tax core had four things wrong with it that no test would have caught. The
other half still stands, and it is the honest position today:

**We are a genuinely complete retirement tax engine, wrapped in a plan that
models only one side of the balance sheet.**

---

## What changed since the first version

Seven of the ten gaps that version listed are closed, including both of the two
risks it singled out. Four bugs it did not know about are fixed.

| | Then | Now |
|---|---|---|
| Required minimum distributions | **not modelled, and not on the list** | Full Uniform Lifetime Table, 73–120 |
| Medicare surcharge (IRMAA) | Nothing at all | Six tiers, two-year lookback, charged per person |
| ACA subsidy before 65 | Nothing at all | 400% cliff, IRS applicable-percentage table, CMS age curve |
| Roth conversion amount | Suggests a window, computes no amount | Solves for it against tax **and** both healthcare costs |
| 10% early-withdrawal penalty | Named in the tax tab, not charged | Charged, inside the fixed point |
| HSA | Named in insight prose | A fourth pot, drawn before the Roth |
| Employer match | Named in insight prose | Computed, and names what is being left behind |
| Plans that run out of money | **reported as lasting** | Reported at the year they fail, with the size of the gap |
| Withdrawals from empty accounts | **charted and taxed** | Capped at what the pots hold |

There were 0 tests when the first version was written. There are now **224
across 8 files**.

---

## Where we are strong

### 1. Explanation, which is still the real differentiator

Most planners hand over a number. The tax tab shows the derivation, and every
figure reconciles to the one it ends on:

> $334,641 comes out of the brokerage. Social Security puts $36,873 of ordinary
> income beside it. The $16,100 standard deduction leaves $20,773 in the
> brackets, at $2,245. The gain stacks on top of that, so the first $28,677
> falls in the 0% capital-gains band and the rest meets 15%, at $15,777. That
> is $18,022 against the $334,641 withdrawn, or 5.4%.

$2,245 + $15,777 = $18,022. A reader can check it by hand, and a test now does
— that example is pinned in `lib/tax.test.ts`.

The same standard is applied everywhere else added since: eleven explanatory
panels across the input sections and the result tiles, each naming its fields
rather than running as prose, and each spelling out the acronyms — COLA, RMD,
nominal, cost basis, volatility.

### 2. The conversion decision, priced on all three costs

Healthcare is what Boldin markets hardest — ["the number most plans miss by
six figures"][healthcare] — and their conversion tool
[caps a conversion at a chosen IRMAA bracket][irmaa]. Ours
solves for the amount that costs least once income tax, the Medicare surcharge
and the ACA subsidy are counted together, and shows the whole ladder rather
than the winning row:

```
Move each year   Total tax   Medicare/yr   ACA premiums/yr
Nothing           $269,085        $2,844              $755
$10,000           $239,584          none            $2,131
$20,000           $222,982          none            $3,794
$30,000           $217,462          none            $5,250   ← cheapest
$45,000           $251,195        $1,750           $13,728   ← subsidy lost
All of it         $441,584          none            $5,431   ← subsidy lost
```

The `$45,000` row is the point. On income tax alone it looks defensible. It
crosses 400% of the poverty line, gives up **$13,407 a year** of premium
subsidy, and its all-in cost jumps rather than climbs. A test asserts the
recommended amount can never be one that crosses.

That is the risk the first version of this file called *"the one to fix
first"*. Boldin write about it too — [unsubsidised premiums for a 62-year-old
run $1,000–1,800 a month][roth-aca] — and it is now not merely disclosed on
our side but ranked on.

### 3. Required distributions, and what they cost

The tell that they were missing: before this work, the default plan and a plan
holding **$3,000,000** in a 401(k) both reported lifetime tax of exactly
$45,002, because withdrawals were sized to spending and nothing forced the
balance out. Today they report **$237,249** and **$7,552,963**.

Distributions are taken against the prior year's closing balance, the surplus
above what the year needs is taxed and moved to the brokerage, and the yearly
table carries an `RMD`, `Surplus` and `Medicare` column that appear only for
plans that have them.

### 4. Per-account tax treatment, worked out per year

- Brokerage: only the gain share, at capital-gains rates, **stacked on ordinary
  income** rather than priced separately
- 401(k) and traditional IRA: ordinary income in full, with a required
  distribution floor from 73 or 75
- Roth: not taxed, drawn last, never forced out
- HSA: not taxed, drawn before the Roth, never forced out
- Solved as a fixed point each year, because the tax depends on the withdrawal
  and the withdrawal depends on the tax — now including the 10% penalty, so a
  plan retiring at 55 shows 18.3% against 7.8% from 60

### 5. Social Security depth

Claim-age factors 62→70, spousal benefits with deemed filing, COLA drift
against the plan's own inflation rate, and Pub 915 provisional-income taxation.
State tax on the benefit is now decided by the household's income against each
of the eight states' limits, rather than by the state alone — most retirees in
those states are exempt, and we used to charge all of them.

### 6. Tables that do not quietly go stale

The first version called the hand-entered 2026 constants a structural risk and
proposed three fixes in ascending cost. All three effects are in:

- Federal brackets, capital-gains bands, IRMAA tiers and ACA figures are keyed
  by year, so adding 2027 leaves 2026 where it is rather than overwriting it
- Past the last year entered, tables roll forward by indexation and are marked
  `estimated`, which the tax tab tells the reader — thresholds index,
  statutory rates do not, and Medicare premiums index faster than CPI
- Three staleness guards fail the build once the calendar passes the figures,
  with a message naming what to update

### 7. Free, no account, no card, and private

The planner works signed out. The projection and the 10,000 simulations run in
the browser. No account linking means no bank credentials to hand over.

---

## Where we fall short

Ranked by how much it matters. This is a shorter list than it was.

| Gap | Boldin | Harborlight |
|---|---|---|
| **Home equity / real estate** | Modelled, with drawdown strategies | **Absent — and it is most retirees' largest asset** |
| **Long-term care** | Modelled | Absent. It is a line in the expense estimator, which is not the same thing |
| **Debt / mortgage** | Modelled | Absent, same caveat |
| **Survivor benefits** | Modelled | Built, then deliberately parked — see below |
| **Asset allocation / glide path** | Yes | One return and volatility for the whole plan |
| **Account linking** | Yes | No — deliberate, but still a gap |
| Reports, export, advisor access, classes | Yes | None |

Everything above the line in the old table — healthcare, the conversion
optimiser, the HSA, the match, the penalty — has moved to the other list.

---

## What we know is approximate, and say so

Nothing on the page now claims a rule the arithmetic does not follow. What
remains is stated in the app itself, with the direction of the error:

- **ACA benchmark premiums** use the national average for the household's age.
  Real premiums vary by rating area, sometimes by half. The gap between rows is
  reliable; the absolute figure is not, and the app says so.
- **State credits and exemptions** are not modelled — only brackets and the
  standard deduction. State figures err high, and highest for the lowest
  incomes. Shown in the tax tab and in the Taxes input panel.
- **The eight states' Social Security limits** are modelled as a clean line.
  Several taper across a band, so a household just over the line is charged
  slightly more here than it would be.
- **The first two Medicare years** are set by income at 63 and 64, which the
  projection does not model as salary — so they are understated for a high
  earner retiring at 65.
- **Married filing separately** is not representable; such a filer is treated
  as single, which understates IRMAA.

---

## Survivor benefits: built, then parked

This is the largest thing still missing, and it is missing on purpose.

When one of a couple dies the survivor keeps the larger of the two Social
Security benefits and loses the smaller outright, and from then on files
single — half the brackets, half the standard deduction, half the Medicare
thresholds. Income falls and the rate charged on it rises, in the same year.

It was built and measured: on a couple with $3,000 and $1,600 monthly benefits,
widowed at 78, it was worth about **$42,000 of extra lifetime tax**. It was then
taken back out, to be returned to deliberately rather than shipped
half-considered. `PlanInputs.survivorFromAge` and its database column are
carried and ignored, so turning it on is a change to `simulate` alone — no
migration, no saved plan needing re-entry. The note above `simulate` records
the one thing that is easy to get wrong: the benefit cut and the filing-status
change have to arrive together, or the model captures a fall in income and
misses most of the cost.

---

## What we are not competing on

Boldin sells classes, weekly live events, community and advisor access. That is
a different business, not a feature gap, and matching it would mean becoming a
different company. Worth being deliberate about rather than drifting into.

---

## Where that leaves us

On the decisions that dominate a tax-aware retirement — when to convert, how
much, what it does to Medicare and to health cover before 65, and what the
distributions will force out later — we are now more complete than Boldin, and
we show the working.

On the balance sheet we are not close, and the house is the gap that matters.

The position remains *the planner that shows its work*. What changed is that
the working is now worth showing.

[pricing]: https://www.boldin.com/retirement/pricing/
[healthcare]: https://www.boldin.com/retirement/sp-plp-ob-healthcare/
[irmaa]: https://help.boldin.com/en/articles/12067360-boldin-s-irmaa-bracket-limit-roth-conversion-strategy
[roth-aca]: https://www.boldin.com/retirement/roth-conversion-irmaa-aca-costs/
[releases]: https://www.boldin.com/retirement/release-notes/
