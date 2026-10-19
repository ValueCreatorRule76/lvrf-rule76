#!/usr/bin/env bash
#
# OWN-1 (LVRF_PLAN §6; decisions OWN-1-D1–D3) — the app role owns nothing and
# cannot rewrite the rules that bind it. Local verification, on THROWAWAY
# CLONES only: real local lvrf is never converted (OWN-1-D1), and nothing
# here touches prod (OWN-1-D2: the refusals are proved on clones).
#
#   ./scripts/verify_ownership.sh
#
# 1. A clone converted by db/ownership.sql, migrated as lvrf_migrate, hardened:
#    lvrf_owner owns everything, section 24 passes, check_ownership.ts and
#    check_migrate_role.ts agree.
# 2. Attempts AS lvrf_app, each refused, and nothing changed afterwards.
# 3. A migration as lvrf_migrate: its table is lvrf_owner's, with the default
#    privileges (lvrf_app SELECT and INSERT, nothing else).
# 4. DELIBERATE BREAKS (database state, as the superuser), each restored:
#    B1 a table back to lvrf_app; B2 UPDATE on refusals; B2b UPDATE on
#    audit_log; B3 a migration as lvrf_app (CREATE granted back); B4 a
#    disabled trigger. Each says which guard catches it: hardening.sql
#    section 24, deploy step 5d (check_ownership.ts), or both.
# 5. The proof on a converted PROD COPY: the attempts, each refused.
# 6. Real local lvrf: unchanged (still lvrf_app's, as before OWN-1 deploys).

set -euo pipefail
cd "$(dirname "$0")/.."
. scripts/lib/clone.sh
EXPECT_TRIGGERS="$(grep -oE '^--   Total: [0-9]+ distinct triggers' db/hardening.sql | grep -oE '[0-9]+')"
[ -n "$EXPECT_TRIGGERS" ] || { echo "REFUSING: no 'Total: N distinct triggers' line in db/hardening.sql"; exit 1; }
LOCAL_URL="$(grep '^DATABASE_URL=' .env | cut -d= -f2-)"
case "$LOCAL_URL" in *@localhost:*|*@127.0.0.1:*) ;; *) echo "REFUSING: .env is not localhost"; exit 1 ;; esac
case "$LOCAL_URL" in */lvrf) ;; *) echo "REFUSING: .env does not name lvrf"; exit 1 ;; esac

VERIFY_DB=lvrf_verifyown1
COPY_DB=lvrf_verifyown1copy
APP_URL="${LOCAL_URL%/*}/${VERIFY_DB}"
COPY_APP_URL="${LOCAL_URL%/*}/${COPY_DB}"
W="$(mktemp -d "${TMPDIR:-/tmp}/lvrf_own1.XXXXXX")"
PASS=0; FAIL=0
step() { echo; echo "==> $*"; }
ok()   { PASS=$((PASS + 1)); echo "  PASS  $*"; }
bad()  { FAIL=$((FAIL + 1)); echo "  FAIL  $*"; }
cleanup() { dropdb --if-exists "$VERIFY_DB" 2>/dev/null || true; dropdb --if-exists "$COPY_DB" 2>/dev/null || true; rm -rf "$W"; }
trap cleanup EXIT
q()  { psql -X -At -d "$1" -c "$2"; }                     # as the local superuser
harden() { psql -X -q -v ON_ERROR_STOP=1 -d "$1" -f db/hardening.sql > "$W/harden.log" 2>&1; }
owncheck() { DATABASE_URL="$1" npx tsx scripts/check_ownership.ts > "$W/own.log" 2>&1; }
triggers() { q "$1" "SELECT count(DISTINCT trigger_name) FROM information_schema.triggers WHERE trigger_schema = 'public'"; }

step "1. Typecheck"
npx tsc -p tsconfig.scripts.json --noEmit > "$W/tsc.log" 2>&1 && ok "scripts tsc" || { bad "scripts tsc: $(head -5 "$W/tsc.log")"; }

REAL_BEFORE="$(q lvrf "SELECT datdba::regrole FROM pg_database WHERE datname = 'lvrf'")|$(q lvrf "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relowner = 'lvrf_app'::regrole")"

