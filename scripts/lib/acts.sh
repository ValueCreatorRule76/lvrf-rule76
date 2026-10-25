# P2 (LVRF_PLAN §10; P2-D3, D4): a fixture written by SQL on a THROWAWAY clone
# that makes a governed transition writes its governance act in the same
# transaction (the same psql -c string), as the route would; the deferred
# <table>_act_present triggers refuse the COMMIT otherwise. Never used on prod.
#
#   act_sql ACT TABLE ID PERSON ROUTE [RESULT_TABLE RESULT_ID]
#     -> "INSERT INTO governance_acts ..." naming the row (it must exist by then:
#        put this statement AFTER the write, in the same -c string).
#   import_sql IMPORT_ID PROMPT_ID PERSON TEXT
#     -> the research_imports row a SQL-written research result names (with its
#        own import act), for results parsed after the cutover (P2-D6).
#   newid -> a fresh uuid, so a fixture can name its row before inserting it.
act_sql() {
  local res="NULL, NULL"; [ -n "${6:-}" ] && res="'$6', '$7'"
  printf "INSERT INTO governance_acts (tenant_id, act, subject_table, subject_id, actor_person_id, route, result_table, result_id) VALUES (lvrf_governed_row_tenant('%s', '%s'), '%s', '%s', '%s', '%s', '%s', %s)" \
    "$2" "$3" "$1" "$2" "$3" "$4" "$5" "$res"
}
import_sql() {
  local t; t="$(printf '%s' "$4" | sed "s/'/''/g")"
  printf "INSERT INTO research_imports (id, tenant_id, prompt_id, raw_text, raw_sha256, byte_length, imported_by_person_id) SELECT '%s', p.tenant_id, p.id, '%s', encode(sha256(convert_to('%s', 'UTF8')), 'hex'), octet_length('%s'), '%s' FROM research_prompts p WHERE p.id = '%s'; %s" \
    "$1" "$t" "$t" "$t" "$3" "$2" "$(act_sql import research_imports "$1" "$3" 'POST /api/industries/:industryId/research-results')"
}
newid() { node -e "console.log(require('crypto').randomUUID())"; }
