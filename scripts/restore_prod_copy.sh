#!/usr/bin/env bash
#
# Restore a prod snapshot into a LOCAL copy, lvrf_prodcopy, for realistic
# testing. Dev Mac only. Repeatable: drops and recreates lvrf_prodcopy each
# run. NEVER touches lvrf.
#
#   ./scripts/restore_prod_copy.sh ~/lvrf-backups/lvrf_snapshot_<timestamp>.dump
#
# Optional expectations, asserted when set (otherwise counts are printed):
#   EXPECT_MEASURES  current industry_measures
#   EXPECT_EXCLUSIONS industry_measure_exclusions rows
#   EXPECT_ACCOUNTS  current institutions
#   EXPECT_RUNS      value_runs (not deleted)
#
# HOW OWNERSHIP IS REPRODUCED, AND WHY THIS WAY.
# On prod, migrations run as lvrf_app, so lvrf_app owns every table, sequence,
# type and the drizzle schema; hardening.sql runs as the superuser, so the
# trigger functions (lvrf_audit() is SECURITY DEFINER) belong to a superuser
# and lvrf_app has UPDATE/DELETE/TRUNCATE revoked on audit_log and
# heartbeat_events. A plain pg_restore would try to hand the functions to a
# role named postgres, which does not exist on this Mac. So:
#   1. pg_restore --no-owner --no-acl, as the local superuser — everything
#      lands owned by the superuser, with no grants or revokes.
#   2. Every relation, type and the drizzle schema that is not part of an
#      extension is handed to lvrf_app — what migrations do on prod.
#      Functions are deliberately left with the superuser — what
#      hardening.sql does on prod.
#   3. hardening.sql re-applies the triggers, the REVOKEs and the GRANTs that
#      --no-acl dropped.
# Rejected: restoring everything as lvrf_app (--role=lvrf_app). That would
# make lvrf_app the owner of the SECURITY DEFINER audit function, so the app
# role could redefine the audit trail meant to bind it — weaker than prod.
#
# THE vector EXTENSION IS LEFT OUT. Prod has pgvector installed and unused
# (CLAUDE.md); this Mac does not have it. No column, index or function in the
# schema uses it — checked against the snapshot. Its two TOC entries
# (EXTENSION, COMMENT) are filtered out of the restore list; any other object
# that needed it would fail the restore loudly (--exit-on-error).

set -euo pipefail
cd "$(dirname "$0")/.."
# The expected trigger total is read from db/hardening.sql's Verification
# block — the one place it is declared (CLAUDE.md: no file restates a
# canonical value). A migration that adds triggers updates that line, and
# every script follows.
EXPECT_TRIGGERS="$(grep -oE '^--   Total: [0-9]+ distinct triggers' db/hardening.sql | grep -oE '[0-9]+')"
[ -n "$EXPECT_TRIGGERS" ] || { echo "REFUSING: no 'Total: N distinct triggers' line in db/hardening.sql"; exit 1; }

TARGET=lvrf_prodcopy
DUMP="${1:-}"

[ -n "$DUMP" ] || { echo "usage: $0 <path/to/snapshot.dump>"; exit 1; }
[ -r "$DUMP" ] || { echo "REFUSING: cannot read $DUMP"; exit 1; }

LOCAL_URL="$(grep '^DATABASE_URL=' .env | cut -d= -f2-)"
case "$LOCAL_URL" in *@localhost:*|*@127.0.0.1:*) ;; *) echo "REFUSING: .env DATABASE_URL is not localhost"; exit 1 ;; esac
case "$LOCAL_URL" in */lvrf) ;; *) echo "REFUSING: .env DATABASE_URL does not name lvrf"; exit 1 ;; esac
# Belt and braces: the only database this script ever drops, creates or
# writes is TARGET, and TARGET is not lvrf.
[ "$TARGET" = "lvrf_prodcopy" ] && [ "$TARGET" != "lvrf" ] || { echo "REFUSING: target must be lvrf_prodcopy"; exit 1; }

PASS=0; FAIL=0
ok()  { PASS=$((PASS + 1)); echo "  PASS  $*"; }
bad() { FAIL=$((FAIL + 1)); echo "  FAIL  $*"; }
q()   { psql -X -At -d "$TARGET" -c "$1"; }

echo "==> Snapshot: $DUMP ($(wc -c < "$DUMP" | tr -d ' ') bytes, $(pg_restore --list "$DUMP" | grep -vc '^;') TOC entries)"

echo "==> Recreate $TARGET (owner lvrf_app)"
dropdb --if-exists "$TARGET"
createdb -O lvrf_app "$TARGET"

