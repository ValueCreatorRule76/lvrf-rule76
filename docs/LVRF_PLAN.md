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
| ~~L1~~ **DONE 11 Oct 2026 (Q4, deployed `384e0bc`)** | **D2–D4 drift checks**: migration journal vs schema; governed tables missing governance columns; orphaned supersession | `driftChecks.ts` implements D1 only | Q4 — before Band B adds migrations |
| ~~L2~~ **DONE 11 Oct 2026 (hygiene, `177eb49`)** | The confidence panel's label "Named human sponsor of record" describes a committer | `ConfidenceInstrument.tsx:22` | Q3 hygiene batch |
| ~~L3~~ **DONE 11 Oct 2026 (hygiene, `177eb49`)** | `value_outcome_evidence.supports` is free text; the gate compares it to `'actual'` | `text('supports')`, no CHECK on the table; only the route validates | Q3 hygiene batch (a CHECK, not a comment) |
| L4 | The run payload carries no institution name | `produceRun` payload has engagement, capability, metric — no account | with 3.0 item 3/10 (seal the entity in the run) |
| ~~L5~~ **DONE 11 Oct 2026 (hygiene, `177eb49`)** | `compareRuns` returns 500 on runs scored before `modelVersion` (`payload.confidence` absent) | reproduced on HEAD against local `lvrf` | Q3 hygiene batch (422 naming the run) |
| L6 | Research values carry no reporting period | no period column on `research_results` | **in Q4h:** every accepted account fact carries `as_of` = the last day of the period it describes, plus the period as stated; the contract asks for both and the reviewer sees both (§4e) |
| L7 | `render_record.py` reads `out/spine_run_*.json`, not the API | `records/render_record.py` l.372 | with 3.0 item 15 |
| L8 | Parse refusals (the parser's 422s) leave no record | no writer; `refusals` takes DB refusals only | **in Q4h:** `refusals` gains `source` (`database` \| `parser`), `sqlstate` required only for `database`; parse 422s are written through the pool, outside the rolled-back request (§4e) |
| L9 | `website` has no update path | no route writes it after create | with 3.0 item 3 (fold into the entity record) — item 13 |
| L10 | Fact (and outcome-evidence) verification after capture | `source_verified` set at capture only; no route | 3.0 item 13 |
| L11 | Narrow-viewport overflow on the runs table; card numbering `01A`; form/table left-edge misalignment; compare's `stage`/`claim`/`notes` rendered nowhere | `AddEvidenceCard.tsx` still `n="01A"`; viewport **unverified** (not re-measured) | UI pass, unscheduled |
| L12 | Sign-in cosmetics: nav links on the sign-in page; the bar reads "Signed in as" under the expiry overlay | *Later items, recorded at P2a* | UI pass, unscheduled |
| L13 | Tailwind 4 (clears the 7 accepted client audit findings) | lockfile at Tailwind 3 | standalone chore with its own regression pass, after Band A |
| L14 | `www` → apex redirect; HSTS/CSP; per-email sign-in throttle; TOTP; deploy-script vhost flip | *P4 — basic_auth is kept* | P4 prerequisites, after item 2 |
| L15 | DB-level tenant backstop (`lvrf.actor_tenant_id` + trigger or RLS) | not built | own plan; trigger: a second tenant, or research at volume |
| ~~L16~~ **DONE 11 Oct 2026 (Q4, deployed `384e0bc`)** | DEFECT-003: composite-key tables partly ungoverned | `value_outcome_evidence` has only `_no_ai_actual`; `offering_capabilities` and `reflection_evidence` have no triggers | Q4 with D3 (the same question: what governance each table owes) |
| L17 | The payload holds exactly one outcome (a cohort payload will need another shape) | `produceRun` 422s on ≠ 1 outcome | when an engagement needs two; not before |
| L18 | Hypothesis lock: must a run locked at `claimed` *state* that it is a hypothesis? | `banner_title` is optional (defaults `PROVENANCE`); never decided | decision D9 |
| L19 | FK names truncated at 63 bytes (two instances) | recorded, harmless | leave unless a migration names one |
| L20 | Rejecting a research result does not create an exclusion | by design (*Still outstanding*) | none — recorded, not a defect |
| ~~L21~~ **DONE 11 Oct 2026 (hygiene, `177eb49`)** | Docs drift: `LVRF_Local_Setup.md` Phase 10 says "82 triggers" (now 84); `BUILD_STATUS.md`'s amendment table is stale on AMENDMENT-004; `CLAUDE.md`'s in-force list omits AMENDMENT-005 | read 11 Oct | Q3 hygiene (first two); `CLAUDE.md` edit is a decision (D7) |
| L22 | Emblem gradient off-system; "STUDIO"/™ absent; raw ISO timestamp on the index; PNG weight | 1.0 *Deferred*; **unverified** whether still true | out of scope under the reference-implementation rule (*Roster cut to four*) unless a demo needs it |
| L23 | Cathedral repo items: LVAF→LVRF across ~17 documents; Compass hierarchy contradiction; readiness percentages; CDS-001 unratified; Stone III | *Open Cathedral items* | outside this repo |
| L24 | **Confidence weights as data** (the unfinished half of 2.0 item 1): `CONFIDENCE_FACTOR_WEIGHTS` and the band cut-offs are constants in `server/spine/confidenceModel.ts` | every run records `modelVersion` and the computed `modelFingerprint`, and `compareRuns` already flags a cross-fingerprint delta | **Optional, per D6** (Brad Piver, 11 Oct 2026). Model versions and thresholds change by commit and deploy; constants + the recorded `modelFingerprint` suffice, since the fingerprint already flags any change. Build weights as data only if a later need asks for it |
| L25 | **OS maintenance on the box**: 29 updates pending and "System restart required". A reboot restarts Postgres and the API | reported by Brad, 11 Oct 2026 | Its own plan before it is done: a `pg_dump -Fc` backup first; which updates (`apt list --upgradable`), and whether the kernel is among them; a quiet window; after the reboot, check that Postgres comes back with checksums on and `lvrf-api` is active, then health, the pre-check, 87 triggers, and Brad's cookie curl. Not mixed into a feature deploy |
| ~~L26~~ **DONE 11 Oct 2026 (Q4, deployed `384e0bc`)** | **The Runs list shows no account for runs under a retired engagement** (Curia reference example, runs 1–21) | `runsIndex.ts` joins the institution only through a current engagement (`e.deleted_at IS NULL` in the ON clause), by design; the data is complete (every engagement has Curia) | UI pass or with L4: join the institution regardless, and mark the engagement retired, so "retired" and "unknown account" stop looking alike |

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
| **D13** | **The first REAL engagement, and 3.0 item 12** (the independent hand-built baseline compared field by field with research) | **Narrowed by Brad, 12 Oct 2026: D13 no longer blocks building item 6** (Q4h). It governs only the first real engagement researched under item 6, and item 12's comparison | **Open** for the real engagement; not blocking Q4h |

---

## 4. The queue

In order. Each item lists what it depends on. "Why here" is given where the
placement is a judgement.

**The order from here (Brad, 12 Oct 2026):** Q4c1b deploy → Brad's retirements and
exclusions of IT entries (§4d) → Q4g → Q4h → Q4c2 → Q4d.

| # | Item | Depends on | Why here |
|---|---|---|---|
| ~~Q1~~ | ~~**Fact supersession**: deploy (0028, backup first), then Brad's LVAF → "LVRF (value realization records)" correction, then Gate C~~ **DONE 11 Oct 2026.** Deployed `cb666e9`; corrected by Brad at 18:16 UTC; Gate C clean | — | 2.0's last item is closed |
| ~~Q2~~ | ~~**3.0 item 1 — an access grant is a record**~~ **DONE 11 Oct 2026**: deploys A (`da00660`, 0029) and B (`7c7e90e`); steward set (audit 206), bootstrap grant (207); sign-in requires a grant | D4, D5 (decided) | Band A first: the next user must be granted by an act that names Brad |
| ~~Q3~~ | ~~**3.0 item 2 — Brad-only acts, one shared check**~~ **DONE 11 Oct 2026**: deploy C (`9560bfd`); four steward-only routes; coverage guard. **3.0 Band A complete.** | Q2; D3, D4, D6 (decided) | the same shape as P3's helper and coverage guard: a route list, a guard that fails an unlisted route |
| ~~Q3a~~ | ~~Hygiene batch: L5, L2, L3 (0030), L21~~ **DONE 11 Oct 2026**: deployed `177eb49` | — | small, each a correctness or honesty fix; batched so it costs one Gate pass, done before the schema grows |
| ~~Q4~~ | ~~**D2–D4 drift checks**, with L16 and L26~~ **DONE 11 Oct 2026**: deployed `384e0bc`; step 5c ran before the restart (D2 none; D1/D3/D4 no findings); 95 triggers. D2 enforces never new code against an unmigrated database | — | — |
| ~~Q4b~~ | ~~**The research contract module — the first step of Band B.**~~ **DONE 12 Oct 2026**: deployed `0ee288d` (0031, 98 triggers; step 5c D2 none; Gate C clean; 13 legacy results valid v3). `server/research/contracts.ts` (under the D1 seam): the industry-measure contract extracted from `industryResearch.ts`; the pack research prompt **generated from live rows**, with the pack's current entries and exclusions; the parser and the accept mapping reading **the same definition**. Built (`65f8486` refactor, proven behaviour-neutral; feat with 0031: `research_prompts`, immutable, 98 triggers; parse requires `prompt_id`, refuses a prompt of another contract version or another industry) Item 6 then adds the `institution_fact` contract to the same module | the Q4 deploy | the item 9 recon (11 Oct) found the pack prompt hand-written and unversioned, outside the repo, and the parser's contract hand-written twice. Account research must not become a third prompt |
| ~~Q5~~ | ~~**Recons: 3.0 items 9 and 10**~~ **DONE.** Item 9 (11 Oct 2026): the pack prompt is **not** composed from live rows — it is hand-written per run, outside the repo — and the parser validates hand-written copies of the contract (`industryResearch.ts` lines 148–189 and 460–464); the metric prompt (`researchPrompt.ts`) does follow the one-definition pattern. Fix queued as Q4b. Item 10: no account fact is a run input today | — | the draft puts recons before item 6 |
| ~~Q6~~ | ~~Decide D1 (Compass), D2 (mapping), D7, D8; ratify or revise the 3.0 draft~~ **DONE 11 Oct 2026**: all decided; revision 3 adopted as the working plan (not ratified). D13 remains, blocking item 6 only | — | — |
| ~~Q4c1~~ | **DONE 12 Oct 2026**: deployed `6f44b7a` (no migration; step 5c clean; Gate C clean; Brad confirmed the five cards in the browser). ~~**Pack-research cards on the pack page**~~: generate the prompt (Q4b route), paste the agent's response to parse, accept or reject each pending result, and record exclusions. Accept, reject and exclude stay steward-only (Band A); generate and parse are authorized acts. Same routes, same session, no new actor path. Detailed plan in §4b | Q4b | unblocks Q4e (Datacom) |
| Q4c1b | **Built, Gate A 12 Oct 2026; deploy pending** (0032; `verify_pack_entry_retire.sh` 70/0). **Retire a pack entry** (steward-only, reason required, migration 0032), retired entries shown on the pack page, and the R4 caveats aid. Plan in §4d, **approved by Brad 12 Oct** | Q4c1 | Q4e accepted six IT entries Brad now judges should not stand, and no route can correct an accepted entry |
| Q4g | **Contract v4: a required `caveats` field per measure** (Brad, 12 Oct). It is a list of strings, and an empty list is allowed but must be stated explicitly; a missing key is refused as drift. The prompt asks for it, and R4 shows it as its own block, above the text-search block. Prompts generated under v3 go stale, as designed (parse refuses them, naming both versions). `PROMPT_TEMPLATE_VERSION` bumps too. The legacy and v3-era accepted results are untouched; `check_legacy_research` checks them against the version they were parsed under | Q4c1b | turns the R4 caveat search into a structural field |
| Q4c2 | **The outside-in walk card on the account page**: the analyst-of-record person, the offering and capability, the capability's claim on a pack entry, the value outcome (which creates the engagement and metric), pack basis, produce, lock, then retire the reference engagement | Q4c1 (shared card patterns) | unblocks Q4d (Scotts) |
| Q4d | **Reference test A: Scotts Miracle-Gro on an existing pack** (Manufacturing; TRIR accepted). Outside-in, published material only; not D13. Step plan in §4a; R1 and R5 decided | Q4c2 | tests a second account on a pack that already exists |
| Q4e | **Reference test B: Datacom, a pack-only test** under the existing `information-technology` industry (R2, R3). The first real use of the Q4b prompt route. Step plan in §4a; no run, because no published Datacom baseline exists | Q4c1 | tests the pack loop end to end on a pack that does not exist yet |
| Q4h | **3.0 item 6 pulled forward: account research intake** (Brad, 12 Oct), with items 3 and 4 folded in minimally (the entity: legal name and identifier; the disclosure regime) and L6 and L8. The Q4b pattern: an `institution_fact` contract, a prompt generated from live rows and stored immutably, parse that refuses a different entity naming both, per-field review that writes evidence and fact in one transaction. First test: Scotts Miracle-Gro (a public filer), replacing hand entry of its facts in Q4d where research can supply them. Plan in §4e; H1–H4 decided (§4e) | Q4c1b, Q4g; **not D13** (narrowed) | Brad's decision: build the intake before the first real engagement, test it on published accounts first |
| Q7 | **3.0 item 3, the rest** (after Q4h's minimal entity): parent and affiliate relationships with their own evidence; L4 (the run seals its entity and account name); L9 (`website` into the entity record); item 11's entity mismatch rate | Q4h | — |
| Q8 | **3.0 item 4, the rest** (after Q4h's minimal regime): the gap register computes *structurally unobtainable by research* per account from its regime, rather than asserting it | Q4h | — |
| Q9 | **3.0 item 5 — one trust vocabulary (derived)** | D2 | — |
| ~~Q10~~ | ~~**3.0 item 6 — account research intake**~~ **Moved forward as Q4h** (Brad, 12 Oct 2026); D13 no longer blocks it. Item 10 (a run seals the fact ids and values it used) still becomes binding when facts feed runs, which Q4h does not do | — | — |
| Q11 | 3.0 items 7 (total vs addressable) and 8 (sources as entities) | alongside Q10 | — |
| Q12 | 3.0 items 11 (research reliability) and 12 (a human-derived oracle) | the first account researched under Q10 | — |
| Q13 | 3.0 Band C: item 13 (incl. L10), 14 (after 6), 15 (incl. L7, D10) | as engagements need them | — |
| — | P4 prerequisites (L14), then the P4 decision | Q3 | the decision is after item 2 |
| — | L13 Tailwind 4 | after Q3 | a chore with its own regression; not mid-feature |
| — | L15 tenant backstop | D12; trigger: a second tenant | own plan |
| — | UI pass: L11, L12 | — | unscheduled; when a demo or a second user needs it |
| — | 3.0 Band D: items 16–18 | **a second real engagement** | must not be built before the trigger |

### 4a. Outside-in reference tests: step plans (Brad's decision, 11 Oct 2026)

These are two tests like Curia: **published material only, not D13, owned by "Brad Piver
(external analyst of record)"**, a customer-side person on each institution (Curia's
precedent). Each step is marked: **(a)** Brad in the UI; **(b)** Brad runs an existing
script; **(c)** needs building (Q4c unless noted).

**A. Scotts Miracle-Gro: an existing pack (Manufacturing, TRIR)**

| # | Step | Route | Mark |
|---|---|---|---|
| A1 | Create the account, classified `manufacturing`, with a classification note | `POST /api/account-inputs` (Create account card) | (a) |
| A2 | The analyst-of-record person on the institution | `POST /api/institutions/:id/inputs` | (c) |
| A3 | Facts: revenue and headcount from the 10-K, as `public_filing` with the URL | `POST /api/institutions/:id/facts` (facts card) | (a) |
| A4 | The capability and its offering. **No EHS offering exists in the catalog**; the nearest is `skillsoft_compliance_suite`. Adding an EHS offering is a catalog change (decision R5) | `POST /api/institutions/:id/offerings` | (c) |
| A5 | The capability's claim on the TRIR pack entry | `POST /api/capabilities/:id/industry-measures` | (c) |
| A6 | The value outcome, which creates the engagement and the metric. The baseline is **2.28**, Total Incident Rate, **FY2021** (fiscal year end), owned by A2. **No target** (see below) | `POST /api/institutions/:id/value-outcomes` | (c) |
| A7 | The metric's pack basis is TRIR | `POST /api/business-metrics/:id/pack-basis` | (c) |
| A8 | Baseline evidence: `public_filing`, `supports = baseline`. The provenance is the CR report with its URL and page. The summary quotes the series FY2019 2.2 / FY2020 1.7 / FY2021 2.28, and Scotts' own stated reason for the 2021 rise, quoted, not paraphrased | `POST /api/value-outcomes/:id/evidence` (evidence card) | (a) |
| A9 | The vendor claim: `vendor_publication`, `supports = impact_basis`. The provenance is Skillsoft's story, and the summary says "75% reduction in recordable incidents; no period stated; no baseline year stated" | same | (a) |
| A10 | Produce the run with the banner "OUTSIDE-IN HYPOTHESIS", then lock it | `POST /api/engagements/:id/produce-run`, `POST /api/value-runs/:id/lock` | (c) |

How A stays honest:

- **The 2.28 is recorded as published evidence about the customer, from the customer's
  own report.** Today that is evidence kind `public_filing`, Curia's precedent for an
  earnings release. **The D2 basis ("published") is not computed anywhere yet**: that is
  Q9. **D2's mapping also does not name `public_filing`** (it names system_export,
  observation, vendor_publication, artifact and assessment_result), so a ruling is needed:
  **R1, proposed: `public_filing` is published, whoever it describes.** The source is
  the subject's own statement on the public record, unlike `vendor_publication` about a
  customer.
- **Scotts' confounder.** Incidents rose in FY2021 on Scotts' own account. It goes in
  the baseline evidence summary in Scotts' words. **No outcome-level confounder field
  exists**; the pack entry's `confounders` is industry-level. That is enough for this
  test, and a field is a later decision.
- **The 75% is a vendor claim and never the actual.** `lvrf_block_ai_actual`
  (`hardening.sql`) refuses `vendor_publication` evidence as `supports = actual`, so it
  is enforced, not only a convention. It also sets **no target**. With no period and no
  baseline year, applying 75% to 2.28 (giving 0.57) would invent the claim's terms, and
  Scotts' published series shows no 75% fall. The run states the claim beside the
  published series. That gap is the test's finding, not something to smooth over.
- **To confirm before A6:** Scotts' "Total Incident Rate" is the OSHA rate per 200,000
  hours, the pack entry's unit. If the report says otherwise, the metric does not match
  the pack entry, and A7 stops. FY2019 is given as 2.2 against 2.28's two decimals; it
  is recorded as published.

**B. Datacom: a new pack (service desk)**

| # | Step | Route | Mark |
|---|---|---|---|
| B0 | **The industry.** `information-technology` already exists, with an empty pack. **Recommended (R2): use it.** Datacom is an IT services provider, and for it service desk measures are the product line. No route or script creates an industry; see "a new industry" below if Brad wants a separate one | — | — |
| B1 | Generate the prompt from live rows (the first real use of Q4b) | `POST /api/industries/:id/research-prompts` | (c) |
| B2 | Brad runs it in his research tool, for FCR, first-level resolution, CSAT, MTTR, SLA attainment and reopen rate. MetricNet/HDI are partly gated, so only what Brad can actually read and cite is returned | outside LVRF | Brad |
| B3 | Parse the response; it must echo the `prompt_id` and the slug | `POST /api/industries/:id/research-results` | (c) |
| B4 | Accept or reject each result, and record exclusions (steward-only) | `POST /api/research-results/:id/accept\|reject`, `POST /api/industries/:id/exclusions` | (c) |
| B5 | The pack renders | `GET /api/industries/:slug/pack` (pack page) | (a) |
| B6–B13 | The account, as A1–A10: Datacom classified `information-technology`; the analyst person; facts; the offering (**R4: which Skillsoft offering the case study names**); the claim on the FCR entry; outcome; basis; evidence; run | as A | as A |

How B stays honest:

- **R3: there is no published Datacom baseline.** The case study gives only relative
  changes: "30% rise in customer satisfaction" and "100% increase in first-contact
  resolution despite doubled call volumes". `baseline_value` is required on a value
  outcome. **An HDI/MetricNet benchmark is the industry's figure, not Datacom's**;
  entering one as Datacom's baseline would manufacture it.
  - So B stops at B5, a pack test, unless Brad finds a figure Datacom itself published.
  - Both claims are recorded as `vendor_publication`, `supports = impact_basis`, once an
    outcome exists. The source is the original Skillsoft story; casestudies.com is a
    republisher.

**A new industry.** No route or script exists. The ten industries were seeded by
migration 0019. The smallest governed way, if Brad wants one:

- **A steward-only script, `scripts/add_industry.ts`**, in the shape of
  `grant_access.ts`: the steward proves the act with their own password; the actor is
  set for the audit; it refuses anyone but the tenant's steward.
- **Migration 0032:** `industries.added_by_person_id` and `added_reason`, both or
  neither, and required after a fixed cut-off, as Q4b did for `prompt_tracked`. The
  ten seeded rows stay null.
- **`industries` already has `_audit` and `_no_delete`** (section 11).
- **A script, not a route:** taxonomy changes are rare, there is no UI to put it in,
  and grants already set the pattern for steward acts done from the box.

**Decided by Brad, 11 Oct 2026:**

- **R1, yes:** `public_filing` about the company itself counts as published. Scotts'
  CR report is published evidence of Scotts' baseline. It is recorded as
  `public_filing` now and derived as published once Q9 builds the basis.
- **R2:** use the existing `information-technology` industry. There is no
  `add_industry` script; the design above is kept only as a record.
- **R3, yes:** B is a pack-only test. No benchmark is entered as Datacom's baseline,
  and there is no Datacom value outcome or run.
- **R4:** Datacom's offering is **unnamed in the source**.
  - The source says "the broad range of courses, books and video resources",
    SFIA-mapped.
  - It is recorded as the general library, noted as unnamed; no product is picked.
  - **The story is dated 2016**, and the PDF's "100%" may refer to call volume, not
    FCR.
  - Wherever the story is recorded, it is quoted verbatim from
    https://cdn.featuredcustomers.com/CustomerCaseStudy.document/skillsoft_datacom-systems_118621.pdf.
- **R5:** use `skillsoft_compliance_suite`, with "EHS solution" stated in the claim.
- **The cohort:** each reference engagement is retired once its run is locked (Q4c2's
  last step, as Curia's were).

### 4b. Q4c1: pack-research cards on the pack page (plan approved by Brad, 12 Oct 2026, with his three recommendations)

**Spine stage:** `model`. The pack is the industry-level model of what carries money,
and Q4c1 is how it gets entries. It adds **no migration, no new write route, and no
hardening change.** The five existing routes get a UI; one read route is added.

**Server**

- **S1: `GET /api/industries/:slug/research`**, a new read. It is tenant-scoped like
  the pack GET: another tenant's slug gives 404, and it is added to the tenant-scope
  cases. It returns:
  - `industry`: `{ id, name, slug }`;
  - `contract_version_now`;
  - `prompts`, newest first: id, generated_at, generated_by, contract and template
    versions, sha256, listed counts, results_count and the text;
  - `pending`: each pending `industry_measure` result with its id, field_name,
    parsed_at, parsed_by, research_tool, prompt_id (or "predates prompts"),
    contract_version and raw_response.
- **Why a separate route:** the pack GET is the account manager's read. A separate
  route keeps that GET byte-identical, so the prod-copy equivalence must show it
  unchanged.
- **Where it lives:** in `industryResearch.ts`, inside the D1 seam. Reads are allowed
  anywhere; writes stay there.

**Client** (`IndustryPackPage`, a "Research" section below the pack; every card is
built on `GovernedForm` or `GovernedAction`)

- **C0: 422 issues render.** `PostResult.refused` gains optional `issues: string[]`,
  and `ResultBlock` lists them. Without this, a parse refusal shows only "N issue(s)
  found; nothing was written." Any route that already sends `issues` gains the list,
  and nothing else changes.
- **C1: Generate prompt** (`GovernedAction`, any authorized user). On success it shows:
  - the text in mono, with a Copy button;
  - the id and sha256 in mono;
  - the contract and template versions;
  - "lists N entries, M exclusions";
  - "Give the agent this whole text; it must return the prompt_id and slug as shown."
- **C2: Prompts on record.** The list from S1; each prompt's text expands and copies.
  A prompt whose contract version is not the current one is marked **STALE**, in
  `--warning`, with "generate a new prompt".
- **C3: Parse a response** (`GovernedForm`, any authorized user). A textarea takes the
  JSON.
  - **The provenance block states:** "Records what the agent returned, parsed by you.
    Nothing enters the pack until the steward accepts it."
  - **Invalid JSON is refused locally,** and no request is sent.
  - **The form shows the response's `prompt_id`** and whether it is a prompt on record.
    This is informational; the server decides.
  - **The body is the pasted JSON, verbatim.**
  - **After a 201:** the agent's `measures_tested_and_excluded_as_unaddressable`, read
    from the pasted text, is listed with "Record as exclusion…" on each line. **Parse
    stores none of them**, so this list exists only on screen until a person records
    them.
- **C4: Pending review.** Each result is rendered from its `raw_response`: every
  contract field, the prompt and contract version (or "predates prompts"), and who
  parsed it, when and with which tool.
  - Accept and Reject each require a review note.
  - **Steward-only:** for anyone else they are disabled, with "Accepting is the
    steward's act (`steward_name`)". The server's 403 stays the authority.
  - A 409, such as an excluded name, renders as a conflict, as everywhere.
- **C5: Exclude a measure** (steward-only, `GovernedForm`).
  - Fields: name, reason (the person's own), and optionally the research's proposal:
    tool and text, both or neither, as `industry_measure_exclusions_proposal_is_complete`
    requires.
  - It is prefilled from C3's "Record as exclusion…": the name, the research tool, and
    the agent's line as the proposal text. **The reason is always typed by the
    steward.**
  - **Brad's requirement (12 Oct):** from the agent's list, the agent's wording goes
    only into `proposed_by_research_tool` / `proposal_text` (0026), **never into
    `reason`. The reason box starts empty**, and only the steward types in it.
    Verified by a case and a screenshot of the empty reason box.
- **After every write,** both the pack and S1 are refetched.
- **Design tokens are cited, never restated.**

**Verification (Gate A)**

- **`verify_pack_research.sh`:**
  - S1's shape, pending-only results, the stale flag, another tenant → 404;
  - the pack GET is byte-identical before and after;
  - a full walk through the routes the cards call: generate → parse → pending → accept
    → the pack entry → an exclusion from the agent's list.
- **A headless-browser walk on a clone, with screenshots looked at:**
  - the steward walks the whole loop;
  - a non-steward sees accept, reject and exclude disabled with the steward's name;
  - a refused parse shows its issues list;
  - a stale prompt is flagged.
- **Deliberate breaks:**
  - the client's steward gate removed: the button is enabled, and the server still
    answers 403;
  - S1's tenant check removed: the tenant-scope case fails;
  - C0 removed: the issues list is gone from the screenshot.
- **Also:** the tenant-scope coverage including S1; the regression; the client `tsc`,
  build and lint; and a prod-copy equivalence showing every existing GET identical.

**Deploy:** no migration. A backup is still taken first, as Q4's was. The deploy
script is unchanged, so no re-exec.

**Then Q4e:** Brad generates the `information-technology` prompt on prod and runs it,
then parses, reviews and excludes, all in the UI. Per R4, the Datacom story is quoted
verbatim in BUILD_STATUS, as the test's subject. R3 means it is not recorded as
evidence: there is no outcome to attach it to.

### 4c. Q4c2: the outside-in walk card on the account page (plan, 12 Oct 2026; not yet approved)

**Spine stages:** `attach` (offering, capability, claim), `model` (pack basis),
`commit` and `measure` up to the baseline (the value outcome), and `return` (produce,
lock, retire).

**Same routes, same session, no new actor path.** It adds **no migration, no new write
route and no hardening change.** It adds **one read**, and **reuses the evidence card**
with one prop.

**What exists, and what the walk needs.** The account page's read
(`GET /api/institutions/:id/view`) gives the institution, facts, pack entries (with
id), metrics (with `industry_measure_id`) and engagements (id, name). The walk needs
three more things:

- **The institution's people.** `GET /api/persons?institution_id=` already lists them.
- **Its capabilities and their claims, and its value outcomes:** none of these is
  readable today. **S1: `GET /api/institutions/:id/walk`**, a new read.
  - It returns:
    - the capabilities, each with its claims (pack entry, claim text, who, when);
    - the value outcomes per engagement: id, metric, baseline value and date,
      realization, confidence, and the evidence linked, by `supports`;
    - each engagement's runs: number, locked or not;
    - whether the engagement is retired.
  - It is tenant-checked like `/view` (`isOtherTenant`, logged), with a tenant-scope
    case.
  - **A separate read, not more fields on `/view`:** `/view` is the account manager's
    read and stays byte-identical, as Q4c1 kept the pack GET.
- **The pack entry's confounders.** `GET /api/industries/:slug/pack` already returns
  them.

**The walk, for Scotts.** A1 (create the account) and A3 (facts) are already in the
UI. The card's steps are numbered as in §4a.

| # | Step | Route (existing) | Who | What the card shows and requires |
|---|---|---|---|---|
| A2 | **Analyst of record**: a customer-side person on the institution, e.g. "Brad Piver (external analyst of record)", titled as Curia's is | `POST /api/institutions/:id/inputs` (`persons`: full_name, email, title) | authorized | **Email is required by the route** (decision W1). Not simulated |
| A4 | **Offering and capability**: `skillsoft_compliance_suite`, a new capability (W2), owned by A2, primary | `POST /api/institutions/:id/offerings` (offering_key, capability_name, owner_person_id, is_primary, basis) | authorized | The offering is chosen from the tenant's catalog. **`basis` states "EHS solution"** (R5). The owner must be the institution's own non-simulated person |
| A5 | **The capability's claim on a pack entry**: TRIR | `POST /api/capabilities/:id/industry-measures` (industry_measure_id, claim) | authorized | **The pack entry's definition, unit and CONFOUNDERS are shown above the claim box**, from the pack GET, in the pack page's "What moves this that is NOT capability" block. The claim text is the person's. **Refused unless the account is classified into the measure's industry** (`manufacturing`). **Final: a claim is not amended** (supersede the capability) |
| A6 | **The value outcome, with its published baseline**: engagement "Scotts Miracle-Gro — reference example, not an engagement", owned by A2; metric "Total Incident Rate" (unit as the CR report states it, direction decrease, source_system naming the CR report); capability from A4; **baseline 2.28** at FY2021 year-end; **no target** | `POST /api/institutions/:id/value-outcomes` | authorized | Creates the engagement and the metric. **Target is optional and left empty when the source states none.** The card says "a hypothesis with no target is complete; never derive one from a vendor claim". **Zero is data:** the baseline field takes 0. **Before A6, check the unit:** Scotts' "Total Incident Rate" must be the OSHA rate per 200,000 hours, the TRIR entry's unit (§4a) |
| A7 | **Pack basis**: the metric → TRIR | `POST /api/business-metrics/:id/pack-basis` (industry_measure_id, basis_note) | authorized | Offered only for an entry the capability claims. Refused across industries. **Final: a basis is not amended** |
| A8–A9 | **Evidence**: the baseline (`public_filing`, `supports = baseline`; the CR report URL and page; the FY2019–FY2021 series quoted; Scotts' own reason for the 2021 rise, in Scotts' words), and the vendor claim (`vendor_publication`, `supports = impact_basis`; "75%… no period stated") | `POST /api/value-outcomes/:id/evidence` | authorized | **Reuse `AddEvidenceCard`.** Today it is bound to a run (`run.payload.valueOutcomeId`), so evidence can only be added after a run exists. **Change: it takes an `outcomeId` prop**, so evidence is added before the first run, and only one run is produced and locked. `lvrf_block_ai_actual` refuses `vendor_publication` as `actual`, and the card does not offer that pairing |
| A10a | **Produce** the run: banner "OUTSIDE-IN HYPOTHESIS", with a note | `POST /api/engagements/:id/produce-run` (banner_title, note, source_fixture) | authorized | Shows the run's realization (claimed), confidence and banner, and links to the run page. Refused while there is no value outcome |
| A10b | **Lock** the run, with a lock reason | `POST /api/value-runs/:id/lock` (lock_reason) | authorized | "Locking is final: the run cannot change." A second lock → 409 |
| A11 | **Retire** the reference engagement, with a retirement reason (the cohort decision) | `POST /api/engagements/:id/retire` (retirement_reason) | **steward-only** | Offered only once a locked run exists. Disabled for anyone else, naming the steward |

**Steward-only steps: one, A11 (retire).** A2–A10 are authorized acts under
`MUTATING_ROUTE_CLASS`. The classification is unchanged, and the client gate is a
courtesy: the server's 403 decides.

**The card's shape** (on `InstitutionPage`, below the facts):

- One card, "Outside-in walk", with the steps in order.
- Each step shows **done** (what was recorded and by whom, from S1), **next** (its
  form), or **waiting** (with what it waits for).
- Every form is a `GovernedForm`, and refusals render verbatim, with issues.
- After each write, `/view` and S1 refetch in place.
- **Nothing is prefilled from a source.** The person types every figure and citation;
  the card only orders the steps.

**Gate A**

- **`verify_outside_in_walk.sh`:**
  - **API:** S1's shape; tenant 404; the walk end to end on a clone, with a fictional
    account. **Scotts' real figures are not used as test data.**
  - **A headless-Chrome walk by session**, steward and non-steward, with screenshots
    looked at:
    - the confounders block above the claim;
    - no target derived;
    - evidence before the run;
    - the run locked;
    - retire disabled for a non-steward.
  - **Cases:**
    - a claim or basis across industries is refused;
    - a second claim or basis is refused as final;
    - `vendor_publication` as `actual` is refused;
    - a baseline of 0 is accepted;
    - a second lock → 409;
    - retire by a non-steward → 403.
  - **Breaks:**
    - the retire gate in the client (the server still 403s);
    - S1's tenant check;
    - the evidence card's `outcomeId` path (without it, evidence cannot be added
      before a run).
- **Also:** the regression; prod-copy equivalence (every existing GET identical,
  `/view` included); the client `tsc`, build and lint.

**Decisions for Brad**

- **W1:** the analyst-of-record person's email on Scotts (the route requires one).
  Curia's precedent is a named external-analyst person on that institution.
- **W2:** the capability's name, e.g. "Workplace safety: EHS".
- **W3:** whether the walk card shows on every account (recommended: it is the same
  governed routes) or only on reference examples.

**Then Q4d (Scotts) is Brad's in the UI:** A1 and A3 in the existing cards, A2–A11 in
the walk card.

### 4d. Q4c1b: retire a pack entry, and the R4 caveats aid (plan approved by Brad, 12 Oct 2026)

**Why:** Q4e accepted all 13 IT results (see BUILD_STATUS, *Q4e*). No route retires,
demotes, supersedes or annotates a pack entry. The exclusions route already says
"Retire or supersede the entry first", to a route that does not exist.

**Spine stage:** `model`. The pack is the industry-level model.

**Migration 0032 (`industry_measures`):**

- **New columns:** `retired_by_person_id` (uuid, FK → persons, ON DELETE RESTRICT) and
  `retirement_reason` (text), both nullable.
- **CHECK `industry_measures_retirement_is_complete`:**
  - either `deleted_at`, `retired_by_person_id` and `retirement_reason` are all null,
    and `status <> 'retired'`;
  - or `deleted_at` is set, `status = 'retired'`, `retired_by_person_id` is set, and
    `char_length(btrim(retirement_reason)) >= 12`.
- **Header:** what it changes, what it could orphan (nothing), BACK UP FIRST.
- **Prod today:** 26 entries, all `proposed`, none deleted or superseded, so the CHECK
  holds on every existing row.
- **Triggers:** unchanged at 98. `industry_measures` is already in the governed loop
  (`_audit`, `_touch`, `_no_delete`, `_supersession_sane`).

**Route: `POST /api/industry-measures/:id/retire`** (new router, mounted at
`/api/industry-measures`; a pack act, outside the research seam like
`industryExclusions.ts`):

- **Steward-only:** `requireSteward(pool)`, `MUTATING_ROUTE_CLASS` `steward`, labelled
  "Retiring a pack entry". **`verify_steward_acts.sh`'s count goes 4 → 5.**
- **Body:** `retirement_reason`, required, at least 12 characters after trimming
  (422). The route checks it and so does the CHECK.
- **Tenant-checked** with `isOtherTenant`: another tenant's entry → 404, logged, with a
  tenant-scope case.
- **The entry must be current** (not retired, not superseded); otherwise 409 naming its
  state. The row is locked (`FOR UPDATE`) against a concurrent retire.
- **It refuses (409, naming each dependent) while anything current depends on it:**
  - a claim (`capability_industry_measures`) on a capability that is not retired or
    superseded;
  - a pack basis (`business_metrics.industry_measure_id`) on a metric that is not
    retired or superseded.
  - "Supersede the capability or metric first." Today nothing depends on any IT entry.
- **It writes** `status = 'retired'`, `deleted_at = now()`, `retired_by_person_id = the
  actor`, and `retirement_reason`. Audited by `industry_measures_audit` with the actor.
- **The accepted `research_result` is untouched:** it stays accepted, and its
  `industry_measures_id` still points at the now-retired entry. History reads "accepted
  by Brad at 01:32, retired by Brad at …, because …".

**After retirement:**

- **The name can be excluded through the existing route.** Its "in the pack" test
  already filters `deleted_at IS NULL`, so the 409 no longer applies.
- **A retired, unexcluded name can return:** a later accept of a new result creates a
  new row. The unique `(industry_id, name)` index is partial, over current entries only.
- **An excluded name cannot return:** accept's exclusion check refuses it. That is the
  difference between Brad's two groups below.

**The pack page shows retired entries; it does not hide them:**

- **`GET /api/industries/:slug/pack` gains `retired`:** name, unit, direction, citation,
  retired_at, retired_by, retirement_reason, and the original review (note, reviewer,
  date).
- **The prod-copy equivalence must show this as the only change:** the pack GET gains
  `retired: []`, and every other GET is byte-identical.
- **A "Retired" card after "Tested and excluded"**, collapsed by default (`<details>`),
  with a count.
  - Each entry shows who retired it, when, and the reason (leading), then its original
    review in muted text.
  - It also says whether the name has since been excluded.
- **`/view`'s pack list and the industries list count current entries only**, as now.

**UI:**

- **"Retire this entry…"** on each current pack entry. It opens an inline
  `GovernedForm`: a reason box, empty, at least 12 characters, with
  "Final: a retired entry is not restored. It can return only by a new accepted
  research result."
  - It is disabled for non-stewards, naming the steward. The server's 403 decides.
- **After a retirement,** the pack refetches in place, and the entry moves to
  "Retired".
- **When the retired name is one the agent listed** in the current parse,
  "Record as exclusion…" works as in Q4c1. Otherwise R5 takes the name typed by hand.

**The R4 caveats aid (client-only; the server is unchanged):**

- **Where the caveats are:** the agent writes them inside its fields; in Q4e both sat
  in `citation` ("reviewer should confirm…"). There is no caveats field.
- **The card searches every string field of `raw_response`** for caveat phrases:
  - "reviewer should", "should confirm", "confirm in";
  - "secondary summar…", "per secondary";
  - "unverified", "not verified";
  - "could not (verify|confirm|access)";
  - "paywall", "gated", "estimate…".
  - Each matching sentence is shown, verbatim and with the field it came from, in a
    `--warning`-bordered block above the review form: **"The research's own
    caveats"**.
- **A tick, "I have read the research's caveats", is required before Accept is
  enabled.** Reject does not need it.
  - **Decided by Brad (12 Oct): required on every pending result,** not only where
    the search matched.
  - Where nothing matched, the block says "No caveat phrases found. This is a text
    search, not a finding that there are none", and the tick reads "I have read the
    citation".
  - A missed phrase should not lower the bar.
- **Later, not here:** a dedicated `caveats` field in the contract (v4), queued as
  **Q4g**.

**Gate A**

- **`verify_pack_entry_retire.sh`:**
  - **Route cases:**
    - the steward → 200;
    - a non-steward → 403;
    - a reason under 12 characters → 422;
    - another tenant → 404;
    - already retired → 409;
    - a current claim → 409 naming it, and a current pack basis → 409 naming it;
    - a retired capability's claim does not block.
  - **The database:**
    - the CHECK refuses a direct `status = 'retired'` without a reason or person, and
      a `deleted_at` without `status = 'retired'`;
    - the audit row names the actor;
    - the accepted result is unchanged.
  - **Pack GET:** the entry moves to `retired` with who, when and why; the current
    lists lose it.
  - **Exclusion:** a retired name can now be excluded (201); a current name still
    gets 409.
  - **A retired, unexcluded name can be re-accepted** from a new result (a new row); an
    excluded one cannot (409).
- **A headless-Chrome walk by session, with screenshots looked at:**
  - retire as the steward; the Retired card collapsed and then expanded;
  - a non-steward's disabled control;
  - a pending result whose citation says "reviewer should confirm…": the caveat block
    and Accept disabled until the tick.
- **Breaks:**
  - the dependency check removed: a claimed entry is retired, and the test catches it;
  - the CHECK dropped, in a rolled-back transaction;
  - the client tick gate removed: Accept is enabled without it, and the test catches
    it;
  - the client steward gate removed: the server still 403s.
- **Also:**
  - `verify_steward_acts` updated to 5 steward routes;
  - D2 clean with 0032;
  - the regression;
  - the prod-copy equivalence (only the pack GET's `retired` key differs);
  - the client `tsc`, build and lint.
- **Deploy:** backup, migrate 0032, harden (still 98), then deploy. D2 at step 5c
  expects 0032.

**Brad's intent once it ships** (his acts, in the UI; recorded here so the record of
intent precedes the acts):

- **Retire, then exclude each with his own reason:** Phish-prone percentage; Mean time
  to identify and contain a data breach (breach lifecycle); Revenue per billable
  consultant.
- **Retire, not excluded** (they can return with verified citations): Wasted cloud
  spend; Project budget adherence rate; Human-error-attributed outage rate.
- **Keep:** Billable utilization; Change failure rate; Change lead time; Deployment
  frequency; Failed deployment recovery time; Net first contact resolution rate; Net
  first level resolution rate.

### 4e. Q4h: account research intake (3.0 item 6), with the entity and the regime (plan, 12 Oct 2026; H1–H4 decided by Brad)

**Brad's decisions (12 Oct):**

- **D13 is narrowed.** It governs the first real engagement and item 12, and no
  longer blocks building item 6.
- **Item 6 comes forward as Q4h,** after Q4c1b and Q4g, with items 3 and 4 folded in
  minimally.
- **First test: Scotts Miracle-Gro.**

**Spine stage:** `baseline`. AMENDMENT-005 Art. I permits research at baseline;
measure and verify are prohibited. Art. II: research produces evidence, never a value
in `value_outcomes`.

**The Q4b pattern, applied to accounts:**

- one contract in `server/research/contracts.ts`;
- a prompt generated from live rows and stored immutably;
- a parse that names the prompt and refuses wholesale;
- per-field review that writes through the one existing writer.

Inside the D1 seam.

#### What may be researched (the contract's scope)

- **Baseline facts:** the four existing kinds (`revenue`, `headcount`,
  `stated_priority`, `system`).
- **The entity:** legal name and identifier.
- **The disclosure regime:** `public_filer · private · subsidiary_of_filer ·
  public_sector`.
- **Never:**
  - a measure- or verify-stage value;
  - a value outcome, baseline, actual or target. A metric's published baseline (as
    for Scotts' TRIR) stays a value-outcome act with evidence, in Q4c2.
- **Not in Q4h:**
  - attach-stage signals ("which pack measures this account says matter", item 6's
    second permitted use), which come next;
  - parent and affiliate relationships (item 3, the rest).

#### The `institution_fact` contract (v1), in `contracts.ts`

**Envelope:** `prompt_id`; `institution` (the name as the prompt gave it);
`research_query`; `query_as_executed`; `research_tool`.

**`entity`:**

- `legal_name`;
- `identifier_type` (`sec_cik` | `ticker` | `registry`);
- `identifier`;
- `registry_jurisdiction` (required when `registry`);
- `citation`;
- `caveats` (Q4g's shape: a list, empty stated explicitly).

**`disclosure_regime`:** `value` (the four labels); `basis` (why, in a sentence);
`citation`; `as_of`; `caveats`.

**`facts[]`, each with:**

- `kind` (the four kinds);
- `value` (a number for revenue and headcount, text for the others);
- `unit` (an ISO currency for revenue; `people` for headcount);
- **`as_of` = the last day of the period the fact describes** (L6). The contract says
  **not the publication date.**
- **`period`, as stated** (e.g. "fiscal year ended 30 September 2024"), shown to the
  reviewer beside `as_of`;
- `source_kind`: `public_filing` for the company's own filings; otherwise
  `observation` with a source reference. **Decision H3 below.**
- `citation`; a `quote` (the sentence the figure comes from); `caveats`.

**`not_found[]`, each with:** `kind`, `reason`. For example: "private company; no
statutory filing discloses revenue".

**Two gates read the contract, as in Q4b:** parse ("predates the contract") and accept
(unknown keys refused). It has its own version, `contract_version`.

#### The prompt, generated from live rows

`POST /api/institutions/:id/research-prompts` (authorized, tenant-checked) is stored
immutably in `research_prompts`. It reads:

- the institution's name and website;
- **the pinned entity, if any;**
- **the regime, if recorded;**
- **the facts already recorded** (kind, value, `as_of`), "do not return these unless
  a later period";
- **prior not-found results** with their reasons.

**Two phases, decided by the live rows:**

- **Phase `entity` (no entity pinned):** it asks **only** for the entity and the
  regime. Facts in such a response are refused at parse: "pin the entity first".
- **Phase `facts` (an entity is pinned):** it names the entity (legal name and
  identifier) and asks for facts within what the regime can publish.
  - **For `private`, it says plainly that revenue and headcount are often not
    published, and that a not-found with a reason is the expected answer.** This is
    item 4's minimum: the prompt reads the regime.

**`research_prompts` changes (0034):**

- `industry_id` becomes nullable; `institution_id` and `phase` are added;
- **a CHECK:** an `industry_measure` prompt names an industry and no institution; an
  `institution_fact` prompt names an institution and no industry, plus a phase.
- The row is still immutable (section 18).

#### Parse: `POST /api/institutions/:id/research-results`

- Requires `prompt_id`: the prompt must be this institution's, of the current contract
  version (naming both, as Q4b), and phase-consistent.
- **Entity check (item 3):**
  - **Phase `facts`:** the response's `entity.identifier_type` and `identifier` must
    equal the pinned entity's. Otherwise 422: "this response is about \<legal name,
    identifier\>; the account's entity is \<legal name, identifier\>; nothing was
    written."
  - **Phase `entity`:** no comparison is possible yet, so the entity becomes a pending
    result for a person to judge.
- **One `research_results` row per field:**
  - the entity, the regime, each fact, and each not-found;
  - new `result_kind = institution_fact`, with `field_name` = the kind;
  - `found` = false for not-founds, with the reason in the existing
    `not_found_reason`;
  - the whole object in `raw_response`.
- **Refuse wholesale**, every issue named.
- **L8:** each parse 422 is written to `refusals` through the pool, outside the request
  transaction, which rolls back on a 422, exactly as `handleGovernanceError` does.
  - `refusals` gains `source` (`database` | `parser`); `sqlstate` becomes required
    only for `database`; a CHECK enforces both.

#### Review, per field: who, and what accept writes

- **Who: an authorized user, not steward-only.**
  - Q3 made recording facts an authorized act (`POST /api/institutions/:id/facts` is
    `authorized`). Accepting a researched fact *is* recording a fact, with research
    as its source.
  - Making it steward-only would make research a harder path than typing the same
    figure by hand. The tenant-wide pack is the steward's because every account
    inherits it; a fact is one account's.
  - **The same holds for pinning the entity and recording the regime**, since they are
    account-scoped. The guard on the entity is the exact-identifier rule at parse and
    supersession to correct it, not a role.
- **Accept, no hop left short.** One transaction, through **one writer** extracted
  from `institutionFacts.ts` into `server/lib/institutionFactWriter.ts` and used by
  both routes:
  - an `evidence` row with `kind` = `source_kind`, the citation as provenance plus
    `source_reference`, `ai_sourced` as the parse recorded it, and `research_query`
    and `research_tool`;
  - the `institution_facts` row with `as_of` from the contract;
  - `research_results` → accepted, linking `evidence_id` and the new
    `institution_fact_id`.
  - Or nothing.
- **Citation resolution at accept (decision H1, recommended).** The reviewer ticks "I
  opened the citation and it says this".
  - That sets `citation_resolved` (named person and time, final: AMENDMENT-005
    Art. IV).
  - Without it, D2 rule 2 makes an AI-sourced fact **assumed**, whatever its kind.
  - The Q4c1b caveats tick applies too, and Q4g's `caveats` show as their own block.
- **Accepting the entity** writes the new `institution_entities` row (below).
  **Accepting the regime** writes an `institution_facts` row of the new kind
  `disclosure_regime`.
- **A not-found is reviewed too:** "accept as not found" records the reason and writes
  no fact. The account's facts card lists it, e.g. "Revenue: not found by research,
  private company, as of …". That is the regime made visible.
- **Reject:** a note is required, and the rejection is kept, as for packs.
- **Supersession stays the existing correction path:** a later period's figure
  supersedes the earlier fact through the same writer, with a reason.

#### The minimal entity and regime records (migrations 0033 and 0034)

- **`institution_entities`** (governed):
  - columns: `institution_id`; `legal_name`; `identifier_type` (enum `sec_cik`,
    `ticker`, `registry`); `identifier`; `registry_jurisdiction`; `evidence_id` (NOT
    NULL: provenance); `captured_by_person_id`; plus `governance()` (supersession,
    retirement);
  - **a partial unique index:** one current entity per institution;
  - CHECKs: `registry` needs a jurisdiction; an `sec_cik` is 10 digits, zero-padded;
  - in the governed loop and the supersession loop (`_audit`, `_touch`, `_no_delete`,
    `_supersession_sane`): **triggers 98 → 102**;
  - **correcting an entity supersedes it** (item 3).
- **The regime:** a new `institution_fact_kind`, `disclosure_regime`. `value_text` is
  one of the four labels (a CHECK), with evidence, `as_of` and supersession for free.
  No new table.
- **`research_results`:**
  - `result_kind` gains `institution_fact`;
  - FKs `institution_fact_id` and `institution_entity_id`;
  - the kind-shape, found-shape and accepted-has-record CHECKs are extended;
  - **the enum value is added in its own migration (0033)**, because Postgres cannot
    use a new enum value inside the transaction that adds it. Everything else is 0034.
- **`refusals`:** `source`, as in L8.
- **Back up first. What it could orphan:** nothing; it is additive.

**What is left of items 3 and 4 for later (Q7, Q8):**

- parent and affiliate relationships;
- the run sealing its entity and account name (L4, item 10);
- `website` into the entity record (L9);
- the entity mismatch rate (item 11);
- the gap register computing *structurally unobtainable* per account from its regime.

#### The cards on the account page, mirroring R1–R5 (`AccountResearch`)

| Card | What it does |
|---|---|
| **A1** | **Entity and regime.** The pinned entity (legal name, identifier, its evidence) and the regime, or "not pinned: research the entity first". The entity's correction is supersession |
| **A2** | **Generate a research prompt.** It shows its phase ("entity first" or "facts for \<legal name, CIK\>"), the text with Copy, and its hash |
| **A3** | **Prompts on record.** Stale ones (an older contract version) are flagged |
| **A4** | **Parse a response.** Invalid JSON is caught locally. **An entity mismatch is shown with both entities named.** All issues are listed. The refusal is on record (L8) |
| **A5** | **Pending review, per field.** Shows the value, unit, **`as_of` beside the period as stated**, the source kind, the citation and quote, Q4g's caveats and the text-search caveats. Ticks: "caveats read", and "I opened the citation" (H1). Accept or reject with a note. A not-found shows its reason and is "accepted as not found" |

The facts card (`AccountFactsCard`) shows researched facts with their basis, and lists
not-found kinds with reasons.

#### Scotts Miracle-Gro, through it (Q4d's A3, replaced)

1. Create the account (A1 in §4a), classified `manufacturing`.
2. **Phase `entity`:** Brad generates, runs and parses. The response gives the legal
   name, the SEC CIK and the ticker, citing EDGAR, and the regime `public_filer`
   citing the 10-K cover. **Accepting the entity pins it;** accepting the regime
   records it.
3. **Phase `facts`:** the prompt names the pinned entity and asks for revenue and
   headcount (from the 10-K, `as_of` = the fiscal year end), stated priorities (the
   10-K and the CR report), and systems (likely not found: "not disclosed in
   filings").
   - A response citing another company (e.g. a former parent or a namesake) is
     refused at parse, naming both entities.
4. **Review:** Brad opens each citation, ticks, and accepts or rejects. Each accept is
   one evidence row and one fact. Not-founds are accepted as not found.
5. **The TRIR baseline (2.28, FY2021) is not an account fact.** It remains Q4c2's
   value outcome and evidence, entered by hand from the CR report.

#### Datacom, through it (a private company)

1. **Phase `entity`:** the legal entity and its registry number, with
   `registry_jurisdiction` NZ (the Companies Office); the regime `private`.
2. **Phase `facts`:** the prompt says a private company publishes little. The likely
   result: revenue and headcount **not found**, with reasons like "private; no
   statutory filing discloses it". Any figure from the company's own press release
   needs decision H3. Stated priorities may come from its site; systems are likely
   not found.
3. **The record then shows what research cannot reach and why.** That is the point of
   the regime. Datacom stays a pack-only test for value (R3): no outcome, no run.

#### Decisions, by Brad, 12 Oct 2026

**All four as recommended:**

- **H1, yes:** accepting a researched fact requires the reviewer to confirm they
  opened the citation. It is recorded as `citation_resolved` by that person, with the
  time.
- **H2, yes:** accept, pin the entity and record the regime are **authorized** acts.
- **H3, yes:** a company's own non-filing publication is `observation` with a source
  reference (derives **inferred**). **The contract's `source_kind` value is kept as
  stated**, so a "company publication" kind can be added later without re-reading
  responses.
- **H4, yes:** every facts-phase prompt asks for all kinds, listing what is already
  recorded.

*As proposed, for the record:*

- **H1:** accepting a researched fact requires the reviewer to open the citation, and
  records `citation_resolved` (recommended). The alternative leaves it to a later act,
  and the fact counts as **assumed** until then.
- **H2:** accepting is an **authorized** act, like typing the fact by hand (Q3). The
  same goes for pinning the entity and recording the regime (recommended).
- **H3:** the evidence kind for a company's **own non-filing publication** (a private
  company's annual review or press release). D2 maps `public_filing` (published) and
  `vendor_publication` (the vendor's own). Recommended: `observation` with a source
  reference, which derives as **inferred**, until a ruling says otherwise.
- **H4:** the facts phase asks for every kind every time, listing what is already
  recorded as "do not repeat unless a later period" (recommended). The alternative is
  to ask only for kinds not yet recorded.

#### Gate A (outline)

- **`verify_account_research.sh`, contract-driven:**
  - each field missing → 422;
  - phase rules: facts in an entity-phase response refused;
  - **an entity mismatch refused, naming both**;
  - a stale contract version;
  - L8: the parse refusal is in `refusals`;
  - accept: evidence and fact in one transaction, no partial on a forced failure;
  - `as_of` = the period end, not the publication date;
  - a not-found accepted writes no fact;
  - reject kept;
  - entity supersession;
  - the regime CHECK;
  - triggers 102.
- **A browser walk by session, with screenshots:** a fictional public filer and a
  fictional private company. **Never Scotts' or Datacom's real figures in a test.**
- **Breaks:** the entity check, the phase check, the one-transaction writer, the
  `as_of` rule, and L8's writer.
- **Also:** the regression; prod-copy equivalence (only the additive reads differ);
  backup → migrate 0033 and 0034 → harden (102) → deploy.
