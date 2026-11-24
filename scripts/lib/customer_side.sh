# §29 (Brad, 24 Nov 2026): only a customer-side person at the account commits to a target or verifies an actual. A
# verify script's committer or verifier is made customer-side THROUGH THE ROUTES, as the tenant's steward ($S): a
# source about the account, opened by a person, and a role named from it. THROWAWAY CLONES ONLY (rule 9).
# Needs the script's expect, J and rj.
#
#   make_customer_side INSTITUTION_ID PERSON_ID [ROLE]
make_customer_side() {
  expect POST "/api/institutions/$1/evidence" "$(J about account kind artifact provenance "Fixture source for: org chart naming ${2:0:8} (not a source)" summary 'Org chart naming the person (fixture)' evidence_form quote quote_text 'Named in the fixture org chart.' how_read 'Read from the fixture org chart, top box.')" 201 "  ...a role source for ${2:0:8}, as account evidence"
  local src; src="$(rj b.evidence_id)"
  expect POST "/api/evidence/$src/open-citation" '{"source_verified":true}' 200 "  ...its source opened"
  expect POST "/api/institutions/$1/customer-roles" "$(J person_id "$2" role "${3:-metric_owner}" source_evidence_id "$src" reason 'Verification: named from the customer org chart.')" 201 "  ...${2:0:8} named customer-side (only a customer-side person commits or verifies)"
}