echo "==> Restore (--no-owner --no-acl, vector extension filtered out)"
LIST="$(mktemp)"
trap 'rm -f "$LIST"' EXIT
pg_restore --list "$DUMP" | grep -vE '^[0-9]+; [0-9]+ [0-9]+ (EXTENSION|COMMENT) - (EXTENSION )?vector( |$)' > "$LIST"
DROPPED="$(( $(pg_restore --list "$DUMP" | wc -l) - $(wc -l < "$LIST") ))"
[ "$DROPPED" = "2" ] && ok "filtered exactly the 2 vector TOC entries" || { bad "filtered $DROPPED TOC entries (expected 2)"; exit 1; }
pg_restore --no-owner --no-acl --exit-on-error -L "$LIST" -d "$TARGET" "$DUMP"
ok "restored"

echo "==> Ownership as on prod: relations, types and the drizzle schema to lvrf_app; functions stay with the superuser"
psql -X -q -v ON_ERROR_STOP=1 -d "$TARGET" <<'SQL'
DO $$
DECLARE r record;
BEGIN
  ALTER SCHEMA drizzle OWNER TO lvrf_app;
  -- Tables first: ALTER TABLE OWNER also moves the sequences they own.
  FOR r IN
    SELECT c.oid::regclass AS obj, c.relkind
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname IN ('public', 'drizzle') AND c.relkind IN ('r', 'p', 'v', 'm')
       AND c.relowner <> 'lvrf_app'::regrole
       AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_class'::regclass AND d.objid = c.oid AND d.deptype = 'e')
  LOOP
    EXECUTE format('ALTER %s %s OWNER TO lvrf_app',
      CASE r.relkind WHEN 'v' THEN 'VIEW' WHEN 'm' THEN 'MATERIALIZED VIEW' ELSE 'TABLE' END, r.obj);
  END LOOP;
  -- Then any sequence not owned by a table.
  FOR r IN
    SELECT c.oid::regclass AS obj
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname IN ('public', 'drizzle') AND c.relkind = 'S'
       AND c.relowner <> 'lvrf_app'::regrole
       AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_class'::regclass AND d.objid = c.oid AND d.deptype IN ('a', 'i', 'e'))
  LOOP
    EXECUTE format('ALTER SEQUENCE %s OWNER TO lvrf_app', r.obj);
  END LOOP;
  -- Enums and domains (table row types follow their tables).
  FOR r IN
    SELECT t.oid::regtype AS obj, t.typtype
      FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
     WHERE n.nspname IN ('public', 'drizzle') AND t.typtype IN ('e', 'd')
       AND t.typowner <> 'lvrf_app'::regrole
       AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_type'::regclass AND d.objid = t.oid AND d.deptype = 'e')
  LOOP
    EXECUTE format('ALTER %s %s OWNER TO lvrf_app', CASE r.typtype WHEN 'd' THEN 'DOMAIN' ELSE 'TYPE' END, r.obj);
  END LOOP;
END $$;
SQL
ok "ownership transferred"

echo "==> Migrations newer than the snapshot, applied as lvrf_app (as on prod)"
# A snapshot taken before the repo's latest migration would leave tables
# that hardening.sql's later sections reference missing (0027's
# person_credentials and sessions, for one). Applying the pending
# migrations makes the copy prod's data on the repo's current schema —
# what testing unreleased code against real data needs. Printed, so it is
# never silent.
BEFORE_MIG="$(q "SELECT count(*) FROM drizzle.__drizzle_migrations")"
COPY_URL="${LOCAL_URL%/*}/$TARGET"
DATABASE_URL="$COPY_URL" npx drizzle-kit migrate > /tmp/lvrf_prodcopy_migrate.log 2>&1 \
  || { bad "drizzle-kit migrate failed — see /tmp/lvrf_prodcopy_migrate.log"; exit 1; }
AFTER_MIG="$(q "SELECT count(*) FROM drizzle.__drizzle_migrations")"
if [ "$AFTER_MIG" = "$BEFORE_MIG" ]; then ok "snapshot was already at the repo's latest migration"; else ok "applied $((AFTER_MIG - BEFORE_MIG)) migration(s) newer than the snapshot"; fi

echo "==> hardening.sql (re-applies triggers, REVOKEs and GRANTs that --no-acl dropped)"
psql -X -v ON_ERROR_STOP=1 -q -d "$TARGET" -f db/hardening.sql > /tmp/lvrf_prodcopy_hardening.log 2>&1 \
  && ok "hardening.sql applied" || { bad "hardening.sql failed — see /tmp/lvrf_prodcopy_hardening.log"; exit 1; }

