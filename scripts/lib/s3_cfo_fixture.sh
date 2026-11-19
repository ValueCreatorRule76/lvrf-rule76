# S3 Gate A (Brad, 19 Nov 2026, ruling 2): a case the CFO lens SHOWS, built as a synthetic fixture on a THROWAWAY
# CLONE ONLY, never prod (rule 9). A fictional account; a measured actual from a system of record; a named customer-side
# verifier; computed confidence at least 55. Every row through the routes, as the clone's steward (the actor header,
# which only the throwaway server accepts), so the case is the product's own reading of an ordinary chain.
#
#   cfo_fixture   -> FX_RUN (a locked run the CFO lens shows), FX_HASH (its payload_hash), FX_INST (the account)
#
# Needs: VERIFY_DB, BASE, S (the steward), and the clone's ratified CFO lens (on the prod copy: 55, system of record or
# published). Fails loudly, returning 1, naming the step.
. scripts/lib/hypothesis.sh
cfo_fixture() {
  local ts code body inst owner fin cap oc eng bm e_trir src ev_b ev_a unit
  fq() { psql -X -At -v ON_ERROR_STOP=1 -d "$VERIFY_DB" -c "$1"; }
  fj() { node -e 'const a=process.argv.slice(1),o={};for(let i=0;i<a.length;i+=2){let v=a[i+1];try{if(/^(\[|\{|true$|false$|-?[0-9.]+$)/.test(v))v=JSON.parse(v)}catch{}o[a[i]]=v}console.log(JSON.stringify(o))' "$@"; }
  fpost() {  # PATH BODY WANT WHAT
    local out; out="$(mktemp "${TMPDIR:-/tmp}/lvrf_fx.XXXXXX")"
    code="$(curl -s -o "$out" -w '%{http_code}' -X POST -H 'content-type: application/json' -H "x-actor-person-id: $S" -d "$2" "$BASE$1")"
    body="$(cat "$out")"; rm -f "$out"
    [ "$code" = "$3" ] || { echo "cfo_fixture: $4 -> $code $(printf '%s' "$body" | head -c 400)" >&2; return 1; }
  }
  fr() { node -e 'const b=JSON.parse(process.argv[1]);console.log(eval(process.argv[2]))' "$body" "$1"; }
  ts="$(date +%s)"
  fpost /api/account-inputs "{\"institution\":{\"name\":\"Northwind Fabrication (fictional)\",\"industry_slug\":\"manufacturing\",\"classification_note\":\"S3 fixture: a fictional account, classified to carry its own value case.\"},\"persons\":[{\"full_name\":\"Dana Reyes (fictional)\",\"email\":\"dana.$ts@northwind.example\",\"title\":\"Director of Safety\"},{\"full_name\":\"Sam Okafor (fictional)\",\"email\":\"sam.$ts@northwind.example\",\"title\":\"Controller\"}]}" 201 "the account" || return 1
  inst="$(fr b.institution_id)"; owner="$(fr 'b.person_ids[0]')"; fin="$(fr 'b.person_ids[1]')"
  e_trir="$(fq "SELECT m.id FROM industry_measures m JOIN industries i ON i.id = m.industry_id WHERE i.slug = 'manufacturing' AND m.name = 'Total Recordable Incident Rate (TRIR)'")"
  unit="incidents per 200,000 hours"
  # Both people named customer-side, from an opened source (the committer and the verifier earn their factors).
  fpost "/api/institutions/$inst/evidence" "$(fj about account kind artifact provenance 'Fixture source for: Northwind org chart (fictional, not a source)' summary 'Northwind org chart naming the safety director and the controller (fixture)' evidence_form quote quote_text 'Dana Reyes, Director of Safety; Sam Okafor, Controller.' how_read 'Read from the fixture org chart, leadership box.')" 201 "the role source" || return 1
  src="$(fr b.evidence_id)"
  fpost "/api/evidence/$src/open-citation" '{"source_verified":true}' 200 "the role source opened" || return 1
  fpost "/api/institutions/$inst/customer-roles" "$(fj person_id "$owner" role metric_owner source_evidence_id "$src" reason 'S3 fixture: named from the fictional org chart.')" 201 "the owner named customer-side" || return 1
  fpost "/api/institutions/$inst/customer-roles" "$(fj person_id "$fin" role executive_sponsor source_evidence_id "$src" reason 'S3 fixture: named from the fictional org chart.')" 201 "the controller named customer-side" || return 1
  fpost "/api/institutions/$inst/offerings" "$(fj offering_key skillsoft_compliance_suite capability_name 'Safe-work capability' owner_person_id "$owner" is_primary false basis 'S3 fixture: EHS solution.')" 201 "the offering" || return 1
  cap="$(fr b.capability_id)"
  fpost "/api/capabilities/$cap/industry-measures" "$(fj industry_measure_id "$e_trir" claim 'S3 fixture: safe-work training lowers recordable incidents.')" 201 "the capability's claim" || return 1
  fpost "/api/institutions/$inst/value-outcomes" "{\"engagement_name\":\"Northwind safety engagement (fictional)\",\"engagement_owner_person_id\":\"$owner\",\"capability_name\":\"Safe-work capability\",\"metric\":{\"name\":\"Total Recordable Incident Rate\",\"unit\":\"$unit\",\"direction\":\"decrease\",\"source_system\":\"Northwind EHS system (fictional)\",\"owner_person_id\":\"$owner\"},\"baseline_value\":2.4,\"baseline_measured_at\":\"2025-09-30T00:00:00Z\"}" 201 "the outcome" || return 1
  oc="$(fr b.value_outcome_id)"; eng="$(fr b.engagement_id)"; bm="$(fr b.business_metric_id)"
  fpost "/api/business-metrics/$bm/pack-basis" "$(fj industry_measure_id "$e_trir" basis_note 'S3 fixture: the same rate.')" 201 "the pack basis" || return 1
  # The baseline and the actual, each a system export whose quote states the figure, opened as verified.
  fpost "/api/value-outcomes/$oc/evidence" "$(fj kind system_export provenance 'Fixture source for: Northwind EHS export FY25 (fictional, not a source)' summary 'TRIR FY25 2.4, Northwind EHS export (fixture)' supports baseline confidence high source_verified false ai_sourced false simulated false evidence_form quote quote_text 'TRIR FY25: 2.4' how_read 'Read from the fixture export, the FY25 total row.')" 201 "the baseline's evidence" || return 1
  ev_b="$(fr b.evidence_id)"
  fpost "/api/evidence/$ev_b/open-citation" '{"source_verified":true}' 200 "the baseline's evidence opened" || return 1
  fpost "/api/value-outcomes/$oc/commit" "$(fj target_value 2.0 committed_by_person_id "$owner" committed_at 2025-10-01T00:00:00Z commitment_note 'S3 fixture: committed to 2.0.' attribution_method control_group measure_class capability_performance)" 201 "the commitment" || return 1
  fpost "/api/value-outcomes/$oc/evidence" "$(fj kind system_export provenance 'Fixture source for: Northwind EHS export FY26 (fictional, not a source)' summary 'TRIR FY26 1.9, Northwind EHS export (fixture)' supports actual confidence high source_verified false ai_sourced false simulated false evidence_form quote quote_text 'TRIR FY26: 1.9' how_read 'Read from the fixture export, the FY26 total row.')" 201 "the actual's evidence" || return 1
  ev_a="$(fr b.evidence_id)"
  fpost "/api/evidence/$ev_a/open-citation" '{"source_verified":true}' 200 "the actual's evidence opened" || return 1
  fpost "/api/value-outcomes/$oc/measure" "$(fj actual_value 1.9 actual_measured_at 2026-09-30T00:00:00Z)" 200 "the measurement" || return 1
  fpost "/api/value-outcomes/$oc/verify" "$(fj verified_by_person_id "$fin" verified_at 2026-10-15T00:00:00Z attestation_note 'S3 fixture: checked against the fictional EHS system of record.')" 200 "the verification" || return 1
  state_hypothesis "$eng" || return 1
  fpost "/api/engagements/$eng/produce-run" "$(fj banner_title 'VALUE CASE' note 'S3 fixture: the CFO-lens-shown case.' source_fixture spine_fixture)" 201 "the run" || return 1
  FX_RUN="$(fr b.value_run_id)"
  fpost "/api/value-runs/$FX_RUN/lock" "$(fj lock_reason 'S3 fixture: sealed for the print check.')" 200 "the lock" || return 1
  FX_HASH="$(fq "SELECT payload_hash FROM value_runs WHERE id = '$FX_RUN'")"; FX_INST="$inst"
}
