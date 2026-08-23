# Deploying Harborlight on Vercel

Written 23 August 2026, against Next 16.

Vercel is the closer technical fit — it is Next's own platform, the build needs
no configuration, and there is no free-tier sleep. Two things differ from a
long-lived server like Render, and one of them is a licensing question rather
than a technical one. Both are below.

---

## Before you begin

- The repo on GitHub, GitLab or Bitbucket
- A Supabase project
- A Vercel account

There is no config file to write. Vercel detects Next.js, and `render.yaml`
is ignored.

---

## 1. Import the project

**Vercel Dashboard → Add New → Project**, pick the repo, leave every build
setting alone. Framework preset is detected; build command, output directory
and install command are all correct by default.

Set the **Production Branch** to whatever you deploy. It defaults to `main`.

---

## 2. Set the environment

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | Supabase **Transaction pooler**, port **6543** — see below |
| `BETTER_AUTH_SECRET` | 32 random bytes, base64 |
| `ADMIN_EMAILS` | Comma-separated addresses allowed into `/admin` |
| `BETTER_AUTH_URL` | Optional — falls back to the Vercel production domain |
| `NEXT_PUBLIC_SITE_URL` | Optional — same fallback |

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Add them to **Production**. Preview deployments get their own values; point
those at a separate database unless you want previews writing to live data.

### The two URL variables are optional here

On Render both must be set by hand, and you cannot know the URL until the
service exists. On Vercel the code falls back to
`VERCEL_PROJECT_PRODUCTION_URL`, which the platform provides — so a first
deploy works with neither set.

That variable is the *stable production* domain, deliberately, rather than
`VERCEL_URL`, which is unique to every deployment. Trusting the latter would
make each preview claim to be canonical and move the session cookie's origin on
every push.

**Set both explicitly the moment you attach a custom domain.** The fallback
keeps pointing at `*.vercel.app`, and canonicals aimed at a host you no longer
use are worse than none.

---

## 3. Use the transaction pooler, not the session pooler

This is the one change that matters, and it is a consequence of how serverless
works rather than anything about this app.

Every function instance holds its own connection pool, and Vercel runs many at
once under load. Against the session pooler on port 5432 — one real Postgres
connection per client connection — a burst of traffic exhausts the database's
limit and instances start failing to connect. The transaction pooler on **6543**
multiplexes many callers onto few Postgres connections, which is exactly the
shape serverless needs.

So:

- **App at runtime:** port `6543`, the transaction pooler
- **Migrations from your machine:** port `5432`, the session pooler — Drizzle
  Kit needs prepared statements that transaction mode does not support

The app's own queries do not use prepared statements, so transaction mode is
fine for everything the running app does. Verified against this codebase: the
same Drizzle select and a raw count both succeed over 6543.

`lib/db/index.ts` detects Vercel and drops the pool to **one connection per
instance** on its own. `DATABASE_POOL_MAX` overrides it if you need to.

---

## 4. Prepare the database

From your machine, against the **session pooler**:

```bash
DATABASE_URL='<session pooler string, :5432>' npm run db:push
DATABASE_URL='<session pooler string, :5432>' npm run db:secure
```

Run `db:secure` after **every** push, not only ones that add a table — we have
watched `db:push` clear row-level security on tables it did not touch.

---

## 5. Check it worked

```bash
BASE=https://your-app.vercel.app

curl -s -o /dev/null -w '%{http_code}\n' $BASE/                  # 200
curl -s -o /dev/null -w '%{http_code}\n' $BASE/admin             # 307 to sign-in
curl -sI $BASE/ | grep -i strict-transport                       # HSTS present
curl -s $BASE/sitemap.xml | grep -o '<loc>[^<]*</loc>' | head -1 # your real domain
```

Then sign up, save a plan, and open `/admin` as an allowlisted address. Signing
up is the real test: it exercises the origin check, the cookie, and the
database in one go.

---

## Vercel against Render

| | Vercel | Render |
| --- | --- | --- |
| Config needed | none | `render.yaml` or dashboard settings |
| URL variables | fall back automatically | must be set, then rebuilt |
| Database connections | many instances, needs the transaction pooler | one process, session pooler is fine |
| Idle behaviour | no sleep | free tier sleeps, ~30s cold start |
| Free tier | **non-commercial only** | commercial use allowed |
| Paid entry | Pro, $20/user/month | Starter, $7/month |

### The licensing catch

**Vercel's Hobby plan is for non-commercial personal use.** If Harborlight
ever charges, takes sponsorship, or advertises, Hobby is not the right plan and
Pro starts at $20 per user per month. Render's Starter is $7 and carries no
such restriction.

Confirm the current terms yourself before relying on this — plan rules change,
and this file will not.

### Which to pick

If Harborlight stays free and personal, **Vercel**: better Next support, no
cold starts, less to configure, and the URL handling is automatic.

If it becomes a business, price both. Vercel remains the better technical fit;
Render is cheaper at the bottom and bills for a server rather than for
invocations, which is easier to predict.

---

## What does not change

The projection and the 10,000 Monte Carlo simulations run in the browser, so
neither platform's function limits apply to them. Nothing in the app needs a
long-lived process, a filesystem or a background worker. Everything defaults to
the Node runtime — `pg` cannot run on Edge, and nothing here asks it to.
