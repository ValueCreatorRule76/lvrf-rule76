#!/usr/bin/env bash
#
# Q4 — drift checks D2 (journal and schema versus the repo; never new code
# against an unmigrated database), D3 (governance triggers), D4
# (supersession pointers). Local verification.
#
#   ./scripts/verify_drift.sh
#
# Clone `lvrf_verifydrift` (make_clone: createdb -T lvrf, then db/ownership.sql), migrated and
# hardened, dropped on exit; a second clone `lvrf_verifydriftbehind`,
# migrated to one migration BEFORE the newest, for the unmigrated case.
# Every fault is introduced as the superuser on the clone, checked, and put
# back.

set -euo pipefail
cd "$(dirname "$0")/.."
. scripts/lib/clone.sh
. scripts/lib/acts.sh
LOCAL_URL="$(grep '^DATABASE_URL=' .env | cut -d= -f2-)"
case "$LOCAL_URL" in *@localhost:*|*@127.0.0.1:*) ;; *) echo "REFUSING: .env is not localhost"; exit 1 ;; esac
case "$LOCAL_URL" in */lvrf) ;; *) echo "REFUSING: .env does not name lvrf"; exit 1 ;; esac

VERIFY_DB=lvrf_verifydrift
BEHIND_DB=lvrf_verifydriftbehind
VERIFY_URL="${LOCAL_URL%/*}/${VERIFY_DB}"
BEHIND_URL="${LOCAL_URL%/*}/${BEHIND_DB}"
PORT=3077
BASE="http://127.0.0.1:${PORT}"
W="$(mktemp -d "${TMPDIR:-/tmp}/lvrf_drift.XXXXXX")"
PASS=0; FAIL=0; SERVER_PID=""
step() { echo; echo "==> $*"; }
ok()   { PASS=$((PASS + 1)); echo "  PASS  $*"; }
bad()  { FAIL=$((FAIL + 1)); echo "  FAIL  $*"; }
cleanup() { [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null || true; sleep 1; dropdb --if-exists "$VERIFY_DB" 2>/dev/null || true; dropdb --if-exists "$BEHIND_DB" 2>/dev/null || true; rm -rf "$W"; }
. scripts/lib/finish.sh
trap finish EXIT
q() { psql -At -d "$VERIFY_DB" -c "$1"; }
d2() { DATABASE_URL="$1" node scripts/check_schema_drift.mjs 2>&1; }
# Exits 2 on a critical finding — the deploy's signal; read, not fatal here.
report() { DATABASE_URL="$VERIFY_URL" npx tsx scripts/drift_report.ts 2>&1 || true; }
# Since L16 (hardening.sql section 17) the clean state has no findings at all.
baseline_ok() {  # the drift report in its expected clean state
  [ "$(report)" = "drift checks D1, D3, D4: no findings" ]
}

step "1. Typecheck"
npx tsc -p tsconfig.json --noEmit && ok "server tsc" || bad "server tsc"
npx tsc -p tsconfig.scripts.json --noEmit && ok "scripts tsc" || bad "scripts tsc"

step "2. Clone, migrate, harden"
dropdb --if-exists "$VERIFY_DB"
make_clone "$VERIFY_DB" && ok "cloned"
migrate_clone "$VERIFY_DB" > /dev/null && ok "migrated"
psql -v ON_ERROR_STOP=1 -q -d "$VERIFY_DB" -f db/hardening.sql > /dev/null 2>&1 && ok "hardened" || { bad "hardening failed"; exit 1; }

step "3. Clean state"
OUT="$(d2 "$VERIFY_URL")"; case "$OUT" in "schema drift: none"*) ok "D2: $OUT" ;; *) bad "D2 on a clean clone: $OUT" ;; esac
baseline_ok && ok "D1/D3/D4: no findings (L16 closed: the four link tables are governed)" || bad "baseline report: $(report)"