echo "==> Checks"
T="$(q "SELECT count(DISTINCT trigger_name) FROM information_schema.triggers WHERE trigger_schema = 'public'")"
[ "$T" = "$EXPECT_TRIGGERS" ] && ok "$EXPECT_TRIGGERS distinct triggers (hardening.sql total)" || bad "triggers: $T (expected $EXPECT_TRIGGERS)"

for tbl in audit_log heartbeat_events; do
  P="$(q "SELECT has_table_privilege('lvrf_app', '$tbl', 'UPDATE')::text || has_table_privilege('lvrf_app', '$tbl', 'DELETE')::text || has_table_privilege('lvrf_app', '$tbl', 'TRUNCATE')::text || '|' || has_table_privilege('lvrf_app', '$tbl', 'INSERT')::text || has_table_privilege('lvrf_app', '$tbl', 'SELECT')::text")"
  [ "$P" = "falsefalsefalse|truetrue" ] && ok "$tbl: UPDATE/DELETE/TRUNCATE revoked from lvrf_app; INSERT/SELECT granted" || bad "$tbl privileges: $P"
done

NOT_APP="$(q "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
               WHERE n.nspname IN ('public','drizzle') AND c.relkind IN ('r','p','S','v','m') AND c.relowner <> 'lvrf_app'::regrole
                 AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_class'::regclass AND d.objid = c.oid AND d.deptype = 'e')")"
[ "$NOT_APP" = "0" ] && ok "every table and sequence is owned by lvrf_app" || bad "$NOT_APP relation(s) not owned by lvrf_app"
FN_APP="$(q "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname LIKE 'lvrf\_%' AND p.proowner = 'lvrf_app'::regrole")"
FN_ALL="$(q "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname LIKE 'lvrf\_%'")"
[ "$FN_APP" = "0" ] && ok "none of the $FN_ALL lvrf_* functions is owned by lvrf_app (superuser, as on prod)" || bad "$FN_APP lvrf_* function(s) owned by lvrf_app"
# The app role cannot redefine the audit function — the reason functions stay with the superuser.
if psql -X -q -d "$TARGET" -c "SET ROLE lvrf_app; CREATE OR REPLACE FUNCTION lvrf_audit() RETURNS trigger LANGUAGE plpgsql AS 'BEGIN RETURN NEW; END';" > /tmp/lvrf_prodcopy_fn.log 2>&1; then
  bad "lvrf_app was able to redefine lvrf_audit()"
else
  ok "lvrf_app cannot redefine lvrf_audit(): $(grep -o 'ERROR:.*' /tmp/lvrf_prodcopy_fn.log | head -1)"
fi

LATEST_WHEN="$(node -e "const j=require('./db/drizzle/meta/_journal.json');const e=j.entries[j.entries.length-1];console.log(e.when+' '+e.tag)")"
DB_WHEN="$(q "SELECT created_at FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 1")"
[ "$DB_WHEN" = "${LATEST_WHEN%% *}" ] && ok "newest migration is the repo's latest: ${LATEST_WHEN#* }" || bad "newest migration $DB_WHEN, repo latest ${LATEST_WHEN}"

MEASURES="$(q "SELECT count(*) FROM industry_measures WHERE deleted_at IS NULL AND superseded_by_id IS NULL")"
EXCLUSIONS="$(q "SELECT count(*) FROM industry_measure_exclusions")"
ACCOUNTS="$(q "SELECT count(*) FROM institutions WHERE deleted_at IS NULL AND superseded_by_id IS NULL")"
RUNS="$(q "SELECT count(*) FROM value_runs WHERE deleted_at IS NULL")"
check_count() {  # LABEL ACTUAL EXPECTED
  if [ -z "$3" ]; then echo "  INFO  $1: $2"; elif [ "$2" = "$3" ]; then ok "$1: $2"; else bad "$1: $2 (expected $3)"; fi
}
check_count "current measures" "$MEASURES" "${EXPECT_MEASURES:-}"
check_count "exclusions" "$EXCLUSIONS" "${EXPECT_EXCLUSIONS:-}"
check_count "current accounts" "$ACCOUNTS" "${EXPECT_ACCOUNTS:-}"
check_count "runs" "$RUNS" "${EXPECT_RUNS:-}"

echo
echo "==> ${PASS} passed, ${FAIL} failed"
[ "$FAIL" -eq 0 ] || exit 1

cat <<'HOW'

Run the app against the copy (never edit .env — this derives the URL from it):

  DATABASE_URL="$(grep '^DATABASE_URL=' .env | cut -d= -f2- | sed 's#/lvrf$#/lvrf_prodcopy#')" npm run dev
  cd client && npm run dev          # in a second terminal; proxies /api to :3001

lvrf_prodcopy is real prod data and governed rows cannot be deleted. Anything
written to it stays until the next restore — rerun this script to reset it.
HOW