step "2. A converted clone: ownership.sql, migrate as lvrf_migrate, harden"
dropdb --if-exists "$VERIFY_DB"
make_clone "$VERIFY_DB" && ok "cloned and converted (make_clone)" || { bad "make_clone"; exit 1; }
migrate_clone "$VERIFY_DB" > "$W/migrate.log" 2>&1 && ok "migrated as lvrf_migrate, grants re-applied" || { bad "migrate: $(tail -3 "$W/migrate.log")"; exit 1; }
harden "$VERIFY_DB" && ok "hardened: section 24's assertion passes" || { bad "hardening: $(grep -m1 'ERROR' "$W/harden.log")"; exit 1; }
[ "$(triggers "$VERIFY_DB")" = "$EXPECT_TRIGGERS" ] && ok "$EXPECT_TRIGGERS distinct triggers (unchanged by OWN-1)" || bad "triggers: $(triggers "$VERIFY_DB")"
[ "$(q "$VERIFY_DB" "SELECT datdba::regrole FROM pg_database WHERE datname = current_database()")|$(q "$VERIFY_DB" "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname IN ('public','drizzle') AND c.relkind IN ('r','S') AND c.relowner <> 'lvrf_owner'::regrole")|$(q "$VERIFY_DB" "SELECT count(*) FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'public' AND t.typtype = 'e' AND t.typowner <> 'lvrf_owner'::regrole")" = "lvrf_owner|0|0" ] \
  && ok "lvrf_owner owns the database, every table and sequence, every enum" || bad "ownership: $(q "$VERIFY_DB" "SELECT relowner::regrole, count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname IN ('public','drizzle') AND c.relkind IN ('r','S') GROUP BY 1")"
owncheck "$APP_URL" && ok "check_ownership.ts (deploy step 5d), as lvrf_app: $(tail -1 "$W/own.log")" || bad "check_ownership: $(cat "$W/own.log")"
DATABASE_URL="$(migrate_url "$VERIFY_DB")" npx tsx scripts/check_migrate_role.ts > "$W/role.log" 2>&1 && ok "check_migrate_role.ts: $(cat "$W/role.log")" || bad "check_migrate_role: $(cat "$W/role.log")"
DATABASE_URL="$APP_URL" npx tsx scripts/check_migrate_role.ts > "$W/role.log" 2>&1 && bad "check_migrate_role accepted lvrf_app" || ok "  ...and refuses the app's URL: $(cat "$W/role.log")"
[ "$(q "$VERIFY_DB" "SELECT has_table_privilege('lvrf_app','evidence','UPDATE')::text || has_table_privilege('lvrf_app','value_runs','INSERT')::text || has_table_privilege('lvrf_app','tenants','INSERT')::text || has_table_privilege('lvrf_app','drizzle.__drizzle_migrations','SELECT')::text")" = "truetruefalsetrue" ] \
  && ok "the grants follow the code: UPDATE on evidence, INSERT on value_runs, no INSERT on tenants, SELECT on the migrations table" || bad "grants"

# Each attempt runs AS lvrf_app; it must fail with "must be owner" or
# "permission denied", and the state it targets must be unchanged after.
attempt() {  # URL LABEL SQL [CHECK_DB CHECK_SQL EXPECTED]
  local out; out="$(psql -X -q -v ON_ERROR_STOP=1 "$1" -c "$3" 2>&1)" && { bad "$2: NOT refused ($out)"; return; }
  if printf '%s' "$out" | grep -qE 'must be owner|permission denied|must be superuser|only superusers'; then
    if [ -n "${4:-}" ] && [ "$(q "$4" "$5")" != "$6" ]; then bad "$2: refused, but the state changed: $(q "$4" "$5")"; return; fi
    ok "$2 -> refused: $(printf '%s' "$out" | grep -m1 -oE 'ERROR: .*' | cut -c1-90)"
  else bad "$2: failed for another reason: $out"; fi
}
grant_attempt() {  # URL LABEL DB — GRANT without the privilege only WARNs; the privilege must stay absent
  local out; out="$(psql -X -q "$1" -c "GRANT UPDATE ON audit_log TO lvrf_app" 2>&1 || true)"
  [ "$(q "$3" "SELECT has_table_privilege('lvrf_app','audit_log','UPDATE')")" = "f" ] \
    && ok "$2 -> refused: lvrf_app still has no UPDATE on audit_log ($(printf '%s' "$out" | grep -m1 -oE '(WARNING|ERROR): .*' | cut -c1-70))" \
    || bad "$2: lvrf_app now holds UPDATE on audit_log"
}
LOCKTRIG="SELECT tgenabled FROM pg_trigger WHERE tgname = 'value_runs_locked_immutable'"

