-- C3 (LVRF_PLAN §12; Brad's ruling, 26 Oct 2026) — the read-only report before the plan. Writes nothing.
--
--   PGOPTIONS="-c default_transaction_read_only=on" psql "$DATABASE_URL" -X -At -F ' | ' -f scripts/report_c3.sql
--
-- Brad's customer-side rule (C3, ruling 1): a non-simulated person OF the evidence's institution,
-- holding a customer-side role (metric_owner or executive_sponsor, not revoked), and not linked to
-- that account as analyst_of_record. "Analyst of record" is named two ways on this record:
--   link  — an account_person_links row, role analyst_of_record (0037; vendor staff on the account);
--   title — a person row OF the institution whose title says "analyst of record" (before 0037).
-- Sections:
--   A  every attested evidence row, its attester classified by the rule
--   B  every sealed run whose evidence factor credited an attestation by a person not customer-side
--   C  (addition 1) every sealed run whose committer or verifier factor credited a person not customer-side
--   D  (addition 2) every link where evidence about the tenant supports a customer outcome, and its credit
--   E  (addition 3) every evidence row and run whose own text says it was entered to exercise the system
-- Every query is a plain SELECT (no temporary objects: a read-only transaction refuses any CREATE).
BEGIN READ ONLY;


-- Why a person is, or is not, customer-side for an institution: 'customer-side', or the first reason not.

\echo '== A. Every attested evidence row, its attester under the C3 rule'
WITH c3_person AS (
SELECT p.id, p.full_name, p.institution_id, p.tenant_id, p.simulated, coalesce(p.title, '') AS title,
       (SELECT string_agg(r.role::text, ',' ORDER BY r.role::text) FROM person_roles r WHERE r.person_id = p.id AND r.revoked_at IS NULL) AS roles
  FROM persons p
),
c3_side AS (
SELECT pp.id AS person_id, i.id AS institution_id,
       CASE WHEN pp.simulated THEN 'not: simulated'
            WHEN pp.institution_id IS DISTINCT FROM i.id THEN CASE WHEN pp.tenant_id IS NOT NULL THEN 'not: vendor-side (tenant staff)' ELSE 'not: of another institution' END
            WHEN EXISTS (SELECT 1 FROM account_person_links l WHERE l.person_id = pp.id AND l.institution_id = i.id AND l.role = 'analyst_of_record' AND l.retired_at IS NULL)
              THEN 'not: linked as analyst_of_record'
            WHEN NOT coalesce(pp.roles ~ '(^|,)(metric_owner|executive_sponsor)(,|$)', false)
              THEN 'not: no customer-side role (' || coalesce(pp.roles, 'no roles') || ')'
            ELSE 'customer-side' END AS side,
       concat_ws(' + ',
         CASE WHEN EXISTS (SELECT 1 FROM account_person_links l WHERE l.person_id = pp.id AND l.institution_id = i.id AND l.role = 'analyst_of_record') THEN 'AoR by link' END,
         CASE WHEN pp.title ILIKE '%analyst of record%' THEN 'AoR by title' END) AS aor
  FROM c3_person pp CROSS JOIN institutions i
)
SELECT 'A', i.name AS account, left(e.id::text, 8) AS evidence, e.kind::text, left(e.summary, 60), pp.full_name AS attester,
       coalesce(nullif(s.aor, ''), '-') AS aor, s.side,
       coalesce((SELECT string_agg(v.supports || CASE WHEN v.withdrawn_at IS NULL THEN '' ELSE ' (withdrawn)' END, ',' ORDER BY v.withdrawn_at NULLS FIRST)
                   FROM value_outcome_evidence v WHERE v.evidence_id = e.id), 'no link') AS links,
       e.source_verified
  FROM evidence e JOIN institutions i ON i.id = e.institution_id
  JOIN c3_person pp ON pp.id = e.attested_by_person_id
  JOIN c3_side s ON s.person_id = pp.id AND s.institution_id = e.institution_id
 ORDER BY i.name, e.created_at;

-- Each sealed evidence item of each locked run, matched to its evidence row (kind, summary, provenance).

\echo '== B. Every sealed run whose evidence factor credited an attestation by a person not customer-side'
-- The factor the item's support feeds, as sealed; the points that rest on the attestation: the sealed
-- earned points less what the run's independent items of that support give (weight × 1 if any is
-- source-verified and not attested, else 0).
WITH c3_person AS (
SELECT p.id, p.full_name, p.institution_id, p.tenant_id, p.simulated, coalesce(p.title, '') AS title,
       (SELECT string_agg(r.role::text, ',' ORDER BY r.role::text) FROM person_roles r WHERE r.person_id = p.id AND r.revoked_at IS NULL) AS roles
  FROM persons p
),
c3_side AS (
SELECT pp.id AS person_id, i.id AS institution_id,
       CASE WHEN pp.simulated THEN 'not: simulated'
            WHEN pp.institution_id IS DISTINCT FROM i.id THEN CASE WHEN pp.tenant_id IS NOT NULL THEN 'not: vendor-side (tenant staff)' ELSE 'not: of another institution' END
            WHEN EXISTS (SELECT 1 FROM account_person_links l WHERE l.person_id = pp.id AND l.institution_id = i.id AND l.role = 'analyst_of_record' AND l.retired_at IS NULL)
              THEN 'not: linked as analyst_of_record'
            WHEN NOT coalesce(pp.roles ~ '(^|,)(metric_owner|executive_sponsor)(,|$)', false)
              THEN 'not: no customer-side role (' || coalesce(pp.roles, 'no roles') || ')'
            ELSE 'customer-side' END AS side,
       concat_ws(' + ',
         CASE WHEN EXISTS (SELECT 1 FROM account_person_links l WHERE l.person_id = pp.id AND l.institution_id = i.id AND l.role = 'analyst_of_record') THEN 'AoR by link' END,
         CASE WHEN pp.title ILIKE '%analyst of record%' THEN 'AoR by title' END) AS aor
  FROM c3_person pp CROSS JOIN institutions i
),
c3_sealed AS (
SELECT r.id AS run_id, r.run_number, g.name AS engagement, i.id AS institution_id, i.name AS account, r.payload,
       x.ordinality AS n, x.value AS item,
       (SELECT e.id FROM evidence e WHERE e.institution_id = i.id AND e.kind::text = x.value->>'kind' AND e.summary = x.value->>'summary'
           AND e.provenance = x.value->>'provenance' ORDER BY e.created_at LIMIT 1) AS evidence_id
  FROM value_runs r JOIN engagements g ON g.id = r.engagement_id JOIN institutions i ON i.id = g.institution_id,
       jsonb_array_elements(r.payload->'evidence') WITH ORDINALITY x
 WHERE r.locked_at IS NOT NULL AND r.deleted_at IS NULL
)
SELECT 'B', sl.account, sl.engagement, 'run ' || sl.run_number, left(sl.evidence_id::text, 8), sl.item->>'kind', sl.item->>'supports',
       pp.full_name AS attester, s.side, f->>'factor' AS factor, (f->>'earned')::numeric || ' of ' || (f->>'weight') AS sealed,
       greatest((f->>'earned')::numeric - (f->>'weight')::numeric * CASE WHEN EXISTS (
         SELECT 1 FROM c3_sealed o JOIN evidence oe ON oe.id = o.evidence_id
          WHERE o.run_id = sl.run_id AND o.n <> sl.n AND o.item->>'supports' = sl.item->>'supports' AND (o.item->>'source_verified')::boolean
            AND oe.attested_by_person_id IS NULL AND oe.kind <> 'attestation') THEN 1 ELSE 0 END, 0) AS points_resting_on_it,
       left(f->>'note', 90) AS sealed_note
  FROM c3_sealed sl JOIN evidence e ON e.id = sl.evidence_id
  JOIN c3_person pp ON pp.id = e.attested_by_person_id
  JOIN c3_side s ON s.person_id = pp.id AND s.institution_id = sl.institution_id
  CROSS JOIN LATERAL (SELECT ff FROM jsonb_array_elements(sl.payload->'confidence'->'factors') ff
                       WHERE ff->>'factor' = CASE sl.item->>'supports' WHEN 'baseline' THEN 'baseline_evidence_verified'
                                                 WHEN 'actual' THEN 'actual_evidence_verified' WHEN 'impact_basis' THEN 'impact_basis_evidenced' END) fx(f)
 WHERE s.side <> 'customer-side' AND (sl.item->>'source_verified')::boolean AND (f->>'note') ILIKE '%attested%'
 ORDER BY sl.account, sl.engagement, sl.run_number;

