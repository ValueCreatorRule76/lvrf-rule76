# §29 (Brad, 24 Nov 2026): only a customer-side person at the account commits to a target or verifies an actual. A
# verify script's committer or verifier is made customer-side THROUGH THE ROUTES, as the tenant's steward ($S): a
# source about the account, opened by a person, and a role named from it. THROWAWAY CLONES ONLY (rule 9).
# Needs the script's expect and rj.
#
#   make_customer_side INSTITUTION_ID PERSON_ID [ROLE]
_cs_json() { node -e 'const a=process.argv.slice(1);const o={};for(let i=0;i<a.length;i+=2)o[a[i]]=a[i+1];console.log(JSON.stringify(o))' "$@"; }
make_customer_side() {
  expect POST "/api/institutions/$1/evidence" "$(_cs_json about account kind artifact provenance "Fixture source for: org chart naming ${2:0:8} (not a source)" summary 'Org chart naming the person (fixture)' evidence_form quote quote_text 'Named in the fixture org chart.' how_read 'Read from the fixture org chart, top box.')" 201 "  ...a role source for ${2:0:8}, as account evidence"
  local src; src="$(rj b.evidence_id)"
  expect POST "/api/evidence/$src/open-citation" '{"source_verified":true}' 200 "  ...its source opened"
  expect POST "/api/institutions/$1/customer-roles" "$(_cs_json person_id "$2" role "${3:-metric_owner}" source_evidence_id "$src" reason 'Verification: named from the customer org chart.')" 201 "  ...${2:0:8} named customer-side (only a customer-side person commits or verifies)"
}

# A fixture that records a commitment or verification as one made BEFORE the rule (Curia's e3fb0061's shape: a person
# who is not customer-side), by the pre-§29 code itself: the commit and verify route and the database guard as at
# S29_PRE, the C3 way (verify_c3's pre_c3). The script lists server/routes/outcomeWalk.ts in its EDITED files (so its
# EXIT trap restores it); RESTART is its own server restart. post_s29 puts the current code back, byte-identical.
#
#   pre_s29 RESTART ... (route calls) ... post_s29 RESTART
S29_PRE=2dc3f71
S29_ROUTE=server/routes/outcomeWalk.ts
s29_fn() {  # REV OUT — lvrf_block_simulated_attestor as at REV (HEAD: the working tree)
  if [ "$1" = HEAD ]; then cat db/hardening.sql; else git show "$1:db/hardening.sql"; fi | python3 -c '
import re, sys
s = sys.stdin.read()
m = re.search(r"CREATE OR REPLACE FUNCTION lvrf_block_simulated_attestor\(.*?\n(?:END )?\$\$;\n", s, re.S)
sys.stdout.write(m.group(0))' > "$2"
}
s29_own_clone() {  # the swap runs only on the script's own clone, never the shared template or a real database
  case "${VERIFY_DB:-}" in lvrf_prodcopy|lvrf|lvrf_snapshot*|template*|"") bad "  ...the pre-§29 swap refused: '${VERIFY_DB:-}' is not this script's own clone"; return 1 ;; esac
  case "$VERIFY_DB" in lvrf_verify*) ;; *) bad "  ...the pre-§29 swap refused: '$VERIFY_DB' is not a verify clone"; return 1 ;; esac
  [ "$(psql -X -At -d "$VERIFY_DB" -c "SELECT datistemplate FROM pg_database WHERE datname = current_database()")" = "f" ] || { bad "  ...the pre-§29 swap refused: '$VERIFY_DB' is a template"; return 1; }
}
s29_guard_md5() { psql -X -At -d "$VERIFY_DB" -c "SELECT md5(prosrc) FROM pg_proc WHERE proname = 'lvrf_block_simulated_attestor'"; }
s29_want_md5() { s29_fn HEAD "$W/s29_want.sql"; python3 -c '
import re, sys, hashlib
s = open(sys.argv[1]).read(); m = re.search(r"AS \$\$(.*?)\$\$;", s, re.S); print(hashlib.md5(m.group(1).encode()).hexdigest())' "$W/s29_want.sql"; }
pre_s29() {
  s29_own_clone || return 1
  S29_ROUTE_MD5="$(md5 -q "$S29_ROUTE")"; S29_GUARD_MD5="$(s29_want_md5)"
  cp "$S29_ROUTE" "$W/s29_route.now"
  git show "$S29_PRE:$S29_ROUTE" > "$S29_ROUTE"
  s29_fn "$S29_PRE" "$W/s29_pre.sql"; psql -X -q -v ON_ERROR_STOP=1 -d "$VERIFY_DB" -f "$W/s29_pre.sql" > /dev/null
  "$1" && echo "  NOTE  the pre-§29 commit route and database guard ($S29_PRE) in place on $VERIFY_DB, to record a commitment as before the rule"
}
post_s29() {
  s29_own_clone || return 1
  cp "$W/s29_route.now" "$S29_ROUTE"
  s29_fn HEAD "$W/s29_now.sql"; psql -X -q -v ON_ERROR_STOP=1 -d "$VERIFY_DB" -f "$W/s29_now.sql" > /dev/null
  "$1"
  local r g; r="$(md5 -q "$S29_ROUTE")"; g="$(s29_guard_md5)"
  [ "$r" = "$S29_ROUTE_MD5" ] && ok "  ...the commit route back: md5 $r, as before the swap" || bad "  ...the commit route differs after the swap: $r, expected $S29_ROUTE_MD5"
  [ "$g" = "$S29_GUARD_MD5" ] && ok "  ...the database guard back: md5(prosrc) $g, as hardening.sql declares" || bad "  ...the database guard differs after the swap: $g, expected $S29_GUARD_MD5"
}

# The database guard alone, as at S29_PRE, for a check of another rule that §29 would refuse first (a vendor-side
# verifier, refused by §29 before the verifier-not-author rule is reached). Own clone only; the hash checked after.
pre_s29_db() {
  s29_own_clone || return 1
  S29_GUARD_MD5="$(s29_want_md5)"
  s29_fn "$S29_PRE" "$W/s29_pre.sql"; psql -X -q -v ON_ERROR_STOP=1 -d "$VERIFY_DB" -f "$W/s29_pre.sql" > /dev/null
}
post_s29_db() {
  s29_own_clone || return 1
  s29_fn HEAD "$W/s29_now.sql"; psql -X -q -v ON_ERROR_STOP=1 -d "$VERIFY_DB" -f "$W/s29_now.sql" > /dev/null
  local g; g="$(s29_guard_md5)"
  [ "$g" = "$S29_GUARD_MD5" ] && ok "  ...the database guard back: md5(prosrc) $g, as hardening.sql declares" || bad "  ...the database guard differs after the swap: $g, expected $S29_GUARD_MD5"
}
