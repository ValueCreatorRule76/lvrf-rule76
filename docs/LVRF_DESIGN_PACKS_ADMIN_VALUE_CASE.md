# LVRF — Industry Pack admin, AI assistance, the value case, the War Room

**RATIFIED by Brad Piver, 24 October 2026.** Every question in §8 is ruled. P1 may begin
under the usual gates.
24 October 2026. Written against `main` at `b5a3588`, and against CVAF `gate1-provenance` at
`60e2ed6` for lessons only.

**Rulings already given:**
- **Cost of delay is in LVRF, as a derived figure that can refuse** (Brad, 24 Oct 2026, option b).
  It is computed only from a target a named person committed to, times a monetization rate the
  client stated and a customer-side person attested. It never uses a vendor claim. Otherwise it
  renders "not stated" with what it takes.
- **Q1, what a pack is** (Brad, 24 Oct 2026): as CVAF defines it — the governed contract that
  drives every stage of the workflow — re-examined for learning value. Sections 2.6 and 5.2
  were rewritten on that ruling.
- **Q2 ratified** (Brad, 24 Oct 2026): PROP-001 is ratified with Regulated Utilities & Energy
  as the first certified pack, its Section 8 schema superseded by 5.2, and Manufacturing
  certified second because a live account (Scotts) depends on it. PROP-001's second-pack
  trigger (two verified records at two institutions) is amended accordingly.
- **Q6** (Brad, 24 Oct 2026): **group results only** for customer accounts; individual
  scores refused. The tenant's own staff keep individual records.
- **Q14** (Brad, 24 Oct 2026): a committer or verifier without the pack's named role is
  **flagged**, not blocked.
- **Q15** (Brad, 24 Oct 2026): **only the admin certifies a pack.** Every pack lifecycle act
  (import, delta accept or reject, approve, certify, activate) is the admin's. Future
  Skillsoft users (AEs, VPs) get **view-only** access to packs. CVAF handles it the same way.
  In LVRF today the admin is the tenant's steward (`tenants.steward_person_id`, checked by
  `requireSteward`); the separation-of-duties recommendation is withdrawn.
- **Q16** (Brad, 24 Oct 2026): existing accounts keep working with a "no certified pack"
  notice and seal `pack: none` until their pack is active.
- **Q3–Q5, Q7–Q13** (Brad, 24 Oct 2026): all ruled as recommended in §8, for the reasons
  given there: cost-of-delay months 6 as one ratified policy value; attribution gates lenses
  and does not change the score; k = 10; the War Room at `/book` with a band on `/`; Client 0's
  case from sourced figures only, the commercial line when a CRM export is defined; the
  drafting assistant only after the sealed value case (P10); `evidence.confidence` frozen and
  labelled; sealed runs render under their own rules version; the fetch verifier person-run
  on the Mac; the horizontal axis deferred.

**How to read this document.** Every claim about LVRF names the file it was read from.
Anything not read is marked **INFERRED**. No client data from CVAF appears here. CVAF's
documents name real accounts; none of those names, figures or sources is carried over. Every
example is invented or public. The one exception is LVRF's own accounts (Scotts, Curia,
Skillsoft), which are already in LVRF's record.

**Value spine stages served:** `baseline` and `attach` (packs, evidence, attribution), `model`
(cost of delay, roadmap, solutioning), `commit` / `measure` / `verify` (attribution, people
data, fetch verification), `return` (the value case, the War Room).

---

## 0. Where this sits

| | State on 24 Oct 2026 | Read from |
|---|---|---|
| On the box | `feb539f`, UX-1 slice 2. Slice 3 and the verify fix (`b5a3588`) pushed, Gate B pending | `git log`; BUILD_STATUS "UX-1 slice 3" |
| O1, O2 | Built and deployed: levers, solutions per lever, the derived basis, hypotheses, summaries, the POV | BUILD_STATUS "O1", "O2" |
| O3 (lenses, value case page, outcomes by lever) | **Not built** | LVRF_PLAN §5; no `lens_policies` in `db/` or `server/` |
| UX-1 slices 4–5 | Not built | LVRF_PLAN §7g |
| Packs | Industries + `industry_measures`; no pack object, no version, no lifecycle beyond per-entry acceptance | `db/schema.ts` |
| PROP-001 | **Proposed, not ratified.** Its Section 8 schema (migration "0004", five `pack_*` tables) was never applied. Migration 0004 is something else. No Utilities industry exists: 0019 seeds ten industries (the only industry insert in the migrations), none of them utilities | `docs/proposals/README.md`; `db/drizzle/0019_simple_starfox.sql` |