\echo '== C. (addition 1) Every sealed run whose committer or verifier factor credited a person not customer-side'
-- The person is the outcome's committer or verifier, matched to the name the sealed note gives.
WITH c3_person AS (
SELECT p.id, p.full_name, p.institution_id, p.tenant_id, p.simulated, coalesce(p.title, '') AS title,
       (SELECT string_agg(r.role::text, ',' ORDER BY r.role::text) FROM person_roles r WHERE r.person_id = p.id AND r.revoked_at IS NULL) AS roles
  FROM persons p
),
c3_side AS (
SELECT pp.id AS person_id, i.id AS institution_id,
       CASE WHEN pp.simulated THEN 'not: simulated'
            WHEN pp.institution_id IS DISTINCT FROM i.id THEN CASE WHEN pp.tenant_id IS NOT NULL THEN 'not: vendor-side (tenant staff)' ELSE 'not: of another institution' END
            WHEN EXISTS (SELECT 1 FROM account_person_links l WHERE l.person_id = pp.id AND l.institution_id = i.id AND l.role = 'analyst_of_record' AND l.retired_at IS NULL)
              THEN 'not: linked as analyst_of_record'
            WHEN NOT coalesce(pp.roles ~ '(^|,)(metric_owner|executive_sponsor)(,|$)', false)
              THEN 'not: no customer-side role (' || coalesce(pp.roles, 'no roles') || ')'
            ELSE 'customer-side' END AS side,
       concat_ws(' + ',
         CASE WHEN EXISTS (SELECT 1 FROM account_person_links l WHERE l.person_id = pp.id AND l.institution_id = i.id AND l.role = 'analyst_of_record') THEN 'AoR by link' END,
         CASE WHEN pp.title ILIKE '%analyst of record%' THEN 'AoR by title' END) AS aor
  FROM c3_person pp CROSS JOIN institutions i
)
SELECT 'C', i.name, g.name, 'run ' || r.run_number, f->>'factor', (f->>'earned')::numeric || ' of ' || (f->>'weight'),
       left(f->>'note', 70) AS sealed_note, pp.full_name, coalesce(nullif(s.aor, ''), '-') AS aor, s.side
  FROM value_runs r JOIN engagements g ON g.id = r.engagement_id JOIN institutions i ON i.id = g.institution_id
  JOIN value_outcomes vo ON vo.id::text = r.payload->>'valueOutcomeId'
  CROSS JOIN LATERAL jsonb_array_elements(r.payload->'confidence'->'factors') f
  JOIN c3_person pp ON pp.id = CASE f->>'factor' WHEN 'human_commit_of_record' THEN vo.committed_by_person_id ELSE vo.verified_by_person_id END
  JOIN c3_side s ON s.person_id = pp.id AND s.institution_id = i.id
 WHERE r.locked_at IS NOT NULL AND r.deleted_at IS NULL AND f->>'factor' IN ('human_commit_of_record', 'human_verifier_of_record')
   AND (f->>'earned')::numeric > 0 AND position(pp.full_name IN f->>'note') > 0 AND s.side <> 'customer-side'
 ORDER BY i.name, g.name, r.run_number, f->>'factor';