step "3. As lvrf_app: every attempt to rewrite the rules is refused"
attempt "$APP_URL" "DROP TRIGGER (the locked-run guard)" "DROP TRIGGER value_runs_locked_immutable ON value_runs" "$VERIFY_DB" "$LOCKTRIG" "O"
attempt "$APP_URL" "DISABLE TRIGGER" "ALTER TABLE value_runs DISABLE TRIGGER value_runs_locked_immutable" "$VERIFY_DB" "$LOCKTRIG" "O"
grant_attempt "$APP_URL" "GRANT itself UPDATE on audit_log" "$VERIFY_DB"
attempt "$APP_URL" "ADD COLUMN" "ALTER TABLE evidence ADD COLUMN own1_probe int" "$VERIFY_DB" "SELECT count(*) FROM information_schema.columns WHERE table_name = 'evidence' AND column_name = 'own1_probe'" "0"
attempt "$APP_URL" "CREATE TABLE" "CREATE TABLE own1_probe (i int)" "$VERIFY_DB" "SELECT count(*) FROM pg_tables WHERE tablename = 'own1_probe'" "0"
attempt "$APP_URL" "DROP TABLE refusals" "DROP TABLE refusals" "$VERIFY_DB" "SELECT count(*) FROM pg_tables WHERE tablename = 'refusals'" "1"
R0="$(q "$VERIFY_DB" "SELECT count(*) FROM refusals")"
attempt "$APP_URL" "TRUNCATE refusals" "TRUNCATE refusals" "$VERIFY_DB" "SELECT count(*) FROM refusals" "$R0"
attempt "$APP_URL" "DELETE FROM refusals" "DELETE FROM refusals" "$VERIFY_DB" "SELECT count(*) FROM refusals" "$R0"
attempt "$APP_URL" "UPDATE audit_log" "UPDATE audit_log SET operation = operation" "$VERIFY_DB" "SELECT count(*) FROM audit_log" "$(q "$VERIFY_DB" "SELECT count(*) FROM audit_log")"
attempt "$APP_URL" "session_replication_role = replica (triggers off)" "SET session_replication_role = replica"
attempt "$APP_URL" "ALTER DATABASE OWNER" "ALTER DATABASE $VERIFY_DB OWNER TO lvrf_app" "$VERIFY_DB" "SELECT datdba::regrole FROM pg_database WHERE datname = current_database()" "lvrf_owner"
attempt "$APP_URL" "CREATE OR REPLACE the ownership check" "CREATE OR REPLACE FUNCTION lvrf_ownership_violations() RETURNS SETOF text LANGUAGE sql AS 'SELECT NULL::text WHERE false'"
[ "$(triggers "$VERIFY_DB")" = "$EXPECT_TRIGGERS" ] && owncheck "$APP_URL" && ok "  ...after all of them: $EXPECT_TRIGGERS triggers, and the ownership check still passes" || bad "  ...state after the attempts: $(triggers "$VERIFY_DB") triggers; $(cat "$W/own.log")"

step "4. A migration as lvrf_migrate creates lvrf_owner's table, with the default privileges"
psql -X -q -v ON_ERROR_STOP=1 "$(migrate_url "$VERIFY_DB")" -c "CREATE TABLE own1_migration_probe (id int)" > /dev/null 2>&1 && ok "a migration-style CREATE TABLE as lvrf_migrate" || bad "CREATE as lvrf_migrate"
[ "$(q "$VERIFY_DB" "SELECT relowner::regrole || '|' || has_table_privilege('lvrf_app','own1_migration_probe','SELECT') || has_table_privilege('lvrf_app','own1_migration_probe','INSERT') || has_table_privilege('lvrf_app','own1_migration_probe','UPDATE') || has_table_privilege('lvrf_app','own1_migration_probe','DELETE') FROM pg_class WHERE relname = 'own1_migration_probe'")" = "lvrf_owner|truetruefalsefalse" ] \
  && ok "  ...owned by lvrf_owner; lvrf_app gets SELECT and INSERT only (default privileges)" || bad "  ...$(q "$VERIFY_DB" "SELECT relowner::regrole FROM pg_class WHERE relname = 'own1_migration_probe'")"
