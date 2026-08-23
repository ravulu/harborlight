-- Lock Supabase's PostgREST roles out of the `public` schema.
--
-- Supabase exposes `public` over its REST API and grants `anon` and
-- `authenticated` full DML on tables there by default. This app never uses
-- that API — it connects directly as `postgres` — so those roles should have
-- no access at all.
--
-- Two independent layers, so a lapse in one does not open the door:
--   1. no privileges granted to those roles, now or on future tables
--   2. RLS enabled with no policies, which denies by default
--
-- `postgres` owns these tables and bypasses RLS, so the app is unaffected.
--
-- Idempotent. Re-run after any `db:push` that adds a table: npm run db:secure

-- 1. Existing objects.
REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;

-- 2. Objects this role creates later (drizzle-kit runs as `postgres`).
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL ON FUNCTIONS FROM anon, authenticated;

-- 3. Deny-by-default RLS on every table that lacks it.
DO $$
DECLARE t record;
BEGIN
  FOR t IN
    SELECT c.oid::regclass AS tbl
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND NOT c.relrowsecurity
  LOOP
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t.tbl);
    RAISE NOTICE 'enabled RLS on %', t.tbl;
  END LOOP;
END $$;
