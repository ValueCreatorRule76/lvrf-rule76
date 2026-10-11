# LVRF — Forward plan

**DRAFT — not approved, not ratified.** 11 October 2026. This is the one forward
plan; it consolidates every roster, deferred list and open question in
`BUILD_STATUS.md`, `CLAUDE.md` and `docs/LVRF_3.0_DRAFT.md` (revision 3). Nothing
here is ratified by being written down. Where this file and `CLAUDE.md` disagree,
`CLAUDE.md` wins and the conflict is named (§3).

**How "done" was checked.** Every *done* below was checked against the code or
schema on 11 October, not taken from the prose. Where the code could not settle
it, the status says **unverified**. Section references are `BUILD_STATUS.md`
headings.

---

## 1. Status ledger

### 1.2 roster (24 August), the cut to four and the revision (25 August)

| Item | Status | Proven by (BUILD_STATUS) | Checked in code |
|---|---|---|---|
| 1. Gate coverage: AI-assisted assessment hole, vendor publication | **done** | *Correction and 1.2 item 1 closed — 24 Aug* | `lvrf_block_ai_actual` joins `assessments.ai_assisted` and checks `kind = 'vendor_publication'` (`db/hardening.sql` ~l.193) |
| 2. Account inputs, the external entry point | **done** | *Surface 3 — account intake*; *The account workbench — 9 Oct* | `server/routes/accountInputs.ts`, `institutionInputs.ts` |
| 3. `capability_metric_links` with `promoted_at` | **moved to 3.0 item 17** (parked, then re-scoped as the earned pack) | *Item 4 — parked, with three reasons — 29 Aug*; *2.0, scoped for a platform* | No such table in `db/schema.ts` |
| 4. Evidence writes through the gate | **done** | *Evidence endpoint — the write path is closed — 29 Aug* | `outcomeEvidence.ts` |
| 5. Verifier attestation with a caller | **done** | *Item 2 closed — the walk is enforced — 25 Aug* | `outcomeWalk.ts` `/verify` |
| 6. A second run; lineage and compare | **done** | *Item 3 delivered…*, *Lock endpoint…*, *Item 6 closed — compare two runs on confidence* | `produceRun.ts`, `lockRun.ts`, `compareRuns.ts` |
| 7. Executive output rendered | **part done**: the record document is written and wired in the UI; the PDF renderer still reads local files | *The record document — 1.2 closes against its own test — 30 Aug*; *Topbar wired* | `recordDocuments.ts`; Topbar "Render record"; `records/render_record.py` reads `out/spine_run_*.json` (l.372) → loose end L7 |
| 8. Runtime heartbeat emission | **done** | *The register beats — 30 Aug*; *The last two emitters* | `server/spine/emitHeartbeat.ts`; eight LVRF emitters |
| 9. `_no_delete` on `heartbeat_events` and `record_documents` | **done** | same sections | `record_documents_no_delete` trigger; `heartbeat_events` has UPDATE/DELETE/TRUNCATE revoked from `lvrf_app` (append-only) |
| 10. Catalog refresh against Skillsoft's current line | **done** | *0008* entries (provider_org, Global Knowledge divestiture) | 12 offerings on the prod copy, `provider_org` set where resold |
| Cut item 1. Value outcome and business metric entry | **done** | *Item 1 closed — the spine has a middle — 25 Aug* | `valueOutcomes.ts` |
| Revised 3. Lock a run from an engagement | **done** | *Item 3 delivered*; *Lock endpoint* | `produceRun.ts`, `lockRun.ts` |
| Revised 5. Validate and supersede | **done** | *Item 5 closed — supersession, and the confidence curve — 26 Aug* | `validateMetric.ts` |
| Revised 6. Compare on confidence, not value | **done** | *Item 6 closed — 29 Aug* | `compareRuns.ts` (but see L5: 500 on old runs) |
| "Two more roster items": `isSynthetic()` `[SIM]` prefix; metric calculation-method confirmed | **done** | *The [SIM] prefix removed… in three forms*; *Metric definition confirmation* | No `isSynthetic`/`[SIM]` left in `server/` or `client/src`; `business_metrics.definition_confirmed_by_person_id` exists |
| Stale names in shared models (`sponsorName`; the panel's "sponsor" label) | **part done**: `sponsorName` gone; the label remains | *Roster addition: stale names*; *Remaining stale name* | `ConfidenceInstrument.tsx:22` still reads "Named human sponsor of record" → L2 |
| **1.2 test** (a real cohort measured end to end by someone other than the author; a document a CFO would carry) | **part done**: closed against its own test on 30 Aug with the author as operator; "someone other than the author" waits for 3.0 Band A | *The record document — 1.2 closes against its own test* | — |

### 2.0 roster (30 August) and "2.0, scoped for a platform"

| Item | Status | Proven by | Checked in code |
|---|---|---|---|
| 1. Model versioning | **part done**: every run records `modelVersion` and a computed `modelFingerprint`; compare flags a cross-model delta. Weights are still constants, not data | *2.0 item 1 — model versioning — closed 30 Aug* | `confidenceModel.ts` `MODEL_VERSION`, `MODEL_FINGERPRINT`, `CONFIDENCE_FACTOR_WEIGHTS` (a constant); `compareRuns.ts` `modelNote` |
| 2. The gap register, priced | **done** | *2.0 item 2 closed — the gap register* | `gapRegister.ts` |
| 3. Cohort roll-up, weakest link | **done** | *2.0 item 3 — 10 Oct* | `cohort.ts` |
| 4. Self-drift detection | **part done**: D1 built; D2–D4 deferred | *2.0 item 4 — self-drift detection*; *Deferred, with reasons* | `server/spine/driftChecks.ts` has D1 only → L1 |
| 5. Deep Research inputs | **part done**: pack research (prompt → parse → review → accept/exclude) built; metric research narrowed to the tenant-self metric; **account research → 3.0 item 6** | *Research intake, and a reversal*; *Industry pack accept/reject built*; *The pack has entries* | `industryResearch.ts`, `researchPrompt.ts`, `research_results` |
| 6. Draft-and-refuse | **done** | *2.0 item 6 closed — the shopping list* | gap register's requirement text |
| Industry packs (pulled from 3.0 into 2.0) | **done**, none ratified | *Industry packs — the shape / the schema*; *Item (b)* | `industry_measures` (all `proposed`) |
| The account workbench | **done** | *The account workbench — 9 Oct* | `institutionView.ts`, `institutionFacts.ts` |
| Fact supersession writer (2.0's last item) | **done**: deployed 11 Oct (0028); first use, the LVAF → "LVRF (value realization records)" correction, made by Brad on 11 Oct | *Fact supersession — 11 Oct*, and its *Deployed* note | `0028`, `institutionFacts.ts` `/supersede`; prod facts `c966ef3b…` → `f1e2385e…`, audit 203–205 |
| The earned pack (`capability_metric_links` on `lifecycle_status`) | **moved to 3.0 item 17** | *2.0, scoped for a platform* | — |
| Portfolio learning | **moved to 3.0 item 18** (ruled out of 2.0: meaningless with two institutions) | *RULED OUT* | — |
| Authentication | **done as sign-in P1–P3** (filed 2.x, platform) | *Sign-in P1 … P3*; *Sign-in P1–P3 complete* | `server/lib/session.ts`, `actorHeader.ts`, `tenantScope.ts` |

### Further candidates (30 August)

| Candidate | Status |
|---|---|
| Provenance decay | **moved to 3.0 item 14** |
| Constraint-derived documentation | **moved to 3.0 item 15** |
| Contradiction detection | **moved to 3.0 item 14** |

### Ruled out (30 August), still ruled out

AI suggesting a data class, inferring an industry, proposing a confidence level,
choosing the entity, picking a contradiction's winner; drafting a note someone
signs unread. Multi-tenancy beyond the P3 check. Anything learner-facing.

---

## 2. Loose ends

Every open item from the *Still outstanding*, *Deferred*, *Remaining*, *Still
open* and *Later items* lists that is on no roster, de-duplicated and checked
against the code. **Dropped as fixed:** local migration drift on 0013 (the column
exists locally: *Local migration drift resolved*); the `isSynthetic`/`[SIM]`
checks and `sponsorName` (gone from the code); two readers ignoring retired
engagements, refusals without an outcome id, write routes responding before
COMMIT, reviewer caveats not reaching the pack, the one-accepted-per-measure index
(all closed 10 Oct, sections as listed in *Still outstanding*); the tenant check
on institution routes (P3).

| # | Loose end | Checked | Where it fits (§4) |
|---|---|---|---|
| L1 | **D2–D4 drift checks**: migration journal vs schema; governed tables missing governance columns; orphaned supersession | `driftChecks.ts` implements D1 only | Q4 — before Band B adds migrations |
| L2 | The confidence panel's label "Named human sponsor of record" describes a committer | `ConfidenceInstrument.tsx:22` | Q3 hygiene batch |
| L3 | `value_outcome_evidence.supports` is free text; the gate compares it to `'actual'` | `text('supports')`, no CHECK on the table; only the route validates | Q3 hygiene batch (a CHECK, not a comment) |
| L4 | The run payload carries no institution name | `produceRun` payload has engagement, capability, metric — no account | with 3.0 item 3/10 (seal the entity in the run) |
| L5 | `compareRuns` returns 500 on runs scored before `modelVersion` (`payload.confidence` absent) | reproduced on HEAD against local `lvrf` | Q3 hygiene batch (422 naming the run) |
| L6 | Research values carry no reporting period | no period column on `research_results` | with 3.0 item 6 (every accepted fact carries its period) |
| L7 | `render_record.py` reads `out/spine_run_*.json`, not the API | `records/render_record.py` l.372 | with 3.0 item 15 |
| L8 | Parse refusals (the parser's 422s) leave no record | no writer; `refusals` takes DB refusals only | with 3.0 item 6 (research at volume) — item 13 |
| L9 | `website` has no update path | no route writes it after create | with 3.0 item 3 (fold into the entity record) — item 13 |
| L10 | Fact (and outcome-evidence) verification after capture | `source_verified` set at capture only; no route | 3.0 item 13 |
| L11 | Narrow-viewport overflow on the runs table; card numbering `01A`; form/table left-edge misalignment; compare's `stage`/`claim`/`notes` rendered nowhere | `AddEvidenceCard.tsx` still `n="01A"`; viewport **unverified** (not re-measured) | UI pass, unscheduled |
| L12 | Sign-in cosmetics: nav links on the sign-in page; the bar reads "Signed in as" under the expiry overlay | *Later items, recorded at P2a* | UI pass, unscheduled |
| L13 | Tailwind 4 (clears the 7 accepted client audit findings) | lockfile at Tailwind 3 | standalone chore with its own regression pass, after Band A |
| L14 | `www` → apex redirect; HSTS/CSP; per-email sign-in throttle; TOTP; deploy-script vhost flip | *P4 — basic_auth is kept* | P4 prerequisites, after item 2 |
| L15 | DB-level tenant backstop (`lvrf.actor_tenant_id` + trigger or RLS) | not built | own plan; trigger: a second tenant, or research at volume |
| L16 | DEFECT-003: composite-key tables partly ungoverned | `value_outcome_evidence` has only `_no_ai_actual`; `offering_capabilities` and `reflection_evidence` have no triggers | Q4 with D3 (the same question: what governance each table owes) |
| L17 | The payload holds exactly one outcome (a cohort payload will need another shape) | `produceRun` 422s on ≠ 1 outcome | when an engagement needs two; not before |
| L18 | Hypothesis lock: must a run locked at `claimed` *state* that it is a hypothesis? | `banner_title` is optional (defaults `PROVENANCE`); never decided | decision D9 |
| L19 | FK names truncated at 63 bytes (two instances) | recorded, harmless | leave unless a migration names one |
| L20 | Rejecting a research result does not create an exclusion | by design (*Still outstanding*) | none — recorded, not a defect |
| L21 | Docs drift: `LVRF_Local_Setup.md` Phase 10 says "82 triggers" (now 84); `BUILD_STATUS.md`'s amendment table is stale on AMENDMENT-004; `CLAUDE.md`'s in-force list omits AMENDMENT-005 | read 11 Oct | Q3 hygiene (first two); `CLAUDE.md` edit is a decision (D7) |
| L22 | Emblem gradient off-system; "STUDIO"/™ absent; raw ISO timestamp on the index; PNG weight | 1.0 *Deferred*; **unverified** whether still true | out of scope under the reference-implementation rule (*Roster cut to four*) unless a demo needs it |
| L23 | Cathedral repo items: LVAF→LVRF across ~17 documents; Compass hierarchy contradiction; readiness percentages; CDS-001 unratified; Stone III | *Open Cathedral items* | outside this repo |
| L24 | **Confidence weights as data** (the unfinished half of 2.0 item 1): `CONFIDENCE_FACTOR_WEIGHTS` and the band cut-offs are constants in `server/spine/confidenceModel.ts` | every run records `modelVersion` and the computed `modelFingerprint`, and `compareRuns` already flags a cross-fingerprint delta | **Optional, per D6** (Brad Piver, 11 Oct 2026). Model versions and thresholds change by commit and deploy; constants + the recorded `modelFingerprint` suffice, since the fingerprint already flags any change. Build weights as data only if a later need asks for it |

---

## 3. Decisions

### Decided

| # | Decision | By, date |
|---|---|---|
| Q2 | Who grants access: **Brad alone**, no delegates; a grant/revocation is an audited act whose actor is Brad | Brad Piver, 11 Oct 2026 |
| Q3 | Brad-only acts: grant/revoke access; accept or exclude pack entries; ratify or demote; retire an engagement; issue a model version; change any stated threshold. Authorized users research, record facts and evidence, walk outcomes, produce and lock runs | Brad Piver, 11 Oct 2026 |
| Q4 | Basis vocabulary is **derived** from `evidence.kind` (+ `source_verified`/`ai_sourced`/`citation_resolved`/`simulated`/attester), not stored | Brad Piver, 11 Oct 2026 |
| P4 | **Keep Caddy basic_auth**; revisit after 3.0 item 2, with the five prerequisites (L14) | Brad Piver, 11 Oct 2026 |
| — | Customers do not sign in; 3.0 is research under Provenance, Truth and Governance | Author, 3.0 draft revision 2 |
| — | P3: a tenant mismatch is a 404; it is logged, not recorded as a refusal; reads are in scope | Brad Piver, 11 Oct 2026 |
| D3 | **Rejecting a research result is Brad-only.** Classify, offerings, validate, pack-basis and claims are authorized-user acts | Brad Piver, 11 Oct 2026 |
| D4 | **`tenants.steward_person_id` identifies Brad** (the existing column) | Brad Piver, 11 Oct 2026 |
| D5 | **Grants are made by a box script that records Brad as actor**, plus an **in-app change-password route**; no in-app grant screen | Brad Piver, 11 Oct 2026 |
| — | **The trust root: SSH to the box plus the postgres superuser are trusted.** Break-glass `set_password.ts` can reset the steward's password, and postgres can bypass every trigger. Accepted and stated, not hidden; the steward's own password is the proof of every grant, revocation and reset on top of SSH (BUILD_STATUS, *3.0 Band A*) | Brad Piver, 11 Oct 2026 |
| D1 | **Research runs in LVRF's own pipeline now, behind a declared seam** — one module boundary for research intake — **migrating to Compass OS once Compass exists as code.** `CLAUDE.md` names the research-intake module as a Compass seam | Brad Piver, 11 Oct 2026 |
| D2 | **The derived basis vocabulary, strongest first: system of record > published > client-stated > inferred > assumed (the floor).** (A) `system_export` = system of record; (B) `observation` = **assumed** unless it carries a source reference, then **inferred** — self-declared confidence never raises the basis; (C) `vendor_publication` = published for facts about the tenant itself, inferred for facts about a customer; (D) `artifact` = client-stated with a customer-side attester, otherwise inferred; (E) `assessment_result` = outside the account-fact vocabulary (no basis). The five-level order is a **product decision citing AMENDMENT-005**, not a new evidence class | Brad Piver, 11 Oct 2026 |
| D7 | **AMENDMENT-005 is added to `CLAUDE.md`'s in-force list** | Brad Piver, 11 Oct 2026 |
| D8 | **Spine stages for the 3.0 items:** baseline — 3, 4, 6, 7, 8; attach — 9; measure/verify — 10; verify — 12, 13; measure — 14; return — 15; cross-cutting — 5 (the evidence basis) and 11 (tooling reliability). Items 1 and 2 (Band A) are cross-cutting, as built | Brad Piver, 11 Oct 2026 |
| D11 | **No amendment** for the entity record (product schema) or the vocabulary (derived, no new stored class) | Brad Piver, 11 Oct 2026 |
| — | **3.0 revision 3 is adopted as the working plan.** Not ratified; Q1 (the doctrine source) stays open | Brad Piver, 11 Oct 2026 |
| D6 | **Model versions and thresholds change by commit and deploy** (the commit author is the decider). Weights as data is **optional** (L24) | Brad Piver, 11 Oct 2026 |

### Open: blocks the next item (Band A)

None. D3–D6 were decided on 11 October 2026 (above).

### Open: everything else

| # | Decision | Options | Blocks |
|---|---|---|---|
| D9 | Must a run locked at `claimed` state that it is a hypothesis? (L18) | require the statement; or low confidence suffices | nothing urgent |
| D10 | WeasyPrint on the VPS, or rendering stays on the Mac | — | 3.0 item 15 |
| D11 (rest) | 3.0 draft Q1 (Rule76 doctrine source) and Q7 (`record_documents` provisional). Q5 (AMENDMENT-004 drift) is fixed by the hygiene batch's L21; Q6 decided (no amendment) | see the draft | ratification only |
| D12 | DB-level tenant backstop: trigger or RLS (L15) | — | L15 |
| **D13** | **The first real account for 3.0 item 6, with an independent hand-built baseline (item 12)** | Recommended: the first real Skillsoft engagement an authorized user is working — not Curia (a read-only reference built from published material); the hand-built baseline done before the research runs | **3.0 item 6 only** — pending Brad |

---

## 4. The queue

In order. Each item lists what it depends on. "Why here" is given where the
placement is a judgement.

| # | Item | Depends on | Why here |
|---|---|---|---|
| ~~Q1~~ | ~~**Fact supersession**: deploy (0028, backup first), then Brad's LVAF → "LVRF (value realization records)" correction, then Gate C~~ **DONE 11 Oct 2026.** Deployed `cb666e9`; corrected by Brad at 18:16 UTC; Gate C clean | — | 2.0's last item is closed |
| ~~Q2~~ | ~~**3.0 item 1 — an access grant is a record**~~ **DONE 11 Oct 2026**: deploys A (`da00660`, 0029) and B (`7c7e90e`); steward set (audit 206), bootstrap grant (207); sign-in requires a grant | D4, D5 (decided) | Band A first: the next user must be granted by an act that names Brad |
| ~~Q3~~ | ~~**3.0 item 2 — Brad-only acts, one shared check**~~ **DONE 11 Oct 2026**: deploy C (`9560bfd`); four steward-only routes; coverage guard. **3.0 Band A complete.** | Q2; D3, D4, D6 (decided) | the same shape as P3's helper and coverage guard: a route list, a guard that fails an unlisted route |
| Q3a | Hygiene batch: L5 (compare 500 → 422), L2 (panel label), L3 (`supports` CHECK, 0030), L21 (doc fixes) — **built, Gate A 11 Oct; deploy pending** | — | small, each a correctness or honesty fix; batched so it costs one Gate pass, done before the schema grows |
| Q4 | **D2–D4 drift checks**, with L16 (what governance each composite table owes) | — | Band B adds migrations (entity, regime, addressable population, sources). D2 guards exactly that; D4 guards the supersession chains facts (Q1) and entities (item 3) now use. Cheapest before the schema grows |
| Q5 | **Recons: 3.0 item 9** (the pack prompt is composed from live rows; the parser validates the same definition). Item 10's recon is done (no fact is a run input today) | — | the draft puts recons before item 6 |
| ~~Q6~~ | ~~Decide D1 (Compass), D2 (mapping), D7, D8; ratify or revise the 3.0 draft~~ **DONE 11 Oct 2026**: all decided; revision 3 adopted as the working plan (not ratified). D13 remains, blocking item 6 only | — | — |
| Q7 | **3.0 item 3 — the entity is pinned**, with L4 (the run seals its entity and account name) and L9 (`website` into the entity record) | Q6 | 3 → 4 → 5 before 6, per the draft |
| Q8 | **3.0 item 4 — disclosure regime** | Q7 | — |
| Q9 | **3.0 item 5 — one trust vocabulary (derived)** | D2 | — |
| Q10 | **3.0 item 6 — account research intake** (needs D13), with L6 (period on every accepted fact) and L8 (parse refusals on record); item 10 becomes binding here (a run seals the fact ids and values it used) | Q7–Q9, D1 | — |
| Q11 | 3.0 items 7 (total vs addressable) and 8 (sources as entities) | alongside Q10 | — |
| Q12 | 3.0 items 11 (research reliability) and 12 (a human-derived oracle) | the first account researched under Q10 | — |
| Q13 | 3.0 Band C: item 13 (incl. L10), 14 (after 6), 15 (incl. L7, D10) | as engagements need them | — |
| — | P4 prerequisites (L14), then the P4 decision | Q3 | the decision is after item 2 |
| — | L13 Tailwind 4 | after Q3 | a chore with its own regression; not mid-feature |
| — | L15 tenant backstop | D12; trigger: a second tenant | own plan |
| — | UI pass: L11, L12 | — | unscheduled; when a demo or a second user needs it |
| — | 3.0 Band D: items 16–18 | **a second real engagement** | must not be built before the trigger |