step "4. D2 — never new code against an unmigrated database"
dropdb --if-exists "$BEHIND_DB"; make_clone "$BEHIND_DB"
mkdir -p "$W/mig"; cp -R db/drizzle "$W/mig/"
NEWEST_TAG="$(node -e "const j=require('./db/drizzle/meta/_journal.json');console.log(j.entries[j.entries.length-1].tag)")"
rm "$W/mig/drizzle/$NEWEST_TAG.sql"
node -e "const fs=require('fs');const p='$W/mig/drizzle/meta/_journal.json';const j=JSON.parse(fs.readFileSync(p));j.entries.pop();fs.writeFileSync(p,JSON.stringify(j,null,2))"
# A plain object: this config sits outside the repo, where 'drizzle-kit'
# would not resolve as an import.
cat > "$W/mig/drizzle.config.ts" <<EOF
export default { dialect: 'postgresql', schema: '$PWD/db/schema.ts', out: '$W/mig/drizzle', dbCredentials: { url: '$(migrate_url "$BEHIND_DB")' } };
EOF
npx drizzle-kit migrate --config "$W/mig/drizzle.config.ts" > /dev/null && psql -X -q -v ON_ERROR_STOP=1 -d "$BEHIND_DB" -f db/ownership.sql > /dev/null 2>&1 && ok "a second clone migrated to one BEFORE the newest ($NEWEST_TAG not applied)" || bad "could not build the behind clone"
OUT="$(d2 "$BEHIND_URL" || true)"
case "$OUT" in *"D2 critical: UNMIGRATED: 1 migration(s) this code ships are not applied: $NEWEST_TAG"*) ok "check_schema_drift: refused — 1 unapplied migration, named" ;; *) bad "behind: $OUT" ;; esac
# The deploy's own step 5c, extracted and run against the behind clone.
{ echo 'set -euo pipefail; die(){ echo "DEPLOY FAILED: $*"; exit 1; }; log(){ echo "==> $*"; }'
  sed -n '/^# 5c\. Drift, before the restart/,/^# 6\. Restart/p' scripts/lvrf-deploy.sh; echo 'echo "WOULD RESTART"'; } > "$W/step5c.sh"
grep -q 'check_schema_drift.mjs' "$W/step5c.sh" || bad "step 5c not found in lvrf-deploy.sh"
L5C="$(grep -n '^# 5c\.' scripts/lvrf-deploy.sh | cut -d: -f1)"; LRS="$(grep -n '^sudo systemctl restart' scripts/lvrf-deploy.sh | cut -d: -f1)"
[ -n "$L5C" ] && [ "$L5C" -lt "$LRS" ] && ok "lvrf-deploy.sh runs step 5c (line $L5C) before the restart (line $LRS)" || bad "5c is not before the restart"
OUT="$(DATABASE_URL="$BEHIND_URL" bash "$W/step5c.sh" 2>&1 || true)"
case "$OUT" in *"DEPLOY FAILED: D2: the database is not what this code expects"*) ok "the deploy's step 5c against a database one migration behind: refused" ;; *) bad "5c behind: $OUT" ;; esac
case "$OUT" in *"WOULD RESTART"*) bad "  ...it went on to restart" ;; *) ok "  ...before the restart" ;; esac
OUT="$(DATABASE_URL="$VERIFY_URL" bash "$W/step5c.sh" 2>&1 || true)"
case "$OUT" in *"schema drift: none"*"WOULD RESTART"*) ok "the same step against the migrated clone: passes and goes on to restart" ;; *) bad "5c migrated: $OUT" ;; esac

step "5. D2 — the schema against the newest snapshot"
q "ALTER TABLE institutions ADD COLUMN drift_probe text" > /dev/null
OUT="$(d2 "$VERIFY_URL" || true)"; case "$OUT" in *"in the database but not in"*"column institutions.drift_probe null"*) ok "an extra column -> D2 names it" ;; *) bad "extra column: $OUT" ;; esac
q "ALTER TABLE institutions DROP COLUMN drift_probe" > /dev/null
q "ALTER TABLE value_outcome_evidence DROP CONSTRAINT value_outcome_evidence_supports_known" > /dev/null
OUT="$(d2 "$VERIFY_URL" || true)"; case "$OUT" in *"but not in the database: check value_outcome_evidence.value_outcome_evidence_supports_known"*) ok "a dropped CHECK -> D2 names it (the 0013 failure: journal says applied, the object is absent)" ;; *) bad "dropped check: $OUT" ;; esac
q "ALTER TABLE value_outcome_evidence ADD CONSTRAINT value_outcome_evidence_supports_known CHECK (supports IN ('baseline', 'actual', 'impact_basis', 'target_commitment', 'verification'))" > /dev/null
OUT="$(d2 "$VERIFY_URL")"; case "$OUT" in "schema drift: none"*) ok "  ...restored: none" ;; *) bad "restore: $OUT" ;; esac