harden "$VERIFY_DB" && ok "  ...and hardening still passes" || bad "  ...hardening: $(grep -m1 ERROR "$W/harden.log")"
psql -X -q "$(migrate_url "$VERIFY_DB")" -c "DROP TABLE own1_migration_probe" > /dev/null 2>&1 && ok "  (the probe table dropped by its owner; not a governed object)" || bad "probe drop"

step "5. Deliberate breaks (database state on the clone), each restored"
restore_db() { psql -X -q -v ON_ERROR_STOP=1 -d "$VERIFY_DB" -f db/ownership.sql > /dev/null 2>&1 && harden "$VERIFY_DB" && owncheck "$APP_URL" && ok "  ...restored: ownership.sql + hardening, the check passes" || bad "  ...restore failed: $(grep -m1 ERROR "$W/harden.log") $(cat "$W/own.log")"; }
# B1 — a table back to lvrf_app: both guards catch it.
q "$VERIFY_DB" "ALTER TABLE value_levers OWNER TO lvrf_app" > /dev/null
harden "$VERIFY_DB" && bad "B1: hardening passed with lvrf_app owning value_levers" || { grep -q 'lvrf_app owns table public.value_levers' "$W/harden.log" && ok "B1: a table back to lvrf_app -> hardening.sql section 24 fails, naming it (and rolls back)" || bad "B1: hardening failed otherwise: $(grep -m1 ERROR "$W/harden.log")"; }
owncheck "$APP_URL" && bad "B1: check_ownership passed" || { grep -q 'VIOLATION lvrf_app owns table public.value_levers' "$W/own.log" && ok "  ...and deploy step 5d refuses, naming it" || bad "  ...5d: $(cat "$W/own.log")"; }
restore_db
# B2 — UPDATE on refusals: nothing else revokes it, so section 24 is the guard.
q "$VERIFY_DB" "GRANT UPDATE ON refusals TO lvrf_app" > /dev/null
harden "$VERIFY_DB" && bad "B2: hardening passed with UPDATE on refusals" || { grep -q 'lvrf_app holds UPDATE on refusals' "$W/harden.log" && ok "B2: UPDATE on refusals -> hardening.sql section 24 fails, naming it" || bad "B2: $(grep -m1 ERROR "$W/harden.log")"; }
owncheck "$APP_URL" && bad "B2: check_ownership passed" || ok "  ...and deploy step 5d refuses"
restore_db
# B2b — UPDATE on audit_log: section 7 re-revokes it on every hardening run, so
# hardening REPAIRS it; deploy step 5d is the guard for the state between runs.
q "$VERIFY_DB" "GRANT UPDATE ON audit_log TO lvrf_app" > /dev/null
owncheck "$APP_URL" && bad "B2b: check_ownership passed with UPDATE on audit_log" || { grep -q 'lvrf_app holds UPDATE on audit_log' "$W/own.log" && ok "B2b: UPDATE on audit_log -> deploy step 5d refuses, naming it" || bad "B2b: $(cat "$W/own.log")"; }
harden "$VERIFY_DB" && [ "$(q "$VERIFY_DB" "SELECT has_table_privilege('lvrf_app','audit_log','UPDATE')")" = "f" ] && ok "  ...and hardening repairs it (section 7 revokes UPDATE on audit_log every run)" || bad "  ...hardening did not repair it"
restore_db
# B3 — a migration as lvrf_app: only possible if CREATE is given back; then
# its table is lvrf_app's and both guards catch it.
q "$VERIFY_DB" "GRANT CREATE ON SCHEMA public TO lvrf_app" > /dev/null
psql -X -q -v ON_ERROR_STOP=1 "$APP_URL" -c "CREATE TABLE own1_app_probe (i int)" > /dev/null 2>&1 && ok "B3: with CREATE given back, a 'migration' as lvrf_app creates a table" || bad "B3: CREATE as lvrf_app failed"
harden "$VERIFY_DB" && bad "B3: hardening passed" || { grep -q 'lvrf_app owns table public.own1_app_probe' "$W/harden.log" && grep -q 'lvrf_app holds CREATE on schema public' "$W/harden.log" && ok "  ...hardening.sql section 24 fails, naming the table and the CREATE" || bad "  ...$(grep -m1 ERROR "$W/harden.log")"; }
owncheck "$APP_URL" && bad "B3: check_ownership passed" || ok "  ...and deploy step 5d refuses"
q "$VERIFY_DB" "DROP TABLE own1_app_probe" > /dev/null
restore_db
# B4 — a disabled trigger: hardening re-creates every trigger (enabled), so it
# REPAIRS this; deploy step 5d is the guard for the state between runs.
q "$VERIFY_DB" "ALTER TABLE value_runs DISABLE TRIGGER value_runs_locked_immutable" > /dev/null
owncheck "$APP_URL" && bad "B4: check_ownership passed with a disabled trigger" || { grep -q 'VIOLATION trigger value_runs_locked_immutable on value_runs is disabled' "$W/own.log" && ok "B4: a disabled trigger -> deploy step 5d refuses, naming it" || bad "B4: $(cat "$W/own.log")"; }
harden "$VERIFY_DB" && [ "$(q "$VERIFY_DB" "$LOCKTRIG")" = "O" ] && ok "  ...and hardening repairs it (every trigger is re-created enabled)" || bad "  ...hardening did not repair it"
restore_db

