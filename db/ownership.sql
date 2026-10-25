-- LVRF — OWN-1: the database owner role (LVRF_PLAN §6; decisions OWN-1-D1–D3)
--
-- Applied as a SUPERUSER, per database, BEFORE hardening.sql:
--   prod:   sudo -u postgres psql -d lvrf -f db/ownership.sql
--           (with LVRF_MIGRATE_PASSWORD in the environment the first time; see below)
--   local:  scripts/lib/clone.sh make_clone, on THROWAWAY CLONES ONLY. Real local
--           lvrf is not converted until OWN-1 deploys (OWN-1-D1).
--
-- WHY. Until OWN-1, migrations ran as lvrf_app, so the app role OWNED every
-- table. An owner can re-grant itself the privileges hardening.sql revokes,
-- and drop or disable any trigger: CLAUDE.md rule 3's revocations bound the
-- app's code paths, not the role. After this file:
--   lvrf_owner    NOLOGIN. Owns the database, every table, sequence, enum type,
--                 the drizzle schema and its table. Nobody logs in as it.
--   lvrf_migrate  LOGIN, a member of lvrf_owner, with role = lvrf_owner set on
--                 login, so a migration creates objects owned by lvrf_owner.
--                 Used only by migrations.
--   lvrf_app      The API. SELECT everywhere; INSERT and UPDATE only where the
--                 code writes; no DELETE, no TRUNCATE, no CREATE, owns nothing.
-- hardening.sql section 24 asserts all of this after every run, and deploy
-- step 5d asserts it again, read-only, as lvrf_app.
--
-- IDEMPOTENT. Roles are created if absent; ownership and grants are set to
-- the same end state on every run. RUN IT TWICE AROUND A MIGRATION that adds
-- tables: before (so lvrf_migrate, as lvrf_owner, owns what it alters) and
-- after (so the new tables get their INSERT/UPDATE grants). Re-run it whenever a migration adds a
-- table that the app must UPDATE (default privileges give a new table only
-- SELECT and INSERT; see the end of this file), with the table added to the
-- list below.
--
-- THE PASSWORD IS NEVER IN THIS FILE. If LVRF_MIGRATE_PASSWORD is set in the
-- environment, lvrf_migrate's password is set from it (\getenv, so it is not
-- on the command line). If not, the password is left as it is.
--
-- NOT REASSIGN OWNED: it reaches every database in the cluster. The loops
-- below touch only this database's public and drizzle schemas.
--
-- REMOVING THE ROLES (local, or to undo before OWN-1 deploys). Roles are
-- cluster-wide, so first drop every database that uses them (the throwaway
-- clones), then, as a superuser:
--   -- for each remaining database that still has objects owned by them:
--   --   psql -d <db> -c "REASSIGN OWNED BY lvrf_owner TO lvrf_app" \
--   --                -c "DROP OWNED BY lvrf_owner" -c "DROP OWNED BY lvrf_migrate"
--   DROP ROLE lvrf_migrate;
--   DROP ROLE lvrf_owner;
-- DROP OWNED also drops privileges granted TO the role, so it is safe once
-- the objects are reassigned. On prod, undoing OWN-1 is its own plan, never
-- a paste from this comment.

\set ON_ERROR_STOP on

-- ------------------------------------------------------------------
-- 1. The roles (cluster-wide; created if absent)
-- ------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lvrf_owner') THEN
    CREATE ROLE lvrf_owner NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lvrf_migrate') THEN
    CREATE ROLE lvrf_migrate LOGIN;
  END IF;
END $$;
ALTER ROLE lvrf_owner NOLOGIN;
-- LOGIN explicitly: db/ownership_rollback.sql sets lvrf_migrate NOLOGIN, and
-- re-running this file after a rollback must give it back. Its password is
-- kept (NOLOGIN does not clear it).
ALTER ROLE lvrf_migrate LOGIN;
GRANT lvrf_owner TO lvrf_migrate;
ALTER ROLE lvrf_migrate SET role = 'lvrf_owner';

