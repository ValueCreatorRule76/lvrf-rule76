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
| L27 | **npm vulnerabilities**: at the O1 deploy (12 Oct 2026) the client build reported 7 (5 high) and the server 4 (moderate) | reported by Brad, 12 Oct 2026 | Triage alongside L25, not now: `npm audit` per package, which are reachable in production (a build-time-only dependency is not the API), and a fix per package with its own Gate A. **Never `npm audit fix --force`** (CLAUDE.md rule 7). **1 Nov 2026, the root audit is 6 (5 moderate, 1 high), no dependency changed, no action (Brad):** the 4 `drizzle-kit` chain, then `body-parser` 2.3.0, GHSA-27r3-jxmh-p828, high, published 23 Oct, then `qs` 6.16.0, GHSA-6pq8-jhm2-2vcw, moderate, published 27 Oct 16:10 UTC, after C3's Gate B; that is the one that took the count from 5 to 6. `qs`: only `stringify` with `arrayFormat: 'comma'`, used neither by LVRF nor by `express`' or `body-parser`'s library files. `body-parser`: a compressed body with trailing bytes can crash the process; `express.json()` runs on every request before the origin check and sign-in, with no `uncaughtException` handler, so it is in the path, and behind Caddy's `basic_auth` only. A crude local test did not reproduce the crash, which clears nothing. **Fix `body-parser` (2.4.0, or `inflate: false`), with its own Gate A, before P4 removes or loosens `basic_auth`**. **19 Nov 2026 (Brad's ruling): plain `npm audit fix`, `body-parser` 2.4.0 and `qs` 6.17.1; the root audit 6 → 4, `drizzle-kit`'s four left (`--force` only); the ops change, `BUILD_STATUS.md`, "Ops: the deploy script's silent stop fixed"**. **Deployed at `4e5c13b`, Gate C clean (19 Nov 2026): `body-parser` 2.4.0 and `qs` 6.17.1 on the box; `drizzle-kit`'s four remain** (`BUILD_STATUS.md`, "Ops change closed") |
| L28 | **`engagements.value_stage` is stale**: no route advances it (the outcome routes advance `value_outcomes.value_stage`), so the stored column says `baseline` on engagements whose outcomes are verified. O2's POV already derives the stage reached (the furthest of the engagement and its current outcomes) and does not read the column alone | found in O2's Gate A, 12 Oct 2026 | **Proposal, to decide later (not in O2):** compute it, not store it. A function `lvrf_engagement_stage(engagements)` (the POV's derivation, in one place), every reader calling it, and the column dropped, or kept only as a frozen historical value, once nothing reads it. Before deciding: list every reader of the column (the runs list, the cohort, `walkSpine`'s `terminal_value_stage`) |
| L29 | **Raw Postgres text reaches people** (widened 12 Oct 2026, Brad's W6: "new row for relation 'evidence' violates check constraint 'evidence_ai_verify_requires_resolution'" when Source verified = Yes on AI-sourced evidence). **Planned as Q4k below.** Originally: raw Postgres text in 500 answers: the W1 fix maps unique violations to plain words in the shared refusal handler, but each route's 500 fallback (`err instanceof Error ? err.message`) can still echo Postgres's own text, constraint names included, for other errors (a foreign-key or not-null violation) | found in the W1 fix, 12 Oct 2026 | One central mapping in the same place (`server/lib/refusal.ts`): Postgres errors other than check and unique violations become "That could not be written; nothing was saved." with the raw text in the server log only. Its own Gate A: grep for every 500 fallback, and a deliberate foreign-key violation per route class |
| L30 | **The plain duplicate-person message can confirm that an email exists in another tenant.** "\<email\> is already in LVRF; select them instead" is right when the person is in the caller's tenant, but `persons_email_key` is unique across ALL persons, so it also answers for another tenant's person (or customer contact) | Brad, 12 Oct 2026 | **Must be fixed before anyone outside Brad's tenant gets access.** Say "select them" only when the existing person is in the caller's tenant (their staff, or a person of one of their accounts); otherwise a neutral refusal ("That email cannot be used here; nothing was written."). **Note:** any refusal, however worded, still tells the caller *something* holds that email while email is globally unique. Closing that fully needs email unique per tenant, not globally (a migration that changes `persons_email_key`), which is a decision for then |
| L31 | **Deployed 19 Oct 2026 (`3a1165e`); Gate C clean.** **The API keeps no request log.** `server/index.ts` logs only its start line, and `respondServerError` logs a 5xx's raw text; a 2xx, 4xx or a request that never arrives leaves nothing in `journalctl -u lvrf-api`. The Scotts hypothesis attempt (13 Oct 2026) could not be traced from the box: no request was ever sent, and the journal could not say so | Brad, 18 Oct 2026 (journalctl since 03:36 UTC returned nothing for hypothes\|POST\|refus\|error) | A minimal request log, one line per `/api/*` request: method, the route **pattern** (not the raw path, which can carry ids), status and duration in ms. **No bodies, no query strings, no cookies, no headers, no actor email.** Written to stdout for journald, after `res` finishes. Its own small item with a Gate A (a verify that the line appears for a 201, 409, 422 and 500, and that a password POST to `/api/auth/login` logs no body). Not mixed into UX-1 |
| L32 | **A lever's stored status says `proposed` while it displays "ratified"** (O-D2a). Under O-D2 the steward's proposal is the ratification, so the stored value should say so | Brad's reviewer, 19 Oct 2026 | Queued: rename the stored status so storage and display agree. It is its own item, after UX-1. **Before the migration:** it changes `value_levers.status` for every current lever (`lifecycle_status` is shared with other tables, so the likely change is a lever-specific value or column, not an enum rename), and it can orphan any code or CHECK reading `status = 'proposed'` on levers (`value_levers_retirement_is_complete`, the pack page, the POV). Grep both first |
| L33 | **Your own company's account (Skillsoft) still uses the old record view.** UX-1 slice 1 gives every customer account the six-step workspace. The tenant's own account isn't an account to work (no walk, no research, no POV), so `InstitutionPage` keeps the plain cards for it: numbered sections, intake vs classification, the pack, measuring, the gap, engagements | Brad's reviewer, 19 Oct 2026 (slice 1 review) | Decide its own layout in a later slice: likely the record view in slice 1's visual language (header, confidence badge, folded detail) without the path. Presentation only |
| L34 | **The Accounts home makes up to four reads per account** (`/view`, `/walk`, `/pov`, `/research`) to say where each stands, through the workspace's own derivations (`client/src/lib/workspaceStatus.ts`) | UX-1 slice 2, 19 Oct 2026 | Fine at today's handful of accounts. A list of dozens or hundreds wants one read-only summary route that returns each row's inputs. It must keep **one** implementation of the six-step rule: the route returns the inputs, and the client derives from them; the rule is not rewritten on the server |
| L35 | **Evidence added before its figure exists gets no figure check.** Outcome evidence is checked against the outcome's figure for what it supports (baseline, actual, impact basis) when the evidence is added (P1, `outcomeEvidence.ts`). Evidence for the actual is usually added before the actual is measured, so there is nothing to compare and no `figure_checks` row; when the actual is later recorded (`outcomeWalk.ts`, measure), nothing checks it against that evidence. A statement still records "not checkable" either way | P1 build, 25 Oct 2026 (Brad: record it, assigned to P3) | **Assigned to P3.** When a figure is recorded (measure; and a commitment's target, if P3 checks targets), check it against every quote or locator evidence already supporting it, recorded as a new `figure_checks` row, and feed the result to the verification state P3 introduces. Until then the actual's evidence shows no figure check, which is accurate: none was run |
| L36 | **A vendor publication about another company, linked as `impact_basis`, must earn no confidence credit in any factor.** C1 restricts it to the impact basis (trigger `value_outcome_evidence_vendor_impact_only`), but the model still grades it there: in `computeConfidence` factor 4, when a currency figure is claimed, a source-verified `vendor_publication` linked as `impact_basis` with a stated basis earns half the factor (5 of 10, "self-declared as inference"); with no currency figure the factor is full regardless of evidence, so it earns nothing today. Factors 2 and 3 can no longer see it (it supports neither the baseline nor the actual) | C1 review, 25 Oct 2026 (Brad: "with the correction applied" accepted; record this) | **A CONFIDENCE_MODEL ruling, for later; no change in C1.** When ruled: `evidenceCredit` (or factor 4) gives 0 to a `vendor_publication` about a non-tenant account, with its own note; it is a model change, so MODEL_VERSION is bumped and the fingerprint changes, and runs sealed under 1.0.0 keep their scores. C1's erratum recompute runs under the sealed model, so errata recorded before the change are unaffected |
| L37 | **A stored document of record does not name errata recorded after it.** Run 2's record document v1 (rendered 25 Oct 2026 11:20) holds the sealed payload and its hash; its erratum was recorded at 11:28, and nothing in the document row points to it. The printed run page carries the erratum on every page; the stored document does not | C1 Gate C, 25 Oct 2026 (Brad: record it, direction ruled) | **Direction ruled by Brad (25 Oct 2026):** a stored document of record is **never changed**. Wherever it is shown or retrieved, the run's **current errata appear beside it**, labelled "Erratum recorded after this document was rendered". **Any render after an erratum includes it.** **Build later, alongside `record_documents`' ratification** (the Repository Constitution) |
| L38 | **A value that drops a qualifier the quote has passes the figure check.** The quote "We had approximately 4,200 employees" and the value 4,200 read **pass**: rules v1 (`server/lib/figureCheck.ts`) flag a qualifier that is in the value but not the quote, never one that is in the quote but not the value. Dropping any of v1's eight qualifiers (approximately, up to, at least, estimated, adjusted, excluding, including, over) turns a qualified figure into an exact-looking one | P2 Gate A screenshots, 25 Oct 2026 (Brad: record it) | **For figure-check rules v2.** Flag a qualifier in the quote that the value drops, as a wording flag naming it ("the quote says approximately; the value does not"), flagged, not blocked. A rules-version change: existing `figure_checks` rows keep the rules version they ran under, and a re-check is a new row |
| L39 | **`verify_corrections` (and any script that breaks on C1-applied data) depends on prod's state.** It reads Scotts' vendor link as `baseline`, then corrects it and records the errata itself, so it can run only on a prod copy taken before Brad's C1 acts (25 Oct 2026). The P2 Gate A regression therefore ran on the older copy (`lvrf-pre-ux1s2-…`, 19 Oct), restored for it, with the fresh one (`lvrf-pre-p2-…`) kept beside it | P2 review, 25 Oct 2026 (Brad: record it; fix right after P2) | **Right after P2:** each such script builds its own fixture links and errata on its clone and asserts on those, never on what prod happens to hold. Then the full regression runs on the fresh copy, and the older dump is removed once no script needs it (the retention rule: the latest prod dump plus the six pre-migration backups) **Built 25 Oct 2026 (Gate A):** only `verify_corrections` broke on the fresh copy (38 of 39 passed). It now builds Scotts' shape on its own fixture account and passes there (200/0); the POV's correction note is shown on any corrected link, not only vendor claims (Brad, 25 Oct 2026). The older dump is removed at Brad's word, after deploy |
| L40 | **The client bundle crossed Vite's 500 KB warning at P2:** `index-C-Tu7UkD.js` is 510.27 kB minified (136.39 kB gzipped), and the build prints "Some chunks are larger than 500 kB after minification" | P2 deploy, 25 Oct 2026 (Brad: record it) | **A later slice:** split by route (`React.lazy` per page: the run page, the POV, packs, lineage), so the Accounts home loads only what it shows. Check that the print stylesheet and every printed page still render (each split page prints as it does today), that the request log keeps its patterns, and that no route's first paint changes. Presentation and loading only; no record changes |
| ~~L41~~ **DONE 1 Nov 2026 (`930c8f7`)** | **Evidence rows are not immutable after insert.** `lvrf_app` holds UPDATE on every column of `evidence`. The triggers make final only: the form, quote, locator and how-read (`evidence_form_final`); a resolved citation (`evidence_resolution_is_final`); AI-sourced, which stays so; a supersession, once, to a newer row; and no simulated attester. `kind`, `summary`, `provenance`, `source_verified`, `attested_by_person_id`, `attested_at`, `simulated` and the rest can change, audited but unguarded. On the prod copy, 4 updates in all: 2 citations opened (12 Oct) and 2 rows set `simulated` (23 Aug, no actor) | C2 dry run, 25 Oct 2026 (Brad: report and record) | **Open, for Brad's ruling:** which columns become final after insert (at least the ones a sealed run's recompute matches on: `kind`, `summary`, `provenance`, and the attester), by a trigger as `evidence_form_final` does |
| ~~L42~~ **DONE 1 Nov 2026 (`930c8f7`)** | **New runs must seal what a later recompute needs: each attested item's attester (name and scope) and the model version and fingerprint.** C2's dry run (25 Oct 2026) found Curia runs 13–16 sealed with no model version, and runs 17–21 sealed without the attester of their attested baseline item, so C1's recompute cannot reproduce any of the 9; their C2 errata are recorded not recomputed | C2 dry run, 25 Oct 2026 (Brad: record it) | **Open:** produce-run seals the attester (name, scope, simulated) beside each attested item, and every run seals `modelVersion` and `modelFingerprint` (runs since 1.0.0 already do), so every future run is recomputable; a payload change, so it needs its own ruling on the hash and on old runs |
| L43 | **The account page's walk shows one engagement, the latest with an outcome, and only that engagement's last outcome; every per-engagement control for any other engagement or outcome is hidden** (C2b survey, read-only, 26 Oct 2026). Hidden, with where else each exists: W5 the metric's pack basis (nowhere else); W6 its evidence list (the POV shows it, read-only), add evidence (the run page, through a run of that outcome on a live engagement only), record an opened citation (nowhere else), correct what a link supports (the run page since C2b, for an outcome with a locked run only); W7 produce a run (nowhere else) and the run list (the runs list and the POV show it); W8 lock a run (nowhere else); W9 retire the engagement (nowhere else). Found when Curia's commitment attestation, on its retired reference engagement, could not be corrected: the walk shows the later lot-acceptance engagement. Commit, measure and verify have no client control at all (route only) | C2 Gate B, 26 Oct 2026 (Brad: list and record for slice 5) | **Slice 5:** the walk chooses its engagement and outcome (or lists every engagement), so no per-engagement act is reachable only through the latest |
| L44 | **The walk's NEXT/DONE step tags look like buttons** (Brad, 26 Oct 2026, on Curia's account page) | C2 Gate B, 26 Oct 2026 (Brad: note for slice 5) | **Slice 5:** the tags read as state, not as controls |
| L45 | **The Runs list gives no sign that a run carries an erratum** (Brad, 26 Oct 2026, after recording Curia's 9) | C2 Gate C, 26 Oct 2026 (Brad: note for slice 5) | **Slice 5:** a marker beside the score on any run with a current erratum |
| ~~L46~~ **DONE 1 Nov 2026** | **Curia's reference-example marker reads `published_case_study`; it may be `outside_in_test`** (Brad, 27 Oct 2026, C3b condition 4) | C3b approval, 27 Oct 2026 | Brad corrected it to `outside_in_test` through the UI, 1 Nov 2026 (three supersessions: L50) |
| ~~L47~~ **DONE 1 Nov 2026 (`930c8f7`)** | **A customer-side role's source has to be linked to an outcome to exist** (Brad, 27 Oct 2026, from C3's fixture screens). The grant route and its guard require only evidence of the account (non-simulated, with provenance); neither needs an outcome link. But no route records account evidence without one: evidence is created only through `POST /api/value-outcomes/:outcomeId/evidence` (with a `supports`) or with a fact. So C3's and C3b's fixtures link the org chart as an outcome's impact basis, and on prod a steward naming a role would have to do the same, sealing it in the next run as outcome support | C3b Gate A, 27 Oct 2026 | **Ruled (Brad, 27 Oct 2026): built in the L41 + L42 slice (§13), as a prerequisite of §14.** Account evidence is born with the "about" field, the quote/locator form, and `source_verified` set only by an opened-the-source act. **HOLD: no customer-side role is granted on prod until L47 ships.** The fixtures then use it |
| L48 | **Curia lot acceptance: W6 stays open, and the hypothesis waits** (Brad, 1 Nov 2026). The 95.3% is an ISPE industry median, not Curia evidence | Brad, 1 Nov 2026 | **Open; ruled in §17.** The hypothesis follows a LAR lever, which Brad authors once a citation for the deviation-to-rejection mechanism is found and opened |
| L49 | **A lever's citation records no opening.** `value_levers.citation` is required text. Nothing records that anyone opened the source, who, or what they read, so the opening L48 asks for would not be on the record | §17, 1 Nov 2026 | **Open (Brad, 1 Nov 2026): a lever's citation becomes a reference to an evidence row, not free text.** Until then, the LAR lever's citation names an opened evidence row (§17). A schema change on `value_levers`, in a slice of its own; the 1 lever on prod needs a rule before the column changes |
| ~~L50~~ **DONE 5 Nov 2026 (`d26c1ef`)** | **A marker correction that changes nothing is accepted.** The form pre-fills the current kind, and the route takes a supersession with the same kind, citation and note. Curia's three on 1 Nov 2026: 01:39 kind unchanged, 02:42 to `outside_in_test`, 12:31 unchanged. Scotts' on 19 Oct did the same. Each is a permanent row with its act | L41 growth accounting, 1 Nov 2026 | **Built 1 Nov 2026, Gate A passed, not deployed; goes to Gate B with §18:** the route and the marker guard refuse it, and the form leaves the kind unchosen (BUILD_STATUS). The earlier rows stay on the record |
| ~~L52~~ **DONE 5 Nov 2026 (B1, Gate C clean at `bd5cb7c`; the hold on role grants lifted)** | **Five recorded acts from L41's Gate B read differently from what was reported or reasoned** (Gate C, 1 Nov 2026). **About:** `cee6fea9`, `f9775317` (Skillsoft's earnings release) read about Curia, and `423be7c6` ("a vendor publication about another company") reads about Scotts, while the batch's reason calls them Skillsoft's filings and a story about another company. **Openings:** `9765335f`, `271a449a` were opened No: unverified, with no reading, while Brad's note read "opened with the release's quote / withdrawn", unresolved. The batch has no default on these rows and the opening has none on Yes or No, so each was a selection in the form. All are final | L41 Gate C | **Open, ruled in §18:** `cee6fea9` and `f9775317` to be superseded about Skillsoft, `423be7c6` about the company in the story, once Brad opens it. **HOLD: no customer-side role is granted on prod until L52 closes.** The correction is the steward's supersession of the row (L41-D2). No sealed run is touched. `cee6fea9` and `f9775317` have no current link. `423be7c6` keeps its current impact-basis link on Scotts' frozen outcome, where impact basis takes evidence about anyone, so its about line is wrong but no guard is bypassed. A row about Curia could later be linked as Curia's baseline, which is why the two Curia rows matter |
| ~~L53~~ **DONE 5 Nov 2026 (B2, deployed at `bdf9971`; Gate C clean)** | **The next fresh prod copy breaks tests written for the pre-batch state.** `verify_evidence_final` and the fixtures around it assume 34 rows with no about and 4 verified unopened, as L39 and the C3 errata did. An opening recorded No also records no reason: the act's `reason` is empty | L41 Gate C, 1 Nov 2026 | **Relative (BUILD_STATUS, B2 Gate A):** `verify_evidence_final`, `verify_supersession`, `verify_evidence_form` and `verify_acts_lineage` read which state the copy holds and check that state, and pass on the 5 Nov copy. The No reason was built in §18 (B1) |
| L54 | **A reviewed research result's note can still be updated, and two Utilities entries carry the wrong one.** `research_results.review_note` is also the `reason` of the accept act, but nothing makes it final once reviewed: an UPDATE would put new words under the old act and restamp `reviewed_at`. On prod, `dda6e919` CAIDI's accepted result `e9360c7a` carries SAIDI's note, and `51c360c9` Net heat rate's result `8cb6523a` carries the non-capacity SSO note ("Wastewater utilities only…"). Nothing rests on either: no lever, no capability claim | Utilities pack review, 5 Nov 2026 | **3.1, one migration (Brad, 5 Nov 2026; the scope freeze holds):** (a) a reviewed result becomes final, its note insert-only; (b) "Correct the reviewer's note", a steward act: an append-only correction row (the result, the new note, the note it replaces, frozen, the reason, who, when) with its own `correct` act, the accept act untouched, and the pack page showing the current note with the accepted reading beside it. Not editing in place (a silent rewrite of the act), not a successor result (no prompt produced it), not retire and re-propose (a different entry). **The corrected notes, for Brad's act when it ships:** CAIDI: "Isolates restoration speed, the clearest workforce lever on reliability. Never read it alone: it can rise when SAIFI improves. The CPUC 570-minute benchmark is from a slide and is unverified." Net heat rate: "Thermal-generation utilities only. No source supports the operator-controllable share of heat rate, so no lever until a primary source (e.g. an EPRI heat-rate guideline) is opened. Weakest fit with the offering." **Until then neither entry is used for M21** (checklist stage 0) |
| L51 | **The four real rows reach neither the POV nor W6.** The POV draws an outcome's evidence only under a hypothesis (`PovPage`), and neither Skillsoft nor Curia has one. Skillsoft is the tenant's own account, so it has no walk. Curia's walk shows lot acceptance (L43). The evidence card, the lineage and each run's seal do show them. W6's withdrawn list also carries no "verified without…" line, where the POV's does | L41 Gate A, 1 Nov 2026 | Open: decide with slice 5 whether the POV lists evidence with no hypothesis. A checked gap, not a fault in L41 |

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
| M1 (C2-D1) | **Every model version's scorer is kept.** A sealed run can always be recomputed under the model it was sealed with, whatever version is current, as design Q11 (24 Oct 2026) keeps each output-rules version's renderer so a sealed case reproduces exactly. A new `MODEL_VERSION` **adds** a scorer beside the old ones; it never replaces one. C1's erratum recompute (`server/lib/recomputeRun.ts`) then selects the scorer by the run's sealed version and fingerprint, instead of refusing a run sealed under another model. Standing principle, not a one-off | Brad Piver, 25 Oct 2026 |
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
| R4-3.0 | **3.0 ratified (revision 4)** against the scope shipped through `cd38210`, on the critical path's "ready to run an engagement". Q1 (doctrine source) carried open to 3.1; `record_documents` provisional, shared outside Skillsoft only through the D-M21 act; the draft's test is the acceptance test of the first 2027 engagement, not claimed as passed; D9 closed for outside-in runs by the banners, open for a `claimed` run on a real engagement; D10 settled by O-D5 (no WeasyPrint) | Brad Piver, 15 Nov 2026 |
| R5-3.1a | **A hypothesis is sealed with every run:** produce refuses an outcome with no current hypothesis, in the route and the database; sealed runs unchanged, no forced re-run; the tenant's own account gets a hypothesis path first | Brad Piver, 15 Nov 2026 |
| R5-3.1b | **One Rule76 family with CVAF** (CVAF's `docs/RULE76_DESIGN_SYSTEM.md` the reference; tokens still cited from `CLAUDE.md`; disagreements named) | Brad Piver, 15 Nov 2026 |
| R5-3.1c | **In-app AI research with Rule76's API key**, research only; the strongest generally available model, its retention (≥ 30 days) disclosed; per-account clearance, caps and audit rows on CVAF's P1–P4; results `ai_sourced` and accepted field by field. **Reverses D1 and the 5 Nov offline-only ruling.** Spend: Rule76's Console organisation, an LVRF workspace whose spend limit equals Brad's Claude Pro fee a month, prepaid credits, auto-reload off | Brad Piver, 15 Nov 2026 |
| R5-3.1d | **The War Room and an account frame** over the flat routes. **Reverses the design's §4 navigation decision.** No money summed across accounts; mock-ups first | Brad Piver, 15 Nov 2026 |
| R5-3.1e | **A solution catalog page** (steward acts); value-case links with both lenses everywhere; "one point" for percentage asks; the 3.1 build order in the critical path | Brad Piver, 15 Nov 2026 |

### Open: blocks the next item (Band A)

None. D3–D6 were decided on 11 October 2026 (above).

### Open: everything else

| # | Decision | Options | Blocks |
|---|---|---|---|
| D9 | Must a run locked at `claimed` state that it is a hypothesis? (L18) **Closed for outside-in runs (R4-3.0, 15 Nov 2026); open for a `claimed` run on a real engagement.** | require the statement; or low confidence suffices | nothing urgent |
| D10 | WeasyPrint on the VPS, or rendering stays on the Mac **Settled by O-D5 (browser print; R4-3.0, 15 Nov 2026).** | — | 3.0 item 15 |
| D11 (rest) | 3.0 draft Q1 (Rule76 doctrine source) and Q7 (`record_documents` provisional). Q5 (AMENDMENT-004 drift) is fixed by the hygiene batch's L21; Q6 decided (no amendment) **Ruled at ratification (R4-3.0, 15 Nov 2026): Q1 carried open; Q7 restated.** | see the draft | ratification only |
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
     never in `/srv/lvrf/.env`, under the key **`MIGRATE_DATABASE_URL=`**. The migrate paste line is
     `DATABASE_URL="$(grep '^MIGRATE_DATABASE_URL=' ~/.lvrf_migrate.env | cut -d= -f2-)" npx drizzle-kit migrate`.
     (Corrected 15 Nov 2026, B4 findings lens Gate B: this line read `'^DATABASE_URL='`, a key the file does not
     hold, so the paste passed an empty URL and the migrate failed closed with nothing applied.)
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
| **2. Accounts home and the header** (**deployed 19 Oct 2026, `feb539f`; Gate C clean**) | Rows as real links (keyboard-reachable), each engagement's latest locked run, "where it stands" from slice 1's derivation, "New account…" behind a button; the 390 "Menu" header on every page. **From the slice 1 review (Brad, 19 Oct 2026): the marker banner clips a long citation.** Curia's source citation ends in an unbroken URL that can't wrap at about 1280 px and below; wider windows wrap it fully. Fix: `overflow-wrap: anywhere` on the marker banner in both the workspace and the POV, plus a long-citation case (an unbroken URL) in `verify_workspace_path` asserting the banner doesn't overflow at 1280 and 390. Folded into slice 2: no separate fix | The accounts read gains each engagement's latest locked run (read-only) |
| **3. The POV** | §7e 1–4: one-sentence falsifier with trailing punctuation stripped; money formatted; plain stage labels with the legend; the lever "ratified by <steward>, <date>". Plus §7e 5–6 (done: Q4m, D3), the record hash label, the 390 layout | The falsifier template changes in server and client together. `verify_value_hypotheses` checks they are identical, so it is updated in the same commit. Print QA: print to PDF and look at every page (CLAUDE.md) |
| **4. The run page** | Breadcrumb to its step; the stage strip with legend at 390; the evidence form folded behind "Add evidence…"; the retired line; ledgers folded | The run page is a printed record too: banners and hash on every printed page |
| **5. The copy pass and the index pages** | No internal terms anywhere (standard 6); Packs and Runs indexes at 390 (the Runs table scrolled sideways at 788 px). **From the slice 1 review (Brad, 19 Oct 2026):** (1) a waiting step's line never starts "Next:" while another step carries NEXT (Curia's step 2 read "Next: record evidence for the baseline."): use "Then: …" or "Waits for …"; (2) the research step's internal terms: "(3.0 item 3)", the A1–A5 codes, "Phase: ENTITY FIRST" in capitals; (3) the marker banner's "Source:" when the citation only repeats the kind (Scotts' "Source: Reference example"). **From the slice 2 review (Brad, 19 Oct 2026):** (4) the Book confidence card's non-empty state still uses the old wording ("NO SCORE · UNMEASURED FLOOR", "Set by the weakest member…", "0 of 1 engagements across 1 account have a run of record", "1 unclassified account is in the book but under no industry"); bring it into the UX-1 standards. No separate deploy | A grep-based check for step codes and decision ids in client strings, so a new one fails Gate A |

**After UX-1:** L32 (rename the lever's stored status so storage and display agree).

---

## 8. P1: the evidence form and the figure check (planned 24 Oct 2026; **approved by Brad, 24 Oct 2026, with P1-D1–D6 as recommended**)

**From the ratified design** `docs/LVRF_DESIGN_PACKS_ADMIN_VALUE_CASE.md` (f162f9e), §2.1,
§5.1 and §7 P1. The smallest governed slice: it makes every new piece of evidence say
**what it rests on** (quoted words, a located cell, or a person's own statement) and **how
the value was read from it**, and it checks every figure against its quote or locator.

**Value spine stages served:** `baseline` (account facts and outcome baselines) and
`measure` (outcome actuals). It changes no stage's gate yet: the verification state that
reads the figure check is P3.

**Runs after:** UX-1 slice 3 deployed (Gate B pending) and UX-1 slice 4 (P1-D2).

### What exists (read 24 Oct 2026)

- **Eight places write `evidence`.** Two carry a source:
  - `server/lib/institutionFactWriter.ts` (typed facts, and researched facts on accept);
  - `server/routes/outcomeEvidence.ts` (evidence for an outcome's baseline, actual or impact basis).

  Six record **a person's act**, as `observation` or `attestation` with no source:
  - `classifyInstitution.ts`, `engagementRetire.ts`, `metricPackBasis.ts`,
    `offeringAttachment.ts`, `validateMetric.ts`;
  - `outcomeWalk.ts` (the commitment and the verification attestations).
- **Researched facts already carry a quote.** The `institution_fact` contract (v1) requires
  `quote` ("the sentence the figure comes from"). On accept it is folded into the evidence
  `summary` as prose (`accountResearch.ts` line 656), where nothing can check it.
- **Evidence is never edited.** The only `UPDATE evidence` is `open-citation`
  (`evidenceCitation.ts`). Corrections happen by superseding the **fact**, which writes a new
  evidence row.
- **`AddEvidenceCard`** (`client/src/components/workbench/`) is the one evidence form; UX-1
  slice 4 folds it behind "Add evidence…".

### What it builds

**1. Migration 0039 (`evidence_form`).** It changes `evidence` and adds `figure_checks`. It
orphans nothing: no FK is dropped, no row is deleted, every existing row is backfilled.
- **Enum `evidence_form`:** `quote` · `locator` · `statement` · `legacy`.
- **`evidence.evidence_form`:** added nullable, every existing row backfilled to `legacy`,
  then set NOT NULL. A trigger refuses `legacy` on INSERT, so only rows that existed before
  0039 can ever carry it.
- **`evidence.quote_text`, `evidence.locator` (jsonb), `evidence.how_read`.**
- **CHECK `evidence_form_shape`**, one rule per form:
  - `quote`: `quote_text` present and at most 40 words; `locator` absent;
  - `locator`: `locator` present, with keys `document`, `value` and `scale` (`units` ·
    `thousands` · `millions` · `billions` · `percent`), and optional `table`, `row`,
    `column`; `quote_text` absent;
  - `statement`: both absent, and `kind` is `observation` or `attestation`;
  - `legacy`: both absent.
- **CHECK `evidence_how_read`:** for `quote` and `locator`, `how_read` is at least 24
  characters. The ratified rationale rule: say how the value was read, not restate the source.
- **Trigger `lvrf_evidence_form_final`:** `evidence_form`, `quote_text`, `locator` and
  `how_read` never change after INSERT. The same discipline as `evidence_resolution_is_final`.
- **The form is kept through a correction.** A trigger on `institution_facts` checks the
  case where a fact is superseded and its old evidence was `quote` or `locator`: the
  successor's evidence must have the same form. A `legacy` or `statement` predecessor may
  move to either form, because that is an upgrade, not a swap.
- **Table `figure_checks`, append-only:**
  - what was checked: evidence id, subject table, id and field;
  - the value checked; the numbers in it; the numbers found and the numbers missing;
  - the wording flags;
  - `result` (`pass` · `flag`), `rules_version`, `checked_at`, the actor.
- **`hardening.sql`:** the audit and no-delete triggers on `figure_checks`, plus the new
  guard triggers above.
- **`ownership.sql`:** INSERT only on `figure_checks` for `lvrf_app`. The trigger count
  rises by the new triggers; Gate C counts them from `pg_trigger`.

**2. The writers.**
- **The six act-recording sites write `statement`.** No source is invented for them. Their
  basis is unchanged (`lvrf_evidence_basis` already makes an unsourced observation
  `assumed`).
- **`institutionFactWriter`** and **`outcomeEvidence`** take `evidence_form` with `quote_text`
  or `locator`, plus `how_read`. A body with both a quote and a locator, or neither, is a 422
  in a plain sentence (Q4k standard), recorded in `refusals`.
- **Researched facts: `institution_fact` contract v2.**
  - Exactly one of `quote` or `locator`, plus a required `how_read`.
  - The prompt template is bumped and regenerated, and contract v1 is kept by number, as
    contract v4 was.
  - Results parsed under v1 still accept: the quote moves into `quote_text`, and the
    reviewer supplies `how_read` in the accept form (P1-D5).
  - The quote no longer goes into `summary`.

**3. The figure check** (`server/lib/figureCheck.ts`, deterministic, `rules_version` 1).
- **When it runs:** on every write of a numeric fact (revenue, headcount) and every outcome
  evidence row that supports a baseline, actual or impact basis.
- **What it does:**
  - It reads the numbers in the quote, with commas and scale words ("3,413.1 million",
    "5,200", "1.42", "12%").
  - It compares them with the value at the precision the source states. "3,413.1 million"
    matches 3,413,100,000.
  - For a locator, it compares `value` × `scale`.
- **The result:**
  - A number in the value that the evidence lacks gives `flag`, with the missing number
    named. For example: "1.4 is not in the quote; the quote states 1.42".
  - Qualifiers in a text value that the quote lacks ("approximately", "up to", "at least",
    "estimated", "adjusted", "excluding", "including", "over") are listed as wording flags.
- **It never blocks a write.** The design rules that extra wording is flagged, not blocked,
  and the verification state that acts on a flag is P3. It records the check, and the fact
  and evidence show it.

**4. Q10, folded in (P1-D3).** `outcomeEvidence` stops reading `body.confidence`; the
column is written `medium` until it is retired, and every display labels it "stated by the
analyst". Run payloads keep carrying it, so no hash changes.

**5. Display** (`client/src/lib/labels.ts`, the one source of labels).
- **A quote:** in quotation marks, then "How it was read: …".
- **A locator:** "Document · table · row · column: value (scale)".
- **A statement:** "Stated by <name>, <date>".
- **Legacy:** "Recorded before evidence forms (24 Oct 2026)".
- **A flagged figure check:** one line beside the fact: "Figure check: 1.4 is not in the
  quote (it states 1.42)". On screen and in print, the same.

**6. Runs (P1-D4).** A run produced after 0039 seals, for each fact it uses, the evidence
form, its quote or locator, its `how_read`, and the latest figure-check result. The payload
gets a version field. Runs produced before stay byte-identical, and `check_run_hashes`
verifies both versions.

### Gate A (planned)

**`verify_evidence_form.sh`, new**, on a clone of the restored, neutralised prod copy.
- **It proves:**
  - every pre-0039 evidence row reads `legacy` and none is blank;
  - each of the eight writers writes its form: the six act sites `statement`, the fact
    writer and outcome evidence `quote` or `locator`;
  - a researched v1 result accepts with the reviewer's `how_read` and its quote in
    `quote_text`, while a v2 result needs its own `how_read`;
  - the figure check:
    - Scotts' "$3,413.1 million" passes against its stored revenue;
    - a fixture value 1.4 against a quote stating 1.42 flags, naming 1.42;
    - "approximately 5,200" against a quote of "5,200" passes the number and raises one
      wording flag;
    - a locator of 3,413.1 in millions passes;
  - a superseding fact from a `quote` predecessor keeps `quote`; from a `legacy`
    predecessor it may take either form;
  - the evidence form displays at 1280 and 390, and in print.
- **Breaks, each caught, every file restored byte-identical:**
  - **B1:** an INSERT with form `legacy`.
  - **B2:** a 41-word quote.
  - **B3:** a locator missing `scale`.
  - **B4:** a `statement` on a `public_filing`.
  - **B5:** a quote with `how_read` of 10 characters.
  - **B6:** an UPDATE of `quote_text` after insert.
  - **B7:** a successor swapping quote for locator.
  - **B8:** the figure check's scale handling removed, so the Scotts revenue check must fail.
  - **B9:** the figure check silently passing a missing number.
  - **B10:** a DELETE on `figure_checks`.
- **The regression:** all 35 scripts plus the new one. `verify_account_research`,
  `verify_account_workbench`, `verify_outside_in_walk` and `verify_walk_runs` send evidence
  bodies, so they are updated in the same commit.
- **Prod-copy equivalence:** every GET identical except the added fields.
- **Clean checks:** build, tsc and oxlint clean; the drift check passes after 0039.

### Gate B (planned pastes, a STOP after each)

1. **Backup:** `pg_dump -Fc`, and the TOC count against the last dump.
2. **Deploy:** `lvrf-deploy.sh`.
   - The migration runs as `lvrf_migrate`, then `hardening.sql` and `ownership.sql` re-run.
   - Expected: drift none (40 migrations), step 5d passes, deploy exit 0, the new HEAD, and
     the new bundle.

### Gate C (planned)

- **The standard checks:** run hashes, ownership, drift, and the trigger count from
  `pg_trigger` (129 plus the new triggers).
- **Every evidence row `legacy`;** `figure_checks` empty until the first write.
- **No refusals since the restart.**
- **The journal:** no evidence values logged.

### Decisions (decided by Brad, 24 Oct 2026: all six as recommended)

| # | Decision | Recommendation |
|---|---|---|
| **P1-D1** | A third evidence form, **`statement`**, for evidence that records a person's own act (classification, retirement, commitment, verification). The design named only quote and locator, but six of the eight writers have no source to quote | **Yes.** Forcing a quote on them would invent one; `statement` says truthfully that the evidence is a named person's word, and the basis function already treats it so |
| **P1-D2** | Order against UX-1: slice 4 rebuilds the run page's evidence form, which P1 also changes | **Slice 4 first, then P1.** One change to the form, not two. Slice 5 (copy pass) is independent and can run any time |
| **P1-D3** | Fold Q10 (stop writing the asserted confidence) into P1 | **Yes.** Same route, same form, same verify scripts |
| **P1-D4** | New runs seal each fact's evidence form, quote or locator, how-read and figure-check result | **Yes.** A sealed case must reproduce what it rested on; old runs stay byte-identical under a payload version |
| **P1-D5** | Research results already parsed under contract v1 (quote, no how-read): the reviewer supplies how-read at accept | **Yes.** A person states how they read it, which is the rule's intent; nothing is backfilled by machine |
| **P1-D6** | Existing evidence rows stay `legacy` forever (no backfill to quote or locator by script) | **Yes.** A legacy row is corrected only the normal way: superseding its fact with new evidence. A script guessing forms would be the system rewriting what was recorded |

---

## 9. C1: correcting the Scotts vendor-publication link (planned 25 Oct 2026; **ruled by Brad, 25 Oct 2026; built, Gate A passed 25 Oct 2026, with Brad's C1 review (errata superseded, never duplicated; L36) — BUILD_STATUS "C1"; **deployed at `feab0ad`, Gate C clean; closed 25 Oct 2026**)

**Runs before P2.** A correction slice, with its own Gate A, B and C.

**The finding** (Brad, 25 Oct 2026, from run 2's page):
- Scotts' `vendor_publication` (the "75% reduction" story) reads "supports the baseline".
- Its own summary says it is "never applied to the baseline", and §4a A9 recorded it as
  `supports = impact_basis`.
- **The record says baseline everywhere** (read-only, on prod):
  - the one live link in `value_outcome_evidence`, recorded 12 Oct 2026 20:46 by Brad
    Piver;
  - runs 1 and 2, which both sealed it as `baseline`.
- **So the label is right and the data is wrong.**

**Value spine stages served:** `baseline` (what the baseline rests on) and `verify` (what a
sealed record is now known to have got wrong).

### Brad's ruling (25 Oct 2026)

1. **Runs 1 and 2 stay exactly as sealed.** An append-only, steward-only **erratum**
   records:
   - the run;
   - what was wrong and what is right;
   - who, when, and the reason.

   It renders on the run page and on every printed page, and says the sealed record is
   unchanged.
2. **`value_outcome_evidence` gets explicit withdrawal:**
   - who, when, and a reason of at least 12 characters, all or none;
   - steward-only.

   The Scotts baseline link is withdrawn with its reason, and a new `impact_basis` link
   added. **These two correction acts are allowed on a retired engagement's frozen
   outcome; nothing else is.**
3. **A trigger refuses a `vendor_publication` about a non-tenant institution as support for
   the baseline or the actual** (impact basis only), with a deliberate break in Gate A.
4. **Run 2's confidence is recomputed, read-only, without the vendor row,** and the result
   is stated in the erratum. The sealed score is never changed.
5. **Every account is checked, read-only, for the same error,** and the findings reported
   (below).

### Step 5: the findings (read-only, prod, 25 Oct 2026)

| Query | Result |
|---|---|
| Live links: every `vendor_publication` by account | **1**: Scotts Miracle-Gro, `supports = baseline`, recorded 12 Oct 2026, engagement retired |
| The error, live: a `vendor_publication` on a non-tenant account supporting the baseline or the actual | **1**: Scotts, baseline. None supporting the actual (the existing `lvrf_block_ai_actual` already refuses that) |
| Sealed: runs whose payload carries a `vendor_publication` supporting the baseline or the actual | **2**: Scotts run 1 and run 2, both locked |
| Every account | **Curia: 4 links, 0 vendor publications. Skillsoft (the tenant's own): 4 links, 0 vendor publications.** Scotts: 2 links, 1 vendor publication |

**The error is only Scotts'.** Curia is clean. Skillsoft is the tenant's own account, which
the new trigger leaves alone (a vendor's own published results are about itself).

### What it builds

**Migration 0040 (`corrections`).** It changes `value_outcome_evidence` and adds
`run_errata`. It orphans nothing: no row is deleted, and every existing link stays current.
- **The link table:**
  - **The primary key widens** to (`value_outcome_id`, `evidence_id`, `supports`), with a
    **partial unique index on (`value_outcome_id`, `evidence_id`) where the link is not
    withdrawn.** One current link per outcome and evidence; a corrected link sits beside
    its withdrawn predecessor (C1-D1).
  - **New columns:**
    - `withdrawn_by_person_id`, `withdrawn_at`, `withdrawal_reason`: all null or all set,
      the reason at least 12 characters (CHECK `value_outcome_evidence_withdrawal_complete`);
    - `corrects_supports` (text), `corrected_by_person_id`, `correction_reason`: all null
      or all set. A correcting link names the `supports` value it replaces, which must
      differ from its own.
- **Table `run_errata`, append-only:**
  - the run and the tenant;
  - `what_was_wrong`, `what_is_right` and `reason`, each at least 12 characters;
  - the recompute: `recomputed_score`, `recomputed_band`, `recompute_method`, and the
    sealed score beside them;
  - `recorded_by_person_id`, `recorded_at`.
- **Hardening section 26:**
  - **`value_outcome_evidence_guard`**, BEFORE INSERT OR UPDATE:
    - the only UPDATE is a withdrawal, once, by the tenant's steward; `supports` never
      changes;
    - an INSERT on a retired engagement's outcome is refused **unless** it is a correction
      by the steward: its (outcome, evidence) has a withdrawn link, and it names that
      `supports` in `corrects_supports`.

    **The freeze moves into the database (C1-D2).** Today only the evidence route enforces
    it.
  - **`value_outcome_evidence_vendor_impact_only`**, BEFORE INSERT: a `vendor_publication`
    whose outcome's institution is not the tenant's own may support only `impact_basis`.
  - **`run_errata_audit`, `_no_delete`, `_immutable`, `_steward_only`.**
  - **The trigger count goes 135 → 141.** Gate C counts them from `pg_trigger`.
- **`ownership.sql`:** INSERT on `run_errata` (not UPDATE). `value_outcome_evidence` gains
  UPDATE for `lvrf_app`, for the withdrawal only; the guard refuses every other UPDATE.
- **Plain sentences** for the new CHECKs in `plainChecks.ts`.

**Readers exclude withdrawn links.** Every read of `value_outcome_evidence` adds
`withdrawn_at IS NULL`: produce-run (the confidence input and the evidence snapshot),
`/pov`, `/walk`, `/view`, the gap register, `lvrf_block_ai_actual`, the figure-check guard,
`verifyConfidenceParity` and compare. Gate A greps the code for every read of the table, so
a missed reader fails.

**Routes** (steward-only; refusals in plain words, recorded):
- **`POST /api/value-outcomes/:outcomeId/evidence/:evidenceId/correct-support`:** withdraws
  the current link with its reason and adds the corrected one, in one transaction. It is
  allowed on a frozen outcome; it refuses anything that isn't a change of `supports`.
- **`POST /api/value-runs/:id/errata`:** records an erratum.
  - **The recompute is the server's, never typed (C1-D3):**
    - it reads the run's sealed payload, with the corrected link applied to the sealed
      evidence snapshot, and runs the same `computeConfidence`;
    - the factors that don't read evidence are taken as sealed;
    - it **refuses** when it can't reconstruct the input exactly: a sealed evidence item
      that was attested, whose attester the snapshot does not carry.
  - It states the method, for example "Recomputed with the sealed evidence, the vendor
    publication counted as impact basis, not baseline; the sealed score is unchanged".

**The display:**
- **The run page:** the erratum sits beneath the disclosure banner, **in the printed
  `<thead>`, so on every printed page**. It reads:
  - "ERRATUM, <date>: <what was wrong>. <what is right>.";
  - "The sealed record below is unchanged.";
  - "Recomputed without it: <n / 100 · Band> (sealed: 35 / 100 · Low)".

  It is marked "recorded after sealing", which is distinct from standard 10's "as recorded
  at sealing".
- **The account page:** the walk's evidence list gains "Correct what it supports…"
  (steward-only), with the withdrawn link shown struck through, its reason and who
  withdrew it.
- **The POV and `/view`** show only current links. A withdrawn link is listed under the
  outcome as "withdrawn <date> by <name>: <reason>".
- **Steward-only "Record an erratum…"** on the run page.

**Brad's acts on prod, after the deploy** (through the UI; no script writes to prod):
1. Correct the Scotts link: withdraw `baseline` with its reason, add `impact_basis`.
2. Record the erratum on run 2. Run 1 sealed the same row, so it gets its own erratum.

### Gate A (planned)

**`verify_corrections.sh`, new**, on a clone of the restored, neutralised prod copy.
- **The corrections:**
  - the Scotts link corrected through the route on a frozen outcome: the old link
    withdrawn (who, when, reason), the new `impact_basis` link current;
  - one current link per (outcome, evidence);
  - **everything else on the frozen outcome still refused,** at the route and in the
    database: a new evidence link, and a second correction of the same link.
- **The erratum:**
  - recorded on runs 1 and 2 by the steward;
  - refused for a non-steward, at the route and in the database;
  - UPDATE and DELETE refused;
  - **run 2's recompute equals an independent recomputation in the script.** Expected 35 /
    100 · Low: the baseline factor takes the best item, the verified filing, and the
    impact basis is full with no currency claimed. The script computes it; nothing is
    assumed.
- **The seals:** `check_run_hashes` gives 25 of 25 before and after. Runs 1 and 2 are
  byte-identical.
- **The display:** at 1280 and 390, and in print, the erratum on **every** printed page,
  read page by page.
- **The readers:** a new run on a fixture outcome with a withdrawn link doesn't carry it,
  and neither do `/pov` or the gap register.
- **The vendor trigger:**
  - a fixture `vendor_publication` on a non-tenant account refused for the baseline and the
    actual, and accepted for the impact basis;
  - on the tenant's own account, accepted for the baseline.
- **Breaks, all caught, every file restored byte-identical:**
  - **B1:** the erratum's steward check removed;
  - **B2:** an UPDATE of an erratum;
  - **B3:** a withdrawal with an 11-character reason;
  - **B4:** a withdrawal with who but no when;
  - **B5:** produce-run's `withdrawn_at` filter removed, so a withdrawn link is counted;
  - **B6:** the vendor trigger's body removed, so a vendor baseline is accepted;
  - **B7:** the frozen-outcome guard relaxed, so a new link on a retired engagement is
    accepted;
  - **B8:** the erratum taken out of the printed header, so page 2 loses it;
  - **B9:** a typed recompute score sent in the erratum body, which must be refused (the
    score is the server's).
- **The regression:** all 37 scripts plus the new one.
- **Prod-copy equivalence:** every GET identical except `/api/runs/:id`'s added `errata`
  (empty until Brad's acts) and the link fields.
- **Clean checks:** build, tsc and oxlint clean; drift none after 0040.

### Gate B (planned pastes, a STOP after each)

1. **Backup:** `pg_dump -Fc`, and the TOC count against the last dump.
2. **Pull, migrate as `lvrf_migrate`, then `ownership.sql` and `hardening.sql` as postgres,**
   then the checks:
   - 141 triggers from `pg_trigger`;
   - drift none (41 migrations);
   - ownership clean;
   - run hashes 25 of 25;
   - the Scotts link still `baseline` and current (nothing changes until Brad's act).
3. **Deploy:** `lvrf-deploy.sh`.

### Gate C (planned)

- **The standard checks:** 141 triggers; plain sentences for every CHECK; run hashes 25 of
  25.
- **After Brad's acts:**
  - the Scotts baseline link withdrawn, with his name, the date and the reason;
  - one current `impact_basis` link;
  - errata on runs 1 and 2, each with the server's recompute;
  - runs 1 and 2 byte-identical (`check_run_hashes`);
  - the erratum on run 2's page and in its print;
  - no refusals other than any deliberate one;
  - no values in the journal.

### Decisions for Brad

| # | Decision | Recommendation |
|---|---|---|
| **C1-D1** | The link table's key is (outcome, evidence), so a corrected link for the same evidence collides with its withdrawn predecessor. Widen the key to include `supports`, with "one current link per (outcome, evidence)" as a partial unique index, or write a duplicate evidence row for the corrected link | **Widen the key.** The evidence is the same piece of evidence; only what it supports was wrong. A duplicate row would put two copies of one source on the record |
| **C1-D2** | The frozen-outcome rule is enforced only in the evidence route today. Move it into the database, with the correction as the one exception | **Yes.** "Nothing else is" should not rest on a route; the same reason the other governance rules are triggers |
| **C1-D3** | Who computes the recompute stated in the erratum | **The server, at the erratum's recording,** from the sealed payload with the corrected link applied, by the same `computeConfidence`. It refuses when the sealed snapshot can't reconstruct the input exactly. A typed score is refused (B9). The sealed score is shown beside it, unchanged |
| **C1-D4** | Run 1 sealed the same row | **An erratum on run 1 too,** with its own recompute. Same act, same rule |

---

## 10. P2: acts and lineage (planned 25 Oct 2026; **approved by Brad, 25 Oct 2026, with P2-D1–D8 ruled (conditions on D3–D6); Step 0 passed; deployed at `5b4e928`, Gate C clean, 25 Oct 2026** — BUILD_STATUS "P2")

**Source:** `docs/LVRF_DESIGN_PACKS_ADMIN_VALUE_CASE.md`, ratified 24 Oct 2026, §2.4 (audit),
§5.1 (`governance_acts`, `research_imports`, `research_results.import_id`,
`lvrf_lineage`) and §7 (P2: "`governance_acts`, the presence trigger (Step 0 on a scratch
database first), `research_imports` with hash, `lvrf_lineage`, `/lineage/:table/:id`").

**Value spine stages served:** `verify` and `return`. The point is defensibility: every
governed change names its act, actor and reason, and any figure can be traced to where it
came from.

### What exists (read 25 Oct 2026)

- **Who/when is recorded per object, not per act.**
  - **The columns:** `research_results.reviewed_by_person_id` / `reviewed_at` /
    `review_note`; `evidence.citation_resolved_by_person_id` / `_at`;
    `value_outcomes.committed_by_` / `verified_by_`; `value_runs.locked_at` /
    `lock_reason`; `retired_by` / `deleted_at` and supersession reasons; C1's withdrawal
    and correction columns.
  - **`audit_log`** holds whole rows (old and new) with the actor, through `lvrf_audit()`.
  - **There is no act row:** nothing says "this UPDATE was an *accept*". Retire, withdraw
    and supersede are distinguished only by which columns changed.
- **Research intake** (decision D1, the boundary in CLAUDE.md):
  - a prompt is generated from live rows into `research_prompts` (immutable, with its
    SHA-256);
  - a person runs it;
  - **the browser `JSON.parse`s the paste and posts the parsed object**
    (`AccountResearch.tsx:267`, `PackResearch.tsx:227`). **The server never sees the
    pasted text.** Each `research_results` row keeps its own slice as `raw_response`
    (jsonb);
  - a person accepts or rejects per field.
- **The research the prod copy holds:** 34 results (26 `industry_measure`, 13 of them
  untracked; 8 `institution_fact`), all accepted. Express's JSON body limit is the default
  100 KB (`server/index.ts:80`).
- **What runs seal:**
  - **facts** with their own `id` and `evidenceId` (`payload.institutionFacts`);
  - **the entity** with its `id`;
  - **outcome evidence without its id**, only kind, summary, provenance and flags (C1's
    recompute matches it by kind, summary and provenance).
- **Scotts' TRIR baseline has no research chain.** Its evidence is an `observation`
  recorded directly in W6 on 12 Oct ("Found through AI-assisted research"), with **no
  `research_results` row and no prompt.** Scotts' revenue fact does have one: prompt →
  result (accepted 12 Oct) → evidence → fact → sealed in run 2.
- **No research import and no act row exists before P2,** by construction.

### Conflicts, named (not resolved silently)

1. **§7's acceptance test can't be met on the real record.** It asks Scotts' TRIR baseline to
   trace prompt → import → result → accept act → evidence → fact → run 2's seal. None of
   that exists for the baseline, and no import or act predates P2 → **P2-D1**.
2. **§2.4's act vocabulary doesn't cover today's acts.** It lists {import, validate,
   approve, certify, activate, supersede, verify, attest, open_citation, accept, reject,
   withdraw, ratify, demote, commit}. It lacks measure, lock, retire (engagement), exclude,
   mark, link (a solution to a lever), and C1's correct and record-erratum → **P2-D3**.
3. **§5.1 says "CHECK on `created_at`",** but `research_results` has no `created_at`. Its
   insert stamp is `parsed_at`, set by `research_results_touch` and frozen on UPDATE. The
   precedent is `research_results_untracked_predates_prompts` → **P2-D6** uses `parsed_at`.
4. **CLAUDE.md's research boundary** ("only `industryResearch.ts` and `accountResearch.ts`
   write `research_prompts` and `research_results`") **must name `research_imports`.** That
   edits the constitution file → **P2-D8**.
5. **The import must hold what was parsed,** but today the browser parses the paste and the
   server never sees the text → **P2-D5**.

### What it builds

**Step 0, before any migration** (§7): prove the presence check on a scratch database
(`createdb lvrf_step0`, not a clone, dropped after).
- **The mechanism:** a deferred constraint trigger keyed on `txid_current()`.
- **`scripts/step0_act_presence.sh`** shows, with a pass or fail for each:
  - **an act in the same transaction → commit succeeds**, whichever order the act and the
    change are written in;
  - **no act → refused at commit**;
  - **an act in another transaction → refused**;
  - **an act written inside a rolled-back savepoint → refused**;
  - **an act for another row → refused.**
- **If any of these fails, P2 stops and the mechanism goes back to Brad.**
- **Brad's condition on D4:** the "another row" and "another transaction" cases above
  each pass only if the change is **refused**. An act for a different row, or one written in
  a different transaction, must never satisfy the check.

**Migration 0041 (`acts_and_lineage`).** It adds tables, an enum and one nullable column. It
orphans nothing: no row is changed or deleted, and every existing research result keeps
`import_id` NULL, which is allowed for rows parsed before the cutover.
- **enum `governance_act`:** §2.4's fifteen values, plus the ones today's routes need
  (P2-D3): `measure`, `lock`, `retire`, `exclude`, `mark`, `link`, `correct`,
  `record_erratum`.
- **`governance_acts`, append-only:**
  - `id`, `tenant_id`, `act`;
  - `subject_table` and `subject_id`: the row the act governs;
  - `result_table` and `result_id`: the row it created, if any (a supersession's successor,
    a correcting link, an erratum);
  - `actor_person_id`;
  - `reason` (nullable: acts whose route takes no reason, such as accept with no note, record
    none; never invented);
  - `evidence_ids` (uuid[]);
  - `route`: the pattern, no values;
  - `txid` (bigint, `DEFAULT txid_current()`);
  - `at`.

  An index on (`txid`, `subject_table`, `subject_id`), and CHECKs: a result is both or
  neither; the reason is at least 12 characters when present; the route is a pattern (no
  `?`, no uuid).
- **`research_imports`, immutable:**
  - `id`, `tenant_id`, `prompt_id` (NOT NULL: since D1 a result names its prompt);
  - `raw_text`;
  - `raw_sha256`, with CHECK `research_imports_sha256_is_the_text`, the same form as
    `research_prompts_sha256_is_the_text`;
  - `byte_length`, with a CHECK that it is the text's length and at most 524,288;
  - `imported_by_person_id`, `imported_at`.
- **`research_results.import_id`:** a nullable FK, `ON DELETE RESTRICT`, with CHECK
  `research_results_import_after_cutover`: `import_id IS NOT NULL OR parsed_at < '<cutover>'`
  (P2-D6).
- **Hardening section 27:**
  - **`governance_acts_audit`, `_no_delete`, `_immutable`, and `_actor`.** The actor is
    `lvrf_current_actor()`, and the subject exists and is in the act's tenant.
  - **`research_imports_audit`, `_no_delete`, and `_immutable`.**
  - **`research_results_import_matches`:** the import's prompt is the result's prompt, and
    both are the result's tenant's.
  - **The presence check:** one constraint trigger, `<table>_act_present` (`AFTER INSERT OR
    UPDATE … DEFERRABLE INITIALLY DEFERRED`, one function `lvrf_require_act()`), on each
    subject table of P2-D3.
    - **When it fires:** only when the row makes one of that table's governed transitions
      (the function reads `TG_TABLE_NAME` and compares OLD and NEW).
    - **What it requires:** an act with this `txid` naming the row as its subject or its
      result.
    - **The refusal:** "LVRF: <table> <id>: <transition> with no governance act recorded in
      this transaction." It goes into `plainChecks`/`PLAIN_*`.
  - **Section 24** refuses UPDATE on `governance_acts` and `research_imports`. `ownership.sql`
    grants INSERT on both, and no UPDATE.
  - **The trigger count:** **141 + 4 + 3 + 1 + N**, where N is the number of subject tables.
    It is **167 with P2-D3 as recommended (N = 18).**
- **`lvrf_lineage(p_table text, p_id uuid)`:**
  - **`STABLE`, `SECURITY INVOKER`, read-only.**
  - **It returns ordered steps:** `step`, `kind`, `table`, `id`, `actor`, `at`, `detail`
    (jsonb), `source` (`act` · `record` · `seal`).
  - **The chain:** prompt → import → result → review act → evidence (with its form, quote or
    locator, figure check and opened citation) → fact, entity or measure → its supersessions
    → outcome links (with withdrawals and corrections) → runs that sealed it → errata.
  - **History before P2** comes from the existing who/when columns. Each such step is
    labelled `source = 'record'`, "recorded before governance acts (<cutover>)"; no act is
    invented (P2-D2).
  - **Outcome evidence in a sealed run** is matched by kind, summary and provenance, and
    labelled **"matched by kind, summary and source; not sealed by id"**, because
    snapshots carry no evidence id (P2-D7).

**Routes:**
- **Every route in P2-D3's mapping writes its `governance_acts` row in the same
  transaction,** through one helper, `server/lib/governanceAct.ts`.
- **The coverage guard** (Brad's condition on D3), like `MUTATING_ROUTE_CLASS`:
  - `server/lib/governanceAct.ts` holds `ROUTE_ACTS`, which classes **every** mutating route
    as either its act(s) or `'create-only'`;
  - **`verify_acts_lineage.sh` fails any mutating route in the source that is not
    classed,** any class naming a route that doesn't exist, and any route classed with an
    act that doesn't call the helper;
  - a create-only route found writing a governed transition is caught by the presence
    trigger in the regression.
- **Create-only routes, left out of P2 by name** (16): these create rows, or set a field,
  that carry their own who/when and make none of P2-D3's governed transitions.
  `POST /api/account-inputs` · `POST /api/business-metrics/:metricId/pack-basis` ·
  `POST /api/capabilities/:capabilityId/industry-measures` ·
  `POST /api/engagements/:engagementId/produce-run` ·
  `POST /api/industries/:industryId/research-prompts` ·
  `POST /api/institutions/:institutionId/research-prompts` ·
  `POST /api/institutions/:institutionId/analyst-of-record` ·
  `POST /api/institutions/:institutionId/executive-summaries` ·
  `POST /api/institutions/:institutionId/facts` ·
  `POST /api/institutions/:institutionId/hypotheses` ·
  `POST /api/institutions/:institutionId/industry` ·
  `POST /api/institutions/:institutionId/inputs` ·
  `POST /api/institutions/:institutionId/offerings` ·
  `POST /api/institutions/:institutionId/value-outcomes` ·
  `POST /api/value-outcomes/:outcomeId/evidence` ·
  `POST /api/value-runs/:runId/record-document`.
  The other **29** mutating routes write acts.
- **The two research POSTs** take `{ raw_text }` and parse it on the server, with the
  existing parser unchanged (P2-D5).
  - The 100 KB limit is raised to 512 KB for those two routes only.
  - The import is inserted, then each result with its `import_id`, then the `import` act.
  - **A paste the parser refuses** (422) is recorded in `refusals` with source `parser`.
    Its `attempted_payload` holds the paste's **SHA-256 and byte length, never its text**
    (Brad's condition on D5). No import row is kept.
  - The clients send the text, no longer the parsed object.
- **`GET /api/lineage/:table/:id`:**
  - for an authorized user, tenant-scoped (another tenant's id → 404, logged, like every
    read);
  - **tables (P2-D7):** `institution_facts`, `institution_entities`, `industry_measures`,
    `evidence`, and `value_outcomes` (`?figure=baseline|actual`).

**Display: `/lineage/:table/:id`,** a noun page in the UX-1 house style.
- Each step is a row with what, who, when and the source label. A quote is shown with its
  how-read, a locator as P1 renders it. Withdrawn links and superseded errata are struck
  through, as C1 shows them.
- **The page prints,** with a footer naming the subject and the print date.
- **Links "Where this came from":** each fact on the account facts card and the POV; each
  sealed fact and evidence item on the run page; the outcome's baseline and actual.
- **Nothing is computed or sourced here:** the page only reads.

### Gate A (planned)

**`verify_acts_lineage.sh`, new,** on a clone of the restored, neutralised prod copy, with
invented fixtures ("Fixture Valley Electric Cooperative (invented)").
- **Step 0's script re-run** inside it: five cases.
- **The schema:** about 167 triggers; drift none (42 migrations); existing results keep
  `import_id` NULL, with none blank or invented; `governance_acts` empty after the
  migration.
- **Every route in the P2-D3 mapping:**
  - it writes exactly one act per subject (or per subject and result), with the session
    actor, a route pattern and no values;
  - **a code grep:** every route that makes a governed transition calls the helper;
  - a missed route fails.
- **Research:**
  - a fixture prompt is run; the pasted text is stored byte-for-byte; its SHA-256 is
    recomputed in the script;
  - every result names the import and the prompt;
  - **a v1 or v2 envelope pasted as text parses exactly as before** (an identity test on
    the parsed rows).
- **Lineage, on a fixture** created through the routes after P2: prompt → import → result →
  accept act → evidence → fact → supersession → a run's seal, each step with who and when,
  every step `source = 'act'` or `'seal'`.
- **Lineage, on the real record** (per P2-D1):
  - **Scotts' revenue fact:** prompt → result → accept (`record`, reviewed 12 Oct by Brad
    Piver) → evidence → fact → run 2's seal, with **"no import (before research imports)"**
    shown, not skipped;
  - **Scotts' TRIR baseline:** evidence (observation, AI-sourced, citation opened 13 Oct)
    → the outcome link → runs 1 and 2 (matched) → no research step, stated as "recorded
    directly as outcome evidence". The vendor publication shows withdrawn, corrected to the
    impact basis, with both errata, run 1's superseded one struck through;
  - **Curia:** one fact and one outcome.
- **The display:** at 1280 and 390, and in print. The links are present where listed, there
  is no sideways scroll, and a non-authorized reader is refused.
- **Breaks, every file restored byte-identical:**
  - **B1:** a governed change with no act, refused at commit (§7);
  - **B2:** a tampered import, hash ≠ text, refused (§7);
  - **B3:** an import edited after insert, refused (§7);
  - **B4:** an act whose actor is not the session actor;
  - **B5:** an UPDATE or DELETE of an act;
  - **B6:** an act written in another transaction does not count;
  - **B7:** a result parsed after the cutover with no import;
  - **B8:** a result naming another prompt's import;
  - **B9:** the helper call removed from one route (accept), so the route's write is refused
    at commit and the 500 becomes a plain refusal;
  - **B10:** the lineage function's `withdrawn_at` and supersession steps removed, so the
    fixture chain loses a step and the script names it;
  - **B11:** a paste over 512 KB, refused in words.
- **The regression:** all 38 scripts plus the new one. **Every existing script that writes
  through a governed route keeps passing unchanged,** which is the proof the helper is
  wired everywhere. A script that writes a governed transition by SQL on its throwaway clone
  must now write its act too; each one is named in BUILD_STATUS.
- **Prod-copy equivalence** against `feab0ad`: every GET identical except the added link
  targets. The two research POSTs change shape (the text, not the object), which the gate
  states.

### Gate B (planned pastes, a STOP after each)

1. **Backup:** expect about **674 TOC entries**. The basis is the box's own
   `lvrf-pre-c1-…` (651, at 0039) plus 0040's 23, counted locally.
2. **Pull; migrate as `lvrf_migrate`; `ownership.sql`, then `hardening.sql`, as postgres;**
   then:
   - the trigger count (about 167);
   - drift none (42 migrations);
   - ownership clean;
   - run hashes 25 of 25;
   - **0 results parsed since the cutover literal** (P2-D6);
   - **the pre-check, before paste 1** (Brad's condition on D6): read-only over ssh, I
     confirm no research result was parsed between Gate A and the deploy, and give the last
     `parsed_at` on prod;
   - `governance_acts` 0, `research_imports` 0.
3. **Deploy.**

### Gate C (planned)

- **The standard checks:** triggers, plain sentences, run hashes, ownership, drift,
  refusals and the journal, with no values.
- **Brad's first acts after the deploy** each show one `governance_acts` row: who, the
  route pattern and the reason.
- **The lineage of Scotts' revenue fact and TRIR baseline** read on prod as Gate A
  predicted.

### Decisions (decided by Brad, 25 Oct 2026)

D1, D2 and D8 as recommended. D7 with the label "matched by kind, summary and source; not sealed by id". D3–D6 with the conditions written into the sections above: D3 lists the create-only routes and adds the coverage guard; D4's Step 0 proves that another row's act or another transaction's does not satisfy the check; D5 records a refused paste by hash and size, not text; D6's Gate B pre-check confirms no research between Gate A and the deploy.

| # | Decision | Ruled |
|---|---|---|
| **P2-D1** | §7's acceptance test (Scotts' TRIR baseline traced prompt → import → result → accept → evidence → fact → run 2) can't be met: the baseline was never researched, and no import or act predates P2 | **Test the full chain on a fixture made after P2; on the real record, trace Scotts' revenue fact (prompt → result → accept → evidence → fact → run 2) with "no import (before research imports)" stated, and Scotts' TRIR baseline as it really is.** The test proves the function; the real records prove it tells the truth about history |
| **P2-D2** | Backfill `governance_acts` for history from the who/when columns and `audit_log`? | **No backfill.** An act row says the act was recorded as an act at the time; writing them now from other columns would manufacture that. Lineage reads history from the columns, labelled "recorded before governance acts" |
| **P2-D3** | Which acts, on which subject tables, are enforced in P2 | **Every governed transition today, 18 tables, with the act vocabulary extended:** <br>• accept and reject → `research_results`, pending→accepted/rejected <br>• open_citation → `evidence`, `citation_resolved` set <br>• commit, measure, verify → `value_outcomes` <br>• lock → `value_runs` <br>• retire → `engagements` <br>• withdraw → `industry_measures`, `value_levers`, `lever_offerings`, `reference_example_markers`, `value_hypotheses`, `account_person_links`, on `deleted_at` set <br>• supersede → the predecessor's `superseded_by_id` set, with the successor as the act's result, on `institution_facts`, `institution_entities`, `business_metrics`, `value_hypotheses`, `reference_example_markers` <br>• ratify → `value_levers` insert (O-D2) <br>• link → `lever_offerings` insert <br>• exclude → `industry_measure_exclusions` insert <br>• mark → `reference_example_markers` insert <br>• correct → `value_outcome_evidence`, withdrawal plus correcting insert <br>• record_erratum → `run_errata` insert <br>• import → `research_imports` insert <br>**Out of P2:** creation routes that already carry their own who/when and change no governed state (account inputs, offerings, claims, outcome creation, outcome evidence, typed facts, hypotheses, summaries, analyst, classification, pack basis, produce-run, record document, prompt generation). Act rows for them are a later item, if wanted |
| **P2-D4** | The presence mechanism | **A deferred constraint trigger keyed on `txid_current()`,** proven by Step 0 before any migration; order-independent within the transaction. The alternative, a `SET LOCAL lvrf.act_id` per request, can be set without writing the act, so it proves less |
| **P2-D5** | The import must be the text that was parsed | **The client sends `{ raw_text }`; the server parses it with the existing parser.** 512 KB limit on the two routes only. An unparseable paste is refused and recorded as today, and no import row is kept (an import is what produced results) |
| **P2-D6** | How "import required after the cutover" is enforced | **A CHECK on `parsed_at` against a literal cutover** (the generation day, 00:00 UTC), as `research_results_untracked_predates_prompts` already does. Gate B checks that no result was parsed between the literal and the migration; **no research between Gate A and the deploy.** (A literal that has passed fails the migration safely, in its own transaction) |
| **P2-D7** | Lineage scope and the sealed-evidence match | **Facts, entities, pack measures, evidence and an outcome's baseline or actual.** For runs sealed before evidence ids were sealed, match outcome evidence by kind, summary and provenance, labelled as matched. Sealing the evidence id in new runs is a payload change (payloadVersion 3) and is **not** in P2; it is recorded as a loose end if wanted |
| **P2-D8** | CLAUDE.md's research boundary names `research_prompts` and `research_results` only | **Amend it in the P2 commit:** "Only `industryResearch.ts` and `accountResearch.ts` write `research_prompts`, `research_imports` and `research_results`." This is a constitution-file edit, so it needs Brad's approval |

---

## 11. C2: what a commitment's and a verification's attestation supports (ruled by Brad, 25 Oct 2026; **decisions ruled 25 Oct 2026; built after L39, each with its own Gate A**)

**Value spine stages served:** `commit` and `verify` (what each attestation is evidence of), and
`return` (the errata on the runs that sealed it).

### The finding (P2 review, read-only, 25 Oct 2026)

- **The code:**
  - `server/routes/outcomeWalk.ts:233`, at commit, links the commitment's attestation as
    `impact_basis`;
  - `outcomeWalk.ts:590`, at verify, links its attestation as `attestation` only if that value
    already exists in the table. `value_outcome_evidence_supports_known` (0030) allows only
    baseline, actual and impact_basis, so it is always `impact_basis`.
- **The real record:**
  - **Curia** has 1 commitment attestation linked `impact_basis`, current;
  - Scotts and Skillsoft have none;
  - **9 sealed runs (Curia 13–21) seal it.**
- **Credit:** none earned. Factor 4 was full in all 9 because no currency figure was claimed. With
  a currency figure and a stated basis, such an item would be graded, and could earn factor-4
  credit for an act that is not evidence of the figure's derivation.

### Brad's ruling (25 Oct 2026)

1. **`supports` gains `target_commitment` and `verification`.** Neither feeds an evidence factor.
2. **Commit and verify link their attestations with them:** commit as `target_commitment`,
   verify as `verification`.
3. **Curia's one link is corrected by C1's mechanism:** the `impact_basis` link withdrawn with
   its reason, and a `target_commitment` link recorded as its correction.
4. **Errata on Curia runs 13–21, with a dry-run count first.**

### What it builds (planned)

**Migration 0042.** It changes three CHECKs and orphans nothing: no row changes. Every
existing link keeps its `supports` until a steward corrects it.
- `value_outcome_evidence_supports_known`, the correction CHECK (`corrects_supports`'s list) and
  `run_errata_supports_known` each gain `target_commitment` and `verification`.
- Plain sentences are updated with them.

**The model.**
- `computeConfidence` reads only `baseline` (factor 2), `actual` (factor 3) and `impact_basis`
  (factor 4), so the new values reach no factor **without any change to its logic**.
- `ConfidenceEvidenceInput['supports']` widens to name them.
- **C2-D1** decides whether that type change moves `MODEL_FINGERPRINT`, and so the version.

**Routes:**
- **commit** links `target_commitment`; **verify** links `verification`. The
  `existingSupportsValues` fallback is removed.
- **`correct-support`** accepts the two new values, so the steward can correct Curia's link
  through the route, with its act (P2).
- **The erratum recompute** takes them as "supports nothing a factor reads".

**The dry run, before any erratum:** a read-only report (`scripts/report_c2_errata.ts`, as
lvrf_app, run by Brad on the box or by me over ssh) lists each run that sealed a commitment or
verification attestation as `impact_basis`. For each run it gives:
- the run, its sealed score;
- the recompute with the item moved to `target_commitment` or `verification`, under the
  model each was sealed with.

The count is expected to be **9 (Curia 13–21), each recomputing to its sealed score** (factor
4 was full with no currency claimed). The report writes nothing.

**Brad's acts on prod after the deploy** (through the UI):
1. Correct Curia's link.
2. Record the errata on runs 13–21, ticking each against the dry run's list. Each erratum
   writes its `record_erratum` act.

**The display:** the walk, the POV and the run page show "supports the commitment" and
"supports the verification".

### The dry run's finding, and Brad's ruling (25 Oct 2026)

- **The finding:** the dry run lists the expected 9 (Curia 13–21), but C1's recompute refuses
  every one, for reasons unrelated to C2:
  - runs 13–16 sealed no model version;
  - runs 17–21 sealed under 1.0.0, but their baseline system export is attested (15 of 25), and
    the seal does not carry the attester, so the seal cannot be reproduced.
- **The C2 item** fed only factor 4, full in all 9 (no currency claimed): the mislabel changed
  no score.
- **Brad's ruling: an erratum, not recomputed.** Migration 0042 also makes run_errata's
  recomputed score and band (and its model, for a run that sealed none) nullable under
  `run_errata_recompute_complete`. When the seal cannot be reproduced, the erratum is recorded
  with no score; its method reads "Not recomputed: <the reason, specific to the run>".
- **His conditions:**
  1. Where the seal shows it, the method also quotes, from the seal, the one factor the item
     could feed and its sealed value. It is read by the server, never typed.
  2. Report which evidence columns can change after insert (L41), and record that new runs must
     seal the attester and the model (L42).
  3. Report who attested Curia's baseline system export in runs 17–21, and whether the credit is
     consistent with the institution-scoped attester rule, for his ruling. Nothing is changed.
- **A run sealed under another *recorded* model** is still refused: M1 keeps every model's
  scorer.

### Gate A (planned)

**`verify_c2.sh`** builds its own fixture outcomes, links and errata (L39), and covers:
- commit and verify link the new values;
- neither earns credit in any factor, with or without a claimed currency figure. A fixture
  that claims currency shows factor 4 unchanged by them;
- the correction of an `impact_basis` attestation link to `target_commitment` through the
  route, with its act;
- the dry run's count and recomputes, against an independent computation in the script;
- an erratum on a fixture run.

**Breaks:**
- the CHECK without the new values (the route refuses them);
- commit linking `impact_basis` again;
- factor 4 grading `target_commitment`;
- the dry run writing anything;
- an erratum with a typed score.

**Also:** the regression on the fresh prod copy, once L39 is fixed, and prod-copy equivalence.

**C2 approved (Brad, 26 Oct 2026), including the departure:** only an attestation may be corrected to
the commitment or the verification.

### Gate B and Gate C (planned)

- **Gate B:** the backup; pull, migrate, ownership, hardening and the checks; deploy.
- **The dry run on prod**, read-only, before Brad's acts: the count of 9.
- **Gate C:**
  - Curia's link withdrawn and corrected;
  - 9 errata, each with its act;
  - runs 13–21 byte-identical;
  - no refusals but deliberate ones.

### Decisions (decided by Brad, 25 Oct 2026)

- **D1:** measure the fingerprint at build. **If it moves, stop and bring it to Brad.** It is also
  ruled as a standing principle, M1 in §3: every model version's scorer is kept.
- **D2:** approved. The 9 Curia errata are recorded through the UI, one at a time, against the
  read-only dry run's list.
- **D3:** approved, `verification` only.
- **Order:** L39 first, with its own Gate A, then C2. Stop after each Gate A for Brad's review.

| # | Decision | Ruled |
|---|---|---|
| **C2-D1** | Widening `supports`' type in the model: does it change `MODEL_FINGERPRINT`, and so need a new `MODEL_VERSION`? | **Measure it at build.** If the fingerprint is unchanged (no constant or logic changes), keep 1.0.0: every sealed run still recomputes under its own model. If it moves, bump to 1.0.1 and record why. C1's recompute then refuses old runs unless their model is kept beside the new one, so name that before building |
| **C2-D2** | The 9 errata: through the UI one by one, or a steward script with `--apply`? | **The UI, one by one, against the dry run's list.** Each is a steward act with its own act row, and scripts never write to prod. Nine is a sitting, not a batch |
| **C2-D3** | Verify's attestation also stands behind the actual. Link it `verification` only, or `verification` and `actual`? | **`verification` only, as ruled.** The measured actual comes from the customer's system of record (CLAUDE.md, the governing AI principle); an attestation about it is not that evidence |

## 12. C3: credit only for customer-side people; errata on what the seals credited; system-exercise marks (ruled by Brad, 26 Oct 2026; **built; Gate A 26 Oct 2026, BUILD_STATUS**)

**Value spine stages served:** `measure` and `verify` (what earns confidence credit), and `return` (errata
beside the runs that credited non-customer-side people; marks on what was entered to exercise the system).

### What the report found (26 Oct 2026, `scripts/report_c3.sql`, read-only on prod)

- **The attester:** Curia's baseline system export (`1632a5e0…`) and commitment attestation
  (`e523bc46…`) are attested by "Brad Piver (external analyst of record)". That is a person row of
  Curia, an analyst of record by its title, with no roles.
- **Runs 5–21 (17)** credit the export 15 of 25 in the baseline factor, all 15 resting on the
  attestation.
- **Runs 13–21 (9)** credit the same person 10 of 10 as committer of record.
- **No verifier credit anywhere.**
- **Tenant evidence earned no points.** Of the system-exercise entries:
  - evidence: 2 rows;
  - runs, by their own notes: Curia 2, 6–12 and 14–21.

### Brad's rulings (26 Oct 2026)

- **A. Who is customer-side.**
  - Credit requires a **positive customer-side role**: `metric_owner` or `executive_sponsor`,
    held and not revoked, by a non-simulated person of the evidence's institution.
  - "Not linked as `analyst_of_record`" is a **second guard**.
  - The rule applies to attestation credit in the model, and to `client_stated` in
    `lvrf_evidence_basis`.
- **B + C. Errata on Curia runs 5–21 (17).**
  - Each states, from its seal, the points resting on the analyst's attestations: 15 of 25 in the
    baseline factor, and for runs 13–21 also 10 of 10 as committer.
  - Each says they earn nothing under the C3 rule and that **the sealed score stands**. Points, not
    a recomputed total.
  - **Model 1.0.1 for future runs; the 1.0.0 scorer is kept (M1).**
  - **Recorded through a steward batch:** a dry-run count first, one act per erratum, refused if the
    count changed.
- **D.** Brad withdraws Curia `cee6fea9…` (the Skillsoft earnings filing) from the baseline with
  C2c's withdraw, with no erratum. Scotts' vendor publication stays as the impact basis. The
  "about" institution is planned under L41 (§13).
- **E. System-exercise marks.** Never delete.
  - An **append-only, steward-only "system exercise" mark**, with a reason, on each listed evidence
    row and run, shown wherever they appear.
  - **The POV's and the book's headline use the latest unmarked run.**
  - CLAUDE.md gains rule 9: verification never writes on prod (done, 26 Oct 2026).

### What it builds (planned)

**1. Who is customer-side, defined once** (hardening, a new function):
- `lvrf_customer_side(person, institution) → boolean`: non-simulated; `persons.institution_id` is
  the institution; holds `metric_owner` or `executive_sponsor` (not revoked); and no current
  `account_person_links` row of role `analyst_of_record` for that person and institution.
- The model's derivation (produce-run, the gap register) and `lvrf_evidence_basis` both read it.
  There is one definition, so the score and the badge cannot disagree.

**2. Model 1.0.1:**
- **The input:** `ConfidenceEvidenceInput` gains `attesterCustomerSide: boolean` (replacing the
  scope test). The committer and verifier inputs gain `committerCustomerSide` and
  `verifierCustomerSide` (see C3-D1).
- **The credit:** `evidenceCredit` 1.0.1 gives ATTESTATION_CREDIT only when the attester is
  customer-side; otherwise 0, with the note "attester is not customer-side (<name>: <reason>)".
- **The version and fingerprint:** `MODEL_VERSION` becomes 1.0.1. The fingerprint covers
  constants, not logic, so a new constant, `ATTESTER_RULE` (the rule in words), joins the
  fingerprint and moves it. That is C3-D2.
- **M1, the 1.0.0 scorer kept:**
  - a scorer registry, `server/spine/scorers.ts`: `{ '1.0.0': { fingerprint, computeConfidence,
    evidenceCredit }, '1.0.1': {…} }`;
  - produce-run scores with the current one;
  - `recomputeRun` takes the scorer the run was sealed with. A run sealed under a version not in
    the registry is refused, as today;
  - 1.0.0 stays byte-for-byte the code that sealed runs 17–21 and Scotts'.
- **What 1.0.1 runs seal (L42's attester part, folded in; C3-D3):**
  - beside each attested item: the attester's name, and whether they were customer-side, with the
    reason;
  - the committer's and verifier's customer-side flags;
  - so a 1.0.1 run's seal reproduces under 1.0.1.

**3. `lvrf_evidence_basis`:** `client_stated` only when `lvrf_customer_side(attester, institution)`.
Otherwise `assumed` for an attestation, `inferred` for an artifact. Curia's two items lose
`client_stated` on the POV: an expected diff in equivalence.

**4. Errata about who was credited (migration 0043):**
- **`run_errata` gains `kind`:** `'link_correction'` (every existing row) or
  `'non_customer_credit'`, with a CHECK. For the new kind:
  - `corrected_to_supports` and `evidence_id` may be NULL;
  - the recompute fields are NULL;
  - the method states the points.
  - The existing CHECKs are rewritten per kind, every term definite under NULL. The errata guard
    requires a corrected link only for `link_correction`.
- **The text, built by the server from the seal, never typed.** For example: "From this run's seal:
  15 of 25 in 'Is the baseline supported by confirmed evidence?' rest on an attestation by Brad
  Piver (external analyst of record); 10 of 10 in 'Named human committer of record' were credited
  to the same person. Under the C3 rule (model 1.0.1) neither earns credit: that person is not
  customer-side (no customer-side role). The sealed score, 55 / 100, stands." No recomputed total.
- **The rule for "points resting" is section B's:** the factor's sealed earned points, less what the
  run's independent items of that support give. The committer and verifier points are the sealed
  factor's earned points, when its note names the person.
- **The steward batch** (C3-D4: a page, not a script; scripts never write to prod):
  - `GET /api/errata/non-customer-credit` is the dry run: each locked run, the points and the
    text, and the count. It writes nothing;
  - `POST /api/errata/non-customer-credit` with `{expected_count, reason}` is steward-only. It
    recomputes the list in the same transaction. If the count is not `expected_count` it refuses
    in words and writes nothing; otherwise one erratum and one `record_erratum` act per run;
  - a run already carrying a current `non_customer_credit` erratum is left out (the count says so);
  - **the page:** "Errata the seals call for" on the Runs list, steward-only. It shows the dry
    run's list and count, and a form whose confirmation states the count. Brad presses Confirm
    once.
  - **Expected on prod:** 17 (Curia 5–21).
- **The display:** the erratum shows as an erratum (banner, the print's bounded line "ERRATUM:
  credit to a person not customer-side (sealed m / 100). Full text on page 1.", the lineage).

**5. System-exercise marks (migration 0043):**
- **A new table, `system_exercise_marks`:** `id`, `tenant_id`, `subject_table` in (`evidence`,
  `value_runs`), `subject_id`, `reason` (12+ characters), `marked_by_person_id`, `marked_at`.
  - Append-only (no UPDATE, no DELETE), steward-only (a guard), one per subject (a unique index),
    with its act (`mark`).
  - In `ownership.sql`'s insert list, not its update list.
- **Routes:** `POST /api/evidence/:id/system-exercise` and `POST /api/value-runs/:id/system-exercise`,
  each steward-only with `{reason}`. Marking is per item, with a confirmation (C3-D5).
- **Shown wherever they appear** ("SYSTEM EXERCISE — entered to exercise the system, not case
  evidence: <reason>"):
  - the run page (a banner beside the disclosure, and in print on every page);
  - the Runs list, the POV's locked runs and the account page;
  - the evidence lines (W6, the POV, the run page's sealed items, matched by kind, summary and
    provenance);
  - the lineage.
- **Headlines:** the POV's and account page's "latest locked run", and the book's (the accounts
  index: each engagement's latest locked run), use the **latest unmarked** locked run. A marked
  run is never the headline, and stays listed, marked.
- **Expected on prod:**
  - evidence `cee6fea9…` and `f9775317…`;
  - runs Curia 2, 6–12 and 14–21 (16);
  - 18 marks in all (C3-D6).
  - Curia's reference headline becomes run 13 (55 / 100).

### Gate A (planned)

**`verify_c3.sh`**, on its own fixtures (L39):
- **The fixture:** an account with:
  - an analyst of record by title (no roles);
  - vendor staff linked as `analyst_of_record`;
  - a `metric_owner` and an `executive_sponsor`;
  - a person holding a revoked role;
  - a simulated person.
- **Sealed under the 1.0.0 code itself:** the script puts 1.0.0's `MODEL_VERSION` and credit test
  back, seals runs with attested items and a committer, and restores the file. This is the C2 way.
- **It covers:**
  - each person's `lvrf_customer_side`;
  - 1.0.1's credit for each (0.6 only for the role-holder);
  - the fingerprint moved and 1.0.0's unchanged;
  - a 1.0.0 run recomputing under the kept 1.0.0 scorer, and a 1.0.1 run under 1.0.1;
  - `lvrf_evidence_basis` per person;
  - the dry run's list and points against the script's own computation from each seal;
  - the batch: refused when the count is off, then one erratum and one act per run, then
    re-running it refused or empty;
  - the erratum text: the points, "stands", and no recomputed total;
  - marks: steward-only, append-only, one per subject, with an act;
  - the mark shown on every surface, at 1280 and 390 and in print;
  - the headlines: the latest unmarked run.
- **Breaks:**
  - the role test removed from `lvrf_customer_side`;
  - the analyst-of-record guard removed;
  - 1.0.1 crediting a non-customer-side attester;
  - `ATTESTER_RULE` left out of the fingerprint (the version moves, the fingerprint doesn't);
  - the 1.0.0 scorer dropped (a 1.0.0 run's recompute refused);
  - the batch without its count check;
  - a typed point figure;
  - a mark deleted or updated (refused);
  - a mark by X;
  - the headline using a marked run;
  - the print without the mark.
- **Also:** the regression on the fresh prod copy; prod-copy equivalence, with expected diffs:
  `client_stated` on Curia's two items, the new mark and kind fields, and the headline.

### Gate B and Gate C (planned)

- **Gate B:**
  - the backup;
  - pull; migrate 0043 as `lvrf_migrate`; `ownership.sql`; `hardening.sql`;
  - the checks: triggers (167 plus the marks table's), plain sentences, ownership, run hashes
    25/25, drift (44 migrations);
  - deploy.
- **Brad's acts, through the UI:**
  1. the dry run (expect 17), then the batch, confirmed once;
  2. withdraw `cee6fea9…` from the baseline (C2c);
  3. the 18 marks, one at a time, against the report's list.
- **Gate C:**
  - 17 `non_customer_credit` errata, each with its act and its points from the seal;
  - Curia 5–21 byte-identical;
  - 18 marks, each with its act;
  - Curia's headline run 13;
  - the filing withdrawn;
  - 0 refusals but deliberate ones.

### Decisions (ruled by Brad, 26 Oct 2026)

- **D1, D2, D3, D4 and D7:** approved as recommended.
  - D1: 1.0.1 applies the rule to the committer and verifier factors too.
  - D2: `ATTESTER_RULE` joins the fingerprint (1.0.1 is `cf11d21c781a`; 1.0.0 stays `d4cf8f31472a`).
  - D3: 1.0.1 runs seal each attester and the committer and verifier, with their customer-side status
    and roles.
  - D4: the errata batch is a steward page.
  - D7: `kind` on `run_errata`.
- **D5, changed: marks go through a batch page like the errata.**
  - Each candidate is listed with its own note, quoted from the record. The steward ticks each.
  - Each mark's reason quotes that note: "Entered to exercise the system, not as case evidence; its
    own note reads: '…'".
  - One submit carries the ticked count, with one act per mark. It is refused if the count changed.
- **D6, changed: no fixed list.** Brad decides on the batch page by reading each item's own note. The
  page pre-ticks nothing.
- **Condition, the headline erratum line:** any headline taken from a run that carries a current
  erratum (the POV, the account page, the book) shows the erratum line beside the score. For example:
  "erratum: 25 of these points rest on a person who is not customer-side". Gate A breaks it.
- **Roles (Brad, 26 Oct 2026), added to C3:** nothing granted `metric_owner` or
  `executive_sponsor` but the customer-zero seed.
  - **A steward act** names a customer-side role, with these guards, enforced in the database:
    1. **The grant names its source:** an evidence row of the account, with its provenance,
       showing the person holds the role there. No source, no grant.
    2. **Refused for:**
       - simulated persons;
       - persons not of that account;
       - anyone linked as `analyst_of_record`, or titled as external or an analyst;
       - anyone with a vendor-side role or sign-in credentials (tenant staff);
       - the steward themself.
    3. **Every credit a role earns shows its source** ("metric owner per <source>, named by
       <steward>, <date>") on the run page, the POV and the lineage.
    4. **Revocation is a later act,** append-only, with a reason. A run seals the role as it stood.
    5. **Verify scripts grant fixture roles through this act only:** no SQL role inserts, even on
       clones.
  - **Gate A breaks:** granting to the analyst of record, to tenant staff, to the steward, and with
    no source.
  - **The table:** grants live in `customer_role_grants` (0043), with source, steward, account and
    revocation. `person_roles` keeps none of these, and its key cannot record a grant after a
    revocation. The seed's two `person_roles` rows carry no source and do not count.
  - **The act:** `grant` joins the act enum. Revocation uses `withdraw`.

## 13. L41 + L42: evidence the score reads is final; runs seal what a recompute needs (ruled by Brad, 26 Oct 2026; **planned 1 Nov 2026; approved with D1–D8 as recommended and four conditions; deployed at `930c8f7`; Gate C clean 1 Nov 2026 (UTC), with two findings, L52, BUILD_STATUS**)

- **What becomes one-way or final:** `source_verified`, `attested_by_person_id`, `kind`,
  `simulated`, and any other column the score or the disclosure gate reads.
- **How they are corrected:** by supersession only.
- **L42:** new runs seal the attester (name, scope, simulated) beside each attested item, and the
  model version and fingerprint, so every future run is recomputable.
- **L41, what evidence is about (Brad, 26 Oct 2026, from C3's report D):**
  - evidence gains a required `about_institution_id`: the institution the evidence is about;
  - a trigger refuses evidence about another institution supporting a customer's baseline or
    actual. Scotts' vendor publication, about another company, stays as the impact basis.
  - Existing rows need a backfill rule, decided in this slice's plan.
- **L42, after C3:** what remains once C3 seals the attester (C3-D3).
- **`source_verified` (Brad, 27 Oct 2026, C3b condition 2):** only an "opened the source" act by a named person
  sets it, going forward, for every evidence row (Q4k's open-citation, widened). The route stops taking it from
  the body. The backfill rule for the rows verified with no opening recorded is decided in this slice's plan.
  Until then, C3b shows "verified without the source being opened" beside them.
- **L47, in this slice (Brad, 27 Oct 2026), a prerequisite of §14:** account evidence, recorded with no
  outcome link and no `supports`, so a customer-side role's source is account evidence and not outcome support.
  - It is born with the "about" field (L41), the quote/locator form (P1), and `source_verified` set only by an
    opened-the-source act.
  - The account page's roles card gains "Record a source…"; the C3 and C3b fixtures then use it.
  - **HOLD: no customer-side role is granted on prod until L47 ships.**
- **First, a read-only report:** the two 23 Aug updates that set `simulated`, with no actor
  recorded. What changed, and whether any run sealed the value from before or after. **Done, below.**

### The read-only report (1 Nov 2026, on the 31 Oct prod copy; plan only, nothing built)

**The evidence table:** 34 rows, every one `legacy` form, none retired or superseded, none written
since 27 Oct. In its whole history 4 updates: 2 `simulated` (below), 2 citations opened (12 Oct).

**The two 23 Aug updates (audit 37 and 38, 24 Aug 02:53:10 UTC):**
- **What changed:** `simulated` false to true on Skillsoft `2c10e091` and `eea43d9a`, nothing else.
  Both provenances start `[SIM]`.
- **Why there is no actor:** it is migration 0011's backfill (`simulated = true where provenance LIKE
  '[SIM]%'`), which BUILD_STATUS recorded at the time as "two rows on production". A migration has no
  person. No one decided anything about these two rows; the rule ran.
- **What sealed them:** only Customer Zero run 1, on 3 Aug, before the backfill. Both items are sealed
  `source_verified` false with no `simulated` key at all, and the run hash holds. No run sealed
  either row after the update.

**The 4 rows verified with no opening recorded:**

| Row | Account | What it is | Current links | What can truthfully happen |
|---|---|---|---|---|
| `1632a5e0` | Curia | The 214-day export | none (withdrawn; under the finding) | Cannot be opened: no source on record |
| `f9775317` | Curia | Skillsoft's Q1 release | none (both withdrawn) | Could be opened; it supports nothing |
| `9765335f` | Skillsoft | LTM DRR 98% | baseline, Customer Zero | Can be opened: a public filing |
| `271a449a` | Skillsoft | FY2027 guidance | impact basis, Customer Zero | Can be opened: a public filing |

**What each row is about:** 32 of 34 are about the account they sit on. The two that are not:
- **`f9775317`,** on Curia, is about Skillsoft, an institution on record. Its links are withdrawn.
- **`423be7c6`,** on Scotts, is a Skillsoft customer story about a company that is **not an account**.
  Its summary and provenance do not name the company. Its baseline link is withdrawn; its impact-basis
  link stands, which is what §13 says should stay.

**So a required institution id cannot be the whole field:** the company `423be7c6` is about has no row
in `institutions`, and creating one would put a company on the Accounts home that nobody works.

**What was found that the ruling did not name:**
- **A backfill by migration would repeat 23 Aug.** Filling a new column on 34 rows is 34 `audit_log`
  updates with no actor, and `evidence_act_present` is there to refuse an unacted write.
- **`evidence` has no supersession route.** The column and its guard exist; nothing writes them. Once
  the columns are final, "corrected by supersession" needs a writer, or a mistaken row has no remedy.
- **The `legacy` form blocks recording a reading.** `evidence_form_final` refuses any change, so an
  opening of a `legacy` row cannot record what was read.
- **Most of L42 is already done.** New runs seal the attester since C3 and the model version and
  fingerprint since 1.0.0. No run has been produced on prod since 19 Oct, so no prod run shows it yet.
  What remains is below.
- **Two recording forms ask for `source_verified`:** the add-evidence card, and the account facts
  card. `POST /api/value-outcomes/:outcomeId/evidence` and `POST /api/institutions/:id/facts` take it
  from the body; the other seven writers already write false.
- **An attestation earns credit only when `source_verified`** (`evidenceCredit`), and commit and verify
  write attestations unverified. Under this slice's rule, a customer's attestation needs an opening
  to earn credit, so opening has to reach attestations, or §14 cannot earn credit at all.
- **Nothing in the UI reaches an opening for these rows.** The control exists only in the walk, for
  AI-sourced evidence on the latest outcome (L43).

### What it builds (planned). Value spine: `baseline` and `attach`; `verify` through the source gate

**1. Migration 0045 and hardening section 30. It writes no evidence row.**
- `evidence.about_institution_id` (nullable FK) and `evidence.about_other_party` (nullable text).
- CHECK `evidence_about_stated`, **NOT VALID:** exactly one is set, the text at least 3 characters.
  Definite under NULL. New rows must state it from the first insert.
- CHECK `evidence_verified_opened`, **NOT VALID:** `source_verified` requires `citation_resolved`.
- Each CHECK is validated by hardening.sql once no row breaks it (D3, D4), so a re-run after Brad's
  acts validates them and a fresh database validates them at once.
- Enum: `governance_act` gains `state_about` (D3).

**2. `lvrf_evidence_final`, one guard, as an allowlist:** on UPDATE, every column is final except
`updated_at`, `status`, `version`, `deleted_at`, `superseded_by_id`, and the transitions below. A column added later is final by default.
- **Kept out of the final set only as one-way moves:**
  - `citation_resolved*`: false to true, once (already final after);
  - `source_verified`: moves only inside an opening, or by the verification withdrawal (item 4);
  - `about_*`: unset to set, once, inside `state_about`;
  - `evidence_form`, `quote_text`, `locator`, `how_read`: `legacy` to `quote` or `locator`, once,
    inside an opening. `evidence_form_final` narrows by exactly that.
- **`simulated` is final** (D5).
- **INSERT:** `source_verified` must be false, on every path.

**3. The opening: `POST /api/evidence/:id/open-citation`, widened (same path, same act, so the lineage
reads it unchanged).**
- Any current evidence row, AI-sourced or not. An AI-sourced account fact stays opened in account
  research (D1 of 11 Oct: one research path).
- **Body:** `source_verified` (does the source support what the row states).
- **A `legacy` row** also gives what was read: quote or locator, and how read. The row moves to that
  form once, and the figure check runs on it.
- **An attestation** (`statement` form): also a note of what was opened, kept as the act's reason.
- **Refused, in words:** a `statement` observation (it cites no source to open); a row under a finding
  ("this figure has no source on record").
- The opener may be the person who recorded it (Q4k-D1): the separation that matters is a named
  human against AI. The session is the only actor.
- **`source_verified` leaves both bodies.** `refuseUnknownFields` then refuses it; the forms lose the
  select and gain "Record that you opened the source…" after recording.

**4. Withdrawing a verification: `POST /api/evidence/:id/withdraw-verification` (steward, a reason, act
`withdraw`).** Only for a row with `source_verified` and no opening, so it can act on these 4 rows and
no others, ever. It exists for rows nobody can open.

**5. "About":**
- Every writer states it. The seven statement writers and the fact writer pass their own institution;
  the two forms ask, defaulting to this account, or "another company", named.
- **Trigger `value_outcome_evidence_about_guard`, BEFORE INSERT:** baseline or actual support must be
  evidence about the outcome's own institution. Unset, another institution and another company are
  all refused, with `IS DISTINCT FROM` so NULL refuses. Impact basis stays open. Existing links stand.
  `vendor_impact_only` stays: a vendor's publication about the customer is still not its baseline.

**6. L47: `POST /api/institutions/:institutionId/evidence`, account evidence (signed-in staff).**
- `kind`, `summary`, `provenance`, `source_reference`, `confidence`, the about field, and the form:
  `quote` or `locator`, or a `statement` attestation. No `supports`, no link, no `source_verified`.
- No `simulated`, no `ai_sourced`: AI text takes the research path (no second path).
- **The account page gains "The account's evidence":** every row, with what it is about, its form,
  who opened it, "verified without the source being opened" where true, its marks, and the controls
  for items 3, 4, 7 and 8. This is the reachable home L43 otherwise leaves missing.
- **The roles card gains "Record a source…"** opening that form inline.
- **The grant guard and route tighten** (D6): the source must be current, not simulated, about this
  account, and opened with `source_verified` true.
- The C3 and C3b fixtures stop linking the org chart as outcome support.

**7. Correction by supersession: `POST /api/evidence/:id/supersede` (steward, a reason, act
`supersede`).** A new row, born unverified with its form and about; the old row points to it. The
reason is the act's: `evidence` has no reason column, and none is added.
- Links are not moved: a person withdraws or corrects them (C2), so no support changes silently.
- Refused while a current role grant names the old row: revoke first.

**8. The two legacy batches (rule 10: Brad's acts, dry-run count, one confirmation).**
- **"State what the legacy rows are about":** lists the 34, 32 defaulted to their own account;
  `f9775317` shown as Skillsoft and `423be7c6` as another company, whose name Brad types. One
  `state_about` act per row.
- The 4 rows are handled one at a time on the new card: opened, or withdrawn (D4).

**9. L42, what remains: `payloadVersion` 3 on new runs.** Each item also seals `evidence_id`, its about
field, and who opened it and when; each account fact the same. Sealed runs are untouched; the hash
covers the new keys; the run page shows them only when sealed. The run page, POV and C3 and C3b match
sealed items by the id on v3, by kind, summary and provenance on older runs. No model change:
**scoring reads the same columns, so no 1.0.3.**

**10. The 23 Aug updates: nothing is written** (D7). `lvrf_lineage_evidence` reads an update with no
actor as "set by migration 0011's rule; no person acted", and this section is the record of why.

### Gate A (planned)
- `scripts/verify_evidence_final.sh`, on a clone, with deliberate breaks each restored byte-identical:
  - every final column refused by UPDATE at the database, one by one, as `lvrf_app`;
  - INSERT with `source_verified` true refused;
  - **a NULL-input refusal per new CHECK** (both unset, both set, empty text, verified with no opening);
  - the about guard: another institution, another company and unset as baseline and as actual
    refused; each as impact basis accepted;
  - the opening: `legacy` to `quote` once, a second refused; an attestation; a statement observation
    and a row under a finding refused; no-act writes refused by `evidence_act_present`;
  - the withdrawal refused on any row but a verified, unopened one;
  - the grant guard: each of its four conditions refused at the database with the route's check removed;
  - v3: the hash, recompute of a v3 run, a v2 run byte-identical; a supersede refused under a grant.
- The walk: Record a source → open it → name the role → a run → attester credited. Screenshots
  looked at, in `~/lvrf-backups/l41-screens/`, plus every printed POV page.
- Fixtures move to a shared `scripts/lib` helper that records and then opens; **no test switches
  off a guard**. Eight scripts insert evidence directly and six post `source_verified`.
- The full regression and the equivalence on a fresh prod copy; a rehearsal of Brad's acts on a
  throwaway clone. **Create nothing in real local `lvrf`.**

### Gate B (planned)
Backup; pull; migrate as `lvrf_migrate`; `ownership.sql`; `hardening.sql` (both CHECKs still NOT VALID,
reported as such); checks (183 triggers; 104 CHECKs in plain sentences; drift none at 46 migrations;
25 of 25); deploy. A STOP after each. **Then Brad's acts, in order, through the UI:**
1. the about batch, 34 in all, one confirmation;
2. open `9765335f` and `271a449a`, recording the reading, if the filings say so;
3. withdraw the verification on `1632a5e0`, and on `f9775317` unless Brad opens it.

Then one paste: `hardening.sql` again, validating both CHECKs.

### Gate C (planned; read-only)
34 of 34 `about` stated, each with one act; 0 rows verified with no opening; both CHECKs validated;
all 25 runs byte-identical to the snapshot; run hashes 25 of 25; the C3b line gone from live pages
and the 4 rows' histories intact in `audit_log`; no refusals but deliberate ones. **The hold on role grants
stays until this slice ships,** and no role is granted by any step of it.

### Decisions for Brad
- **D1, the about field's shape.** Recommended: `about_institution_id` or `about_other_party`, exactly
  one. Alternative: an institution row per third company, which adds accounts nobody works.
- **D2, the supersede route in this slice.** Recommended: yes. Final columns with no writer leave a
  mistaken row with no remedy. Alternative: defer it, and mistakes wait.
- **D3, the about backfill.** Recommended: Brad's batch, 34 `state_about` acts, no row written by a
  migration. Alternative: the migration fills 32 and names the 2, which is simpler and adds 34 updates
  with no actor, the defect this slice names.
- **D4, the 4 verified rows.** Recommended: nothing changes until a person acts; each ends **opened**
  or **withdrawn**, and until then "verified without the source being opened" stays and a new run
  still credits them. No run is planned in that window. Alternatives: migrate them to false (a
  script deciding); or count them as unverified in new runs, which is a model change.
- **D5, `simulated` final, not one-way.** Recommended: final; a row found to be simulated is
  superseded by one that says so, under a person's act. Alternative: one-way false to true by a
  steward act, a new route for a case with no live example.
- **D6, a role's source must be opened.** Recommended: yes, or a role rests on a source nobody read,
  which is 1632a5e0's defect one level up. Alternative: as C3 stands, any account evidence.
- **D7, the 23 Aug updates.** Recommended: no row is written, the lineage says what they were. They
  were the correct disclosure and sealed nothing. Alternative: Brad records a retrospective act over
  them, which would state a person did what a rule did.
- **D8, `evidence_id` in the v3 seal.** Recommended: yes, ending the match on kind, summary and
  provenance for new runs (P2-D7 described the old seal). Alternative: keep the match; those columns
  are now final, so it holds, at the cost of keeping both readings for good.

### Brad's approval and conditions (1 Nov 2026)

**D1–D8 approved as recommended, with four conditions:**
1. **Opening an attestation requires the attester's own words:** a quote or locator from a document
   from that person (an email, a signed statement, a letter), never the analyst's typing. A
   `statement` attestation moves to `quote` or `locator` at its opening, and the opening names the
   document. This replaces item 3's "a note of what was opened".
2. **The about batch lists all 34 rows,** each with its proposed about and its own summary. The 32
   own-account rows may be pre-filled (derived); the two exceptions are not pre-filled. One submit
   with the count, refused if it changed.
3. **v3 runs seal "verified without the source being opened"** beside any such item.
4. **The second hardening paste (validating the CHECKs) starts with its own backup and STOPs like a
   migration.**

**What it could orphan:** nothing is removed. `AddEvidenceCard`'s select and the facts card's question
go. The client's sealed-reading code keeps both payload versions. Scotts' 2 opened rows stay `legacy`:
they were opened on 12 Oct with no reading recorded, and the record says so.


## 14. Commit, measure and verify in the client (ruled by Brad, 26 Oct 2026; **B4 of `docs/LVRF_3.0_CRITICAL_PATH.md`, plan approved by Brad 5 Nov 2026 with D1–D4 as recommended; Gate B Thu 12 Nov, buffer Wed 11**)

**Prerequisite (Brad, 27 Oct 2026): L47, in the L41 + L42 slice (§13).** A verifier or committer earns credit only
when customer-side, and a role needs a source. **HOLD: no customer-side role is granted on prod until L47 ships.**

**The finding (L43):** commit, measure and verify have no client control; they are callable only
through the API.

**Why next:**
- The cost of delay, and every value case beyond an outside-in hypothesis, depend on three
  things: a committed target, a measured actual and a named verifier.
- None of the three can be recorded through the UI today.

**The order (Brad, 26 Oct 2026; the case snapshot added 1 Nov 2026, §16):**
1. C3;
2. L41 + L42;
3. the case snapshot (§16);
4. **this slice**;
5. then slice 5's walk rework (L43, L44).

The plan is written after C3, and nothing is built until Brad approves it.

**Added to B2 (Brad, 1 Nov 2026; in scope: they cut steward time and do not cross rule 10).** Both of B1's wrong ticks came
from the near-identical "LTM DRR" and "LTM dollar retention rate" rows:
1. **Link corrections go into the supersession batch page,** so one dry run and one confirm cover them;
2. **every evidence picker and list shows the row's short id beside its text.**

**Before M21 prints (Brad, 1 Nov 2026):** the 7,000,000 impact-basis flag on Skillsoft needs a sourced derivation or a figure
finding. As the guard stands a finding on that account is refused, because it has opened evidence and accepted facts
(`lvrf_figure_finding_blockers`), so unless that rule changes, the path is a sourced derivation.

### B4: the plan (approved by Brad, 5 Nov 2026)

**Value spine:** `commit`, `measure`, `verify`, and the value case's `model` and `return`. With steward safety (§19),
built and verified on 5 Nov and merged after B3's Gate C.

| # | Part | Estimate |
|---|---|---|
| 1 | Migration 0049 and hardening section 34: `value_outcomes.attribution_method` (`control_group` · `comparison_group` · `trend_adjusted` · `estimate_adjusted` · `contribution_only`; design §3.2) and `value_outcomes.measure_class` (`capability_performance` · `compliance_assurance`; ruling 2), both stated at commit and fixed after it; measuring requires the method and a current actual-evidence link of an admitted basis (D2); an insert-only `outcome_withdrawals` (D3) | ¾ day |
| 2 | Cost of delay: the class rule replaces B3's placeholder (a `compliance_assurance` class with a `performance` rate refused, its own code and converting question); the case's attribution sentence chosen by the method (only `control_group` may say "attributable to"); the CFO lens shows realized currency only for `control_group` and `comparison_group`, with a source; the $50,000 printed end to end on the fixture | ½ day |
| 3 | Commit, measure and verify forms on the account's outcome, each confirmation naming the outcome's short id; a committer and a verifier customer-side | 1 day |
| 4 | "Withdraw this measurement…" and "Withdraw this commitment…", the steward's, in the marked zone (D3) | ¼ day |
| 5 | A claimed impact with no impact-basis source prints its refusal, never the figure (D4; Brad's stage-8 ruling) | ¼ day |
| 6 | Gate A: `verify_commit_measure_verify.sh` with its breaks, a NULL-input refusal per new CHECK, the full regression (49 scripts, steward safety's included), equivalence, screens, every printed page; **and the branch-against-main diff of every file any verify script breaks, each byte-identical to its intended version** (Brad's standing guard, 5 Nov 2026) | 1 day |

**Build Fri 6 – Tue 10 Nov; Gate A Tue 10; Gate B Thu 12 Nov, buffer Wed 11; 3.0 ratified about 15 Nov.**

**Decisions (Brad, 5 Nov 2026, yes to all four):**
- **D1.** Commitments made before B4 (Skillsoft's, Curia's) keep no method or class: the case says "not stated: committed
  before B4", and cost of delay refuses for them.
- **D2.** Measuring requires a current actual-evidence link whose basis is system of record, client-stated or published,
  and not simulated.
- **D3.** Withdrawing a measurement or a commitment is the steward's act, with a reason; the withdrawn values stay in
  `outcome_withdrawals`, and the outcome steps back.
- **D4.** A claimed impact with no impact-basis source prints "A claimed impact is recorded with no source behind it, so
  it is not shown", never the figure.

**The realized 8,400,000 on f23ee6a8 (Brad's question, 5 Nov 2026).** It belongs to the measurement Act 1 withdraws:
`value_outcomes_realized_requires_measurement` lets a realized impact stand only while the outcome is past `claimed`, so
withdrawing the measurement clears it, and `outcome_withdrawals` keeps it with the actual. No value case prints it
(B3's case renders no realized impact; nor does the POV). Run 1's internal run page shows it, sealed in run 1 (payload v1,
the Customer Zero demonstration, 29 Aug), and stays as it is. B4 prints a realized currency only under `control_group`
or `comparison_group`, with a source.

**Gate A breaks, each caught (with the plan's own):** the not-shown line removed (item 5 below); a commit without the method or the class; the method or class
changed after commit; a measurement on simulated or inferred evidence only; a compliance class priced at a performance
rate computed; causal language under any method but `control_group`; realized currency shown under trend, estimate or
contribution; a withdrawal that loses the withdrawn values; **an unsourced claimed impact printed as a figure** (B3 printed
"a vendor claim of $7,000,000 is on record"; Brad, 5 Nov 2026); run 1's case printing 8,400,000.

**A guard change, AMENDMENT-005 (`lvrf_block_ai_actual`; Brad's three conditions, 6 Nov 2026).** Before B4 the guard
refused every write of an inadmissible actual link, its withdrawal included, so acts 3–4 could not be performed. Its one
exemption is exactly a withdrawal: an UPDATE of a current link that sets the withdrawal and changes no other column. A new
link, a re-link, a change of support or of evidence is refused as before; the steward, the reason and the act are held by
`lvrf_outcome_evidence_link_guard`, CHECK `value_outcome_evidence_withdrawal_complete` and `act_present`. Gate A break M8
widens the exemption to any write and is caught. B4's Gate B report names it, with its before and after.

### B4: added after the stage-10 rehearsal (Brad, 5 Nov 2026)

The rehearsal (an independent subagent, read-only, on Gate A's PDFs and their clone) found both PDFs failing. Approved
into B4's part 2, each with a Gate A check:
1. **A figure's footnote carries its figure check:** where the sealed check flags it, the footnote says the quoted source
   does not state the figure.
2. **The target is footnoted** on the executive page and in the outcomes table: its basis, and whether the committer is
   customer-side as the record reads it.
3. **The falsifier says which way**, in the POV's sentence (e.g. "at or above its baseline of 1.4").
4. **An ask for a customer-side committer** (`committer_not_customer_side`) when the committer is not.
5. **The OUTSIDE-IN banner (ruling):** it prints unless a figure the case prints rests on customer-side evidence. When a
   sealed customer-side item exists but is not printed, one line names it, e.g. "One customer-side item is on record but
   not shown: the controller's rate attestation, because cost of delay is refused." **D-M21's share gate follows the
   printed banners** (`lvrf_run_banners`). Gate A break: the not-shown line removed must be caught.
6. "1 incidents": left; units print as recorded.

### B4: the act session (after B4's deploy; rule 10)

On Skillsoft's account, outcome **f23ee6a8**, Dollar Retention Rate (trailing twelve months). The forms are built to these
confirmations; Gate A compares them word for word.

1. **"Withdraw this measurement…"** (the marked zone). Why: `The actual of 100.4% rests only on simulated rows 2c10e091
   and eea43d9a; Skillsoft has not reported Q2 FY2027, so the figure does not exist. Withdrawn so no case prints it.`
   Confirmation: "Withdraw the measurement of f23ee6a8, Dollar Retention Rate (trailing twelve months): actual 100.4 %,
   measured 2026-07-31, realized 8,400,000 USD. The outcome reads committed again; the withdrawn values stay on the
   record."
2. **"Withdraw this commitment…"**. Why: `The target of 100% was committed by [SIM] Customer Sponsor, a simulated person; no
   named person at Skillsoft has committed to a target.` Confirmation: "Withdraw the commitment of f23ee6a8, Dollar
   Retention Rate (trailing twelve months): target 100 %, committed by [SIM] Customer Sponsor. The outcome reads claimed;
   the withdrawn values stay on the record."
3. **Card 01c, `2c10e091`** ("Show actions", then "Withdraw this link…" under "Link: the actual of Dollar Retention Rate
   (trailing twelve months)"). Why: `A simulated assessment, not Skillsoft's dollar retention; the measurement it supported
   is withdrawn.`
4. **Card 01c, `eea43d9a`**, the same way. Why: `A simulated export of a figure Skillsoft has not reported; the measurement it
   supported is withdrawn.`
5. **Card 05, Engagements, "Produce a new run…"** (the tenant's own account has no walk; the same form and route as
   W7; added 6 Nov 2026 after Act 5 was blocked). Banner `OUTSIDE-IN HYPOTHESIS`; Note `Skillsoft's own case as it stands: the published DRR baseline of
   98%, no committed target, no measured actual.`; Run source label `Skillsoft 8-K Ex. 99.1, Q1 FY2027 release (9 Jun
   2026)`.
6. **Card 05, "Lock run 2"** (W8's form and route). Lock reason `Skillsoft's own case as it stands, locked as the record its value case and its print are
   read from.`
7. **The case under the CFO lens; Print** (the print request is recorded); save the PDF to
   `~/lvrf-backups/l41-screens/skillsoft_case_cfo.pdf`, chmod 600. Expected: both banners and the full hash on every page;
   baseline 98 % (published); no target; no actual; cost of delay refused (no committed target, no rate, no class); the
   CFO lens refusing (below 55, no actual); six asks with converting questions; the claimed impact refused, not printed.
8. **The stage-10 independent check** before any share: a subagent reads the PDF and prod read-only, records nothing, and
   reports pass or fail for every figure and footnote against the sealed payload, both banners on every page, the hash
   against `payload_hash`, and no short id.

## 15. C3b: the definition factor under the C3 rule; an "unsourced figure" erratum; one errata batch (ruled by Brad, 27 Oct 2026; **approved with D1–D6 as recommended and five conditions; built; deployed at `b410b30`; Gate C clean 1 Nov 2026 (UTC), BUILD_STATUS**)

**Value spine stages served:** `baseline` (a figure with no source on record says so) and `measure`/`verify`
(what earns confidence credit), and `return` (errata beside the runs that sealed them).

**Comes before L41 + L42 (§13).** C3's errata batch was not pressed on prod (Brad, 27 Oct 2026), so
nothing needs superseding: C3b's batch records every erratum once, after its deploy.

### What the read-only investigations found (27 Oct 2026, on prod)

- **Evidence `1632a5e0`,** the "Curia HRIS" extract (mean 214 days):
  - entered by Brad Piver, signed in as the vendor's value engineer, on 26 Aug 2026 00:43 UTC; one
    insert, never updated;
  - legacy form: no quote, no locator, no "how read". `source_verified` is set true by the body,
    with no citation opened. It is attested by "Brad Piver (external analyst of record)";
  - **the 214 figure first appears an hour earlier,** at 25 Aug 23:24, in the metric validation:
    - the metric was superseded (`e6c42f98` → `fb006457`) with source system "Curia HRIS …
      supplied by Curia";
    - outcome `e3fb0061` was created with baseline 214.
  - **Nothing from Curia exists in LVRF.** The only Curia person is the external analyst. There
    are no research prompts, results or facts for Curia, and no row names an email, a file or a
    document received from Curia.
  - **Brad's ruling (27 Oct 2026):** he does not recall a source. The record says "no source on
    record", never "invented".
- **The metric definition:**
  - both versions were confirmed by "Brad Piver (external analyst of record)", who is not
    customer-side;
  - Curia runs 3–21 (19) each earned 20 of 20 for it. The seals say only "Calculation method
    documented." and do not name the confirmer;
  - model 1.0.1 tests the confirmer only for being named and not simulated.

### Brad's rulings (27 Oct 2026)

1. **Model 1.0.2:** the definition factor gets the customer-side rule. 1.0.0 and 1.0.1 are kept as
   scorers.
2. **The credit errata add the definition points** (runs 3–21).
3. **A new erratum kind, the unsourced figure, on runs 4–21.** It says:
   - the 214 baseline and its stated source, "Curia HRIS, supplied by Curia", have no source on
     record;
   - it was entered by the vendor's value engineer;
   - nothing from Curia exists in LVRF;
   - the sealed record is unchanged.
4. **Withdraw `1632a5e0`'s link** with that reason (Brad's act, C2c's withdraw).
5. **Nothing live shows Curia's reference engagement as a "validated baseline".** Its headline
   carries both errata lines.
6. **One errata batch for all of it,** recorded once after the deploy.

### What it builds (planned)

**1. Model 1.0.2:**
- **The credit:** `metric_definition_confirmed` earns its 20 only when the definition's confirmer
  is customer-side (`lvrf_customer_side(confirmer, the metric's institution)`). Otherwise 0, with
  the note "definition confirmed by <name>, who is not customer-side (<reason>)".
- **The version:** a new constant, `DEFINITION_RULE`, joins the fingerprint, so 1.0.2 has its own.
- **The registry:** `scorers.ts` gains 1.0.2; 1.0.0 (`d4cf8f31472a`) and 1.0.1 (`cf11d21c781a`)
  are frozen as files beside it.
  - **No prod run was sealed under 1.0.1** (25 runs, none since the C3 deploy), so 1.0.1 is kept
    for M1, not for any run.
- **The seal:** 1.0.2 runs seal the definition's confirmer `{name, simulated, customer_side,
  reason, roles}` beside the factor, as C3 does for attesters. So a 1.0.2 run is recomputable.
- **The gap register and the walk:** the factor's `not_customer_side` gap is a person ask: "the
  definition must be confirmed by a customer-side person (a role named from a source)".

**2. The credit errata gain the definition points** (still one `non_customer_credit` erratum per
run, C3's kind; C3b-D2):
- **Which runs:** each locked run whose definition factor earned points while the metric's
  confirmer at sealing was not customer-side.
  - The seals do not name the confirmer. The server reads it from the metric the run sealed:
    the `business_metrics` version matching the sealed `businessMetric` (name and source system)
    and current at the run's `created_at`, with `definition_confirmed_at` at or before it (C3b-D1).
  - If that is not unique, the erratum says nothing about the factor.
- **The text,** from the seal, as C3's, gaining "20 of 20 in 'Is the metric's calculation method
  known and documented?' rest on a confirmation by <name>".
- **Expected on prod: 19.**

  | Curia runs | Points not credited | Sealed score |
  |---|---|---|
  | 3–4 | 20 | 30 |
  | 5–12 | 35 | 45 |
  | 13–21 | 45 | 55 |

**3. The unsourced-figure erratum** (`run_errata.kind = 'unsourced_figure'`, migration 0044):
- **The finding comes first.** A steward act records, on an outcome's figure (`baseline_value`,
  `actual_value` or `claimed_currency_impact`), that the record holds no source for it. It goes
  in a new append-only table `figure_findings`: outcome, field, value, reason, steward, date,
  and its act (C3b-D3).
- **What the server checks before it accepts a finding,** so the erratum's words are true (C3b-D4):
  - the figure's value as it stands;
  - **no person of the account is customer-side;**
  - **no evidence of the account has an opened citation, or a customer-side attester;**
  - **no research result or fact about the account was accepted.**

  If any of these holds, the finding is refused in words.
- **The erratum, one per locked run whose seal carries that figure at that value** (Curia: runs
  4–21, sealed `baselineValue` 214). It is built by the server from the seal and the record:
  - the figure and its stated source, from the seal's `businessMetric.sourceSystem`;
  - who entered it: the actor of the audit row that first set the value, and that person's
    title at the time ("the vendor's value engineer");
  - "nothing from <account> exists in LVRF": the finding's checks, named;
  - "The sealed record below is unchanged."
- **No recompute, no points:** the factor reads evidence, not the figure.
- **Never "invented":** a CHECK refuses an unsourced-figure erratum or a finding whose text holds
  "invent", "fabricat" or "made up" (Brad's ruling 2). The server never writes them.
- **Expected on prod: 18.**

**4. One errata batch** (C3's page, widened):
- The dry run lists every erratum the record calls for: the credit errata (19) and the
  unsourced-figure errata (18), **37** in all, each with its text, and the count of each.
- One submit carries both counts, and records one erratum and one act per row. It is refused if
  either count changed.
- **Order on prod:**
  1. the finding;
  2. the withdrawal of `1632a5e0`'s link;
  3. the batch.

  The batch reads seals, so the withdrawal does not change it.

**5. Nothing live shows "validated baseline" for it** (C3b-D5):
- **Where a figure has a current finding, a line "No source on record: <the finding's text>"
  sits beside the figure.** That covers:
  - the POV, the account page and the walk (the baseline and the metric's source system);
  - the lineage of that figure;
  - on screen and in print.
- **A run carrying a current unsourced-figure erratum** shows its sealed banner title ("VALIDATED
  BASELINE") and its provenance label (`curia_validated`) labelled "as recorded at sealing",
  each with the erratum line beneath:
  - on the run page, and on every printed page;
  - on the Runs list;
  - on the POV's locked runs.

  The sealed text is never changed or hidden.
- **The metric of the retired, frozen outcome is not superseded.** The finding's line is the
  correction.
- **The headlines** (the POV, the account page, the book, the Runs list) carry every current
  erratum line, joined. For Curia's reference engagement:
  - the credit line: "erratum: 45 of these points rest on a person who is not customer-side";
  - the unsourced line: "erratum: its baseline, 214, has no source on record".

### Gate A (planned)

**`verify_c3b.sh`,** on its own fixtures (L39):
- **The fixture:** an account worked by the vendor alone, in Curia's shape:
  - an external analyst who confirms the definition and attests a "system export";
  - a validated metric with a figure entered by tenant staff;
  - runs sealed under the 1.0.0 code itself (C2's way);
  - a second account with a customer-side metric owner, named through the role act.
- **It covers:**
  - 1.0.2's definition credit for each person;
  - fingerprints: 1.0.2 moved, 1.0.0 and 1.0.1 unchanged; each run recomputed under its own;
  - the credit dry run, points matching the script's own computation from each seal;
  - the finding and its four checks: each refused when it fails, using the second account;
  - the unsourced-figure dry run, and the erratum text read from the seal and the audit row;
  - the joint batch: both counts, refused when either is off, then one act each;
  - the live lines (POV, account page, walk, lineage, Runs list, run page, print), at 1280 and
    390;
  - the headlines with both lines.
- **Breaks:**
  - 1.0.2 crediting a non-customer-side confirmer;
  - `DEFINITION_RULE` out of the fingerprint;
  - the 1.0.1 scorer dropped;
  - the confirmer read from the wrong metric version;
  - each of the finding's four checks removed;
  - "invented" in a finding (the CHECK);
  - the batch without one of its counts;
  - the sealed banner shown without its erratum line;
  - the headline without the unsourced line;
  - the figure's live line missing on the POV.
- **Also:** the full regression and the equivalence, on a fresh prod copy. The expected diffs are
  the new keys.

### Gate B and Gate C (planned)

- **Gate B:**
  - the backup;
  - pull; migrate 0044 as `lvrf_migrate`; `ownership.sql`; `hardening.sql`;
  - the checks: triggers, plain sentences, ownership, run hashes 25/25, drift (45 migrations);
  - deploy.
- **Rule 10 (CLAUDE.md, Brad, 27 Oct 2026):** steward acts are performed by the steward, never on their behalf.
  No Gate B paste and no script performs the finding, the withdrawal or the batch, by API, browser or SQL. The
  pastes deploy; Brad acts; Gate C reads.
- **Brad's acts, through the UI:**
  1. the finding on Curia's reference outcome baseline (214);
  2. withdraw `1632a5e0`'s baseline link, with the finding's reason;
  3. the batch: the dry run reading 19 + 18, confirmed once.
- **Gate C:**
  - 19 credit errata and 18 unsourced-figure errata, each with its act;
  - the finding and its act;
  - the link withdrawn;
  - Curia runs 3–21 byte-identical;
  - the headline with both lines;
  - no live "validated baseline" without its erratum line;
  - no refusals but deliberate ones.

### Decisions for Brad

- **C3b-D1, the confirmer of an older run's definition:**
  - The seal doesn't carry it, so it is read from the metric version the run sealed, current at
    its sealing.
  - **Recommended.** The alternative, saying nothing about the definition on runs 3–21, would
    leave 20 points per run unstated.
- **C3b-D2, one credit erratum per run, carrying the definition points with the attestation and
  committer points:**
  - **Recommended.** One line per run, one count.
  - The alternative, a second kind for definitions, would put two credit errata on one run.
- **C3b-D3, the finding as its own steward act and table, before the batch:**
  - **Recommended.** It is what the live lines (POV, walk, lineage) read, and it holds the reason
    once.
  - The alternative, the batch naming the figure itself, leaves no outcome-level record for the
    live pages.
- **C3b-D4, the server checks the facts the erratum states,** and refuses a finding when any
  fails. **Recommended:** the erratum never says more than the record shows.
- **C3b-D5, sealed labels stay as sealed, labelled "as recorded at sealing", with the erratum line
  beneath them:**
  - **Recommended.** CLAUDE.md rule 6 applies by analogy: show the sealed record and the
    correction, never suppress.
  - The alternative is to stop showing the sealed banner title on live pages.
- **C3b-D6, act names:**
  - the finding uses a new act value, `find`;
  - the batch keeps `record_erratum`.

### Brad's approval and conditions (27 Oct 2026)

**D1–D6 approved as recommended,** with these conditions:

1. **D1, exact or nothing.** The definition's confirmer is read from the metric version current when each run
   was sealed: from the sealed metric id (1.0.2 seals it), or from supersession timestamps, matched to the
   sealed metric. If a run's version at sealing cannot be determined exactly, its erratum says "the confirmer
   is not recoverable from this seal" and counts no points for it. No guessing.
2. **"Verified without the source being opened"** shows on live pages beside every evidence row whose
   `source_verified` is true and that has no opened citation. On prod there are 4 such rows: Curia `1632a5e0`
   and `f9775317`, Skillsoft `9765335f` and `271a449a`. It is a derived reading and changes nothing. The
   backfill rule stays with L41.
3. **"No source on record", never "invented"; the database check is kept.** The finding's three
   preconditions stay server-checked, so "nothing from Curia exists in LVRF" is true whenever it is written.
   As built, the database re-checks them on the finding and on every unsourced-figure erratum, and the check
   matches whole words only. A name such as "Inventec", or the word "inventory", is not refused.
4. **Recorded for later (L46):** whether Curia's reference-example marker should be `outside_in_test` rather
   than `published_case_study`. Brad decides once C3b's errata are visible on screen.
5. **Brad's acts after the deploy, in order:**
   1. the finding;
   2. the `1632a5e0` withdrawal;
   3. the one batch: the dry run reading 37, 19 credit and 18 unsourced, with both counts shown before
      the submit.

### L41: what it does not yet cover (checked 27 Oct 2026)

**`source_verified` can be set true with no citation opened.**
- **How:** the evidence route takes `source_verified` from the body for any evidence that is not
  AI-sourced. Q4k's opened-citation act applies to AI-sourced evidence only.
- **On prod, 4 human-entered rows are `source_verified` with no citation opened,** all legacy form:
  - Curia `1632a5e0` and `f9775317`;
  - Skillsoft `9765335f` and `271a449a`.
- **L41 as written (§13)** makes `source_verified` final once set. It does not say who may set it
  or on what record.
- **Ruled for L41's plan (Brad, 27 Oct 2026, condition 2):** going forward, only an "opened the source" act by a
  named person sets `source_verified`.
- **Proposed for L41's plan:** `source_verified` becomes true only through an act by a named
  person who opened the source. That is Q4k's open-citation, for every evidence row:
  - with the opener, the moment and what was read (quote, locator, how read);
  - the route stops taking it from the body;
  - existing rows: a backfill rule decided in L41's plan. For example, the 4 rows are shown
    "verified when entered, no opening recorded" until an opening is recorded.

## 16. The case snapshot: a run seals the whole case (planned 1 Nov 2026; **approved by Brad, 1 Nov 2026, with CS-D1–D6 as recommended and the two additions below; batch B2, deployed at `bdf9971`; Gate C clean 5 Nov 2026 (BUILD_STATUS)**)

**The ask (Brad, 1 Nov 2026):** after L41 and before §14, payload v4 seals the case chain per run, CVAF-style, so a
locked run shows the whole case at that moment. A per-engagement snapshots view shows each run's case, the confidence
curve and what changed between runs, building on compare.

**Value spine:** `verify` and `return`. This is the renewal's proof: what was claimed at each run, and what moved it.

**Why now:** a run seals the score and the evidence, but not the argument. The hypothesis, lever, offerings, summary
and pack entry are read live on the POV, so a sealed run cannot show the case it was scored under. §14 starts
verifying actuals, which moves verdicts, so the seal has to be in place first.

### What the code holds today (31 Oct copy, read-only)

| Fact | Count or state |
|---|---|
| Runs | 25, all locked; 23 on retired reference engagements |
| Hypotheses | 1 (Scotts) |
| Levers | 1, stored `proposed` |
| Executive summaries | 5 (Scotts 4, Curia 1), per account and lens; none names a run |
| Pack entries | 26: 20 `proposed`, 6 retired, all `version` 1. **No pack version exists** |

- A run's payload is hashed when it is **produced**. Locking changes no payload byte. CVAF seals at the lock.
- `GET /api/engagements/:id/runs` refuses a retired engagement, so the view needs its own read.
- `compareRuns.ts` compares confidence, health, stage and claim, for any two locked runs of one engagement. It
  persists nothing, which CVAF also ruled. It holds nothing on the case chain or on evidence.

### Conflicts to name

1. **O2-D1 says no stored verdict.** The seal records the verdict as it read at that moment, as it does the score. The
   live verdict stays computed by `lvrf_hypothesis_verdict()`, and nobody decides either.
2. **"Pack version" has no object behind it** (CS-D3).
3. **"Its ratification":** a lever's stored status is `proposed`, while its display says ratified (O-D2a, L32). The
   seal carries `ratification {by, on}` beside the stored status, so renaming the status later changes no sealed
   reading.
4. **A summary belongs to the account, not the engagement.** Curia's two engagements would seal the same summary.

### The seal

One function, `lvrf_case_chain(outcome_id) RETURNS jsonb` (hardening section 31), is the only reader of the chain. The
seal and the lock guard both call it, so they cannot disagree. It reads:

| Sealed | What it holds |
|---|---|
| Hypotheses on the run's outcome | Every version: statement, falsifier (reference, value, recorded date, due date, conditions), `post_hoc`, author, the verdict as it read, superseded or withdrawn with reason |
| The lever of each | Name, mechanism, leading indicator, citation, stored status, `ratification {by, on}`, withdrawn |
| Offerings | Those on the outcome's capability (key, name, primary, evidence class, verification source), and those on each lever with the steward's basis |
| Executive summaries | The current version per lens on the account: body, position in its version chain, author, AI disclosure, date, the run it names if any |
| Pack entry | Name, unit, direction, definition, confounders, status, stored version, and its fingerprint (CS-D3); `null` where the metric has no pack entry |
| Marker and findings (CS-D4) | The current reference-example marker, and any figure finding on this outcome |

The result goes in as `payload.case`, with `payloadVersion: 4`, under the same `payloadHash`.

**Unchanged:**
- the confidence model stays 1.0.2 and reads nothing in `case`;
- walkSpine is untouched;
- older runs keep their bytes and are never filled in; each reads "This run was sealed before the case was";
- the POV stays live;
- `record_documents` is out of scope (L37).

**Before the build (the convention):** no table, no column and no migration. Hardening adds one function and one
trigger, 183 → 184 distinct, with journal and snapshot unchanged. It orphans nothing, because no row is written.

### The view

- **Page:** `/engagements/:id/snapshots`, linked from the run page and the POV's run list.
- **Read:** `GET /api/engagements/:id/snapshots`, tenant-scoped, which also reads retired engagements. It persists
  nothing.
- **Banners:** rule 6's disclosure banner, and O-D3's reference-example banner where one applies.
- **Each locked run, oldest first:** number, date, who locked it and why, score and band, stage, realization, baseline,
  target and actual, model version, hash, erratum line, system-exercise mark, and its case as sealed.
- **The curve:** inline SVG, by run number, using the Rule76 tokens. Rules in CS-D5. The list beside it holds the same
  numbers, so a screen reader and a phone at 390 lose nothing.
- **What changed:** compare gains a `case` block, additive: hypotheses added or superseded, verdicts moved, lever
  status, offerings added or removed, summary versions, pack fingerprint, evidence added or removed. Evidence matches
  by `evidence_id`, falling back to the kind, summary and provenance as sealed on older runs. Adjacent pairs show
  by default, and any two locked runs can be chosen.
- **Compare keeps its rule:** no narrative and no recommendation.

### Decisions for Brad

| # | Question | Recommendation |
|---|---|---|
| CS-D1 | Seal at produce or at lock? | **At produce, with the lock refused if the chain has moved.** Sealing at lock (CVAF) means rewriting the payload and hash at the lock, which breaks "the hash is the run". Instead a trigger compares `payload.case` with `lvrf_case_chain()` at the lock and refuses: "The case changed after this run was produced; produce a new run and lock that." So a locked v4 run always shows the case at its lock. The guard lives in the database, and runs without `case` lock as they do now |
| CS-D2 | Which hypotheses? | **Every version on the outcome, not only the current one.** Otherwise a supersession between runs reads as a change of mind with no record of what was replaced |
| CS-D3 | What is "pack version"? | **Seal the entry itself, plus a SHA-256 of its fields.** A pack-wide version would move when a sibling entry changes, showing changes that have nothing to do with this case. A real versioned pack is a new governed object, and a slice of its own if you want one |
| CS-D4 | Beyond your list: the marker and findings? | **Include both.** "The whole case" should say a run was a reference example as it stood, and L46 shows a marker can change. Errata stay live, read beside the seal |
| CS-D5 | What does the curve plot? | **Sealed scores only, and it never recomputes.** The line breaks where the model fingerprint differs or is unknown, or where the outcome changes, since a slope across either would be false. An erratum marks its point, and shows a corrected score only where the erratum recorded one. No score is derived by subtraction. System-exercise runs show as hollow points, not hidden. Older payloads with no `valueOutcomeId` are one unnamed series |
| CS-D6 | How is "no record" shown? | **Three states, as CVAF's:** both runs sealed the case; one did; neither did. One-sided or empty reads "this run sealed no case, so nothing can be said", never "no change" |

**Brad's additions (1 Nov 2026):**
1. **CS-D5:** a curve point carrying a current erratum shows the erratum mark.
2. **CS-D3:** when certified pack versions arrive, the seal adds the version beside the entry hash. The entry hash stays.

### Gate A

`verify_case_snapshot.sh` runs on throwaway clones, with a fixture holding a lever, a hypothesis and its supersession,
offerings, two summary versions and a marker.

| Break | Must be caught |
|---|---|
| B1 | A chain item dropped from `lvrf_case_chain()` |
| B2 | The lock guard removed: a superseded hypothesis, a new summary and a withdrawn lever must each refuse the lock |
| B3 | The verdict moved after produce (actual verified): lock refused |
| B4 | A v3 run must still lock, and its bytes must not change |
| B5 | The view on a retired engagement, and on another tenant's (404) |
| B6 | The curve joined across a model change, or an outcome change; an erratum's mark dropped from its point |
| B7 | A one-sided compare reading "no change" |
| B8 | An erratum's corrected score derived rather than read |

- NULL inputs on every chain field, and a pack-less metric, which must seal `null` rather than fail.
- The full regression, 44 scripts, on a fresh prod copy.
- Equivalence: every GET identical apart from new additive keys.
- `check_run_hashes` on every run; all locked runs byte-identical.
- Screens at 1280 and 390, looked at: a v4 run's case, the snapshots view on Curia's 21-run reference engagement, a
  mixed v3/v4 compare.
- Print to PDF and look at every page: the banner and the hash on each.
- Stop for Brad's review.

### Gate B

1. Backup: `pg_dump -Fc`, `chmod 600`, `ls -l`, TOC count, STOP.
2. Pull, `ownership.sql`, `hardening.sql` as postgres with ON_ERROR_STOP, print the exit and ERROR count, STOP.
3. Deploy, STOP.

There is no migration and no steward act. **Prerequisite:** §13 closed, including its validating paste, and its
fresh-copy addendum done.

### Gate C

Read-only:
- **186 triggers** (written as 184 on 1 Nov, before B1 added one; section 32 adds `value_runs_case_current`); no schema drift;
- run count unchanged and every run's hash and bytes unchanged;
- the function and trigger present; hardening recorded in the manifest;
- no refused act.

**What Gate C cannot show:** a v4 run on prod. Under rule 9 none is produced to exercise the system, so the first real
run is read-checked when you produce one.

## 17. Curia lot acceptance: W6 stays open (ruled by Brad, 1 Nov 2026; **both questions approved as recommended, 1 Nov 2026**; L48)

**The ruling:**
- W6 stays open. The 95.3% is an ISPE industry median, not Curia evidence, and L41's about-rule would refuse it as
  baseline support.
- The hypothesis waits for a ratified LAR lever.
- Brad authors the lever once a citation for the deviation-to-rejection mechanism is found and opened.

**Where it stands (31 Oct copy, read-only):** outcome `31d097a6`, baseline 95.3, has no evidence links, no hypothesis,
no target and no committer. Run 1 is locked at 10 / 100. The LAR pack entry has no levers. The capability already
claims the entry, so the chain the hypothesis guard requires is one lever short.

**The acts are Brad's (rule 10):** the lever, then the hypothesis. A steward's lever reads ratified under O-D2a. The
author of the hypothesis may not verify that outcome's actual (O2-D1).

**Two questions the ruling left open, both approved as recommended (Brad, 1 Nov 2026):**

1. **What does the falsifier measure against?** The database quotes the reference from the outcome at INSERT and
   freezes it. A `baseline` falsifier written while W6 is open is frozen at the ISPE median, so the test of a Curia
   claim would rest on a figure that is not Curia's. A `committed_target` falsifier needs a target a named person
   committed to, which needs §14. **Approved:** the hypothesis also waits for W6 or a commitment, whichever comes
   first.
2. **How is the opening recorded? (L49)** The lever's citation is text, so "found and opened" would not be on the
   record. **Approved:** before the lever is authored, record the source as evidence through the opened-source act, and
   name that row in the lever's citation. This needs no build. The citation becoming a reference to an evidence row is
   L49, in a slice of its own.

**W6 closes** only with evidence about Curia itself. The search that found ISPE found no rate in the Samsung Biologics,
Catalent or Lonza filings, so that most likely means a Curia source, not more outside-in research.

## 18. L52: correcting what Gate B recorded (L50, a reason on a No, the about control, a supersession batch) (ruled by Brad, 1 Nov 2026; **batch B1 of `docs/LVRF_3.0_CRITICAL_PATH.md`; deployed at `bd5cb7c`; Gate C clean 5 Nov 2026, BUILD_STATUS**)

**Value spine:** `verify`. A supersession keeps a record defensible when an act of record was wrong.

**The ask (Brad, 1 Nov 2026):** hold L50's Gate B and add to it, as one slice:
1. a "No" opening requires a reason, in the route and the database, with a break;
2. the about control always offers the tenant, other accounts and a typed party, pre-filling nothing ambiguous;
3. a supersession batch with a dry-run list showing each row's current and new statement, and what happens to its mark,
   links and lineage. Marks must carry to the successor.

**HOLD: no customer-side role is granted on prod until L52 closes** (Brad, 1 Nov 2026).

**What is to be corrected (Brad's rulings, 1 Nov 2026), as it stands on prod:**

| Item | Now | Ruled | Mark | Links | Sealed in |
|---|---|---|---|---|---|
| `cee6fea9` | about Curia | about Skillsoft | yes | none current | 16 runs |
| `f9775317` | about Curia | about Skillsoft | yes | none current | 10 runs |
| `423be7c6` | about Scotts; "about another company" | about Scotts, kept. New text: "Skillsoft-published case study naming Scotts Miracle-Gro: '75% reduction rate in recordable incidents' with Skillsoft EHS solutions; no period or baseline stated. A vendor claim about Scotts, not Scotts' own measurement." | no | impact basis, kept, on a frozen outcome | 2 runs; 3 errata name it |
| `271a449a` | No opening stands | New row: the three guidance ranges only, from the Q1 FY2027 release (8-K Ex. 99.1, 9 Jun 2026); the debt-refinancing sentence dropped unless sourced from Skillsoft's own transcript | no | impact basis, live | 1 run |
| `9765335f` | No opening stands | New row: "LTM DRR of 98%, one percentage point lower than the year ago period" | no | baseline, live | 1 run |
| Errata on Scotts runs 1 and 2 | "a vendor claim about another company" | Superseded, keeping the correction (a vendor claim is never baseline support), the reason fixed, the supersession reason saying the earlier text misidentified the story's subject | | | |

All five rows are legacy form, back no fact or entity, and name no role. `423be7c6` is AI-sourced, with no research
result. Brad opens the Skillsoft successors Yes, with the release's quote, after checking EDGAR.

**The order those rulings force:**
1. The errata go first in the batch: an erratum needs its evidence's current link, and the batch moves that link.
2. The quote goes in at the batch, not at the opening: a legacy row's successor must record a reading (L52-D5), and a
   recorded reading is final. So EDGAR is checked before the batch.

**What the about control offered at Gate B (read from the page on a clone of the deployed behaviour):** every row
offered its own account, every other account, Skillsoft, and "Another company, named", with nothing pre-filled. Skillsoft
was the last account listed, and the row's own account was the first choice.

### Decisions, as built (accepted by Brad, 1 Nov 2026, with the freeze narrowing of L52-D8, the AI origin carried, a reading at the batch, and migration 0046)

| # | Decision | Why |
|---|---|---|
| L52-D1 | **The No reason lives on the `open_citation` act**, at least 12 characters, required by the route and by `lvrf_governance_act_guard`. A Yes takes no reason | The act already holds "the route's own reason"; a column would duplicate it. The guard fires on INSERT, so earlier openings are untouched |
| L52-D2 | **The forms pre-fill nothing.** Every about control starts at "choose", from one shared component. The tenant is named as the tenant, and a failed read of the accounts stops the form rather than dropping the tenant | L41's forms defaulted to "This account", which is the choice that went wrong. A rule for "unambiguous" would be one more thing to get wrong |
| L52-D3 | **Unchanged: the batch's own proposals.** No rows wait, so it renders nothing on prod | |
| L52-D4 | **A successor keeps the row's kind, summary, source, confidence, attester, `simulated` and AI origin, and takes the new about.** It is born unverified and unopened: a person opens it. A verified row's verification does not carry | L41: only an opening verifies. Q4k: AI origin is permanent |
| L52-D5 | **A legacy row's successor needs a reading: a quote or a locator with how it was read.** `evidence_form_no_legacy` is not loosened | "Legacy" means recorded before evidence forms. So correcting `cee6fea9` and `f9775317` means Brad reads the release, and the batch records that reading. A row with a form carries its own |
| L52-D6 | **An item must change something:** the about, the text, the source, or a reading the row lacks. The dry run refuses it otherwise | L50's rule, for evidence |
| L52-D7 | **The mark carries:** a new mark on the successor with the same reason, its own `mark` act, and the old mark kept. `evidence_final` refuses a supersession that would drop it, on the single route as well | Brad's ruling. Marks are append-only |
| L52-D8 | **Links carry:** a current link moves: withdrawn from the old row and linked to the successor with the same `supports`, each with an act, and its figure checked against the reading. `evidence_final` refuses a supersession that leaves a live one behind. **One narrowing of the freeze, for Brad's ruling on `423be7c6`:** a frozen outcome takes a new link only from a row that supersedes the linked row, with the same support, from a link withdrawn in the same transaction. Nothing else changes on a frozen outcome | Otherwise a superseded row goes on supporting an outcome, and the wrong text stays on Scotts' POV. If the move breaks a guard (a baseline link to a row no longer about the account), the dry run names it and the batch is refused |
| L52-D9 | **A row backing a current fact or entity, naming a current role, or from a research result is refused in the dry run,** with what to do instead | Each has its own correction path. Found on the real rows: `423be7c6` is AI-sourced with no research result, so it can be corrected, and its successor stays AI-sourced |
| L52-D10 | **Errata and sealed runs do not move.** The dry run counts them. An erratum named in the batch is superseded through the erratum route's own code, with the same recompute | They record what happened to the old row |
| L52-D11 | **The dry run is a POST that writes nothing, and returns a hash of its plan.** The submit is refused if the count or the plan has changed since | Brad's batch rule, extended: it should be what was shown |
| L52-D12 | **The lineage names both directions:** "superseded by" on the old row, "supersedes" on the new, with the reason. The evidence card says the same | |

**Add an industry (Brad, 1 Nov 2026; B1):** `POST /api/industries`, a steward act on the Packs page: name, slug unique per
tenant, a reason of at least 12 characters, its own act `add_industry`. Refused for non-stewards in the route and by
`industries_steward_only`. No pack contract and no lifecycle. It unblocks the Utilities research for M21.

**What it could orphan:** nothing. Migration 0046 adds one enum value and writes no row. `lvrf_app` gains INSERT on
`industries`. Hardening changes five functions and adds two triggers, 183 → 185. The single supersede route now carries marks and links too, through the same code. After `423be7c6`'s link moves,
an erratum on that row can no longer be superseded through the route, because the route needs the row's current link; none
is planned.

### Not in this slice
Brad's acts. No row is corrected by a script (rule 10).

### Gate A
`verify_supersession.sh`, on throwaway clones of the 1 Nov copy, using the real rows:
- the dry run's list for each row, and nothing written by it;
- the batch through the browser, and the state after: marks, links, lineage, card;
- refusals: count changed, plan changed, no change, a fact-backed row, a role, an AI row, a move that breaks a guard;
- breaks: a No without a reason, route removed (database refuses) and guard removed (it lands); a mark dropped, route
  removed; a link left on a live outcome; the plan check removed; the about control pre-filled; the frozen move loosened.

Then the full regression, equivalence against `930c8f7`, screens, and stop.

### Gate B and C (planned)
Batch B1. Backup; pull; `ownership.sql`; `hardening.sql`; checks; deploy. Then Brad's acts: open the sources, the batch,
then the Yes openings. Gate C reads each row, its successor, mark, links, lineage and both errata. L52 closes there, and
the hold with it.

## 19. P6: the value case (B3 of `docs/LVRF_3.0_CRITICAL_PATH.md`; **plan approved by Brad, 5 Nov 2026, with the three choices as recommended; deployed at `9c93671`; Gate C clean 5 Nov 2026 (BUILD_STATUS), six days ahead of its Gate B date**)

**Value spine:** `model` and `return`: the case a CFO reads, and what it refuses.

**Rulings before the plan (Brad, 4 Nov 2026):**
1. **The case reads pack entries as they stand.** Each shows as "proposed, sourced at 0 of 2 institutions" (a count
   derived at render, never stored), with one plain line that no pack is certified, because certification is 3.1. The
   design's "the account's industry resolves one active certified pack" does not apply in 3.0.
2. **The `compliance_assurance` refusal is kept, and moves to B4.** At commit, the steward states the measure class
   beside the attribution method, and cost of delay refuses a `compliance_assurance` class with a performance rate.
   It is moot until a commitment exists.
3. **`monetization_rates` and `policy_values` are B3's migration.** Setting D = 6 months is a steward act in B3's act
   session, with its exact text in the Gate B pastes.

4. **The value case shows pack entries as they stand, without reviewer notes** (Brad, 5 Nov 2026). A reviewer's note is
   an internal review caveat; it stays on the pack page.
5. **Recommended solutioning reads only links on current levers** (Brad, 5 Nov 2026). A link under a withdrawn lever
   never appears on a case, even though the link itself still reads current (a withdrawn lever keeps its links and
   takes no new ones). The first case is `27465fb3` (Compliance Suite, its basis citing Burke et al. 2006, never
   recorded) under `d58a08c5`, withdrawn 5 Nov; only `26e9bd8c` under its successor `80dd10de` may show. **B3's Gate A
   carries a break for it:** the current-lever condition removed from the solutioning read must be caught, on a fixture
   with a withdrawn lever holding a current link beside its successor's.

**Checked (4 Nov 2026):** nothing in the CFO lens, the refusal page or cost of delay requires a ratified entry.

### The plan (approved by Brad, 5 Nov 2026)

**Value spine:** `model` and `return`. Out of B3: the War Room and the CHRO lens (3.1, the cut line); the measure class
and the attribution method (B4, ruling 2); authored `solution_recommendations` and `pack_offering_exclusions` (3.1).

| # | Part | Estimate |
|---|---|---|
| 1 | Migrations 0047 (enum values only: `governance_act` + `record_rate`, `plan`, `share`; `document_disclosure` + `shared_for_review`; a new enum value cannot be used in the transaction that adds it) and 0048 (the tables below), and hardening section 33 | 1 day |
| 2 | `lvrf_cost_of_delay(outcome)` and `lvrf_cost_of_delay_amount(baseline, target, rate, months)`; the case chain gains cost of delay (inputs and result, or every refusal reason), the roadmap and solutioning: payload v5, so B2's lock guard covers them. Runs before v5 render "not sealed in this run" | ½ day |
| 3 | Routes and forms: `/policies` (steward: set a policy value, ratify the CFO lens); record a monetization rate on the outcome; roadmap milestones; "Shared for review as an outside-in hypothesis" (steward, D-M21); the print-request record (O4). Every new route classified in `STEWARD_ROUTES` | 1 day |
| 4 | `/runs/:id/case` under `cfo` or `general`: header and both banners; executive summary; hypotheses; outcomes by lever, each entry "proposed, sourced at x of N institutions" with one line that no pack is certified, and no reviewer notes (ruling 4); cost of delay; roadmap; recommended solutioning from links on current levers only (ruling 5); what it takes to raise confidence; the confidence curve (B2). The CFO refusal page with every reason and ask; a reference example never under the CFO lens (O-D3). Print: both banners and the full hash on every page | 1½ days |
| 5 | Gate A: `verify_value_case.sh` with the breaks below, a NULL-input refusal per new CHECK, the full regression, equivalence, screens at 1280 and 390, every printed page | 1 day |

**Build Fri 6 – Tue 10 Nov; Gate B Wed 11 Nov, buffer to Fri 13 Nov.** If the buffer is needed, **roadmap milestones are cut
first**: the roadmap section then shows only the dates on record (committed target dates, falsifier due dates, open asks).

**0048's objects:**
- **`policy_values`** (insert-only, versioned by `supersedes_id`): `cost_of_delay_months` (integer 1–24) and
  `pack_ratification_institutions` (integer ≥ 1, **a value lower than the current one refused**); reason ≥ 12; steward
  only, with a `ratify` act; one current value per key.
- **`lens_policies`** (insert-only, versioned): `persona` (`cfo` only in 3.0), `min_confidence_score` 0–100,
  `admitted_bases[]` (not empty, each a basis label), `suppresses[]`, `refusal_text` ≥ 24, reason; steward only, `ratify`;
  one current per persona. **The CFO threshold lives here only** (choice 3), not also in `policy_values`.
- **`monetization_rates`** (insert-only, superseded): account, metric, `rate` ≥ 0 (zero is data), `currency`
  `^[A-Z]{3}$`, `per_unit` (**must equal the metric's unit**, by trigger), `rate_kind` (`performance` · `exposure`),
  `how_read`, `evidence_id` NOT NULL about this account; a `record_rate` act. Its basis and customer-side attester are
  read by the function, since both can change after the rate is recorded.
- **`roadmap_milestones`** (insert-only, superseded): engagement, title, `due_on` NOT NULL, owner NOT NULL and not
  simulated, optional outcome and stage (`commit` · `measure` · `verify`), status (`planned` · `done` · `missed`); done
  needs evidence; a date change is a superseding row with a reason; a `plan` act.
- **`record_documents`** gains `kind` (`rendering` · `print_request` · `share_for_review`; the five existing rows read
  `rendering`), `lens`, `shared_with`. A share names with whom, is **allowed only while both banners print** (outside-in
  and unverified), never changes the run, and is the steward's, with a `share` act. `record_documents` stays provisional
  until the Repository Constitution ratifies (named, not resolved).
- Nothing is dropped or retyped and nothing is orphaned; every new table is insert-only, so `ownership.sql`'s list is
  unchanged.

**The three choices (Brad, 5 Nov 2026, yes to all three):**
1. **Solutioning reads the sealed current `lever_offerings` of each hypothesis's lever.** Authored recommendations and
   offering exclusions are 3.1; with no exclusion table, "not excluded" is trivially true in 3.0, and the case says
   nothing that claims the check.
2. **The N in "sourced at x of N" is a policy value Brad sets** (act 2), never a number in code.
3. **The CFO threshold lives only in the CFO lens policy** (55, O-D1).

**The measure class is not the rate kind (Brad's question, 5 Nov 2026).** The class (`capability_performance` ·
`compliance_assurance`) is what kind of value the outcome is, stated by the steward at commit in B4 (ruling 2).
`rate_kind` (`performance` · `exposure`) is what the client's rate prices. Refusal 5 needs both; **neither is inferred
from the other.** Until B4, `lvrf_cost_of_delay` refuses with "no measure class stated at commit" and computes on no
outcome. B3's Gate A tests the arithmetic in `lvrf_cost_of_delay_amount` directly (the $50,000 hand calculation); B4's
Gate A prints it end to end.

**Gate A breaks, each caught:** a vendor-basis rate; a non-customer-side attester; a rate in the wrong unit; a reference
example under the CFO lens; a roadmap date edited in place; a pre-v5 run rendering a cost of delay; a policy value or a
lens by a non-steward; **solutioning reading a link under a withdrawn lever** (ruling 5: a copy of `27465fb3` under
`d58a08c5` beside a link on its successor); the "sourced at x of N" label dropped; a reviewer's note shown; a share
recorded while the run is verified or not outside-in; N lowered; D unset (the case refuses "no cost-of-delay months
set", never computes); the class absent (refused, never inferred from the rate). Plus the hand calculation: committed
1.0 against baseline 1.4 at an attested $250,000 per point per year prints $50,000 for 6 months (0.4 × 250,000 × 6/12),
and a Scotts-shaped case lists every cost-of-delay refusal reason.

### The B3 act session (after the B3 deploy; rule 10)

All on `/policies` (Policies in the nav), in any order. The forms are built to these labels, and their confirmations
to this text (verify_value_case.sh performs all three on a clone and compares each confirmation word for word). Each
form submits with its button ("Set the value", "Ratify the lens"), shows the confirmation, and records on "Confirm".

1. **"Set a policy value…"**, Policy `Cost-of-delay months`, Value `6`, Reason: `Q3, ruled 24 Oct 2026, and P6 ruling 3,
   4 Nov 2026: a delay of D months forgoes D/12 of the annual value at the committed target, undiscounted. D = 6.`
   Confirmation: "Set Cost-of-delay months to 6. No value was set before. Every cost of delay computed after this reads
   6/12 of the annual value at the committed target; no sealed run changes."
2. **"Set a policy value…"**, Policy `Pack ratification threshold (institutions' systems of record)`, Value `2`, Reason:
   `A pack entry is ratified when it is sourced from N institutions' systems of record. N = 2, as recorded (Brad, 4 Nov
   2026), and never lowered. The value case labels each proposed entry "sourced at x of N".` Confirmation: "Set Pack
   ratification threshold (institutions' systems of record) to 2. No value was set before. It can be raised later, never
   lowered; no sealed run changes."
3. **"Ratify a lens policy…"**, Persona `CFO`, Minimum computed confidence `55`, Admitted bases for an actual: only
   `system of record` and `published`, Suppresses: only `consumption metrics`, Refusal text: `The CFO lens shows a value
   case only when its computed confidence is at least 55 and every actual it reports rests on a system of record or a
   published source. This case does not meet that yet. Below is each reason, and what would meet it.` Reason: `O-D1, 12
   Oct 2026: the CFO lens threshold is 55, the medium band's floor. It admits system-of-record and published actuals
   only, and suppresses consumption metrics (LVRF_PLAN §5).` Confirmation: "Ratify the CFO lens: at least 55, admitting
   system of record and published actuals, suppressing consumption metrics. No CFO lens was ratified before. Every value
   case read under the CFO lens after this applies it; no sealed run changes."

Until they are done, every case reads "no cost-of-delay months set", "no pack ratification threshold set" and "no CFO
lens ratified", and the CFO lens refuses. Nothing falls back to a default.


### Added to B3 (Brad, 5 Nov 2026; CVAF patterns, presentation only, no new build)

1. **Every CFO refusal reason carries a converting question:** the one question the account executive asks to clear it.
   One fixed sentence per refusal reason (for example "no committed target" → "Who at the account would commit to a
   target for this metric, and by when?"), rendered beside the reason and its ask. Gate A: every reason the CFO page or
   cost of delay can give has a question (break: one removed, caught). This is a question per *reason*; the design's
   per-lever converting question belongs to the Pack Contract (P4a, 3.1).
2. **Outcomes ordered floor-first, best-evidenced first** ("the case must not depend on its weakest evidence"). The
   order key is each outcome's floor, the weakest sealed basis among its figures (design §3.1's rank), strongest floor
   first. **In 3.0 a run seals one outcome, and its hypotheses share that outcome's figures, so they share one floor:**
   the order has nothing to reorder within a 3.0 case and starts to matter once a case carries more than one outcome.
   It is built now as the one ordering function the outcomes table uses (`floorFirst`, `server/routes/valueCase.ts`).
   Gate A tests it on two outcome rows given weakest first (break: the sort removed, caught). *(Corrected 5 Nov 2026:
   an earlier line here said hypotheses within a case would be reordered by floor; they cannot be, as they share it.)*

3. **The printed case is M21, so it is built readable** (Brad's UX message, 5 Nov 2026, item 1):
   - **an executive page first:** the hypothesis; the money at stake, or the refusal; cost of delay; **every ask the
     record derives, each with its converting question** (Brad, 5 Nov 2026: "three" was wording, not a rule; an
     outside-in account has four);
   - **units and currency on every figure, one number format, and a source footnote per figure in words** (the basis
     and the source as a sentence, never a bare code);
   - **no short ids or lever codes in the customer print.** The hash and both banners stay. Short ids stay on screen,
     in the app's pickers and lists (B2);
   - **the CFO refusal page framed as "What we need from you"**, each ask with its converting question;
   - **a short glossary:** baseline, impact basis, attested, proposed;
   - **US Letter print typography; the banners visible on every page but not the loudest thing on it.**

**Estimate with 1–3:** part 4 grows by about one day. Part 1 was largely built on 5 Nov, and part 2's function and
payload v5 are done, so about 4½ days remain against Fri 6 – Tue 10: **Gate B stays Wed 11 Nov**, buffer to Fri 13
intact.

**Steward safety (Brad, 5 Nov 2026; about 1 day; B4 Gate B Sun 15 Nov with it accepted by Brad, 5 Nov), only if B3's Gate B lands Wed 11 Nov with the buffer unused.** Built
Thu 12 and shipped in **B4's Gate B** (no gate of its own), so B4's Gate B moves from Sat 14 to **Sun 15 Nov** and 3.0
is ratified about 16 Nov; M21 unchanged. Otherwise it is first in 3.1, after the P13-style audit. Its scope:
- card 01c shows current rows first, with superseded and withdrawn rows under a collapsed "History";
- simulated and system-exercise rows muted and labelled, their act buttons behind a "Show actions" toggle;
- short button labels, with the context on a line above;
- destructive acts (for example "Retire this entry") in a separate, marked zone;
- every confirmation names the item and its short id (for example "Accept CAIDI with this note: …");
- no dead ends: where a control cannot render, it says where to go.
## 20. 3.1 slice S1: a hypothesis sealed with every run; links to the value case; "one point" (planned 15 Nov 2026; **approved by Brad, 15 Nov 2026, with D1–D4 as recommended**)

Rulings it builds: R5-3.1a (a hypothesis sealed with every run, confirmed 15 Nov 2026) and R5-3.1e (the case links,
the copy fix), in the 3.1 build order's first group (before the pilot starts on 4 Jan 2027). Value spine: `model`
(the hypothesis is the model a run seals) and `return` (the value case).

### What the code holds today (read 15 Nov 2026, `642685a`)

- **A hypothesis needs a lever, and a lever needs a pack entry the outcome claims.** `value_hypotheses.value_lever_id`
  is NOT NULL; `value_levers.industry_measure_id` is NOT NULL; "State a hypothesis…" offers only current levers on the
  pack entries the account's outcomes' metrics claim (`valueHypotheses.ts`, the levers query).
- **Skillsoft has no industry** (BUILD_STATUS: "Skillsoft (no industry, 1 engagement)"), so its outcome `f23ee6a8`
  (Dollar Retention Rate, trailing twelve months) claims no pack entry and **no lever exists for it to name**. The
  tenant's own account also has no workspace (L33), so no hypothesis form.
- **Producing a run does not look for a hypothesis.** `produceRun.ts` seals whatever hypotheses stand in the case
  chain (§16), including none. `value_runs` carries `payload->>'valueOutcomeId'` (read by `lvrf_run_outcome_at_sealing`).
- **21 of the 50 verify scripts produce runs**, most on fixture outcomes with no hypothesis.
- **The case is linked only from a customer account's workspace** (`Workbench.tsx`, "The value case" and "under the
  CFO lens"). `RunPage`, `RunsIndexPage` and the tenant's own account have no link.
- **"one unit of {metric}"** is in `server/lib/caseQuestions.ts` (the rate ask and question) and
  `client/src/components/valueCase/CaseInputs.tsx`. The asks are composed when the case renders, not sealed.

### What it builds

1. **The rule, in the route and the database.** Producing a run is refused while the outcome it would seal has no
   current hypothesis (not retired, not superseded): `produceRun.ts` answers 409 with a plain sentence naming the
   outcome and "State a hypothesis…"; a `BEFORE INSERT` trigger on `value_runs` refuses the same from
   `NEW.payload->>'valueOutcomeId'`, with its plain sentence registered. **Runs already sealed are never touched**;
   nothing re-runs. A post hoc hypothesis (O2-D3) satisfies the rule and is still marked post hoc where it shows.
   One new trigger; no migration unless D3 below asks for a column.
2. **The tenant's own account gets a hypothesis path (decision D1).** Recommended: through the existing machinery, no
   schema change. Skillsoft is classified to a new industry for learning-platform vendors; its pack gains a Dollar
   Retention Rate measure through the generated research prompt and per-field accept; a steward's lever on it, citing
   an opened evidence row; the outcome's metric claims that entry; then "State a hypothesis…" on the tenant's account
   page (the same form and route as the workspace's, on the card where card 05's run controls already sit). Each of
   these is Brad's act (rule 10), in the slice's act session.
3. **Links to the value case, both lenses,** on `RunPage` (header), each row of `RunsIndexPage`, and the tenant's own
   account's run list: "Value case · under the CFO lens", the Workbench's own markup reused.
4. **"one point"**: the rate ask and question, and `CaseInputs`, read "one point of {metric}" when the metric's unit is
   a percentage, otherwise "one {unit} of {metric}" (decision D2). Every sealed run's case renders the new words; the
   equivalence pass names these as allowed differences.

### Decisions (approved by Brad, 15 Nov 2026: D1–D4 as recommended)

| # | Question | Recommended |
|---|---|---|
| D1 | How the tenant's own account gets a hypothesis | **Option A:** a learning-platform industry, a DRR pack entry by the research flow, a steward's lever, the outcome claims it; no schema change. Option B, a hypothesis with no lever on the tenant's own account, weakens the chain the case prints and needs a migration |
| D2 | The unit rule for the asks | **Percentage units read "one point"; every other unit reads "one {unit}"** |
| D3 | Must the run seal the hypothesis it was produced under by id, or is the case chain's current set enough? | **The case chain's set is enough** (§16 already seals every current hypothesis with its hash); no column |
| D4 | Fixtures: a shared helper that states a hypothesis before each produce, or each script by hand | **A shared helper** in `scripts/lib/`, so 21 scripts change by one line each and a fixture can never seal a run without one |

### Gate A (planned)

- Full regression, every verify script on clones of the 14 Nov copy (L39: fixtures built on the clone).
- **Breaks:** H1 the route check removed (the trigger still refuses); H2 the trigger removed (the route still refuses);
  H3 a retired hypothesis counted as current; H4 a superseded one counted; H5 the case link dropped from `RunPage`;
  H6 a percentage metric's ask reading "unit". Each with a positive control.
- **Every sealed run byte-identical** after the trigger installs; `check_run_hashes` all; drift none; CHECK and trigger
  counts stated; equivalence against the deployed `cd38210`, the ask wording as the named difference.
- The tenant's path rehearsed on the clone end to end (D1), with the screens.

### Gate B and the act session (planned)

Deploy with its backup and expected TOC; then Brad's acts through the page: add the industry; generate, run, parse and
accept the DRR entry; propose the lever with its opened citation; classify Skillsoft and claim the entry; state the
hypothesis on `f23ee6a8` (falsifier referenced to the published 98% baseline); produce and lock run 3; print the case
under the CFO lens. Every field's text and short id in the Gate B note. Gate C read-only, then the stage-10 check on the
new print.

## 21. 3.1 slice S2: in-app AI research (planned 18 Nov 2026; **approved by Brad, 18 Nov 2026, with D1–D10 as recommended and the conditions in §21.0**)

Ruling it builds: R5-3.1, in-app AI research with Rule76's API key (`docs/LVRF_3.0_CRITICAL_PATH.md`, "Raised 14–15
Nov 2026", approved for research only; spend option 1, 15 Nov 2026), in the 3.1 build order's first group. Value spine:
`baseline` and `attach` (the published facts and pack entries a case is built from). CVAF's `ops/ai-drafting.md`
(P1–P4) was read, read only; nothing is copied into CVAF and no CVAF client data is used.

**A conflict, named: `CLAUDE.md`'s research seam (D1) says "No code calls a research tool — a person runs the
prompt."** S2 reverses that by Brad's ruling. Under the OWN-1-D3 precedent, `CLAUDE.md` is amended only after S2's
Gate C passes (step 8 below). Until then, S2's code is the departure, and this section records it.

### 0. Brad's rulings (18 Nov 2026)

Approved with D1–D10 as recommended, and these conditions:

- **D1: Claude Opus 5.5.** A new ruling, replacing the 15 Nov "strongest model generally available". Brad's reason:
  Opus 5.5's results already pass review (35 of 43), it costs half as much, and its retention is lighter (Fable 5.2 has
  no zero-retention option). Switching later stays a setting plus a new clearance for each account.
- **D2: the separate system user,** not the root-only env file alone. No `brad` process, and no Claude session, may ever
  be able to read the key. **What that takes, as built:**
  - **The research process** runs as its own system user, `lvrf-research`, under its own unit
    (`ops/lvrf-research.service`). It is the only process that holds the key, from `/etc/lvrf-research.env` (root, 600,
    read by systemd).
  - **The API reaches it over a unix socket,** `/run/lvrf-research/sock`, in a group that `brad` is in. The process
    builds every request itself from its own fixed settings, and accepts only a prompt and a call id. So a `brad`
    process can ask for a research call, which the Console's limit caps, but cannot obtain the key.
  - **Its code is not writable by `brad`.** It runs one bundled file installed root-owned at
    `/opt/lvrf-research/sidecar.mjs`. If it ran code from `/srv/lvrf`, which `brad` owns, a `brad` process could change
    it to print the key.
  - **It refuses to start** in production if its own user owns `/srv/lvrf`, or if its code file is writable by anyone
    but root.
  - **Named:** root can read anything, and Brad's interactive `sudo`, with its password, is root. A Claude session's
    `sudo -n` fails (no password), and Gate B checks that read-only.
- **D5 as recommended.** S2's act session adds Brad's acts sourcing or retiring Skillsoft's two unsourced "system" facts
  before any Skillsoft call, with each act's text drafted.
- **D8: an exact version,** with `npm audit` run and reported; never `npm audit fix --force`.
- **The cap:** the workspace limit stays equal to Brad's Pro fee, **$20 a month**. After Brad's first test calls, the
  actual cost per call is reported against §21.3's estimates, so the cap can be revisited before 4 Jan 2027.
- **The disclosure states 30 days,** the longer reading.
- **Built to Gate A on clones of the prod copy, against the local stand-in only.** No real API call before Brad's act
  session.

**The socket (Brad's question, 18 Nov 2026), and his rulings with it:**
- **The question.** `brad` was to join the socket's group, so any `brad` process could reach the research process
  without going through the API. Did that process itself enforce the clearance, the spend check, the per-account daily
  cap and the audit rows? **As first built, it did not:** it took a prompt's text and its SHA-256 from the request and
  sent it. **Fixed.**
- **As built now:**
  - The socket takes `{ call_id }` alone.
  - The research process connects to Postgres as its own role, `lvrf_research`, by peer authentication (no password),
    with SELECT on the four research tables it reads and INSERT on the three it writes. The ownership check fails on any
    other privilege.
  - It reads the `sent` row and the prompt's text from the database, never from the request. It refuses, recording why
    in `research_process_refusals`, unless:
    - the call was recorded as sent, for its model;
    - the clearance is current for the prompt's account (or industry) and model;
    - the prompt's SHA-256 matches;
    - the account is within the daily cap and the month within the spend limit, both from its own root-owned
      `/etc/lvrf-research.env`.
  - It claims the call once, ever (`research_call_claims`), sends it, and writes the `result` row itself.
  - The API reads the limits from the process's status, so there is one limit, and `brad` cannot raise it.
- **Who needs the group: only the API process** (`SupplementaryGroups=lvrf_research` in `ops/lvrf-api.service`); the
  user `brad` does not join it. The OS user is renamed `lvrf_research`, matching its role.
- **Named:**
  - The API runs as `brad`, so a `brad` process could change the API's code and restart it with the group. The
    process's own checks are therefore the barrier, not the socket's permissions.
  - Two checks stay the API's alone: that the prompt is current, and D5. A `brad` process with `lvrf_app`'s database
    URL could insert a prompt of its own and a `sent` row for a cleared subject, which the process would send, within
    the caps. Closing that would mean the process composing the prompt itself, which needs it to read the accounts'
    facts and evidence.
- **Brad's ruling on the two residuals (18 Nov 2026): accepted as recorded residual risk, not fixed in S2.** His
  reason: anything that can act as `brad` can already read the database and send its contents anywhere without the
  key. The research process's own checks protect the key and the spend, which is D2's purpose, and S2-1 and S2-1b cover
  the published-rows rule against the API's own bugs. To revisit when LVRF first holds confidential customer-side data:
  the process building its own prompt from a root-owned copy of the composer (3.1 list).
- **Rulings:**
  - No full rerun of S2's first Gate A. 49 of 51 ran on the final product code, and the other 2 changed only their
    assertions and passed on their own.
  - The three departures are approved: the per-model clearance, the import as a person's act, and the paste path
    leaving out the same rows.
  - `npm audit fix` (plain) for `body-parser` and `qs` is a separate small change after S2's Gate C, with its own
    regression, never `--force` (3.1 list).
  - The correction of Scotts' entity can wait; it is not a pilot account.

**Ruling on Gate A's two findings (Brad, 18 Nov 2026):**
- **A row that fails D5 is left out of the prompt, and never sent.** The research page lists each row left out, with
  its short id and why. The call is refused only if a row that fails D5 would still be in the prompt, which a Gate A
  break proves, with a positive control.
  - **As built:**
    - `composeAccountPrompt` leaves out a fact or the disclosure regime that fails D5. The prompt names only the left-out
      kinds ("LEFT OUT (n)…"), never a value, and says the regime is "on record, but left out".
    - The account prompt's template goes from v2 to v3. The paste path shares the composer, so it leaves out the same
      rows.
    - The call tests again every row the prompt carries. The pinned entity cannot be left out of a facts-phase prompt,
      which names it, so an entity that fails D5 refuses the call. That is Scotts today: its entity was recorded before
      evidence forms.
- **No supersession of Scotts' rows, and no act on `f1e2385e`, is needed for S2.**
- **"A route to retire a fact" goes to the 3.1 list.**

### 1. What the code holds today (read 18 Nov 2026, `0653630`; sizes from the 14 Nov prod copy)

- **The generated prompt.** `server/research/contracts.ts` holds one contract per result kind (industry measure v3+,
  institution fact), read by the prompt builder, the parser and the accept mapping.
  - `POST /api/industries/:industryId/research-prompts` (`industryResearch.ts`) builds the pack prompt from live rows:
    the industry, the current entries and the exclusions.
  - `POST /api/institutions/:institutionId/research-prompts` (`accountResearch.ts`) builds the account prompt: the
    account's name and website, the pinned entity, the disclosure regime, the current `institution_facts` (each as
    `kind: value (as of …)`) and the accepted not-found reasons.
  - Each prompt is stored in `research_prompts`, immutable, with its SHA-256 and its contract and template versions.
  - The four prompts on record are 2,423–3,166 characters (about 700–900 tokens).
- **Parse.** A person pastes the answer into the parse route. It is kept in `research_imports` exactly as pasted, with
  its SHA-256: the one import on record is 27,205 bytes.
  - It is refused whole on any issue, with each issue named and recorded in `refusals` (source `parser`).
  - It must name the prompt it answers, of the same contract version.
  - Each field becomes a `research_results` row (`raw_response` is the one object for that field).
- **The entity check.** Account research runs in two phases. The entity is pinned first: one legal entity with one
  exact identifier, resting on a quote. Every fact must then be about that entity; an answer about another entity is
  refused whole.
- **The per-field accept.**
  - A person accepts or rejects each field: authorized for account facts (H2), the steward for pack entries.
  - Accepting a found field requires the person to say they opened its citation (H1). The evidence row is written
    `citation_resolved` by that person, through the one writer (`institutionFactWriter.ts` for facts).
- **`ai_sourced`.**
  - It is read from the answer's envelope, with `research_query`, `query_as_executed` and `research_tool`, and carried
    to the evidence row at accept.
  - AI-sourced evidence is born unverified. It is verified only when its citation is opened (AMENDMENT-005;
    `evidence_ai_verify_requires_resolution`), and the origin is permanent: a successor carries it.
  - The 43 results on record (35 pack, 8 account) name the tool as the model in a chat: 35 Claude Opus 5.5, 4 Claude
    Sonnet 5, 4 "Claude Cowork". 39 of them name web search.
- **No code calls a model.** `researchPrompt.ts`'s header: "nothing in this system calls a model". There is no
  Anthropic dependency in `package.json`.
- **The API's environment** is `/srv/lvrf/.env` (`ops/lvrf-api.service`, `EnvironmentFile=`), owned by `brad`. The
  deploy script and the read-only checks `grep` it for `DATABASE_URL`.

### 2. The server call

**One module calls Anthropic: `server/research/apiCall.ts`.** It is the only importer of the SDK; a lint rule and a
Gate A grep refuse any other. The SDK is `@anthropic-ai/sdk`, pinned to an exact version (D8).

**The flow,** on the account's Research step or the pack's research page ("Research with Claude…", beside "Copy the
prompt"):

1. The person generates the prompt, as today. The button acts on that `research_prompts` row only; nothing is
   regenerated.
2. **Refused before anything is sent**, each answered in a plain sentence, recorded in `refusals` (source `route`),
   with no `research_calls` row:
   - **the key is absent**, or the switch is off (`LVRF_AI_RESEARCH=off`): 503, "In-app research is not set up on
     this server; copy the prompt and run it yourself.";
   - **the subject is not cleared, or is cleared for a model kept for less time** than the configured one: 403. A
     subject is the account, or the industry for pack research (D3);
   - **the prompt carries a customer-side row** (D5): 409, naming each row (its kind, short id and why it is
     customer-side);
   - **the month's spend would pass the limit** (D4): 429, with the month's recorded spend and the limit;
   - **today's limit for this subject is reached** (D10): 429;
   - **a call for this prompt is already running or has answered**: 409. One call per prompt; a new call needs a new
     prompt;
   - **the prompt is not current**: another tenant's (404), of a superseded contract version, or for an entity since
     superseded (409).
3. **The audit row before the call.** One `research_calls` row of kind `sent` is inserted and committed before the
   request leaves. It records:
   - the prompt's id and SHA-256;
   - the model, the API version and the tools with their caps;
   - the clearance it relies on;
   - the person;
   - the request's SHA-256.

   That row is the record that the prompt left the box. Its insert writes an `audit_log` row with the actor.
4. **The request,** streamed to `https://api.anthropic.com/v1/messages` with these fields and no others:
   - `model`;
   - `max_tokens` 32,000;
   - `output_config.effort` `high`;
   - `messages`: one user turn, which is **the prompt text exactly as stored**, byte for byte;
   - `tools`: `web_search_20260209` (`max_uses` 10) and `web_fetch_20260209` (`max_uses` 6, `max_content_tokens`
     20,000, `blocked_domains` `["lvrf-rule76.com"]`).

   It carries no system prompt, no `metadata`, no person's name or email and no other row. There is no `fallbacks`:
   the model that receives the prompt must be the model the subject was cleared for (D9). `pause_turn` is continued
   with the same request (the documented server-tool pattern), up to 3 times. The whole call has a 15-minute timeout.
5. **The audit row after the call,** whatever happened: one `research_calls` row of kind `result`, naming the `sent`
   row. It records:
   - the outcome: `imported`, `unparseable`, `refused` (`stop_reason` `refusal`), `truncated` (`max_tokens`),
     `failed` (an HTTP or stream error, its type and status, never its headers) or `timeout`;
   - Anthropic's request id;
   - the usage: input, cache write, cache read and output tokens, and web search requests;
   - the cost, computed from a price table in code with the date it was read;
   - on `imported`, the `research_imports` id.

   A `sent` row with no `result` row, after a restart, reads "interrupted: no answer recorded". Nothing is retried
   automatically.
6. **Import, through the same path as a paste.** The final text is the answer's text blocks, joined in order; the
   search and fetch blocks are not part of the answer.
   - It goes to the same parse function the paste route uses, extracted inside `industryResearch.ts` and
     `accountResearch.ts` and exported, so those two files stay the only writers of `research_imports` and
     `research_results`.
   - The import is attributed to the person who started the call.
   - Every parse rule holds, plus two for an answer from the API:
     - the envelope's `ai_sourced` must be `true`;
     - its `research_tool` is recorded as the server states it: "{model} via the Claude API, with web search and web
       fetch, call {short id}". The model's own claim is kept in the raw answer.
   - A parse refusal is recorded as today, and the call's result row reads `unparseable`.
7. **Review is unchanged.** Every field is accepted or rejected by a person, with its citation opened (rule 4,
   AMENDMENT-005). Nothing found by the call reaches a fact or a pack entry until then.

**The key.** It is Rule76 Consulting LLC's, in its Console organisation's LVRF workspace, and it lives on the box only,
in `/etc/lvrf-research.env` (root, 600). systemd reads that file as a second `EnvironmentFile=` before it starts the
API as `brad` (D2). It is never in `/srv/lvrf/.env`, the Mac, the repo, a browser, a log, an audit row, a refusal, a
response or a `research_calls` row.
- The server logs one line at start: `[ai-research] on: {model}, {limit} per subject per day, ${cap} a month` or
  `[ai-research] off: no key`, and never the key.
- The deploy refuses to proceed if:
  - `ANTHROPIC_API_KEY` is in `/srv/lvrf/.env`;
  - `ANTHROPIC_BASE_URL` is set anywhere in production (production talks to `api.anthropic.com` only);
  - the env file is not root 600.
- The verify scripts refuse to run if the Mac's `.env` files hold `ANTHROPIC_API_KEY`.

**Outside-in material only.** What leaves the box is the stored prompt, and nothing else. The prompt is built only from
the rows listed in §21.1, and D5 refuses one that carries a customer-side row. Web search and web fetch reach only
public pages, and `lvrf-rule76.com` is blocked.

**Each subject is cleared, with a reason, before its data is sent** (D3).
- `research_clearances` is insert-only and holds a clearance or a withdrawal. Each records:
  - the subject (an account or an industry);
  - the model and its retention class;
  - **the disclosure text exactly as shown, with its SHA-256**;
  - the reason;
  - the person.
- A withdrawal is a new row naming the clearance; nothing is edited.
- A clearance covers only a model kept for no longer than the one it names (CVAF P3): moving from Opus 5.5 to Fable 5.2
  needs a new clearance.
- Each clearance and withdrawal writes a governance act (new acts `clear` and `withdraw_clearance`).

**Calls stop at the spend limit** (D4).
- The Console's monthly limit on the LVRF workspace is the hard stop.
- Prepaid credits with auto-reload off are a second one.
- LVRF's own ledger, the sum of the month's recorded call costs, refuses a call before it is sent when the month's
  spend plus one capped call would pass `LVRF_RESEARCH_MONTHLY_USD`. So a call is never cut off mid-way by the Console.
- A call the Console stops anyway is recorded `failed`, with Anthropic's error type.

**Web search is needed.** The answers this system accepts cite filings and publications dated after a model's training
cutoff (June 2026 for both models): Skillsoft's Q2 FY2027 release is dated 9 Sep 2026. And every accepted field's
citation must be opened by a person, so it must exist. Without search, the call would recall rather than read, which is
the fabrication `CLAUDE.md` names as the worst failure.
- **Search costs $10 per 1,000 searches ($0.01 each)**, plus the result content as input tokens.
- **Web fetch has no charge of its own**: only the fetched content's tokens.
- The code execution behind their dynamic filtering is free when used with them.
- At the caps above (10 searches), search adds at most $0.10 a call. Content tokens are the larger cost, and they are in
  the estimates below.

### 3. The model (D1, for Brad)

**Read 18 Nov 2026:** platform.claude.com/docs/en/about-claude/pricing,
platform.claude.com/docs/en/models/overview, platform.claude.com/docs/en/manage-claude/api-and-data-retention,
support.claude.com/en/articles/15425695 (Covered Models), privacy.claude.com/en/articles/7996866 (commercial
retention), platform.claude.com/docs/en/manage-claude/workspaces (spend limits) and claude.com/pricing (Claude Pro).

| | Claude Fable 5.2 (`claude-fable-5-2`) | Claude Opus 5.5 (`claude-opus-5-5`) |
|---|---|---|
| Price per MTok | $8 input, $40 output; cache read $0.20 | $4 input, $20 output; cache read $0.20 |
| Anthropic's guidance | "for demanding reasoning and long-horizon agentic work, or when your evals on Claude Opus 5.5 at higher effort still fall short" | "If you're unsure which model to use, start with Claude Opus 5.5" |
| Retention | **A Covered Model** (designated 9 Nov 2026). "Prompts and model completions are retained for at least 30 days and then automatically deleted", for safety monitoring by automated systems. ZDR not available | Standard commercial terms: "we automatically delete inputs and outputs on our backend within 30 days of receipt or generation", up to 2 years if flagged under the Usage Policy |
| Training | "Retained data is never used for model training without your express permission" (both) | the same |
| Default effort | `high` | `medium` (S2 sets `high` explicitly) |
| Record | none of the 43 results on record | 35 of the 43 results on record name Opus 5.5; every accepted field was reviewed by a person |

**A wording to name.** The retention page also says "Conversation content (your prompts and Claude's outputs) is not
retained by default". The commercial privacy page says inputs and outputs are deleted "within 30 days". S2 discloses the
longer reading, 30 days, for Opus 5.5.

**Estimated cost per call.** One prompt is one Messages request; its search and fetch content counts as input. These are
estimates, not measurements: the first calls at the act session measure them (`usage` on the result row, against the
Console).

| Per call | Input tokens | Output tokens (thinking and JSON) | Searches | Opus 5.5 | Fable 5.2 |
|---|---|---|---|---|---|
| Light (a pinned entity, few sources) | 80,000 | 8,000 | 5 | **$0.53** | **$1.01** |
| Typical (the answers on record are 1–27 KB of JSON) | 200,000 | 16,000 | 10 | **$1.22** | **$2.34** |
| At the caps (32,000 output, 10 searches, 6 fetches of 20,000) | 500,000 | 32,000 | 10 | **$2.74** | **$5.38** |

The input figures assume each round of search re-reads the conversation uncached. Cache reads ($0.20/MTok on both)
would lower them, so these lean high.

**Calls a month under a limit equal to Claude Pro** ($20 billed monthly, or $17 a month billed annually; before tax):

| Limit | Opus 5.5: typical (light–capped) | Fable 5.2: typical (light–capped) |
|---|---|---|
| $20 | **16** (37–7) | **8** (19–3) |
| $17 | **13** (32–6) | **7** (16–3) |

An account takes two calls (the entity, then the facts), and a pack one. So at $20 that is about 8 accounts a month on
Opus 5.5, or 4 on Fable 5.2.

**Recommended: Opus 5.5.**
- It costs half as much, so twice the calls fit under the same limit.
- Anthropic's own guidance starts there.
- The research on record was done with it and passed review.
- It is not a Covered Model, so nothing is held for a safety-review window.
- A person reviews every field, which is the quality gate whichever model runs.

**This departs from the 15 Nov wording ("the strongest model generally available"),** which reads as Fable 5.2. Brad
rules. Moving to Fable 5.2 later is a setting (`LVRF_RESEARCH_MODEL`) and a new clearance for each subject (§21.2).

### 4. The retention disclosure, word for word

The page shows the text for the configured model before the clearance is recorded. The clearance stores the text shown
and its SHA-256. `{model}`, `{subject}` and `{date}` are filled from the configuration and the row.

**For Opus 5.5:**

> Research with Claude sends this {account's | industry's} research prompt, exactly as generated and nothing else, to
> Anthropic's API, where Claude Opus 5.5 (claude-opus-5-5) runs it with web search and web fetch. Under Anthropic's
> commercial terms, the prompt and the answer are deleted from Anthropic's systems within 30 days, or kept up to 2 years
> if flagged under Anthropic's Usage Policy. They are not used to train models without Rule76's permission. The sites
> Claude searches and fetches may keep their own records of those requests. A prompt that would carry anything from
> {subject}'s side, rather than what it publishes, is refused and not sent. Anthropic's terms read on {date}; they are
> re-read before a new account is cleared.

**For Fable 5.2** (the second sentence's retention clause differs):

> Research with Claude sends this {account's | industry's} research prompt, exactly as generated and nothing else, to
> Anthropic's API, where Claude Fable 5.2 (claude-fable-5-2) runs it with web search and web fetch. Claude Fable 5.2 is
> one of Anthropic's Covered Models: Anthropic keeps the prompt and the answer for at least 30 days for safety
> monitoring, where automated systems review them, and then deletes them; zero data retention is not available for it.
> They are not used to train models without Rule76's permission. The sites Claude searches and fetches may keep their
> own records of those requests. A prompt that would carry anything from {subject}'s side, rather than what it
> publishes, is refused and not sent. Anthropic's terms read on {date}; they are re-read before a new account is
> cleared.

The same text sits on the Research step above "Research with Claude…" whenever the subject is cleared, so the person
sending sees what the clearance said.

### 5. The 3.1 steward-form item, applied to S2's forms

S2 adds three forms and touches none of the existing ones (the parse and accept forms are unchanged):
- "Clear for research with Claude…";
- "Withdraw the clearance…";
- "Research with Claude…".

For each:
- **A confirmation with each field's full text before recording,** with no slice and no ellipsis.
  - The clearance's confirmation shows: the subject's name and short id, the model, the disclosure in full, and the
    reason in full.
  - The withdrawal's shows: the clearance's date and reason in full, and the withdrawal's reason in full.
  - "Research with Claude…" shows:
    - the prompt's short id and SHA-256;
    - the subject;
    - the model;
    - the clearance it relies on;
    - the caps;
    - this month's recorded spend and the limit;
    - "This sends the prompt shown above to Anthropic and cannot be called back."
- **The route refuses a value identical to another field's in the same request.** Two cases:
  - the clearance's reason against the subject's name or the disclosure;
  - a withdrawal's reason against the clearance's own reason. A withdrawal must say something of its own.

  The refusal is a plain sentence, recorded in `refusals`.
- **Reasons:** at least 12 characters, as elsewhere. Every new CHECK is definite under NULL (`IS NOT NULL` or
  `coalesce`), with a NULL-input refusal among the breaks.

### 6. What Brad does himself, outside the code

**Before Gate B, in the Claude Console** (Rule76 Consulting LLC's organisation):
1. Create the workspace **LVRF**. Spend limits can't be set on the Default Workspace.
2. **Settings → Spend limits → Workspace limits → LVRF → Monthly spend limit:** the Claude Pro fee. Add an email
   notification at half of it.
3. **Billing:** prepaid credits, **auto-reload off**.
4. **Data retention:** leave the organisation's standard retention as it is. For Opus 5.5, nothing to change. For
   Fable 5.2, the workspace must have standard (30-day) retention, or its requests are refused with a 400.
5. **Web search:** check that the organisation allows it. An administrator can disable it, and then every call fails.
6. **Create an API key in the LVRF workspace,** named `lvrf-srv1862778`. It is shown once. It goes from the Console
   page straight into step 7's silent prompt: not a note, a file, a chat (this session included) or a terminal's output.

**The key's path to the box.** The Console shows the key in the browser where it is created, so it reaches the Mac's
screen and, if copied, its clipboard. That cannot be avoided, short of creating it on another device. It is never
written to the Mac. On the box, in Brad's own ssh terminal (not a Claude session), as `brad`:

```
sudo test -e /etc/lvrf-research.env && sudo grep -c '^ANTHROPIC_API_KEY=' /etc/lvrf-research.env || echo 0   # 0
grep -c '^ANTHROPIC_API_KEY=' /srv/lvrf/.env                                                                    # 0
read -rs -p 'Anthropic key: ' K; echo
[ ${#K} -gt 40 ] && printf 'ANTHROPIC_API_KEY=%s\n' "$K" | sudo sh -c 'umask 077 && cat >> /etc/lvrf-research.env' \
  && echo "key written" || echo "NO KEY: nothing written"
unset K
sudo stat -c '%a %U:%G' /etc/lvrf-research.env                                                                  # 600 root:root
```

Then, on the Mac: `pbcopy < /dev/null` clears the clipboard.
- `read -s` keeps the key off the screen and out of the shell's history.
- `printf` is a shell builtin, so the key is never a process argument.
- The paste reaches the box over ssh, encrypted.

**A smoke test with no client data,** before any prompt is sent: one request, "Reply with the word OK", through
`scripts/ai_research_smoke.ts`. The key goes to it on stdin from the root-only file, and the test prints the model, the
request id and the answer, never the key.

**Then turn it on:** `sudo systemctl restart lvrf-api`, and check:
- the start line reads `[ai-research] on: …`;
- `journalctl -u lvrf-api --since "-5 min" | grep -c ANTHROPIC_API_KEY` prints 0;
- `| grep -c 'sk-ant'` prints 0.

**The dollar limit is recorded at Gate B:**
- the amount Brad set in the Console;
- whether it is the monthly ($20) or annual ($17) Pro figure;
- the prepaid credit bought, and auto-reload off;
- `LVRF_RESEARCH_MONTHLY_USD` set to the same amount.

### 7. Decisions, Gate A, Gate B and the act session, Gate C

**Decisions for Brad:**

| # | Question | Recommended |
|---|---|---|
| D1 | The model | **Opus 5.5** (§21.3). Fable 5.2 doubles the cost per call and is a Covered Model |
| D2 | Where the key lives | **`/etc/lvrf-research.env`, root 600, as systemd's second `EnvironmentFile=`** (CVAF's pattern). **Named:** the API runs as `brad`, so any process running as `brad`, including a read-only ssh session, could read the key from `/proc/<pid>/environ`. A read-only check over ssh never reads that file or that path, and every check of the key counts lines and never prints them. The stronger option, a separate system user for a small research process that alone holds the key, costs about a day more |
| D3 | What is cleared, and who clears it | **Each account, and each industry for pack research, cleared by the steward** with a reason and a governance act. Sending data out is a decision about it, not an act of recording; it is model-bound by retention, and withdrawn by a new row |
| D4 | How calls stop | **The Console's workspace limit and prepaid credits (the hard stops), and LVRF's ledger** refusing a call before it is sent when the month's spend plus one capped call would pass `LVRF_RESEARCH_MONTHLY_USD` |
| D5 | What counts as a customer-side row | **A prompt may carry a row only if it is outside-in:** its evidence cites a source (`source_reference`), rests on a quote or a locator, is not `attestation`, `system_export` or `assessment_result`, is not simulated, and is linked to no value outcome. Any other row refuses the call, named. One rule for every account, the tenant's own included. **Named:** on the 14 Nov copy, Skillsoft's two `system` facts ("Skillsoft records value realization in LVRF", statements by Brad, no source) would refuse a Skillsoft call while they stand; the three Scotts facts from a job posting pass |
| D6 | Scope | **Both prompt kinds:** account research and pack research, through the one module |
| D7 | How the page waits | **An in-process job:** the route answers 202 with the call's id and the page follows its `research_calls` rows. A call takes minutes |
| D8 | The client | **`@anthropic-ai/sdk`, pinned to an exact version** (the official SDK; streaming and `finalMessage`). A new dependency; `npm audit` read, never `--force` |
| D9 | Refusal fallbacks | **None.** A fallback would send the prompt to a model the subject was not cleared for. A refusal is recorded `refused`, and the person can still copy the prompt and run it themselves |
| D10 | Caps | **10 searches, 6 fetches of at most 20,000 tokens, 32,000 output tokens, effort `high`, 15 minutes, 3 calls per subject per UTC day**, all settings |

**Gate A (planned).**
- **No real model in Gate A.** Every call goes to a local stand-in (`scripts/lib/fakeAnthropic.mjs`, through
  `ANTHROPIC_BASE_URL`, which only a non-production server accepts), with a placeholder key. The stand-in records each
  request it receives.
- Full regression, every verify script in one run, on clones of the prod copy, with the act rehearsals through the
  page.
- **Breaks, each with a positive control:**
  - **S2-1, a customer-side row in the prompt:**
    - an account fact resting on a `system_export` row is refused 409 and named;
    - the stand-in receives 0 requests, and there is no `sent` row;
    - **control:** the same account with that fact superseded by an outside-in one sends 1 request.
  - **S2-2, an uncleared account:**
    - 403, 0 requests;
    - **control:** the steward clears it through the page, and it sends.
  - **S2-3, cleared for a shorter-kept model:**
    - cleared for Opus 5.5, configured for Fable 5.2: 403;
    - **control:** a new clearance naming Fable 5.2 sends.
  - **S2-3b, a withdrawn clearance:** 403. **Control:** cleared again, it sends.
  - **S2-4a, LVRF's spend limit reached:**
    - the month's recorded cost plus one capped call over the limit: 429, 0 requests;
    - **control:** under the limit, it sends.
  - **S2-4b, the Console's limit reached:**
    - the stand-in answers with Anthropic's spend-limit error;
    - the result row reads `failed` with the error type, nothing is parsed and no import is written;
    - **control:** the stand-in answers normally, and the import is parsed.
  - **S2-5, the key absent:**
    - 503, the page says research with Claude is not set up, and copying the prompt still works;
    - **control:** with the placeholder key, it sends.
  - **S2-6, the key nowhere it should not be:**
    - after the full run, the placeholder key's text appears 0 times in the journal, in `research_calls`, `audit_log`,
      `refusals`, any response body, `client/dist` and the repo;
    - **control:** the stand-in saw it in the `x-api-key` header on each request.
  - **S2-7, production with `ANTHROPIC_BASE_URL`:** the server refuses to start, and the deploy refuses.
    **Control:** without it, it starts.
  - **S2-8, the request is exactly the prompt:**
    - the stand-in's received user turn equals `research_prompts.prompt_text` byte for byte, and its SHA-256 the
      stored `prompt_sha256`;
    - the request carries no fields beyond those listed in §21.2;
    - **break:** a server that appends a line to the prompt fails the check.
  - **S2-9, the audit rows:**
    - every call has its `sent` row before the stand-in sees the request, and its `result` row after;
    - a stream cut short reads `failed`, and the 15-minute timeout (shortened in the test) reads `timeout`;
    - `refusal`, `max_tokens` and an unparseable answer each read as their outcome, with nothing parsed;
    - **control:** a good answer reads `imported`, with its import id.
  - **S2-10, append-only:**
    - `UPDATE`, `DELETE` and `TRUNCATE` on `research_calls` and `research_clearances` are refused as `lvrf_app`;
    - neither table is in `db/ownership.sql`'s update list.
  - **S2-11, a second call for the same prompt:** 409. **Control:** a new prompt sends.
  - **S2-12, the envelope says `ai_sourced: false`:** refused at parse. **Control:** `true` passes.
  - **S2-13, the forms (§21.5):**
    - a clearance reason identical to the subject's name, and a withdrawal reason identical to the clearance's, are
      each refused;
    - each confirmation shows every field in full, checked against the typed text, with no `…`;
    - **controls:** distinct reasons are recorded.
  - **S2-14, NULL inputs:** each new CHECK refuses its NULL case.
  - **S2-15, another tenant's prompt or subject:** 404.
  - **S2-16, the module boundary:** a second file importing the SDK fails the lint rule and the grep.
- Equivalence against the deployed main on every GET: no difference except the new research fields.
- Build and lint are clean, and drift is none. CHECK and trigger counts are stated, and the TOC after the migration is
  measured on a clone.

**Gate B (planned).**
1. Fast-forward merge and push.
2. On the box, a backup, with the TOC measured from the latest dump and expected as Gate A states.
3. The migration (`research_calls`, `research_clearances`, the two acts, their CHECKs). Then `db/ownership.sql`, then
   `db/hardening.sql`, with the trigger count Gate A states and 0 ERROR lines; then the TOC after.
4. Deploy **with no key**, so the feature is off. Expect `[ai-research] off: no key`, the bundle Gate A names, steps 5b
   to 5d, health 200, and the Research step's button saying it is not set up.
5. Brad's steps from §21.6: the Console, the key, the smoke test, the restart and the checks. **The dollar limit is
   recorded here.**

**The act session (rule 10: Brad's, through the page).**
1. Choose the first subject: an account due for research, or a pack.
2. Clear it, with its reason (where the client's agreement allows this, for an account).
3. Generate its prompt; "Research with Claude…"; confirm.
4. When it answers, review each field as today, opening each citation.
5. **The first calls' measured cost goes in BUILD_STATUS** against §21.3's estimate and the Console's usage page.

**Gate C (read-only, as `lvrf_app`, over ssh with the LVRF key alone).**
- Migrations, drift, CHECKs with sentences, triggers, ownership and TOC as Gate B left them.
- **Calls:**
  - each `sent` row has one `result` row;
  - each `imported` result names an import whose SHA-256 is recorded;
  - each call relies on a current clearance for its model;
  - the recorded cost totals no more than the Console's for the same days;
  - no call while uncleared or over the limit.
- **Clearances:** each is Brad's, with its disclosure's SHA-256 matching the text in code for that model, and one `clear`
  act each.
- **The key:**
  - `grep -c` for `ANTHROPIC_API_KEY` and for `sk-ant` in the journal since the deploy: 0;
  - `/etc/lvrf-research.env` is `600 root:root` (`stat` only);
  - `/srv/lvrf/.env` has no key line (`grep -c`: 0).
- **Accepted fields:** every field accepted from a call is `ai_sourced`, with its citation opened by the person who
  accepted it.
- No refusal but the ones Brad met, and no audit row without an actor. Every sealed run is byte-identical, and
  `check_run_hashes` matches all of them.

### 8. `CLAUDE.md`, after Gate C only

When Gate C passes, and not before (OWN-1-D3), `CLAUDE.md`'s research seam is amended, in one docs commit:
- **"No code calls a research tool — a person runs the prompt"** becomes: one module, `server/research/apiCall.ts`,
  sends a stored prompt to Anthropic's API on a person's request, for a subject the steward has cleared, within the spend
  limit; everything after the answer is the person's, as before.
- The module list adds `apiCall.ts`, `research_calls` and `research_clearances`, written only by `apiCall.ts`.
- The key rule is added: on the box only, `/etc/lvrf-research.env`, root 600.

Nothing else in the seam changes: a prompt is generated from live rows, a new result names its prompt, and accept is
per field by a person.

## 22. 3.1 slice S3: the printed case and the POV brought into the CVAF family (planned 19 Nov 2026; **approved by Brad, 19 Nov 2026, with D1–D9 as recommended and three conditions**; **closed 19 Nov 2026**: deployed at `c051755`, the first-print fix at `81cc5d8`, Gate C clean)

**Brad's rulings (19 Nov 2026).** §22 is approved with D1–D9 as recommended, and these conditions:
1. **D2, the banners on the cover.** On the cover, the OUTSIDE-IN and UNVERIFIED banners are at least as prominent as
   on the body pages, never smaller or muted. Gate A adds a break: a cover whose banner is smaller than the body
   pages' fails.
2. **D4, Barlow Condensed is self-hosted** with the app, its OFL licence file included. It is never loaded from Google
   Fonts or any other outside URL at print time. Gate A adds a check: the printed page makes no outside request for a
   font, and the PDF embeds the font.
3. **The 9 disagreements (C1–C9)** go to Brad as a short list, each with a recommendation, alongside the D8 mock-up.
   He rules on them with the pages in front of him.
- **First, the D8 mock-up only:** a cover and one body page of each document, printed to PDF in
  `~/lvrf-backups/s3-mockup/` (`chmod 600`). **No product code changes until Brad approves the mock-up.**
- After S3: one small dependency change, a plain `npm audit fix` (`body-parser`, `qs`) and `"argon2@0.45.1": false` in
  `allowScripts`, with its own regression (3.1 list).

**The mock-up reviewed (Brad, 19 Nov 2026): approved, with C1–C9 as recommended, the cover's thin ink band for "Page 1
of N", and four changes:**
1. **Every page carries the same record line with the full record hash.** Gate A checks that the full hash, matching
   the run's `payload_hash`, is on every page of both PDFs.
2. **Display-size type is for measured numbers only.** Status words ("CLAIMED", and any other state) print at label
   size, never in Bebas display. Gate A adds a break: a status word in display size fails.
3. **C8: the disclaimer comes first on the last page,** its wording as drafted, and the tagline goes below it,
   smaller than the disclaimer's heading.
4. **The last page's record line sits at the foot of the page.**
   - **Named:** today's prints place it after the content, not at the foot; on run 3's default-lens print (15 Nov),
     page 3's record line sits about two-thirds down.
   - **As built:** the record line moves into the page's bottom margin box, which always prints at the foot, on every
   page, the cover's ink band included.

Ruling it builds: "One Rule76 family with CVAF" (Brad, 15 Nov 2026, `docs/LVRF_3.0_CRITICAL_PATH.md`). LVRF's design,
colours and UX read as the same family as CVAF, with CVAF's `docs/RULE76_DESIGN_SYSTEM.md` as the reference. It is read
from `cvaf-rule76`, and nothing is copied into CVAF. Tokens stay cited from `CLAUDE.md`; any value where CVAF's system
and `CLAUDE.md` disagree is named for Brad. This is the last item of the 3.1 build order's first group ("the printed
case and POV brought into the CVAF family"). Value spine: `return`, the documents a CFO reads.

**Scope: the two printed documents only.** They are the value case (`/runs/:id/case`, under both lenses) and the POV
(`/accounts/:id/pov`). The screen UI, the run page's print and the rest of the design-family audit come after the
pilot starts (3.1 build order).

### What was read (19 Nov 2026; CVAF read only, its templates' source, no CVAF client data)

- **CVAF's canon, `docs/RULE76_DESIGN_SYSTEM.md`:**
  - palette: ink, gold `#C9A24A`, silver, off-white; dark-tuned neutrals and status colours;
  - two faces, Bebas Neue and Barlow, with Barlow Condensed "the sanctioned condensed variant"; no monospace face;
  - flexbox and tables, no CSS Grid;
  - no decorative stripes, except the short gold kicker-rule;
  - colour only through tokens.
- **CVAF's business case (`apps/api/src/services/render_business_case.py`), the closest analogue of LVRF's value case:**
  - **light paper pages** under **an ink cover page** (`@page cover`, no margins, ink background);
  - a gold small-caps kicker in Barlow Condensed, and Bebas headings;
  - a 40pt gold rule under the title;
  - a stats row of Bebas numerals between an ink rule and a hairline;
  - tables with small-caps condensed headers and hairline rows;
  - boxes (plain, ink, gold-edged, warn-edged), and tinted tags for each basis;
  - in the page margins: a one-line footer at bottom left in Barlow Condensed, the page counter at bottom right
    (`n / N`), and a band at top centre for a draft or disclosure;
  - US Letter;
  - ending with the Rule 76 tagline ("Rule 76 — No Excuses. Play Like A Champion.") and a disclaimer.
- **CVAF's POV (`render_pov.py`)** is dark throughout: ink pages, off-white text and ink cards. It still carries the
  `#C8A24A` gold typo that CVAF's canon says to fix. The PDFs in CVAF's "Claude outputs" folder are named for CVAF's
  clients, so they were not opened.
- **LVRF today:** both documents are the browser's print of their page (O-D5). Each has:
  - US Letter (`@page letter`), white paper, ink text;
  - Bebas and Barlow loaded from Google Fonts;
  - the banners at the top of each page, in monospace and `ink-70`;
  - a kicker ("VALUE CASE · CFO LENS"), the account as title, a meta line, and section headings in Bebas with a
    hairline;
  - a per-page footer naming the account, the run, the lens, the record hash and the date, with "Page n of N" in a
    margin box (kept by Brad, 15 Nov 2026).
  - `PovPage.tsx` uses CSS Grid in 5 places; `ValueCasePage.tsx` in none.

### The conflicts to name (CLAUDE.md wins; each is named, none resolved silently)

| # | CVAF | LVRF (`CLAUDE.md`) | In S3 |
|---|---|---|---|
| C1 | POV: ink pages throughout; business case: paper with an ink cover | Light paper | **D1** |
| C2 | Small gold text on paper (the kicker, 7.4pt, gold `#C9A24A`: 2.40:1) | **Only `--gold-ink` for small text on light** (AMENDMENT-004) | `--gold-ink` on paper; gold only on ink |
| C3 | Paper `#FAF8F3`, rule `#D9D3C4`, mute `#6B675E`; tag tints by basis | `--offwhite`/white, the `rule` token, `--ink-45`; the status palette of AMENDMENT-004 | LVRF's tokens throughout; no CVAF hex enters LVRF |
| C4 | Barlow Condensed for labels, footers and table heads | Not in `CLAUDE.md`'s token table (display, body, mono) | **D4** |
| C5 | No monospace face | Monospace for hashes, IDs and register numbers | Kept: the hash prints in mono |
| C6 | Page counter `n / N` | "Page n of N" (Brad, 15 Nov 2026) | Kept, as ruled |
| C7 | No CSS Grid | `PovPage.tsx` uses Grid | **D7** |
| C8 | The tagline and a disclaimer close the document | A disclosure banner on every page; no tagline | **D6** |
| C9 | `CLAUDE.md` lists gold for "display numerals" | AMENDMENT-004: gold on white fails AA at every size, large text included (2.40 < 3:1) | Gold numerals on ink only; on paper the numerals print in ink, with the gold rule |

### What S3 builds (if approved as recommended)

1. **First, the conformance audit** (CVAF pattern 3, read-only). For each of the two documents, a table of every
   element against the CVAF family: what it is, what it should be, the token it cites, and which conflict above
   governs it. Committed as docs. If it finds anything outside D1–D9, building stops for Brad.
2. **A cover page in ink (D1),** first in both documents, as a named page (`@page cover`, no margins, the ink fill
   printed exact). It carries:
   - **the disclosure banners** (every printed page carries them: rule 6, O-D5), in `--offwhite` on ink, with the
     unverified banner keeping its `--warning` rule;
   - the kicker in gold;
   - the title (the account) in Bebas `--offwhite`, and the document's name in gold below it (CVAF's two-line title);
   - the meta line (lens, run, locked by, confidence) in `--silver`;
   - a 40pt gold rule;
   - at the foot, the record hash in mono, the date, and "Page 1 of N".
3. **Paper pages in the CVAF furniture with LVRF's tokens:**
   - the kicker in Barlow Condensed (D4) in `--gold-ink`;
   - Bebas headings, each followed by a hairline;
   - the stats row (baseline, target, actual, realization; or confidence and cost of delay), Bebas numerals in ink
     between an ink rule and a hairline;
   - tables with small-caps headers and hairline rows;
   - boxes: a refusal box in ink, with gold text on ink; the asks and the gaps edged in `--warning`;
   - basis tags in the AMENDMENT-004 palette;
   - every page keeps its banners at the top, and its footer line with the hash, and "Page n of N".
4. **The close (D6):** the Rule 76 tagline and LVRF's disclaimer, from text in code, never hand-written per document.
5. **Shared print pieces:** `PrintCover`, `PrintKicker`, `PrintStats`, `PrintFooter` and `PrintClose`, used by both
   pages. Their colours are tokens (`theme()`), with no hex, and `check_design_tokens` is extended to the two pages and
   these pieces.
6. **No change to what prints.** The content stays exactly what the seal and the case read give it: no figure, word or
   order changes, only how it is set. No migration, no server change and no new dependency (D4's font comes from the
   Google Fonts link already loaded).

### Decisions for Brad

| # | Question | Recommended |
|---|---|---|
| D1 | The page | **The business-case pattern:** an ink cover, then light paper. That is CVAF's own printed case, keeps AMENDMENT-004's palette for the body, and prints sensibly on paper. Dark pages throughout (the POV pattern) would need a dark print palette amended into `CLAUDE.md` and a full-bleed browser print on every page |
| D2 | The cover's content | **Banners, kicker, title and document name, meta, the gold rule, then the hash, the date and "Page 1 of N"** (rule 6 and O-D5 hold on the cover) |
| D3 | What the title reads | **The account's name, then "Value Case" or "Point of View" in gold below it;** the kicker "Rule 76 · Learning Value Realization" |
| D4 | Barlow Condensed | **Adopt it, for kickers, labels, table heads and footers,** as CVAF's canon sanctions, recorded in `CLAUDE.md`'s token table as a condensed body face. It is a token change, so it is written there first. Without it, the kickers and labels stay in Barlow |
| D5 | Page numbers | **"Page n of N", as ruled 15 Nov,** not CVAF's `n / N` |
| D6 | The close | **The Rule 76 tagline and LVRF's own disclaimer** (that the document renders from a sealed record, unverified until it is), on the last page |
| D7 | Grid in `PovPage.tsx` | **Flexbox or tables,** as CVAF's canon requires, in the two printed pages only (the screen-wide audit comes later) |
| D8 | A mock-up first | **Yes:** a cover and one body page of each document as an HTML mock-up in `design/mockups/`, citing `tokens.css`, printed to PDF for Brad's look, before any page is changed (UX-1's mock-ups-before-code rule) |
| D9 | Scope | **The two printed documents,** both lenses of the case; the run page's print and the screen UI later |

### Gate A (planned)

- **The mock-up approved by Brad (D8),** then the build.
- **Every page printed to PDF and looked at** (CLAUDE.md's PDF rule), on clones of the prod copy, by headless Chrome's
  print, each page also rendered to PNG:
  - the case under the default lens;
  - the case under the CFO lens, refused;
  - the case under the CFO lens with the case shown (a fixture run that meets the lens);
  - a POV.
- **On every page,** cover included, read from the PDF's text:
  - the disclosure banners;
  - the run's `payload_hash`, equal to the stored one;
  - "Page n of N";
  - no browser header or footer.
- **The content** equals the current print's, word for word, apart from the furniture added: the cover's lines, the
  stats labels, the close. This is shown by comparing the extracted text before and after.
- **Fonts:** `pdffonts` shows Bebas Neue, Barlow, Barlow Condensed (D4) and the mono face embedded, and no other.
- **Contrast:** every text colour on its background in the print stylesheet meets AA (4.5:1 for small text, 3:1 for
  large). This is computed from `CLAUDE.md`'s tokens by a small script.
- **Breaks, each with its positive control:**
  - the banners dropped from the cover;
  - the hash dropped from a body page;
  - a small `text-gold` label on paper (caught by the contrast check);
  - a hex in a print piece (`check_design_tokens`);
  - `grid` in a printed page (a grep);
  - a changed word in the content (the text comparison).
- **Regression and equivalence:** the full regression (`verify_value_case` and `verify_pov_print` assert on the
  print), and equivalence on every GET (no server change, so all identical). Build and lint are clean.

### Gate B, the act and Gate C (planned)

- **Gate B:** deploy only, with no migration. The TOC stays 969 and the triggers 226; expect a new bundle.
- **Brad's act:** print run 3 under both lenses and a POV, and look at every page. The stage-10 check follows on those
  PDFs, as on 15 Nov.
- **Gate C (read-only):** the print requests are Brad's; no other row changed; every sealed run is byte-identical.
- **About 2 days of work after the mock-up is approved.**

### Gate A, as built (19 Nov 2026), and Brad's Gate A rulings

**Brad's rulings (19 Nov 2026):**
1. **The POV's citation on the cover, under the lede, is approved.** It keeps "Source on page 1" true, with every
   word unchanged. The Gate A PDF is in `~/lvrf-backups/s3-mockup/s3-gateA-pov-curia.pdf` (`chmod 600`) for Brad
   before Gate B.
2. **The case the CFO lens shows may not go untested.** A synthetic fixture on the clone (a fictional account, a
   measured actual from a system of record, a named verifier, computed confidence at least 55) makes the lens show the
   case. It is printed and put through the same checks: banners, the full hash on every page, the line structure,
   fonts, contrast, display size for numbers only. Clone only, never prod.
   - **Done:** `scripts/lib/s3_cfo_fixture.sh`. Northwind Fabrication (fictional), its actual measured from a system
     export, verified by its customer-side controller, computed confidence 80. The lens shows it.
3. **The screen-text comparison reads the rendered lines** (Brad, 19 Nov 2026), with a break for merged lines and
   one for a moved block, each with its positive control. **Done:** B9a and B9b.

**Gate A: all checks pass.** `verify_s3_print_family` 116/0. The full regression, 52 scripts, all pass. Equivalence
against `d9b3a80`: 213/213. The full record is in `BUILD_STATUS.md`, "S3: … Gate A". Found and fixed on the way, each
now under a check:
- the POV citation's page;
- a seam on every cover;
- the clipped POV record line;
- ink on ink in the refusal box;
- an empty banner strip on a verified case's cover;
- long units beside the stats.

**Named for Brad, not changed:** the run page shows a VERIFIED banner where the printed case shows none, because the
case prints a banner only when there is something to disclose. It is the deployed behaviour, and predates S3.

**Closed (19 Nov 2026).** S3 deployed at `c051755`. Brad's stage 10 found that a first print lost its record line,
kicker, tagline and ink band: Barlow Condensed under `font-display: block`, and Background graphics off. Fixed forward
(`s3-print-fix`, deployed at `81cc5d8`): Brad's Incognito reprints, with Background graphics off, pass every check, and
Gate C is clean. Record: `BUILD_STATUS.md`, "S3 closed".

## 23. 3.1 slice S4: steward forms confirm every field in full, and a field may not repeat another (planned 19 Nov 2026; **approved by Brad, 19 Nov 2026, with D1, D3, D4 and D5 as recommended and D2 changed**; **closed 19 Nov 2026**: deployed at `7f889b4`, Gate C clean)

**Brad's rulings (19 Nov 2026):**
- **D2, changed.** Every pair of evidence fields is refused if identical, **except "What it states" against the
  quote.** For that pair the confirmation shows a warning, "This summary repeats the quote word for word", and lets
  the steward confirm.
  - Gate A adds a check that the pair is warned, not refused.
  - Gate A adds a break where another pair is identical and is refused.
- **D4: route and database.** D3's comparison, against the stored claim and the entry's name, reads another table, so
  it is a trigger, not a CHECK. Each is named below, with its plain sentence registered.
- **D1:** the other free-text forms without a confirmation go on the 3.1 list as a follow-up item.
- **D3 and D5** as recommended.

**As ruled, the database's half** (migration `0052` and hardening section 37):
- **The free-text fields of an evidence row are five:**
  - `summary` ("What it states");
  - `provenance` ("Where it came from");
  - `source_reference` ("Citation, export ID or URL");
  - `quote_text` ("Quote");
  - `how_read` ("How it was read").
- **Named for Brad: `locator` is not among them.** It is a structured cell (document, value and scale, `jsonb`),
  never free text, and the form makes quote and locator exclusive. So "all pairs" is the 10 pairs of the five, and
  9 are refused once summary against quote is exempt.
- **Nine CHECKs on `evidence`.** Each:
  - compares the two values trimmed, whitespace collapsed and lower-cased (D5);
  - is definite under NULL: an empty or NULL value passes, by `coalesce`;
  - has its plain sentence in `server/lib/plainChecks.ts`.

  | CHECK | Plain sentence |
  |---|---|
  | `evidence_summary_not_provenance` | "Where it came from repeats What it states; say where it came from." |
  | `evidence_summary_not_reference` | "The citation repeats What it states; give the citation, export ID or URL." |
  | `evidence_summary_not_how_read` | "How it was read repeats What it states; say how the value was read from the source." |
  | `evidence_provenance_not_reference` | "The citation repeats Where it came from; give the citation, export ID or URL itself." |
  | `evidence_provenance_not_quote` | "The quote repeats Where it came from; quote the source's own words." |
  | `evidence_provenance_not_how_read` | "How it was read repeats Where it came from; say how the value was read." |
  | `evidence_reference_not_quote` | "The quote repeats the citation; quote the source's own words." |
  | `evidence_reference_not_how_read` | "How it was read repeats the citation; say how the value was read." |
  | `evidence_quote_not_how_read` | "How it was read repeats the quote; say how the value was read, not what it says." |
- **One trigger, `business_metrics_basis_note_own`** (BEFORE UPDATE of `industry_measure_id, pack_basis_evidence_id`
  on `business_metrics`).
  - When a basis is set, the note's evidence row may not repeat:
    - the pack entry's name;
    - any current claim on that entry by a capability of the metric's account.
  - **Its sentence** (raised as written, as S1's trigger is): "LVRF: business_metrics: the pack basis note repeats
    {the capability's claim on this entry | the entry's name}; say why this metric is an instance of the entry, in your
    own words."
  - **To find the note it needs a link,** so `0052` adds `business_metrics.pack_basis_evidence_id` (uuid, nullable,
    `REFERENCES evidence ON DELETE RESTRICT`), which the route sets with the basis.
    - **What it changes:** one nullable column; the route writes it. Today the note is unlinked and found only by its
      text.
    - **What it could orphan:** nothing. The 3 metrics on prod with a basis keep NULL, and their notes stay as
      recorded.
- **The route's half** (`server/lib/repeatedFields.ts`):
  - the same nine pairs, refused before the write, with the same sentences;
  - supersede's reason against every field of the old row and of the new one (an act's reason is not on the evidence
    row, so this is the route's alone);
  - the basis note against the claim and the entry's name, before the trigger.
- **The client's half:**
  - the confirmation lists every field in full, with its character count;
  - summary equal to the quote shows the warning and may be confirmed;
  - any refused pair is said before the request: the confirmation names it, and "Confirm" is disabled with the reason.


**The item it builds** (`docs/LVRF_3.0_CRITICAL_PATH.md`, 3.1 list, from S1's act session; Brad, 15 Nov 2026): steward
forms that write to prod confirm every field in full, and a field may not repeat another. It is first in the revised
build order (Brad, 19 Nov 2026), as a small slice before the pilot.

**Value spine:** `attach`. These forms record the evidence and the pack basis that attach an account's case to its
sources (rule 5: provenance is required on evidence). Every later stage reads what they record, so an error here
reaches every print.

### 1. What the code holds today (read 19 Nov 2026, `ac95a49`; prod read-only)

- **The three departures it answers** (prod, 15 Nov 2026):
  - **`eed11e02`:** the pack-basis note is the capability's own claim on that entry, character for character
    (checked on prod, 19 Nov 2026). The basis form has no confirmation, and the note is compared with nothing.
  - **`c56a3d33`:** "What it states" holds the last 340 of its 557 characters. "Record a source…" records with no
    confirmation at all, so nothing showed the cut-off start.
  - **The `supersede` act that made `673861eb`:** its reason is the how-read text of the row it supersedes, `c56a3d33`
    (checked on prod). The supersede confirmation quotes each row's summary cut to 80 characters and never shows the
    reason.
- **Confirmations:** `GovernedForm`'s `confirm` shows a statement before "Confirm", in about 41 of 63 governed forms.
  - **13 of them cut a value to 80 characters** (`summary.slice(0, 80)`), in `AccountEvidence`, `OutsideInWalk`,
    `PovAuthoring`, `Workbench` and `CaseInputs`.
  - The 17 `slice(0, 8)` are short ids, as ruled; they stay.
- **About 22 forms have no confirmation.** Among them, the ones that record free text are:
  - "Record a source…";
  - the pack basis;
  - the claim;
  - "Record the opened citation" (walk);
  - outcome evidence (`AddEvidenceCard`);
  - "State the hypothesis";
  - "Record the summary";
  - "Record the erratum";
  - "Record fact".
- **The repeated-value rule exists only in S2's routes** (`server/research/aiResearch.ts`: a clearance reason against
  the subject's name or the disclosure; a withdrawal reason against the clearance's). Nothing generic.
- **Prod's 49 evidence rows hold no repeat** between any two of `summary`, `provenance`, `source_reference`,
  `quote_text`, `locator` and `how_read`: 0 for every pair, read-only, 19 Nov 2026. So a CHECK across them would
  validate on today's rows.

### 2. What S4 builds (if approved as recommended)

1. **A confirmation that shows every field in full** (client): one shared piece, `ConfirmFields`.
   - It lists each field by its form label, with the value exactly as it will be sent: whitespace kept, no slice, no
     ellipsis.
   - Each value carries its character count, which is what would have shown "340 characters" against a 557-character
     paste.
   - It names the row and its short id, as today.
   - `GovernedForm` is unchanged; the forms pass `ConfirmFields` as their `confirm`.
2. **The three named forms get it** (D1):
   - **"Record a source…"** (new). It shows every field:
     - the kind;
     - what it states;
     - where it came from;
     - the citation;
     - what it is about;
     - the evidence form, with its quote or locator and how it was read.
   - **"Supersede…"** shows:
     - the old row's what-it-states, in full;
     - every field of the new row, in full;
     - the reason, in full.
   - **The pack basis** (new): the metric, the pack entry's name, and the note, in full.
3. **Every confirmation that cuts a value quotes it in full:** the 13 `slice(0, 80)` (D1).
4. **The route refuses a value identical to another field's** (server): one shared helper,
   `server/lib/repeatedFields.ts`.
   - **Comparison:** trimmed, with whitespace collapsed, case-insensitive, equality only (not "contains"). Empty values
     are skipped.
   - **The refusal:** 422 with a plain sentence naming both fields by their form labels, for example "How it was read
     repeats What it states; say how it was read.", recorded in `refusals` like any route refusal.
   - **Applied to:**
     - the evidence routes (`POST /api/institutions/:id/evidence`, `POST /api/value-outcomes/:id/evidence`,
       `POST /api/evidence/:id/supersede`): every pair among the six free-text fields (D2);
     - supersede's reason against every field of the old row and of the new one (the `673861eb` case);
     - the pack basis note against the capability's stored claim on that entry and the entry's name (D3; the
       `eed11e02` case, which is not in the same request).
5. **CHECKs on the evidence row for the same pairs** (D4; migration `0052`):
   - each is definite under NULL (`coalesce`), with its plain sentence in `server/lib/plainChecks.ts`;
   - prod's rows satisfy them today (§1).

   The cross-table cases (an act's reason; the basis note against a claim) stay in the route, as S2's do.

### 3. Decisions for Brad

- **D1, scope. Recommended:** the three named forms, plus removing the 13 cuts.
  - **Option:** also give a full confirmation to the other free-text forms without one: the claim, the walk's opened
    citation, outcome evidence, the hypothesis, the summary, the erratum and the account fact. That is about twice
    the client work, and their departures are not yet seen on prod.
  - Recommended as a follow-up item, not S4.
- **D2, which evidence pairs. Recommended: all 15 pairs of the six fields.**
  - Consequence: a summary that quotes its source word for word is refused ("What it states repeats the quote"), and
    the steward says what it states in their own words. Prod has 0 such rows.
  - **Option:** exempt summary against quote.
- **D3, the pack basis note against stored text. Recommended: yes,** against the capability's claim on the entry and
  the entry's name. This is a step past "the same request", because the `eed11e02` paste came from a stored field.
- **D4, CHECKs as well as the route. Recommended: yes.** `CLAUDE.md` prefers a constraint, and constraints survive
  refactors. It costs a migration, so Gate B has the backup, migrate, `ownership.sql` and `hardening.sql` steps, and
  the TOC grows by one entry per CHECK.
  - **Option:** route only, as S2; Gate B then stays deploy-only.
- **D5, the comparison. Recommended:** equality after normalising (trim, collapse whitespace, case-insensitive).
  - "Contains" would catch a pasted superset, but it refuses honest cases, such as a how-read that names the quote it
    read.

### 4. Gate A (on clones of the 14 Nov copy; nothing on prod, rule 9)

- **`scripts/verify_s4_form_confirmation.sh`, through the page as the steward, by session** (none by route):
  - **For each of the three forms:**
    - fill every field with long values (a 600-character what-it-states, multi-line text, curly quotes);
    - the confirmation shows each field byte for byte as typed, with its count;
    - "Back" returns to the fields unchanged;
    - "Confirm" records exactly what was shown (the stored row against the confirmation, field by field).
  - **The 13 confirmations** quote their value in full: a seeded 600-character summary, read from each.
  - **Refusals:**
    - each pair group, the supersede reason and the basis-note case is refused with its sentence, and recorded in
      `refusals`;
    - the same values, made different, are recorded;
    - with D4, each CHECK refuses at the database, with a NULL-input refusal per CHECK (definite under NULL).
- **Breaks, each with its positive control:**
  - a `slice(0, 80)` put back in one confirmation;
  - the helper removed from the evidence route (the CHECK then still refuses, under D4);
  - the basis-note comparison removed (the `eed11e02` paste then records);
  - a CHECK dropped (caught by the drift and plain-sentence checks);
  - a confirmation that shows a value other than the one sent.
- **The scripts that assert on today's confirmation text** are updated to the full text, with no lost assertion:
  `verify_c2c`, `verify_steward_safety`, and the `c3_walk`, `c3b_walk`, `l41_walk`, `s1_walk` and `s2_walk` libraries.
- **The full regression; equivalence** on every GET (no GET changes, so all identical); build and lint clean; drift,
  CHECK and trigger counts.

### 5. Gate B, the act and Gate C (planned)

- **Gate B:** with D4, a migration (back up, migrate, `ownership.sql`, `hardening.sql`), then deploy. CHECKs 149 plus
  D4's, the TOC from the latest schema, triggers 226. Without D4, deploy only.
- **Brad's act:** none is needed. S4 records nothing of its own, and the prod forms are exercised the next time a source
  is recorded (rule 9: nothing on prod to exercise the system). **Option:** Brad opens each form on prod and backs out
  at the confirmation, recording nothing.
- **Gate C (read-only):** no row changed by the deploy; CHECKs as planned; every sealed run byte-identical.
- **About 1 day of work, or 1.5 with D4.**

### Gate A, as built (19 Nov 2026)

- **All checks pass:**
  - `verify_s4_form_confirmation` 106/0, with breaks B1–B8;
  - the full regression, 53 scripts, all pass (5,163 checks);
  - equivalence against `81cc5d8`, 213/213.
- **Found and fixed:** "Correct the entity" wrote its citation as its provenance too. Its provenance now reads "Entity
  corrected by {name}: {citation}" (Brad, 19 Nov 2026).
- **Gate B is a migration,** with the TOC at 969 → 972.
- **The full record** is in `BUILD_STATUS.md`, "S4: … Gate A".

**Closed (19 Nov 2026).** S4 is deployed at `7f889b4`, with the TOC at 972 and 227 triggers, and Gate C is clean. The
deploy script stopped silently at step 7, on a start-up race; the API was healthy. A fix is proposed in
`BUILD_STATUS.md`, "S4 closed", for Brad's approval. **Approved by Brad (19 Nov 2026) as proposed,** and built with the dependency
change as one ops change (`BUILD_STATUS.md`, "Ops: the deploy script's silent stop fixed"). **Closed (19 Nov 2026):** deployed
at `4e5c13b`; the deploy waited out the race and ended `deploy OK`; Gate C clean (`BUILD_STATUS.md`, "Ops change closed").

## 24. 3.1 slice S5: the account frame (planned 19 Nov 2026; **approved by Brad, 19 Nov 2026, with D1–D7 as recommended; mock-ups first, no UI code until Brad approves them; must pass Gate C by Fri 18 Dec 2026, otherwise it waits until after 15 Jan 2027**; **mock-ups approved 19 Nov 2026 with two changes; Gate A 19 Nov 2026 at `560b092`, with Brad's three additions (one shared `/walk` read, a 15 s limit on the frame's reads, the sign-in check at Gate B)**; **closed 20 Nov 2026**: deployed at `d1fdf50`, two Gate B findings fixed and deployed (the Runs table at `838e3fd`, its links at `5b0edb9`), Gate C clean (`BUILD_STATUS.md`, "S5: the account frame — Gate A"))

**Brad's rulings (19 Nov 2026):**
- **§24 is approved with D1–D7 as recommended.**
- **The navigation window applies to S5 as well as S6.** S5 must pass Gate C by **Fri 18 Dec 2026**; otherwise it waits
  until after 15 Jan 2027. **S6 has the same cut-off.** This settles §24.4's third conflict. It is recorded in the 3.1
  build order (`docs/LVRF_3.0_CRITICAL_PATH.md`).
- **Order:** first the ops change (the deploy-script fix and the dependency change; `BUILD_STATUS.md`, "Ops: the deploy
  script's silent stop fixed"), then S5's D7 mock-ups for Brad's review.
- **The mock-ups are approved (Brad, 19 Nov 2026; `086d61a`, branch `s5-account-frame`)**, with the two-row frame,
  the two added screens (Packs in focus; the page after "Leave") and "No run yet". **Two changes:**
  1. **the frame's confidence names its run** ("Latest run: 25 / 100", or similar), so an older run's page cannot
     silently disagree with the frame;
  2. **the "Classify as" label loses "(optional)".**

  Then S5 is built to Gate A.

**The ruling it builds** (`docs/LVRF_3.0_CRITICAL_PATH.md`, 3.1 list, "The War Room and account focus"; Brad, 15 Nov
2026, approved in this shape):
- The flat, shareable routes stay underneath.
- An account frame on top carries the chosen account through every page (header, runs, case, POV, research) until it
  is left.
- The War Room never sums or averages money across accounts.
- Mock-ups before code, as UX-1.

This **reverses** the design's navigation decision (`LVRF_DESIGN_PACKS_ADMIN_VALUE_CASE.md` §4: accounts as the front
door, flat object-keyed routes, no stage sequence), as ruled. The revised build order (Brad, 19 Nov 2026) makes it S5,
mock-ups first. The War Room itself is S6, not this slice.

**Value spine:** all seven stages, for one account. The frame is how the operator walks `baseline → … → return` for the
account in focus without losing it. It changes how pages are reached, not any rule, route, table, trigger or CHECK.

### 1. What the code holds today (read 19 Nov 2026, `0f57667`; read only)

- **Navigation:**
  - `AppHeader` holds `NavBar`, with four links (Accounts, Packs, Runs, Policies), and `ActorBar`;
  - below 640 px the two fold into one panel;
  - no page knows a "current account" beyond its own record.
- **Where each page's account comes from today**, each from its own read (no new read is needed to know it):

  | Page | Its account |
  |---|---|
  | `/accounts/:id` (the six-step workspace) and `/accounts/:id/pov` | the id in the URL |
  | `/runs/:id` | the run's `institution_id` |
  | `/runs/:id/case` | `account` |
  | `/engagements/:id/snapshots` | the engagement's `institution_id` |
  | `/lineage/:table/:id` | none in general |
  | `/runs`, `/packs`, `/packs/:slug`, `/policies` | none: they list across accounts or are the tenant's |
- **Where an account stands** is already derived in `client/src/lib/workspaceStatus.ts`, from `/walk`, `/pov` and
  `/research`. Accounts home uses it, with `/view`, at up to four reads per account (L34).
- **CVAF's pattern** (read only, `cvaf-rule76`, no client data):
  - an account-scoped route tree, `/ecc/:accountId/…`, under `ECCLayout`;
  - an `AccountContext` provider that holds the account and gates every page on it;
  - a sidebar of the account's stages;
  - "Back to the War Room" to leave.

  LVRF keeps its flat routes, as ruled. **So S5 takes CVAF's held focus and its leave, not its route tree.**
- **The 3.1 item that rides with the frame** (S1's Gate A, Brad 15 Nov 2026): "Classify as…" on an unclassified customer
  account, with the account frame.

### 2. What S5 builds (if approved as recommended)

1. **The frame:** a band under the header, on screen only (`print:hidden`; the printed case and POV are untouched,
   S3), on every page while an account is in focus.
   - **Left, the account:**
     - its name;
     - its industry pack;
     - for a reference example, the marker's label: "Reference example, not a customer engagement";
     - its computed confidence (n / 100, band);
     - where it stands: the workspace's current step, in words.
   - **Right, the account's pages:**
     - Workspace;
     - Research (step 1);
     - Runs: this account's;
     - Value case: the latest locked run's, both lenses;
     - Point of view.
   - **Last, "Leave the account",** back to Accounts home (the War Room, after S6).
   - **No money in the frame** (the War Room's rule, design §4.3).
2. **How focus is set and kept:**
   - opening an account sets it;
   - **any page whose own record belongs to an account frames that account.** A shared link to another account's run
     frames that account and says so, once ("You're now in {account}"); it never shows the run under the held account;
   - a page with no account of its own (Runs, Packs, Policies, a lineage row with none) keeps the held focus;
   - "Leave" clears it.
3. **Runs, with an account in focus,** lists that account's runs, with "Show every account's runs" one click away.
   Packs and Policies are unchanged under the frame. A link to a pack the account is classified into is highlighted.
4. **Phone width (390):** the frame is one line (the name, then "▸" for its pages), with no sideways scroll (UX-1
   finding 7).
5. **"Classify as…"** on an unclassified customer account, from the frame (D6). It is the shared component S1 built,
   with its route and act unchanged.

### 3. Decisions for Brad

- **D1, where focus is held. Recommended: per tab** (`sessionStorage`).
  - Two tabs can hold two accounts. Nothing is stored on the server; no route, table or act.
  - Option: per browser (`localStorage`), so it survives closing the tab.
- **D2, a page whose record belongs to another account. Recommended: the page's own account wins.** The frame switches
  and says so once. The rule: no page ever shows one account's record under another's frame.
- **D3, Runs with an account in focus. Recommended:** that account's runs, with "Show every account's runs".
  - Option: always every run, with the account's runs marked.
- **D4, how the frame learns where the account stands. Recommended: reuse `workspaceStatus.ts`'s reads**
  (`/view`, `/walk`, `/pov`, `/research`). No API change, so equivalence stays all-identical.
  - The reads happen once when the account changes and again after any write on the page, not on every navigation.
  - Option: one new read, `GET /api/institutions/:id/frame`, which is cheaper. It is a new route, named in equivalence
    and tenant-checked (P3).
- **D5, the tenant's own account** (Skillsoft, `is_tenant_self`, still the old record view, L33). **Recommended:** it
  gets the frame like any account, with its "where it stands" read from `TenantChain`.
- **D6, "Classify as…" in S5. Recommended: yes,** as ruled, "with the account frame". It reuses S1's component, route
  and act. Option: leave it to a later slice.
- **D7, the mock-ups. Recommended:** static pages in the repo's mock-up style (`design/mockups/`, `tokens.css`,
  `mock.css`), with **fictional accounts only**, each also printed to PDF in `~/lvrf-backups/s5-mockup/`
  (`chmod 600`). The screens:
  1. the workspace in focus;
  2. a run page in focus;
  3. the value case on screen, in focus;
  4. the POV in focus;
  5. Runs, filtered and with every account;
  6. a shared link to another account's run, with the frame switching and saying so;
  7. a reference-example account in focus;
  8. the frame at 390;
  9. "Classify as…" from the frame (D6).

### 4. Conflicts to name (CLAUDE.md wins; each is named, none resolved silently)

- **Design §4's navigation decision** is reversed by Brad's 15 Nov ruling. The flat routes stay, so links already sent
  keep working.
- **Q7 (24 Oct 2026): the War Room at `/book`, with a band on `/`.** That is S6's question. S5's "Leave" goes to
  Accounts home, which S6 may change to the War Room.
- **The pilot window** (the revised build order): no large navigation change deploys during 4–15 Jan 2027. The rule is
  written for S6, but **S5 is a navigation change too.** **Ruled (Brad, 19 Nov 2026):** S5 and S6 each pass Gate C
  by Fri 18 Dec 2026, or wait until after 15 Jan 2027.

### 5. Gate A (planned; after the mock-ups are approved)

- **`verify_s5_account_frame.sh`, through the page as the steward, by session, on clones of the prod copy:**
  - the frame on every account page, with its fields read from the record;
  - focus held across Runs, Packs and Policies;
  - a shared link to another account's run: the frame switches and says so, and the run never shows under the held
    account;
  - "Leave" clears the focus;
  - two tabs hold two accounts (D1);
  - at 390 no page scrolls sideways;
  - keyboard: the frame's links are reachable and show focus;
  - contrast at AA, computed;
  - no hex (`check_design_tokens`).
- **The printed case and POV unchanged:** S3's checks pass as they stand, and the frame never prints.
- **Breaks, each with its positive control:**
  - the frame showing the held account on another account's run;
  - focus kept after "Leave";
  - the frame printing;
  - a sideways scroll at 390;
  - (D6) "Classify as…" offered on a classified account.
- **The full regression; equivalence** on every GET: all identical under D4 as recommended, the new route named
  otherwise.

### 6. Gate B, the act and Gate C (planned)

- **Gate B:** deploy only, with no migration. The TOC stays 972 and the triggers 227; the bundle is new.
- **Brad's act:** none is needed; it writes nothing. Brad walks one account through the frame on prod and looks.
- **Gate C (read-only):** no row changed by the deploy; under D6, any classification made is Brad's own act, through
  the page.
- **About half a day for the mock-ups; about 2 days for the build after they are approved.**

## 25. 3.1 slice S6: the War Room (planned 20 Nov 2026; **approved by Brad, 20 Nov 2026, with D1–D8 as recommended and D5 changed; mock-ups approved with three changes; Gate A 20 Nov 2026** (`BUILD_STATUS.md`, "S6: the War Room — Gate A"); **closed 23 Nov 2026**: deployed at `bf875e9` (20 Nov 2026), Gate C clean (`BUILD_STATUS.md`, "S6 closed"); **mock-ups first, no UI code until Brad approves them; must pass Gate C by Fri 18 Dec 2026, otherwise it waits until after 15 Jan 2027**)

**Brad's rulings (20 Nov 2026):**
- **§25 is approved with D1–D8 as recommended.**
- **D1 as written:** no money anywhere on the War Room page or in `GET /api/book`, not even per row. Gate A checks both.
- **D5 changed:** recording the promised measurement date at commit is **not a later 3.1 item.**
  - It ships before the pilot's first commitment, because a commitment made without it can never be given one
    afterwards (append-only).
  - **It is on the build order as the next small item after S6, ahead of the S1 contrast fix, with its own plan.**
  - In S6 itself, D5 stands: "no promised date on record", never "on time".
- **Next:** the D8 mock-ups, six screens with fictional accounts only, for Brad's review. The review PDF goes in
  `~/lvrf-backups/s6-mockup/` (`chmod 600`).
- **The mock-ups are approved (Brad, 20 Nov 2026; `1fa05f7`, branch `s6-war-room`), with three changes:**
  1. **D5 confirmed:** "late" only where a promised date has passed with no actual. Otherwise "No promised date on
     record", never "on time".
  2. **Hypotheses due, in words** in the headline tile and the Accounts band ("1 in 30 days · 1 in 60 · 1 in 90").
     The compact numbers stay in the table, under its column header.
  3. **The Accounts band shows confirmed and refuted together** ("1 confirmed · 1 refuted"), as the War Room tile
     does, never refuted alone.

  Then S6 is built to Gate A, with D1's money checks on the page and in `GET /api/book`, and the coverage gate.

**The ruling it builds:**
- The 3.1 list, "The War Room and account focus" (Brad, 15 Nov 2026): **the War Room never sums or averages money
  across accounts** (CVAF's lesson, design §4.3).
- The design: §4.3 (what the War Room shows), §5.8 (`GET /api/book`, no new table) and P7 (its checks).
- Q7, ruled 24 Oct 2026: **the War Room at `/book`, with a band on `/`**; the accounts stay the front door.
- The revised build order: S6 after S5, mock-ups first, with the same cut-off.

**Value spine:** `return`, across the book. It is the value engineering leader's read of where every live engagement
stands, and of what is due, refuted or late. It writes nothing.

### 1. What the code and the record hold today (read 20 Nov 2026, `14b54b0`; read only)

- **Book confidence already exists:** `GET /api/cohort` (`server/routes/cohort.ts`) and `CohortCard` on the Accounts
  home.
  - **Weakest link, never an average.** An unmeasured member has no score, with its reason, never 0.
  - **Membership** (Q4n): live customer accounts only. Not the tenant's own account, not a reference example (a
    current marker), not a retired engagement.
  - It already counts the reference examples it leaves out.
- **Who is a member on prod today: nobody.**
  - Curia and Scotts Miracle-Gro both carry a current outside-in-test marker, so they are reference examples.
  - Skillsoft is the tenant's own account.
  - **Until the pilot's first customer account (4–15 Jan 2027), the War Room's book is empty.** That shapes D2.
- **CVAF's War Room** (`cvaf-rule76/apps/web/src/pages/WarRoomPage.jsx`, read only, no client data):
  - **its fabrication:** a `revenue × 0.1` term that made a $6.6B "portfolio value" out of nothing;
  - **even after its fix,** it sums NPV across the accounts that have a model, in a "Portfolio Value" tile;
  - **LVRF takes neither.** From CVAF it takes the per-account next action, and leaving back to the War Room (S5's
    frame has its own Leave).
- **What each §4.3 column can be read from:**

  | Column | Source | On prod today |
  |---|---|---|
  | Stage reached | the latest locked run's `terminal_value_stage` | Skillsoft only (not a member) |
  | Confidence, naming its run | the run of record (as `cohort.ts`, as the S5 frame) | — |
  | Hypotheses due in 30 / 60 / 90 days | `value_hypotheses.falsifier_due`, verdict open | 1 hypothesis in all |
  | Confirmed and refuted | the hypothesis verdict (computed, never stored, O2-D1) | — |
  | Outcomes late (distinct from short) | `value_outcomes.promised_measured_at` past, no actual | **no route records a promised date**; 0 of 5 outcomes carry one |
  | Open asks | the gap register (`gapRegister.ts`), per outcome | per outcome, a read per call today |
  | Cost of delay, stated or refused | the value case (P6, `lvrf_cost_of_delay`) | — |
  | Last recorded | the latest dated act (as the Accounts home's row) | — |

- **The confirmation gap is not in the API.** The design says "as already built", but it was built as a Python script
  (`records/confirmation_gap.py`, 29 July). It refuses below n = 5 admissible (verified) outcomes, and gives
  dispersion only from n = 12. Prod has 0 admissible outcomes.

### 2. What S6 builds (if approved as recommended)

1. **`/book`, the War Room:** a read-only page, in the main navigation as "War Room", after Accounts.
   - **One row per member account:**
     - the name, to its workspace (opening it sets the focus, as S5);
     - its pack;
     - the stage reached;
     - the confidence, naming its run ("Run N: n / 100 · Band", `ConfidenceBadge`'s format);
     - hypotheses due in 30, 60 and 90 days;
     - hypotheses confirmed and refuted;
     - outcomes late, or "no promised date on record";
     - open asks;
     - cost of delay, **stated or refused, by word and link only** (D3);
     - the next step, in the frame's words;
     - last recorded.
   - **Across the book, counts only:**
     - book confidence (the weakest member, `cohort.ts`'s, the same format);
     - accounts in the book;
     - hypotheses due, confirmed, refuted and open;
     - outcomes by realization status;
     - the confirmation gap's state (D4).
   - **Below, "Not in the book",** marked and never counted (D2): each reference example and the tenant's own account,
     each with its reason.
2. **`GET /api/book`** (design §5.8): server-computed and read-only. It is tenant-scoped by the actor
   (`actorTenantId`), and its membership comes from `cohort.ts`'s query, **shared, not copied**.
   - **No money field in it at all.** Its response is checked key by key in Gate A.
   - It is a new route: named in equivalence as added, and in `list_api_routes.mjs`.
3. **The band on `/`** (Q7): one line at the top of Accounts home with:
   - book confidence;
   - the accounts in the book;
   - hypotheses due in 30 days;
   - refuted;
   - late;
   - "Open the War Room".
4. **With an account in focus** (S5), the War Room keeps it (it has no account of its own) and marks that account's
   row "In focus".
5. **At 390:** the rows become cards, with no sideways scroll.
6. **Not printed:** the War Room is a screen, not a document. The frame and the band never print.

### 3. Decisions for Brad

- **D1, the War Room never sums or averages money: how strictly. Recommended: no money anywhere on the page or in
  its route,** not even per row.
  - Each figure in money stays in its own value case, with its basis and its banners. CVAF's lesson is that a money
    figure on a portfolio page invites a total.
  - Gate A greps the page and the response for any currency symbol, any money word, and any field named for money.
  - Option: a row's own cost of delay, with its basis (design §4.3 allows it), never totalled.
- **D2, an empty book on prod until the pilot. Recommended: show "Not in the book"** below the book: the two
  reference examples and your own account, each with its reason, linked, never counted.
  - The empty book says "No live customer engagements yet".
  - Option: the book only, with a count of what it leaves out (as `CohortCard` does today).
- **D3, cost of delay on a row. Recommended:** "Stated in run N's case" or "Refused: {reason}", linked to that case,
  with no figure (follows D1).
- **D4, the confirmation gap. Recommended:** S6 ports only its **admissible count and its refusal**, as "Not
  reported: n admissible outcomes; it needs 5". Its bias figure (direction-weighted, a ratio of claim, never
  currency) comes later, as its own item, when the book can reach n = 5.
  - Option: port the whole engine now.
  - Either way, it is a ratio across outcomes, not money; under D1, it is never in currency.
- **D5, "late" with no promised dates. Recommended:** show "no promised date on record" where none is, never "on
  time".
  - ~~Add to the 3.1 list~~ **Ruled (Brad, 20 Nov 2026): the next small item after S6, ahead of the S1 contrast fix,
    with its own plan:** the commit form records a promised measurement date (the column exists, and no route writes
    it). It must ship before the pilot's first commitment.
  - Option: leave "late" out of S6 entirely.
- **D6, the band and `CohortCard` on Accounts home. Recommended:** the band carries the headline (book confidence
  once, in one format), and `CohortCard`'s detail (each industry's cohort) moves to the War Room. So the home page
  does not show book confidence twice, in two places (S5's Gate B finding 2, the same lesson).
  - Option: keep `CohortCard` on the home page, below the band.
- **D7, "Leave the account". Recommended: unchanged, to Accounts home,** the front door (Q7). The War Room is one
  click away in the navigation.
  - Option: "Leave" goes to the War Room, as CVAF's "Back to the War Room".
- **D8, the mock-ups. Recommended:** static pages in the repo's style (`design/mockups/`), **fictional accounts
  only**, each also printed to PDF in `~/lvrf-backups/s6-mockup/` (`chmod 600`). The screens:
  1. a populated book (six fictional accounts: one late, one refuted, one due in 30 days, one unmeasured, one with no
     run, one held in focus);
  2. today's prod shape: an empty book with "Not in the book";
  3. the band on Accounts home;
  4. the War Room at 390;
  5. a row's cost of delay: stated, and refused;
  6. the confirmation gap: refused, and (as it would read) reported.

### 4. Conflicts to name (CLAUDE.md wins; each is named, none resolved silently)

- **Design §4.3 lets a row show its own cost of delay, with its basis.** Recommended D1 shows none.
- **Design §4.3 calls the confirmation gap "as already built".** It is a Python script, not the API (D4).
- **Design §4.3 lists late outcomes.** Nothing records a promised date (D5).
- **CVAF's War Room is an anti-pattern here** (design §9), not a model: no portfolio value, in any form.

### 5. Gate A (planned; after the mock-ups are approved)

- **`verify_s6_war_room.sh`, through the page as the steward, by session, on clones of the prod copy,** with fictional
  member accounts made by route (rule 9: clones only):
  - every row's figures against SQL;
  - membership equal to book confidence's, and the tenant's own account and the reference examples absent from the
    book;
  - **no money:**
    - no currency symbol, money word or money-named key in the page, the band or `GET /api/book`;
    - a fixture whose case states a cost of delay still shows none on the War Room;
  - the confirmation gap refuses at n = 4 (D4);
  - "late" vs "no promised date on record" (D5);
  - focus kept, and the row marked;
  - 390, keyboard, contrast at AA, no hex;
  - **a coverage gate:** every section prints a line (S5's lesson).
- **Breaks, each with its positive control:**
  - a sum of money added to the page;
  - a money field added to the route;
  - a reference example counted;
  - an average shown in place of the weakest member;
  - "no promised date" shown as on time;
  - a sideways scroll at 390;
  - a row of another tenant (P3).
- **The full regression; equivalence** on every GET: all identical, `GET /api/book` named as added.

### 6. Gate B, the act and Gate C (planned)

- **Gate B:** deploy only, no migration (no table; the TOC stays 972 and the triggers 227). The bundle is new.
- **Brad's look:** on prod, the empty book with "Not in the book" (D2), and the band. It records nothing.
- **Gate C (read-only):** no row changed by the deploy; `GET /api/book`'s response holds no money field.
- **About half a day for the mock-ups; about 3 days for the build after they are approved.** With the cut-off on
  Fri 18 Dec 2026, there are four weeks.

## 26. 3.1 small item: the promised measurement date, recorded at commit (planned 23 Nov 2026; **approved by Brad, 23 Nov 2026, with D1–D6 as recommended, D3's bound and D4's wording ruled**; **Gate A 24 Nov 2026** (`BUILD_STATUS.md`, "§26 … Gate A"); **closed 24 Nov 2026**: deployed at `f3e8fe7`, Gate C clean (`BUILD_STATUS.md`, "§26 closed"))

**Brad's rulings (23 Nov 2026):**
- **D1–D6 are approved as recommended.**
- **D3:** three years is approved as the upper bound. A promised date is later than the commit date and no more than
  three years after it.
- **D4:** dates are compared in UTC, and **this is said wherever "late" shows:** an outcome is late once today's UTC
  date is after its promised date.
- **Next:** build to Gate A.

**The ruling it builds:** §25 D5 changed (Brad, 20 Nov 2026). The commit form records a promised measurement date. It
**ships before the pilot's first commitment**, because a commitment made without one can never be given one later
(append-only). It comes first among the small items, ahead of the contrast item.

**Value spine:** `commit`. The customer's named person agrees to the target and also to when it will be measured. A
practice that delivers late is a different failure from one that delivers short (`db/schema.ts`, the column's own
comment). Without the date, nothing can tell the two apart.

### 1. What the code and the record hold today (read 23 Nov 2026, `bf875e9`; read only)

- **The column exists:** `value_outcomes.promised_measured_at` (timestamptz, nullable). **No route writes it.**
  `POST /api/value-outcomes/:id/commit` (`server/routes/outcomeWalk.ts`) sets the target, the committer, the commit
  date, the attribution method and the measure class.
- **Its readers already exist:**
  - **The sealed case** carries it as `roadmap.promised_measured_on` (`lvrf_case_chain`, payloadVersion 5).
  - **The value case prints it:** "Committed measurement date: … / none committed" (`ValueCasePage`).
  - **The delta engine** computes punctuality from it once there is an actual (`deltaEngine.ts`).
  - **The War Room** shows "late" or "not yet due: promised …" from it, otherwise "No promised date on record"
    (`book.ts`, `WarRoomPage`).
- **The database holds the commit's rules** in hardening §34 (`lvrf_outcome_spine_guard`): a new commit states its
  method and class, and both are fixed while the commitment stands. A commitment comes back only with its
  `outcome_withdrawals` row, whose guard checks that the values it records are the outcome's own.
- **On prod:** 0 of 5 outcomes carry a promised date, and the book is empty until the pilot (4–15 Jan 2027).
- **The commit form** (`OutcomeSpine.tsx`, card 01d) uses S4's confirmation: every field is named in full in the
  confirmation text.

### 2. Decisions (recommendations first)

- **D1, required at commit. Recommended:** every new commitment states a promised measurement date, and a commit
  without one is refused. This follows the ruling: what is not recorded at commit can never be added afterwards.
  - Option: optional, with "none promised" stated on the form. This keeps a commitment possible where the client will
    not give a date, but the War Room would then say "No promised date on record" for a live commitment.
- **D2, held by the database, fixed while the commitment stands. Recommended:** hardening §34's guard gains two rules,
  as it did for B4's method and class:
  - a new commit states `promised_measured_at`;
  - the date is fixed while the commitment stands; changing it means withdrawing the commitment and committing again
    (the withdrawal records the old date).
  - **No migration**, because the column exists. `CREATE OR REPLACE FUNCTION` adds no object and no trigger, so the TOC
    stays 972 and the triggers 227. Hardening is re-applied as postgres at Gate B, as at S1, S2 and S4.
  - **A commitment made before this keeps no date** and reads "No promised date on record", as B4's D1 did. A
    measurement is **not** refused for want of a date: the date does not change what was measured, only whether it
    was on time.
- **D3, what date is admissible. Recommended:** a calendar date, **later than the commit date** and **no more than
  three years after it**. Both rules are in the guard, and the form says them. The upper bound catches a mistyped
  year. **Ruled (Brad, 23 Nov 2026): three years.**
  - Option: later than the commit date, with no upper bound.
- **D4, one meaning of "late". Recommended:** the promised date is stored at 12:00 UTC on that day, as `committed_at`
  is, and "late" compares days: **late only once the promised day has passed** with no actual. Today `book.ts` reads
  `promised_measured_at < now()`, which would call an outcome late from noon UTC on the promised day itself. That one
  line changes to a day comparison, which is the delta engine's own rule (`dateOnly`).
- **D5, the withdrawal keeps it. Recommended:** a commitment's withdrawal records `promised_measured_at` in
  `withdrawn_values` and clears it with the rest of the commitment. The withdrawal guard checks that the recorded date
  is the outcome's own, as it does for the target.
- **D6, where it shows. Recommended:**
  - **the commit form:** a "Measure by" date field, with D3's rules in its help text, named in the confirmation:
    "… on 2026-12-01; measured by 2027-06-30; attribution: …";
  - **the outcome card** (01d), once committed: "Measurement promised by 2027-06-30";
  - **HB-0014** (Value Target Committed): its payload gains `promised_measured_on`;
  - **nothing else changes.** The sealed case, the printed value case, the delta engine and the War Room already read
    the column. **No payload version change, and none of the 27 sealed runs changes:** each sealed what it read.

### 3. What it does not do

- No route sets or changes a date on an existing commitment, by design (D2).
- No backfill on prod. ~~A rule-9 fixture is not needed, because no prod commitment exists to carry one.~~ **Corrected
  at the build (23 Nov 2026):** prod holds one commitment, Curia's `e3fb0061` (30 Aug 2026, before B4: no method, no
  class). Its engagement is retired, so its outcomes are frozen, and Curia is a reference example, outside the book.
  It keeps no date (D2), and card 01d says "no promised date on record (committed before §26)".
- No reminder or notification as the date nears. The War Room's "Not yet due" and "late" are the read.
- No change to measure or verify.

### 4. Gate A (planned)

**`verify_promised_date.sh` (new)**, on a clone of the prod copy, as the steward by session. The commit is driven
through the form.
- **P1, a commit with a date:** the row holds it; HB-0014's payload names it; the confirmation text names it; the
  outcome card shows it; a run locked afterwards seals it as `roadmap.promised_measured_on`; the value case prints it.
- **P2, the database's rules,** each refused by the database itself, not only by the route (a direct UPDATE as
  `lvrf_app`):
  - a commit with no date (D1);
  - a date on or before the commit date, and one more than three years after it (D3);
  - a date changed while the commitment stands (D2);
  - a date set on a commitment made before this (D2).
- **P3, the withdrawal:** the withdrawal records the date, and the outcome's date is cleared. A new commit then takes a
  new date.
- **P4, "late" (D4), against SQL:** on the promised day, "Not yet due"; the day after, with no actual, "1 late";
  with an actual, never late. The War Room's tile and the band agree.
- **P5, before this:** an outcome committed with no date reads "No promised date on record", never "on time", and can
  still be measured.
- `verify_s6_war_room`'s P2 sets its date through the route instead of by SQL.
- **Breaks, each against a clean pass:**
  - the guard's date rule removed (a commit with no date is caught by the database check);
  - the date made changeable;
  - the withdrawal not recording the date;
  - "late" back to `< now()` (caught on the promised day);
  - the date left out of the confirmation text.
- **The full regression; equivalence** on every GET against the deployed `bf875e9`: all identical, apart from any GET
  that returns an outcome with a date (none on the prod copy).
- A coverage gate: every section prints a line.

### 5. Gate B, the act and Gate C (planned)

- **Gate B:** pre-deploy backup; `db/hardening.sql` re-applied as postgres (0 ERROR lines); deploy. No migration; the
  TOC stays 972 and the triggers 227. A new bundle.
- **Brad's look (records nothing):** the commit form shows "Measure by" (open it on any outcome, then cancel it). The
  War Room is unchanged.
- **Gate C (read-only):** nothing written since the deploy; `lvrf_outcome_spine_guard`'s new source on prod is the
  repo's; hashes 27/27; TOC 972; 227 triggers; drift none; ownership clean.
- **The act:** none until the pilot. The first commitment on prod is the steward's own, at the pilot.
- **About one day for the build.** Gate C is before Fri 18 Dec 2026, well ahead of the pilot's first commitment.

## 27. 3.1 slice S7: the success story of record (planned 24 Nov 2026; **approved by Brad, 24 Nov 2026, with D1–D11 as recommended and four conditions; mock-ups before code; target Gate C for S7b by Fri 18 Dec 2026**)

**Brad's rulings (24 Nov 2026):**
- **§27 is approved with D1–D11 as recommended.**
- **D4 confirmed:** "internal" is the tenant's people (Skillsoft, including its CRO). A reference example's story stays
  internal only.
- **Runs:** a story reads only real runs, never system exercises. Curia's are named below (section 1a).
- **The "can support / cannot support" wording** for each figure class goes in the mock-up, for Brad's approval word
  for word, **before S7a's form ships.**
- **Timing:** S7b's Gate C targets Fri 18 Dec 2026. The January window is the fallback only.
- **Order:**
  1. the two small items (the plan codes on screen; the local commit date);
  2. S7a;
  3. Brad's six rows;
  4. S7b.
- **A sealed confidence never prints without its points erratum (Brad, 24 Nov 2026):**
  - Wherever a sealed confidence prints in a story, and an erratum on that run concerns its points, the erratum
    prints **beside it, at the same size and weight.** It never prints only on the timeline or under the baseline.
  - **Curia's headline:** "55 / 100 as sealed · 45 of these points rest on a person who is not customer-side". The
    wording matches the recorded erratum (open question below).
  - The same holds for runs 3, 4 and 5 on the timeline, each beside its own sealed score.
  - **The sealed figure is never recomputed or hidden.**
  - **S7b's Gate A gains a break:** the headline score printed without its adjacent erratum fails. Gate A also checks
    the timeline scores, and that both parts are the same size and weight (computed style).
  - **Shown in the S7 mock-up.**
  - **Ruled (Brad, 24 Nov 2026): option (c).** The story never quotes an erratum's recorded text.
    - **What prints:** everywhere, the ledger included, the platform's plain wording for that erratum's kind:
      `lvrf_erratum_line()`, the same computed sentence the headline uses.
    - **How it is cited:** by the erratum's short id, which links to the record.
    - **No supersession** of the 19 errata whose recorded words say "under the C3 rule".
    - **No exemption** from the plain-words check.
    - **The "C3 rule" strings already on screen** (`LineagePage.tsx` lines 59 and 70, `PovPage.tsx` line 178) are
      replaced by the plain-words small item, as planned.

**What Brad asked (24 Nov 2026):** an LVRF output on CVAF's pattern (`cvaf-rule76/docs/CVAF_Success_Story_Spec.md`,
ratified 17 Nov 2026, read read-only: its patterns only, no CVAF data, nothing copied into CVAF). It comes **after
the two small items now first on the list** (the plan codes on screen; the local commit date). Mock-ups come before
code. The first story is Curia's.

**Value spine:** `return`. A story is the account's record told in sequence, for the people who decide on it. It
writes only its own record, and never a figure.

### 1. What the code and the record hold today (read 24 Nov 2026, `84c3f37` and the prod copy; read only)

- **CVAF's pattern, taken as patterns:**
  - stages computed, never chosen;
  - a spine whose headings name the kind of evidence beneath them;
  - a section with nothing sealed behind it does not render;
  - the evidence ledger;
  - rules S1 (sealed only), S2 (a claim never outruns its evidence) and S5 (selection is disclosed);
  - a story record that is sealed when issued, and withdrawn, never deleted.
  - **Not taken in v1:** bound drafting (S3), quotes and releases (S4, S7), and the co-sell and public audiences.
    Brad's v1 scope, items 6 and 7.
- **The print family (S3)** prints the value case and the POV. Each printed page carries both banners and the full
  hash. The value case reads only the sealed payload. A run sealed before payloadVersion 5 has no cost of delay,
  roadmap or solutioning, and it says "not sealed in this run", never filling them from today's record.
- **Curia on prod** (a reference example; the current marker is `outside_in_test`, 1 Nov 2026, which superseded
  `published_case_study`):
  - **Runs:** 22 locked, 14 of them system exercises.
    - The retired reference engagement has runs 1, 3, 4, 5 and 13 that are not exercises; run 13 is the latest, at
      55 / 100, and its stage reached is commit.
    - The current "lot acceptance" engagement has run 1, at 10 / 100, baseline.
    - Every Curia run is payloadVersion 1.
  - **No verified actual,** anywhere on the account.
  - **Errata, 48 rows on the reference engagement's runs:**
    - "the owner's commitment attestation as supporting the impact basis" (runs 13–21);
    - "points to a person who is not customer-side": the 30 and 45 points of runs 3–21, which the headline prints as
      "45 of these points rest on a person who is not customer-side";
    - "a figure that has no source on record" (runs 4–21).
  - **A figure finding:** "the baseline, 214 days, has no source on record", on outcome `e3fb0061`.
  - **Evidence:** 14 current rows. Among them is `092c46b6`, a legacy vendor-publication row: "102,584 total
    accesses, 8,487 badges earned, 5,282 learning hours…", the three activity figures in one row, with no quote and
    no locator.
- **A vendor publication about another account reads basis "inferred"** (`lvrf_evidence_basis`): Skillsoft's own
  case study is Skillsoft's marketing about Curia, not Curia's record. "Published" applies only on the tenant's own
  account.
- **No evidence field states what kind of figure a published figure is.** The kind, the form (quote or located cell,
  with a scale of units to percent) and the how-read text say where a figure came from, not what it can support.
- **LVRF has no claim id.** A figure is a sealed run's field or an evidence row, each with its own id.
- **The asks:** the value case computes them from the sealed run (`askFor`).

### 1a. Curia's story: the runs it reads, and what it prints (Brad's condition 2; read from the prod copy, 24 Nov 2026)

**It reads Curia's six real runs, never its 16 system exercises:**

| Engagement | Run | Locked | Confidence | Hash (first 12) | Errata on it |
|---|---|---|---|---|---|
| Reference example (retired) | 1 | 29 Aug 2026 | 10 / 100 · Low | `e8306254ed8a` | none |
| Reference example (retired) | 3 | 29 Aug 2026 | 30 / 100 · Low | `69188ede1765` | the customer-side credit |
| Reference example (retired) | 4 | 29 Aug 2026 | 30 / 100 · Low | `57dd002e1d74` | the customer-side credit; the unsourced figure |
| Reference example (retired) | 5 | 29 Aug 2026 | 45 / 100 · Low | `6de649ce55c7` | the customer-side credit; the unsourced figure |
| Reference example (retired) | 13 | 30 Aug 2026 | 55 / 100 · Medium | `b15dd9b7209e` | the link correction (its current erratum, which superseded an earlier one); the customer-side credit; the unsourced figure |
| Lot acceptance (current) | 1 | 5 Sep 2026 | 10 / 100 · Low | `b32088fb9671` | none |

**The confidence it prints:** each engagement's latest real run, as sealed.
- **Run 13, 55 / 100 · Medium,** for the retired reference engagement, with its errata beneath it. The book's own
  line reads "45 of these points rest on a person who is not customer-side".
- **Run 1, 10 / 100 · Low,** for the lot-acceptance engagement.
- **Runs 1, 3, 4 and 5** of the reference engagement print on "How it went" with their sealed scores, as earlier runs,
  never as the headline.
- No score is averaged or combined across engagements.

**The errata it prints:** only current errata, never a superseded one. Each prints in the platform's plain wording for
its kind (`lvrf_erratum_line()`, ruling (c)), beside the sealed score it concerns, and is cited by its short id. Read
from the prod copy, 24 Nov 2026:

| Run | Sealed | Beside it, same size and weight | Cited |
|---|---|---|---|
| 3 | 30 / 100 | 20 of these points rest on a person who is not customer-side | `f54623e4` |
| 4 | 30 / 100 | 20 of these points rest on a person who is not customer-side · its baseline, 214, has no source on record | `72730e1b`, `3b7a687f` |
| 5 | 45 / 100 | 35 of these points rest on a person who is not customer-side · its baseline, 214, has no source on record | `f29654e8`, `3d005490` |
| 13 (headline) | 55 / 100 | 45 of these points rest on a person who is not customer-side · its baseline, 214, has no source on record · a link corrected since sealing; not recomputed | `2ac07720`, `4447bd3b`, `31ae268b` |

- The figure finding prints under the baseline, too: "the baseline, 214 days, has no source on record" (outcome
  `e3fb0061`).
- **Runs 1 and 1** (the reference engagement's first run, and lot acceptance's) carry no erratum.
- **D9's "once, naming the runs"** applies to the ledger. Beside each score, the run's own errata always print.

**Correction to 1a (25 Nov 2026, read from the fresh prod copy, `lvrf-post-curia-rows-20261125T140354Z.dump`):**
1a was read from a copy restored on 6 Nov, not from prod as it says. Since 15 Nov, B4's addendum has recorded a
"misstated finding" erratum on every one of Curia's six real runs. **What 1a missed:**
- **Runs 1 and 1** (the reference engagement's first run, and lot acceptance's) are not erratum-free. Each carries "its
  finding F2 misstates the seal" and "its finding F3 misstates the seal".
- **Runs 3, 4 and 5** carry both, besides the errata 1a lists.
- **Run 13** carries "its finding F3 misstates the seal", besides its three.

Under Brad's rulings (every current erratum, in the platform's wording, `lvrf_erratum_line()`, beside the sealed score
it concerns, at the same size and weight, never dropped), each of these prints too. Curia's headline therefore
reads: "55 / 100 as sealed · a link corrected since sealing; not recomputed · 45 of these points rest on a person who
is not customer-side · its baseline, 214, has no source on record · its finding F3 misstates the seal". The order is
`lvrf_run_erratum_line`'s: recorded time, then kind, then id. No ruling changes. The story follows the rule, and the
record is what it prints.

### 2. Decisions (recommendations first)

- **D1, what a story reads, and when it is sealed. Recommended:**
  - **A draft** renders on screen only, marked DRAFT. It reads:
    - every locked run of the account that is not a system exercise (Brad: real runs only), retired engagements
      included and labelled so;
    - each run's sealed errata;
    - the account's figure findings;
    - the current head of each evidence row the story cites.
  - **Issuing a story seals it:** a new `story_records` row (migration) holds the story's payload and its sha256.
    - Every printed page prints that hash in full, with both banners.
    - Re-rendering an issued story is byte-identical (S1).
    - An issued story is withdrawn, never edited or deleted.
  - **Only an issued story prints.** That answers "sealed only" for evidence rows, which no run seals.
  - Option: stories are never sealed and print from runs and live evidence. Rule 1 would then be broken for the
    published-story section.
- **D2, the stage, computed (Brad's item 2). Recommended:**
  - **Decision:** a locked run and no verified actual.
  - **Realization:** a verified actual in a sealed run.
  - **Compounding:** verified actuals in two or more sealed runs, at different measurement dates.
  - **What each stage may print:** "Achieved", "realized" and "result" print only at realization and above. Below
    it, "Results" does not render at all (CVAF's rule: a section with nothing behind it does not render).
  - **Compounding, ruled (Brad, 25 Nov 2026): option (a), with a condition.** A run's seal records no date for its
    actual, so "at different measurement dates" cannot be read from seals alone. Compounding is **two verified sealed
    real runs whose actuals rest on different sealed evidence rows, where neither row supersedes the other**: a row and
    its correction are one measurement (`lvrf_evidence_chain`). **S7b's Gate A gains a break:** a corrected row counted
    as a second measurement fails. On the 3.1 list: (b), the measurement date sealed in new runs and used for
    Compounding once both runs carry it; and a print record for issued stories, required before any story is printed
    for a customer.
- **D3, a reference example is not a decision story. Recommended:** an account whose current marker makes it a
  reference example gets **"Reference" as its stage, never Decision.**
  - Curia took no decision through LVRF (its marker says so), and a decision story would claim one.
  - **It may print:**
    - what outside-in research found;
    - what the published sources say, read against the record (D5);
    - its sealed runs, as runs of a reference example;
    - the asks;
    - the errata.
  - **It never prints** a decision, a commitment as the client's, or a result.
  - Its title reads "A reference example, built from published sources: Curia has not engaged through LVRF", as the
    marker's note says.
  - Option: compute Decision for Curia and rely on the banner. A reader would see "Decision" on an account that
    decided nothing.
- **D4, audiences (Brad's item 7). Recommended:** internal and client. **A reference example renders for the internal
  audience only.** It has no client engagement, and a "client" copy for Curia would read as Curia's document, which
  rule 8 forbids.
- **D5, "The published story, read against the record" (Brad's item 3):**
  - **Where the class lives. Recommended:** **a new nullable evidence field, `published_figure_class`** (migration).
    **Departed from (Brad, 25 Nov 2026, §33 D2):** required on a vendor publication about another account only;
    optional on a public filing; refused elsewhere. A public filing's research facts have no class to give.
    - **Its five values:** license count, activity count, adjective, outcome without baseline, outcome with
      baseline.
    - **When it is allowed:** only on a vendor publication or a public filing. The guard requires it once the field
      exists, when such a row is recorded on an account that is not the tenant's own.
    - **When it is fixed:** at recording. A correction is a supersession, as for every evidence field.
    - **Why it does not fit an existing field:** the scale is a number's unit, not its kind, and the how-read text is
      prose. The rule "what each can support" has to read a value, not a sentence.
    - Option: no migration, the class encoded in how-read text. That is not checkable, and a story would have to
      parse prose.
  - **When the section renders. Recommended:** for any account holding current rows with a class, **not keyed on the
    marker.**
    - Curia's current marker is `outside_in_test`, not `published_case_study`, and Brad changed it on 1 Nov 2026. The
      section should not depend on reopening that.
    - Option: render only under a `published_case_study` marker, which would need a marker act on Curia first.
  - **What the story states for each class** (fixed wording; the table is the plan, and the mock-ups show it):

    | Class | It can support | It cannot support |
    |---|---|---|
    | License count | how many seats were bought, and when, as the publisher states | use, adoption, or any outcome |
    | Activity count | that the activity was recorded in the stated period, by the publisher's system | capability change, a business outcome, or a rate per person (no headcount is cited) |
    | Adjective | that the publisher described it so | any figure |
    | Outcome without baseline | the after-figure the publisher states | a change, or what caused it |
    | Outcome with baseline | the change the publisher states, as the publisher's claim | attribution to the learning: no method is stated |

    Every row also prints its basis. For Curia that is **inferred**: the vendor's own publication about another
    company. Its open state prints too (unverified until Brad opens the source).
- **D6, the legacy row `092c46b6`. Recommended:** Brad supersedes it with the accesses row (D10's row 4). The reason
  says the badges and learning hours move to rows of their own. After that, the ledger holds one figure per row and
  no figure twice.
- **D7, ids and the ledger (Brad's item 6). Recommended:** no AI drafting.
  - Every figure in the text is a numbered ledger entry, printed beside it as a superscript.
  - The ledger at the end gives each entry's source: a sealed run (its number, short id, the field and the run's
    full hash) or an evidence row (its short id, kind, basis, form, the quote or the located cell, and its open
    state).
  - Short ids print in mono in the ledger only, never in the prose.
- **D8, the asks (Brad's item 4).** "The results story waiting to be earned" prints the asks of each engagement's
  latest run as the value case prints them (`askFor`, from the seal). For a reference example the heading reads
  "What a results story would need".
- **D9, errata (Brad's item 5).** Each erratum and finding prints under the figure it corrects, in the record's own
  words, with its date:
  - **Curia's baseline:** "the baseline, 214 days, has no source on record".
  - **The 45 points:** "45 of these points rest on a person who is not customer-side".
  - **Repeats:** an erratum repeated across runs prints once, naming the runs it applies to.
- **D10, the printed form and the words (Brad's items 1 and 8).** The S3 family: a one-page story and the full story,
  both banners and the full hash on every page, self-hosted fonts.
  - **On screen and on paper:** plain words only. Small item 1's Gate A check (no "§", no slice code) covers the
    story too.
  - **Sources:** public sources only. Quotes are short and verbatim, from a recorded evidence row, never typed into
    the story.
  - **Never:** an invented result or quote, a figure without a ledger entry, or any mark, logo or layout that reads
    as Skillsoft's or Curia's document. Every page carries "Prepared by [tenant] with LVRF".
- **D11, the order. Recommended:** **two deploys.**
  - **S7a:** the class field on card 01c's source form, the guard, and its migration. Brad then records Curia's
    published rows (section 4).
  - **S7b:** the story, built on S7a's rows.
  - The first story renders from what Brad recorded, so S7b's Gate A walks Curia's real shape on a prod copy taken
    after Brad's acts.

### 3. What it does not do

- No AI drafting, no quotes beyond evidence rows, no Story Release, no co-sell or public copy (v1; Brad's items 6
  and 7).
- No story across accounts.
- No change to any sealed run, the value case, the POV or the War Room: output identity holds for every existing
  output.
- No staleness hook. An issued story names the evidence heads it sealed. At read it says "Newer evidence exists:
  re-issue to include it" when a head was superseded since, and it changes nothing.

### 4. Brad's acts after S7a (through the page, rule 10)

**Where:** on Curia's page, card 01c, "Record a source…", **six rows**.

**Why the quotes are blank:** skillsoft.com refused the automated read (403), so the page was not read from here, and
no quote below is filled in. Paste each quote from the page, word for word, and the page's URL into the citation.

**Every row shares these fields:**

| Field | Text |
|---|---|
| Kind | Vendor publication |
| Where it came from | Skillsoft's customer case study "From the Ground Up: How Curia Built a Popular Learning and Development Program From Scratch", published by Skillsoft on skillsoft.com. Skillsoft's own account of Curia's program, not Curia's records. |
| Citation, export ID or URL | *[the case study's URL, from your browser's address bar]* |
| What it is about | This account |
| What it rests on | A quote |

**Rows 1–3: the license count** (class "License count"):

| Row | What it states | Quote | How it was read |
|---|---|---|---|
| 1 | The case study says Curia began with 500 Skillsoft licenses. | *[the page's sentence stating 500 licenses, verbatim, at most 40 words]* | The starting license count, as the quoted sentence states it: seats bought, not people using them. |
| 2 | The case study says Curia grew to 1,000 Skillsoft licenses. | *[the sentence stating 1,000, verbatim; it may be the same sentence as row 1]* | The second license count the case study states, read from the quoted sentence: seats bought, not use. |
| 3 | The case study says Curia grew to 2,500 Skillsoft licenses. | *[the sentence stating 2,500, verbatim]* | The latest license count the case study states, read from the quoted sentence: seats bought, not use. |

**Rows 4–6: the activity, January–June 2023** (class "Activity count"):

| Row | What it states | Quote | How it was read |
|---|---|---|---|
| 4 | The case study reports 102,584 accesses on Curia's Skillsoft platform from January to June 2023. | *[the sentence or stat block stating 102,584, verbatim]* | The count of platform accesses for January–June 2023, as Skillsoft reports it from its own platform. |
| 5 | The case study reports 8,487 badges earned at Curia from January to June 2023. | *[the sentence stating 8,487, verbatim]* | The count of badges earned for January–June 2023, as Skillsoft reports it from its own platform. |
| 6 | The case study reports 5,282 learning hours at Curia from January to June 2023. | *[the sentence stating 5,282, verbatim]* | The hours of learning recorded for January–June 2023, as Skillsoft reports it from its own platform. |

- **The quotes:** if the page shows a figure only in a stat block, with no sentence, paste the block's words exactly
  as shown (for example "102,584 total accesses"), and say so in the how-read text.
- **Then, on each row,** "Record that you opened…", with "the source says what it states" once you have checked it
  on the page.
- **Row 4 supersedes `092c46b6`** (D6), recorded with "Supersede…" on that row instead of "Record a source…". Its
  reason: "One figure per row: the accesses figure moves here, with its quote; the badges and learning hours have
  rows of their own."
- Each row reads basis "inferred" (D5).

### 5. Gate A (planned, per deploy)

- **S7a:**
  - the class is required on a vendor publication or public filing about another account, and refused elsewhere,
    by the database and the route;
  - it is fixed at recording, and corrected only by supersession;
  - the confirmation names it;
  - 390 and contrast.
  - **Breaks:** the class rule removed; the class made editable; the class missing from the confirmation.
- **S7b,** on a prod copy taken after Brad's acts, as the steward by session:
  - **Curia's story:**
    - stage "Reference", never Decision;
    - no "achieved", "realized" or "result" anywhere;
    - each published row with its class, its can and cannot, and its basis;
    - the 214 finding and the 45 points under the figures they correct;
    - the asks;
    - every figure with a ledger entry that matches SQL;
    - no plan code.
  - **Issuing:** a re-render is byte-identical; withdrawal is the only change; the hash prints on every page.
  - **A fixture account on the clone:**
    - a verified actual opens Realization;
    - two open Compounding;
    - "Results" never renders below Realization;
    - the client audience is refused on a reference example.
  - **Breaks:**
    - **the headline score printed without its adjacent points erratum** (Brad, 24 Nov 2026);
    - "achieved" printed below Realization;
    - a figure with no ledger entry;
    - a reference example computed as Decision;
    - a print from a draft;
    - an erratum dropped;
    - a plan code on screen.
  - The full regression, and equivalence: every existing GET identical, with the new routes named.

### 6. Mock-ups, Gate B and the cut-off

**Brad's rulings on the mock-ups (25 Nov 2026): approved, with two changes.**
1. **The cover title follows the stage, never claiming beyond it:**
   - Reference: "Story of record";
   - Decision: "Story of record: decision";
   - "Success story" only at Realization or later, when a sealed run holds a verified actual.
   - **S7b's Gate A gains a break:** "Success story" on a story below Realization fails.
2. **The five classes are approved word for word, except two "cannot support" lines:**
   - **Activity count:** "capability change, a business outcome, or a rate per person, unless a headcount is cited from
     the same source";
   - **Outcome with baseline:** "attribution to the learning, unless the publication states a method that can be checked".

   **The table as ruled:**

   | Class | It can support | It cannot support |
   |---|---|---|
   | License count | how many seats were bought, and when, as the publisher states | use, adoption, or any outcome |
   | Activity count | that the activity was recorded in the stated period, by the publisher's system | capability change, a business outcome, or a rate per person, unless a headcount is cited from the same source |
   | Adjective | that the publisher described it so | any figure |
   | Outcome without baseline | the after-figure the publisher states | a change, or what caused it |
   | Outcome with baseline | the change the publisher states, as the publisher's claim | attribution to the learning, unless the publication states a method that can be checked |

   It supersedes D5's table above.

**The mock-ups, made 25 Nov 2026, for Brad's review:**
- **Where:** `design/mockups/s7-*.html` and `s7-story.css` (fictional accounts only: Halden Assay Labs, a reference
  example; Corbel Freight, a client at Decision; Northstar Learning, the vendor).
- **The review PDF:** `~/lvrf-backups/s7-mockup/s7-mockup-review.pdf` (`600`, 16 pages). Its front page carries D5's
  can/cannot table for Brad's approval word for word, before S7a's form ships.

- **Mock-ups first, fictional accounts only:**
  - a reference example and a client account at Decision, each one-page and full, at 1280 and in print;
  - the headline "55 / 100 as sealed · 45 of these points rest on a person who is not customer-side" (in a
    fictional account's figures), and each timeline score beside its erratum, at the same size and weight;
  - card 01c's source form with the class, at 1280 and 390.
  - The review PDF goes in `~/lvrf-backups/s7-mockup/` (`chmod 600`).
- **Gate B, each a migration:** a backup before migrating (rule 8); the TOC and the triggers move, with the counts
  named in each plan.
- **The cut-off:** as for S5 and S6, Gate C by Fri 18 Dec 2026, or after 15 Jan 2027.
  - S7a is small, so it fits.
  - S7b is not a navigation change, but it is a new output. **Recommended:** it may still deploy inside the window
    if Gate A is clean, because it adds a page and changes no existing one.
- **Effort:** about half a day for the mock-ups; about a day for S7a; about three days for S7b after the mock-ups
  are approved.

### 7. Amendment: "Story" in the account frame (Brad, 25 Nov 2026)

S7b's story-page commit (`614e8fe`) added a "Story" link to the S5 account frame, as "a declared screen change". It was
not in this section's plan, rulings or mock-ups, and S7b's Gate A regression found it: `verify_s5_account_frame` failed
on a sixth link it did not expect. **Brad's ruling: keep it.**

- **Its place:** the frame's last page link, after "Point of view".
- **Which accounts show it:** every account but your own. The tenant's own account has no "Point of view" and no
  "Story", as S5 ruled for its own pages.
- **What it opens:** `/accounts/:id/story`, the account's story page, under the same account's frame, with "Story" as
  the current page.
  - With a locked run that is not a system exercise, the page shows the draft (DRAFT, on screen only, no Print) and the
    account's issued stories.
  - **With none, the page says so in words:** "This account has no locked run that is not a system exercise: there is
    no story to tell yet." Any issued stories still list above it. It shows no issue panel; it is never an error and
    never blank.
- **Gate A:** `verify_s5_account_frame` expects "Story" in every frame but the tenant's own, and opens it on Curia (its
  draft composes) and on a new account with no runs (the no-story sentence, exactly).

## 28. 3.1 small items: plain words on screen, and the local commit date (planned 24 Nov 2026; **approved by Brad, 24 Nov 2026, with D1–D4 as recommended and D5 changed; D2's wording read by Brad before the build**; **Gate A 24 Nov 2026** (`BUILD_STATUS.md`, "§28 … Gate A"); **closed 24 Nov 2026**, deployed at `2dc3f71`, Gate C clean (`BUILD_STATUS.md`, "§28 closed"))

**Brad's rulings (24 Nov 2026):**
- **D1–D4 are approved as recommended.** Brad reads D2's wording table before the build.
- **D5 changed. "Late" uses Anywhere on Earth:** an outcome is late only once its promised day has ended everywhere,
  that is, from 12:00 UTC on the day after the promised date.
  - This **replaces §26 D4's** UTC-date comparison.
  - Where "late" shows, it says **"late: the promised day has ended everywhere"**.
  - **`verify_local_date` adds the three instants** for an outcome promised for 23 Nov:
    - not late at 19:00 New York on 23 Nov;
    - not late at 06:59 New York on 24 Nov;
    - late at 07:00 New York on 24 Nov (12:00 UTC).
- **Printed-on dates stay UTC, with "(UTC)" beside them.**
- **Next:** build to Gate A.
- **D2's wording is approved word for word as in the table** (Brad, 24 Nov 2026).
- **A new small item, next after this slice and before the pilot** (Brad, 24 Nov 2026): refuse a Committed on,
  Measured on or Verified on date later than one day after today's UTC date, by the route and the database, with a
  Gate A break. It is on the 3.1 list (`docs/LVRF_3.0_CRITICAL_PATH.md`).

**The ruling it builds:** §26's two findings (Brad, 24 Nov 2026), first among the small items and before the pilot.
1. Internal plan codes leave the screen, with a Gate A check that no "§" or slice code appears in any client string.
2. "Committed on" defaults to the person's local date, and the route's "after the commit date" rule is proven for a
   measure-by date entered the same evening.

They ship as **one slice, one deploy**: both are small, and both touch card 01d. It comes before S7a, as the order
ruled.

**Value spine:** `commit`, and every page. A plan code on screen is a word the reader cannot check. A commit dated the
next day records a day the person did not commit on.

### 1. What the code holds today (read 24 Nov 2026, `50c82c9`; read only)

**Plan codes that reach a page, found by scanning every string outside comments:**

- **Client text (11 strings):**

  | Where | Today |
  |---|---|
  | `OutcomeSpine.tsx` 193 (card 01d) | "no promised date on record (committed before §26)" |
  | `OutcomeSpine.tsx` 194 (card 01d) | "attribution not stated (committed before B4)" |
  | `ValueCasePage.tsx` 119 (the value case, on screen and printed) | "Attribution: not stated (committed before B4)." |
  | `LineagePage.tsx` 59, 70 | "… is not customer-side (…): no credit under the C3 rule." |
  | `PovPage.tsx` 178 (the POV) | "… is not customer-side (…): no credit under the C3 rule." |
  | `CustomerRoles.tsx` 74 | "Only a customer-side person earns credit … (C3)" |
  | `C3Batches.tsx` 51 (the steward's batch page) | "Two kinds, recorded together (C3, C3b): …" |
  | `PovAuthoring.tsx` 337 | "… a reference example, not an engagement (O-D3): …" |
  | `PackLevers.tsx` 30 | "… the steward's act — …'s alone (O-D2)." |

- **Server text a page shows:**
  - **`nonCustomerCredit.ts` 62–63**, the credit line on the POV and the lineage: "Under the C3 rule (model 1.0.2) none
    of these earns credit: …" and "The C3 rule cannot be applied …".
  - **`gapRegister.ts` 288, 313, 323**, the asks on the value case and card 01d: "… (a role named from a source, C3)",
    twice "… named from a source (C3)."
  - **`valueHypotheses.ts` 213:** "… an AI-drafted summary says so (O-D6)".
  - **`valueLevers.ts` 49:** "… not a promise (LVRF_PLAN §5)".
- **Database refusals a form shows verbatim.** `plainCheckMessage` rewrites CHECK violations only; a trigger's
  message passes through. **6 of the 196** carry a code:
  - two "(O2-D1)";
  - "(B4, design §3.2)";
  - "(LVRF_PLAN §26, D1)" and "(LVRF_PLAN §26, D3)", mine at §26;
  - "(D2)".
- **Not on any page,** so out of scope: heartbeat-register errors (500s, a programming fault) and the drift checks'
  codes (ops only).
- **`findingsModel.ts` 109** writes "HEARTBEAT-REGISTER §6 …" into a finding that a run seals. It is in scope for
  future seals only.
- **Sealed payloads hold no plan code:** the 10 real runs on the prod copy were scanned. **Nothing sealed changes,**
  and no sealed text is ever rewritten.
- **Scripts that read the coded strings, and change by design:** `c3_walk`, `l41_walk`, `pov_walk`, `promised_walk`,
  `report_c3.sql`, and `verify_c3`, `c3b`, `cohort`, `corrections`, `promised_date`, `steward_acts`,
  `tenant_scope_cases`, `value_hypotheses` and `value_levers`.

**The commit date:**
- **The bug:** `OutcomeSpine.tsx` 41's `today()` is `new Date().toISOString().slice(0, 10)`, the UTC date. It is the
  default for **Committed on, Measured on and Verified on** alike.
- **What is sent:** each form sends `${date}T12:00:00Z` (verify sends `T13:00:00Z`).
- **What compares it:** the route and §34's guard compare that instant's UTC date. That is the picked day.
- **No rule** refuses a commit, measurement or verification dated in the future.

### 2. Decisions (recommendations first)

- **D1, what the check covers. Recommended:** **`scripts/check_plain_words.mjs`** (new), run by Gate A and by the
  regression.
  - **What it reads:**
    - every client source string outside comments;
    - every server string a response can carry: messages, refusals, asks, credit lines, finding messages;
    - every `RAISE EXCEPTION` message in `db/hardening.sql`.
  - **What it refuses:**
    - "§";
    - `LVRF_PLAN`;
    - "design §";
    - `AMENDMENT-`;
    - slice and decision codes: B, S or SS with a digit; L with digits; C with a digit (and "C3b"); O-D, O2-D or D
      with a digit; P with digits.
  - **It allows:** `data-testid` values, imports and code identifiers. They never print.
  - **A rendered sweep, too:** on a clone of the prod copy, every route at 1280, the page's visible text scanned with
    the same pattern.
    - A hit in app text fails.
    - A hit in the record (a person's own words in evidence, a note, a reason, sealed text) is listed, never failed:
      the record is never rewritten.
  - Option: the static check only.
- **D2, the new words, for Brad's approval word for word:**

  | Today | Plain words |
  |---|---|
  | "(committed before §26)" | "(committed before promised dates were recorded, 24 Nov 2026)" (Brad) |
  | "(committed before B4)", on card 01d and the value case | "(committed before attribution was recorded, 6 Nov 2026)" (Brad; B4 deployed 6 Nov 2026) |
  | "no credit under the C3 rule." (lineage, POV) | "no credit: only a customer-side person, with a role named from a source, earns it." |
  | "(C3)" and ", C3)" in the asks and on the roles card | dropped; the sentence already says "a role named from a source" |
  | "Under the C3 rule (model 1.0.2) none of these earns credit: …" | "Under model 1.0.2, only a customer-side person earns credit, so none of these does: …" |
  | "The C3 rule cannot be applied …" | "The customer-side rule cannot be applied …" |
  | "Two kinds, recorded together (C3, C3b): …" | "Two kinds, recorded together: …" |
  | "(O-D3)", "(O-D2)", "(O-D6)", "(O2-D1)", "(D2)" | dropped; each sentence already says its rule |
  | "(LVRF_PLAN §5)", "(B4, design §3.2)", "(LVRF_PLAN §26, D1)", "(LVRF_PLAN §26, D3)" | dropped |
  | "HEARTBEAT-REGISTER §6 and COMPASS-HEARTBEAT-STATUS §7 have diverged" | "the heartbeat register and the health status have diverged" |

  A database message changes in its function's body only, so hardening is re-applied and no migration is needed.
  **"LVRF: value_outcomes:"**, the message's table prefix, stays: it is not a plan code. Option: a later item.
- **D3, the printed value case changes words, not figures. Recommended:** accept it. **Corrected at the build (24 Nov
  2026): no sealed run on prod prints this line.** Curia's runs are payloadVersion 1, with no attribution sealed, and
  the one v5 run (Skillsoft's run 2) has no target. The words change in the source, and Curia's card 01d is the only
  place on prod that shows the pre-attribution sentence.
  - The value case's "Attribution: not stated (committed before B4)." becomes the D2 wording, on screen and in a new
    print, for a commitment made before attribution was recorded. On prod that is only Curia's.
  - The sealed runs and their hashes do not change; a print request names its run's hash, not the PDF's.
  - Equivalence names the GETs whose strings change: the asks; nothing else.
- **D4, the local date. Recommended:**
  - **The change:** one function, `localToday()`, from the browser's own date (year, month, day in local time), for
    Committed on, Measured on and Verified on.
  - **Unchanged:** what is sent (`${day}T12:00:00Z`) and every rule.
  - **The consequence:** the stored commit day is the day the person picked, and the route and the guard judge
    "after the commit date" against that same day.
  - **At 22:28 New York time on 23 Nov:**
    - the form defaults to 23 Nov;
    - a measure-by date of 23 Nov is refused, by the form, the route and the database;
    - 24 Nov is admitted.
- **D5, "late" and the printed-on date. Ruled (Brad, 24 Nov 2026), replacing the recommendation:**
  - **"Late" is Anywhere on Earth.** An outcome is late only once its promised day has ended everywhere: from 12:00
    UTC on the day after the promised date.
    - This replaces §26 D4's UTC-date comparison.
    - One definition, `server/lib/late.ts`, is read by `GET /api/book`.
    - Wherever late shows, the page says "late: the promised day has ended everywhere".
    - **For an outcome promised for 23 Nov:** it is not late at 19:00 New York on 23 Nov, nor at 06:59 on 24 Nov; it
      is late from 07:00 New York on 24 Nov (12:00 UTC).
  - **Printed-on dates stay UTC,** with "(UTC)" beside them.
  - **Unchanged, and said:** east of UTC+12, a local day can be a day ahead of UTC's. No rule refuses a future date
    yet; the small item after this slice adds one.

### 3. Gate A (planned)

- **`check_plain_words.mjs`:** 0 hits, then each break caught:
  - a "§" added to a client string;
  - "(C3)" added to an ask;
  - "(D2)" added back to a database message.
- **The rendered sweep:** every route at 1280 on the clone, 0 hits in app text, with hits in the record listed.
- **The words, on the page:**
  - card 01d reads both D2 sentences for Curia's pre-B4, pre-§26 commitment;
  - the value case and the lineage read theirs.
- **`verify_local_date` (new),** in the browser with its time zone set (`Emulation.setTimezoneOverride`) and its clock
  pinned:
  - **New York, 22:28 on 23 Nov:**
    - Committed on, Measured on and Verified on each default to 2026-11-23;
    - measure-by 2026-11-23 is refused by the form in words, by the route (422) and by the database;
    - 2026-11-24 is admitted, and `committed_at` is stored at 2026-11-23 12:00 UTC.
  - **Auckland, 09:00 on 25 Nov (24 Nov UTC):** the default is 2026-11-25.
  - **Break:** `today()` back to the UTC date, caught under New York's evening.
- The scripts named above are updated by design. Then the full regression, and equivalence against `84c3f37`'s
  deploy (`f3e8fe7`): every GET identical apart from the asks' and credit lines' strings, each named.

### 4. Gate B and effort

- **Gate B:** deploy, and hardening re-applied (six function bodies). No migration; the TOC stays 972 and the
  triggers 227. Each changed function's `md5(prosrc)` is computed at Gate A.
- **Brad's look:**
  - card 01d on Curia, both sentences;
  - the commit form after 19:00 New York time defaults to today's local date (Cancel).
- **Gate C:** read-only, as usual.
- **About a day,** including the sweep.

**Closed (24 Nov 2026).** Brad's Gate B at `2dc3f71`; Gate C clean (`BUILD_STATUS.md`, "§28 closed").
- **The leaked Vite servers: approved by Brad as a small item** (24 Nov 2026), as proposed above. It is on the 3.1 list.
- **Brad's finding from his look:** the commit form offers a person who is not customer-side. Planned as §29, the next
  small item, ahead of the future-date item.

## 29. 3.1 small item: only a customer-side person commits (planned 24 Nov 2026; **approved by Brad, 24 Nov 2026, with D1–D7 as recommended, D6 included, and four additions**; **Gate A 24 Nov 2026** (`BUILD_STATUS.md`, "§29 … Gate A"), with five departures: 1, 2, 3 and 5 accepted by Brad, 4 changed to his wording, with "tenant" refused in client strings); **closed 24 Nov 2026**, deployed at `25e1be0`, Gate C clean (`BUILD_STATUS.md`, "§29 closed")

**Brad's rulings (24 Nov 2026):**
- **D1–D7 are approved as recommended, D6 included:** the verifier is under the same rule, in the same slice.
- **Addition 1, D2's empty state names the fix and links to it:** "No customer-side person is recorded at this account
  yet. Add one, with a role named from a source, on the roles card." The link goes to card 01b. Gate A checks the
  sentence and the link.
- **Addition 2:** `docs/LVRF_NEW_ACCOUNT_CHECKLIST.md` gains the step: at least one customer-side person, with a role
  named from a source, before any commitment or verification.
- **Addition 3 (asked by Claude at the build's start, ruled by Brad), the roles card adds a person.** Card 01b can only
  name a role for a person already recorded, and W1's "add a person" shows only before W1 is done. Curia's one person
  is Brad, so the sentence would point at a card with nobody to name. Card 01b therefore gains "Add a person of this
  account…": a governed form on the existing `POST /api/institutions/:id/inputs` route. It ships in the same deploy.
- **Addition 4 (asked by Claude, ruled by Brad), the tenant's own account follows the same rule for now.** On the
  tenant's page, card 01d says no one can commit there yet, with no roles-card link (that page has none).
  - **Why no one can:** on Skillsoft's own account Skillsoft is its own customer. The right committer for its
    dollar-retention target is a named Skillsoft executive, such as its CFO, as the case's ask says ("Who at Skillsoft
    would commit…"). The role guard treats every Skillsoft staff member as vendor-side, so no one qualifies today.
  - **That is fine for now:** no Skillsoft commitment is expected before the pilot, and its hypothesis is not due until
    June 2027.
  - **The ruling still owed, before any Skillsoft commitment:** on the tenant's own account, a named tenant executive
    with a role named from a source (for example the CFO, named in a filing) may commit and verify; never the steward,
    an analyst of record, or anyone without a sourced role. It is on the 3.1 list.
- **Next:** build to Gate A.

**Brad's finding (24 Nov 2026, from §28's look), before the pilot.** On Curia's Lot Acceptance Rate, the commit form's
"Who commits" offers "Brad Piver (external analyst of record)". He is not customer-side, yet the form says a
commitment is "the target a named person at the account commits to". Curia's `e3fb0061` was committed that way.

### 1. What the code and the record hold today (read 24 Nov 2026, `2dc3f71` and prod; read only)

**Nothing refuses it.** No route and no database rule refuses a commitment by a person who is not customer-side.
- **The route** (`server/routes/outcomeWalk.ts`, `POST /api/value-outcomes/:id/commit`) refuses only a person who is
  not of the account, is simulated, or is deleted (422, "committed_by_person_id does not belong to institution …, or
  is simulated").
- **The database** has no committer rule:
  - `lvrf_outcome_spine_guard` checks the commit's date, the promised date and the fields, never who;
  - `lvrf_block_simulated_attestor` checks only a verifier, and only that the verifier is not simulated.
- **The form** (`OutcomeSpine.tsx`, `Commit`) lists every person of the account. A person who is not customer-side is
  marked with a reason, but can still be chosen. The roles card (`CustomerRoles.tsx`) disables the same people.
- **Two definitions disagree.**
  - The form's mark comes from the roles card's `ineligible`, a heuristic: simulated, an `analyst_of_record` link,
    "analyst" or "external" in the title, or sign-in credentials.
  - The credit rule is `lvrf_customer_side()` (C3): of the account, not simulated, not a current analyst of record,
    and holding a current customer-side role named from a source.
  - For Brad on Curia, the form says "an analyst of record or external, not the customer". The rule says "no
    customer-side role named from a source".
- **What follows today:**
  - The confidence model already gives such a committer no credit (model 1.0.2), and Curia's credit errata record the
    points earlier seals gave.
  - The commitment itself still stands, and the cost of delay and the falsifier's "target" both read it as a
    committed target.
- **On prod:**
  - **1 commitment:** Curia's `e3fb0061`, by Brad, `lvrf_customer_side` false ("no customer-side role named from a
    source");
  - **Curia has one person** (Brad), so under this rule the form would offer no one there;
  - **0 verified outcomes.**
- **The verifier has the same gap.** `POST /verify` checks the same three things and no more. The verify form lists
  people the same way.

### 2. Decisions (recommendations first)

- **D1. One rule: `lvrf_customer_side(person, account)`,** the rule credit already uses, so a commitment and its
  credit can never disagree. A commitment is checked when it is made: a role revoked later does not undo it, as a
  credit seal is not undone.
- **D2. The list offers only customer-side people at the account.** The persons read adds each person's
  `customer_side` and `side_reason` from `lvrf_customer_side_reason()`, and the form lists only those for whom it holds.
  - **No one eligible:** the form says "No one at this account is customer-side yet. A person becomes customer-side
    when the steward names their role from a source, on the roles card." It offers no committer, and Commit stays
    disabled with that sentence as its unmet line.
  - The form's mark, for those it still lists, is their roles with sources, as today.
- **D3. The route refuses anyone else** (422), in one plain sentence: "Only a customer-side person at the account can
  commit to a target. {Name} is not: {reason}." The reason is the rule's own words, such as "no customer-side role
  named from a source" or "linked as analyst of record". The existing account, simulated and deleted checks stay
  ahead of it.
- **D4. The database refuses anyone else,** whatever the caller. `lvrf_outcome_spine_guard` gains the rule:
  - **When it fires:** `committed_at` goes from null to set, or `committed_by_person_id` changes;
  - **What it does:** it raises `check_violation` with the same sentence (constraint `value_outcomes_committer_customer_side`).
  - **No new trigger** (227 stays) and **no migration** (TOC 972 stays).
- **D5. `e3fb0061` stays frozen as recorded.** The rule fires only on a new commitment or a changed committer, so it
  never reads, refuses or rewrites the old row. Its engagement is retired and frozen in any case.
  - **The card says so in words.** Beside its committer, card 01d prints "not customer-side: committed before only
    customer-side people could commit, {deploy date}", in the style of §28's two sentences. The sealed runs and their
    errata are unchanged. Recommended, because the card otherwise reads as a customer's commitment.
- **D6. The verifier, the same rule, in the same slice** (recommended): the verify form's list, the `/verify` route
  (422, "Only a customer-side person at the account can verify an actual. …") and the database (the same guard, on
  `verified_by_person_id`). Prod has no verified outcome, so nothing old is touched. If Brad rules it out, it goes on
  the 3.1 list instead.
- **D7. The roles card keeps its own list.** Who may be *given* a role is a different question from who holds one. Its
  heuristic stays as it is, and only the commit and verify forms move to the rule.

### 3. Gate A (planned)

- **`verify_customer_committer` (new),** on a clone with a fixture account holding one customer-side person, one
  person with no role named, and one analyst of record:
  - **the form:** only the customer-side person is listed; on an account with none, the D2 sentence shows and Commit
    stays disabled;
  - **the route:** the other two are each refused (422) with D3's sentence and their own reason, with nothing written;
    the customer-side person commits;
  - **the database:** a direct `UPDATE` setting each of the other two as committer is refused (`check_violation`,
    D4's constraint); changing a committed row's committer to one of them is refused too;
  - **after a commit:** revoking the committer's role leaves the commitment standing;
  - **`e3fb0061`** on the clone is byte-identical before and after hardening, and card 01d shows D5's sentence;
  - **with D6:** the same three layers for the verifier.
  - **Breaks:** each layer removed in turn (the route's check, the guard's clause, the form's filter), and each caught
    by its own section. The route break is caught by the route section, not hidden by the database.
- `check_plain_words` passes over the new sentences.
- The scripts that commit or verify with a non-customer-side fixture are updated by design, each named.
- The full regression, and equivalence against `2dc3f71`: every GET identical apart from the persons read's new
  fields, named.

### 4. Gate B and effort

- **Gate B:** deploy, and hardening re-applied (`lvrf_outcome_spine_guard`, and `lvrf_block_simulated_attestor` or the
  same guard for D6). No migration; the TOC stays 972 and the triggers 227. Each changed function's `md5(prosrc)` is
  computed at Gate A.
- **Brad's look:** Curia's commit form shows D2's sentence and no one to choose (Cancel); card 01d shows D5's sentence
  beside `e3fb0061`'s committer.
- **About half a day.**


## 30. 3.1 small item: plain words in server and database strings (planned 24 Nov 2026; **approved by Brad, 24 Nov 2026, with D1–D5 as recommended and three of D3's lines changed**; **Gate A 24 Nov 2026** (`BUILD_STATUS.md`, "§30 … Gate A"), with three departures for Brad to read); **closed 24 Nov 2026**, deployed at `843ce6d`, Gate C clean (`BUILD_STATUS.md`, "§30 closed")

**Brad's rulings (24 Nov 2026):**
- **D1–D5 are approved as recommended.**
- **D3's table is approved word for word, except three lines:**
  - the lever check becomes "This lever's pack entry (%) is not in your company's record.";
  - the link check becomes "This link's lever or offering is not in your company's record.";
  - "of the same key / persona" becomes "of the same key / persona in your company's record" (the scope kept).
- **The validation messages that name request fields** stay listed for a later ruling.
- **Next:** build to Gate A.

**Brad's ruling (24 Nov 2026):** the plain-words rule, "tenant" included, extends from client strings to the server and
database strings that can reach the screen. It is the next small item after §29 and not part of it. It changes
hardening's messages, so it has its own Gate A, function hashes, regression and deploy.

### 1. What the code holds today (read 24 Nov 2026, `467f888`; read only)

- **How a database message reaches the screen.** A hardening `RAISE` reaches the person word for word.
  `handleGovernanceError` records the raw text in `refusals`, then answers with `plainCheckMessage(err)`, which only
  rewrites Postgres's own constraint text. A message hardening wrote passes unchanged, **its `LVRF: <table>:` prefix
  included**. §29's R1 break showed one on screen: "LVRF: value_outcomes: only a customer-side person…". The gap
  register prints earlier refusals the same way ("Already refused: {refusal_message}", `GapListCard.tsx`).
- **"tenant" in strings a route can return: 13 server strings and 50 database messages.** Hardening holds 54; the
  other 4 are `access_grants`' operator-only messages.
  - **Server:**
    - "industry_slug unknown for this tenant";
    - "…is not an account of this tenant";
    - "A person belongs to the tenant's staff or to one account, not both";
    - "…and this tenant has no steward named";
    - "research call … is not an answered call of this tenant";
    - "That is not an evidence row of this tenant" and "…not an erratum of this tenant";
    - two "already exists for this tenant";
    - "…is not a current member of this tenant's staff…";
    - "This tenant already has…";
    - "offering_key not found for this tenant";
    - "…not a current offering in this tenant's catalog";
    - "…not the tenant-self institution…".
  - **Database:**
    - 21 "only the tenant's steward …" (2 more are `access_grants`', out);
    - 11 "… is not of tenant %" (5 accounts, a run, an outcome, an engagement, an act's subject, a role's account, a
      lever's entry);
    - 5 "… is not current, non-simulated staff of the tenant", and 2 "current staff of the tenant";
    - 2 "… does not exist in tenant %";
    - the tenant-consistency check on a lever's links;
    - "this account and tenant";
    - "tenant staff, a vendor-side role";
    - "the tenant's own people";
    - "of the same tenant and key/persona";
    - "the tenant's current one".
- **Plan codes the current pattern misses:**
  - "(D-M21)" in a database message and on the value case's "Share for review (D-M21)" card title;
  - "(3.0 Band A)" in three client steward messages.

  §28's pattern has no "D-M" or "Band".
- **Strings that never reach the screen,** and so are left out of the check, each for a reason:
  - **CLI only:** the seeds (`server/seed/`, "Expected exactly one tenant named 'Skillsoft'").
  - **Operator-only guards no route reaches:**
    - `access_grants` (granted and revoked by `scripts/grant_access.ts` and `revoke_access.ts` only);
    - `lvrf_block_delete`'s messages (no route deletes; "This is tenant-scoped reference data…");
    - the ownership assertion ("hardening.sql section 24");
    - the credential and access-grant "never deleted" messages, which name scripts.
  - **Identifiers:** the scope value `'tenant'` in the confidence models, and table names such as `'tenants'` in
    hardening's arrays.
  - **Sealed text:** the confidence models' factor notes, the findings model and the drift reasons. These are sealed
    into run payloads and recomputed by `check_run_hashes`, and changing a word would break that recompute for every
    sealed run. Heartbeat ids (`HB-0014`) appear there and as keys: they are record ids, printed as ids, like finding
    codes (§28).
- **Seen, not in this ruling:** validation messages name request fields ("industry_slug unknown", "body.person_id …",
  "offering_key not found"). Listed for a later ruling.

### 2. Decisions (recommendations first)

- **D1. The check covers server and database strings that can reach the screen.** `check_plain_words.mjs` applies the
  plan-code pattern and "tenant" to:
  - every server string a route can return: `server/routes`, `server/lib`, `server/research`;
  - every hardening `RAISE` message on a table a route writes.
  
  The exclusions in section 1 are named in the check itself, each with its reason, so a new string is in scope unless
  it is listed. The client rule is unchanged.
- **D2. The pattern gains "D-M" followed by digits and "Band A–E"** (with or without "3.0"), for client, server and
  database strings alike.
- **D3. The wording:**
  - **The person's own company is "your company"**, as §29 ruled on screen.
  - **The steward is "the steward".**
  - **An id that names your company is dropped from the sentence.** For example, "is not of tenant %" loses its
    tenant id argument.
  - **Table of patterns,** for Brad to read word for word. The full old-and-new list is a Gate A file for him to
    read.

  | Today | Becomes | Count |
  |---|---|---|
  | only the tenant's steward {does X} | only the steward {does X} | 21 |
  | the account % is not of tenant % | the account % is not one of your company's accounts | 5 |
  | run / outcome / engagement % is not of tenant % | run / outcome / engagement % is not one of your company's runs / outcomes / engagements | 3 |
  | the act's subject is not of tenant % | the act's subject is not in your company's record | 1 |
  | the account is not of tenant % | the account is not one of your company's accounts | 1 |
  | % is not current, non-simulated staff of the tenant | % is not a current, real member of your company's staff | 5 |
  | … current staff of the tenant | … a current member of your company's staff | 2 |
  | … does not exist in tenant % | … is not in your company's record | 2 |
  | a lever's tenant is its pack entry's (entry % is not of tenant %) | a lever is your company's only when its pack entry is (entry % is not your company's) | 1 |
  | a link's tenant is its lever's and its offering's (tenant %) | a link is your company's only when its lever and its offering are | 1 |
  | outcome % is not of this account and tenant | outcome % is not of this account | 1 |
  | (tenant staff, a vendor-side role, or sign-in credentials) | (your company's staff, a vendor-side role, or sign-in credentials) | 1 |
  | only the tenant's own people are linked | only your company's own people are linked | 1 |
  | of the same tenant and key / persona | of the same key / persona | 2 |
  | the tenant's current one | your company's current one | 1 |
  | (D-M21) | dropped | 1 database, 1 client |
  | (3.0 Band A) | dropped | 3 client |
  | server: "… this tenant" / "this tenant's staff / catalog" | "… your company" / "your company's staff / catalog" | 12 |
  | server: "not the tenant-self institution" | "not your own company's account" | 1 |
- **D4. The `LVRF: <table>:` prefix leaves the screen, not the record.**
  - `plainCheckMessage` drops a leading `LVRF: <name>: ` from a hardening message in the response.
  - The gap register's "Already refused" line drops it when it prints.
  - `refusals.message` keeps the raw text, so earlier refusals are never rewritten.
  - Hardening keeps the prefix, which tells an operator in psql which table refused.
- **D5. The record is never rewritten.** Earlier refusals, errata and sealed payloads keep their words; the rendered
  sweep lists them as record (§28 D1). Only new messages change.

### 3. Gate A (planned)

- **`check_plain_words`:** 0 hits under D1 and D2, then each break caught:
  - B6, "tenant" back in a database `RAISE`;
  - B7, "tenant" back in a route's response string;
  - B8, "(D-M21)" back in a client string;
  - B9, an excluded file's string moved into a route (a new string is in scope).
- **On the clone, through the routes:**
  - one refusal per D3 pattern, its response read for no "tenant", no plan code and no `LVRF:` prefix;
  - `refusals` holds the raw text;
  - the gap register's line on an earlier refusal prints without the prefix;
  - B10: D4's strip removed, the response check catches the prefix.
- **The rendered sweep:** 51 pages, 0 app hits.
- **Each changed function's `md5(prosrc)`,** computed. No migration, table or trigger (TOC 972, 227 triggers).
- **The scripts that read the old words,** updated by design, each named. Expected:
  - `verify_access_grants` is not one of them (its guards are operator-only and unchanged);
  - `verify_supersession`, `verify_c3`, `verify_c3b`, `verify_c2c`, `verify_corrections`, `verify_value_levers`,
    `verify_value_case`, `verify_value_hypotheses`, `verify_evidence_final`, `verify_commit_measure_verify` and
    `verify_outside_in_walk` are.
- **The full regression, and equivalence against `467f888`:** GETs identical apart from the gap register's
  refusal lines, each named.

### 4. Gate B and effort

- **Gate B:** deploy, and hardening re-applied, with each changed function's hash. No migration.
- **Brad's look:**
  - a refusal on screen, for example "Name a customer-side role…" by a non-steward. Nothing is recorded.
  - Curia's gap register.
- **About a day,** most of it the scripts that read the old words.

## 31. 3.1 small item: no walk date in the future (planned 24 Nov 2026; **approved by Brad, 24 Nov 2026, with D1–D5 as recommended**; **Gate A 24 Nov 2026** (`BUILD_STATUS.md`, "§31 … Gate A"); **closed 24 Nov 2026**, deployed at `7be9031`, Gate C clean)

**Brad's rulings (24 Nov 2026):**
- **D1–D5 are approved as recommended.**
- **Of the dates outside this ruling,** evidence dates are listed first for the later ruling, because evidence cannot
  be dated after it was recorded. The baseline and role dates come after.
- **Next:** build to Gate A.

**Brad's ruling (24 Nov 2026, at §28):** a Committed on, Measured on or Verified on date later than one day after today's
UTC date is refused, by the route and by the database, with a Gate A break. It comes before the pilot, after §30.

### 1. What the code and the record hold today (read 24 Nov 2026, `d77ce56` and prod; read only)

- **Nothing refuses a future walk date.**
  - **The routes** (`server/routes/outcomeWalk.ts`) read `committed_at`, `actual_measured_at` and `verified_at` with
    `requireTimestamp`, which checks only that each is a valid timestamp.
  - **The database:** no guard compares any of the three with today. `lvrf_outcome_spine_guard` (hardening §34, BEFORE
    UPDATE on `value_outcomes`) checks the commit's fields and the promised date's window, never "not after today".
  - **The forms** (card 01d) default each date to the person's local today (§28 D4) and set no upper limit. They send
    the chosen day at a fixed hour: `${day}T12:00:00Z` for a commitment and a measurement, `T13:00:00Z` for a
    verification.
- **Why one day's margin:** a person's local date is never more than one day after the UTC date. Auckland at 09:00 on
  25 Nov is 20:00 UTC on 24 Nov. So "no later than today's UTC date + 1" admits every local today on Earth, and nothing
  later (§28 D4).
- **On prod:** 1 commitment, Curia's `e3fb0061`. It is dated 30 Aug 2026 09:00 UTC and was recorded 30 Aug 12:49, so
  it is not in the future. There are no measurements or verifications. The rule finds nothing to refuse in the record.
- **Outside this ruling:**
  - the promised measurement date, which is future by design (§26);
  - the baseline's `baseline_measured_at` (W4);
  - evidence's `attested_at` and `captured_at`;
  - a role's `granted_at`.

  These are listed for a later ruling only if Brad wants one.

### 2. Decisions (recommendations first)

- **D1. The rule:** a walk date's UTC calendar date may be no later than today's UTC date plus one day. Here "today" is
  the database's `now()` when the step is written, and the route's clock for its own check.
  - **What it reads:** the date, not the time. A commitment sent for 25 Nov at 12:00 UTC is admitted all through
    24 Nov UTC; one for 26 Nov is refused.
- **D2. Checked when the date is set or changed, never re-read.** The rule fires only when `committed_at`,
  `actual_measured_at` or `verified_at` goes from empty to a value, or changes. A row already recorded is never read by
  it, as §29 D1.
- **D3. The routes refuse it (422)** before writing anything, each in a plain sentence:
  - "The commit date can't be later than today."
  - "The measurement date can't be later than today."
  - "The verification date can't be later than today."

  The words say "today" because to the person the margin is their own today.
- **D4. The database refuses it, for every caller.** The clause goes in `lvrf_block_simulated_attestor`, beside §29's,
  on INSERT and UPDATE of `value_outcomes`. The spine guard fires on UPDATE only, and §29's departure 1, accepted, put
  the walk's people rule in the same trigger for the same reason. The sentences match D3's, with its own constraint
  names: `value_outcomes_commit_not_future`, `…_measure_not_future`, `…_verify_not_future`. **No new trigger and no
  migration** (227 and 972 stay).
- **D5. The forms stop it first.** Each of the three date inputs gets `max` set to the person's local today, so the
  picker offers no later day. A later day typed in shows the unmet line "make the date today or earlier", and the
  button stays disabled.
  - The form is stricter than the rule: the person's own today, not UTC + 1. The margin is for the server, which cannot
    know the person's time zone.

### 3. Gate A (planned)

- **`verify_future_date` (new),** on a clone, through the routes, each step on its own fixture outcome:
  - **commit, measure, verify:** dated today's UTC date + 1, admitted (the Auckland morning); dated + 2, refused (422)
    in D3's sentence with nothing written. The route answers: no database refusal is recorded (as §30's R1).
  - **The database, as `lvrf_app`, rolled back:** each of the three set to + 2 is refused with D4's constraint; + 1 is
    accepted; a recorded row with a past date, re-saved by a later step, is not re-read.
  - **The forms, in the browser** with the clock pinned (as `verify_local_date`): each date's `max` is the local today
    in New York and in Auckland. A later day typed in shows the unmet line and disables the button.
  - **Breaks, each caught by its own section:** F1 the route's commit check removed (the database answers, its refusal
    recorded); F2 the database's clause removed (+ 2 accepted by SQL); F3 the form's `max` removed (the picker offers
    tomorrow).
- `check_plain_words` passes over the new sentences.
- **Scripts that commit, measure or verify with a date later than tomorrow,** if any, updated by design and named.
- **The full regression, and equivalence against `d77ce56`:** every GET identical.
- **Hashes:** one function, `lvrf_block_simulated_attestor`; its `md5(prosrc)` is computed at Gate A.

### 4. Gate B and effort

- **Gate B:** deploy, and hardening re-applied for one function. No migration.
- **Brad's look:** "Commit…" on Lot Acceptance Rate (no one to choose there, §29): the Committed on picker offers no
  day after today. Cancel.
- **About half a day.**

## 32. 3.1 small item: a person's email is optional (planned 24 Nov 2026; **approved by Brad, 24 Nov 2026, with D1–D7 as recommended and two additions**; **Gate A 24 Nov 2026** (`BUILD_STATUS.md`, "§32 … Gate A"), with four departures for Brad to read); **closed 25 Nov 2026**, deployed at `f33d6f1`, Gate C clean (`BUILD_STATUS.md`, "§32 closed")

**Brad's rulings (24 Nov 2026):**
- **D1–D7 are approved as recommended.**
- **Addition 1, D4's confirmation is recorded.** A column on `persons` names the person or people the new one was
  confirmed distinct from. The confirmer and the time come from the existing audit and actor. It is set only by the
  "This is a different person" path, and Gate A proves it is written then and never otherwise.
- **Addition 2, email case.** Read-only first: is `persons.email` uniqueness case-sensitive today, is the sign-in lookup,
  and do any of prod's 6 emails collide ignoring case? If uniqueness is case-sensitive, fold into `0053`:
  - emails stored lower-cased, normalized at the route;
  - a case-insensitive unique rule;
  - sign-in and the six access scripts look up by the normalized form.

  Report before building if anything on prod would collide.

**Addition 2's read (24 Nov 2026, read only, `ba86bc6` and prod):**
- **Uniqueness is case-sensitive:** `persons_email_key` is `UNIQUE (email)`, a plain btree on the text.
- **Every lookup already ignores case:**
  - `POST /api/auth/login`: `lower(p.email) = lower($1)`;
  - `scripts/lib/cli.ts` (`set_steward`, `grant_access`, `reset_password`, `revoke_access`, `set_password`,
    `set_email`): `lower(email) = lower($1)`;
  - `set_password.ts`, `grant_access.ts` and `set_email.ts` likewise.
- **Prod: no collision.** 6 persons, 6 distinct emails ignoring case; none holds a capital letter or a space. So it
  folds into `0053` with no row changed, and the build proceeds.

**The build, from the additions:**
- **`0053`:**
  - `persons.email` `DROP NOT NULL`;
  - `persons_email_key` becomes a unique index on `lower(email)`, keeping its name so the refusal's plain sentence still
    finds it;
  - a CHECK that a stored email is its own trimmed lower case (`persons_email_normalized`);
  - a new column `persons.confirmed_distinct_from uuid[]`.
- **The routes normalize an email** (trimmed, lower-cased) before writing. `set_email.ts` does too.
- **The lookups compare with the normalized form** (`email = lower(btrim($1))`).
- **A new database function, `lvrf_person_email_rules`, on two new triggers:**
  - on `person_credentials` (BEFORE INSERT): D3's rule;
  - on `persons` (BEFORE INSERT OR UPDATE): `confirmed_distinct_from` is set only when the person is added. Each id it
    names must be a current person of the same account with the same name, trimmed and case-folded. It never changes
    after.
- **Counts, revised from section 4:** **triggers 227 → 229; TOC 972 → 975** (one function, two triggers; the
  constraint-to-index swap keeps its count). Both are recounted at Gate A.

**Brad's finding (24 Nov 2026, from §29's look):** "Add a person" requires an email. People named in public sources,
such as a CHRO named in a case study, have none, so the form blocks them or invites a made-up address.

**Brad's design notes (24 Nov 2026):**
- a person's email is optional;
- a credential is refused for a person with no email (a database rule);
- the account-inputs route keeps email required for a person an assessment names;
- **the duplicate guard:** the same name on the same account is warned, not refused. The form shows the existing person
  and asks "choose them" or "this is a different person", in the full-text confirmation.

**Riding in this deploy (Brad, 24 Nov 2026, from §31's look):** Measure by's earliest selectable day becomes Committed on
+ 1, and follows Committed on when it changes.

### 1. What the code and the record hold today (read 24 Nov 2026, `ba86bc6` and prod; read only)

- **The column:** `persons.email` is `NOT NULL` with `UNIQUE (persons_email_key)` (migration 0000, `db/schema.ts`).
  Postgres's `UNIQUE` admits any number of nulls, so the emails present stay unique once the `NOT NULL` goes.
- **Who requires it:**
  - `POST /api/institutions/:id/inputs` (W1's "add a person" and card 01b's "Add a person", both "create-only" acts);
  - `POST /api/account-inputs`, which also maps each assessment to its person by `person_email` within the payload;
  - both forms ("Email (required by the route)" on W1, "Email" on card 01b).
- **The duplicate guard today** is `persons_email_key` alone ("{email} is already in LVRF; select them instead",
  `server/lib/refusal.ts`). Nothing compares names. A person with no email would have no guard at all.
- **Sign-in and the access scripts find a person by email only:**
  - `POST /api/auth/login`: `lower(email)`, tenant staff with a current credential and access grant;
  - `scripts/set_password.ts`, `grant_access.ts`, `reset_password.ts`, `revoke_access.ts`, `set_steward.ts`,
    `set_email.ts`.

  `person_credentials` has only its no-delete trigger, so nothing in the database stops a credential for a person with
  no email.
- **Reads:**
  - `GET …/walk` (persons, analysts, staff), `GET /api/persons` and the session return the email;
  - the client types it as `string` (`client/src/lib/workspaceStatus.ts`, `client/src/api/persons.ts`) and shows it
    nowhere on a page.
- **Prod:** 6 current persons, all with an email; 1 current credential.
- **Measure by:** `min={v.on}` (`OutcomeSpine.tsx`) offers the commit day. That day is already refused in words by the
  form, the route and the database (§26, §28).

### 2. Decisions (recommendations first)

- **D1. The column becomes optional:** migration `0053`, `persons.email` `DROP NOT NULL`. `persons_email_key` stays, so an
  email given is still unique. No row changes; `db/schema.ts` and the drift snapshot follow. The TOC stays 972: dropping
  a `NOT NULL` adds no object.
- **D2. The routes take an email or none:**
  - `POST …/inputs` takes `email` as optional. When given it is trimmed and must not be empty; an empty string is "no
    email".
  - `POST /api/account-inputs` takes it as optional too, except for a person an assessment in the same payload names.
    That person still needs one (Brad's note): "{name} is named by an assessment, so needs an email: the assessment
    finds its person by it."
- **D3. A credential is refused for a person with no email, in the database:** a new `BEFORE INSERT` trigger on
  `person_credentials`, `lvrf_credential_needs_email`: "A person signs in with their email; {name} has none. Record an
  email for them first." The triggers go **227 → 228** (counted at Gate A and Gate B). Sign-in, which finds the person by
  email, is unchanged.
- **D4. The duplicate guard warns.** On adding a person whose name, trimmed and case-folded, matches a current person of
  the same account:
  - **the form** shows the existing person (name, title, roles) before the confirmation, and asks:
    - "Choose them": the add is cancelled, and on card 01b the role form opens with them chosen;
    - "This is a different person": the confirmation reads, in full, "Add {name}, {title}, as a person of this account.
      This is a different person from {existing name}, {existing title}, already recorded here."
  - **the route** answers 409 when a same-name person exists and the body does not say
    `different_from: [ids]` naming each of them: "{existing name} is already recorded at this account. Choose them, or
    confirm this is a different person." Nothing is written.
  - **Not recorded beyond the person's row** (the route is create-only; no act). For Brad: a column recording "confirmed
    a different person from {id}" can be added if he wants the confirmation on record.
- **D5. One "Add a person" form.** W1's and card 01b's forms become one component, `AddPerson`, with the email optional
  ("Email (optional; needed only to sign in)"), so the two cannot drift.
- **D6. The reads say `email: string | null`.** Nothing on a page prints an email today, so no page changes.
- **D7. Measure by's earliest day** is `min={dayAfter(v.on)}`, following Committed on. Client-only.

### 3. Gate A (planned)

- **`verify_person_email` (new),** on a clone, migrated to `0053` and hardened:
  - **The column:** `email` nullable, `persons_email_key` still `UNIQUE`; every row byte-identical; 228 triggers; drift
    none at `0053`.
  - **The routes:**
    - a person added with no email (201, `email` null), and one with an email;
    - an email already used, refused (409, the plain sentence);
    - account inputs with an email-less person no assessment names (201), and with one an assessment names (422, D2's
      sentence, nothing written).
  - **The duplicate guard:**
    - the same name (another case, extra spaces), refused (409) naming the existing person, nothing written;
    - with `different_from` naming them, admitted;
    - a same name on another account, admitted with no warning.
  - **The database:** a credential for the email-less person refused (D3's sentence); for a person with an email,
    accepted. All rolled back.
  - **The page, both forms:** the email field optional; the same-name warning shows the existing person; "Choose them"
    opens the role form with them chosen; "This is a different person" puts D4's sentence in the confirmation.
  - **Measure by:** its `min` is Committed on + 1, and moves when Committed on changes.
  - **Breaks:**
    - B1, the route's same-name check removed: two same-name persons added with no warning;
    - B2, the credential trigger removed: a credential for the email-less person accepted;
    - B3, account inputs' assessment rule removed: an assessment's person admitted with no email;
    - B4, Measure by's `min` back to Committed on: the same day offered.
- **Scripts that add a person, or read `email` as always present,** updated by design and named. `check_plain_words`
  over the new sentences.
- **The full regression, and equivalence against `ba86bc6`:** every GET identical. An email is still present on every
  existing person.

### 4. Gate B and effort

- **Gate B:** migrate to `0053` (backup first, rule 8), then hardening re-applied (one new function and trigger). **TOC
  972 → 974** (the new function and its trigger; dropping the `NOT NULL` adds none) and **triggers 227 → 228**,
  both counted at Gate A.
- **Brad's look:** card 01b's "Add a person": the email optional. Typing Curia's own analyst's name shows the same-name
  warning. Cancel.
- **About a day.**

## 33. S7a: the published figure's class (planned 25 Nov 2026; **approved by Brad, 25 Nov 2026, with D1–D7 as recommended**; **Gate A 25 Nov 2026** (`BUILD_STATUS.md`, "S7a … Gate A"); the supersession batch's skip ruled by Brad during it; **closed 25 Nov 2026**, deployed at `2a189e1`, Gate C clean)

**Brad's rulings (25 Nov 2026):**
- **D1–D7 are approved as recommended.**
- **D2 as recommended, a departure from §27's D5 recorded with its reason:**
  - **The rule:** the class is required on a vendor publication about another account; optional on a public filing; and
    refused on every other kind and on your own company's account.
  - **The reason:** D5 also required it on public filings. That would refuse every research fact taken from a filing
    (revenue, a reported rate): the fact writer has no class to give, and the classes describe a vendor's story about a
    customer, not a company's own filing.
- **Next:** build S7a to Gate A.
- **The supersession batch skips a vendor publication about another account (Brad, 25 Nov 2026, ruled during the
  regression):** it cannot give a class, so it lists the row with its short id and "stopped: a vendor publication's
  successor states its class; supersede it on card 01c", and writes nothing for it. A break: a skip not listed fails.
  Prod's affected rows are named in Gate A's record (`092c46b6`, `9c05af38`).
- **W6's departure accepted (Brad, 25 Nov 2026):** W6's "Add evidence" has no confirmation step, so the class and its two
  lines show in the form only. S4's full-text confirmation on W6 is the next small item after S7b, because the class is
  fixed once recorded and must be confirmed in full before the pilot's account teams use W6.

**What it builds** (§27 D5 and D11, approved by Brad 24 Nov 2026; the mock-ups approved 25 Nov 2026 with two changes):
the class field on a published source, its migration and its guard, so that Brad can record Curia's published rows
(§27 section 4) and S7b's story can read what each one can and cannot support. S7a writes no story.

### 1. What the code and the record hold today (read 25 Nov 2026, `fed0ee9` and prod; read only)

- **The kinds:** `evidence_kind` holds `vendor_publication` and `public_filing` among seven.
- **Who writes evidence with a kind the person chooses:**
  - `POST /api/institutions/:id/evidence` and its supersede: card 01c's "Record a source…" and "Supersede…" (`SourceForm`);
  - `POST /api/value-outcomes/:id/evidence`: the outcome's evidence (`AddEvidenceCard`, W6);
  - the fact writer (`server/lib/institutionFactWriter.ts`), which records a fact's source, often a public filing, from
    research.
  - Other writers insert only `observation` or `attestation`.
- **The evidence guards:** four triggers on `evidence`. `lvrf_evidence_final` (L41, BEFORE INSERT OR UPDATE) already
  holds what is fixed at recording, so the class rule fits there: no new trigger.
- **On prod:**
  - accounts other than your own company's hold 3 vendor publications (2 current) and 9 public filings (7 current);
  - your own company's account holds 5 public filings (3 current);
  - most public filings are research facts (revenue, a reported rate), not a vendor's story about a customer.

### 2. Decisions (recommendations first)

- **D1. The field:** migration `0054` adds `evidence.published_figure_class text`, null on every existing row. A CHECK
  holds it to five values: `license_count`, `activity_count`, `adjective`, `outcome_without_baseline`,
  `outcome_with_baseline`.
  - The CHECK sits inside the table's definition, so the TOC stays **975** and the triggers **229**. Both are measured at
    Gate A.
  - The CHECK gets a plain sentence (`plainChecks.ts`).
- **D2, where it is required (a departure from D5's wording, for Brad's ruling).** D5 reads "required once the field
  exists, when [a vendor publication or a public filing] is recorded on an account that is not the tenant's own".
  - **The difficulty:** applied to public filings, that would refuse every research fact from a filing (revenue, a
    reported rate). The fact writer has no class to give, and the classes describe a vendor's story about a customer,
    not a company's own filing.
  - **Recommended:**
    - **required** on a new **vendor publication** recorded on an account that is not your own company's;
    - **offered, optional,** on a new **public filing** there (a filing can quote a vendor's story);
    - **refused** on every other kind, and on your own company's account.
  - **Option:** D5 as written, with the fact writer's filings exempted by name.
- **D3, fixed at recording.**
  - **An UPDATE that changes the class is refused:** "What kind of figure a source gives is fixed when it is recorded;
    correct it by supersession."
  - **A supersession is a new row,** so the rule applies to it: a vendor publication's successor states its class.
  - **Existing rows keep their null.** The rule reads new rows only.
- **D4, the routes.** Both evidence routes take `published_figure_class` and refuse, before writing, in the database's
  words:
  - **missing where required:** "A vendor publication about another account says what kind of figure it gives.";
  - **given where it does not belong:** "Only a vendor publication or a public filing about another account says what
    kind of figure it gives.";
  - **an unknown value.**

  The fact writer is unchanged: a filing it records stays without a class.
- **D5, the forms, as the mock-up shows (approved 25 Nov 2026).** `SourceForm` (record and supersede) and
  `AddEvidenceCard` gain "What kind of figure it gives". It shows only for a vendor publication (required) or a public
  filing (optional) on an account other than your own company's. Under it:
  - "A story reads it so", with the chosen class's two lines in the ruled wording;
  - "It is fixed when recorded: a correction supersedes the row."

  The confirmation names the class and its two lines. Until a class is chosen on a vendor publication, the unmet line
  reads "choose what kind of figure it gives".
- **D6, one wording.** The ruled table lives in `server/lib/figureClass.ts`; S7b's story reads it. The form's copy
  (`client/src/lib/figureClass.ts`) must equal it word for word, and Gate A compares the two.
- **D7, the reads.** The account's evidence read returns `published_figure_class`. Card 01c prints it beside the kind
  ("vendor publication · outcome with baseline").

### 3. Gate A (planned)

- **`verify_figure_class` (new),** on a clone migrated to `0054` and hardened:
  - **The column:** nullable, the five values held by the CHECK, every existing row byte-identical with a null class;
    drift none at `0054`; 229 triggers; the TOC measured, expected 975.
  - **The database, as `lvrf_app`, rolled back:**
    - a vendor publication on another account without a class: refused;
    - with each of the five: accepted;
    - a public filing with or without one: accepted;
    - a class on an observation, or on your own company's account: refused;
    - an UPDATE changing the class: refused;
    - a supersession of a classed row without a class: refused.
  - **The routes:** each of D4's refusals, with nothing written; a classed vendor publication recorded and superseded.
  - **The page:** card 01c's "Record a source…" and "Supersede…", and W6's evidence form, at 1280 and 390:
    - the field appears only for the kinds and accounts D2 names;
    - the chosen class's two lines are in the ruled wording;
    - the unmet line;
    - the confirmation names the class;
    - the can and cannot lines pass contrast (4.5:1, computed).
  - **The wording:** the server's and the client's tables equal each other and the ruled table, word for word.
  - **Breaks:**
    - B1, the database's required rule removed: a vendor publication without a class accepted;
    - B2, the class made editable: the UPDATE accepted;
    - B3, the class missing from the confirmation: caught on the page;
    - B4, the route's check removed: the database still refuses, its refusal recorded.
- **Scripts that record a vendor publication on another account,** updated by design to give a class, each named.
  `check_plain_words` over the new sentences.
- **The full regression, and equivalence against `fed0ee9`:** GETs identical apart from the evidence reads' new key,
  named.

### 4. Gate B, Brad's acts and effort

- **Gate B:** migrate `0054` (backup first, rule 8), then hardening for `lvrf_evidence_final`, its hash computed at
  Gate A. The TOC and the triggers are as measured at Gate A.
- **Brad's look:** card 01c on Curia, "Record a source…" with kind "Vendor publication": the field, its lines and the
  unmet line. Cancel.
- **Then Brad's six rows** (§27 section 4), through the page (rule 10). Row 4 supersedes `092c46b6` and states its class.
- **About a day.** Inside the 18 Dec window.

## 34. The account-team page (planned 25 Nov 2026; **approved by Brad, 25 Nov 2026, with D1 (b), D2–D7 as recommended, and D8's dates**; amended by Brad 25 Nov 2026, with D9 as recommended and D10 and D11 changed (§34.11)**; mock-ups before code)

**Brad's rulings (25 Nov 2026):**
- **D1 = (b) for the pilot's start:** public names and roles, plus the customer's yes or no to each ask; no figures.
  It is built so that (a) is one small change away. **(a) waits for an agreement with Skillsoft on holding customer
  data.**
- **D2–D7 are approved as recommended.**
- **The ~40 writes open to any signed-in staff member:** a ruling is needed **before any member of staff other than the
  steward is given sign-in**. It is on the 3.1 list with that condition.
- **D8, the dates:**
  - the mock-ups before Fri 18 Dec 2026;
  - **the first working session: Thursday 28 Jan 2027**;
  - **Gate B and Gate D by Fri 22 Jan 2027**;
  - the 4–15 Jan window untouched.
- **Next:** the mock-ups, after S7a's Gate B.

**What Brad asked (25 Nov 2026):** "The account-team page", after S7b, in place before the account teams' first working
session in the pilot's middle weeks, and outside the 4–15 Jan window, which it must not touch.

**Why:** LVRF is built for one expert operator, the steward. In the pilot, 3–5 Skillsoft account teams (AEs, CSMs) use
it, and the SOW promises "Your teams using it" and "A playbook". The method's complexity stays with the steward. Account
teams get one narrow page they can't get lost in.

### 1. What the code and the record hold today (read 25 Nov 2026, `2a189e1` and prod; read only)

- **How staff are linked to accounts:** `account_person_links` (0037).
  - It has one role, `analyst_of_record` (`account_person_role` enum), with a title on that account, who linked it,
    when, and its retirement.
  - W1 writes it (`POST /api/institutions/:id/analyst-of-record`), open to any signed-in staff member.
  - Nothing reads a link to limit what a person sees.
- **How a non-steward signs in:** `POST /api/auth/login` admits a person of your company's staff (`tenant_id` set) who
  has a current credential and a current access grant, found by email.
  - The steward grants access by `scripts/grant_access.ts` (or `set_password.ts` for a starting password); §32 requires
    an email for a credential.
  - There is no page for it.
- **What a non-steward sees today: everything in your company.** Every read is scoped to the company
  (`isOtherTenant`), never to an account. A signed-in staff member reads every account, run, case, POV, the War Room
  and the packs.
- **What refuses them:**
  - **50 steward-only route checks in 13 route files** (`requireSteward`): research clearances, errata, withdrawals,
    corrections, the supersession batch, role grants, markers, policies, lens policies, shares for review, levers and
    their links, industries and exclusions, pack retirements.
  - **The database's steward guards** behind them (21 "only the steward …" messages, §30).
- **What does not refuse them: about 40 writes are open to any signed-in staff member.** Among them:
  - creating an account;
  - naming an analyst of record;
  - recording and opening evidence;
  - commit, measure and verify;
  - producing and locking a run;
  - hypotheses and executive summaries;
  - research prompts and imports;
  - facts, the classification and the pack basis;
  - rates, milestones and print requests.

  Today an account-team member would have nearly the steward's whole walk.
- **On the page:** 17 controls are shown to a non-steward but disabled, with "… is the steward's act — {name}'s alone".
  None is hidden.
- **On prod:** 1 member of staff (Brad), 1 credential, 1 access grant, 1 account link (Brad, analyst of record on
  Curia). No account-team member exists.
- **S2's research:** account prompts send the account's name, website, pinned entity, disclosure regime and current
  facts. Bring-back items would be none of these. S2 recorded a residual risk "to revisit when LVRF first holds
  confidential customer-side data" (§21).

### 2. Scope (Brad's proposal), and what it needs

1. **Who:** a signed-in member of your company's staff, not the steward, linked to the account. They see only their
   linked accounts, this page and the prints. Steward-only cards and buttons are **hidden** from them, not shown and
   refused.
2. **The page,** per account, summary first, in plain words, no card numbers:
   - **Where it stands:** one short paragraph: the stage, the latest locked run's confidence with any erratum beside
     it, and what's missing;
   - **The asks:** the value case's asks as a checklist, each with the one question to put to the customer;
   - **What to take into the meeting:** links to the POV and the value case prints (both lenses);
   - **Bring back:** a short form to record what the customer said;
   - **A one-line definition** in place for each term of the method used on the page (hypothesis, commitment,
     baseline, system of record, attestation), from one glossary file that every page can later use.
3. **Bring back:** what an account-team member records is never evidence, and never read by scoring, runs, cases or
   prints. It goes to the steward's review queue.
   - **Each item:** what kind (a person and their role; a figure from the customer's system; who would commit and to
     what; a document to request; other), what was said, who said it, when, and whether a source exists.
   - **Append-only.** The steward either uses it (opens the matching existing form pre-filled; the item then links to
     the row it became) or declines it with a reason. Nothing else changes it.
4. **The steward's queue:** on the steward's view, the open items across accounts, oldest first, with "Use…" and
   "Decline…".
5. **Phone width (390) works:** the account-team member may read it in a lobby before a meeting.

### 3. Decisions (recommendations first)

- **D1 (first, and Brad's to rule): what an account-team member may record in Bring back,** given the SOW's "no
  Skillsoft confidential customer data goes into LVRF".
  - **(a) Only what the customer agrees can be recorded.** Every item requires a confirmation: "The customer agreed
    this can be recorded."
    - **For the page:** the form takes any kind, figures included, and refuses an item without the confirmation
      (route and database).
    - **For S2:** an item is never part of a research prompt, so research is unchanged. But once the steward *uses* an
      item, it becomes evidence or a fact, and a fact *is* in the account's prompt. So (a) is the point where LVRF first
      holds customer-side data, and S2's recorded residual risk comes due. A used fact would need excluding from
      prompts, or the composer root-owned, before research runs on that account again.
    - **For the SOW:** it reads as within "no confidential data" only if the customer's agreement makes the item not
      confidential. That is a contract reading, not a technical one.
  - **(b) Only names and roles already public, plus the customer's yes or no to each ask; no figures.**
    - **For the page:** the kinds narrow to "a person and their role, from a public source" and "the answer to an ask"
      (yes / no / not yet). No figure field, and no free text that could carry one.
    - **For S2:** no change; nothing confidential enters.
    - **What it costs:** the value of Bring back is the customer's figures and documents. (b) records that they exist
      and were agreed ("yes, our EHS lead will share the FY25 TRIR"), not the figure. The steward records the figure
      later from a source, as today.
  - **(c) Amend the SOW,** so pilot accounts may hold customer data the customer agrees to share.
    - **For the page:** as (a), with the confirmation.
    - **For S2:** as (a): the residual risk comes due, and is fixed before research runs on a pilot account holding
      such data.
    - **For the SOW:** a contract change, Brad's and Skillsoft's.
  - **Recommended: (b) for the pilot's start, built so that (a) is one change away.** The items, the queue and "Use…"
    are the same under each; only the kinds and the confirmation differ. (b) keeps the SOW as written and S2 as
    approved. If the first working session shows the teams need figures, (a) or (c) is a ruling plus a small change,
    and S2's residual risk is fixed first.
- **D2, sign-in and links.**
  - **Sign-in:** as today, `grant_access.ts` with an email (§32), the steward's act, and a starting password changed at
    first sign-in. No page for it in this slice.
  - **Linking to an account:** a new link role, `account_team` (migration: the enum gains a value), written by **the
    steward's act** on a new "Account team" card on the steward's account page, with a title on that account. Retired
    as links are today.
  - **Recommended:** both as above; the steward, never the account-team member, decides who sees which account.
- **D3, "Use…" passes every existing rule.** **Recommended: yes, nothing bypasses them.** "Use…" opens the existing
  form for that kind, pre-filled from the item:
  - a person → "Add a person" (§32);
  - a role → "Name a customer-side role…" (from a source);
  - a figure → "Record a source…";
  - who would commit → "Commit…" (customer-side, §29; the promised date, §26; the walk-date rule, §31).

  Each with its full-text confirmation, and the steward completes what the item lacks (a source, a date). The item links
  to the row the form wrote, only when that row is written.
- **D4, the account-team member sees declined items and the reason.** **Recommended: yes**, in their account's Bring back
  history, with the steward's reason, for learning. They never see the steward's queue across accounts.
- **D5, the playbook.** **Recommended: the page's wording is the playbook's first draft, from one source.** The page's
  headings, the asks' questions and the glossary's definitions live in one file. The playbook's account-team chapter is
  generated from it with the steward's notes added, so the page and the playbook cannot drift.
- **D6, what an account-team member may do, enforced on the server.** **Recommended:** a new staff role,
  `account_team` (`person_roles`), set by the steward when granting access. A person with it:
  - **reads** only their linked accounts' account-team page, and the POV and value case prints of those accounts'
    locked runs;
  - **writes** only Bring back items on those accounts;
  - **is refused** every other route (403, plain words), in the API and not only by hiding.

  Staff without the role keep today's rights (today, only Brad). Whether the ~40 open writes should also close to
  value engineers is a separate ruling, outside this slice.
- **D7, where Bring back lives.** **Recommended:**
  - **A new table, `bring_back_items`** (migration): append-only, no update but the use or decline fields, never
    deleted, with an audit trigger.
  - **No route that reads evidence, runs, cases or prints reads it.** Gate A proves this, by a break and by a static
    check that only the account-team page, the queue and "Use…" name the table.
  - **Use and decline** each record the steward's act.
- **D8, timing.** S7b's Gate C targets Fri 18 Dec 2026. The 4–15 Jan window is untouchable. **Recommended:** the mock-ups
  before 18 Dec; the build to Gate A in the first week after 15 Jan; Gate B and Gate D before the account teams' first
  working session. The session's date is Brad's to name. If it falls in the window's first week after 15 Jan, the slice
  is cut to the page and Bring back, with the steward's queue reading items by SQL for one session.

### 4. Mock-ups (before code; fictional accounts and names only)

- the account-team page for a fictional account at Decision, at 1280 and 390: where it stands, the asks as a checklist
  with their questions, what to take into the meeting, Bring back, and the glossary's one-line definitions in place;
- the Bring back form and its confirmation, under D1 as ruled;
- the steward's queue across accounts, oldest first;
- "Use…" opening a pre-filled form, and "Decline…" with its reason;
- the account-team member's view of a declined item (D4).

The review PDF goes in `~/lvrf-backups/s34-mockup/` (`chmod 600`).

### 5. Gate A (planned)

- **A new verify script,** on a clone with fictional account-team members and accounts:
  - **visibility:** an account-team member sees their linked accounts only; the API refuses every other account and
    route (403, plain words);
  - **the page:** each section, the glossary's definitions, 390 with no sideways scroll, contrast;
  - **Bring back:** recorded, append-only; use and decline by the steward only, each with its act; "Use…" opens the
    right form pre-filled and passes every rule (D3); the item links to the row only when it is written;
  - **D1's rule as ruled** (under (b): no figure field, and the route and the database refuse one).
- **Breaks:**
  - an account-team member seeing an account they're not linked to;
  - an account-team member seeing a steward-only control;
  - a Bring back item read by scoring, a run, a case or a print;
  - an item changed other than by use or decline;
  - D1's rule removed.
- **The full regression, and equivalence:** every existing GET identical; the new routes named.

### 6. Gate D (new: before any account team uses it)

- **One person who is not Brad,** ideally a Skillsoft AE or CSM, or anyone unfamiliar with LVRF, on a clone with
  fictional data, unaided, for 30 minutes, does three tasks:
  1. find their account;
  2. say where it stands and what to ask the customer;
  3. record one thing the customer said.
- **Recorded:** where they hesitated, what they asked, how long each task took.
- **Fixes** before the first working session. Gate D's record goes in `BUILD_STATUS.md` with the fixes it led to.

### 7. Effort

About half a day for the mock-ups, then about four days to Gate A: two migrations (the link role, the staff role, the
table), the server's role checks across about 40 writes and every read, the page, the queue and "Use…" for four
forms. Then Gate D, a 30-minute session and its fixes.

### 8. The mock-ups' first review (Brad, 25 Nov 2026)

- **Approved in direction.**
- **Approved:** a met ask shows "Recorded:" with what was recorded, in place of its question; "Use…" covers Add a person
  only, and the role is named afterwards on its own form ("Name a customer-side role…").
- **Changed: the account-team page shows confidence in words, never the number.** For example: "Confidence: low.
  Nothing has been measured yet." The word is the latest locked run's stored band (`value_runs.confidence_band`: high
  at 80 and over, medium at 55 and over, otherwise low; `db/CONFIDENCE_MODEL.md`). The sentence after it is the first
  thing missing. The number stays on the steward's pages and on the prints.

### 9. Amendment: account teams give inputs and sell with what LVRF produces (Brad, 25 Nov 2026)

**Brad's principle:** account teams give the steward inputs, and use what LVRF produces to sell. They never do the
method.

1. **"Request an account": the account team's front door.**
   - It is a request to the steward, never the creation of an account. Account teams cannot create accounts (D6).
   - **Required:** the company's name; its website; what they're pursuing (renewal, expansion, new logo); the date that
     matters (the renewal date, or the target close); what they hope to sell, chosen from Skillsoft's solution catalog
     (the offerings as loaded).
   - **Optional:** notes, contacts, links.
   - It goes to the steward's queue, beside Bring back items. The steward creates the account, or declines with a
     reason. The request then links to the account it became.
   - **Append-only,** like `bring_back_items`.
2. **"What LVRF produced",** on the account-team page, once the account is worked:
   - the one-page summary (D11);
   - the POV and value case prints;
   - the asks;
   - **"What to lead with":** the Skillsoft solutions the steward linked to the account's levers (`lever_offerings`),
     read-only.
3. **Bring back stays as planned.**
4. **Contacts under D1 (b):** names and titles already public only, with no emails or phone numbers, for the pilot's
   start. The notes field carries "Don't enter anything the customer hasn't made public or agreed to share." Contacts
   with details wait for the (a) agreement.

**What the record holds (read 25 Nov 2026, prod, in a read-only transaction):**
- 12 current offerings in 8 families: platform 1, assessment 1, practice 2, coaching 3, instructor-led 1, program 1,
  content 1, enabler 2.
- 3 current lever links.
- A lever belongs to an industry measure, not to an account. "The account's levers" are the levers of the measures in
  the account's classified industry pack.
- No one-page summary print exists today. The nearest record is the executive summary (O2, `executive_summaries`):
  human-written, attributed, append-only versions.

### 10. The amendment's decisions (recommendations first)

- **D9, the request's minimum inputs. Recommended: Brad's list as written, with these rules:**
  - **Company name and website:** required, as typed. The website must be a web address; the steward verifies it on
    creation, as today.
  - **What they're pursuing:** one of renewal, expansion, new logo.
  - **The date that matters:** a real date, labelled by the pursuit ("Renewal date" for a renewal, "Target close"
    otherwise). **Today or later.** A request is about something ahead; this is the reverse of §31's walk-date rule.
  - **What they hope to sell:** one or more current offerings (not superseded), at least one. Stored by the offering's
    id, so a later catalog change doesn't rewrite what was asked for.
  - **Not asked:** the industry, the stage or any lever. Those are the steward's, from sources (the method).
  - **Already an account:** the requester sees only their linked accounts (D6), so the form doesn't say whether a
    company exists. The steward's queue shows a possible match (same website domain, or same name ignoring case), and
    the steward either links the requester to it (decline with that reason, then the link on the Account team card) or
    creates a new one.
  - **The requester's link:** creating the account from a request offers, in the same confirmation, to link the
    requester to it as `account_team` (D2). It is still the steward's act, and can be unticked.
  - **Research:** a request's name and website reach research only through the account the steward creates, as
    today. Its notes, contacts and links never reach a research prompt (S2 unchanged).
- **D10, contacts and the notes field under D1 (b). Recommended:**
  - **Each contact:** a name and a title, both required, and where it is public (a link, or "where I saw it"),
    required.
  - **Refused in every free-text field of a request** (notes, contacts, links' labels), by the route and by the
    database: anything shaped like an email address or a phone number, with a plain sentence saying why. This is the
    request's version of Bring back's no-figures rule.
  - **Figures in notes are allowed.** A deal value or seat count is Skillsoft's own information, not the customer's.
    Bring back keeps its no-figures rule, because there a figure would be the customer's.
  - **The notes field** carries "Don't enter anything the customer hasn't made public or agreed to share.", above it,
    in full.
  - **A contact never becomes a person by itself.** The steward adds one through "Add a person" (D3), with every rule.
  - **Under (a), later:** the email and phone refusals lift for contacts the customer agreed to share, with the same
    confirmation as Bring back's. It is one change, with S2's residual risk fixed first.
- **D11, what "worked" means and what the one-page summary is. Recommended:**
  - **Worked:** the account has a locked run. Before then, the page shows the request and "The steward is working on
    it", with no section of "What LVRF produced".
  - **The one-page summary:** the account's current executive summary (O2), shown on the page with its author and
    date. It is written by a person, never generated. With none, the page says "No summary yet." and keeps the other
    parts.
  - **"What to lead with":** each lever of the account's pack with its linked solutions. Beside each solution, the
    steward's basis and what it can show, in words (from the offering's evidence class: usage, not results, unless it
    says otherwise). A lever with no linked solution is not shown. With none at all: "The steward hasn't linked
    solutions to this account's levers yet."

**What it adds to the build:**
- **A new table, `account_requests`** (in the same migration as `bring_back_items`): append-only, created or declined
  by the steward only, each with its act. Its offerings are kept in a link table, or an id array checked against
  current offerings.
- **The request form** for account-team members, and a "Request an account" entry on their accounts list.
- **The queue** holds both requests and Bring back items, oldest first, each with its kind.
- **"Create the account…"** opens the existing account form, pre-filled, with every rule (D3).
- **"What LVRF produced"** reads the executive summary, the prints and `lever_offerings`. No write.
- **Gate A** gains:
  - a request created, append-only, and creating or declining it by the steward only;
  - an email or phone number refused in a request's free text (route and database), with a break;
  - an account-team member refused account creation (403);
  - the requester never shown another account through the possible-match check;
  - the page shows a confidence word and never a number (a static check on the page's text and on its API response).
- **Effort:** about one more day.

**Mock-ups this adds** (fictional accounts and names only; the review PDF in `~/lvrf-backups/s34-mockup/`):
- the request form and its confirmation, at 1280 and 390;
- the steward's queue holding a request;
- the account-team page after the account is worked, with confidence in words and "What LVRF produced".

**The mock-ups (25 Nov 2026; `design/mockups/s34-*.html`, `s34.css`; review PDF of 14 pages, each screen at 1280 then
390, in `~/lvrf-backups/s34-mockup/`):** "Your accounts" with a request waiting (`s34-accounts`); the request form and
its confirmation (`s34-request`); the account-team page once worked, with confidence in words and "What LVRF produced"
(`s34-page`); Bring back (`s34-bring-back`); the steward's queue, now "From account teams", holding a request beside
Bring back items (`s34-queue`); "Use…" and "Decline…" (`s34-use`); the team's view of a declined item
(`s34-history`). D9–D11 are drawn as recommended, pending Brad's rulings.

### 11. Brad's rulings on the amendment (25 Nov 2026)

- **D9: as recommended.**
- **D10: as recommended, except no figures in any of the request's free text** (notes, contacts, links' labels) for
  the pilot's start, the same as Bring back, until the (a) agreement with Skillsoft. Emails, phone numbers and figures
  are each refused, by the route and by the database, with a plain sentence saying why. The notes' guidance sentence
  stays: "Don't enter anything the customer hasn't made public or agreed to share." The help line under the notes reads
  "An email address, a phone number or a figure here is refused."
- **D11: as recommended, except "What to lead with" lists only the levers named in the account's current hypotheses,
  from its sealed case.** Each lever shows its linked solutions, the steward's reason, and what the solution can show.
  Until a hypothesis names a lever, the section reads "The steward is choosing what to lead with."

**What the record already holds for it (read 25 Nov 2026):** `lvrf_case_chain` seals each current hypothesis with its
lever (`lever`: id, name, mechanism, leading indicator) and that lever's links (`offerings`: offering key, name, basis,
withdrawn). The latest locked run's `payload.case.hypotheses` is therefore the source; no live read of
`lever_offerings`. Two build notes:
- **A withdrawn link** (`withdrawn: true` in the sealed case) is not shown on the account-team page.
- **What a solution can show** is not in the sealed link. It is read from the offering by its key (its
  `evidence_class`), in words.

**Gate A gains:**
- a figure refused in each of the request's free-text fields (route and database), with a break;
- "What to lead with" shows only the sealed case's hypotheses' levers, and a lever linked to solutions but named in
  no hypothesis does not appear (with a break);
- with no locked run naming a lever, the sentence "The steward is choosing what to lead with."

**Mock-ups updated:** the request's notes carry no figure and the help line names figures (`s34-request`); "What to
lead with" says it reads from the account's case, with its empty sentence shown as a note (`s34-page`).

## 35. S7b.1: the story's placement, reading order and wording (planned 25 Nov 2026, from Brad's print review of `d2514a3d` and his rulings the same day; **approved by Brad, 25 Nov 2026, with D1, D2 (the recommended wording, "with LVRF" kept) and D3 as written, and one addition to Gate C**; **Gate A closed 26 Nov 2026** at `5449d2e`, with the print findings fixed; **closed 26 Nov 2026**: deployed at `ed47a7d`, Gate C clean after Brad withdrew a duplicate issue (`BUILD_STATUS.md`, "S7b.1 closed"))

**Value spine stage:** `verify` and `return`. The story is the document a CFO reads, and S7b.1 fixes what it claims and
where it claims it.

**Brad's rulings (25 Nov 2026):**
- **R1, what an issued story seals:** what it says and what each item belongs to; the layout comes from the current page.
  - Version 2 seals each finding's `engagement_id` and the ledger in reading order.
  - The `db/schema.ts` comment reads "the payload is byte-identical; the page renders it".
  - The print's record line names the composer version.
- **R2:** the engagement is not renamed. The page avoids "engagement" there:
  - "Each line's latest run is its score";
  - the heading reads "Each line's latest sealed run" when there is more than one.
- **R3:** `prepared_by` becomes "Rule 76 Consulting LLC for Skillsoft", sealed in version 2. "for Skillsoft's people" on
  the cover stays.
- **R4, the rest as proposed:**
  - the finding's ledger figure gets its unit;
  - "in the platform's wording for their kind" is dropped;
  - the stage-strip wording;
  - the banner gutter and the # column;
  - the placement and reading-order checks, each with a break.
  - The placement fixture is one account with two engagements and a finding on the first.
- **R5, the order:**
  1. S7b's Gate C (clean, `BUILD_STATUS.md`, "S7b closed");
  2. this plan;
  3. Gate A with a full regression;
  4. Gate B.
  - After the deploy, Brad withdraws `cf99dbf3` (`d2514a3d`) and issues version 2, both through the page.

### 1. What the code holds today (read 25 Nov 2026, `f2addac`; read only)

- **The composer, `server/lib/story.ts`:**
  - It seals, in `payload`, every figure, line and source sentence, plus `prepared_by` (`tenants.name`, the join
    `t.name AS tenant`). The ledger and its `refs` are numbered in this order:
    1. each engagement's latest score and its errata;
    2. **the findings;**
    3. the baselines, then the targets and actuals;
    4. the published rows;
    5. the earlier runs.
  - A finding carries its `outcome_id`, but no engagement carries its outcomes. The page therefore cannot place a finding.
- **The page, `client/src/pages/StoryPage.tsx`:**
  - It prints the findings once, after the loop over all engagements (lines 118–119). Curia's `ee8a58a8` (outcome
    `e3fb0061`, engagement `c47d075f`, time to productivity) therefore prints under the lot-acceptance block.
  - It prints the baselines before the findings, so the finding's number reads out of order: locally, 7, 8, then 6.
  - The ledger's # cell inherits `[overflow-wrap:anywhere]` from `TD`, so "10" can break in a narrow column.
  - The banners copy the value case's markup (`ValueCasePage.tsx:203-207`): full width, `px-1`.
- **Why verify_story missed it:**
  - it checks the finding's words and that the finding has a ledger entry;
  - the walk checks that every number on the page has an entry;
  - nothing checks where a finding sits, or the order in which the numbers first appear;
  - every fixture account has one engagement.
- **`prepared_by`** prints in four places:
  - under the title;
  - in the record line;
  - in the closing paragraph;
  - on the cover ("for {prepared_by}'s people").
  - Under R3 the cover needs the tenant's name separately (D2).

### 2. Decisions (recommendations first)

- **D1. Version 2's payload** (`STORY_VERSION` 2). Each finding gains `engagement_id`, from `value_outcomes.engagement_id`.
  The ledger is numbered in the full form's reading order:
  1. for each engagement, its latest score, then its errata;
  2. for each engagement, its baseline, its target, then its findings;
  3. the published rows;
  4. the earlier runs, with their errata, in timeline order;
  5. the actuals, under Results.
  - The one-page form keeps the full numbering and lists only the entries it uses, so its numbers ascend with gaps, as
    today.
  - The finding's ledger figure reads "214 days, no source on record".
  - The errata's source reads "Errata on runs 4, 5 and 13 of …", with "in the platform's wording for their kind" dropped.
- **D2. The preparer.** Version 2 seals two fields: `prepared_by` "Rule 76 Consulting LLC for Skillsoft", and `tenant`
  "Skillsoft".
  - The cover reads "for {tenant}'s people" in v2, and "for {prepared_by}'s people" in v1, as it reads now.
  - "Rule 76 Consulting LLC" is one constant in `story.ts`. The value case and POV keep their own closing wording (not in
    scope).
  - **Recommended wording:** "Prepared by Rule 76 Consulting LLC for Skillsoft, with LVRF", with a comma, so it does not
    read "Skillsoft with LVRF".
  - **Option:** "Prepared by Rule 76 Consulting LLC for Skillsoft", without "with LVRF".
- **D3. The page renders both versions.** It reads `storyVersion`.
  - In v2, each finding prints inside the block of its own engagement.
  - In v1, the findings print in their own block, "Findings on the record", under no engagement. Their sealed numbers stay
    as sealed: the v1 order cannot be corrected without a new issue.
  - The withdrawn `cf99dbf3` keeps rendering this way.
  - Each `measure` block carries `data-engagement`.
- **D4. The record line:** "… · story, full · composer version 2 · story record hash … · printed …". `cf99dbf3` prints
  "composer version 1".
- **D5. Page wording:**
  - the heading "Each line's latest sealed run" when there are two or more lines, "The latest sealed run" for one;
  - the timeline's note "Each line's latest run is its score; earlier runs print here only.";
  - the stage strip's "needs a second verified actual, from a separate measurement", in both places.
- **D6. The banner gutter:** on screen, `px-4 sm:px-6`, matching the POV's frame and the 16 px gutter; print keeps `px-1`.
  The cause is confirmed by a screenshot before the change, and the record says what it was.
- **D7. The # column:** `whitespace-nowrap [overflow-wrap:normal]` on the # cell, with a fixed width.
- **D8. `db/schema.ts`'s comment** on `story_records`: "the payload is byte-identical; the page renders it" (R1).

### 3. Checks (in `verify_story` and `story_walk.mjs`), each with a break that must fail

- **Placement:** on a fixture account with two engagements and a finding on the first engagement's outcome (R4).
  - Each `[data-testid=finding]` sits inside the `[data-testid=measure]` whose `data-engagement` is the engagement that
    owns its outcome, read from SQL.
  - The same holds for Curia, on the prod copy.
  - **Break P:** the findings printed after the loop, as today. Expected to fail.
- **Reading order:** on the full form, each ledger number first appears on the page in ascending order, 1, 2, 3, with
  none skipped.
  - **Break R:** the composer's v1 order (findings before baselines). Expected to fail.
- **Gutter:** at 390 and 1280, each banner's text starts at least 16 px from the viewport's left edge, and nothing scrolls
  sideways.
  - **Break G:** `px-1`.
- **Column:** in print, every ledger # cell holding a two-digit number is one line high.
  - **Break C:** the # cell with `[overflow-wrap:anywhere]`.
- **Words:**
  - the finding's figure carries its unit;
  - no ledger source contains "in the platform's wording";
  - `prepared_by` is "Rule 76 Consulting LLC for Skillsoft";
  - the cover reads "for Skillsoft's people";
  - the record line names "composer version 2";
  - the three page sentences read as in D5;
  - "engagement" appears in neither the heading nor the timeline note.
- **v1 still renders:** on the fresh prod copy holding `cf99dbf3`:
  - the issued story renders;
  - its findings print under "Findings on the record";
  - its record line names "composer version 1";
  - its payload and hash are unchanged.
- **Existing breaks B1–B9 stay.**

### 4. What it changes and could orphan

- **No migration, and no hardening change:** the TOC stays 989 and the triggers 233.
  - The payload is `jsonb` and the guard does not read its shape; Gate A confirms this by reading section 39's guard.
- **`cf99dbf3` is unchanged on the record.** Its payload and hash do not change. After the deploy, its page changes per
  D3–D7.
- **Nothing is orphaned.** v1 stays readable because the page reads `storyVersion`.

### 5. Gate A

- Run the full regression on the pinned 14 Nov snapshot, with the port guard, following §27's rules for refused scripts
  and reruns.
- On a **fresh prod copy taken after 23:06:11 UTC on 25 Nov** (Brad's dump paste; it holds `cf99dbf3`), run:
  - `verify_story` in full, including v1's rendering and a v2 issue on the throwaway clone, never on prod;
  - the equivalence against `f2addac`.
- Print every page to PDF, look at every page, and check the stage-10 points on both forms.

### 6. Gate B (planned): a redeploy only

- Pull and deploy: a new bundle and the API, with no migration and no hardening change.
- Expect 233 triggers and TOC 989, unchanged.
- **Brad's acts, after it, through the page (rule 10):**
  - withdraw `cf99dbf3`, with his reason;
  - issue version 2;
  - print both forms.
- **Before Brad withdraws it (Brad's addition, 25 Nov 2026):** read-only, confirm that `cf99dbf3`'s stored hash still
  equals the SHA-256 of its payload, and that its page renders as version 1 ("composer version 1" in the record line,
  its findings under "Findings on the record").
- Then a read-only Gate C: 1 `withdraw` act and 1 `issue` act; two story rows, the first withdrawn and the second at
  `storyVersion` 2.

## 36. S7b.2: one current story per account and audience (planned 26 Nov 2026, from S7b.1's Gate C; **approved by Brad, 26 Nov 2026, with one change: one current story per account and audience, not only one per hash**; branch `s7b2-one-issue`; **Gate A 26 Nov 2026** at `bd59c4b`; **closed 26 Nov 2026**, deployed at `c8a143e`, Gate C clean (`BUILD_STATUS.md`, "S7b.2 closed"))

**Value spine stage:** `return`. The story of record is one document per account and audience. Brad issued the same
version-2 story twice, 44 s apart (`fb473904`, `78c1a025`), and withdrew the second as a duplicate.

**What the code holds (read 26 Nov 2026, `19cf76a`):** the payload is composed from the record alone (`server/lib/story.ts`
reads no `now()` and no current date), and its stage and audience are inside it. The same hash therefore means that
nothing on the record has changed. Neither the route nor `lvrf_story_record_guard` refuses a second current story.

**Brad's rulings (26 Nov 2026):**
- **The rule:** one current (not withdrawn) story per account and audience.
- **D1, the constraint:** migration `0056`, a partial unique index `UNIQUE (institution_id, audience) WHERE withdrawn_at
  IS NULL`. It closes the race (two issues at the same instant: the second waits for the first, then fails). The route
  and the guard keep their own checks, for the plain sentences. It orphans nothing: prod's three rows hold one current.
- **Two refusals, from the route and the guard alike:**
  - the same hash: "This story is already issued as <id> on <date> (UTC), and nothing on the record has changed since.
    Open that one."
  - a changed record: "<id> is the current story for this audience. Withdraw it first, giving your reason, then issue
    the new one."
  - The index's own violation (only in a race) is mapped by the route to the sentence that fits.
- **D2, the page (`/accounts/:id/story`), while a story for the audience is current:** no issue button.
  - the hashes match: "Issued as <id> on <date> (UTC). Nothing on the record has changed since.", the id linked;
  - the record has changed: "The record has changed since <id> was issued. Withdraw it to issue the new story.", the id
    linked to the issued story, where the steward withdraws it.
  - The draft route names the current story and whether its hash is the draft's.
- **A consequence, named (not in Brad's text):** the issued story's note "Newer evidence exists: re-issue to include it."
  describes an act now refused. It reads "Newer evidence exists: withdraw this story, then issue the new one to include
  it."
- **D3:** Gate A's fresh-copy part runs on Brad's dump taken after S7b.1's Gate C (TOC 989), which holds `fb473904`
  current and `78c1a025` withdrawn.

**Gate A:**
1. On the fresh copy: `0056` applies (the rows satisfy it); re-issuing Curia's unchanged internal story is refused
   through the page and the route, with the same-hash sentence, and by SQL through the guard; no row and no act is
   written; Curia's page shows "Issued as fb473904 on 2026-11-26 (UTC)…" and no button.
2. On a fixture account: issue; the same again is refused (same hash); the client audience issues; the record changes (a
   new locked run), and the page shows "The record has changed since…" with no button; issuing is refused (the changed
   sentence); withdraw through the page; issuing works.
   Every act goes through the page; any made by route is named "not proven through the page".
3. Breaks, each restored byte-identical: B1 the route's checks removed (the guard refuses); B2 the guard's checks removed
   on the clone (the route refuses); B3 the race, two psql sessions on one account and audience (the second insert waits,
   then fails on the index; with the index dropped it lands, and that is caught); B4 the draft route names no current
   story (the walk sees a button and fails). A NULL-input refusal for each new check.
4. Equivalence: the expected difference, the draft route's added field, named; nothing else.
5. One full regression with `scripts/run_regression.sh` on the pinned snapshot: 0 leftovers, 0 refusals.

**Gate B (Brad's pastes):** `pg_dump -Fc` first; merge and push; deploy; `ownership.sql` then `hardening.sql`; drift, TOC
and index checks. **Gate C** read-only: the index, the guard's new md5, the three story rows unchanged, Curia's page
showing "Issued as fb473904…". No act on prod.
