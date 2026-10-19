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
| L27 | **npm vulnerabilities**: at the O1 deploy (12 Oct 2026) the client build reported 7 (5 high) and the server 4 (moderate) | reported by Brad, 12 Oct 2026 | Triage alongside L25, not now: `npm audit` per package, which are reachable in production (a build-time-only dependency is not the API), and a fix per package with its own Gate A. **Never `npm audit fix --force`** (CLAUDE.md rule 7) |
| L28 | **`engagements.value_stage` is stale**: no route advances it (the outcome routes advance `value_outcomes.value_stage`), so the stored column says `baseline` on engagements whose outcomes are verified. O2's POV already derives the stage reached (the furthest of the engagement and its current outcomes) and does not read the column alone | found in O2's Gate A, 12 Oct 2026 | **Proposal, to decide later (not in O2):** compute it, not store it. A function `lvrf_engagement_stage(engagements)` (the POV's derivation, in one place), every reader calling it, and the column dropped, or kept only as a frozen historical value, once nothing reads it. Before deciding: list every reader of the column (the runs list, the cohort, `walkSpine`'s `terminal_value_stage`) |
| L29 | **Raw Postgres text reaches people** (widened 12 Oct 2026, Brad's W6: "new row for relation 'evidence' violates check constraint 'evidence_ai_verify_requires_resolution'" when Source verified = Yes on AI-sourced evidence). **Planned as Q4k below.** Originally: raw Postgres text in 500 answers: the W1 fix maps unique violations to plain words in the shared refusal handler, but each route's 500 fallback (`err instanceof Error ? err.message`) can still echo Postgres's own text, constraint names included, for other errors (a foreign-key or not-null violation) | found in the W1 fix, 12 Oct 2026 | One central mapping in the same place (`server/lib/refusal.ts`): Postgres errors other than check and unique violations become "That could not be written; nothing was saved." with the raw text in the server log only. Its own Gate A: grep for every 500 fallback, and a deliberate foreign-key violation per route class |
| L30 | **The plain duplicate-person message can confirm that an email exists in another tenant.** "\<email\> is already in LVRF; select them instead" is right when the person is in the caller's tenant, but `persons_email_key` is unique across ALL persons, so it also answers for another tenant's person (or customer contact) | Brad, 12 Oct 2026 | **Must be fixed before anyone outside Brad's tenant gets access.** Say "select them" only when the existing person is in the caller's tenant (their staff, or a person of one of their accounts); otherwise a neutral refusal ("That email cannot be used here; nothing was written."). **Note:** any refusal, however worded, still tells the caller *something* holds that email while email is globally unique. Closing that fully needs email unique per tenant, not globally (a migration that changes `persons_email_key`), which is a decision for then |
| L31 | **Deployed 19 Oct 2026 (`3a1165e`); Gate C clean.** **The API keeps no request log.** `server/index.ts` logs only its start line, and `respondServerError` logs a 5xx's raw text; a 2xx, 4xx or a request that never arrives leaves nothing in `journalctl -u lvrf-api`. The Scotts hypothesis attempt (13 Oct 2026) could not be traced from the box: no request was ever sent, and the journal could not say so | Brad, 18 Oct 2026 (journalctl since 03:36 UTC returned nothing for hypothes\|POST\|refus\|error) | A minimal request log, one line per `/api/*` request: method, the route **pattern** (not the raw path, which can carry ids), status and duration in ms. **No bodies, no query strings, no cookies, no headers, no actor email.** Written to stdout for journald, after `res` finishes. Its own small item with a Gate A (a verify that the line appears for a 201, 409, 422 and 500, and that a password POST to `/api/auth/login` logs no body). Not mixed into UX-1 |
| L32 | **A lever's stored status says `proposed` while it displays "ratified"** (O-D2a). Under O-D2 the steward's proposal is the ratification, so the stored value should say so | Brad's reviewer, 19 Oct 2026 | Queued: rename the stored status so storage and display agree. It is its own item, after UX-1. **Before the migration:** it changes `value_levers.status` for every current lever (`lifecycle_status` is shared with other tables, so the likely change is a lever-specific value or column, not an enum rename), and it can orphan any code or CHECK reading `status = 'proposed'` on levers (`value_levers_retirement_is_complete`, the pack page, the POV). Grep both first |
| L33 | **Your own company's account (Skillsoft) still uses the old record view.** UX-1 slice 1 gives every customer account the six-step workspace. The tenant's own account isn't an account to work (no walk, no research, no POV), so `InstitutionPage` keeps the plain cards for it: numbered sections, intake vs classification, the pack, measuring, the gap, engagements | Brad's reviewer, 19 Oct 2026 (slice 1 review) | Decide its own layout in a later slice: likely the record view in slice 1's visual language (header, confidence badge, folded detail) without the path. Presentation only |
| L34 | **The Accounts home makes up to four reads per account** (`/view`, `/walk`, `/pov`, `/research`) to say where each stands, through the workspace's own derivations (`client/src/lib/workspaceStatus.ts`) | UX-1 slice 2, 19 Oct 2026 | Fine at today's handful of accounts. A list of dozens or hundreds wants one read-only summary route that returns each row's inputs. It must keep **one** implementation of the six-step rule: the route returns the inputs, and the client derives from them; the rule is not rewritten on the server |

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
| O-D1 | **The CFO lens threshold is 55** (the computed confidence's medium floor). A `lens_policies` value, ratified and versioned; below it the CFO lens refuses, with the reason and the gap register's asks | Brad Piver, 12 Oct 2026 |
| O-D2 | **The steward ratifies value levers and lever↔offering links**, as pack entries (Band A) | Brad Piver, 12 Oct 2026 |
| OWN-1-D1 | **Local roles approved.** `lvrf_owner` (NOLOGIN) and `lvrf_migrate` are created on this Mac's cluster with the same names as prod. `lvrf_migrate` has a local-only password, never prod's and never in the repo (it lives in the git-ignored `.env.migrate`). Ownership changes **only on throwaway clones**; real local `lvrf` is not converted until OWN-1 deploys. The DROP ROLE steps are documented in `db/ownership.sql` | Brad Piver, 19 Oct 2026 |
| OWN-1-D2 | **No live DDL on prod.** The refusals are proved on clones, including a converted prod copy. Prod Gate C stays read-only | Brad Piver, 19 Oct 2026 |
| OWN-1-D3 | **The `CLAUDE.md` Stack edit**, retiring the "Pending OWN-1" caveat in rule 3, is made after OWN-1's Gate C | Brad Piver, 19 Oct 2026 |
| O-D2a | **A lever displays "ratified by <steward>, <date>"** while its stored `status` stays `proposed`: under O-D2 the steward's proposal is the ratification (UX-1 §7e item 4). Storage and display disagree until **L32** renames the status | Brad's reviewer, 19 Oct 2026 |
| O-D3 | **Reference examples render only as reference examples**: never as an account's value case, and never under the CFO lens | Brad Piver, 12 Oct 2026 |
| O-D4 | **A falsifier may reference only recorded values: no new number.** It **may state a direction relative to a recorded value** (e.g. "TRIR ≥ baseline over the committed period"), which introduces no number. Enforced by CHECK on `value_hypotheses` | Brad Piver, 12 Oct 2026 |
| O-D5 | **The PDF is a browser print of the rendered value case page, by a print stylesheet** (option c, added and adopted): no new dependency, no WeasyPrint. *Conflict named:* `CLAUDE.md`'s stack and "WeasyPrint constraints" assume WeasyPrint; the amendment wording is proposed in §5, not yet applied | Brad Piver, 12 Oct 2026 |
| O-D6 | **An AI-drafted executive summary says so**, small, beside its author (`drafted_with_ai` and the tool, shown on the document) | Brad Piver, 12 Oct 2026 |
| O2-D1 | **No person decides a hypothesis.** Its verdict (survived or refuted) is **computed by one database function** from the falsifier, the recorded baseline or committed target, the due date and the recorded actual. The human act is **verifying the actual**, and **the verifier may not be the hypothesis' author** (enforced in the database). Until a verified actual exists past the due date, the verdict is **open** | Brad Piver, 12 Oct 2026 |
| O2-D2 | **A reference example is marked by a typed, steward-set, audited, supersedable marker on the account**; O-D3 reads it | Brad Piver, 12 Oct 2026 |
| O2-D3 | **Hindsight is marked.** A hypothesis created after its due date, or after its outcome already had a measured actual, is **post hoc**, computed by the database. The page says "written after the result", and a post hoc hypothesis never counts as survived | Brad Piver, 12 Oct 2026 |
| O2-D4 | **The falsifier's shape is confirmed:** "no better than the reference (recorded baseline or committed target) by the due date", plus conditions with no digits. **The measure's direction (lower or higher is better) comes only from the pack entry row** and is shown on the page; a hypothesis cannot set it. The digit refusal explains itself: "numbers belong in recorded values, not falsifier conditions" | Brad Piver, 12 Oct 2026 |
| R1 (refined) | **A company's formal annual disclosure report is `public_filing`** (10-K, annual report, CR, sustainability or ESG report); **looser company material is `observation`** (press releases, web pages, blog posts, job postings, marketing). The basis follows from D2 unchanged: published, or inferred with a source reference (§4k) | Brad Piver, 12 Oct 2026 |

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
| ~~Q4c1b~~ | **DONE 12 Oct 2026**: deployed `9605859` (0032, the CHECK validated on prod; step 5c clean; Gate C clean; Brad confirmed the retire control). ~~**Retire a pack entry** (steward-only, reason required, migration 0032), retired entries shown on the pack page, and the R4 caveats aid. Plan in §4d, **approved by Brad 12 Oct** | Q4c1 | Q4e accepted six IT entries Brad now judges should not stand, and no route can correct an accepted entry |
| ~~Q4g~~ | **DONE 12 Oct 2026**: deployed `4db8808` (no migration; step 5c clean; Gate C clean; legacy check 26 valid v3). Plan §4f. **Contract v4: a required `caveats` field per measure** (Brad, 12 Oct). It is a list of strings, and an empty list is allowed but must be stated explicitly; a missing key is refused as drift. The prompt asks for it, and R4 shows it as its own block, above the text-search block. Prompts generated under v3 go stale, as designed (parse refuses them, naming both versions). `PROMPT_TEMPLATE_VERSION` bumps too. The legacy and v3-era accepted results are untouched; `check_legacy_research` checks them against the version they were parsed under | Q4c1b | turns the R4 caveat search into a structural field |
| ~~Q4i~~ | **DONE 12 Oct 2026**: deployed `3388444` with Q4c2 (no migration). **Small UI batch** (Brad, 12 Oct): (1) **"Open account →"** in Create account's Recorded block — built and verified (`7e14556`), not deployed; (2) **the facts card shows whether a fact's citation was opened** (`citation_resolved`, by whom, when). Today it shows only `source_verified` ("UNVERIFIED") and `ai_sourced`, so an opened citation looks unopened; `/view` must select it (its comment already claims it does) | — | ships with the next deploy |
| ~~Q4c2~~ | **DONE 12 Oct 2026**: deployed `3388444` (no migration; step 5c clean; Gate C clean). **The outside-in walk card on the account page**: the analyst-of-record person, the offering and capability, the capability's claim on a pack entry, the value outcome (which creates the engagement and metric), pack basis, produce, lock, then retire the reference engagement | Q4c1 (shared card patterns) | unblocks Q4d (Scotts) |
| Q4d | **Reference test A: Scotts Miracle-Gro on an existing pack** (Manufacturing; TRIR accepted). Outside-in, published material only; not D13. Step plan in §4a; R1 and R5 decided | Q4c2 | tests a second account on a pack that already exists |
| Q4e | **Reference test B: Datacom, a pack-only test** under the existing `information-technology` industry (R2, R3). The first real use of the Q4b prompt route. Step plan in §4a; no run, because no published Datacom baseline exists | Q4c1 | tests the pack loop end to end on a pack that does not exist yet |
| ~~Q4h~~ | **DONE 12 Oct 2026**: deployed `92ae23b` (0033, 0034; 103 triggers, with entity correction; step 5c clean; Gate C clean). **3.0 item 6 pulled forward: account research intake** (Brad, 12 Oct), with items 3 and 4 folded in minimally (the entity: legal name and identifier; the disclosure regime) and L6 and L8. The Q4b pattern: an `institution_fact` contract, a prompt generated from live rows and stored immutably, parse that refuses a different entity naming both, per-field review that writes evidence and fact in one transaction. First test: Scotts Miracle-Gro (a public filer), replacing hand entry of its facts in Q4d where research can supply them. Plan in §4e; H1–H4 decided (§4e) | Q4c1b, Q4g; **not D13** (narrowed) | Brad's decision: build the intake before the first real engagement, test it on published accounts first |
| ~~O1~~ | **DONE 12 Oct 2026, deployed `1db189b`** (Gate C clean, 111 triggers, 23/23 run hashes); built and reviewed (migration 0035, 111 triggers; withdrawal of levers and links, steward-only and append-only in the database, effect sizes refused on record; BUILD_STATUS "O1"). **Outputs band, phase 1: the grounding** (plan §5). Q9 (the D2 basis, derived) and item 10 (a run seals the fact ids and values it used) are **prerequisites, built here**; then `value_levers` and `lever_offerings` (steward acts); the pack page shows levers per measure and Skillsoft solutions per lever (outputs 3, 4) | Q4c2 deployed | every later output states each number's basis; nothing can until the basis is computed |
| ~~O2~~ | **DONE 12 Oct 2026, deployed `f352e89`** (Gate C clean: 126 triggers, run hashes 23/23, 0 cross-tenant refusals); built (migration 0036, 126 triggers; computed verdict, verifier ≠ author, post hoc, typed reference markers; BUILD_STATUS "O2"). **Outputs, phase 2: hypotheses and the account POV** (plan §5): `value_hypotheses` (with falsifiers), `executive_summaries` (human-authored, attributed), the POV page (value-chain visual, stage progress bar, "what it takes to raise confidence") (output 1) | O1 | the hypothesis is what a POV argues; it must be falsifiable before it is shown |
| ~~Q4j~~ | **W1 fix, DONE 12 Oct 2026, deployed `901fc91`** (Gate C clean) (migration 0037, 129 triggers; BUILD_STATUS "W1 fix"): an existing person (the tenant's own staff) named analyst of record on an account through `account_person_links`, with a per-account title; raw unique violations become plain words ("already in LVRF; select them instead") | Brad's Scotts walk, 12 Oct 2026 | W1 was blocked: a duplicate person, or a placeholder, was the only path |
| Q4k | **BUILT 13 Oct 2026, Gate A passed, not deployed** (BUILD_STATUS "Q4k"; approved by Brad 12 Oct with Q4k-D1: build "Open the citation…", the recorder may open). **Plain refusals everywhere, and the AI-verified evidence form** (L29 widened; plan in §4k) | the Scotts walk | W6 surfaced a raw CHECK message; the form offers a combination the database must refuse |
| Q4l | **BUILT 13 Oct 2026, Gate A passed, not deployed** (BUILD_STATUS "Q4l"): no silent outcomes (every disabled submit says what it waits for; every success that closes a form leaves a sentence); a run 2 after the walk's first, with W7 listing what each run sealed | the Scotts walk | the hypothesis form failed silently; run 1 was locked before its citations were opened |
| Q4m | **Deployed 19 Oct 2026 (`a88c071`, with OWN-1).** A retired reference engagement renders cleanly on the POV: a plain frozen sentence (no raw 409, no id, no critical red), and every locked run listed. Scotts' W9 is held until it is deployed | Q4l | Brad's reviewer, 19 Oct 2026 (the UX-1 audit's finding 6) |
| UX-1 | **NEXT after OWN-1; all further O-band work pauses for it** (Brad, 13 Oct 2026): the workflow and UI do not meet Rule76 design standards. Plan in §7 (written 18 Oct 2026, not yet approved; no UI code until Brad approves mock-ups; decisions UX-1-D1–D4) | OWN-1 | the app is hard to navigate and hard to use |
| OWN-1 | **NEXT, before any further O-band work** (Brad, 12 Oct 2026). **The database owner role** (plan §6): `lvrf_app` stops owning the schema, so the trigger guards and rule 3 bind the role itself, not only the app's code paths | O2 deployed | shown on the prod copy, 12 Oct 2026: `lvrf_app` can DROP TRIGGER and GRANT itself UPDATE on `audit_log` |
| O3 | **Outputs, phase 3: lenses and the value case** (plan §5): `lens_policies` (steward-ratified), the value case per locked run as a web page through a lens (output 2), outcomes by lever with confidence and basis (output 5) | O2 | a lens is a policy, not a template (CAPABILITY_MAP item 4) |
| O4 | **Outputs, phase 4: the value case as a PDF** (plan §5; 3.0 item 15; **O-D5: a print stylesheet**): the browser prints the rendered page; no new dependency; both banners and the run's `payload_hash` on every printed page; QA by printing and looking | O3 | the PDF renders what O3 already shows; no new claim enters at print |
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

**Approved by Brad (12 Oct), with one change: the TRIR baseline is the LATEST Scotts
has published, not FY2021.** Found: the *2026 Corporate Responsibility Disclosure
Report* (May 2026; FY25), page 21:

- **TRIR FY25 1.4** (FY24 1.7, FY23 1.5), so the baseline is **1.4 as of
  2025-09-30**.
- **Confirm the denominator first:** the table cites SASB RT-CH-320a.1, whose TRIR is
  per 200,000 hours, but does not state it.
- The 2022 report's FY2021 2.28 was labelled "Total Incident Rate". Do not chain the
  two as one series.

**As built:** the steps are W1–W9 in the card (§4a's A2–A11). Produce-run requires a
note and a run source label, which the card asks for.

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

### 4f. Q4g: contract v4, a required `caveats` field per measure (approved by Brad, 12 Oct 2026)

**Spine stage:** `model` (pack research).

**What it does, as approved:**

- `INDUSTRY_MEASURE_CONTRACT` goes from v3 to **v4**, adding `caveats`, a list of
  strings, to every measure.
  - **The key is required.** An empty list `[]` is allowed and means "the research
    states there are none".
  - A missing key is refused as drift ("predates the current contract").
  - A non-list, or a blank string inside the list, is refused.
- **The prompt asks for it** (`PROMPT_TEMPLATE_VERSION` 1 → 2).
- **R4 shows it as its own block,** "The research's stated caveats", above the Q4c1b
  text-search block. The text search no longer reads the `caveats` field itself, to
  avoid showing each caveat twice.
  - A v3 or legacy result shows "This result predates stated caveats (contract v3)".
- **Prompts generated under v3 go stale,** as designed: parse refuses them, naming both
  versions.

**Details resolved in building:**

- **Every version is kept, by number:** `INDUSTRY_MEASURE_CONTRACTS` = { 3, 4 };
  `INDUSTRY_MEASURE_CONTRACT` is the current one.
- **`check_legacy_research` checks each result against the version it was parsed
  under:** `contract_version` if set; v3 for the pre-Q4b rows, whose shape was v3 and
  which were verified against v3 at Q4b's Gate C. So the 13 Q4e results, all v3, stay
  valid, and nothing is rewritten.
- **Accept still validates against the contract as it is now** (Q4b's second gate).
  **A v3 result still pending at deploy cannot be accepted:** it must be re-run under
  a v4 prompt. Prod has 0 pending.
- **`caveats` maps to no `industry_measures` column.** It is review-only; the
  accepted result keeps it in `raw_response`. Showing an accepted entry's stated
  caveats on the pack page is a later choice; the reviewer's note is where a caveat
  that survives review is written today.
- **No migration.** `research_prompts.contract_version` simply stores 4.

**Gate A:**

- **`verify_research_contract.sh`,** contract-driven, so `caveats` is tested by the
  existing loop. Plus:
  - `caveats` not a list → 422;
  - a blank caveat → 422;
  - `[]` and a non-empty list → 201;
  - a v3 prompt → 422 "generated against v3; the contract is now v4";
  - accepting a pending v3 result → 422 "predates the accept mapping";
  - the legacy checker validates each row against its own version.
- **The browser walk:** stated caveats shown; "stated none"; "predates stated caveats"
  for a v3 result.
- **Breaks:**
  - `caveats` removed from the contract: a response without it is accepted;
  - the legacy checker made to use the current contract only: the v3 rows are named
    as failing.
- **Also:** the regression, with every script's payload carrying `caveats`; the
  prod-copy equivalence (every GET identical); the client `tsc`, build and lint.
- **Deploy:** no migration and no hardening change. A backup is still taken first.

## 5. The Outputs band: the monetizable surface (plan approved by Brad, 12 Oct 2026; decisions O-D1–O-D6 in §3)

**What it is.** The documents a value engineer puts in front of a customer's CFO,
CHRO or board. It rests on CAPABILITY_MAP items:

- **4, Executive Lenses as policy;**
- **7, Value Hypothesis, falsifiable;**
- **8, Value Levers;**
- **10, Solution Catalogs;**
- **12, Executive Outputs.**

**Spine stages:** `attach` and `model` (levers, solutions, hypotheses) and `return`
(the outputs).

### The five outputs

1. **The account POV,** with its value hypothesis and executive summary.
2. **The value case per locked run,** as a web page, then a PDF.
3. **Proposed value levers per pack measure.**
4. **Skillsoft solutions per lever.**
5. **Value outcomes by lever,** with confidence and basis.

### The rules every output obeys (enforced in the data or the renderer, not by convention)

- **Every number comes from the record, with its basis.**
  - A figure is rendered only from a row (a fact, an outcome's baseline or actual, a
    run's sealed payload), always beside its **D2 basis**: system of record ·
    published · client-stated · inferred · assumed.
  - **The basis is derived, not stored** (decided, Q9). It is computed by one function,
    and renderers call it. They never infer it.
- **No invented targets.** The renderer never computes a target. It shows only a
  `target_value` a named person committed to. **A vendor's claim is shown as a vendor
  claim** (`impact_basis`), never applied to a baseline. An outside-in hypothesis with
  no target renders "no target: a hypothesis".
- **The executive summary is human-authored and attributed.**
  - It is an `executive_summaries` row with an `author_person_id`: NOT NULL, a
    non-simulated person, per rule 4.
  - It is versioned (immutable, superseded), dated, and shown with its author.
  - **AI may draft outside LVRF:** the author declares `drafted_with_ai` and the tool,
    and the document says so. LVRF itself generates no prose.
- **Lens policies.** A lens is a governed `lens_policies` row: a persona, a minimum
  computed confidence, the D2 bases it admits, what it shows and suppresses, and its
  refusal text. It is ratified by the steward.
  - **CFO:** refuses to render an outcome below its threshold. It says why, and what
    it takes, rather than showing a footnote. It admits only system-of-record and
    published actuals. It suppresses consumption metrics.
  - **CHRO:** shows capability movement (assessment coverage, `evidence_class`, the
    learning spine), labelled as capability, never as value realized.
  - **Board:** the confirmation gap across the portfolio. Later (Band D trigger).
- **Outside-in says so.** A POV or value case whose numbers include no customer-side
  evidence (no system-of-record or client-stated basis) carries **"OUTSIDE-IN
  HYPOTHESIS"** on every page, beside the disclosure gate (rule 6). Neither banner can
  be suppressed.

### The objects

- **`value_levers`** (governed; pack content, so **steward acts**): a lever on one
  pack entry.
  - Columns: `industry_measure_id`, `name`, `mechanism` (how capability change moves
    the measure, in a sentence a CFO can test), `leading_indicator` (what moves
    first), `citation` (NOT NULL), `status` (proposed → ratified), supersession.
  - **No expected-effect size column:** a lever is a mechanism, not a promise.
  - Research may propose levers later, through a pack contract version, under the
    seam.
- **`lever_offerings`** (link, steward): lever ↔ catalog offering, with `basis` (why
  this offering pulls this lever). It is rendered with the offering's own
  `evidence_class` and `verification_source`. So "solutions per lever" also says what
  each can evidence: consumption · assessed · demonstrated · applied.
- **`value_hypotheses`** (governed, per account; authorized acts).
  - **What it says:** this capability, through this lever, moves this account's metric
    (`capability_id`, `value_lever_id`, `business_metric_id`, optional
    `value_outcome_id`); `statement`.
  - **`falsifier` is required:** what observation would show it wrong, in terms of
    **recorded values only**. For example, "TRIR at or above its FY25 baseline of 1.4
    at the first period end after deployment".
    - The falsifier may reference the baseline and the period; **it may not introduce
      a new number.** It **may state a direction relative to a recorded value**, for
      example "TRIR ≥ baseline over the committed period", which introduces none
      (O-D4). A CHECK enforces the reference to a recorded value; the renderer quotes
      it.
  - `falsifier_due` (a date or a period end); `status`: open · **confirmed** ·
    **refuted** · withdrawn.
  - **A decision** (confirmed or refuted) needs a named person and evidence;
    **refuted is a first-class result.** The confirmation-gap report counts refuted
    hypotheses, not only confirmed ones.
- **`executive_summaries`** (append-only versions): `institution_id` and optionally
  `value_run_id`, `body`, `author_person_id`, `drafted_with_ai`, `drafting_tool`, and
  a `lens` (which reader it was written for).
- **`lens_policies`** (governed, steward-ratified): `persona`, `min_confidence_score`,
  `admitted_bases[]`, `shows[]`, `suppresses[]`, `refusal_text`.
  - **The thresholds are policy values Brad ratifies, not computed numbers** (decision
    O-D1).
- **No new object for outputs 2 and 5.** They render runs (sealed payloads), outcomes,
  and the levers above. The PDF is a `record_documents` rendering (provisional until
  the Repository Constitution ratifies; named, not resolved).

### The pages

- **The account POV** (`/accounts/:id/pov`):
  - **who the account is:** the entity, the regime, and the facts, each with its basis
    and "citation opened by…";
  - **the value-chain visual,** one row per hypothesis:
    **offering → capability → lever → pack measure → account metric → outcome**. Each
    node shows its status and basis, and a missing node renders as a gap, not a blank;
  - **the hypotheses,** each with its falsifier and status;
  - **the executive summary,** attributed and dated;
  - **the stage progress bar:** the value spine, baseline → attach → model → commit →
    measure → verify → return, from the engagement's `value_stage`, each stage marked
    done, current or not reached;
  - **"What it takes to raise confidence":** the gap register's asks per outcome (state
    open or refused, path viable or blocked), with **draft-and-refuse** drafting each
    request (the extract, the confirmer, the attester). It never touches the score.
- **The value case** (`/runs/:id/case`): renders only from the run's sealed payload
  (and, after item 10, the fact values it sealed), through a lens. A **CFO-lens
  refusal page** is a real page with the reason and the asks, not an error.
- **The pack page:** each entry lists its levers (mechanism, citation, status). Each
  lever lists its solutions (offering, basis, what it can evidence).
- **Outcomes by lever:** per account first, then across the cohort. Lever ·
  hypothesis · outcome · realization · computed confidence (score and band) · the
  basis of baseline and actual.

### The phases

**O1, the grounding.** It is the prerequisite for everything.

- **Q9:** the D2 basis as one SQL function, tested against D2's ten rules.
- **3.0 item 10:** a run seals the fact ids and values it used, into its hashed
  payload.
- **`value_levers` and `lever_offerings`,** with migration, hardening and steward
  routes.
- **The pack page shows levers and solutions** (outputs 3, 4).

**O2, hypotheses and the POV.**

- `value_hypotheses` (with the falsifier CHECK) and `executive_summaries`.
- The POV page: the value chain, the stage bar, what it takes (gap register plus
  drafted asks), the outside-in banner (output 1).

**O3, lenses and the value case.**

- `lens_policies`, with CFO and CHRO ratified by Brad.
- The value case web page per locked run through a lens, including the refusal page
  (output 2).
- Outcomes by lever (output 5).

**O4, the PDF: a print stylesheet** (3.0 item 15; O-D5 option c, adopted).

- **The PDF is the browser's print of the value case page** (`@media print`).
  **No new dependency:** no WeasyPrint, no `render_record.py` rendering path.
- **Every printed page carries both banners** (OUTSIDE-IN HYPOTHESIS, and the
  disclosure gate's UNVERIFIED), and a footer with the run, its `payload_hash`, the
  lens, and the print time. Print CSS must repeat them per page; QA by printing to
  PDF and looking at every page.
- **The browser renders it,** so CSS Grid is usable. `CLAUDE.md`'s "Grid is
  unreliable" applies to WeasyPrint, which this replaces.
- **What changes in tracing:** the PDF is produced in the reader's browser, so the
  server never holds its bytes.
  - **The `record_documents` row records "print requested",** never that the page was
    printed. The Print control's route writes it server-side **before**
    `window.print()` is called: the run, its `payload_hash`, the lens, the person and
    the time.
  - The browser may cancel the dialog. The record claims only the request.
  - **The printed `payload_hash` is the trace;** there is no hash of the PDF bytes.

### What Scotts would show (from the record as it stands, plus Q4d)

- **POV, banner OUTSIDE-IN HYPOTHESIS:**
  - The Scotts Miracle-Gro Company, CIK 0000825542, public filer.
  - **Published** (10-K, citation opened): revenue and headcount as of 2025-09-30, and
    the stated priority on associate health and safety.
  - **Inferred** (job posting): SAP ECC, BTP and S/4HANA.
- **The value chain:** Skillsoft Compliance Suite (EHS solution) → the workplace
  safety capability → a lever on TRIR (to be authored and cited in O1) → TRIR
  (manufacturing pack, proposed) → Scotts' TRIR → the outcome.
  - **Baseline 1.4, FY25, published** (2026 CR Disclosure Report p. 21), once its
    denominator is confirmed.
  - **Target: none.**
- **The hypothesis' falsifier** would read, for example, "TRIR at or above 1.4 at the
  first fiscal year end after deployment". **The period is Brad's to state.**
- **Skillsoft's "75% reduction"** appears as a vendor claim (`vendor_publication`,
  `impact_basis`), never as the actual, never applied to 1.4.
- **CFO lens: refuses.** The locked run's computed confidence is low. The page says
  why, and what it takes: a customer system-of-record TRIR extract, a named committer,
  a named verifier. These come from the gap register, drafted.
- **CHRO lens:** shows capability coverage, which today is none recorded. It says so
  rather than implying movement.

### What Curia would show

- **POV, labelled "reference example, not an engagement"** (its engagements are
  retired): the outside-in hypothesis, and its validated successor.
- **Value cases for its locked runs.** The reference example's latest, run 21, is
  medium at 55.0 (`curia_validated`). There is also the lot-acceptance run on the
  pharmaceutical pack's LAR.
- **Under a CFO lens,** run 21 renders only if the CFO threshold is at most 55, which
  is the medium band's floor. **Whether a reference example renders under the CFO lens
  at all is decision O-D3.**
- **Its history shows the instrument's point:** confidence rising from the
  outside-in hypothesis to validated, each step a locked run that is never rewritten.

### Decisions (decided by Brad, 12 Oct 2026; recorded in §3)

**O-D1 = 55. O-D2, O-D3 and O-D6 as recommended. O-D4 confirmed, with the
direction rule. O-D5 = option (c).** As proposed, for the record:

- **O-D1, the lens thresholds.** For example, CFO at least 55 (the medium floor) or at
  least 80 (high). A policy value, ratified, versioned. Recommendation: 55, with the
  refusal page carrying the asks.
- **O-D2, who ratifies levers and lever↔offering links.** Recommendation: the steward,
  as pack entries (Band A).
- **O-D3, reference examples under a lens.** Recommendation: they render only as
  "reference example", never as an account's value case, and never under the CFO lens.
- **O-D4, the falsifier rule.** The CHECK limits numbers to recorded values;
  confirm.
- **O-D5, the PDF's home** (3.0 item 15): (a) WeasyPrint on the VPS (fonts, then
  `fc-cache -f`); (b) rendering on the Mac by decision; **(c) a print stylesheet, the
  PDF being a browser print of the rendered page: no new dependency. Adopted.**
- **O-D6, AI drafting disclosure:** `drafted_with_ai` and the tool shown on the
  document. Recommendation: shown, small, beside the author.
- **Named, not resolved:** `record_documents` stays **provisional** until the
  Repository Constitution ratifies (CLAUDE.md). O4 builds on it as provisional.

**The conflict O-D5 creates with `CLAUDE.md`, named and not resolved silently.**
`CLAUDE.md`'s Stack lists "WeasyPrint 69.0 on the VPS" under **Not yet**, and its
"WeasyPrint constraints" section governs the PDF pipeline. Under O-D5 there is no
WeasyPrint. Proposed amendment wording, **not applied until Brad approves it:**

> **PDF:** a value case's PDF is the browser's print of its rendered page, by a print
> stylesheet (decision O-D5, 12 Oct 2026): no WeasyPrint, no new dependency. Every
> printed page carries the disclosure banner and the run's `payload_hash`. QA every
> template by printing to PDF and looking at every page.

It replaces the WeasyPrint entry in **Not yet** and the "WeasyPrint constraints"
section.

**Applied 12 Oct 2026,** on Brad's instruction. **No amendment was needed.** The
governance in force was checked:

- **AMENDMENT-005** amends `CLAUDE.md` only to extend the governing AI principle, and
  sets no rule for its other content.
- **AMENDMENT-004** names WeasyPrint only in its *grounds*, as the pipeline of the
  time. Its Article IV ("Screen and Print Are One System") speaks of "the PDF
  pipeline" generically, and a browser print of the rendered page meets it more
  directly. Its Article V (tokens defined once, in `CLAUDE.md`) is untouched.
- **The O-D5 row in §3 is the history.**

### O2, the build plan (planned 12 Oct 2026; **approved by Brad, 12 Oct 2026**, with O2-D1–O2-D4 in §3)

**As approved, these supersede the plan text below where they differ:**

- **No `decide` route, and no stored status.** A hypothesis' verdict is computed by
  `lvrf_hypothesis_verdict(value_hypotheses)`:
  - `open` until the outcome it names has a **verified** actual (`source_verified`, a
    named verifier) measured **on or after** `falsifier_due`;
  - then **`refuted`** if the actual is no better than the reference, in the pack
    entry's direction, else **`survived`**;
  - **post hoc** hypotheses read `survived_post_hoc` or `refuted_post_hoc`, and never
    `survived`;
  - withdrawn and superseded ones read `withdrawn` and `superseded`.
- **The verifier may not be the hypothesis' author.** A database trigger enforces it
  on `value_outcomes` (verifying an actual) and on `value_hypotheses` (a hypothesis
  on an outcome its author verified).
- **The reference value is quoted once, by the database:** at INSERT, the trigger
  copies the baseline (or the committed target) and its date into the hypothesis.
  The body cannot set them, and they never change.
- **Direction:** read only from the lever's pack entry (`industry_measures.direction`)
  and shown as "lower is better" or "higher is better". `value_hypotheses` has no
  direction column, and a `direction` field in a request is refused (400, recorded).
- **The digit refusal explains itself** in the route and in the database: "numbers
  belong in recorded values, not falsifier conditions".
- **The reference-example marker** is its own governed table,
  `reference_example_markers`:
  - typed by `kind`: published case study or demonstration;
  - a source citation and a note;
  - steward-set, enforced in the database too;
  - audited, supersedable, and retirable (unmarking);
  - one current marker per account.
- **The chain is named by the outcome** (it carries the capability and the metric)
  plus the lever. The trigger checks that they form one chain.
- **Deliberate breaks for Gate A,** as named by Brad:
  - an author verifying their own actual;
  - a verdict without a verified actual;
  - a hypothesis setting its own direction;
  - a digit in the conditions;
  - a falsifier edited in place;
  - a post hoc hypothesis read as survived.

**Spine stages:** `model` (a hypothesis ties a capability, through a lever, to an
account metric, with its falsifier), and `return` (the POV puts it in front of a reader).
**Visual reference:** the canvas "LVRF Outputs — mock-ups" (Scotts POV, Curia POV,
Client 0), for **layout and structure only**. Where it departs from `CLAUDE.md` or §5,
the departure is named below and not built.

#### What the mock-ups get right, and O2 keeps

- **The page order:**
  - a banner strip;
  - the header with the confidence box and the stage bar;
  - the executive summary beside the hypothesis, with **"What would disprove it"**
    under the statement;
  - the value chain as one row of cells, the gap cell tinted;
  - the vendor claim shown **as a claim** ("never applied to the baseline, never a
    target");
  - the pack entry's confounders;
  - account facts with their basis and "citation opened";
  - the locked runs.
- **Placeholders, never filler:** "[EXECUTIVE SUMMARY — written by a named person]".
  An absent row renders as absent, in words.

#### Where the mock-ups depart, named and not built

| # | The mock-up shows | The rule it meets | O2 does |
|---|---|---|---|
| M1 | IBM Plex, a green/navy palette, raw hex values | `CLAUDE.md` tokens: Bebas Neue / Barlow / mono, ink, gold, `--gold-ink`, the semantic palette; no restated hex values | Rule76 tokens only. The OUTSIDE-IN banner on ink; UNVERIFIED in `--warning`, as everywhere |
| M2 | Stage bar "Researched · Classified · Hypothesis · Committed · Baseline verified · Measured · Verified" | The value spine of record is `baseline → attach → model → commit → measure → verify → return` (`CLAUDE.md`); "researched/classified" are not stages | The bar shows the seven spine stages from `engagements.value_stage`, one per engagement, each done, current or not reached. No engagement renders "no engagement yet" |
| M3 | A five-cell chain: industry money → lever → solution → outcome → evidence | §5's chain is **offering → capability → lever → pack entry → account metric → outcome**; the capability and the account metric are where gaps show | §5's six nodes, plus the hypothesis' status; a missing node is a gap cell |
| M4 | Scotts' header "Confidence: Low" with "No locked run yet" | Every number from the record: computed confidence belongs to a locked run | The header shows the latest locked run's sealed confidence (score, band, run number, locked date), or "No computed confidence: no locked run" |
| M5 | A TRIR bar chart FY23 1.5 / FY24 1.7 / FY25 1.4 | A figure only from a row. FY23 and FY24 are not recorded rows (the baseline is one value) | No chart. The baseline renders with its as-of date and basis. A series needs a recorded series: not in O2 |
| M6 | CFO and CHRO lens panels ("REFUSED", "CAPABILITY, NOT VALUE") | Lenses are `lens_policies`, O3 | Not in O2. The POV links to each locked run; the lens pages come in O3 |
| M7 | Curia's hypothesis "survived as of run 21" | A hypothesis written after its result is hindsight, not a test | See O2-D3 |
| M8 | Client 0 "value book" with a "Commercial line" (ARR, renewals, expansion "from Skillsoft CRM") | Output 5 and the board view are O3/Band D; the CRM figures have no source in LVRF | Not in O2. The commercial line has no data source: recorded as needing one, not planned |
| M9 | "Proposed value levers and outcomes" table across all pack entries | Output 5 (outcomes by lever) is O3 | O2 shows each hypothesis' chain. The cross-entry table waits for O3 |

#### The objects (migration 0036)

**`value_hypotheses`** (governed: `_audit`, `_touch`, `_no_delete`,
`_supersession_sane`; authorized acts):

- **The chain:** `institution_id`, `capability_id`, `value_lever_id`,
  `business_metric_id`, `value_outcome_id` (**required**: the falsifier needs a
  recorded value, and every outcome has a NOT NULL baseline), and `statement` (≥ 24).
- **Coherence, by a trigger at INSERT** (`value_hypotheses_coherent`). The chain must
  be one chain:
  - the capability, the metric and the outcome are the account's;
  - the outcome is the metric's and the capability's;
  - the metric's pack basis is the lever's pack entry;
  - the capability claims that entry;
  - the lever is current.

  A lever on TRIR cannot be argued through an OTIF metric.
- **The falsifier, structured so that it cannot carry a new number (O-D4):**
  - `falsifier_reference` is either `baseline` (the outcome's recorded baseline) or
    `committed_target` (the outcome's `target_value`, only when a named person
    committed it, checked by the trigger);
  - `falsifier_due` (a date);
  - `falsifier_conditions` (text, **no digits**: CHECK `falsifier_conditions !~ '[0-9]'`).
    For example: "on the same denominator, among the covered population".
  - **The direction is derived from the metric's** `direction`: the falsifier is
    always "no better than the reference by the due date". It renders, for a
    `decrease` metric, as **"TRIR at or above its baseline of 1.4 (as of 2025-09-30,
    published) on [due], on the same denominator, among the covered population."**
    Every number in that sentence is quoted from a row by the renderer. The author
    types none.
- **The falsifier is frozen** (`value_hypotheses_frozen`, UPDATE): the statement, the
  chain and the falsifier never change. A changed hypothesis is a **new version**
  (supersession, with a reason ≥ 12), and the superseded one stays visible. **Moving
  the goalposts happens on the record.**
- **Status:**
  - the values: `open`, then once to `confirmed`, `refuted` or `withdrawn`;
  - a decision needs `decided_by_person_id` (non-simulated), `decided_at`,
    `decision_evidence_id` (evidence on the outcome; for confirmed or refuted) and
    `decision_note` (≥ 12);
  - **refuted is a first-class result**, counted by the confirmation-gap report;
  - a CHECK holds the decision fields together.

**`executive_summaries`** (append-only versions: `_audit`, `_no_delete`, and a
`_immutable` trigger; authorized acts):

- **Columns:**
  - `institution_id`, optional `value_run_id`, and `body` (≥ 40);
  - `lens`: `cfo`, `chro`, `board` or `general`, as text for now. `lens_policies` is
    O3;
  - `author_person_id` **is the session's actor**: set by the route, never taken from
    the body. Non-simulated vendor staff, checked by the trigger;
  - `drafted_with_ai` and `drafting_tool`, the tool required exactly when AI drafted
    it (CHECK; O-D6);
  - `supersedes_id`.
- **LVRF generates no prose.** A new version supersedes; the old ones stay listed.

**Triggers, estimated:**

- value_hypotheses: 4 governed, plus `_coherent` and `_frozen`;
- executive_summaries: `_audit`, `_no_delete` and `_immutable`;
- about **111 → 120**, the exact total in hardening.sql;
- **no new heartbeat.** If "a hypothesis was refuted" should be a register event, that
  is a governance act for Brad, not part of O2.

#### Routes

**Authorized acts,** each tenant-checked, with a coverage-guard case and a
tenant-scope case; strict bodies as in O1, so an unknown field gets a 400 recorded with
source `route`:

- `POST /api/institutions/:id/hypotheses`;
- `POST /api/value-hypotheses/:id/supersede`;
- `POST /api/value-hypotheses/:id/decide` (`confirmed` or `refuted`, with evidence and
  note);
- `POST /api/value-hypotheses/:id/withdraw`;
- `POST /api/institutions/:id/executive-summaries`.

**One read, `GET /api/institutions/:id/pov`.** It assembles the page, and the server
computes every derived flag in one place:

- each figure's basis, by `lvrf_evidence_basis`;
- **`outside_in`:** no system-of-record or client-stated basis among the page's
  figures;
- **`unverified`:** any outcome on the page not source-verified (rule 6);
- the latest locked run per engagement, with its sealed confidence;
- each hypothesis' rendered falsifier;
- the gap register's asks per outcome, with **draft-and-refuse**'s drafted request.
  This is the current view, labelled as such, and it never touches a score.

#### Pages

- **`/accounts/:id/pov`** is **read-only**: the document, in M-order above, built
  with tokens.
  - **Banners:** OUTSIDE-IN HYPOTHESIS and UNVERIFIED cannot be suppressed.
  - **Reference examples:** the header reads "Reference example, not an engagement"
    when O2-D2 marks the account so.
- **Authoring stays on the account page** (`/accounts/:id`), as cards:
  - "State a hypothesis…", with the chain chosen from the account's own rows and the
    falsifier composed from the structured fields, previewed exactly as the POV will
    render it;
  - "Write the executive summary…";
  - decide, supersede and withdraw on each hypothesis.

#### Decisions for Brad

- **O2-D1, who may decide a hypothesis.** Recommendation: any authorized person
  **except its author** (two people per test), with the decider named on the page.
  Alternative: the steward only.
- **O2-D2, how an account is marked a reference example** (needed here for the
  header, and by O3 under O-D3). Today nothing marks it: Curia is "a reference
  example" only by its retired engagements, and retirement means something else.
  Recommendation: `institutions.reference_example_note` (≥ 12, set by the steward,
  audited). Set means a reference example.
- **O2-D3, hindsight.** A hypothesis created after its `falsifier_due`, or after its
  outcome already had a measured actual, is a description, not a test.
  Recommendation: the database computes it as **post hoc**. The page says "written
  after the result". It can be decided, but it never counts as confirmed in the
  confirmation gap. This is what keeps a Curia hypothesis honest (M7).
- **O2-D4, the falsifier's shape.** Only "no better than the reference (baseline or
  committed target) by the due date", plus digit-free conditions. Confirm, or name
  another shape that still introduces no number.

#### Gate A for O2 (planned)

- **`verify_value_hypotheses.sh`, on a throwaway clone:**
  - **coherence:** each broken link refused by the trigger;
  - **the falsifier:**
    - digits in the conditions refused;
    - a `committed_target` reference without a committer refused;
    - the rendered sentence quotes the row exactly, zero included;
  - **freezing:** an edit refused; supersession visible;
  - **decisions:** the decision rules, and refuted counted;
  - **post hoc,** per O2-D3;
  - **executive summaries:** the author is the actor; the AI disclosure is required
    exactly when declared; immutable;
  - **the POV GET:** the banners for an all-published account (Scotts-like) and for a
    customer-evidenced one;
  - **the browser walk:** authoring on the account page, then the POV read-only;
    screenshots looked at, at 1280 and at phone width;
  - **deliberate breaks:** the coherence trigger, the digit CHECK, the freeze, the
    banner computation.
- **The rest:** the full regression; prod-copy equivalence (only the new routes and
  the account page change); Gate B and Gate C as for O1, with the run-hash check in
  both.


## 6. OWN-1: the database owner role (planned 12 Oct 2026; **next**, before any further O-band work)

**Why.** Migrations run as `lvrf_app`, so `lvrf_app` owns every table, sequence and type,
and the drizzle schema. A table's owner can drop or disable its triggers and grant itself
any privilege on it. The functions belong to the superuser, so the audit function cannot
be rewritten; the triggers that call it can be removed. **Shown on the prod copy, 12 Oct
2026, as `lvrf_app`, in rolled-back transactions:**
- `DROP TRIGGER value_runs_locked_immutable ON value_runs` succeeded;
- `GRANT UPDATE, DELETE ON audit_log TO lvrf_app` succeeded;
- `SET session_replication_role = replica` was refused.

So every trigger guard, and rule 3's revocation, binds the app's code paths and not the
role. `CLAUDE.md` rule 3 and hardening sections 6, 16 and 20 now say so.

**Spine stage:** none directly. It is the precondition for every stage's record being
defensible, which is what the product sells. Placed ahead of O3 by Brad.

### What it does

- **`lvrf_owner`** (NOLOGIN) owns every table, sequence and type, and the drizzle schema.
  The functions stay with the superuser, as today.
- **Migrations run through a separate login, `lvrf_migrate`**, a member of `lvrf_owner`
  (`SET ROLE lvrf_owner`, so new objects are owned by the owner role).
  - Its credential is **in its own file on the box, readable only by brad** (`chmod
    600`), and never in the app's `.env`.
  - The deploy's migrate step reads that file.
  - `drizzle.config.ts`'s database-name guard is unchanged.
- **`lvrf_app` keeps exactly the data privileges it uses today,** with no ownership, no
  DDL and no GRANT ability:
  - SELECT, INSERT and UPDATE where the routes use them;
  - no DELETE anywhere, which the no-delete triggers already assume;
  - SELECT and INSERT only on `audit_log`, `heartbeat_events` and `refusals`;
  - USAGE on the sequences and EXECUTE on the functions.

  The exact list is derived from today's routes and checked against them, not assumed.
- **`ALTER DEFAULT PRIVILEGES FOR ROLE lvrf_owner`**, so a table a future migration
  creates grants `lvrf_app` only what is intended. A new table's grants are then reviewed
  in hardening, not inherited by accident.
- **Assertions:**
  - **hardening.sql** asserts the owner of every relation and `lvrf_app`'s privileges,
    and fails the run if either is wrong;
  - **a deploy step (5d)** refuses to restart if any relation is owned by `lvrf_app`, or
    if `lvrf_app` holds UPDATE, DELETE or TRUNCATE on the append-only tables;
  - **Gate C** reads both.
- **The proof** is the same three attempts as `lvrf_app` on the prod copy, after OWN-1:
  DROP TRIGGER, GRANT on `audit_log`, and DISABLE TRIGGER. **Each must be refused.** The
  deliberate breaks then run as the superuser, named as such.

### The change on the box (sudo, by Brad)

- create `lvrf_owner` and `lvrf_migrate`;
- `ALTER … OWNER TO lvrf_owner` for every object;
- the grants;
- the credential file;
- **a `pg_dump -Fc` backup first** (rule 8).

It runs once, as `postgres`, from a paste, with a STOP after each step. The verify
harness's clones (`createdb -T lvrf -O lvrf_app`) and `restore_prod_copy.sh` change to
reproduce the same ownership.

### Governance

- **No amendment is needed.** AMENDMENT-005 amends `CLAUDE.md` only to extend the
  governing AI principle (its `amends:` list and Article VI). AMENDMENT-004 governs the
  tokens. Neither the governance index nor any amendment in force sets a rule for
  `CLAUDE.md`'s Stack or for how rule 3 is enforced. OWN-1 enforces rule 3 at the role
  level; it does not change the rule.
- **The `CLAUDE.md` Stack edit** (applied when OWN-1 deploys, not before):

  > Postgres 16.14 (db `lvrf`; roles: **`lvrf_owner`** (NOLOGIN) owns the schema;
  > **`lvrf_migrate`** (login, member of `lvrf_owner`) runs migrations, its credential
  > in its own file on the box readable only by brad and never in the app `.env`;
  > **`lvrf_app`** (login) holds data privileges only, no ownership, DDL or GRANT;
  > localhost only, …)

  Rule 3's "Pending OWN-1" note is removed in the same edit.

### Gate C baseline (read-only, from O2's Gate C on)

- every relation's owner (`pg_tables.tableowner`, plus sequences and types);
- `lvrf_app`'s privileges on `audit_log` and `heartbeat_events`
  (`information_schema.table_privileges`, plus `has_table_privilege`);
- the count of disabled triggers (`pg_trigger.tgenabled <> 'O'`).

Today all are expected to show `lvrf_app` as owner. After OWN-1, none.

### OWN-1, the build and Gate B plan (planned 12 Oct 2026; **not yet approved**)

**New fact from O2's Gate C (prod, read-only).** Besides every table, sequence, type and
the drizzle schema, **`lvrf_app` owns the database `lvrf`**, and schema `public` is owned
by `pg_database_owner`, which is to say `lvrf_app`. A schema's owner can drop any object
in it, and the database owner can create schemas. **So OWN-1 moves the database's
ownership too**, not only the relations. Every function is already owned by `postgres`;
the only roles are `lvrf_app` and `postgres`.

#### The pieces

1. **`db/ownership.sql`** (new; idempotent; run as a superuser, per database):
   - **the roles:** creates `lvrf_owner` (NOLOGIN) and `lvrf_migrate` (LOGIN, no
     password in the file: set from a psql variable), grants `lvrf_owner` to
     `lvrf_migrate`, and `ALTER ROLE lvrf_migrate SET role = 'lvrf_owner'`, so every
     migration session creates objects owned by `lvrf_owner`;
   - **the ownership:** `ALTER DATABASE … OWNER TO lvrf_owner` (this moves `public`
     too), then an explicit loop that hands every table, sequence, type and the
     drizzle schema owned by `lvrf_app` to `lvrf_owner`;
     - **Not `REASSIGN OWNED`:** it reaches shared objects across the cluster, and the
       verify clones live in the same cluster;
     - the loop is the one `restore_prod_copy.sh` already uses, with the owner changed;
   - **the grants**, `lvrf_app`'s exact data privileges, derived from the code:
     - CONNECT and TEMP on the database; USAGE on `public` and `drizzle`;
     - SELECT and INSERT on every table;
     - UPDATE only on the tables the server and scripts UPDATE today: `sessions`,
       `value_outcomes`, `person_credentials`, `research_results`, `value_hypotheses`,
       `reference_example_markers`, `business_metrics`, `value_runs`, `value_levers`,
       `tenants`, `persons`, `lever_offerings`, `institutions`, `institution_facts`,
       `institution_entities`, `industry_measures`, `engagements`, `access_grants`.
       This list is from a grep of `UPDATE <table>`; Gate A's full regression is what
       proves it complete (a missing grant fails a script with "permission denied");
     - **no DELETE or TRUNCATE anywhere** (no code deletes, and the no-delete triggers
       assume it);
     - USAGE and SELECT on the sequences; EXECUTE on the `lvrf_*` functions;
     - **no CREATE** on the database or `public`;
   - **`ALTER DEFAULT PRIVILEGES FOR ROLE lvrf_owner IN SCHEMA public`:** a new table
     grants `lvrf_app` SELECT and INSERT, and its sequences USAGE and SELECT, and
     nothing else. UPDATE on a new table is a reviewed line in `ownership.sql`, not
     inherited.
2. **The assertion.** `hardening.sql` section 24 (a DO block, run after the grants; section 23 is the W1 fix's)
   **fails the hardening run** if:
   - any relation, type or schema in `lvrf` is owned by `lvrf_app`, or the database is;
   - `lvrf_app` holds UPDATE, DELETE or TRUNCATE on `audit_log`, `heartbeat_events`
     or `refusals`;
   - `lvrf_app` holds DELETE or TRUNCATE anywhere, or CREATE on the database or
     `public`;
   - any trigger is disabled.

   No trigger count change.
3. **Deploy step 5d** (`scripts/lvrf-deploy.sh`) runs the same checks read-only, as
   `lvrf_app`, and **refuses to restart** on any failure. The deploy script changes, so
   its self-update re-exec runs once.
4. **Migrations run as `lvrf_migrate`.**
   - **On the box:** its URL is in **`~/.lvrf_migrate.env`**, `chmod 600`, owner brad,
     never in `/srv/lvrf/.env`. The migrate paste line is `DATABASE_URL="$(grep
     '^DATABASE_URL=' ~/.lvrf_migrate.env | cut -d= -f2-)" npx drizzle-kit migrate`.
   - **`scripts/check_migrate_role.ts`** (new, read-only) prints `current_user` and
     `current_role`, and exits 1 unless they are `lvrf_migrate` and `lvrf_owner`. The
     paste runs it on the line before migrating.
   - `drizzle.config.ts` keeps its database-name and localhost guards.
5. **The local harness**, so the verify clones have prod's shape:
   - **one-time, locally:** the same `ownership.sql` (roles and grants) on the local
     cluster, and `lvrf_migrate`'s local URL in a git-ignored `.env.migrate`;
     - the local template `lvrf` stays as it is (**nothing is created in real local
       `lvrf`**); each clone is converted after `createdb -T lvrf`;
   - **`scripts/lib/clone.sh`** (new): `make_clone NAME` = `createdb -T lvrf`, then
     `ownership.sql` on the clone, then migrate as `lvrf_migrate`, then
     `hardening.sql`. It replaces the four lines repeated in 26 verify scripts, a
     mechanical change;
   - **`restore_prod_copy.sh`** hands ownership to `lvrf_owner`, not `lvrf_app`, and
     runs `ownership.sql`.

#### Gate A (planned)

- **`verify_ownership.sh`**, on a clone converted as above, **as `lvrf_app`**. Each
  attempt must be refused, and only the database's refusal counts:
  - `DROP TRIGGER value_runs_locked_immutable`;
  - `ALTER TABLE … DISABLE TRIGGER value_hypotheses_guard`;
  - `GRANT UPDATE ON audit_log TO lvrf_app`;
  - `ALTER TABLE institutions ADD COLUMN x int`;
  - `CREATE TABLE public.x (…)`;
  - `DROP TABLE` on a governed table;
  - `TRUNCATE refusals`;
  - `SET session_replication_role = replica`;
  - `ALTER DATABASE … OWNER TO lvrf_app`.
- **And as `lvrf_migrate`:** a test migration creates a table owned by `lvrf_owner`,
  with the default privileges applied (SELECT and INSERT for `lvrf_app`, no UPDATE).
- **Deliberate breaks** (as the superuser, named):
  - **B1:** one table handed back to `lvrf_app` → the hardening assertion fails, and
    step 5d refuses;
  - **B2:** UPDATE granted on `audit_log` → the same;
  - **B3:** a migration run as `lvrf_app` → its new table is `lvrf_app`'s, and the
    assertion fails;
  - **B4:** a trigger disabled → the assertion fails.
- **The proof you asked for:** the three attempts, as `lvrf_app`, on a prod copy
  converted by `ownership.sql` (DROP TRIGGER, GRANT on `audit_log`, DISABLE TRIGGER),
  each refused.
- **The full regression on converted clones** is what proves `lvrf_app`'s grants are
  enough: every route and script runs as `lvrf_app`. The tenant-scope coverage is
  unchanged.
- **Prod-copy equivalence:** every GET identical before and after conversion. No API
  changes.

#### Gate B (planned pastes, a STOP after each)

1. **Read-only pre-check:**
   - HEAD;
   - the run-hash check (with `DATABASE_URL` inline);
   - the ownership baseline (as in O2's Gate C);
   - `pg_hba.conf`'s rules for 127.0.0.1, read with `sudo cat` (**if sudo asks for a
     password, stop and run it yourself**), to confirm a new local login can
     authenticate with scram.
2. **Backup:** `sudo -u postgres pg_dump -Fc lvrf`, `chmod 600`.
3. **Roles and ownership, as `postgres`:**
   - the password is generated on the box (`openssl rand -hex 24`), written straight to
     `~/.lvrf_migrate.env` (`chmod 600`), and passed to `ownership.sql` as a psql
     variable read from that file. **It is never echoed or typed**;
   - then `ownership.sql`;
   - then `check_migrate_role.ts`, with the migrate URL inline;
   - then the baseline again: `lvrf_owner` owns everything, and `lvrf_app` only its
     grants.
4. **Pull, migrate as `lvrf_migrate`, harden:**
   - **expected:** no new migration; hardening exit 0 with section 24's assertion
     passing; **129 triggers, manifest 129** (unchanged by OWN-1);
   - **the proof on prod,** read-only: `has_table_privilege` and ownership, showing
     `lvrf_app` with no UPDATE, DELETE or TRUNCATE on the append-only tables and owning
     nothing;
   - **the three DDL attempts as `lvrf_app` on prod are optional,** your call. Each
     runs in `BEGIN … ROLLBACK`, so even if one succeeded it would be undone, but
     `DROP TRIGGER` briefly takes an exclusive lock.
5. **Deploy**, with `DATABASE_URL` inline:
   - **expected:** the re-exec line (the deploy script changed); 5c drift none; **5d
     ownership and privileges as asserted**; smoke checks; the HEAD; the bundle
     unchanged unless the client changed.
6. **Gate C (mine, read-only):** the baseline now reads `lvrf_owner` everywhere,
   `lvrf_app` with exactly its grants, and 0 disabled triggers; plus the run hashes and
   the cross-tenant refusal check.

#### Decisions for Brad before the build

- **OWN-1-D1, the local cluster.** Run `ownership.sql`'s roles and grants once on this
  Mac's cluster. This creates roles `lvrf_owner` and `lvrf_migrate` cluster-wide,
  though nothing in real local `lvrf`: clones are converted, the template is not.
  Recommendation: yes; otherwise the verify clones can't have prod's shape.
- **OWN-1-D2, the live DDL attempts on prod** (Gate B step 4). Recommendation: no.
  The read-only privilege facts on prod, plus the three attempts refused on the
  converted prod copy, are the proof without touching prod's locks.
- **OWN-1-D3, the CLAUDE.md Stack edit** (in §6 above), applied in OWN-1's docs commit
  after Gate C, with rule 3's "Pending OWN-1" note removed.


## 4k. Q4k: plain refusals everywhere, and the AI-sourced evidence form (planned 12 Oct 2026; **not yet approved**)

**What happened.** In W6, Source verified = Yes on AI-sourced evidence returned Postgres's
own text: "new row for relation 'evidence' violates check constraint
'evidence_ai_verify_requires_resolution'". The CHECK is right (AMENDMENT-005 Article III:
AI-sourced evidence cannot certify itself). Its wording and the form are wrong.

**Spine stage:** `baseline` and `measure` (evidence intake). It is also a fix to how every
stage's refusals read.

### 1. CHECK violations in plain sentences (and L29's other raw errors)

- **One mapping, in `server/lib/refusal.ts`,** beside the unique-violation one.
  - **Postgres's own CHECK text** ("new row for relation … violates check constraint
    …") becomes a sentence per constraint, for example:
    - `evidence_ai_verify_requires_resolution` → "AI-sourced evidence is verified after
      its citation is opened, not when it's recorded." (Brad's wording; see 3 below);
    - an unmapped CHECK → a neutral "That can't be recorded as entered; nothing was
      written.", never the name.
  - **Messages the schema writes for people** (`RAISE` in hardening.sql, prefixed
    "LVRF:") pass unchanged, as today.
  - The raw text and the constraint name still go into `refusals`, never to the
    person.
- **Coverage guard.** There are 61 CHECKs in `db/schema.ts`. A check script lists every
  CHECK name in the schema and fails unless each has either a plain sentence, or is
  marked "the route pre-validates it" (the route answers first, in its own words).
  This works like `MUTATING_ROUTE_CLASS`: a new CHECK cannot ship without a sentence.
- **L29's rest:** the 500 fallbacks (foreign-key, not-null and type errors: 23503,
  23502, 22P02) go through the same handler. The answer is "That could not be
  written; nothing was saved.", with the raw text in the server log only.
- **Gate A:**
  - each mapped CHECK provoked through its route, with the plain sentence asserted and
    no constraint name, relation name or "violates" anywhere in the response;
  - the coverage guard, with a deliberate unmapped CHECK on a clone failing it;
  - a deliberate foreign-key violation per route class answering plainly;
  - a break: the mapping removed, so the raw text returns.

### 2. The evidence form (`AddEvidenceCard`, used by W6 and the run workbench)

- **When AI-sourced is Yes,** "Source verified" is set to No and disabled, with the
  reason beside it: "AI-sourced evidence is verified after its citation is opened, not
  when it's recorded (AMENDMENT-005, Article III)."
- Switching AI-sourced back to No re-enables it. A refusal is a courtesy here; the
  CHECK stays the authority.
- **The route answers first** (`POST /api/value-outcomes/:id/evidence`): a 422 in the
  same sentence, before any write. So the database's CHECK is the backstop, not the
  first thing a person meets.
- **Gate A:**
  - the browser walk: AI-sourced Yes disables Source verified and shows the reason;
  - the API: the combination → 422, plain, nothing written;
  - a break: the client gate removed, so the route still refuses in plain words.

### 3. The gap this exposes, named

**No route opens the citation on outcome evidence.** `citation_resolved` is set only
through account research (`accountResearch.ts`'s accept, for facts). So AI-sourced
**outcome** evidence can be recorded but never verified, and "verified after its
citation is opened" points at a step that does not exist for it yet. This is the W6
gap queued after the Scotts research. **Decision for Brad:**

- **Q4k-D1:** build "Open the citation…" for outcome evidence in Q4k (a person, not
  the author of the evidence, opens it and records that it matches; the same rule as
  account research H1); or keep Q4k to wording, and say in the sentence "(opening
  outcome-evidence citations is not built yet)".
- **Recommendation:** build it in Q4k. Otherwise the plain sentence describes a path a
  person cannot take.

### 4. R1, refined (Brad, 12 Oct 2026)

**Under R1, a company's formal annual disclosure report counts as `public_filing`**:
statutory filings (10-K, annual report) and formal annual disclosures (a CR,
sustainability or ESG report). **Looser company material is `observation`**: press
releases, web pages, blog posts, job postings and marketing material.

- **The basis follows from D2, unchanged:** `public_filing` → published; `observation`
  → inferred with a source reference, else assumed.
- **Scotts:** its 2026 CR Disclosure Report stays `public_filing` (published).
- **The form:** the evidence kind's help text says this, in the form's own words, so
  the choice is made at entry and not argued later.
- **Recorded in §3** as R1's refinement. **No code depends on it** beyond that help
  text.

### OWN-1, the build plan refreshed (13 Oct 2026; **approved 19 Oct 2026 with OWN-1-D1–D3; built, Gate A passed, **deployed 19 Oct 2026 (`a88c071`), Gate C clean, closed**: see BUILD_STATUS)

**What changed since the plan above was written** (O2, the W1 fix and Q4k deployed since):

- **40 tables** on prod, 2 sequences, 27 enum types. The database `lvrf` is owned by
  `lvrf_app` (O2's Gate C), so `ownership.sql` moves the database too, which also moves
  `public` (owned by `pg_database_owner`).
- **`lvrf_app`'s privileges, re-derived from the code today.** The server and the box
  scripts were grepped for every statement they issue:
  - **SELECT** on every table, and on `drizzle.__drizzle_migrations` (deploy step 5c,
    `check_schema_drift.mjs` and Gate C read it as `lvrf_app`), with USAGE on schemas
    `public` and `drizzle`.
  - **INSERT on 31 tables:** access_grants, account_person_links, assessments,
    business_metrics, capabilities, capability_industry_measures, engagements, evidence,
    executive_summaries, heartbeat_events, industry_measure_exclusions,
    industry_measures, institution_entities, institution_facts, institutions,
    lever_offerings, offering_capabilities, person_credentials, persons, record_documents,
    reference_example_markers, refusals, research_prompts, research_results, sessions,
    value_hypotheses, value_levers, value_outcome_evidence, value_outcomes, value_runs,
    and audit_log (by `lvrf_audit`, which is SECURITY DEFINER and runs as its owner, so
    only as a backstop).
  - **UPDATE on 20 tables:** access_grants, account_person_links, business_metrics,
    engagements, **evidence** (new with Q4k: opening a citation), industry_measures,
    institution_entities, institution_facts, institutions, lever_offerings,
    person_credentials, persons, reference_example_markers, research_results, sessions,
    tenants, value_hypotheses, value_levers, value_outcomes, value_runs.
  - **No DELETE or TRUNCATE anywhere.** The code issues none; "TRUNCATE" appears only in
    comments. `hardening_manifest` is truncated by `hardening.sql`, which runs as
    `postgres`.
  - **USAGE and SELECT** on the 2 sequences (`audit_log_id_seq`,
    `heartbeat_events_id_seq`).
  - **EXECUTE** on the `lvrf_*` functions the app calls (`lvrf_evidence_basis`,
    `lvrf_hypothesis_verdict`). Both are owned by `postgres`; PUBLIC's default EXECUTE
    already covers them, and that is left as is.
  - **The grep is a starting list, not the proof.** Gate A runs all 29 verify scripts on
    converted clones as `lvrf_app`; a missing grant fails a script with "permission
    denied".
- **Hardening:** the ownership assertion is **section 24** (section 23 is the W1 fix's
  link guard). The GRANTs live in `ownership.sql`, and section 24 asserts them after every
  hardening run.
- **No trigger count change.** It stays 129.

**The build, in order:**

1. **`db/ownership.sql`** (idempotent, run as a superuser, per database). It holds:
   - the roles, `lvrf_owner` (NOLOGIN) and `lvrf_migrate` (LOGIN, member of
     `lvrf_owner`, `ALTER ROLE … SET role = 'lvrf_owner'`), with the password from a psql
     variable and never in the file;
   - `ALTER DATABASE … OWNER TO lvrf_owner`;
   - the explicit ownership loop (not `REASSIGN OWNED`, which reaches other databases in
     the cluster);
   - the grants above, plus REVOKE CREATE on the database and on `public` from
     `lvrf_app` and PUBLIC;
   - `ALTER DEFAULT PRIVILEGES FOR ROLE lvrf_owner`: a new table gives `lvrf_app` SELECT
     and INSERT, sequences USAGE and SELECT, and nothing else.
2. **`hardening.sql` section 24:** the assertion. It fails the run if `lvrf_app` owns
   anything or the database, holds DELETE, TRUNCATE or CREATE anywhere, or holds UPDATE
   on `audit_log`, `heartbeat_events` or `refusals`; or if any trigger is disabled.
3. **`scripts/check_migrate_role.ts`** (read-only): exits 1 unless the connection is
   `lvrf_migrate` acting as `lvrf_owner`.
4. **Deploy step 5d** in `scripts/lvrf-deploy.sh`: the same assertion, read-only as
   `lvrf_app`. It refuses to restart on any failure. The script changes, so its re-exec
   runs once.
5. **The harness:** `scripts/lib/clone.sh` → `make_clone NAME` = `createdb -T lvrf`, then
   `ownership.sql` on the clone, then migrate as `lvrf_migrate`, then `hardening.sql`.
   - It replaces the four repeated lines in 26 verify scripts (mechanical).
   - **Local:** the roles are created once on this Mac's cluster (OWN-1-D1), with
     `lvrf_migrate`'s URL in a git-ignored `.env.migrate`. **Real local `lvrf` is not
     converted**: clones are.
   - `restore_prod_copy.sh` hands ownership to `lvrf_owner` and runs `ownership.sql`.
6. **`verify_ownership.sh`** (Gate A):
   - **nine attempts as `lvrf_app`, each refused:** DROP TRIGGER, DISABLE TRIGGER, GRANT
     UPDATE on `audit_log`, ADD COLUMN, CREATE TABLE, DROP TABLE, TRUNCATE `refusals`,
     `session_replication_role`, ALTER DATABASE OWNER;
   - **as `lvrf_migrate`:** a test migration's table is owned by `lvrf_owner`, with the
     default privileges;
   - **breaks:**
     - B1: a table back to `lvrf_app` → hardening fails, and 5d refuses;
     - B2: UPDATE on `audit_log` → the same;
     - B3: a migration as `lvrf_app` → its table is `lvrf_app`'s, and hardening fails;
     - B4: a disabled trigger → hardening fails;
   - **the proof Brad asked for:** the three attempts on a converted prod copy, each
     refused.
7. **Regression and prod-copy:** all verify scripts on converted clones, and every GET
   identical (no API change).

**Gate B (unchanged in shape, a STOP after each):**

1. a read-only pre-check, including `pg_hba.conf`'s 127.0.0.1 rules (`sudo cat`; if sudo
   prompts, Brad runs it);
2. the backup;
3. the roles and ownership as `postgres`: the password generated on the box straight into
   `~/.lvrf_migrate.env` (`chmod 600`) and never echoed, then `ownership.sql`, then
   `check_migrate_role.ts`;
4. pull, migrate as `lvrf_migrate`, harden (section 24 passing; 129 triggers);
5. deploy (with the re-exec line);
6. Gate C.

**Before Gate C can be mine again:** my read-only ssh needs a key in this Mac's ssh agent
(see the Q4k Deployed note). Until then, Gate C goes to Brad as a paste.

**Decisions still open (above):**

- **OWN-1-D1:** may the local roles be created?
- **OWN-1-D2:** no live DDL attempts on prod (recommended)?
- **OWN-1-D3:** the `CLAUDE.md` Stack edit after OWN-1's Gate C.

---

## 7. UX-1: navigation and usability (planned 18 Oct 2026; **plan only, not yet approved; no UI code until Brad approves mock-ups**)

**The value-spine stage it serves:** all of them. The operator walks `baseline → attach →
model → commit → measure → verify → return` on these pages. UX-1 changes how those
pages are presented. It does not change any governance rule, route, table, trigger or CHECK.

### 7a. The Rule76 design standards in the repo

These are the written standards. Nothing here is invented.

| Where | What it rules | Status |
|---|---|---|
| `CLAUDE.md`, "Rule76 design tokens" | The canonical tokens. The ink, gold and gold-ink rule. WATCH reuses gold. No component restates a hex value | Normative |
| `AMENDMENT-004` (Cathedral) | The semantic palette and contrast. Gold on white fails AA. Art. IV: screen and print are one system | In force |
| `DESIGN_SPEC.md` §0b | "The component library — do not invent a second one" | Draft (CDS volumes unratified) |
| `DESIGN_SPEC.md` §9, GovernedForm | Four result states: a refusal (422) and a conflict (409) render as an **ink block, verbatim**; an error is muted | Draft |
| `DESIGN_SPEC.md` §9, "Rules every form inherits" | No plausible defaults (`— choose —`, tri-state booleans). Provenance first. The actor requirement above the fields. The result block above the submit button. Labels teach the constraint | Draft, implemented |
| `DESIGN_SPEC.md` §9, "Rendering rules" | No bare 0, dash, `""` or `"null"`; render an explicit state. Zero events is UNMEASURED. An unbuilt action is disabled, saying it is *not yet implemented*. A gated action is disabled, giving the gate's reason | Draft, partly implemented |
| `DESIGN_SPEC.md` §9 | Ink is reserved for refusals and conflicts. Preconditions use the **gold left-border callout** | Draft |
| `DESIGN_SPEC.md` §10 | Tokens (plus the derived `ink-70`, `rule` and `rule-soft`). Bebas Neue, Barlow and the system mono. The `RULE \| 76` lockup is built in markup. The Chapel is subordinate (Rule76 above LVRF). No raw hex, one exception | Draft |
| `design/BRAND.md` | Seven logo and lockup rules | Draft |
| `design/workbench.html` | A static mock-up of the run workbench (the run page's ancestor) | Reference only |

**What is not written anywhere:** no standard for navigation, information architecture,
page hierarchy, a primary action, step order, progressive disclosure or responsive
layout. No button hierarchy is defined either: every button is the same outlined ghost,
and disabled differs from enabled only by a lighter grey. UX-1's IA (7c) would be the
first written rule in that space. It is a **proposal for Brad to ratify**, not a
standard found in the repo.

**A named conflict, carried from Q4k:** `DESIGN_SPEC.md` §9 says a refusal message is
"never prefixed, wrapped, appended, or mapped to a friendlier string". Q4k maps every
raw Postgres CHECK text to a plain sentence. "LVRF:" messages still pass verbatim.
**Brad decides:** amend §9 to "LVRF: sentences verbatim; raw database text in a plain
sentence that names the rule", or narrow Q4k. Recommendation: amend §9. Raw CHECK text
is not a sentence that names an amendment, and §9's reason for the rule doesn't hold
for it.

### 7b. The audit (captured 18 Oct 2026)

**How it was captured:**
- the prod copy (`lvrf_prodcopy`) on a throwaway clone, signed in by session as the steward;
- 9 pages at 1280 and at 390, full height, each one looked at;
- the clone was dropped afterwards.

The prod copy predates Scotts. Curia (the walk done, run 1 locked) and Skillsoft
(customer zero) stand in for it.

**How findings are ranked:**
- **B1, blocks:** a user can't find or finish the next step without help.
- **B2, misleads:** the user reaches a wrong belief, or the page shows internal or raw text.
- **B3, slows:** the user gets there, with effort.
- **B4, polish.**

| # | Rank | Page | Finding | Standard |
|---|---|---|---|---|
| 1 | B1 | Account | **The page runs against the workflow.** Top to bottom: facts → walk (W1–W9) → industry → measuring → gap → engagements → hypotheses (06) → summary (07) → reference (08) → **Research (A1–A5) last**, 4,455 px down. The work goes research → walk → hypothesis → summary → run → POV. Research, the first step, is the last thing on the page | Usability: hierarchy |
| 2 | B1 | Account | **There is no single next action.** W6 and W9 both say NEXT at once. W6 says NEXT while its own text says the run is locked and evidence "would not be in it". Seventeen cards are all open at the same weight, and none says "do this now" | One primary action per step |
| 3 | B1 | All | **There is no visual primary action.** Every button is the same small, grey, outlined, uppercase ghost. Disabled differs from enabled only by a lighter grey (ink-25 text, which AMENDMENT-004 allows for disabled). "Generate research prompt" is the only button with a dark border. On a long page the user can't see what's clickable | Not written (7a) |
| 4 | B1 | Accounts | **The account rows don't look like links.** The `<tr onClick>` has no link, no focus and no keyboard access, and nothing says "open". It is the only way into an account | Usability: navigation |
| 5 | B1 | Account → Run, POV | **Nothing joins the steps.** Engagements (05) are plain text, not links. The run is reached from W7's "Run 1" or from the Runs list. The POV link is a small gold "Open the POV →" on card 06. There's no breadcrumb from a run back to its step | Usability: navigation |
| 6 | B2 | POV | **Raw server text with a UUID**, in critical red, on a customer-facing page: "value outcome e3fb0061-… belongs to a retired engagement; its outcomes are frozen". It comes from `server/routes/outcomeWalk.ts` (3 places). A frozen outcome isn't a failure, so critical red is the wrong colour | Q4k plain sentences; §9 ink/colour |
| 7 | B2 | Run, POV, Runs | **Pages scroll sideways at 390:** Run 674 px, Runs 788 px, POV 438 px (the hash lines). The run page's dark spine sidebar and the confidence column stack above the record | Responsive (CLAUDE.md artifact rule; not in DESIGN_SPEC) |
| 8 | B2 | All | **Internal vocabulary on screen:** "(3.0 item 3)", "the cohort decision", "pack basis", "reference engagement", "CURIA_VALIDATED" (a provenance enum shown raw), "HB-0013", schema CHECK names in findings (`value_outcomes_verified_requires_human`), `public_filing`/`observation` as code | Plain language |
| 9 | B2 | Accounts | "Curia · Curia — lot acceptance…": the account name is repeated, because the engagement name already includes it. "10.0 LOW" has no scale; the POV says "LOW 10" and the run page says "10 /100" | Plain language; one meaning, one value |
| 10 | B2 | Runs | All 22 rows look alike, with ISO timestamps to the millisecond. 21 are a retired engagement's runs; the one that counts (Curia run 1, locked) isn't marked as the run of record | Hierarchy |
| 11 | B3 | Accounts | "Create account" fills the middle of the home page, provenance first, above book confidence. It's a rare act on the most-visited page | One primary action |
| 12 | B3 | Account | Numbering mixes 00–08, W1–W9 and A1–A5 on one page; the Pack page uses R1–R5. Numbers suggest an order the page doesn't follow | Hierarchy |
| 13 | B3 | Run | The evidence form is open by default, about 600 px of selects, between the ledger and the gap register, on a run that may be locked | Progressive disclosure |
| 14 | B3 | Pack | The research cards R1–R5 show at equal weight even when the pack has no measures. "Exclude a measure" has a stray "Clear" button below its own unmet line | One primary action |
| 15 | B3 | All, 390 | The header wraps to three rows (nav, then the actor, then Change password/Sign out), so 150 px of chrome sits above every page | Responsive |
| 16 | B4 | Sign in | The nav (Accounts/Packs/Runs) shows to a signed-out visitor, and each link leads back to sign-in | Navigation |
| 17 | B4 | Packs | "0 MEASURES" badges outnumber the useful ones 7 to 3; no filter | Hierarchy |

**What already meets the standards:**
- **Disabled submits explain themselves:** Q4l added "To submit: …" and "Fill in every required field to submit.".
- **No plausible defaults:** selects start on `— choose —`.
- **The unverified banner prints:** it shows on POV and Run.
- **Refusals:** an ink block, kept for refusals.
- **Tokens:** used with no stray hex seen; display, body and mono faces as specified.
- **Explicit states:** "Not recorded", "Not yet measured" and "No pack basis" stand in for blanks.

### 7c. The proposed information architecture

**The rule:** governed detail is presented differently, never removed. Every form,
refusal, provenance block, unmet list, disclosure banner and payload hash stays. The
only change is where they render and how much is open at once.

```
Sign in
└─ Accounts home                      (one list; "Create account" behind a button)
   │   row = name · industry · current step · confidence (n/100, band) · last act
   │   book confidence below the list
   └─ Account workspace  /accounts/:id
        header: name · industry · confidence n/100 · the ONE next action (filled button)
        ┌ 1 Research       entity pinned → facts accepted          [done ▸ / next / waiting]
        ├ 2 Outside-in walk W1–W8 as sub-steps; one open at a time
        ├ 3 Hypothesis     the lever, the statement, the due date
        ├ 4 Summary        the executive summary
        ├ 5 Run and lock   the run list (what each sealed) · produce · lock
        └ 6 Point of view  open, print/PDF (the existing POV page)
        "Account detail" (folded): facts · industry money · measuring · gap ·
                                   engagements · reference marker · retire (W9)
        └─ Run page  /runs/:id     breadcrumb: Account › Run and lock › Run N
        └─ POV page  /accounts/:id/pov  breadcrumb back; unchanged as a document
   Packs, Runs: kept in the top nav as steward/reference views, not the path
```

**How the steps behave:**
- **One step is open: the first one not done.** Its single primary action is the only
  filled button (ink fill with offwhite text, or gold on ink). Every other action is an
  outlined secondary.
- **A done step folds** to one line: what it recorded, who, when, and "▸ show".
  Unfolded, it shows exactly what it shows today.
- **A waiting step** shows one line, "Waits for: step N, <the reason>". The text comes
  from the existing unmet lists, in the gold left-border callout (§9's precondition
  treatment).
- **A step is never skipped by presentation.** If the server would refuse, the step
  says why before the user starts, using the same `unmet` sentences as today.

**Step status is derived, not stored:**
- it comes from the reads the page already makes (entity pinned, walk step states,
  hypotheses, summary, runs, locked);
- it adds **no table and no heartbeat**;
- if a derivation needs a field a GET doesn't return, the GET gains it, read-only, as
  in Q4l.

**The other screens:**
- **Run page at 390:** the spine sidebar becomes a horizontal stage strip, and the
  confidence column moves below the record header. The evidence form folds behind
  "Add evidence…", which is disabled with the lock's reason on a locked run.
- **Plain language:** a glossary pass to replace internal labels (item numbers, enum
  codes, CHECK names, heartbeat ids) with words. The codes stay in the mono detail
  line, where an auditor needs them.
- **Fixes for the raw POV text and its red colour (#6):** a plain sentence in ink-45,
  "Frozen: this engagement is retired, so its outcomes have no open asks.", through
  the existing refusal mapping. It is a small server change, and it is part of UX-1's
  build, not its plan.

**What UX-1 does not do:**
- no new route, table, trigger or heartbeat;
- no change to any CHECK, gate, grant or refusal;
- the disclosure banner stays on every unverified page;
- no learner-facing feature.

### 7d. The markers: what exists, and "outside-in test"

**What exists:** `reference_example_kind` has two values, `published_case_study` and
`demonstration`. Before Q4l the marker form defaulted to `published_case_study`. That
is how Scotts, an outside-in test of published material, came to be offered "published
case study". Q4l made the kind start unchosen.

**Recommendation: yes, add `outside_in_test`.** Scotts is neither of the existing
kinds: not a customer's published case study, and not a demonstration built for
show. It is an outside-in test of the method against a real company's public record.
Calling it "demonstration" undersells the record; calling it "case study" overstates it.

**It is its own item, after UX-1's mock-ups and before its build:**
- an enum migration (the one change to the database);
- a plain sentence for the kind;
- the POV render label "Outside-in test: built from published material, not a
  customer engagement".

Before the migration: it adds an enum value, and **orphans nothing**.

**Brad decides:**
- **UX-1-D1:** approve the IA in 7c as the basis for mock-ups.
- **UX-1-D2:** the §9 refusal-wording conflict (7a).
- **UX-1-D3:** add `outside_in_test` as a marker kind (7d). **Accepted 19 Oct 2026 (7e item 6); built, Gate A passed, migration 0038.**
- **UX-1-D4:** the mock-up form. Static HTML in `design/` like `workbench.html`, one
  per screen (Accounts home, Account workspace in three states: new, mid-walk and
  locked; Run at 390), using only the canonical tokens. Recommended.

### 7e. Polish from the Scotts POV (Brad's reviewer, 19 Oct 2026), for UX-1's build

The Scotts POV renders from the record: Low 35 from locked run 2, the six-step chain
complete, the hypothesis open, and the vendor claim kept separate. These items go into
UX-1's build, after its mock-ups are approved:

1. **The falsifier as one sentence.** Today it reads "…at or above its baseline of 1.4 …
   (recorded 2025-09-30) on 2027-09-30, Same TRIR … record..": two clauses glued
   together, ending in a double period. It should read "…by 30 Sep 2027, provided that:
   <conditions>." with exactly one final period, whether or not the conditions end in
   one. The template lives in two places, the server's `falsifierSentence` and the
   client's `previewFalsifier`. `verify_value_hypotheses` checks that the two are
   identical, so both change together.
2. **Money formatted:** "$3,413.1 million", not "3413100000 USD". The value stays
   recorded exactly; only how it is shown changes.
3. **The stage bar in plain words:** labels for `attach`, `model` and `return`. The enum
   keeps its values; the labels map to them in one place.
4. **The lever's status reads "ratified by <steward>, <date>".** Under O-D2 the
   steward's proposal *is* the ratification. The label comes from `proposed_by` and the
   date it was proposed (only the steward can propose). The row's `status` stays
   `proposed`, so the display maps it rather than changing the data.
5. **"Locked runs" lists every locked run.** Moved forward into **Q4m** (below), because
   retiring an engagement would otherwise drop runs from the POV.
6. **The banner's "Reference example — Reference example"** is fixed by the
   `outside_in_test` marker kind (UX-1-D3, accepted here). It needs an enum migration
   that orphans nothing, and the banner says "Outside-in test: built from published
   material, not a customer engagement".

### 7f. The mock-ups (19 Oct 2026; UX-1-D1–D4 approved; **for Brad's review, not UI code**)

**Where they are:** `design/mockups/`, static HTML in the form of `design/workbench.html`.
- **Each page is self-contained** and opens in a browser.
- **Screenshots** of every page at 1280 and 390 are in `design/mockups/screens/`. None
  scrolls sideways.
- **Tokens:**
  - **`tokens.css` is the one copy of the `CLAUDE.md` tokens** here, because static HTML
    cannot read Markdown;
  - **`scripts/check_design_tokens.mjs`** fails if any value differs from `CLAUDE.md`'s
    table, or if any other mock-up file contains a hex colour.
- **Every page carries a "UX-1 mock-up · not the app" strip.**
- **The content is Scotts' record** as of 19 Oct 2026, at three real moments. Where a
  record value wasn't to hand (the pinned entity, the summary's full text, other facts),
  the page says so in brackets rather than inventing one.

| Page | Shows |
|---|---|
| `accounts.html` | **Accounts home.** One list; each row is a link: industry, where it stands ("3 of 6 · State a hypothesis"), confidence as n / 100 with band, last recorded act. "New account…" behind a button. Book confidence below, with what it counts |
| `workspace-new.html` | **Scotts, 12 Oct, before research.** Step 1 open with its one filled action, "Generate the research prompt"; steps 2–6 each one line saying what it waits for |
| `workspace-mid.html` | **Scotts, 19 Oct morning, at the hypothesis.** Steps 1–2 folded to one line each (what was recorded, by whom, when, "Show ▸"). Step 3 open: provenance first, labels that teach the constraint, the falsifier previewed as the one sentence the POV will print, one filled submit. Steps 4–6 one line each, with secondary links ("Write it now ▸", "Produce a run now ▸", "Open ›") |
| `workspace-locked.html` | **Scotts after W9.** The retirement notice; steps 1–5 folded; step 6 open, "Open the point of view", with the unverified callout. No new run offered (frozen) |
| `run.html` | **Run 2.** Both banners; breadcrumb back to its step; the spine as a strip with plain labels; the figures; what this run sealed (and that run 1 sealed them unopened); "Add evidence…" disabled with its reason; the gap register and the ledgers folded. Built for 390 first |
| `pov.html` | **The POV with §7e's polish:** one-sentence falsifier, money formatted ($3,413.1 million), plain stage labels, the lever "ratified by Brad Piver (steward), 19 Oct 2026", every locked run with its hash, the outside-in-test banner (needs UX-1-D3's enum), the frozen sentence |

**Standards the mock-ups propose** (not written anywhere today, 7a; **Brad ratifies or
changes**):
1. **One filled button per screen,** ink with offwhite text and a gold arrow: the next
   step's action. Every other action is outlined. A disabled action is grey and always
   has its reason directly under it.
2. **The six-step path:**
   - one step open at a time (the first not done);
   - a done step is one line plus "Show ▸";
   - a waiting step is one line saying what it waits for.
   The rail on the left (a strip at 390) shows where you are.
3. **Path order is guidance, not a new gate.** Steps the server allows out of order
   (summary, run) keep a secondary link. No governance rule is added or removed.
4. **Plain labels for the spine:** Baseline set · Capability attached · Value modelled ·
   Target committed · Actual measured · Verified · Returned to the record. The enum
   keeps its values.
5. **Confidence is always "n / 100" with its band,** in one form on every page.
6. **At 390:** a "Menu" button replaces the nav and actor line, and tables become stacked
   rows.

**Not mocked:** the Packs and Runs index pages (reference views, unchanged in role);
sign-in.

### 7g. Mock-up review, the standards ratified, and the build in slices (19 Oct 2026)

**The review (Brad's reviewer), all fixed in `design/mockups/`; screenshots refreshed:**
1. **Curia is a reference example.** Accounts home now shows Curia marked a published
   case study, and book confidence says **"No live customer engagements"**, not a
   number. **The server doesn't do this yet** (see Q4n below).
2. **Each account row lists its engagements, with the latest locked run of each:**
   Curia's live engagement is run 1 at 10 / 100, its retired reference engagement run 21
   at 55 / 100.
3. **Record values only.** The capability is "EHS solution". The metric, unit, entity,
   facts and falsifier conditions are the record's own words, and anything else is in
   brackets.
   - **The falsifier's double period is explained:** the metric's unit is stored as
     "recordable incidents per 200,000 hours worked." (ending in a period). Slice 3
     strips trailing punctuation when composing the sentence, in both
     `falsifierSentence` and `previewFalsifier`.
4. **"65 points outstanding" is removed.**
5. **Low confidence is neutral (ink-70),** not critical red. It isn't amber either:
   amber already means UNVERIFIED and can't be told apart from Medium's gold-ink at
   badge size.
6. **Internal terms are removed** ("W9", "§7e", "cohort", "customer zero").
7. **Every stage bar has a legend:** Done · Furthest reached · Not reached.
8. **At 390 the step strip is dropped;** the numbered steps are the path.
- **A retired run's page** shows one line, "Locked, and its engagement retired: no
  evidence is added to this run", in place of a disabled "Add evidence…".

**Ratified into `DESIGN_SPEC.md` §9, "UX-1 standards"** (Brad, 19 Oct 2026): §7f's 1–5,
Brad's 6 (no internal terms) and 7 (stage-bar legends), plus record-values-only and the
390 rules. **UX-1-D2 is applied:** §9's refusal rule now covers `LVRF:` sentences
verbatim and raw database text as plain sentences.

**Q4n, before the UX-1 build: book confidence leaves out reference examples (O-D3).** *(Approved 19 Oct 2026; **deployed 19 Oct 2026 (`c04dd21`), Gate C clean; Curia marked.**)*
- **The gap:** `server/routes/cohort.ts` leaves out the tenant's own account and retired
  engagements, but **not** accounts with a current reference-example marker. So marking
  Curia alone wouldn't change book confidence: its live engagement (run 1, 10 / 100)
  would still set it.
- **The change:** the cohort query skips any institution with a current marker. The
  read gains `reference_example_count`, so "No live customer engagements" can say why.
  The server change is read-only (no migration, no trigger). The value-spine stage it
  serves is **verify**: what the book claims.
- **Gate A:**
  - an extended `verify_cohort`: a marked account isn't counted; unmarking it counts it
    again; and the "no live engagements" state;
  - the accounts page's book card shows the new state;
  - deliberate break: the filter removed → the marked account sets the book again.
- **Brad's act on prod, after the deploy:** mark Curia a published case study (the
  steward's act, with its citation). Only then does prod read "No live customer
  engagements".

**The UX-1 build, in slices.** Every slice:
- has its own Gate A (verify scripts with deliberate breaks, browser walks with
  screenshots compared against the mock-up, regression, prod-copy equivalence), Gate B
  and Gate C;
- changes presentation only;
- **keeps every `data-testid` the verify scripts select by**, or changes the script in
  the same commit;
- adds no table, no heartbeat and no governance rule;
- serves the stages its screen already serves.

| Slice | What | Notes |
|---|---|---|
| **1. Account workspace** (first; **deployed 19 Oct 2026, `c098b20`; Gate C clean**) | The six-step path on `/accounts/:id`. Steps reuse today's components: AccountResearch → 1; OutsideInWalk W1–W6 → 2; PovAuthoring's hypothesis → 3, summary → 4; W7/W8 (produce, lock, the run list) → 5; the POV link → 6. **Step status is derived** from the reads the page already makes (entity pinned, walk steps, hypotheses, summaries, runs), so there is no new table. The rest moves into "Account detail" (facts, pack, measuring, gap, engagements, marker, retirement). The primary-button variant and the fold/open step are added to the existing component library (`components/workbench/`, §0b: no second library) | The largest slice. `verify_outside_in_walk`, `verify_walk_runs`, `verify_account_research`, `verify_value_hypotheses` and `verify_account_workbench` walk this page; their selectors must still find every form. The new `verify_workspace_path.sh` walks the three mock-up states (new, mid-walk, locked) at 1280 and 390, with breaks (two steps open at once; a disabled action without its reason) |
| **2. Accounts home and the header** (**built 19 Oct 2026, Gate A passed; screenshots approved for deploy, 19 Oct 2026**) | Rows as real links (keyboard-reachable), each engagement's latest locked run, "where it stands" from slice 1's derivation, "New account…" behind a button; the 390 "Menu" header on every page. **From the slice 1 review (Brad, 19 Oct 2026): the marker banner clips a long citation.** Curia's source citation ends in an unbroken URL that can't wrap at about 1280 px and below; wider windows wrap it fully. Fix: `overflow-wrap: anywhere` on the marker banner in both the workspace and the POV, plus a long-citation case (an unbroken URL) in `verify_workspace_path` asserting the banner doesn't overflow at 1280 and 390. Folded into slice 2: no separate fix | The accounts read gains each engagement's latest locked run (read-only) |
| **3. The POV** | §7e 1–4: one-sentence falsifier with trailing punctuation stripped; money formatted; plain stage labels with the legend; the lever "ratified by <steward>, <date>". Plus §7e 5–6 (done: Q4m, D3), the record hash label, the 390 layout | The falsifier template changes in server and client together. `verify_value_hypotheses` checks they are identical, so it is updated in the same commit. Print QA: print to PDF and look at every page (CLAUDE.md) |
| **4. The run page** | Breadcrumb to its step; the stage strip with legend at 390; the evidence form folded behind "Add evidence…"; the retired line; ledgers folded | The run page is a printed record too: banners and hash on every printed page |
| **5. The copy pass and the index pages** | No internal terms anywhere (standard 6); Packs and Runs indexes at 390 (the Runs table scrolled sideways at 788 px). **From the slice 1 review (Brad, 19 Oct 2026):** (1) a waiting step's line never starts "Next:" while another step carries NEXT (Curia's step 2 read "Next: record evidence for the baseline."): use "Then: …" or "Waits for …"; (2) the research step's internal terms: "(3.0 item 3)", the A1–A5 codes, "Phase: ENTITY FIRST" in capitals; (3) the marker banner's "Source:" when the citation only repeats the kind (Scotts' "Source: Reference example"). **From the slice 2 review (Brad, 19 Oct 2026):** (4) the Book confidence card's non-empty state still uses the old wording ("NO SCORE · UNMEASURED FLOOR", "Set by the weakest member…", "0 of 1 engagements across 1 account have a run of record", "1 unclassified account is in the book but under no industry"); bring it into the UX-1 standards. No separate deploy | A grep-based check for step codes and decision ids in client strings, so a new one fails Gate A |

**After UX-1:** L32 (rename the lever's stored status so storage and display agree).
