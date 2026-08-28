# Cron jobs

Scheduled work that is about the app rather than in it. One job today.

---

## `watch:figures` — has anybody published a new table?

Five figures in this app are published by somebody else on a schedule: federal
brackets, IRMAA, the ACA percentages and poverty line, state brackets, and the
HSA limits. They are hand-entered, and the failure everybody actually has is
not transcribing them wrongly — it is **not noticing they came out.**

This job notices. It does nothing else.

### Run it

```bash
npm run watch:figures            # report; exits 1 if anything wants a look
npm run watch:figures -- --accept   # record what is there now as seen
```

No environment, no database, no secrets. It reads `lib/published.ts` for what
this build holds, `cron-jobs/sources.ts` for where to look, and
`cron-jobs/state.json` for what was there last time.

### What it reports

**Tables the calendar has passed.** Straight from `staleTables()` — the same
list that fails the build in `lib/published.test.ts` and shows in red on
`/admin`. Three places, one source of truth.

**Sources that have moved.** Two mechanisms, neither of which reads a number:

- **Federal Register API** for IRMAA and the ACA poverty guidelines — free,
  JSON, and the only genuinely structured source among these. It asks for
  documents matching a term since the year this build already holds, and
  compares the newest document number against the one last accepted.
- **Fetch and hash** for the rest. A changed hash is *not* proof of a new
  Revenue Procedure — a footer date moves it too. It is a prompt to go and
  look, which is all this layer is for. False positives are cheap; a missed
  publication is what this exists to prevent.

**Sources it could not reach.** Reported separately and deliberately: a site
that does not answer is not a site that has published nothing. If one of these
stays unreachable the check has quietly stopped working, and the entry in
`sources.ts` needs a new address. That is not hypothetical — the first IRS
address tried here had the year in the URL, so it would have become a 404 at
exactly the moment it mattered and looked like a network problem.

### What it deliberately does not do

**It never reads a figure, and never writes to `lib/`.** A scraper that
misreads one bracket boundary changes every projection this app produces, for
everybody, and nothing on the screen looks wrong. The staleness guards exist to
turn a quietly wrong answer into a failing build; auto-applying scraped numbers
would invert that. Transcribing a table is thirty minutes a year. Remembering
it was published is the part people fail at, and that is the part automated
here.

`docs/tax-data-updates.md` is the full design, including the layers this does
not implement yet.

---

## `propose:figures` — read what can be read

```bash
npm run propose:figures      # print candidates; exits 1 if there are any
```

Layer 2. Where the watcher says *something changed*, this says *here are the
numbers, here are the lines they came from, and here is the patch*. It writes
nothing and opens no pull request — the third layer of the design is a person.

**One source today: the HHS poverty guidelines.** It is the only one of the
five served as plain text rather than a PDF or a third party's article, which
is why it was first. The others are listed at the end of the report so the gap
is visible rather than implied.

### What makes an extractor trustworthy

It has to reproduce a table somebody already checked by hand.

A parser can only be tried against documents that exist, and the one that
matters — next year's — does not. So it is pointed at the document the current
figures came from and required to produce those figures **exactly**:
`cron-jobs/extract/poverty-guidelines.test.ts` reads the January 2025 notice
from a saved fixture and asserts $15,650 and $5,500, which is what `lib/aca.ts`
holds. If it can read 2025 and get what a person got from 2025, it is worth
listening to about 2027. The same test fails if somebody hand-edits
`lib/aca.ts` wrongly, so it runs in both directions.

### The lag, which is the easiest thing to get wrong

Cover for year N is priced against guidelines published in **January of N−1**.
`ACA_YEAR = 2026` holds $15,650, and $15,650 is the *2025* figure. An extractor
that offered the newest document for the current year would be a year early,
every year, and the mistake would look exactly like a correct update.

### It refuses rather than guesses

The increment is **derived from the table** — every step between consecutive
household sizes must be identical — rather than read from the prose line that
also states it. One misread digit in one row fails that check; it would survive
a prose read. Beyond that it refuses an unrecognised heading, a table it could
not read to the end, and figures outside a plausible band, and there is no
shape it can return in which some fields are filled and others are not.

---

## When it fires

1. Read what it found and go to the **primary source** — the Revenue
   Procedure, the CMS announcement, the guidelines notice. Not a summary, and
   not this job's word for it.
2. If there are new figures, add the year **beside** the old one rather than
   over it: `TAX_TABLES[2027] = { … }`, then move `BRACKET_YEAR`. Adding a year
   is additive by design, so a plan run last year still agrees with itself
   about what last year charged.
3. Update the table's `source` so `/admin` and the watcher both know which
   document it came from.
4. Run `npm test`. The staleness guard goes green because the new year is
   present.
5. Record what is now there, and commit it:

   ```bash
   npm run watch:figures -- --accept
   ```

If there is nothing new — a page moved a footer, an unrelated notice matched —
accept it anyway. That is what tells the job that this state has been looked at
by a person.

**The first accept is a baseline, not a verification.** It records what was
there on the day, so later runs can report change. It does not mean anybody
checked the numbers.

---

## The schedule

`.github/workflows/watch-published.yml` runs it weekly and opens an issue when
it exits non-zero. Weekly rather than daily because none of these sources
changes faster than that, and a job that cries wolf every morning is a job
people filter.

To run it on a different schedule, or somewhere else, it is one `npx tsx`
invocation with no state outside this folder.