\echo '-- C, runs whose credited committer or verifier is not named in the sealed note, or whose outcome is not linked (not judged):'
SELECT 'C?', i.name, g.name, 'run ' || r.run_number, f->>'factor', (f->>'earned')::numeric || ' of ' || (f->>'weight'), left(f->>'note', 70)
  FROM value_runs r JOIN engagements g ON g.id = r.engagement_id JOIN institutions i ON i.id = g.institution_id
  CROSS JOIN LATERAL jsonb_array_elements(r.payload->'confidence'->'factors') f
  LEFT JOIN value_outcomes vo ON vo.id::text = r.payload->>'valueOutcomeId'
 WHERE r.locked_at IS NOT NULL AND r.deleted_at IS NULL AND f->>'factor' IN ('human_commit_of_record', 'human_verifier_of_record') AND (f->>'earned')::numeric > 0
   AND NOT EXISTS (SELECT 1 FROM persons p WHERE p.id = CASE f->>'factor' WHEN 'human_commit_of_record' THEN vo.committed_by_person_id ELSE vo.verified_by_person_id END
                    AND position(p.full_name IN f->>'note') > 0)
 ORDER BY i.name, g.name, r.run_number;

\echo '== D. (addition 2) Every link where evidence about the tenant supports a customer outcome'
-- "About the tenant": a vendor publication, or evidence whose summary, provenance or quote names the tenant.
-- The account is a customer: not the tenant's own. Credit, per sealed run: its factor as sealed, and whether
-- the factor needed it (the impact basis is full with no currency claimed; an evidence factor, if no other
-- item of that support is independently source-verified).
SELECT 'D', i.name, left(e.id::text, 8), e.kind::text, left(e.summary, 60), v.supports,
       CASE WHEN v.withdrawn_at IS NULL THEN 'current' ELSE 'withdrawn ' || to_char(v.withdrawn_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') END,
       CASE WHEN e.kind = 'vendor_publication' THEN 'vendor publication' ELSE 'names ' || t.name END AS why_about_tenant,
       e.source_verified
  FROM value_outcome_evidence v JOIN evidence e ON e.id = v.evidence_id
  JOIN value_outcomes vo ON vo.id = v.value_outcome_id JOIN institutions i ON i.id = vo.institution_id JOIN tenants t ON t.id = i.tenant_id
 WHERE NOT i.is_tenant_self
   AND (e.kind = 'vendor_publication' OR e.summary ILIKE '%' || t.name || '%' OR e.provenance ILIKE '%' || t.name || '%' OR coalesce(e.quote_text, '') ILIKE '%' || t.name || '%')
 ORDER BY i.name, e.created_at, v.withdrawn_at NULLS LAST;
\echo '-- D, in sealed runs: what each sealed it as, and whether its factor needed it'
WITH c3_sealed AS (
SELECT r.id AS run_id, r.run_number, g.name AS engagement, i.id AS institution_id, i.name AS account, r.payload,
       x.ordinality AS n, x.value AS item,
       (SELECT e.id FROM evidence e WHERE e.institution_id = i.id AND e.kind::text = x.value->>'kind' AND e.summary = x.value->>'summary'
           AND e.provenance = x.value->>'provenance' ORDER BY e.created_at LIMIT 1) AS evidence_id
  FROM value_runs r JOIN engagements g ON g.id = r.engagement_id JOIN institutions i ON i.id = g.institution_id,
       jsonb_array_elements(r.payload->'evidence') WITH ORDINALITY x
 WHERE r.locked_at IS NOT NULL AND r.deleted_at IS NULL
)
SELECT 'D-run', sl.account, sl.engagement, 'run ' || sl.run_number, left(sl.evidence_id::text, 8), sl.item->>'kind', sl.item->>'supports',
       (sl.item->>'source_verified')::boolean AS verified, (f->>'earned')::numeric || ' of ' || (f->>'weight') AS factor_sealed,
       CASE WHEN NOT (sl.item->>'source_verified')::boolean THEN 'earned nothing (not source-verified)'
            WHEN sl.item->>'supports' = 'impact_basis' AND sl.payload->'claimedCurrencyImpact' IS NULL OR sl.payload->>'claimedCurrencyImpact' IS NULL AND sl.item->>'supports' = 'impact_basis'
              THEN 'earned nothing (no currency claimed: the factor is full without it)'
            WHEN EXISTS (SELECT 1 FROM c3_sealed o JOIN evidence oe ON oe.id = o.evidence_id
                          WHERE o.run_id = sl.run_id AND o.n <> sl.n AND o.item->>'supports' = sl.item->>'supports' AND (o.item->>'source_verified')::boolean
                            AND oe.attested_by_person_id IS NULL AND oe.kind NOT IN ('attestation', 'vendor_publication')
                            AND NOT (oe.summary ILIKE '%' || t.name || '%' OR oe.provenance ILIKE '%' || t.name || '%'))
              THEN 'not needed (another independent item of that support)'
            ELSE 'CARRIED the factor' END AS credit
  FROM c3_sealed sl JOIN evidence e ON e.id = sl.evidence_id JOIN institutions i ON i.id = sl.institution_id JOIN tenants t ON t.id = i.tenant_id
  CROSS JOIN LATERAL (SELECT ff FROM jsonb_array_elements(sl.payload->'confidence'->'factors') ff
                       WHERE ff->>'factor' = CASE sl.item->>'supports' WHEN 'baseline' THEN 'baseline_evidence_verified'
                                                 WHEN 'actual' THEN 'actual_evidence_verified' WHEN 'impact_basis' THEN 'impact_basis_evidenced' END) fx(f)
 WHERE NOT i.is_tenant_self
   AND (e.kind = 'vendor_publication' OR e.summary ILIKE '%' || t.name || '%' OR e.provenance ILIKE '%' || t.name || '%' OR coalesce(e.quote_text, '') ILIKE '%' || t.name || '%')
 ORDER BY sl.account, sl.engagement, sl.run_number;

\echo '== E. (addition 3) Evidence rows and runs whose own text says they were entered to exercise the system'
-- Matched on phrases, each shown; Brad rules which are tests. Not matched: words a real case uses ("verified").
WITH c3_sealed AS (
SELECT r.id AS run_id, r.run_number, g.name AS engagement, i.id AS institution_id, i.name AS account, r.payload,
       x.ordinality AS n, x.value AS item,
       (SELECT e.id FROM evidence e WHERE e.institution_id = i.id AND e.kind::text = x.value->>'kind' AND e.summary = x.value->>'summary'
           AND e.provenance = x.value->>'provenance' ORDER BY e.created_at LIMIT 1) AS evidence_id
  FROM value_runs r JOIN engagements g ON g.id = r.engagement_id JOIN institutions i ON i.id = g.institution_id,
       jsonb_array_elements(r.payload->'evidence') WITH ORDINALITY x
 WHERE r.locked_at IS NOT NULL AND r.deleted_at IS NULL
),
c3_test_phrase AS (
SELECT unnest(ARRAY['to verify the', 'to exercise', 'exercise hb', 'hb-00', 'accept path', 'd1 live', 'smoke', 'test ', 'testing', 'fixture',
                    'dummy', 'placeholder', 'lorem', 'verification:', 'for the walk', 'walk check', 'demo ']) AS phrase
)
SELECT 'E-evidence', i.name, left(e.id::text, 8), e.kind::text, to_char(e.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD'),
       (SELECT string_agg(DISTINCT ph.phrase, ',') FROM c3_test_phrase ph
         WHERE lower(concat_ws(' ', e.summary, e.provenance, e.how_read, e.quote_text, e.research_query)) LIKE '%' || ph.phrase || '%') AS phrases,
       left(e.summary, 70),
       coalesce((SELECT string_agg(v.supports || CASE WHEN v.withdrawn_at IS NULL THEN '' ELSE ' (withdrawn)' END, ',') FROM value_outcome_evidence v WHERE v.evidence_id = e.id), 'no link') AS links,
       (SELECT count(*) FROM c3_sealed sl WHERE sl.evidence_id = e.id) AS times_sealed
  FROM evidence e JOIN institutions i ON i.id = e.institution_id
 WHERE EXISTS (SELECT 1 FROM c3_test_phrase ph WHERE lower(concat_ws(' ', e.summary, e.provenance, e.how_read, e.quote_text, e.research_query)) LIKE '%' || ph.phrase || '%')
 ORDER BY i.name, e.created_at;
WITH c3_test_phrase AS (
SELECT unnest(ARRAY['to verify the', 'to exercise', 'exercise hb', 'hb-00', 'accept path', 'd1 live', 'smoke', 'test ', 'testing', 'fixture',
                    'dummy', 'placeholder', 'lorem', 'verification:', 'for the walk', 'walk check', 'demo ']) AS phrase
)
SELECT 'E-run', i.name, g.name, 'run ' || r.run_number, left(r.id::text, 8), to_char(r.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD'),
       (SELECT string_agg(DISTINCT ph.phrase, ',') FROM c3_test_phrase ph
         WHERE lower(concat_ws(' ', r.payload->>'note', r.payload->>'sourceFixture', r.payload->>'bannerTitle', r.lock_reason)) LIKE '%' || ph.phrase || '%') AS phrases,
       left(concat_ws(' · ', r.payload->>'note', 'fixture: ' || (r.payload->>'sourceFixture'), 'lock: ' || r.lock_reason), 110)
  FROM value_runs r JOIN engagements g ON g.id = r.engagement_id JOIN institutions i ON i.id = g.institution_id
 WHERE EXISTS (SELECT 1 FROM c3_test_phrase ph WHERE lower(concat_ws(' ', r.payload->>'note', r.payload->>'sourceFixture', r.payload->>'bannerTitle', r.lock_reason)) LIKE '%' || ph.phrase || '%')
 ORDER BY i.name, g.name, r.run_number;
\echo '-- E, every run with its note and source fixture, for reading (not judged):'
SELECT 'E-all-runs', i.name, 'run ' || r.run_number, coalesce(r.payload->>'sourceFixture', '-'), left(coalesce(r.payload->>'note', '-'), 110)
  FROM value_runs r JOIN engagements g ON g.id = r.engagement_id JOIN institutions i ON i.id = g.institution_id
 ORDER BY i.name, g.name, r.run_number;

ROLLBACK;
