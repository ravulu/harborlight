# Persistence modes: cloud or local

**Written 2026-08-28, before any of it is built.** Nothing here is implemented.
It is a design to argue with, not a description of the code.

The proposal: one deployment-time switch decides whether a household's figures
live in Postgres or in the reader's own browser, and the first public release
runs in local mode so that no customer financial data sits on a server we
operate.

---

## 1. What the modes are

| | `cloud` | `local` |
| --- | --- | --- |
| Plans, household, holdings, liabilities | Postgres, per account | `localStorage`, per browser |
| Accounts, sign-up | Better Auth | **absent** |
| Sign-in | linked in the header | **works, linked nowhere** — admins only |
| Saved plans, comparison | signed-in only | always available |
| Admin plan lookup by email | available | **refused** |
| Analytics, feedback | Postgres | Postgres, unchanged |

Local mode is not "signed-out cloud mode". Signed out today, nothing is kept at
all and a refresh clears the page; local mode keeps things deliberately, which
is a different promise and needs different words on the screen.

---

## 2. The switch itself

`NEXT_PUBLIC_PERSISTENCE=cloud|local`, read in exactly one module:

```ts
// lib/persistence.ts
export type PersistenceMode = 'cloud' | 'local'
export const MODE: PersistenceMode =
  process.env.NEXT_PUBLIC_PERSISTENCE === 'cloud' ? 'cloud' : 'local'
export const isLocal = MODE === 'local'
```

Three decisions in those four lines, and each is deliberate:

**`NEXT_PUBLIC_`, so the client can see it.** The store is chosen in the
browser as well as on the server, and a mode the client cannot read would have
to be threaded through every page as a prop.

**Inlined at build, so the mode cannot change under a running deployment.**
`NEXT_PUBLIC_*` values are baked in by `next build` — see the build-time note in
`docs/deploy-render.md`. Changing mode is a redeploy, which is the correct
weight for a decision about where people's finances live.

**Anything unrecognised is `local`.** The same direction `ADMIN_EMAILS` fails
in: a deployment that forgets the variable stores nothing on the server rather
than quietly storing everything. `lib/plan.ts` already coerces an unrecognised
stored `healthCoverBefore65` to a known value instead of trusting it; this is
the same habit applied to configuration. Worth a test, because the failure is
silent in the wrong direction if it is ever inverted.

Nothing else in the codebase reads the variable. One module, so a grep for the
mode finds every place that branches on it.

---

## 3. One canonical shape, two transports

The persistence surface today is eight functions: `getPlans`, `savePlan`,
`updatePlan`, `deletePlan` in `app/actions/plans.ts`, and `getHousehold`,
`saveHousehold`, `getPlanRegister`, `savePlanRegister` in
`app/actions/balance-sheet.ts`.

They become one interface with two implementations:

```ts
// lib/store/types.ts — as built, 2026-08-28
export interface PlanDraft {
  name: string
  personName: string
  inputs: PlanInputs
  register: Register
}

export interface PlanSummary extends Omit<PlanDraft, 'register'> {
  id: number
  updatedAt: string      // ISO 8601
}

export interface StoredPlan extends PlanSummary {
  register: Register
}

export interface PlanStore {
  list(): Promise<PlanSummary[]>
  get(id: number): Promise<StoredPlan | null>
  save(draft: PlanDraft): Promise<number>
  update(id: number, draft: PlanDraft, expectedUpdatedAt?: string): Promise<void>
  remove(id: number): Promise<void>
  getHousehold(): Promise<HouseholdFacts>
  saveHousehold(facts: HouseholdFacts): Promise<void>
}
```

Two refinements the build forced, both recorded here rather than left in the
code to be discovered:

**`list` returns summaries; `get` fetches the register.** A list carrying
registers is a query per plan against Postgres to fill a column nobody looks
at — and it is not how the planner reads today, which takes the list and then
`getPlanRegister` for the one plan being opened. The split keeps the cloud
store honest and costs the local store nothing.

**`update` takes what the caller believed it was editing.** Optional, so a save
the reader has already been shown a conflict for and chosen to force is still
one call. Only the local store enforces it; the cloud store accepts and ignores
it, which is a real gap — an account open in two browsers has the same race and
Postgres is not checking either — and is written down in `cloud.ts` rather than
hidden.

`lib/store/cloud.ts` wraps the existing server actions. `lib/store/local.ts`
reads and writes one `localStorage` key **per plan** — see §5.
`lib/store/index.ts` picks one from `MODE` and exports it as `store`.

Four properties this interface has to keep, each of which is a bug if it slips:

**Async in both modes.** `localStorage` is synchronous and it does not matter:
a store that is a promise in one mode and a value in the other makes every
caller branch, which is the thing the interface exists to prevent.

**`id: number` in both modes.** The cloud store's ids are the `integer` primary
key on `retirement_plans`. The local store hands out integers too, so nothing
downstream — the `?plan=` URL parameter, `savePlanRegister`'s `planId`, the
compare list — learns that ids can be strings in one deployment and numbers in
another.

**One normalisation, not two.** `lib/plan.ts` already converts between a stored
row and `PlanInputs`, coercing bad values rather than trusting them. The local
store uses those same functions. Two stores that normalise differently is how
one deployment ends up with a field the other silently drops.

**The register travels with the plan.** In the cloud that is two tables and a
foreign key; locally it is a nested object. Either way `save` takes both, so
the rule already decided in §3c of the engineering notes — that a saved plan
snapshots its assets and liabilities — holds in both modes without a second
decision.

### What this buys immediately

`PlanCompare` takes its plans as props and computes from them. It does not know
where they came from and will not have to: **comparison without signing in
falls out of the swap and needs no work of its own.** The same is true of
`SavedPlans` and of every projection surface, which read a `PlanInputs` and
have never known about the database.

---

## 4. What "Save" means locally, and what it should say

The button currently reads **Sign in to save** signed out, and the workspace
carries *"Not saved yet — ⌘S works too"* and *"Everything here is saved."*
None of that is true in local mode and one of them is dangerous.

The framing has to answer a specific objection, and it is our own.
`lib/holdings-store.ts` records why browser storage was removed:

> *"A browser that remembers somebody's house, their debts and their income
> shows all of it to whoever opens it next — a shared machine, a family laptop,
> a library."*

That finding has not stopped being true. Local mode is defensible only if the
reader knows the machine is keeping their figures and can undo it in one step.
So:

- **Button: "Save in this browser."** Not "Save", and — corrected
  2026-08-28, after somebody pressed it — not "Save on this device" either.
  "On this device" reads as *write a file onto my computer*, and the first
  person to press it went to look in their Downloads folder. It was wrong
  twice over: no file is made, and browser storage is per browser rather than
  per machine, so Chrome and Safari on one laptop do not share it. The
  disclosure now says outright that no file is made and points at the control
  that does make one, because the two sit next to each other and one of them
  is called "Download".
- **First save asks once.** An inline confirmation, not a modal, saying that
  the plan stays in this browser, that anyone who uses this browser can open
  it, and that it will not follow them to another computer. Once per browser,
  not once per save.
- **A standing "stored in this browser — forget" control** wherever a saved
  plan exists. `forgetBrowserCopies()` already exists and clears keys on sight; this
  is the same act, offered rather than automatic.
- **"Download a copy" is a separate, secondary action**, never the same button.
  Saving and exporting answer different questions and merging them into one
  control makes both ambiguous.

Storage can also be unavailable — private windows, blocked site data. The store
must **say so** rather than accept a save that silently did nothing.
`stashPending` already swallows this case deliberately; here it cannot be
swallowed, because the reader was told it was saved.

### Built 2026-08-28

All of the above, with one thing done differently and one addition.

**The consent is two presses of the same button, not a dialog.** The first
press changes the label to *"Yes — keep it in this browser"* and puts the
disclosure beside it; the second press saves. Nothing is written by the first
press — checked in the browser, not assumed. A dialog would be a thing to
dismiss, and dismissing is what people do to dialogs; changing what the button
says makes reading it the only way past it. Recorded in
`fairwater.v1.told`, so it is asked once per browser rather than once per save.

**Forgetting clears the consent flag too.** Somebody who has just taken
everything off this machine is asked again next time. The question was about
this browser and they answered it.

`components/planner/local-data.tsx` carries the three controls, and it sits
*above* the saved-plans list rather than inside it: importing is exactly what
somebody with no plans yet — a new laptop, a cleared browser — needs to find,
and a control that only appears once you have something is no use to them.

**`storageWorks` asks by writing and removing**, because Safari in a private
window exposes `localStorage` and throws on write. The presence of the object
proves nothing at all.

---

## 5. Storage layout and file format

**Revised 2026-08-28.** The first draft kept every plan in one key and made
each write a read-modify-write. That is correct if the read-modify-write is
never forgotten, and this section is the argument for not having to remember.

### One key per plan

```
fairwater.v1.household        the household, one object
fairwater.v1.plan.3           one plan, whole
fairwater.v1.plan.7           another
```