step "6. The proof on a converted PROD COPY (lvrf_prodcopy, cloned; prod itself untouched)"
dropdb --if-exists "$COPY_DB"
make_clone "$COPY_DB" lvrf_prodcopy && migrate_clone "$COPY_DB" > "$W/copymig.log" 2>&1 && harden "$COPY_DB" \
  && ok "a prod copy converted, migrated as lvrf_migrate, hardened ($(q "$COPY_DB" "SELECT count(*) FROM value_runs") runs, $(q "$COPY_DB" "SELECT count(*) FROM audit_log") audit rows)" || { bad "prod copy: $(tail -3 "$W/copymig.log") $(grep -m1 ERROR "$W/harden.log")"; exit 1; }
owncheck "$COPY_APP_URL" && ok "  ...the ownership check passes as lvrf_app" || bad "  ...$(cat "$W/own.log")"
attempt "$COPY_APP_URL" "prod copy: DROP TRIGGER" "DROP TRIGGER value_runs_locked_immutable ON value_runs" "$COPY_DB" "$LOCKTRIG" "O"
grant_attempt "$COPY_APP_URL" "prod copy: GRANT itself UPDATE on audit_log" "$COPY_DB"
attempt "$COPY_APP_URL" "prod copy: DISABLE TRIGGER" "ALTER TABLE value_runs DISABLE TRIGGER value_runs_locked_immutable" "$COPY_DB" "$LOCKTRIG" "O"

step "7. Real local lvrf: not converted (OWN-1-D1)"
REAL_AFTER="$(q lvrf "SELECT datdba::regrole FROM pg_database WHERE datname = 'lvrf'")|$(q lvrf "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relowner = 'lvrf_app'::regrole")"
[ "$REAL_AFTER" = "$REAL_BEFORE" ] && ok "real local lvrf unchanged: owner and lvrf_app-owned relations $REAL_AFTER" || bad "real local lvrf changed: $REAL_BEFORE -> $REAL_AFTER"
(make_clone lvrf > /dev/null 2>&1) && bad "make_clone accepted lvrf" || ok "make_clone refuses to convert real local lvrf"

# Owner and privilege state, as text, for comparing two databases: the
# database, schemas, every relation (lvrf_app's privileges on each), types,
# functions (lvrf_ownership_violations excluded: OWN-1's, the superuser's,
# harmless after a rollback), and what PUBLIC may create.
snapshot() {  # DB
  psql -X -At -d "$1" <<'SQL'
SELECT 'db|' || d.datdba::regrole || '|' || has_database_privilege('lvrf_app', d.datname, 'CREATE') || has_database_privilege('lvrf_app', d.datname, 'CONNECT') || has_database_privilege('lvrf_app', d.datname, 'TEMP') || '|public:' || has_database_privilege('public', d.datname, 'CREATE')
  FROM pg_database d WHERE d.datname = current_database();
SELECT 'schema|' || n.nspname || '|' || n.nspowner::regrole || '|' || has_schema_privilege('lvrf_app', n.oid, 'CREATE') || has_schema_privilege('lvrf_app', n.oid, 'USAGE') || '|public:' || has_schema_privilege('public', n.oid, 'CREATE')
  FROM pg_namespace n WHERE n.nspname IN ('public', 'drizzle') ORDER BY 1;
SELECT 'rel|' || n.nspname || '.' || c.relname || '|' || c.relowner::regrole || '|' ||
       CASE WHEN c.relkind = 'S' THEN has_sequence_privilege('lvrf_app', c.oid, 'USAGE')::text || has_sequence_privilege('lvrf_app', c.oid, 'SELECT') || has_sequence_privilege('lvrf_app', c.oid, 'UPDATE')
            ELSE (SELECT string_agg(has_table_privilege('lvrf_app', c.oid, p)::text, '' ORDER BY p) FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p) END
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname IN ('public', 'drizzle') AND c.relkind IN ('r', 'p', 'S', 'v', 'm') ORDER BY 1;
SELECT 'type|' || n.nspname || '.' || t.typname || '|' || t.typowner::regrole
  FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname IN ('public', 'drizzle') AND t.typtype IN ('e', 'd') ORDER BY 1;
SELECT 'func|' || p.oid::regprocedure || '|' || pg_get_userbyid(p.proowner)
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname IN ('public', 'drizzle') AND p.proname <> 'lvrf_ownership_violations' ORDER BY 1;
SQL
}

