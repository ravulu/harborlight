# Keeping the published figures current

**Written 2026-08-28, before any of it is built.** A design to argue with.

The goal: when the government publishes a new year's figures, this app should
carry them quickly and visibly, rather than depending on somebody remembering
six dates a year.

---

## 1. The thing that cannot be had, said first

**There is no machine-readable government feed for most of this.** The IRS
publishes the annual inflation adjustments as a Revenue Procedure — a PDF. CMS
announces the Part B premium and the IRMAA tiers in a press release. HHS
publishes the poverty guidelines as a notice. State brackets are collected by
the Tax Foundation as an article.

So "fetch it as they publish it" cannot mean fetch and apply. It has to mean
**notice, propose, and confirm**, and the difference is the whole design.

The one genuinely structured source is the **Federal Register API**
(`federalregister.gov/api/v1`) — free, JSON, searchable by agency and date. It
covers the HHS poverty guidelines and several CMS notices. It does not cover
IRS Revenue Procedures, which is where most of the numbers are.

---

## 2. Why the numbers are not applied automatically

A scraper that silently misreads one bracket boundary changes every projection
this app produces, for everybody, and nothing on the screen looks wrong. That
is the exact failure this codebase is built to refuse — the staleness guards in
`lib/tax.ts` and `lib/irmaa.ts` exist to turn a quietly wrong answer into a
failing build, and auto-applying scraped figures would invert that trade.

It is also the wrong risk to take for the saving. Transcribing a new IRS table
is perhaps thirty minutes a year. **Remembering that it was published is the
part people actually fail at**, and that is the part worth automating.

So: automate the noticing, keep a human on the numbers.

---

## 3. Build-time data, not a runtime feed

The tables ship in the bundle, as they do now. Not fetched at request time,
and not read from a service.

**Reproducibility is the reason, and it is already a decided principle.**
`IRMAA_TABLES` is additive precisely so that "a plan run today and the same
plan reopened in five years still agree about what 2026 charged" — the
alternative was "one table, overwritten each year", which "quietly rewrites
history every time it is updated". A live feed is that overwrite with a network
call in front of it.

Three more reasons, each sufficient on its own:

- **The engine runs in the browser.** The projection and the ten thousand
  simulations are computed on the reader's own machine, so the tables have to
  reach the client regardless. A server-side feed would only add a hop.
- **A tax engine with a network dependency has a new failure mode**: two page
  loads returning different answers, and no way for the reader to tell which
  they got.
- **The data is tiny.** Six tables of a few dozen numbers. There is nothing to
  optimise.

---

## 4. The data model is already right

Worth saying plainly, because it is the expensive part and it is done.

`TAX_TABLES`, `IRMAA_TABLES` and their `*_YEAR` constants are **keyed by year
and additive**: adding 2027 leaves 2026 exactly where it is. `taxTableFor` and
`irmaaTableFor` pick the newest table at or before the year asked for, and roll
the last one forward with `estimated: true` past the end. The staleness tests
fail on 1 January and name what to add.

Ingestion therefore has one job: **append a year and move a constant.** No
migration, no rewrite, no reconciliation. Everything below is about getting a
correct patch in front of a person.

Two tables do not fit this shape yet and should be brought into it first —
`lib/state-tax.ts` has no year constant, no guard and no test file, and the HSA
limits are hardcoded inside prose in `lib/insights.ts`.

---

## 5. The cadence is six windows, not one January job

Approximate, from the ordinary publication rhythm — **each needs confirming
against the source rather than trusted from this table**, which is exactly the
kind of claim this document is otherwise about not making.

| Figures | Publisher | Roughly when | Form |
| --- | --- | --- | --- |
| Federal brackets, standard deduction, capital-gains bands | IRS annual inflation Rev. Proc. | Oct–Nov, for the following year | PDF + newsroom page |
| Social Security COLA, wage base | SSA | Mid-October | HTML |
| Part B standard premium, IRMAA tiers | CMS | November | Press release, Federal Register |
| Federal poverty guidelines | HHS / ASPE | January | Federal Register (**has an API**) |
| ACA applicable-percentage table | IRS Rev. Proc. | Summer, for the following year | PDF |
| ACA benchmark premium | CMS / KFF | October, with open enrolment | Data files |
| HSA contribution limits | IRS Rev. Proc. | May | PDF |
| State brackets and standard deductions | Tax Foundation, state DORs | January–February | HTML |

The spread is the argument for automation. One date is a calendar reminder;
eight dates across four agencies is a job nobody does reliably.

---

## 6. Three layers

### Layer 1 — Watch. Automated, and it touches no numbers.

A scheduled job — a GitHub Action on a weekly cron is the obvious home, since
there is no CI in this repo at all yet — that asks one question per source:
**has a document appeared that this build does not have a table for?**

Two mechanisms, no parsing:

- **Federal Register API** for what it covers: query by agency and document
  type since the last check.
- **Fetch and hash** the landing page for the rest. A changed hash on the IRS
  inflation-adjustments page is not proof of a new Rev. Proc., but it is a
  reliable prompt to go and look.

Output is an issue, not a commit: *"CMS appears to have published something new;
`IRMAA_YEAR` is 2026; here is the link."* False positives are cheap and
tolerable. A missed publication is the failure this exists to prevent.

### Layer 2 — Propose. Automated extraction, offered as a diff.

