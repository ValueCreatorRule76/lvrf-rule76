# S1 (3.1; LVRF_PLAN §20, D4): a fixture states a hypothesis before it produces a run, because produce-run and
# value_runs_hypothesis_current (hardening.sql section 35) refuse a run whose outcome has none. One shared helper,
# so no verify script can seal a run without one. THROWAWAY CLONES ONLY: it writes fixture rows (rule 9).
#
#   state_hypothesis ENGAGEMENT_ID
#     -> for the engagement's current outcome: nothing, if it already has a current hypothesis; otherwise it builds
#        what the chain lacks and states one, THROUGH THE ROUTES, as the tenant's steward:
#          the account classified (POST /api/institutions/:id/industry), only if it is not;
#          a pack entry in the account's industry, named after the metric (never an id: a printed case shows no short
#            id), only if the metric rests on none (a fixture row by SQL, as the
#            verify scripts' own MEAS() fixtures are; its citation says it is not a source), and the metric's basis on
#            it (POST /api/business-metrics/:id/pack-basis);
#          the outcome's capability's claim on that entry (POST /api/capabilities/:id/industry-measures), only if absent;
#          a current lever on the entry (POST /api/industry-measures/:id/levers, a steward act), only if none;
#          the hypothesis (POST /api/institutions/:id/hypotheses), referenced to the recorded baseline, due in 90 days.
#        Sets HYP_ID (the hypothesis id, the existing one or the new one). Fails loudly, returning 1, on any refusal.
#
# Needs: VERIFY_DB (the clone) and BASE (the API). The tenant must have a steward (the lever is a steward act; the
# helper never names one, so a script testing a steward-less tenant keeps it steward-less). Authenticates as the
# steward by the actor header (LVRF_ALLOW_ACTOR_HEADER=1, the throwaway server), or by HYP_COOKIE (a curl cookie jar
# of the steward's session) when set.
state_hypothesis() {
  local eng="$1" hq row o inst ten cap bm entry unit dir ind steward lever code body
  hq() { psql -X -At -v ON_ERROR_STOP=1 -d "$VERIFY_DB" -c "$1"; }
  hpost() {  # PATH BODY -> code in HYP_CODE, body in HYP_BODY
    local out auth
    out="$(mktemp "${TMPDIR:-/tmp}/lvrf_hyp.XXXXXX")"
    if [ -n "${HYP_COOKIE:-}" ]; then auth=(-b "$HYP_COOKIE"); else auth=(-H "x-actor-person-id: $steward"); fi
    HYP_CODE="$(curl -s -o "$out" -w '%{http_code}' -X POST -H 'content-type: application/json' "${auth[@]}" -d "$2" "$BASE$1")"
    HYP_BODY="$(cat "$out")"; rm -f "$out"
  }
  hfield() { node -e 'try{const b=JSON.parse(process.argv[1]);console.log(b[process.argv[2]]??"")}catch{console.log("")}' "$HYP_BODY" "$1"; }
  hfail() { echo "state_hypothesis: $1 -> $HYP_CODE $(printf '%s' "$HYP_BODY" | head -c 300)" >&2; return 1; }

  row="$(hq "SELECT vo.id, vo.institution_id, i.tenant_id, vo.capability_id, vo.business_metric_id,
                    coalesce(bm.industry_measure_id::text, ''), bm.unit, bm.direction, coalesce(i.industry_id::text, ''),
                    coalesce(t.steward_person_id::text, '')
               FROM value_outcomes vo JOIN business_metrics bm ON bm.id = vo.business_metric_id
               JOIN institutions i ON i.id = vo.institution_id JOIN tenants t ON t.id = i.tenant_id
              WHERE vo.engagement_id = '$eng' AND vo.deleted_at IS NULL AND vo.superseded_by_id IS NULL")"
  [ -n "$row" ] || { echo "state_hypothesis: engagement $eng has no current outcome" >&2; return 1; }
  [ "$(printf '%s\n' "$row" | wc -l | tr -d ' ')" = "1" ] || { echo "state_hypothesis: engagement $eng has more than one current outcome" >&2; return 1; }
  IFS='|' read -r o inst ten cap bm entry unit dir ind steward <<< "$row"
  HYP_ID="$(hq "SELECT id FROM value_hypotheses WHERE value_outcome_id = '$o' AND deleted_at IS NULL AND superseded_by_id IS NULL ORDER BY created_at LIMIT 1")"
  [ -n "$HYP_ID" ] && return 0
  [ -n "$steward" ] || { echo "state_hypothesis: tenant $ten has no steward; the script names one before it produces a run" >&2; return 1; }

  if [ -z "$ind" ]; then
    local slug; slug="$(hq "SELECT slug FROM industries WHERE tenant_id = '$ten' ORDER BY slug LIMIT 1")"
    [ -n "$slug" ] || { echo "state_hypothesis: tenant $ten has no industry to classify the account into" >&2; return 1; }
    hpost "/api/institutions/$inst/industry" "{\"industry_slug\":\"$slug\",\"classification_note\":\"Verification fixture: classified so a hypothesis can be stated (S1).\"}"
    [ "$HYP_CODE" = "201" ] || { hfail "classify the account"; return 1; }
    ind="$(hq "SELECT industry_id FROM institutions WHERE id = '$inst'")"
  fi
  if [ -z "$entry" ]; then
    entry="$(hq "INSERT INTO industry_measures (tenant_id, industry_id, name, unit, direction, definition, why_it_pays, addressable, addressable_reasoning, confounders, citation)
                 VALUES ('$ten', '$ind', 'S1 fixture entry: ' || (SELECT name FROM business_metrics WHERE id = '$bm'), \$u\$$unit\$u\$, '$dir', 'Fixture definition (S1 helper).', 'Fixture.', true, 'Fixture.',
                         'Fixture confounders: none stated.', 'Verification fixture, not a source.') RETURNING id" | head -1)"
    hpost "/api/business-metrics/$bm/pack-basis" "{\"industry_measure_id\":\"$entry\",\"basis_note\":\"Verification fixture: the same measure (S1).\"}"
    [ "$HYP_CODE" = "201" ] || { hfail "the metric's pack basis"; return 1; }
  fi
  if [ "$(hq "SELECT count(*) FROM capability_industry_measures WHERE capability_id = '$cap' AND industry_measure_id = '$entry'")" = "0" ]; then
    hpost "/api/capabilities/$cap/industry-measures" "{\"industry_measure_id\":\"$entry\",\"claim\":\"Verification fixture: the capability moves this measure (S1).\"}"
    [ "$HYP_CODE" = "201" ] || { hfail "the capability's claim"; return 1; }
  fi
  lever="$(hq "SELECT id FROM value_levers WHERE industry_measure_id = '$entry' AND tenant_id = '$ten' AND deleted_at IS NULL AND superseded_by_id IS NULL ORDER BY created_at LIMIT 1")"
  if [ -z "$lever" ]; then
    hpost "/api/industry-measures/$entry/levers" '{"name":"S1 fixture lever","mechanism":"Fixture mechanism: the capability moves the measure.","leading_indicator":"Fixture indicator","citation":"Verification fixture, not a source."}'
    [ "$HYP_CODE" = "201" ] || { hfail "the lever"; return 1; }
    lever="$(hfield value_lever_id)"
  fi
  hpost "/api/institutions/$inst/hypotheses" "{\"value_outcome_id\":\"$o\",\"value_lever_id\":\"$lever\",\"statement\":\"Verification fixture: the capability moves this outcome (S1 helper).\",\"falsifier_reference\":\"baseline\",\"falsifier_due\":\"$(hq "SELECT to_char((now() AT TIME ZONE 'UTC')::date + 90, 'YYYY-MM-DD')")\",\"falsifier_conditions\":\"\"}"
  [ "$HYP_CODE" = "201" ] || { hfail "the hypothesis"; return 1; }
  HYP_ID="$(hfield value_hypothesis_id)"
}
