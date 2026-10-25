#!/usr/bin/env bash
#
# P2 Step 0 (LVRF_PLAN §10; P2-D4 with Brad's condition, 25 Oct 2026) — prove,
# on a SCRATCH database (createdb, not a clone of anything; dropped on exit),
# that a deferred constraint trigger keyed on txid_current() lets a governed
# change commit only with an act for that row written in the same
# transaction, whichever order the two are written in:
#   S1 act, then change, same transaction          -> commits
#   S2 change, then act, same transaction          -> commits (deferred)
#   S3 no act                                      -> refused at COMMIT
#   S4 the act committed in an EARLIER transaction -> refused
#   S5 the act written in a savepoint rolled back  -> refused
#   S6 an act for ANOTHER row                      -> refused
#   S7 a change outside the governed transition    -> commits with no act
#   S8 txid_current() in the deferred trigger equals the act's (the key holds at commit)
# Every case states its outcome; one failure stops P2 (Brad: "If any case fails,
# stop and report").
#
#   ./scripts/step0_act_presence.sh

set -euo pipefail
cd "$(dirname "$0")/.."
DB=lvrf_step0
PASS=0; FAIL=0
ok()  { PASS=$((PASS + 1)); echo "  PASS  $*"; }
bad() { FAIL=$((FAIL + 1)); echo "  FAIL  $*"; }
cleanup() { dropdb --if-exists "$DB" 2>/dev/null || true; }
. scripts/lib/finish.sh
trap finish EXIT

dropdb --if-exists "$DB" 2>/dev/null; createdb "$DB"
psql -X -q -v ON_ERROR_STOP=1 -d "$DB" <<'SQL'
CREATE TABLE subjects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), state text NOT NULL DEFAULT 'pending', note text);
CREATE TABLE governance_acts (
  id bigserial PRIMARY KEY, subject_table text NOT NULL, subject_id uuid NOT NULL,
  txid bigint NOT NULL DEFAULT txid_current(), at timestamptz NOT NULL DEFAULT now());
CREATE INDEX ON governance_acts (txid, subject_table, subject_id);
CREATE TABLE seen (trigger_txid bigint, act_txids bigint[]);
CREATE FUNCTION lvrf_require_act() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- Only the governed transition: pending -> accepted.
  IF NOT (OLD.state = 'pending' AND NEW.state = 'accepted') THEN RETURN NULL; END IF;
  INSERT INTO seen SELECT txid_current(), array_agg(txid) FROM governance_acts WHERE subject_id = NEW.id;
  IF NOT EXISTS (SELECT 1 FROM governance_acts a
                  WHERE a.txid = txid_current() AND a.subject_table = TG_TABLE_NAME AND a.subject_id = NEW.id) THEN
    RAISE EXCEPTION 'LVRF: % %: accepted with no governance act recorded in this transaction.', TG_TABLE_NAME, NEW.id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER subjects_act_present AFTER UPDATE ON subjects
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION lvrf_require_act();
SQL
new() { psql -X -At -d "$DB" -c "INSERT INTO subjects DEFAULT VALUES RETURNING id" | head -1; }
state() { psql -X -At -d "$DB" -c "SELECT state FROM subjects WHERE id = '$1'"; }
run() { psql -X -q -v ON_ERROR_STOP=1 -d "$DB" 2>&1 <<<"$1" || true; }
ACT() { printf "INSERT INTO governance_acts (subject_table, subject_id) VALUES ('subjects', '%s');" "$1"; }
UPD() { printf "UPDATE subjects SET state = 'accepted' WHERE id = '%s';" "$1"; }
committed() {  # LABEL ID OUTPUT
  [ "$(state "$2")" = "accepted" ] && ! printf '%s' "$3" | grep -q ERROR && ok "$1 → committed" || bad "$1: not committed: $3"
}
refused() {  # LABEL ID OUTPUT
  [ "$(state "$2")" = "pending" ] && printf '%s' "$3" | grep -qF "accepted with no governance act recorded in this transaction" \
    && ok "$1 → refused at COMMIT: \"$(printf '%s' "$3" | grep -o 'LVRF:.*' | head -1)\"" || bad "$1: not refused: state $(state "$2"); $3"
}

echo "==> Step 0: the presence check (scratch database $DB)"
A="$(new)"; committed "S1 act, then the change, same transaction" "$A" "$(run "BEGIN; $(ACT "$A") $(UPD "$A") COMMIT;")"
B="$(new)"; committed "S2 the change, then the act, same transaction (deferred)" "$B" "$(run "BEGIN; $(UPD "$B") $(ACT "$B") COMMIT;")"
C="$(new)"; refused "S3 no act" "$C" "$(run "BEGIN; $(UPD "$C") COMMIT;")"
D="$(new)"; run "BEGIN; $(ACT "$D") COMMIT;" > /dev/null
refused "S4 the act committed in an earlier transaction, the change in a new one" "$D" "$(run "BEGIN; $(UPD "$D") COMMIT;")"
E="$(new)"; refused "S5 the act written in a savepoint that was rolled back" "$E" "$(run "BEGIN; SAVEPOINT s; $(ACT "$E") ROLLBACK TO SAVEPOINT s; $(UPD "$E") COMMIT;")"
F="$(new)"; G="$(new)"; refused "S6 an act for another row, the change on this one" "$F" "$(run "BEGIN; $(ACT "$G") $(UPD "$F") COMMIT;")"
H="$(new)"; O="$(run "BEGIN; UPDATE subjects SET note = 'not governed' WHERE id = '$H'; COMMIT;")"
[ "$(psql -X -At -d "$DB" -c "SELECT note FROM subjects WHERE id = '$H'")" = "not governed" ] && ! printf '%s' "$O" | grep -q ERROR \
  && ok "S7 a change outside the governed transition → committed with no act" || bad "S7: $O"
[ "$(psql -X -At -d "$DB" -c "SELECT bool_and(trigger_txid = ANY(act_txids)) FROM seen s WHERE trigger_txid IN (SELECT txid FROM governance_acts WHERE subject_id IN ('$A', '$B'))")" = "t" ] \
  && ok "S8 txid_current() inside the deferred trigger, at COMMIT, equals the act's txid (S1 and S2)" || bad "S8: $(psql -X -At -d "$DB" -c "SELECT * FROM seen")"

echo
echo "==> ${PASS} passed, ${FAIL} failed"
REACHED_TALLY=1
[ "$FAIL" = "0" ]