**Built 2026-08-28 for one source**, the HHS poverty guidelines —
`cron-jobs/propose-figures.mts` and `cron-jobs/extract/`. It is the only one of
the five served as plain text rather than a PDF or a third party's article,
which is why it went first. Two things learned building it, both of which
belong in any extractor that follows:

**Verify a parser by making it reproduce a table a person already checked.**
Next year's document does not exist, so it cannot be tested against. The
January 2025 notice can be, and the parser is required to produce exactly the
$15,650 and $5,500 that `lib/aca.ts` holds. The test runs in both directions:
it also fails if the table is hand-edited wrongly.

**Derive a figure twice where the document states it twice.** The notice gives
the per-person increment in prose *and* implies it in the eight rows of the
table. Deriving it from the rows and requiring all seven steps to agree turns
one number into a check on the whole table — a single misread digit fails it,
where a prose read would have sailed through.

And one trap worth naming loudly: **cover for year N is priced against the
guidelines published in January of N−1.** An extractor offering the newest
document for the current year would be a year early, every year, and the error
would look exactly like a correct update.

For sources structured enough to parse, a script produces a **candidate patch**
— `TAX_TABLES[2027] = { … }` — and opens a pull request with the source URL,
the document date, and a diff against the previous year.

The extractor must refuse rather than guess:

- The year it extracted must be **greater** than the newest stored year.
  Re-reading last year's document and proposing it as new is the most likely
  silent failure.
- Brackets must be **monotonic and non-overlapping**, rates within a sane band,
  standard deductions within a plausible multiple of the previous year.
- A figure that moves more than some percent from the prior year is not
  rejected — indexation is not always small — but it is **flagged in the PR
  body** so the reviewer looks hardest where it matters.
- Any parse failure produces an issue, never a partial table.

### Layer 3 — Confirm. A person, always.

Somebody checks the proposed numbers against the primary document and merges.
The existing staleness tests go green because the new year is present. That is
the whole ceremony.

**This layer is not optional and should not be optimised away.** It is thirty
minutes, once, against the risk of being confidently wrong about everybody's
tax for a year.

---

## 7. Provenance should become a field, not a comment

Today `lib/irmaa.ts` and `lib/aca.ts` cite their sources in comments;
`lib/tax.ts`, `lib/state-tax.ts` and `lib/rmd.ts` cite nothing.

Each table should instead carry, in the data:

```ts
source: {
  title: 'Rev. Proc. 2025-32',
  url: 'https://www.irs.gov/pub/irs-drop/rp-25-32.pdf',
  published: '2025-10-09',
  confirmedBy: 'ravulu@gmail.com',
  confirmedOn: '2025-10-11',
}
```

Three things follow, and the third is the reason to do it:

1. The watcher can compare what it found against what is stored, rather than
   against a hand-maintained list of dates.
2. A reviewer can see at a glance which tables were confirmed and when.
3. **The app can show it.** This is a product whose stated differentiator is
   that it explains its own figures and names its own approximations. *"2027
   brackets, from IRS Rev. Proc. 2026-xx, confirmed 11 November"* — beside an
   `estimated` badge where a table is a projection rather than a publication —
   is the same promise applied to its own inputs. Nothing else in this market
   does it.

---

## 8. What this does not solve

- **The ACA benchmark premium is a market price, not an indexation.** It cannot
  be projected forward the way brackets can, which is why `lib/aca.ts` has a
  year constant and no roll-forward. Automation can notice a new one; it cannot
  invent one. Whether the app should project it at all is a separate decision.
- **State brackets are fifty separate answers** from fifty publishers, collected
  by a third party whose format can change. This is the least automatable row in
  the table and the most tedious to confirm.
- **Mid-year changes.** Legislation does not respect the annual cycle; a bill
  can change a bracket in July. The watcher notices documents, not statutes, and
  nothing here replaces reading the news.

---

## 9. Build order

**Steps 1 to 4 are built as of 2026-08-28**, step 4 for one source of five.
What follows is the order they were done in and what remains.

1. **Close the two gaps first** — `STATE_TAX_YEAR` with the guard the other
   three carry, and the HSA limits out of prose into a dated constant. Until
   every annually-updated table shouts on 1 January, automation is decorating a
   floor with a hole in it.
2. **Provenance as a field**, on the tables that already have citations, then
   the ones that do not.
3. **Layer 1 watchers**, starting with the Federal Register API, which is the
   only source that is genuinely structured. A GitHub Action and an issue.
4. **Layer 2 extraction**, one source at a time, easiest first — SSA's COLA is a
   single number on an HTML page; the IRS Rev. Proc. PDF is the hardest.
5. **Show provenance in the app**, once there is something worth showing.

Steps 1 and 2 are worth doing whatever happens to the rest: they are what turn
"somebody should check" into "the build says so".

---

## 10. Open questions

1. **Where does the cron live** — GitHub Actions, or a scheduled cloud agent?
   Actions is free, sits with the code, and can open its own PR.
2. **Should ACA roll forward** past its year like tax and IRMAA do, or is
   refusing to guess a benchmark premium the more honest failure? Currently it
   refuses, and the guard is the only thing that says so.
3. **How loud should a stale table be to the reader**, as opposed to the build?
   Today `estimated` is carried in the data and surfaced in places. A table
   nobody has confirmed for fourteen months is arguably something the page
   should say out loud.