step "8. The rollback (db/ownership_rollback.sql) returns a converted database to today's pre-OWN-1 state"
PRE_OWN1_COMMIT=6a6eaf1   # the last commit before OWN-1: its hardening.sql is what prod runs today
PRE_DB=lvrf_verifyown1pre
dropdb --if-exists "$PRE_DB"
git show "$PRE_OWN1_COMMIT:db/hardening.sql" > "$W/hardening_pre.sql"
createdb -T lvrf -O lvrf_app "$PRE_DB" \
  && DATABASE_URL="${LOCAL_URL%/*}/$PRE_DB" npx drizzle-kit migrate > "$W/premig.log" 2>&1 \
  && psql -X -q -v ON_ERROR_STOP=1 -d "$PRE_DB" -f "$W/hardening_pre.sql" > /dev/null 2>&1 \
  && ok "a pre-OWN-1 database, built as prod is today: cloned by lvrf_app, migrated as lvrf_app, hardened with $PRE_OWN1_COMMIT's hardening.sql" \
  || { bad "pre-OWN-1 build: $(tail -3 "$W/premig.log")"; }
psql -X -q -v ON_ERROR_STOP=1 -d "$VERIFY_DB" -f db/ownership_rollback.sql > "$W/rollback.log" 2>&1 && ok "db/ownership_rollback.sql applied to the converted clone" || bad "rollback: $(grep -m1 ERROR "$W/rollback.log")"
snapshot "$PRE_DB" | sed "s/$PRE_DB/DB/g" > "$W/snap_pre.txt"; snapshot "$VERIFY_DB" | sed "s/$VERIFY_DB/DB/g" > "$W/snap_rolled.txt"
if cmp -s "$W/snap_pre.txt" "$W/snap_rolled.txt"; then
  ok "  ...identical to the pre-OWN-1 database: owners, and lvrf_app's privileges on every one of $(grep -c '^rel|' "$W/snap_pre.txt") relations, the schemas and the database ($(wc -l < "$W/snap_pre.txt" | tr -d ' ') lines compared)"
else
  bad "  ...differs from pre-OWN-1: $(diff "$W/snap_pre.txt" "$W/snap_rolled.txt" | head -8 | tr '\n' ' ')"
fi
owncheck "$APP_URL" && bad "  ...check_ownership passed after a rollback" || ok "  ...and deploy step 5d now refuses (by design: a rollback blocks the next deploy until OWN-1 is fixed)"
[ "$(q postgres "SELECT rolcanlogin FROM pg_roles WHERE rolname = 'lvrf_migrate'")" = "f" ] && ok "  ...lvrf_migrate set NOLOGIN" || bad "  ...lvrf_migrate can still log in"
q postgres "ALTER ROLE lvrf_migrate LOGIN" > /dev/null && ok "  (local: lvrf_migrate's LOGIN given back for the other verify scripts)"
dropdb --if-exists "$PRE_DB"