\getenv migrate_password LVRF_MIGRATE_PASSWORD
\if :{?migrate_password}
ALTER ROLE lvrf_migrate PASSWORD :'migrate_password';
\unset migrate_password
\endif

BEGIN;

-- ------------------------------------------------------------------
-- 2. Ownership: the database, schemas, relations, types, functions
-- ------------------------------------------------------------------
SELECT format('ALTER DATABASE %I OWNER TO lvrf_owner', current_database()) \gexec

CREATE SCHEMA IF NOT EXISTS drizzle;
ALTER SCHEMA drizzle OWNER TO lvrf_owner;
-- public is owned by pg_database_owner on PG 15+, which now means lvrf_owner.
-- On an older layout it may be a named role; hand it over in that case.
DO $$
BEGIN
  IF (SELECT nspowner::regrole::text FROM pg_namespace WHERE nspname = 'public') NOT IN ('pg_database_owner', 'lvrf_owner') THEN
    ALTER SCHEMA public OWNER TO lvrf_owner;
  END IF;
END $$;

DO $$
DECLARE r record;
BEGIN
  -- Tables first: ALTER TABLE also moves the sequences a table's columns own.
  FOR r IN
    SELECT n.nspname, c.relname, c.relkind
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname IN ('public', 'drizzle')
       AND c.relkind IN ('r', 'p', 'v', 'm', 'S')
       AND c.relowner <> 'lvrf_owner'::regrole
       AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_class'::regclass AND d.objid = c.oid AND d.deptype = 'e')
     ORDER BY c.relkind = 'S', c.relname
  LOOP
    IF r.relkind = 'S' THEN
      -- A sequence owned by a column moved with its table above.
      IF (SELECT relowner FROM pg_class WHERE oid = format('%I.%I', r.nspname, r.relname)::regclass) <> 'lvrf_owner'::regrole THEN
        EXECUTE format('ALTER SEQUENCE %I.%I OWNER TO lvrf_owner', r.nspname, r.relname);
      END IF;
    ELSIF r.relkind = 'v' THEN
      EXECUTE format('ALTER VIEW %I.%I OWNER TO lvrf_owner', r.nspname, r.relname);
    ELSIF r.relkind = 'm' THEN
      EXECUTE format('ALTER MATERIALIZED VIEW %I.%I OWNER TO lvrf_owner', r.nspname, r.relname);
    ELSE
      EXECUTE format('ALTER TABLE %I.%I OWNER TO lvrf_owner', r.nspname, r.relname);
    END IF;
  END LOOP;
  -- Enum and domain types (a table's row type moves with its table).
  FOR r IN
    SELECT n.nspname, t.typname, t.typtype
      FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
     WHERE n.nspname IN ('public', 'drizzle') AND t.typtype IN ('e', 'd')
       AND t.typowner <> 'lvrf_owner'::regrole
       AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_type'::regclass AND d.objid = t.oid AND d.deptype = 'e')
  LOOP
    IF r.typtype = 'd' THEN
      EXECUTE format('ALTER DOMAIN %I.%I OWNER TO lvrf_owner', r.nspname, r.typname);
    ELSE
      EXECUTE format('ALTER TYPE %I.%I OWNER TO lvrf_owner', r.nspname, r.typname);
    END IF;
  END LOOP;
  -- Functions a migration created as lvrf_app. hardening.sql's functions are
  -- the superuser's and stay so (lvrf_audit is SECURITY DEFINER: the app role
  -- must never own it).
  FOR r IN
    SELECT p.oid::regprocedure AS sig, p.prokind
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname IN ('public', 'drizzle') AND p.proowner = 'lvrf_app'::regrole
  LOOP
    EXECUTE format('ALTER %s %s OWNER TO lvrf_owner', CASE r.prokind WHEN 'p' THEN 'PROCEDURE' ELSE 'FUNCTION' END, r.sig);
  END LOOP;
END $$;

