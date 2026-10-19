-- LVRF — OWN-1 ROLLBACK: back to the ownership and grants before OWN-1.
--
-- For an emergency only: the app hits "permission denied" after OWN-1 deploys
-- and the missing grant cannot be found and added at once. Applied as a
-- SUPERUSER:
--   sudo -u postgres psql -d lvrf -X -q -v ON_ERROR_STOP=1 -f db/ownership_rollback.sql
--
-- IT TAKES EFFECT AT ONCE. Privileges are checked per statement, so the
-- running API needs no restart and no redeploy: the OWN-1 code runs on the
-- old ownership unchanged (scripts/verify_ownership.sh step 8 proves the
-- result matches a pre-OWN-1 database privilege for privilege).
--
-- WHAT IT LEAVES BEHIND, ON PURPOSE:
--   - hardening.sql section 24 and deploy step 5d will now REFUSE (lvrf_app
--     owns everything again). That blocks the next hardening run and deploy
--     until OWN-1 is fixed and db/ownership.sql re-run — the right state:
--     a rollback is not a new normal.
--   - The roles stay. lvrf_migrate is set NOLOGIN; lvrf_owner owns nothing.
--     Removing them is db/ownership.sql's DROP ROLE steps, later, as its own act.
--   - lvrf_ownership_violations() stays (the superuser's; harmless).
--
-- Rows are untouched: no data is written, deleted or restored. Restoring the
-- pre-OWN-1 backup instead would discard every write since it was taken.

\set ON_ERROR_STOP on
BEGIN;

SELECT format('ALTER DATABASE %I OWNER TO lvrf_app', current_database()) \gexec
ALTER SCHEMA drizzle OWNER TO lvrf_app;

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT n.nspname, c.relname, c.relkind
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname IN ('public', 'drizzle') AND c.relkind IN ('r', 'p', 'v', 'm', 'S')
       AND c.relowner = 'lvrf_owner'::regrole
     ORDER BY c.relkind = 'S', c.relname
  LOOP
    IF r.relkind = 'S' THEN
      IF (SELECT relowner FROM pg_class WHERE oid = format('%I.%I', r.nspname, r.relname)::regclass) = 'lvrf_owner'::regrole THEN
        EXECUTE format('ALTER SEQUENCE %I.%I OWNER TO lvrf_app', r.nspname, r.relname);
      END IF;
    ELSIF r.relkind = 'v' THEN
      EXECUTE format('ALTER VIEW %I.%I OWNER TO lvrf_app', r.nspname, r.relname);
    ELSIF r.relkind = 'm' THEN
      EXECUTE format('ALTER MATERIALIZED VIEW %I.%I OWNER TO lvrf_app', r.nspname, r.relname);
    ELSE
      EXECUTE format('ALTER TABLE %I.%I OWNER TO lvrf_app', r.nspname, r.relname);
    END IF;
  END LOOP;
  FOR r IN
    SELECT n.nspname, t.typname, t.typtype
      FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
     WHERE n.nspname IN ('public', 'drizzle') AND t.typtype IN ('e', 'd') AND t.typowner = 'lvrf_owner'::regrole
  LOOP
    EXECUTE format('ALTER %s %I.%I OWNER TO lvrf_app', CASE r.typtype WHEN 'd' THEN 'DOMAIN' ELSE 'TYPE' END, r.nspname, r.typname);
  END LOOP;
  -- Only functions OWN-1 moved (it moved lvrf_app's, never the superuser's).
  FOR r IN
    SELECT p.oid::regprocedure AS sig, p.prokind
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname IN ('public', 'drizzle') AND p.proowner = 'lvrf_owner'::regrole
  LOOP
    EXECUTE format('ALTER %s %s OWNER TO lvrf_app', CASE r.prokind WHEN 'p' THEN 'PROCEDURE' ELSE 'FUNCTION' END, r.sig);
  END LOOP;
END $$;

-- An owner holds every privilege on what it owns; give back what ownership.sql
-- revoked, then re-apply the one restriction pre-OWN-1 hardening made
-- (hardening.sql section 7: no UPDATE, DELETE or TRUNCATE on the two logs).
GRANT ALL ON ALL TABLES IN SCHEMA public TO lvrf_app;
GRANT ALL ON ALL TABLES IN SCHEMA drizzle TO lvrf_app;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO lvrf_app;
REVOKE UPDATE, DELETE, TRUNCATE ON audit_log        FROM lvrf_app;
REVOKE UPDATE, DELETE, TRUNCATE ON heartbeat_events FROM lvrf_app;
GRANT CREATE, USAGE ON SCHEMA public TO lvrf_app;

ALTER DEFAULT PRIVILEGES FOR ROLE lvrf_owner IN SCHEMA public REVOKE SELECT, INSERT ON TABLES FROM lvrf_app;
ALTER DEFAULT PRIVILEGES FOR ROLE lvrf_owner IN SCHEMA public REVOKE USAGE, SELECT ON SEQUENCES FROM lvrf_app;
ALTER ROLE lvrf_migrate NOLOGIN;

COMMIT;