step "9. Gate B's password handling: paste 3 (with \\set), then paste 4 (without), then a rotation"
MURL="$(grep '^MIGRATE_DATABASE_URL=' .env.migrate | cut -d= -f2-)"
pw_of() { local u="${1#postgres://lvrf_migrate:}"; echo "${u%%@*}"; }
hash_now() { q postgres "SELECT rolpassword FROM pg_authid WHERE rolname = 'lvrf_migrate'"; }
dropdb --if-exists "$COPY_DB"; createdb -T lvrf_prodcopy "$COPY_DB"
H0="$(hash_now)"
MPW="$(pw_of "$MURL")"; { printf "\\\\set migrate_password '%s'\n" "$MPW"; cat db/ownership.sql; } | psql -X -q -v ON_ERROR_STOP=1 -d "$COPY_DB" > "$W/p3.out" 2>&1; P3=$?; unset MPW
H1="$(hash_now)"
[ "$P3" = "0" ] && [ "$H1" != "$H0" ] && ok "paste 3's method: ownership.sql with \\set migrate_password sets the password (a new SCRAM hash)" || bad "paste 3: exit $P3, hash changed: $([ "$H1" != "$H0" ] && echo yes || echo no)"
grep -q "$(pw_of "$MURL")" "$W/p3.out" && bad "  ...the password appears in psql's output" || ok "  ...and the password is not in psql's output ($(wc -c < "$W/p3.out" | tr -d ' ') bytes, notices only)"
DATABASE_URL="${MURL%/*}/$COPY_DB" npx tsx scripts/check_migrate_role.ts > "$W/role.log" 2>&1 && ok "  ...lvrf_migrate logs in with it: $(cat "$W/role.log")" || bad "  ...login: $(cat "$W/role.log")"
env -u LVRF_MIGRATE_PASSWORD psql -X -q -v ON_ERROR_STOP=1 -d "$COPY_DB" -f db/ownership.sql > /dev/null 2>&1 && P4=0 || P4=$?
[ "$P4" = "0" ] && [ "$(hash_now)" = "$H1" ] && ok "paste 4's second run, without the password: exit 0, the password hash UNCHANGED (\\getenv leaves an unset variable unset; \\if skips ALTER ROLE)" || bad "paste 4: exit $P4, hash changed: $([ "$(hash_now)" != "$H1" ] && echo yes || echo no)"
DATABASE_URL="${MURL%/*}/$COPY_DB" npx tsx scripts/check_migrate_role.ts > /dev/null 2>&1 && ok "  ...and lvrf_migrate still logs in" || bad "  ...login failed after the second run"
migrate_clone "$COPY_DB" > /dev/null 2>&1 && harden "$COPY_DB" && owncheck "${LOCAL_URL%/*}/$COPY_DB" && ok "  ...then migrate as lvrf_migrate, harden, the ownership check: all pass (paste 4's sequence)" || bad "  ...paste 4 sequence: $(grep -m1 ERROR "$W/harden.log") $(cat "$W/own.log")"
# The rotation command, as given to Brad (into a temporary file here; rotated back after).
ROT="$W/rot.env"
install -m 600 /dev/null "$ROT" && printf 'MIGRATE_DATABASE_URL=postgres://lvrf_migrate:%s@%s\n' "$(openssl rand -hex 24)" "${MURL#*@}" > "$ROT"
NPW="$(pw_of "$(grep '^MIGRATE_DATABASE_URL=' "$ROT" | cut -d= -f2-)")"; printf "ALTER ROLE lvrf_migrate PASSWORD '%s';\n" "$NPW" | psql -X -q -v ON_ERROR_STOP=1 -d postgres > "$W/rot.out" 2>&1; RC=$?; unset NPW
[ "$RC" = "0" ] && [ ! -s "$W/rot.out" ] && [ "$(stat -f %Lp "$ROT")" = "600" ] && ok "rotation: a new password into a 600 file, ALTER ROLE through stdin, nothing printed" || bad "rotation: exit $RC, output $(wc -c < "$W/rot.out") bytes, mode $(stat -f %Lp "$ROT")"
DATABASE_URL="$(grep '^MIGRATE_DATABASE_URL=' "$ROT" | cut -d= -f2- | sed "s#/[^/]*\$#/$COPY_DB#")" npx tsx scripts/check_migrate_role.ts > /dev/null 2>&1 && ok "  ...lvrf_migrate logs in with the rotated password" || bad "  ...rotated login failed"
OPW="$(pw_of "$MURL")"; printf "ALTER ROLE lvrf_migrate PASSWORD '%s';\n" "$OPW" | psql -X -q -v ON_ERROR_STOP=1 -d postgres > /dev/null 2>&1; unset OPW
DATABASE_URL="${MURL%/*}/$COPY_DB" npx tsx scripts/check_migrate_role.ts > /dev/null 2>&1 && ok "  (local password rotated back to .env.migrate's)" || bad "local password not restored"

echo
echo "==> ${PASS} passed, ${FAIL} failed"
[ "$FAIL" = "0" ]