The plan list is derived by scanning `localStorage` for the prefix. There is no
index key, because an index is a second copy of a fact that is already in the
keys, and two copies of a fact drift.

**This is the whole point: saving a plan cannot touch a plan it is not
saving.** With one key holding everything, a tab that has been open an hour
writes its own idea of the entire list — so a tab saving plan 2 deletes the
plan 3 that another tab created ten minutes ago, having never touched it and
with nothing on screen to suggest what happened. That failure was avoidable by
discipline and is now unavailable by construction, which is the same trade the
ownership rule makes in §3c of the engineering notes ("nothing appears twice by
construction, so there is no dedupe step to get wrong") and the RLS lockdown
makes in the README ("two independent layers, so a lapse in one doesn't open
the door").

Within a single plan, the last write wins. That is ordinary and expected, and
it is what every local-first application does short of merge machinery nobody
here is asking for.

### The version lives in the key prefix

`fairwater.v1.*`. A version 2 reader looks for the v1 keys, migrates each one,
writes the v2 key and drops the old — per plan, so a migration interrupted
halfway leaves readable data on both sides rather than one corrupt blob.

Versioned from the first release because **there is no migration tool for a
browser.** A Postgres schema is changed with `db:push`; a payload on somebody
else's laptop is changed only by code that later reads it.

The scan must tolerate keys it does not own. This origin has already held
`fairwater_holdings` and `fairwater_register_pending`, and `forgetBrowserCopies`
still clears them on sight.

### Read forgivingly, by the rule the codebase already uses

`readExpenses` "starts from `emptyExpenses()` and only overwrites keys it
recognises", which is why adding a line was safe for stored payloads. The local
store adopts the same rule: start from defaults, take only recognised keys,
ignore the rest. A plan written before the cash pot exists then loads with cash
at zero rather than failing, and one written after a rollback still loads.

A plan that cannot be parsed at all is skipped and reported, never dropped —
the key stays where it is, so a bug in one release does not delete somebody's
plan on behalf of the next.

### Ids

`max(existing) + 1`, computed from a fresh scan at the moment of writing, never
from what the tab has in memory. Two tabs creating a plan within the same
microsecond can still pick the same id; the consequence is bounded to those two
new plans rather than the whole set, which is the difference worth buying.

### Saving over a newer copy

Each plan payload carries `updatedAt`. Before writing, the store compares it
with what is in the key. If storage is newer than the copy this tab loaded,
**say so and let the reader choose** rather than overwriting silently.

Five lines, and this codebase has earned them: the register wipe destroyed
every holding on a plan while "the projection above it was correct throughout,
so there was nothing on screen to suggest what had happened", the household
blanking wrote an empty record over a filled one, and §3d records two plans
that disappeared for reasons still unknown. Silent overwriting is this
project's recurring failure, and it is worth spending five lines not to repeat
it in a place with no backup.

### Export and import

The **file** is a single envelope, assembled by scanning at export time:

```jsonc
{
  "v": 1,
  "savedAt": "2026-08-28T14:02:11.000Z",
  "household": { "name": "", "currentAge": 55, "filingStatus": "married", "taxState": "CA" },
  "plans": [
    { "id": 3, "name": "Retire at 58", "personName": "", "updatedAt": "…",
      "inputs": { /* PlanInputs */ },
      "register": { "holdings": [], "liabilities": [] } }
  ]
}
```

One document is right for a file — it is a thing somebody emails, keeps in a
folder, or hands back to support — and many keys are right for storage, where
concurrent writes are the risk. They share the plan shape, so export is a
serialisation of what the store already holds and import is the same reader.

Downloaded as `fairwater-plans-YYYY-MM-DD.json`.

**Import adds, never replaces.** Imported plans are assigned fresh ids and
appended, and the reader is told how many arrived. Replacing is one wrong click
from destroying the plans already on the machine, and there is no undo and no
backup on a device we do not control.

Export/import is not a nicety here. It is the answer to a new laptop, to
cleared site data, to a browser change, to "can you help me with my plan" when
nobody can look it up, and to a future migration into cloud mode. It ships with
the first local release, not after it.

### What is deliberately not built

Live cross-tab synchronisation. A `storage` event listener would refresh the
saved-plans list in other tabs, and without it a second tab shows a stale list
until it is reloaded. That is cosmetic, and with one key per plan a stale list
cannot cause damage — which is exactly why the layout was chosen over the
listener.

---

## 6. What disappears in local mode

**Corrected 2026-08-28, during the build.** The first draft had `/sign-in`
404 alongside `/sign-up`. That is wrong: `/admin` still exists in local mode,
because the analytics and the feedback are still in Postgres, and reaching it
needs a session. Killing sign-in would lock the admin out of the one surface
local mode keeps.

So the rule is **unadvertised, not absent**:

- **`/sign-up` stands, and the endpoint decides.** It was a 404 for a day,
  which closed the only route to making the one account local mode needs. Now
  the page renders and `/sign-up/email` refuses any address that is not on the
  allowlist — so an allowlisted administrator who has never set a password can
  set one, and nobody else gets anywhere.
- **`/sign-in` still works, and is linked from nowhere.** No header link, and
  it is dropped from `sitemap.ts` — a sitemap recommends what to read, and this
  is not something to read. An admin bookmarks `/sign-in?next=/admin`, which
  §9 of the engineering notes already anticipated.
- **`/api/auth/[...all]` stays**, because sign-in needs it.
- **`/dashboard` answers 404.** It lists plans off an account; local mode has
  none, and an admin signed in has no plans of their own.
- `SiteHeader` drops *Sign in*, *Get started* and *My plans*. **Sign out is
  deliberately not gated** — an admin who signed in has to get back out.
- The home page drops its *Create free account* call to action.

### The allowlist is the whole of who may sign in — added 2026-08-28

In local mode, `/sign-in/email` and `/sign-up/email` refuse any address that is
not in `ADMIN_EMAILS`. An account holds nothing here — plans live in the
reader's browser — so the only reason to have one is `/admin`, and the only
people who should are the handful of addresses the operator listed.

**Enforced in `lib/auth.ts`, not on the page, and the distinction is the
point.** §9 makes it about server actions and it is exactly as true of these: a
page guards what it renders, and `/api/auth/sign-in/email` is an endpoint
anything can post to whatever the form in front of it says. Checked by posting
directly, which is the only check worth trusting:

```
stranger@example.com   sign-in   {"message":"That email address cannot sign in here."}
stranger@example.com   sign-up   {"message":"That email address cannot sign in here."}
ravulu@gmail.com       sign-in   {"code":"INVALID_EMAIL_OR_PASSWORD"}   ← past the gate
```

Sign-up is on the list as well as sign-in. Without it an address that cannot
sign in could still create the row — an account that exists, cannot be used,
and sits in the database being counted.

**One refusal for every reason.** Not on the list, wrong password and no such
account all answer the same way. Three messages would turn the endpoint into a
way of asking who the administrators are, which is the question §9 refuses to
answer everywhere else.

**This also closes the provisioning trap** the previous version of this section
warned about. An allowlisted address with no account sets a password at
`/sign-up`; the sign-in page carries a *"No password set yet? Set one"* link to
it. Ordering no longer matters, because the route in cannot be closed by
switching mode.

**Checked 2026-08-28, and satisfied.** `ADMIN_EMAILS` is one address,
`ravulu@gmail.com`, and it has an account — so local mode has a way in, and
exactly one. That is the whole admin surface for now.

The list was briefly two. The second address was allowlisted with no account
behind it, which is harmless — the gate fails closed either way — but it is an
entry that cannot be made to work once `/sign-up` is gone, and a name on an
allowlist implies a route in. It was removed rather than left to be puzzled
over later. **The rule worth keeping: every address on the list should have an
account before the switch to local, because afterwards none can be created.**

The `user`, `session`, `account` and `verification` tables stay in the schema.
They are additive and unread, exactly as `survivorFromAge` is, and dropping
them would make cloud mode a migration rather than a redeploy.

**Admin plan lookup.** `lookupPlansByEmail` and `getPlanForAdmin` have nothing
to read, but "nothing to read" is not a guard — it is an empty result that
becomes a full one the day someone flips the mode. They get an explicit
`if (isLocal) notFound()` at the top, beside their existing `requireAdmin()`,
and the lookup card is not rendered. **Gated, not deleted**: one codebase serves
both modes, and deleting the support tooling to ship local mode means building
it again for cloud.

`/admin` keeps a purpose either way — usage and feedback are still server-side.

**Admin 2FA drops down the priority list but does not fall off it.** The
crown jewels are gone; feedback text and visit analytics are not nothing — and
in local mode the admin account is the *only* account, which makes it the only
thing a password protects.

---

## 7. What still reaches the server in local mode

Worth stating exactly, because it is the claim the product would be making:

- `events` — a session id, a path, a country. No IP address; that was already
  a deliberate choice.
- `feedback` — the text someone chooses to send. It already stores
  `userId: session?.user?.id ?? null`, so it works with no account and needs no
  change at all.

And what does not: plans, household, holdings, liabilities, names, ages,
balances, or email addresses.

The honest sentence is *"your figures never leave your browser"*, not *"we
store nothing"*.

---

## 8. The rendering consequence, which is the real cost

`app/planner/page.tsx` reads the household, the saved plans and the register on
the server, and says why:

> *"Read on the server so the first paint already has them — no
> empty-then-filled flash on the figures people check."*

Local mode cannot do that. Nothing is readable until the browser has hydrated
and read its own storage. This is the one place the switch is not free, and it
needs a decision rather than a shrug:

- The page passes `null` initial data in local mode and a client boundary
  hydrates from the store.
- The projection already renders from `DEFAULT_INPUTS` when nothing is stored,
  so an arriving visitor sees what they see today.
- The flash to avoid is on **a plan being reopened**, where figures appear and
  then change. The saved-plans list and the reopened plan should hold a
  restoring state until the store has answered, rather than render defaults and
  correct themselves.

---

## 9. Decided, 2026-08-28

1. **Many plans locally**, so that comparison works without an account. It is
   the larger surface and it is the point of the feature.
2. **Several tabs may hold different plans.** That is a supported case, which
   is what makes the read-modify-write in §5 a requirement rather than a
   refinement.
3. **No plan lookup in local mode, by design.** Nobody at this end needs to see
   a reader's plan. The admin actions are gated rather than deleted, so cloud
   mode still has its support tooling on the day it is switched on.

## 9b. Still open

1. **~~The plans already in Postgres.~~** Answered 2026-08-28: all test data.
   Eleven accounts, none of them anybody's real plan, so nothing has to be
   carried across and no export-from-cloud path is needed before the switch.
2. **Do analytics stay?** `events` still writes a session id, a path and a
   country in local mode. Keeping them is defensible — none of it is financial
   — but it decides what the privacy copy is allowed to say.
3. **Feedback attribution.** With no accounts every feedback row is anonymous,
   so the admin view loses the ability to follow anything up. A consequence
   rather than a question, but somebody should agree to it.
4. **Mode changes on a live deployment.** cloud → local strands rows that are
   still in Postgres. local → cloud needs every reader to import. Neither is a
   migration this design provides; the mode is chosen per deployment and not
   flipped underneath users.

## 9c. Two things local mode does not change

**It is not "no database".** `events` and `feedback` are still Postgres, so
`DATABASE_URL` is still required and `db:push` still runs. Local mode means no
*financial* data on the server, and the deployment docs should say so in those
words rather than implying the database is optional.

**The copy has to move with it.** Several FAQ answers assert that an account is
how plans are saved and compared, and `HoldingsScreen` carries an `isAuthed`
prop whose entire job is "to say truthfully where the figures go" — its comment
records that the old wording, *"kept on this device only, and not sent
anywhere"*, became false when the register started being written to the
database. In local mode that old sentence becomes true again. Copy claims are
tested here (`lib/faq.test.ts`, `lib/windows.test.ts`), so this is a build task
with tests attached, not a pass at the end.

---

## 10. Build order

1. `lib/persistence.ts` and its test — the switch, and the coercion.
2. `lib/store/types.ts`, then `cloud.ts` as a pure wrapper. Ship this in cloud
   mode with no behaviour change; it is a refactor, and it should be provably
   one before anything depends on it.
3. `lib/store/local.ts` plus tests. Three that matter more than the rest:
   both stores return the same plan for the same input; **saving one plan
   leaves every other key untouched**, asserted directly against
   `localStorage`; and a payload missing a field added later loads with that
   field defaulted rather than throwing.
4. The staleness check, with its own test — write a plan, mutate the key behind
   the store's back, save again, and assert it refuses rather than overwrites.
5. Page and workspace wiring, including the restoring state.
6. Auth and admin gating.
7. Save framing, the forget control, export and import.

**Steps 1–7 are built as of 2026-08-28**, and steps 5 to 7 were each checked
by driving the running app rather than by reading the diff. That was not
ceremony: step 5's own bug — the household never saving, because its write was
gated on being signed in — typechecks perfectly and is invisible until you
type an age, reload, and watch it come back as the default.

Steps 1–4 are testable with no UI at all, which is where the risk is. Step 2
landing on its own is what keeps this from being a rewrite.

Note that step 3's second test is the one that would have caught the design
this section replaced, and that was checked rather than asserted: a faithful
single-envelope store, written as a throwaway and run against the same cases,
passes "round-trips a plan perfectly" and then loses the plan another tab
created — the list comes back holding only the plan the second tab was itself
editing. Both stores agree on every test that reads back what it just wrote.
Only the test that reaches for the other key can tell them apart.