-- ------------------------------------------------------------------
-- 3. lvrf_app's privileges, re-derived from the code (LVRF_PLAN §6)
-- ------------------------------------------------------------------
REVOKE CREATE ON SCHEMA public FROM PUBLIC, lvrf_app;
REVOKE CREATE ON SCHEMA drizzle FROM PUBLIC, lvrf_app;
SELECT format('REVOKE CREATE ON DATABASE %I FROM PUBLIC, lvrf_app', current_database()) \gexec
SELECT format('GRANT CONNECT, TEMPORARY ON DATABASE %I TO lvrf_app', current_database()) \gexec
GRANT USAGE ON SCHEMA public, drizzle TO lvrf_app;

-- Start from nothing, then grant exactly what the code needs.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM lvrf_app;
REVOKE ALL ON ALL TABLES IN SCHEMA drizzle FROM lvrf_app;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM lvrf_app;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO lvrf_app;
-- (drizzle.__drizzle_migrations: SELECT below. Deploy step 5c,
-- check_schema_drift.mjs, and Gate C read it as lvrf_app.)
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO lvrf_app;

-- INSERT on the 32 tables the code inserts into; UPDATE on the 20 it updates.
-- audit_log is written by lvrf_audit() (SECURITY DEFINER, so as its owner);
-- its INSERT grant is a backstop. Never UPDATE on audit_log, heartbeat_events
-- refusals or figure_checks: section 24 of hardening.sql refuses the run if any is granted.
-- A table not created yet (a clone behind the newest migration) is skipped;
-- this file is re-run after migrating, so it is granted then.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'access_grants', 'account_person_links', 'assessments', 'audit_log', 'business_metrics',
    'capabilities', 'capability_industry_measures', 'engagements', 'evidence',
    'executive_summaries', 'figure_checks', 'heartbeat_events', 'industry_measure_exclusions',
    'industry_measures', 'institution_entities', 'institution_facts', 'institutions',
    'lever_offerings', 'offering_capabilities', 'person_credentials', 'persons',
    'record_documents', 'reference_example_markers', 'refusals', 'research_prompts',
    'research_results', 'sessions', 'value_hypotheses', 'value_levers',
    'value_outcome_evidence', 'value_outcomes', 'value_runs']
  LOOP
    IF to_regclass(format('public.%I', t)) IS NOT NULL THEN
      EXECUTE format('GRANT INSERT ON public.%I TO lvrf_app', t);
    END IF;
  END LOOP;
  FOREACH t IN ARRAY ARRAY[
    'access_grants', 'account_person_links', 'business_metrics', 'engagements', 'evidence',
    'industry_measures', 'institution_entities', 'institution_facts', 'institutions',
    'lever_offerings', 'person_credentials', 'persons', 'reference_example_markers',
    'research_results', 'sessions', 'tenants', 'value_hypotheses', 'value_levers',
    'value_outcomes', 'value_runs']
  LOOP
    IF to_regclass(format('public.%I', t)) IS NOT NULL THEN
      EXECUTE format('GRANT UPDATE ON public.%I TO lvrf_app', t);
    END IF;
  END LOOP;
END $$;
-- drizzle's own table may not exist before the first migration.
DO $$
BEGIN
  IF to_regclass('drizzle.__drizzle_migrations') IS NOT NULL THEN
    GRANT SELECT ON drizzle.__drizzle_migrations TO lvrf_app;
  END IF;
END $$;

-- ------------------------------------------------------------------
-- 4. Default privileges: what a table a future migration creates gives the app
-- ------------------------------------------------------------------
-- SELECT and INSERT, nothing else. A table the app must UPDATE is added to
-- section 3's list and this file re-run (idempotent). ALTER DEFAULT
-- PRIVILEGES is per creating role: lvrf_migrate creates as lvrf_owner.
ALTER DEFAULT PRIVILEGES FOR ROLE lvrf_owner IN SCHEMA public GRANT SELECT, INSERT ON TABLES TO lvrf_app;
ALTER DEFAULT PRIVILEGES FOR ROLE lvrf_owner IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO lvrf_app;

COMMIT;
