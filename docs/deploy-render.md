# Deploying Fairwater on Render

Written 23 August 2026, against Next 16 and Render's Node runtime.

The app is a normal Next.js server — no adapter, no `output: 'standalone'`,
nothing Render-specific in the code. The work is in the environment, and three
of those variables have sharp edges. Read [Two things that will bite
you](#two-things-that-will-bite-you) before you start.

---

## Before you begin

- The repo pushed to GitHub, on the branch you want deployed
- A Supabase project (Render is only running the app; Postgres stays where it
  is)
- A Render account

`render.yaml` in the repo root declares the service. It is set to deploy
`main` — change `branch:` if you deploy something else.

---

## 1. Create the service

**Render Dashboard → New → Blueprint**, point it at the repo, and it reads
`render.yaml`. Every secret is declared `sync: false`, so Render will prompt
for each one rather than expecting it in the file.

To do it by hand instead — **New → Web Service** — the settings that matter:

| Setting | Value |
| --- | --- |
| Runtime | Node |
| Build command | `npm ci && npm run build` |
| Start command | `npm run start` |
| Health check path | `/` |

`next start` reads `PORT` and binds `0.0.0.0` on its own, so nothing needs
passing for Render to route to it.

---

## 2. Set the environment

| Variable | Value | Needed at |
| --- | --- | --- |
| `DATABASE_URL` | Supabase **Session pooler** string, port 5432. No `sslmode` — TLS is configured in `lib/db/ssl.ts`, which pins Supabase's root CA | run time |
| `BETTER_AUTH_SECRET` | 32 random bytes, base64 | run time |
| `BETTER_AUTH_URL` | The exact public origin, no trailing slash | run time |
| `NEXT_PUBLIC_SITE_URL` | The same origin | **build time** |
| `ADMIN_EMAILS` | Comma-separated addresses allowed into `/admin`. Unset means nobody | run time |
| `NODE_VERSION` | `22.20.0` | build time |
| `DATABASE_POOL_MAX` | `5` — per instance | run time |

Generate the secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Do **not** reuse the development secret. Rotating it later signs everyone out,
which is fine, but sharing one between environments means a dev session cookie
is valid in production.

---

## 3. Prepare the database

Run these from your machine with `DATABASE_URL` pointed at the production
database, not from Render:

```bash
DATABASE_URL='<production string>' npm run db:push
DATABASE_URL='<production string>' npm run db:secure
```

The first creates `user`, `session`, `account`, `verification`,
`retirement_plans` and `feedback`. The second locks Supabase's `anon` and
`authenticated` roles out of the `public` schema and turns on deny-by-default
RLS.

**Run `db:secure` after every `db:push`, not only ones that add a table.** We
have watched `db:push` clear row-level security on tables it did not touch. The
lockdown script is idempotent, so running it too often costs nothing and
running it too rarely leaves the database open to Supabase's REST API.

---

## 4. Deploy, then fix the URLs, then deploy again

You cannot know the final URL until the service exists, and two variables need
it. So:

1. Deploy once with `BETTER_AUTH_URL` and `NEXT_PUBLIC_SITE_URL` set to
   anything (the app will build and boot; sign-up will not work yet)
2. Copy the URL Render assigns — `https://fairwater.onrender.com`, or your
   custom domain if you attach one now
3. Set both variables to exactly that, with **no trailing slash**
4. **Trigger a manual deploy — a restart is not enough.** `NEXT_PUBLIC_*` is
   inlined into the bundle at build time, so the old value is compiled into the
   JavaScript until you rebuild

Attaching a custom domain later means repeating steps 3 and 4 for the new
origin.

---

## Two things that will bite you

### `BETTER_AUTH_URL` must match the browser's origin exactly

In production it is the *only* trusted origin. If it disagrees with what the
browser sends — a trailing slash, `http` against `https`, `www` against bare —
every sign-up and sign-in fails with **"Invalid origin"** *after* the page has
already been served, so the app looks fine until someone tries to use it.

It also decides whether the session cookie is marked `Secure`. Set to `http://`
on an HTTPS deployment, the cookie travels unprotected.

### `NEXT_PUBLIC_SITE_URL` is baked in at build time

It is not read at run time. It sets:

- every `<link rel="canonical">`
- `/sitemap.xml` and `/robots.txt`, both of which build as **static** files
- the Open Graph and Twitter image URLs

A wrong value points every canonical at a host that does not serve the page,
which is worse for search than having none at all. Changing it requires a
rebuild.

---

## 5. Check it worked

```bash
BASE=https://your-app.onrender.com

curl -s -o /dev/null -w '%{http_code}\n' $BASE/                 # 200
curl -s -o /dev/null -w '%{http_code}\n' $BASE/planner          # 200
curl -s -o /dev/null -w '%{http_code}\n' $BASE/admin            # 307 to sign-in
curl -sI $BASE/ | grep -i strict-transport                      # HSTS present
curl -s $BASE/robots.txt | grep -i sitemap                      # your real domain
curl -s $BASE/sitemap.xml | grep -o '<loc>[^<]*</loc>' | head -3 # your real domain
```

Then in a browser:

1. Sign up. If it fails with "Invalid origin", `BETTER_AUTH_URL` is wrong.
2. Build a plan and save it. That exercises the database and TLS to Supabase.
3. Open `/admin` signed in as an address in `ADMIN_EMAILS`. A 404 means the
   allowlist does not match your account; a redirect to sign-in means no
   session.

---

## Things worth knowing about the hosting

**The free tier sleeps.** After inactivity the instance spins down and the next
visitor waits roughly 30 seconds. For a planner people are linked to, that
first impression is the whole impression. The Starter plan is the fix.

**Supabase pauses free projects** after about a week of inactivity. The app
then fails at the database rather than at the web layer, which reads as a
broken deploy. Worth knowing before you debug the wrong end.

**`DATABASE_POOL_MAX` is per instance.** Two instances at 5 is 10 connections.
Raise the Supabase plan before raising the instance count.

**Health checks keep it warm on paid plans** but do not prevent free-tier
sleep — Render ignores its own health checks while spun down.
