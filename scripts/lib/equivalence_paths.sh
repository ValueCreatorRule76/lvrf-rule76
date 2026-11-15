#!/usr/bin/env bash
# Every deployed GET route, instantiated over the rows of DB: one path per line. Sourced by scripts/equivalence_gets.sh.
#   scripts/lib/equivalence_paths.sh DB
DB=$1; q() { psql -X -At -d "$DB" -c "$1"; }
for p in cohort engagements errata/non-customer-credit evidence/about-batch evidence/supersession-batch industries institutions persons policies runs system-exercise/candidates; do echo "/api/$p"; done
for e in $(q "select id from engagements order by id"); do echo "/api/engagements/$e/runs"; echo "/api/engagements/$e/snapshots"; done
for s in $(q "select slug from industries order by slug"); do echo "/api/industries/$s/pack"; echo "/api/industries/$s/research"; done
for m in $(q "select id from business_metrics order by id"); do echo "/api/business-metrics/$m/research-prompt"; done
for i in $(q "select id from institutions order by id"); do echo "/api/institutions/$i/view"; for r in customer-roles evidence outcome-spine pov research walk; do echo "/api/institutions/$i/$r"; done; done
for o in $(q "select id from value_outcomes order by id"); do for r in figure-findings gaps record-documents; do echo "/api/value-outcomes/$o/$r"; done; echo "/api/lineage/value_outcomes/$o?figure=baseline"; echo "/api/lineage/value_outcomes/$o?figure=actual"; done
for r in $(q "select id from value_runs where deleted_at is null order by id"); do echo "/api/runs/$r"; echo "/api/value-runs/$r/case"; echo "/api/value-runs/$r/case?lens=cfo"; done
q "select a.id||' '||b.id from value_runs a join value_runs b on a.engagement_id=b.engagement_id and b.run_number=a.run_number+1 where a.deleted_at is null and b.deleted_at is null order by a.id" | while read a b; do echo "/api/value-runs/$a/compare/$b"; done
for ev in $(q "select id from evidence order by id limit 10"); do echo "/api/lineage/evidence/$ev"; done
# Lineage is traced for facts, entities, pack measures, evidence and an outcome's figure (server/routes/lineage.ts).
for t in institution_facts institution_entities industry_measures; do for x in $(q "SELECT id FROM $t ORDER BY id LIMIT 5"); do echo "/api/lineage/$t/$x"; done; done