This design does three things the earlier plans did not. It makes a pack an object with a
lifecycle (PROP-001 and CVAF's Pack Contract). It adds the verification and attribution
machinery a learning value claim needs. And it extends O3 so the value case carries cost of
delay, a roadmap and recommended solutioning, as CVAF's does, without breaking LVRF's
rule that the renderer never computes a target.

---

## 1. Inventory: what LVRF already has, against each lesson

**Legend:** **Has** = enforced today. **Partial** = some of it. **No** = absent.

### 1.1 Evidence and verification

| Lesson | LVRF today | Where |
|---|---|---|
| One evidence form: a short verbatim QUOTE or a LOCATOR; editing keeps the form | **No.** `evidence` has `summary`, `provenance` (NOT NULL), `source_reference`. Nothing says whether the claim rests on quoted words or a located cell | `db/schema.ts` `evidence` |
| A verifier fetches each source: time, HTTP status, how the bytes came, content hash; a failed fetch has no hash | **No machine fetch.** LVRF has a **human** control instead: `citation_resolved` + who + when, "a named human OPENED the cited source and confirmed it says what the summary claims". `POST /api/evidence/:id/open-citation` records the opening | `evidence`; `server/routes/evidenceCitation.ts` |
| Statuses verified / needs human check / failed; only verified or ATTESTED may be written | **Partial.** `source_verified` is the disclosure gate (Rule 6). Attestation is first-class (`attested_by_person_id` + `attested_at`, CHECK `evidence_attestation_is_complete`; credit 0.6 only for an institution-scoped, non-simulated attester). AI-sourced evidence cannot be `source_verified` without `citation_resolved` (CHECK `evidence_ai_verify_requires_resolution`, AMD-005 Art. III). There is no "needs human check" or "failed" state | `evidence`; `db/CONFIDENCE_MODEL.md` |
| Editing a value, quote or source voids verification and attestation; a tag change voids neither | **Has, by construction.** Evidence and facts are never edited; a correction is a superseding row, and a new row starts unverified and unattested (column defaults). **INFERRED** that no supersede route copies `source_verified` across: not read route by route | `governance()`; `institutionFactWriter.ts` (not read in full) |
| Figure check: a value may state no figure its evidence lacks; extra wording is flagged, not blocked | **Partial.** Only for falsifiers: `value_hypotheses_conditions_no_digits`, and the reference value is copied from the outcome row by trigger. No check on facts or measures against their evidence | `value_hypotheses`; `hardening.sql` §22 |
| Every proposal carries a one-sentence rationale of HOW the value was read | **Partial.** Pack entries carry `why_it_pays`, `addressable_reasoning`, `confounders`, `caveats` (contract v4). Account facts carry no "how read" | `server/research/contracts.ts` |

### 1.2 Confidence and tags

| Lesson | LVRF today | Where |
|---|---|---|
| Confidence derived from verification × source tier, never asserted by an LLM | **Has.** Six weighted factors, computed; `MODEL_VERSION` declared; parity script | `db/CONFIDENCE_MODEL.md`; `server/spine/confidenceModel.ts` |
| A field takes its weakest statement; a derived value is capped at its source's confidence | **Partial.** The book takes its weakest member (cohort). Per-field weakest-of: not applicable yet, one evidence row per fact (`evidence_id` UNIQUE on facts) | `server/routes/cohort.ts`; `institution_facts` |
| Source precedence tiers; conflicts shown, never silently resolved | **Has the tiers:** `lvrf_evidence_basis()`, derived, never stored: system_of_record > published > client_stated > inferred > assumed. **Conflicts: Partial.** Two revenue rows with different `as_of` are a time series by design; two current rows for the same `as_of` from different sources are not surfaced as a conflict (**INFERRED**, no conflict view found) | `hardening.sql` §21 |
| One governed tag vocabulary; a tool proposes, a person confirms | **Different by design.** LVRF's vocabulary is the derived basis: nobody types it, so there is nothing to confirm. There is a stray asserted field: `evidence.confidence` (default `medium`) is carried into run payloads as `assertedConfidence`. It does not feed the score (**INFERRED** from `verifyConfidenceParity.ts` naming it "asserted"; not traced in full) | `walkSpine.ts`; `verifyConfidenceParity.ts` |

### 1.3 Absence

| Lesson | LVRF today | Where |
|---|---|---|
| Not captured is NULL, never 0 | **Has, by a different mechanism, and the conflict is named here.** `CLAUDE.md` Rule 1: "Zero is data. Numeric fields are NOT NULL with CHECK ranges that include zero." LVRF expresses absence as **an absent row** (no fact, no outcome) or a nullable optional column (`target_value`, `actual_value`), never a 0. CVAF's lesson and LVRF's rule agree on the point (0 is never absence). They differ only on where absence lives | `CLAUDE.md`; `value_outcomes` |
| Saving a value requires provenance | **Has.** `evidence.provenance` NOT NULL; every fact has exactly one evidence row | `evidence`; `institution_facts` |
| Withdrawing is explicit, audited, with a reason | **Has** for measures, levers, links, hypotheses, markers: `*_retirement_is_complete` (who + reason ≥ 12 chars + `deleted_at` + status, together or not at all) | `db/schema.ts`; 0032, 0035, 0036 |
| Gaps: refuse / seed-and-flag / disclose | **Refuse: Has** (effect sizes refused on levers, recorded as `refusal_source = 'route'`; CFO lens planned to refuse below 55). **Seed-and-flag: none, deliberately**: LVRF has no defaults at all. **Disclose: Has** (OUTSIDE-IN HYPOTHESIS and UNVERIFIED banners, unsuppressible). The gap register drafts the asks | LVRF_PLAN §5; `gapRegister.ts` |

### 1.4 Audit

| Lesson | LVRF today | Where |
|---|---|---|
| Append-only; corrections are new rows | **Has, at the role level.** `audit_log` and `heartbeat_events` UPDATE/DELETE/TRUNCATE revoked; since OWN-1 `lvrf_app` owns nothing and cannot drop a trigger | `CLAUDE.md` Rule 3; `hardening.sql` §24 |
| Per value: proposal id, target record and field, value, previous value, evidence, verification, who; one filter answers "where did this figure come from" | **Partial.** `audit_log` stores whole `old_row` / `new_row` per change with the actor. The research lineage exists in columns: `research_prompts` (text + SHA-256) → `research_results` (`prompt_id`, review, `institution_fact_id` / `industry_measures_id` / `evidence_id`) → the fact → the run that sealed it (item 10). **No single query joins them** | `audit_log`; `research_*` |
| Distinct actions (import, verify, attest, confirm_tag, accept, reject, edit, write, withdraw), each naming its subject | **No.** `audit_operation` is `insert` / `update` / `soft_delete`. The act is implicit in which column changed. Refusals have their own table | `auditOperation`; `refusals` |
| Imports store the raw payload and its hash immutably | **Partial.** Prompts: yes (CHECK `research_prompts_sha256_is_the_text`, immutable). Results: each field's object verbatim in `raw_response`, but **the whole pasted response and its hash are not kept** | `industryResearch.ts` |
| Reject / edit dialogs keep their reasons in separate empty fields | **Has in shape.** No edit exists (supersede only); reject writes `review_note` only; reasons never write into evidence. **INFERRED** for the client dialogs, not read | `research_results.review_note` |

### 1.5 Gates and UI

| Lesson | LVRF today | Where |
|---|---|---|
| Every gate decided on the server from the database | **Has.** Triggers and CHECKs; `requireSteward`; the coverage guard `verify_steward_acts.sh` fails an unclassified mutating route | `server/lib/stewardActs.ts` |
| A failed read says so; no silent fallback | **Has as a standard** (Q4k, plain refusals; DESIGN_SPEC §9) | BUILD_STATUS "Q4k" |
| A control's count equals what it will do; idempotent writes; every hold reason listed | **INFERRED partial.** No bulk-write control exists yet, so the lesson has not been tested |  |
| No latent defaults | **Has mostly.** `research_result_kind` has no default on purpose; industry slug required on classify. `evidence.confidence` defaults to `medium` (see 1.2) | `db/schema.ts` |
| A control that claims something it doesn't do is removed | **Has as practice** (UX-1 slices removed "65 points outstanding", internal terms) | LVRF_PLAN §7g |

### 1.6 Packs

| Lesson | LVRF today | Where |
|---|---|---|
| A contract separates what varies by pack from what never varies | **Partial.** The research contract (`contracts.ts`, versioned, every version kept) defines a measure's shape. PROP-001 §7 states the two axes and the prohibitions, unbuilt | `contracts.ts`; PROP-001 |
| `packKey` is the only external identifier | **Has:** the industry `slug`, unique per tenant, used in URLs and classify | `industries` |
| Packs inherit, never compose; a child of an uncertified parent can't activate | **No.** No inheritance |  |
| The account vocabulary is owned in one place; a pack's inputs resolve to it | **Has, small.** `institution_fact_kind` (5 kinds), `RESEARCHABLE_FACT_KINDS`, `DISCLOSURE_REGIMES` in `contracts.ts` | `contracts.ts` |
| Lifecycle import → deltas → guardrails → validation → approval → certification → activation | **No.** Each entry is accepted or rejected by the steward one at a time, which is a strength (see 2.6). There is no pack version, no validation run, no certification, no activation. **Ratify / demote has no route** | `stewardActs.ts` comment |
| The research prompt is generated from the contract | **Has** (Q4b): generated from live rows, stored with its hash and contract version | `CLAUDE.md` research seam |
| The pack declares a base DEFINITION and a rate BAND; the account supplies the base VALUE | **Definition: Has** (`definition`, `unit`, `direction`). **Band: refused on purpose** (O1: "no expected-effect size column: a lever is a mechanism, not a promise") | LVRF_PLAN §5 |
| Benchmarks from research or anonymised aggregates, never one account | **No benchmarks object** (CAPABILITY_MAP item 9). The industry-vs-account distinction is enforced in the table design ("collapsing the two would let one customer's metric stand in for the industry's claim") | `industry_measures` comment |

### 1.7 Runs and outputs

| Lesson | LVRF today | Where |
|---|---|---|
| A sealed run reproduces exactly what was sealed; output rules versioned per seal | **Partial.** Runs seal a `payload` with `payload_hash`, the fact ids and values (item 10), `MODEL_VERSION`; locked runs are immutable by trigger (`lvrf_locked_run_immutable`). **Output rules are not sealed:** the falsifier sentence is composed at render, deliberately "never sealed, so changing its wording changes no hash" | BUILD_STATUS "UX-1 slice 3" |
| An AI drafting assistant drafts only from accepted facts, cites an evidence id per sentence, passes deterministic checks | **Rejected so far, by decision:** "LVRF itself generates no prose." AI may draft outside LVRF; `executive_summaries.drafted_with_ai` + `drafting_tool` (CHECK `executive_summaries_ai_disclosed`) | LVRF_PLAN §5 O-D6 |

### 1.8 Operations

| Lesson | LVRF today | Where |
|---|---|---|
| Repair tools dry-run by default, `--apply`, one audit row per change, interactive credentials | **Partial / INFERRED.** `grant_access.ts`, `set_password.ts` take the steward's password interactively (per `stewardActs.ts`). Dry-run convention not checked script by script |  |
| Preflight gates deploys; backup on box and off box before any write | **Has.** `lvrf-deploy.sh` (drift, step 5d ownership), Gate B backup paste, nightly `pg_dump`, `~/lvrf-backups` on the Mac | `CLAUDE.md`; deploy script |
| Generators of governed inputs live in the repo | **Has.** The prompt generator is `contracts.ts` |  |

### 1.9 What the inventory found that the lessons don't name

- **Learner-level data already enters LVRF.** `POST` account inputs write `assessments` rows with
  `learner_person_id` and a score (`server/routes/accountInputs.ts`, `institutionInputs.ts`).
  Nothing limits group size or renders only aggregates. Section 3.3 addresses it.
- **Ratify has no route.** Every pack entry today is `proposed` or `retired`. A pack cannot be
  certified while its entries cannot be ratified.
- **The CVAF roadmap generator is a warning, not a model.** CVAF's `roadmapSummary.js` writes a
  duration as "phases × 3 months". That is a number made from a count. LVRF must not inherit it.
- **CVAF's War Room carried the worst fabrication CVAF found:** a revenue × 10% term that
  produced a multi-billion "portfolio value" from nothing (comment in `WarRoomPage.jsx`). The
  LVRF War Room sums no money across accounts (4.3).

---

## 2. Each lesson: adopt / adapt / reject

### 2.1 Evidence and verification

| Lesson | Ruling | How, in LVRF |
|---|---|---|
| One evidence form, quote or locator | **Adopt** | `evidence.evidence_form` ∈ {`quote`, `locator`}, NOT NULL for rows created after the cutover. A quote is ≤ 40 words (copyright and readability). A locator is structured: document, table, row, column, value, scale. A supersession trigger refuses a successor whose form differs from its predecessor's. Learning sources make locators the common case: an LMS export cell, an OSHA 300A line, an HRIS report row |
| Machine fetch record | **Adapt: the fetch can only demote, never promote.** | A `source_fetches` row records time, status, method, hash (NULL unless 2xx, by CHECK). It supports the human check; it never replaces it. LVRF's strongest control is a named person opening the source (`citation_resolved`). A fetch that fails, or whose bytes lack the quote, moves the evidence to "needs human check" and blocks `citation_resolved` until a person records why it still holds. A fetch that succeeds changes nothing on its own |
| Statuses verified / needs human check / failed; only verified or attested written | **Adapt** | A **derived** verification state (a SQL function, like the basis), never stored: `verified` (source_verified, and for AI-sourced also citation_resolved), `attested` (customer-side attester), `needs_human_check` (a failed or contradicting fetch, or a flagged figure check), `failed` (the source is gone and no archived copy is labelled). "Only verified or attested may be written" maps to: **only verified or attested evidence may support a `measure` or `verify` step.** Baseline and attach may proceed on weaker evidence because they already render OUTSIDE-IN / UNVERIFIED |
| Edit voids verification and attestation | **Adopt, already true** | Keep supersession as the only correction. Add a verify script asserting a superseding row arrives unverified and unattested |
| Figure check | **Adopt** | A deterministic function: every number in a fact's value or a measure's text must appear in its quote, or equal its locator's value at its scale. A number not found → `needs_human_check` with the number named. Extra qualifiers → flagged, not blocked. Lives in the API (it reads text), with the result stored on the fetch/check row |
| Rationale of how it was read | **Adopt** | Contract v5 adds a required `how_read` (one sentence, ≥ 24 chars) to every `institution_fact` and `industry_measure` field. Review shows it beside the value |

### 2.2 Confidence and tags

| Lesson | Ruling | How |
|---|---|---|
| Derived confidence | **Adopt, already true** | No change |
| Weakest statement wins; derived capped at source | **Adopt** | Cost of delay (5.4) takes the weaker basis of its two inputs and shows it. Outcomes by lever (O3) show each outcome's own score, never an average |
| Source tiers; conflicts shown | **Adopt; add the conflict view** | A read-only conflict check: two current facts of the same kind and `as_of` with different values are shown side by side on the account, each with its basis. Never resolved silently; resolved only by superseding one of them |
| CVAF's eight-tag vocabulary, tool proposes, person confirms | **Reject the vocabulary, keep the principle** | LVRF's basis is derived, which is stronger than confirmed: nobody can click it upward. CVAF's tags map as: SOURCED → `published`; CLIENT_STATED → `client_stated`; MEASURED → `system_of_record`; INFERRED → `inferred`; ASSUMPTION → `assumed`. Three CVAF tags have no basis equivalent and are handled elsewhere: **GAP** is the absence of a row plus the gap register; **DERIVED** is a computed figure (cost of delay) carrying the weaker basis of its inputs; **PRACTITIONER** becomes an attribution method (3.2), because in learning value the practitioner's judgment is about attribution, not about a fact. **One new stored vocabulary is needed:** `attribution_method` (3.2), proposed by a person and fixed at `commit`. |
| `evidence.confidence` (asserted) | **Retire the input** | Stop writing it from routes (fixed at `medium` until removed); keep the column because sealed payloads carry it as `assertedConfidence`. Rename in display to "stated by the analyst". Open question Q10 |

### 2.3 Absence

| Lesson | Ruling | How |
|---|---|---|
| NULL never 0 | **Adopt in substance; the mechanism stays LVRF's** | Absence is an absent row or a nullable optional column. Rule 1 stands. Every new column in this design follows it: cost-of-delay inputs are rows that exist or don't |
| Provenance required | **Adopt, already true** | |
| Withdrawal explicit and audited | **Adopt, already true;** extend to every new governed table here | Same `*_retirement_is_complete` CHECK pattern |
| Three gap modes | **Adopt refuse and disclose; reject seed-and-flag** | LVRF has no defaults and this design adds none. The only place a CVAF-style default could enter is cost of delay's monetization rate, and ruling (b) requires it to be client-stated and attested, so it can't seed. "A defaulting rule that can't refuse is a slower way to fabricate": LVRF's answer is to have no defaulting rule |

### 2.4 Audit

| Lesson | Ruling | How |
|---|---|---|
| Append-only | **Adopt, already true** | |
| Per-value lineage, one filter | **Adapt** | No new per-value audit row (audit_log already holds whole rows). Add **`lvrf_lineage(table, id)`**: one SQL function returning the chain prompt → result → review act → evidence → fact/measure → supersessions → runs that sealed it, each step with who and when. The `/lineage/:table/:id` page renders it. That is the "one filter" |
| Distinct actions | **Adopt** | A `governance_acts` table, append-only, one row per act: `act` ∈ {import, validate, approve, certify, activate, supersede, verify, attest, open_citation, accept, reject, withdraw, ratify, demote, commit}, the subject table and id, the actor, a reason, the evidence ids. Written by the route in the same transaction as the change. A trigger on each subject table refuses the governed state change when no act row for it exists in the transaction (**INFERRED feasible**: a transaction-local check via `txid_current()`; Step 0 proves it on a scratch database before any migration) |
| Raw payload and hash | **Adopt** | `research_imports`: the whole pasted response, its SHA-256 (CHECK that the hash is the text, as for prompts), the prompt it answered, who, when; immutable by trigger. `research_results` gains `import_id` NOT NULL for new rows |
| Separate empty reason fields | **Adopt, already true in shape;** add a client check in the verify scripts that the reject dialog opens empty | |

### 2.5 Gates and UI

All five **adopted**; four are already LVRF practice. The new one: **a control's count equals
what it will do.** Every bulk control in this design (accept N pack entries, certify a pack,
activate) is computed server-side by a dry-run endpoint first ("Certify v2: 14 entries, 3 new,
1 withdrawn since v1"), and the commit refuses if the count changed since the dry run.

### 2.6 Packs

**Revised 24 Oct 2026 after Brad's answer to Q1:** a pack is not a list of measures. In CVAF
it is the governed contract that the whole workflow reads: every stage resolves the
account's active pack and takes its questions, inputs, levers, gaps, benchmarks and
solutions from it. The first draft of this section reduced a pack to "a certified set of
accepted entries". That was too thin, and is withdrawn. Section 5.2 now specifies the LVRF
Pack Contract in full; this table rules on each CVAF pack lesson against it.

| Lesson | Ruling | How |
|---|---|---|
| One contract, read by the loader, the prompt, the validator and the runtime | **Adopt** | `server/packs/contract.ts` is the one definition (like `contracts.ts` for research). Import, prompt generation, validation, and the runtime resolver all read it. CVAF found its pack in four stores that disagreed; LVRF has one document per version and derived projections checked against it by hash (5.2.5) |
| The pack drives the spine | **Adopt** | 5.2.3: what each of the seven stages takes from the active pack |
| `packKey` the only external identifier | **Adopt, already true (the industry slug)** | |
| Inheritance, not composition | **Adopt CVAF's Amendment 2 C rules as written** | One parent; `inheritsUnchanged` lists every inherited element by key; `overrides` state the field and why; no element in both; no key collisions; own lifecycle; a child activates only on a certified parent (trigger) |
| One account vocabulary, owned by the contract; packs propose additions | **Adopt** | LVRF's `institution_fact_kind` and `contracts.ts` lists become the contract's account vocabulary, with `obtainableOutsideIn` and a derived `requiredBy` reverse index. A pack's `requiredInputs` must resolve to it or to a proposed addition (validator) |
| Lifecycle import → deltas → guardrails → validation → approval → certification → activation | **Adopt in full** | LVRF's per-entry steward acceptance becomes the **delta** step: each new, changed or removed element is accepted or rejected on its own, with its citation. 5.2.4 |
| A governed artifact is never hand-edited | **Adopt** | A certified version's document is immutable (trigger); change means a new version through the lifecycle |
| The research prompt is generated from the contract | **Adopt, already true for measures;** extended to every pack section | The prompt for a section is generated from the contract's field definitions, so it cannot drift from the schema (CVAF's hand-written Generate Prompt was a fifth the size of its pack) |
| Base DEFINITION on the pack, base VALUE on the account | **Adopt** | A learning lever's base is its pack measure: the pack defines it, the account supplies the baseline with evidence |
| Rate BAND on the pack | **Adapt: the slot becomes a monetization definition, with no value** | A learning pack never carries an effect size or a rate band (population-specific, attribution-dependent; a pack band becomes every account's target). The lever instead declares **what the client's monetization rate must be** (for example "cost per OSHA recordable incident, per year") and **who confirms it** (role). The account supplies the value, attested, under ruling (b). That keeps CVAF's split — the pack defines, the account supplies — without a pack number |
| Gap catalogue: market gaps on the pack, client gaps on the account; refuse / seed-and-flag / disclose | **Adopt refuse and disclose; reject seed-and-flag** | No rate band means nothing to seed. A refuse gap blocks the lever's cost of delay and benchmark; a disclose gap prints its statement |
| Discovery instrument generated from the pack | **Adopt, reshaped for learning** | 5.2.2: the questions ask whether the account can **produce and attest** each measure (CVAF's maturity scale becomes a measurement-readiness scale), and which ones convert a hypothesis into a measurable outcome |
| Benchmarks with sources as entities (methodology, population note, confidence tier) | **Adopt** | Plus `sponsor` (3.1): a vendor-sponsored source caps at `inferred` |
| Pack-scoped exclusions; content rules | **Adopt** | Exclusions of offerings per pack; content rules validated (for example "vendor collateral is never a source for a measure or a monetization definition") |
| Exactly one active version per key; certification records its certifier; supersession is a queryable link | **Adopt** | Postgres: partial unique index, CHECK, FK |
| No silent fallback to an ungoverned pack | **Adopt** | An account whose industry has no active certified pack reads "no certified pack: <reason>" on every page that would use it, and its runs seal `pack: none`. CVAF's resolver falls back to a static file with `governed: false`; LVRF has no static packs to fall back to |

### 2.7 Runs and outputs

| Lesson | Ruling | How |
|---|---|---|
| Output rules versioned per seal | **Adopt for the value case** | `OUTPUT_RULES_VERSION` (like `MODEL_VERSION`), recorded in each `record_documents` print request and printed in the footer. The value case renders from the sealed payload; a run sealed under rules v1 is rendered by v1's renderer or says "rendered under rules v2; sealed under v1" — Q11 decides which. Identity tests in Gate A: each rules version renders its fixture runs byte-identical |
| AI drafting assistant | **Defer; keep O-D6 for now** | LVRF generating prose is a reversal of a decision Brad made on 12 Oct. Recommended path in Q9: after the value case ships, a drafting assistant inside LVRF that drafts only from the run's sealed payload, cites a fact or evidence id per sentence, and passes deterministic checks (every number present in the payload; every name an institution, person or offering in the payload; no causal verb unless the attribution method allows it, 3.2), then a named person accepts it into `executive_summaries` with `drafted_with_ai` |

### 2.8 Operations

All **adopted**. Every script this design adds (pack import from file, backfill of
`evidence_form` on legacy rows as `legacy`) is dry-run by default, `--apply` to write, one
`governance_acts` row per change, live accounts only unless one is named.

---
## 3. What learning value changes

### 3.1 A source-tier ladder for learning evidence

LVRF already has five bases, derived by one function. The ladder below does **not** add
bases; it says where each learning source lands, and adds the two rules the basis function
lacks. The key distinction: **a system of record is authoritative for what it records, and
only for that.** An LMS is the system of record for completions. It is not a system of record
for safety, retention or performance.

| Rung | Source | Basis (derived) | May support | Never supports |
|---|---|---|---|---|
| 1 | **Regulator-filed or audited records**: OSHA 300A, NERC compliance findings, FDA 483s, an audited annual report | `published` (public) or `system_of_record` (customer export of the filed record) | baseline and actual of an outcome measure | — |
| 2 | **Customer system of record for the outcome**: HRIS (retention, internal mobility, time to proficiency), EHS system, quality system | `system_of_record` | baseline and actual | — |
| 3 | **Customer system of record for learning**: LMS/LXP completions, assessment results, certifications, regulator-mandated training records | `system_of_record`, with the offering's `evidence_class` (consumption · assessed · demonstrated · applied) | capability movement (the learning spine), assessment coverage, compliance currency | **an outcome's actual.** A completion rate is never the measured actual of TRIR |
| 4 | **Client-stated, attested**: a named customer-side owner states a figure | `client_stated` (credit 0.6) | baseline, actual, monetization rate | — |
| 5 | **Independent published studies**: peer-reviewed, government, standards bodies | `published` | levers (as reference evidence for the mechanism), benchmarks | an account's baseline or actual: it is about another population |
| 6 | **Vendor or vendor-sponsored reports**, including the tenant's own case studies about customers | `inferred` (existing rule 7 for `vendor_publication`), and **new: any study with a vendor sponsor is capped at `inferred`** even when published as research | a lever's reference evidence, labelled "vendor-sponsored" | baseline, actual, or a monetization rate |
| 7 | Simulated, unresolved AI-sourced, unsourced observation | `assumed` | nothing beyond baseline/attach on an outside-in hypothesis | — |

**Why sponsored reports sit on rung 6.** Learning ROI literature is dominated by
vendor-commissioned studies whose populations are the vendor's satisfied customers and whose
methods are participant estimates. Scotts' record already shows the pattern: Skillsoft's
"75% reduction" is held as a vendor claim, never applied (LVRF_PLAN §5). The new rule only
generalises it: `evidence.sponsor` (text, nullable) — when set and the kind is
`public_filing` or a new `published_study` kind, the basis function returns `inferred`.
That is a change to `lvrf_evidence_basis()` and is rule 7b in D2's order.

**MEASURED and SOURCED, kept apart.** In LVRF, "measured" is a **realization status**
(`measured`: an actual arrived and is not yet verified). "Sourced" is not a state at all; it
is the basis of the evidence behind a value. A value can be published (sourced) and still be
a baseline only. A value is MEASURED only when it is an outcome's **actual**, after the
committed target, at the committed time. The value case never uses either word loosely: a
published baseline reads "Baseline 1.4 (published)"; an actual reads "Measured 1.1
(system of record), verified by …".

### 3.2 Attribution: the central risk

Learning rarely moves an outcome on its own. LVRF currently records that an outcome moved
and how confidently the movement is evidenced. It does not record **how much of the movement
the learning caused, by what method.** Without that, a verified TRIR drop reads as the
vendor's achievement.

**New column `value_outcomes.attribution_method`**, a governed enum, required before an
outcome may reach `measure` (CHECK: `realization = 'claimed' OR attribution_method IS NOT NULL`):

| Method | What it requires on record | What the value case may say |
|---|---|---|
| `control_group` | A comparison population that did not receive the learning, randomised or matched, with its n and its own baseline and actual (rows, with evidence) | "attributable to", with the difference-in-differences shown |
| `comparison_group` | An unrandomised comparison (another site, a later cohort), with n, baseline, actual | "associated with; comparison: …" |
| `trend_adjusted` | The pre-period trend, as recorded values over ≥ 3 periods, projected | "change beyond the prior trend of …" |
| `estimate_adjusted` | Participant or manager estimates of contribution, with a stated confidence adjustment and n respondents | "estimated contribution (participant/manager estimate, adjusted)" |
| `contribution_only` | Nothing | "the outcome moved; no attribution is claimed" |

Rules, enforced where stated:
- **Fixed at `commit`.** The method is part of what the customer agrees to. Changing it after
  commit is a supersession of the outcome with a reason (trigger).
- **Only `control_group` may use causal language.** The renderer chooses the sentence from the
  method; the drafting assistant's check (2.7) refuses a causal verb otherwise.
- **The CFO lens** (O3) shows realized currency only for `control_group` and `comparison_group`.
  For the rest it shows the measured change with "attribution: trend / estimate / none" and
  suppresses the currency line. Recommendation in Q4: attribution does **not** change the
  confidence score (that needs a CONFIDENCE_MODEL amendment); it gates what a lens shows.
- **The comparison rows** are a `comparison_populations` table (outcome id, label, n, baseline,
  actual, each with its evidence id); `n` is subject to the minimum group size (3.3).

### 3.3 People data

Learner-level data is personal and sensitive, and it already enters LVRF through
`assessments` (1.9). The design defaults to aggregation everywhere.

- **Minimum group size `k`** (policy value, steward-ratified; recommendation `k = 10`, Q5).
  Every count, score or rate about people renders only when its group has n ≥ k. Below, it
  reads "fewer than k people: not shown". Enforced in the renderer **and** in a SQL view the
  renderers must read through (`v_cohort_aggregates`), so no page can query raw rows.
- **No individual in any output.** No learner name, id or score appears on the POV, the value
  case, the War Room or a print. A verify script greps every rendered page and PDF for
  learner person ids and names from the fixture.
- **Customer learners are recorded as group results only (Q6, ruled).** A new evidence kind
  `cohort_export` carries `cohort_size` (NOT NULL, CHECK ≥ 1) and the aggregate only.
  `assessments` rows whose learner is a customer-side person are refused by trigger; the
  account-inputs routes stop offering individual scores for customer accounts. The tenant's
  own staff (Client 0) remain as today. Existing customer-learner rows, if any, are listed
  by a read-only script for Brad's decision; nothing is deleted (Rule 2).
- **Consent and access.** LVRF is a vendor tool, so consent is the customer's to obtain. LVRF
  records the customer's basis: `cohort_export.data_basis` ∈ {`aggregate_only`,
  `customer_consented`} and refuses individual rows without `customer_consented`. Access:
  people-level evidence readable only by the account's analyst of record and the steward
  (`account_person_links`, 0037).

### 3.4 Compliance learning is a different kind of value

Compliance learning buys **avoided risk and licence to operate**. Capability learning buys
**performance**. Adding them together is a category error, and a regulated-utilities pack
will carry both.

- **`industry_measures.value_kind`** ∈ {`capability_performance`, `compliance_assurance`},
  required on every entry in a certified pack version (validator), proposed by research
  (contract v5), confirmed by the steward on accept.
- **Never summed.** The value case shows them in separate sections. No total combines them.
- **Compliance value is evidenced by consequence or exposure, never by completion.** A
  compliance outcome's measure is a regulator's finding count, a citation, a penalty, an
  audit result (rung 1). Training currency (rung 3) is shown as the mechanism, labelled
  capability, never as value realized. The pack's vertical axis carries the **regulatory
  overlay register** (PROP-001 §4.1): for each compliance measure, the regulator, the rule,
  and the published consequence range, cited.
- **Cost of delay for a compliance measure** refuses unless the client has stated and
  attested a monetization of exposure (for example, their own historic penalty cost per
  finding). A published penalty schedule may be shown beside it as reference, never applied.

### 3.5 Realization over time

LVRF already has the pieces of a measured-baseline-then-cadence model. This design names
how they fit, and adds one display.

- **Baseline:** an outcome's `baseline_value` + `baseline_measured_at`, with evidence.
- **Cadence:** the committed `promised_measured_at` and each hypothesis's `falsifier_due`. A
  cadence of several measurement points is several outcomes or successive runs: each
  measurement is a new run, locked, never rewritten.
- **The confidence curve:** the sequence of an engagement's locked runs, each with its
  computed confidence. Curia's record already shows it (run 1 at 10 → run 21 at 55).
  New: a small line chart on the account page and the value case, one point per locked run,
  read from sealed payloads only.
- **The supersession chain:** facts and entities corrected over time, each step on record;
  shown by `/lineage`.
- **Where MEASURED differs from SOURCED:** a curve point is MEASURED only when its run
  sealed an outcome with `realization ≥ measured`. Points built on published or client-stated
  baselines alone are drawn hollow and labelled "baseline only".

---

## 4. Surfaces, on LVRF's flat object-keyed routes

The navigation decision stands: accounts are the front door; routes are flat and keyed by
object; no CVAF stage sequence. Every new page is a noun.

| Route | What | Who |
|---|---|---|
| `/` (Accounts home) | **Gains a portfolio band** at the top: the War Room's headline row (4.3), linking to `/book` | all |
| `/book` (**new**) | **The War Room** | all |
| `/accounts/:id` | Gains: the confidence curve (3.5); fact conflicts (2.2); attribution method on each outcome; a "Value case" link per locked run | authorized |
| `/accounts/:id/pov` | Unchanged except the confidence curve and the compliance/capability split | all |
| `/runs/:id/case` (**new, O3**) | **The value case**, through a lens (`?lens=cfo|chro|general`), with the refusal page | all |
| `/packs` | Gains: each pack's active version, its four lifecycle axes, its parent; "Import" and "Generate research prompt" per section (steward) | all / steward |
| `/packs/:slug` | **The pack, as the contract reads:** measures (with value kind, baseline availability, system of record, attestation roles), levers (mechanism, required inputs, monetization definition, converting question, solutions), the discovery instrument, gaps, benchmarks and sources, exclusions, overlay; the lifecycle panel with validation results | all |
| `/packs/:slug/versions/:n` (**new**) | One version: its document hash, certifier, inheritance declarations, and the delta review against the active version (accept / reject per delta, steward), then approve, certify, activate with dry-run counts | all / steward |
| `/people` (**new**) | **Admin:** staff, roles, access grants (today only scripts), the steward; grant and revoke as steward acts with the steward's own password | steward |
| `/policies` (**new**) | **Admin:** lens policies (O3), the minimum group size `k`, the cost-of-delay months, `OUTPUT_RULES_VERSION` in force; each a governed, ratified, versioned value | steward to change, all to read |
| `/lineage/:table/:id` (**new**) | Where did this figure come from (2.4) | authorized |

### 4.1 The value case page (`/runs/:id/case`)

Renders only from the run's sealed payload. Sections, in order:

1. **Header:** account, run, lock date, payload hash, lens, rules version; both banners.
2. **Executive summary:** the human-authored, attributed summary for this run and lens (O2).
3. **Value hypotheses:** each with its chain (offering → capability → lever → measure → metric → outcome), falsifier and verdict.
4. **Outcomes by lever:** baseline, target (committed, with committer) or "no target: a hypothesis", actual, realization, attribution method, computed confidence, basis of each figure. Capability and compliance in separate tables (3.4).
5. **Cost of delay** (5.4): per outcome, the figure and its inputs with their bases, or the refusal with what it takes.
6. **Roadmap** (5.5): the milestones on record, each with owner and date; nothing generated.
7. **Recommended solutioning** (5.6): per hypothesis, the recommended offerings with their rationale, what each can evidence, and the customer systems it integrates to.
8. **What it takes to raise confidence:** the gap register's asks (O2).
9. **Confidence curve** (3.5).
10. **Footer on every printed page:** run, full hash, lens, rules version, print time.

**The CFO-lens refusal page** is a real page: why (score below the ratified 55, or bases not
admitted), and the asks. A reference example never renders under the CFO lens (O-D3).

### 4.2 Admin

LVRF's admin is mostly the **steward's acts**, which already go through one check
(`stewardActs.ts`) and a coverage guard. The admin pages are the missing front ends for acts
that today are scripts or don't exist: grants (`/people`), policies (`/policies`), pack
lifecycle and ratify/demote (`/packs/:slug`). Every new mutating route is classified in
`STEWARD_ROUTES` in its first commit, so `verify_steward_acts.sh` fails otherwise. No admin
function is "Not yet available" as a dead button: a function not built is not shown (lesson:
a control that claims something it doesn't do is removed).

### 4.3 The War Room (`/book`)

A portfolio read for the value engineering leader. Server-computed, read-only, one route
`GET /api/book`. Same membership as book confidence (Q4n): live customer accounts only, not
the tenant's own, not reference examples, not retired engagements.

Per account: stage reached; latest locked run's computed confidence and band; hypotheses due
in 30 / 60 / 90 days; hypotheses confirmed and **refuted**; outcomes past their promised
measurement date with no actual (late, distinct from short); open asks; cost of delay stated
or refused; last recorded.

Across the book: book confidence (the weakest member); the confirmation gap (refuses below
n = 5, dispersion below n = 12, as already built); counts of hypotheses refuted and confirmed;
counts by realization status.

**What the War Room never shows:** a sum or average of money across accounts. CVAF's War Room
learned this at a cost: an aggregate across accounts manufactured a portfolio value. Each
account's cost of delay stays on its own row with its basis.

---

## 5. Data model and enforcement

Every new governed table follows the house pattern: `governance()` columns, audit AFTER and
touch BEFORE UPDATE (split, DEFECT-001), delete guard, supersession FK `ON DELETE RESTRICT`,
`*_retirement_is_complete`, added to `db/ownership.sql` only if the app must UPDATE it. Each
migration states what it changes and what it could orphan, and is preceded by a `pg_dump -Fc`.

### 5.1 Evidence, verification and lineage

| Object | Shape | Enforced in |
|---|---|---|
| `evidence.evidence_form` | enum `quote` · `locator` · `legacy`; NOT NULL; `legacy` only on rows created before the cutover (CHECK on `created_at`) | Postgres CHECK |
| `evidence.quote_text` / `evidence.locator` | `quote_text` ≤ 40 words when form = quote; `locator` jsonb with required keys `document`, `value`, `scale` and optional `table`, `row`, `column` when form = locator; exactly one present | Postgres CHECK (jsonb key presence) |
| Form kept on supersession | successor's form = predecessor's | trigger in `lvrf_supersession_is_sane()` |
| `evidence.sponsor` | text, nullable; caps the basis at `inferred` (3.1) | `lvrf_evidence_basis()` rule 7b |
| `source_fetches` | append-only: evidence or research result id, url, `fetched_at`, `http_status`, `method` (`https` · `browser_page` · `browser_download` · `archived_copy`), `content_sha256` NULL unless 200–299 (CHECK), `archived_by` + `archive_method` required when method = `archived_copy`, `fetched_by` person, `tool` | Postgres CHECK + append-only trigger |
| `figure_checks` | append-only: evidence id, numbers found, numbers missing, wording flags, result (`pass` · `flag`) | API computes; Postgres stores append-only |
| Verification state | `lvrf_verification_state(evidence)`: verified · attested · needs_human_check · failed (2.1). Derived, never stored | SQL function |
| `measure`/`verify` gate | an outcome's actual evidence must be verified or attested | trigger on `value_outcomes` |
| `governance_acts` | append-only; one row per act (2.4) | route writes; trigger on each subject refuses a governed state change with no act in the transaction |
| `research_imports` | whole pasted response + SHA-256 (CHECK: hash is the text) + prompt id; immutable | CHECK + trigger |
| `research_results.import_id` | NOT NULL for rows created after the cutover | CHECK on `created_at` |
| `lvrf_lineage(table, id)` | read-only chain (2.4) | SQL function |
| Contract v5 | `how_read`, `evidence_form` + quote/locator, `value_kind` | `contracts.ts`; prompt regenerated |

### 5.2 Packs: the LVRF Pack Contract

**Revised 24 Oct 2026 (Q1).** Modelled on CVAF's Pack Contract (21 Sep 2026, Amendments 1–3)
and its live Building Materials contract, re-examined for learning value. Field names here
are LVRF's; no CVAF content is carried over.

#### 5.2.1 Identity and lifecycle

| Field | Notes |
|---|---|
| `packKey` | The industry slug, e.g. `regulated-utilities-energy`. The only identifier anything outside the pack holds |
| `packName`, `supportedSegments` | Display; segments the pack claims (e.g. electric T&D, generation, gas distribution) |
| `axis` | `vertical` now; `horizontal` (role families under Leadership & Business, Compliance & Ethics, Technology) later (Q13) |
| `contractVersion` | The version of this specification the pack conforms to |
| `version` | The pack content's own version |
| `parent`, `inheritsUnchanged`, `overrides`, `activationPrecondition` | CVAF Amendment 2 C, unchanged |
| `lifecycle` | `status` (draft · activated · superseded · archived), `validation` (pending · validated · blocked), `governance` (pending · approved · revoked), `certification` (pending · certified · revoked), `certifiedBy`, `certifiedAt`, `supersededBy`. Exactly one activated version per `packKey` |

#### 5.2.2 Content

**Measures** (CVAF's `kpis`; LVRF's `industry_measures` today, every existing column kept):
`measureKey`, `name`, `unit`, `direction`, `definition`, `whyItPays`, `addressable` +
reasoning, `confounders`, `caveats`, **`valueKind`** (`capability_performance` ·
`compliance_assurance`, 3.4), **`baselineAvailability`** (mandated · common · rare · absent,
PROP-001), **`systemOfRecord`** (where the number lives: "OSHA 300A log, EHS system"),
**`attestationRoleKeys`**, `overlayKey` (compliance measures), `sourceReferences`.

**Attestation roles** (PROP-001 §4.1): `roleKey`, `title` ("VP HSE / Director of Safety"),
`scope`, `mayCommit`, `mayVerify`. Who inside the customer can stand behind each number.

**Regulatory overlay** (PROP-001, vertical only): `overlayKey`, regulator, rule, the mandated
record, the published consequence (cited), `sourceReferences`.

**Value levers** (LVRF's `value_levers` today, extended): `leverKey`, `name`, `mechanism`,
`leadingIndicator`, `measureKeys` (the measures it moves), `capabilityDomain`,
**`requiredInputs`** (account vocabulary keys), **`evidenceRequired`** per stage (baseline,
measure), **`admissibleAttribution`** (which methods of 3.2 can credibly apply),
**`monetizationDefinition`** {`definition`, `unit` (currency per measure unit per year),
`confirmationOwner` role} with **no value**, `convertingQuestion` (required on every lever),
`blockedByGaps` (refuse), `disclosures` (disclose), `solutionAlignment` {`proposed` offering
keys, `integratesTo` system categories}, `executiveOwner`, `sourceReferences` (reference
studies, with sponsor).

**Discovery instrument:** `questionKey`, `question`, `mappedLeverKey`, `producesInputs`
(list), `executiveOwner`, `evidenceRequired`, `scoringGuidance`, `convertsLever` (computed).
The scale is **measurement readiness**, not maturity: 1 not measured · 2 measured in
pockets · 3 one definition, reported · 4 system of record, owned · 5 system of record, owned
and attestable by a named role. A stated readiness with no evidence scores "unassessed",
not 3 (CVAF's rule). Answers are account facts with provenance, never inputs to a value.

**Gap catalogue:** `gapKey`, `kind` (market gap on the pack; client gaps live on the account),
`mode` (refuse · disclose), `statement`, `scopeCondition`, `nearestProxy` (with what it does
not measure), `blocksLevers`.

**Benchmarks:** rows (`measure`, `value`, `unit`, `betterDirection`, quartiles, `sourceId`,
`comparableAccountInput`) and sources as entities (`publisher`, `methodology`,
`populationNote`, `sponsor`, `confidenceTier`).

**Solutions and exclusions:** `solutionKeys` mapping to offering keys in the tenant's
catalog (`offerings`); pack-scoped `exclusions` (offering, reason, citation).

**Content rules**, validated: vendor or partner collateral is never a source for a measure,
a benchmark or a monetization definition; vendor-sponsored sources cap at `inferred`; no
practitioner claim in pack content (account only); no number in a monetization definition.

**Contract level, not pack level:** the **account vocabulary** (key, label, type, unit,
`obtainableOutsideIn`, derived `requiredBy`), validation rules, and the evidence-tier
ladder (3.1).

#### 5.2.3 How the pack drives the spine (the heartbeat)

The account's industry resolves **one** active certified pack (with its parent composed).
Every stage reads it from the server; none falls back silently.

| Stage | What it takes from the active pack | What it enforces |
|---|---|---|
| **baseline** | `requiredInputs` → the account intake form and the account research prompt (generated); `baselineAvailability` and `systemOfRecord` per measure → feasibility shown before anything is sold; benchmarks beside the baseline | An outcome may be opened only on a pack measure (extends today's `metricPackBasis.ts`) |
| **attach** | levers per measure, their mechanism and `solutionAlignment`; the discovery instrument's questions per lever | A hypothesis only on a pack lever; a recommended offering only from that lever's `proposed` list and not excluded |
| **model** | `monetizationDefinition` (what rate the client must state, and who confirms); gaps | Cost of delay refuses on a refuse gap, or on a rate that doesn't match the definition's unit |
| **commit** | attestation roles with `mayCommit` | The committer is shown against the role the pack names; a mismatch is a visible flag (Q14) |
| **measure** | `evidenceRequired`, `systemOfRecord`, `admissibleAttribution` | An attribution method outside `admissibleAttribution` is refused |
| **verify** | attestation roles with `mayVerify` | The verifier holds the role, or the flag shows |
| **return** | — | The run **seals the pack version and its document hash**; refuted hypotheses are listed against their lever for the next version's delta review; anonymised aggregates (n ≥ 5) may become benchmarks |

#### 5.2.4 Lifecycle, in LVRF

1. **Import** — a pack document (or one section) pasted from a person-run research prompt,
   or authored in the repo. Stored whole with its SHA-256 (`pack_imports`, immutable).
2. **Deltas** — computed against the active version: each element new, changed or removed.
   **The steward accepts or rejects each delta** with a reason in its own empty field (today's
   per-entry acceptance, generalised). Nothing is accepted in bulk without a dry-run count.
3. **Guardrails / validation** — structural and doctrinal checks (5.2.6), stored per run.
   Any failure blocks; every failure is listed.
4. **Approval** — the steward approves the assembled version.
5. **Certification** — by the admin only (Q15), recorded by name (CVAF found a certification
   with an empty certifier).

**Who may act (Q15):** every step above is an admin act, classified `steward` in
`STEWARD_ROUTES` and refused by a database trigger for anyone else. Everyone else, including
future AE and VP users, reads packs and never changes them.
6. **Activation** — the version becomes the one active for its key; the previous is
   superseded with a link; a child needs a certified parent.

#### 5.2.5 Storage and enforcement

- **The document is the artifact.** `pack_versions` holds the full contract document
  (`jsonb`), its SHA-256 (CHECK that the hash matches the canonical text), and the lifecycle
  columns. A certified document cannot change (trigger).
- **Projections serve the constraints.** At activation, one function materialises the
  document into relational rows the rest of the database can enforce against: measures
  (`industry_measures`, gaining `pack_version_id`), levers (`value_levers`), attestation
  roles, overlay, gaps, solutions, exclusions, questions. Foreign keys and triggers bind
  hypotheses, recommendations, outcomes and the cost-of-delay function to these rows.
- **The two cannot drift.** A preflight check and a verify script recompute each active
  version's projection from its document and compare hashes. CVAF's defect — the runtime
  reading one store while governance wrote another — is made a failing check.
- **Existing content is imported, not lost.** Today's accepted measures, exclusions, levers
  and lever↔offering links per industry are assembled by a dry-run script into a **v0 draft**
  per industry, which then goes through the lifecycle like any import. Until a version is
  active, existing accounts read "no certified pack" and keep working as today (Q16).

#### 5.2.6 Validation

**Structural:** every key unique; every `measureKeys`, `mappedLeverKey`, `blocksLevers`,
`attestationRoleKeys`, `overlayKey`, `sourceId` resolves; every `requiredInput` resolves to
the vocabulary or a proposed addition; inheritance rules 1–8; every offering key exists in
the catalog.

**Doctrinal:** every measure has `valueKind`, `baselineAvailability`, `systemOfRecord` and at
least one attestation role with `mayVerify`; every compliance measure has an overlay; every
lever has a converting question and a monetization definition with no number; no lever is
both refuse-blocked and given a monetization definition that would let cost of delay run;
no proposed offering is excluded; content rules hold.

**What validation cannot check:** whether a mechanism is true. That is what the hypothesis,
its falsifier, and the confirmation gap are for.

### 5.3 Attribution and people

| Object | Shape | Enforced in |
|---|---|---|
| `value_outcomes.attribution_method` | enum (3.2); required before `measure` | Postgres CHECK |
| Method fixed at commit | change after `committed_at` refused except by supersession with reason | trigger |
| `comparison_populations` | outcome id, label, `n`, baseline, actual, evidence ids | Postgres; n ≥ k checked by trigger reading `policy_values` |
| `policy_values` | key (`min_group_size`, `cost_of_delay_months`, `cfo_min_confidence`, `output_rules_version`), value, version, ratified_by, ratified_at; append-only versions | Postgres; steward-only trigger |
| `cohort_export` evidence kind | `cohort_size` NOT NULL, `data_basis` NOT NULL | CHECK |
| Customer learner rows | refused: the learner must be the tenant's own staff (Q6) | trigger on `assessments` |
| `v_cohort_aggregates` | the only read path renderers use for people data; suppresses n < k | SQL view; a verify script greps routes for direct `assessments` reads |

### 5.4 Cost of delay (ruling b, 24 Oct 2026)

**The method**, carried from CVAF's ratified idea and re-examined: a delay of D months shifts
the realization of the committed improvement by D months; the value forgone is D months of
the annual value at the committed target, undiscounted, not recovered later.

```
annual value at target = |committed target − baseline| × client's rate (currency per unit, per year)
cost of delay (D months) = annual value at target × D / 12
```

**Inputs, all from the record:**
- the outcome's `baseline_value` (with its basis);
- the outcome's **committed** `target_value` (`committed_at` and `committed_by_person_id` set);
- a **`monetization_rates`** row for the account's metric: currency per one unit of the
  metric per year, its currency, `rate_kind` (`performance` · `exposure`), a `how_read`
  rationale, and an evidence id whose basis is `client_stated` or `system_of_record`, attested
  by a non-simulated customer-side person;
- `D` from `policy_values.cost_of_delay_months` (recommendation 6, Q3).

**`lvrf_cost_of_delay(outcome_id)`** returns the amount, the weaker basis of its inputs, and a
refusal reason. It **refuses**, naming every reason, not just the first, when:
1. the outcome has no committed target ("no committed target");
2. the target is not an improvement in the metric's direction;
3. there is no current rate, or the rate's evidence basis is below `client_stated`, or its
   attester is not customer-side;
4. the rate's unit is not the metric's unit (trigger on `monetization_rates` makes this
   impossible to store, but the function states it);
5. the measure is `compliance_assurance` and the rate is not `exposure`;
6. the outcome is already measured: then the case shows the realized currency instead, if
   recorded with `impact_basis`, and no cost of delay.

**What it never uses:** `claimed_currency_impact` from a vendor claim; any pack value; any
published effect size; any default.

**At lock**, the run seals the inputs (row ids, values) and the result or the refusal, so the
case reproduces exactly. Runs locked before this ships read "cost of delay: not sealed in this
run".

**The renderer** prints it as: "Cost of a 6-month delay: $X (projected at the committed
target; client-stated rate attested by <name>, <date>). Not realized." Or the refusal and
what it takes.

### 5.5 Roadmap

A roadmap in LVRF is the **plan to measure**, not a delivery plan. It is authored and drawn
from the record; nothing is generated (CVAF's "phases × 3 months" is the anti-pattern).

- **From the record (shown, not stored again):** each outcome's committed target date
  (`promised_measured_at`), each hypothesis's `falsifier_due`, the stage each outcome has
  reached, open asks with their owners.
- **`roadmap_milestones`** (governed, per engagement, authorized acts): title, `due_on`
  (date, NOT NULL), `owner_person_id` (NOT NULL), optional link to an outcome and a spine
  stage (`commit` · `measure` · `verify`) or to an offering's deployment, `status`
  (`planned` · `done` · `missed`), `done` needs an evidence id. Changing a date is a
  supersession with a reason, so slips stay visible.
- **Sealed at lock.** The value case shows the sealed roadmap; the account page shows the live one.

### 5.6 Recommended solutioning

Built on O1's levers and `lever_offerings` (offering ↔ lever, with basis and the offering's
`evidence_class`).

- **`solution_recommendations`** (governed, per engagement): `value_hypothesis_id`,
  `offering_id`, `rationale` (≥ 24 chars), author, status. A trigger refuses an offering not
  linked by `lever_offerings` to the hypothesis's lever: you may only recommend what the pack
  says pulls that lever.
- **Integrates to:** links to the account's `institution_facts` of kind `system` (for
  example "Workday (HRIS)"), so the case says which customer system the evidence will come
  from. That is the evidence plan, which a CFO reads as feasibility.
- **Pack exclusions:** `pack_offering_exclusions` on a vertical version (offering, reason,
  citation); the trigger refuses recommending an excluded offering (CVAF's canon-exclusion
  lesson, pack-scoped as its Amendment 2 ruled).
- **What it can evidence:** each recommendation prints its offering's `evidence_class`
  (consumption · assessed · demonstrated · applied), so a consumption-only offering is not
  presented as moving an outcome.
- **Sealed at lock.**

### 5.7 Value case (O3, extended)

O3 as planned in LVRF_PLAN §5 (`lens_policies`, the page, outcomes by lever, the refusal page),
plus sections 5.4–5.6, `OUTPUT_RULES_VERSION` in `policy_values`, and the print rules from
UX-1 slice 3 (banners and full hash on every page).

### 5.8 The War Room

No new table. `GET /api/book`, read-only, tenant-scoped, membership shared with
`cohort.ts`. Sums no money (4.3).

### 5.9 What lives where: the split

| In Postgres (cannot be bypassed by any route) | In the API (reads text or several tables at once) |
|---|---|
| Evidence form and its shape; form kept on supersession | Figure check (parses text) |
| Fetch hash NULL unless 2xx; archive labelling | Fetching, and recording the fetch |
| Verification state function; measure/verify gate | Validation checks on a pack version |
| Basis function, including sponsor cap | Dry-run counts before bulk acts |
| `governance_acts` presence for governed changes | Lens rendering, sentence choice by attribution method |
| Pack version lifecycle, one active per key, parent certified, certified immutable, axis rule | The War Room aggregation |
| Attribution required before measure, fixed at commit | The drafting assistant's checks (if Q9 approves) |
| k-suppression view; pseudonymous learners | Steward classification of routes (with its guard script) |
| Cost of delay inputs' basis, attester and unit; the function itself | |
| Recommendations only for linked, non-excluded offerings | |
| Policy values steward-only and versioned | |

---

## 6. The three accounts, once this is built

**Nothing below is a figure LVRF does not already hold.**

**Scotts Miracle-Gro** (live, outside-in). Value case for run 2: OUTSIDE-IN and UNVERIFIED
banners; baseline TRIR 1.4 FY25 (published); target: none, a hypothesis. **Cost of delay
refuses:** no committed target, no attested rate; it says what it takes (a named Scotts
committer for a TRIR target, and Scotts' own cost per recordable incident or per point of
TRIR, attested by its EHS or finance owner). Attribution: not yet set (`claimed` outcomes need
none). Roadmap: empty until a milestone is authored; the record's dates shown. Solutioning:
Skillsoft Compliance Suite (EHS solution) on the TRIR lever, evidence class shown; integrates
to: the systems on record (SAP, inferred). CFO lens refuses (low confidence); CHRO lens shows
"no capability movement recorded".

**Curia** (reference example). Renders only as "reference example, not an engagement",
never under the CFO lens (O-D3). Its confidence curve is the instrument's best illustration:
run 1 at 10 → run 21 at 55. Cost of delay: refuses unless its record holds a committed target
and an attested rate (**INFERRED** that it doesn't; not checked on the prod copy).

**Skillsoft (Client 0)** — see Q8. The tenant's own account has no walk and no POV by design
(L33). An internal value case for Client 0 is a different object: the **book's** realization
(verified records, confirmation gap, refuted hypotheses) plus Skillsoft's own published
outcomes (dollar retention from the 10-K, basis `published`, self-authoritative). The
commercial line (ARR, renewals, expansion) has no source in LVRF (LVRF_PLAN M8); it needs a
CRM export as `system_export` on the tenant's own account before it can appear.

---
## 7. Build order: smallest governed slice first

Every phase runs LVRF's gates: Gate A (verify scripts with deliberate breaks, every file
restored byte-identical; regression of all scripts; prod-copy equivalence), Gate B (Brad's
pastes, backup first, a STOP after each), Gate C (run hashes, ownership, drift, trigger count,
refusals, journal). Fixtures use **invented** institutions only, for example "Fixture Valley
Electric Cooperative (invented)" and "Northgate Utilities" (LVRF's own Use B fixture, 29 Jul). No CVAF data.

**Before P1:** deploy UX-1 slice 3 and `b5a3588` (Gate B pending), and ratify or amend
PROP-001 (Q1, Q2).

| Phase | What | Acceptance test (Gate A) |
|---|---|---|
| **P1. The evidence form and the figure check** | `evidence_form`, quote/locator, form kept on supersession, `figure_checks`, contract v5 `how_read` + form; legacy backfill (dry run, then `--apply`) | Breaks caught: a locator successor to a quote; a quote over 40 words; a fact value "1.4" against a quote that says "1.2" → `needs_human_check` naming 1.2; a qualifier added → flagged, not blocked; a superseding row arrives unverified and unattested. All legacy rows read `legacy`, none blank |
| **P2. Acts and lineage** | `governance_acts`, the presence trigger (Step 0 on a scratch database first), `research_imports` with hash, `lvrf_lineage`, `/lineage/:table/:id` | Scotts' TRIR baseline: lineage returns prompt → import → result → accept act → evidence → fact → run 2's seal, each with who and when. Breaks: a governed change with no act refused; a tampered import (hash ≠ text) refused; an import edited after insert refused |
| **P3. Fetch verification** | `source_fetches`, the verification-state function, the measure/verify gate | A failed fetch with a hash refused; a 200 fetch stores a hash; an archived copy without its labeller refused; an AI-sourced item with a successful fetch and no human opening stays below verified; a measured actual on `needs_human_check` evidence refused |
| **P4a. The Pack Contract and its lifecycle** | `server/packs/contract.ts`; `pack_imports`; `pack_versions` (document, hash, four axes); delta review per element (steward); validation (5.2.6); approve, certify, activate; inheritance; the v0 draft import of today's content (dry run, then `--apply`) | An invented fixture pack walks import → deltas → validation → approval → certification → activation; the dry-run count equals the result. Breaks: a hand-edit of a certified document; a second active version; a child activated on an uncertified parent; an element in both `inheritsUnchanged` and `overrides`; a `requiredInput` resolving to nothing; a monetization definition containing a number; certification without a certifier; any lifecycle act by a non-admin (route and trigger both refuse). Every failure listed, not just the first |
| **P4b. The pack drives the spine** | Projections at activation and the drift check; the resolver; each stage reading the active pack (5.2.3); runs seal the pack version and hash; "no certified pack" on every affected page | Projection hash equals the document's on every active version; a deliberately edited projection row fails preflight. A hypothesis on a lever outside the active pack refused; an outcome on a non-pack measure refused; an attribution method outside `admissibleAttribution` refused; an account with no active pack shows the reason on every stage page and seals `pack: none` |
| **P4c. First certified pack: Regulated Utilities & Energy** (Q2, ratified) | Researched through prompts generated from the contract, public sources only (OSHA, NERC, EIA, BLS); attestation roles confirmed by a practitioner who has held the role (PROP-001 §9.1); then Manufacturing re-cut from its v0 draft | Validation passes with no waivers; every measure cited; the practitioner's confirmation recorded as a governance act; Scotts' outcome resolves to the active Manufacturing version |
| **P5. Attribution and people data** | `attribution_method`, `comparison_populations`, `policy_values` (k, months, CFO threshold, rules version), `/policies`, `cohort_export`, k-suppression view, pseudonymous learners, `sponsor` cap in the basis function | Breaks: measure without a method; method changed after commit; a comparison group of n < k; a rendered page or PDF containing a fixture learner's name or id (grep); a sponsored study read above `inferred`. The basis function still passes D2's ten rules plus 7b |
| **P6. The value case (O3, extended)** | `lens_policies`, `/runs/:id/case`, `monetization_rates`, `lvrf_cost_of_delay`, `roadmap_milestones`, `solution_recommendations`, exclusions, sealing of all three at lock, the confidence curve, print | Scotts: the CFO refusal page with every refusal reason for cost of delay listed. Fixture with committed target 1.0 against baseline 1.4 and an attested rate of $250,000 per point of TRIR per year: the case prints $50,000 for 6 months (0.4 × 250,000 × 6/12), recomputed by hand in the script. Curia never under CFO. Breaks: a vendor-basis rate; a rate in the wrong unit; recommending an unlinked or excluded offering; a roadmap date edited in place; a run locked before P6 renders "not sealed in this run". Every printed page carries banners and the full hash; rules-version identity test byte-identical |
| **P7. The War Room** | `/book`, the portfolio band on `/` | Membership equals book confidence's; the tenant's own and reference examples absent; no currency total anywhere on the page (grep for a sum); confirmation gap refuses at n = 4 |
| **P8. Admin** | `/people` (grants and roles as steward acts, password re-entered), ratify/demote surfaced on `/packs/:slug` | `verify_steward_acts.sh` covers every new route; a non-steward is refused on each; no dead buttons |
| **P9. Client 0 internal value case** | per Q8 | per Q8's ruling |
| **P10. The drafting assistant** (only if Q9 = yes) | drafts from a sealed payload; per-sentence evidence ids; deterministic checks; a person accepts into `executive_summaries` | Breaks: a number not in the payload; a name not in the payload; "caused" with a non-control method; a sentence without an id. Each refused with its reason |

---

## 8. Questions, all ruled by Brad (24 Oct 2026)

| # | Question | Recommendation |
|---|---|---|
| ~~Q1~~ | ~~What a pack is~~ | **Ruled 24 Oct 2026:** CVAF's definition, re-examined (2.6, 5.2) |
| ~~Q2~~ | ~~PROP-001~~ | **Ratified 24 Oct 2026** as recommended |
| ~~Q3~~ | **Ruled 24 Oct 2026 as recommended.** Cost of delay months D | **6**, as a ratified policy value, printed on the case. Changeable only on `/policies` by the steward, versioned |
| ~~Q4~~ | **Ruled 24 Oct 2026 as recommended.** Should the attribution method change the confidence score? | **No.** That amends CONFIDENCE_MODEL (and moves the 80 ceiling). Gate what lenses show instead |
| ~~Q5~~ | **Ruled 24 Oct 2026 as recommended.** Minimum group size k | **10.** Common practice for people analytics suppression; 5 is too easy to re-identify in small sites |
| ~~Q6~~ | **Ruled 24 Oct 2026: (b), group results only.** Today an analyst can record **one named customer employee's assessment score** (for example "Jane Smith, 2 out of 5 on hazard recognition") through the account inputs. Should LVRF (a) keep accepting individual scores but only under a code instead of a name, or (b) stop accepting individual scores for customer accounts and take **group results only** (for example "84 people at the plant, average 3.6 out of 5")? | **(b), group results only.** A value case needs cohorts, never a person; holding individual scores makes LVRF a store of customers' employee performance data, with the privacy duty that brings, for no gain. The tenant's own staff keep today's individual records |
| ~~Q7~~ | **Ruled 24 Oct 2026 as recommended.** War Room at `/book` with a band on `/`, or the War Room as `/` itself? | **`/book` plus the band.** Accounts stay the front door, as decided |
| ~~Q8~~ | **Ruled 24 Oct 2026 as recommended.** What is Client 0's "full internal value case"? (a) the book's realization plus Skillsoft's published outcomes; (b) also the commercial line, which needs a CRM export source first; (c) something else | **(a) now, (b) when a CRM export is defined** as `system_export` on the tenant's account. Nothing about ARR or renewals renders until then |
| ~~Q9~~ | **Ruled 24 Oct 2026 as recommended.** A drafting assistant inside LVRF (reverses O-D6's "LVRF generates no prose") | **Not before P6 ships.** Then yes, under 2.7's checks, as P10 |
| ~~Q10~~ | **Ruled 24 Oct 2026 as recommended.** `evidence.confidence` (asserted, default `medium`) | **Stop writing it; keep the column** because sealed payloads carry it; label it "stated by the analyst" wherever shown |
| ~~Q11~~ | **Ruled 24 Oct 2026 as recommended.** A run sealed under output rules v1, viewed after v2 ships: render with v1, or with v2 and say so? | **Render with v1.** Keep each rules version's renderer; it is the only way a sealed case reproduces exactly |
| ~~Q12~~ | **Ruled 24 Oct 2026 as recommended.** Where does the fetch verifier run? (a) on the box (needs outbound HTTPS from the API host); (b) by a person on the Mac, uploading the fetch record, like research | **(b) first.** It keeps "no code calls a research tool" (D1) and the box's egress closed; revisit when Compass OS exists |
| ~~Q14~~ | **Ruled 24 Oct 2026: flag.** When the person committing a target or verifying an actual doesn't hold the role the pack names (for example the pack says "VP HSE" and the committer is the plant manager): block, or flag on the page and the case? | **Flag, not block.** Titles vary by institution (PROP-001 rates its titles 55/100). The flag prints on the value case beside the name |
| ~~Q15~~ | ~~May the importer also certify?~~ | **Ruled 24 Oct 2026:** only the admin certifies; every pack lifecycle act is the admin's; AEs and VPs get view-only access to packs, as in CVAF |
| ~~Q16~~ | **Ruled 24 Oct 2026: yes.** Until each industry has an active certified pack, do existing accounts keep working as today with a "no certified pack" notice, or stop at the stages that read the pack? | **Keep working, with the notice and `pack: none` sealed.** Stopping would freeze Scotts until Manufacturing is certified |
| ~~Q13~~ | **Ruled 24 Oct 2026 as recommended.** The horizontal axis (role families under Leadership & Business, Compliance & Ethics, Technology) | **Defer.** Build vertical packs only in P4a–P4c; the horizontal axis when a second solution area has a live account |

---

## 9. Conflicts named, not resolved

- **CVAF "not captured is NULL" vs LVRF Rule 1 "numeric fields NOT NULL".** Not a
  contradiction in substance (1.3). Recorded so nobody "fixes" Rule 1 to match CVAF.
- **O-D6 (LVRF generates no prose) vs the lesson's drafting assistant.** Q9.
- **PROP-001 §8 schema vs 5.2.** Resolved by Q2's ratification: 5.2 supersedes §8.
- **PROP-001's second-pack trigger vs Manufacturing's live account.** Resolved by Q2.
- **CVAF's rate band vs LVRF's "no effect sizes" (O1).** Resolved in 2.6: the slot becomes a
  monetization definition with no value; the account supplies the value under ruling (b).
- **CVAF's seed-and-flag gap mode.** Not adopted: LVRF packs carry no values to seed.
- **CVAF's War Room and roadmap generator** are recorded as anti-patterns, not lessons
  (1.9, 4.3, 5.5).