step "6. D3 — governance triggers"
q "DROP TRIGGER institutions_touch ON institutions" > /dev/null
R="$(report)"; echo "$R" | grep -q "institutions (_touch)" && ok "a dropped _touch -> D3 names institutions (_touch)" || bad "dropped touch: $R"
echo "$R" | grep -q "^D1 critical: 1 trigger(s) recorded in hardening_manifest .*institutions.institutions_touch" && ok "  ...and D1 (declared, now gone) fires critical alongside it" || bad "D1 with dropped touch: $R"
q "CREATE TABLE drift_probe (id uuid PRIMARY KEY, updated_at timestamptz)" > /dev/null
R="$(report)"; echo "$R" | grep -q "drift_probe (_touch, _no_delete, _audit)" && ok "a new ungoverned table -> D3 names it, owing all three" || bad "new table: $R"
q "DROP TABLE drift_probe" > /dev/null
psql -v ON_ERROR_STOP=1 -q -d "$VERIFY_DB" -f db/hardening.sql > /dev/null 2>&1
baseline_ok && ok "  ...restored (hardening.sql re-run): no findings" || bad "D3 restore: $(report)"

step "7. D4 — supersession pointers"
STAFF="$(q "SELECT id FROM persons WHERE tenant_id IS NOT NULL AND NOT simulated AND deleted_at IS NULL ORDER BY created_at LIMIT 1")"
INST="$(q "SELECT id FROM institutions WHERE deleted_at IS NULL ORDER BY created_at LIMIT 1")"
fact() { local ev; ev="$(q "INSERT INTO evidence (evidence_form, institution_id, kind, summary, provenance, confidence, captured_by_person_id) VALUES ('statement', '$INST', 'observation', 'D4 fixture', 'Verification fixture, not a source', 'low', '$STAFF') RETURNING id" | head -1)"
  q "INSERT INTO institution_facts (institution_id, kind, value_text, as_of, evidence_id, captured_by_person_id) VALUES ('$INST', 'system', '$1', '2026-10-01', '$ev', '$STAFF') RETURNING id" | head -1; }
FA="$(fact 'D4 old')"; FB="$(fact 'D4 new')"; FC="$(fact 'D4 other')"
# P2: each governed transition written by SQL on the clone carries its act (scripts/lib/acts.sh).
SUP='POST /api/institutions/:institutionId/facts/:factId/supersede'
q "UPDATE institution_facts SET superseded_by_id = '$FB', supersession_reason = 'Verification: a D4 fixture chain.' WHERE id = '$FA'; $(act_sql supersede institution_facts "$FA" "$STAFF" "$SUP" institution_facts "$FB")" > /dev/null
baseline_ok && ok "a sound chain (A -> B) -> no D4" || bad "sound chain: $(report)"
q "UPDATE institution_facts SET deleted_at = now() WHERE id = '$FB'; $(act_sql supersede institution_facts "$FB" "$STAFF" "$SUP")" > /dev/null
R="$(report)"; echo "$R" | grep -q "^D4 warning: superseded rows whose successor has since been retired: institution_facts (1)" && ok "the successor retired -> D4 warning names institution_facts (1)" || bad "retired successor: $R"
q "UPDATE institution_facts SET deleted_at = NULL WHERE id = '$FB'" > /dev/null
q "ALTER TABLE institution_facts DROP CONSTRAINT institution_facts_superseded_by_fk" > /dev/null
R="$(report)"; RC=0; DATABASE_URL="$VERIFY_URL" npx tsx scripts/drift_report.ts > /dev/null 2>&1 || RC=$?
echo "$R" | grep -q "^D4 critical: superseded_by_id without its self-referencing foreign key: institution_facts" && [ "$RC" = "2" ] && ok "the self-FK dropped -> D4 critical; drift_report exits 2 (the deploy would stop)" || bad "dropped FK ($RC): $R"
q "ALTER TABLE institution_facts ADD CONSTRAINT institution_facts_superseded_by_fk FOREIGN KEY (superseded_by_id) REFERENCES institution_facts(id) ON DELETE RESTRICT" > /dev/null
# A fork can only exist if _supersession_sane was bypassed; bypass it as
# the superuser to prove D4 sees what the trigger would have refused.
q "ALTER TABLE institution_facts DISABLE TRIGGER institution_facts_supersession_sane" > /dev/null
q "UPDATE institution_facts SET superseded_by_id = '$FB', supersession_reason = 'Verification: a forked chain.' WHERE id = '$FC'; $(act_sql supersede institution_facts "$FC" "$STAFF" "$SUP" institution_facts "$FB")" > /dev/null
q "ALTER TABLE institution_facts ENABLE TRIGGER institution_facts_supersession_sane" > /dev/null
R="$(report)"; echo "$R" | grep -q "forked supersession chains (one successor claimed by two rows): institution_facts (1)" && ok "a fork (trigger bypassed) -> D4 critical names it" || bad "fork: $R"

