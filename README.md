# Fairwater

A retirement and financial planning app. Project your savings, model your
retirement spending, and see how long your money lasts.

Built with Next.js (App Router), Postgres via Drizzle ORM, and Better Auth for
email/password accounts.

## Requirements

- Node.js 20+
- A Postgres database (this project is developed against Supabase)

## Setup

Install dependencies:

```bash
npm install
```

Copy the environment template and fill it in:

```bash
cp .env.example .env.local
```

`.env.local` needs these values:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres connection string |
| `BETTER_AUTH_SECRET` | Signs session cookies |
| `BETTER_AUTH_URL` | The app's own origin |
| `NEXT_PUBLIC_SITE_URL` | Public origin for canonical links, the sitemap and share cards. Must be the real domain in production: a wrong value points every canonical at a host that does not serve the page |
| `NEXT_PUBLIC_PERSISTENCE` | `local` or `cloud`. Unset means **local**, where plans live in the reader's own browser and the app has no accounts. Only the exact string `cloud` uses the database. Read at build time, so changing it needs a redeploy rather than a restart — see [persistence modes](docs/persistence-modes.md) |
| `ADMIN_EMAILS` | Who may open `/admin`, comma-separated. Unset means nobody, so a deployment that forgets it locks admins out rather than letting anyone in |

Generate a secret with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### Getting `DATABASE_URL` from Supabase

In your project, open **Connect** and choose the **Session pooler** tab (port
5432), then replace `[YOUR-PASSWORD]` with your database password. Leave the
string otherwise as-is — in particular, don't add an `sslmode` parameter.

Avoid the **Direct connection** tab: on the free tier it resolves to IPv6 only,
which fails from most home networks. The **Transaction pooler** (port 6543)
doesn't support the prepared statements Drizzle Kit needs for migrations.

### Create the tables

```bash
npm run db:push
```

This creates the Better Auth tables (`user`, `session`, `account`,
`verification`) and the app's `retirement_plans` and `feedback` tables.

Run `npm run db:secure` after **every** push, not only ones that add a table:
`db:push` has been observed to clear row-level security on tables it did not
touch, and the lockdown script restores it.

## Database access control

Supabase exposes the `public` schema through its REST API and, by default,
grants `anon` and `authenticated` full read/write on every table there. This
app never uses that API — it connects directly as `postgres` — so those roles
should have no access at all.

`db/lockdown.sql` revokes those grants (including via `ALTER DEFAULT
PRIVILEGES`, so tables added later don't get them back) and enables RLS with no
policies, which denies by default. Two independent layers, so a lapse in one
doesn't open the door. `postgres` owns the tables and bypasses RLS, so the app
is unaffected.

```bash
npm run db:secure
```

It's idempotent. **Re-run it after any `db:push` that adds a table** — new
tables are created with RLS off.

## TLS

Supabase's Postgres endpoints present a chain ending in Supabase's own root CA,
which is absent from Node's bundled Mozilla CA store — so ordinary verification
fails with `SELF_SIGNED_CERT_IN_CHAIN`.

Rather than disable verification, this project pins that root. It is inlined in
`lib/db/supabase-ca.ts` (fingerprint and source URL are in the file header), and
`lib/db/ssl.ts` applies it whenever `DATABASE_URL` points at a Supabase host,
verifying the chain and hostname in full. Other hosts fall through to whatever
the connection string specifies, so a local Postgres still works.

`DATABASE_SSL_NO_VERIFY=true` downgrades to encrypt-without-verify. It exists
for a proxy that re-signs traffic; it is not a default and not a fix for a
certificate error.

## Development

```bash
npm run dev
```

Open <http://localhost:3000>.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run lint` | Lint with ESLint |
| `npm run db:push` | Sync the schema straight to the database |
| `npm run db:secure` | Revoke PostgREST role access and enable RLS |
| `npm run db:generate` | Generate a SQL migration from schema changes |
| `npm run db:migrate` | Apply generated migrations |
| `npm run db:studio` | Browse the database in Drizzle Studio |
| `npm run watch:figures` | Check whether the government has published a table this build does not have — see [cron-jobs](cron-jobs/README.md) |

`db:push` is convenient in development. Prefer `db:generate` plus `db:migrate`
once you have data worth preserving.

## Project layout

```
app/
  actions/plans.ts        Server actions for retirement plans
  api/auth/[...all]/      Better Auth request handler
  planner/, dashboard/    Authenticated pages
  sign-in/, sign-up/      Auth pages
components/
  planner/                Planner UI and projection chart
  ui/                     Shared primitives
lib/
  auth.ts, auth-client.ts Better Auth server and client setup
  db/                     Drizzle client and schema
  retirement.ts           Projection maths
```

## Notes

- [Deploying on Vercel](docs/deploy-vercel.md) — the closer fit for Next, and
  the one database change serverless requires.
- [Deploying on Render](docs/deploy-render.md) — the environment variables,
  the two that are read at build time rather than run time, and what breaks
  when they are wrong.
- [Keeping the published figures current](docs/tax-data-updates.md) — a design,
  not yet built: how the tax, IRMAA, ACA and state tables would follow the
  government's own publication cycle, and why the numbers are proposed for
  review rather than applied automatically.
- [Persistence modes: cloud or local](docs/persistence-modes.md) — a design,
  not yet built: one deployment-time switch deciding whether figures live in
  Postgres or in the reader's own browser, and what changes on the page when
  they do.
- [How Fairwater compares to Boldin](docs/competitive-boldin.md) — what the
  app does better, what it does not do at all, and the one gap that makes
  existing advice incomplete rather than merely absent.