step "8. Wired into every run: produceRun puts the findings on the run"
env -u LVRF_PUBLIC_ORIGIN NODE_ENV=development LVRF_ALLOW_ACTOR_HEADER=1 DATABASE_URL="$VERIFY_URL" PORT="$PORT" npx tsx server/index.ts > "$W/server.log" 2>&1 &
SERVER_PID=$!
for _ in $(seq 1 30); do curl -s -o /dev/null "$BASE/api/health" && break; sleep 0.5; done
ENG="$(q "SELECT e.id FROM engagements e WHERE e.deleted_at IS NULL AND e.superseded_by_id IS NULL AND (SELECT count(*) FROM value_outcomes vo WHERE vo.engagement_id = e.id AND vo.deleted_at IS NULL AND vo.superseded_by_id IS NULL) = 1 ORDER BY e.created_at LIMIT 1")"
C="$(curl -s -o "$W/r.json" -w '%{http_code}' -X POST -H 'content-type: application/json' -H "x-actor-person-id: $STAFF" -d '{"source_fixture":"drift","note":"Drift wiring check"}' "$BASE/api/engagements/$ENG/produce-run")"
RUN="$(node -e "console.log(require('$W/r.json').value_run_id ?? '')")"
CODES="$(q "SELECT string_agg(f->>'code', ',' ORDER BY f->>'code') FROM value_runs, jsonb_array_elements(payload->'findings') f WHERE id = '$RUN' AND f->>'subject' = 'instrument'")"
[ "$C" = "201" ] && echo ",$CODES," | grep -q ",D4," && ! echo ",$CODES," | grep -q ",D3," && ok "a run produced now carries the D4 fork on its findings, and no D3 ($CODES)" || bad "run findings: $C '$CODES'"

step "9. L16 — the four link tables are audited and never deleted"
EV="$(q "INSERT INTO evidence (evidence_form, institution_id, kind, summary, provenance, confidence, captured_by_person_id) VALUES ('statement', '$INST', 'observation', 'L16 fixture', 'Verification fixture, not a source', 'low', '$STAFF') RETURNING id" | head -1)"
VO="$(q "SELECT id FROM value_outcomes WHERE deleted_at IS NULL ORDER BY created_at LIMIT 1")"
psql -At -d "$VERIFY_DB" -c "SELECT set_config('lvrf.actor_person_id', '$STAFF', false); INSERT INTO value_outcome_evidence (value_outcome_id, evidence_id, supports) VALUES ('$VO', '$EV', 'baseline')" > /dev/null
A="$(q "SELECT record_id || '|' || operation || '|' || (actor_person_id = '$STAFF')::text || '|' || (new_row->>'supports') FROM audit_log WHERE table_name = 'value_outcome_evidence' ORDER BY id DESC LIMIT 1")"
[ "$A" = "$VO|$EV|insert|true|baseline" ] && ok "an insert is audited: record_id = '<value_outcome_id>|<evidence_id>', the actor, the row in new_row" || bad "composite audit row: $A"
for t in value_outcome_evidence offering_capabilities person_roles reflection_evidence; do
  OUT2="$(psql -At -v ON_ERROR_STOP=1 -d "$VERIFY_DB" -c "DELETE FROM $t WHERE ctid = (SELECT ctid FROM $t LIMIT 1)" 2>&1 || true)"
  N="$(q "SELECT count(*) FROM $t")"
  if [ "$N" = "0" ]; then ok "$t: empty here; _no_delete present: $(q "SELECT count(*) FROM pg_trigger WHERE tgname = '${t}_no_delete'")"
  else case "$OUT2" in *"hard DELETE is prohibited"*) ok "$t: DELETE -> refused by ${t}_no_delete" ;; *) bad "$t delete: $OUT2" ;; esac; fi
done

echo
echo "==> ${PASS} passed, ${FAIL} failed"
REACHED_TALLY=1
[ "$FAIL" -eq 0 ]
