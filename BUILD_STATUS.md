# LVRF — Build Status

**28 July 2026.** Build officially commenced.

---

## Constitutional state

| Instrument | Status |
|---|---|
| `AMENDMENT-001` — Chapel reorientation, LVAF→LVRF, Learning ROI struck | **Ratified** |
| `AMENDMENT-002` — Heartbeat Register extension, HB-0013..0018 | **Ratified** |
| `AMENDMENT-003` — Financial as seventh health dimension | **Ratified** |
| `AMENDMENT-004` — Pack as Cathedral canonical object | Not drafted |

All three ratified amendments are implemented in code. Governance and implementation are
in step — no drift outstanding.

---

## Built and verified

**Infrastructure** — VPS `srv1862778`: Postgres 16.14 (checksums on, 8GB tuning, localhost),
pgvector 0.6.0, Node 24.18.0, Caddy with valid certs on `lvrf-rule76.com` proxying
`127.0.0.1:3001`, nightly `pg_dump`, ufw 22/80/443, fail2ban, key-only SSH, 2GB swap.

**Local dev** — Mac: Node 24.18.0, Postgres 16.14, database `lvrf` / role `lvrf_app`,
VS Code with Claude Code.

**Schema** — `db/schema.ts`: 18 tables, 13 enums, 13 CHECK constraints.
`db/hardening.sql`: audit + delete-guard triggers on 12 governed tables (24 total), append-only
privileges on `audit_log` and `heartbeat_events`.
`db/seed_heartbeat_register.sql`: 18 heartbeats, all seven categories populated.

**Value spine** — `records/simulate_spine.py` walks all seven stages, emits register-compliant
heartbeats with SHA-256 hashes, computes institutional health across seven dimensions with
unmeasured dimensions excluded from the denominator, and derives confidence from the evidence
ledger across six weighted factors.

**Documents** — `records/render_record.py` produces the Realization Record via WeasyPrint.

---

## First spine run — customer zero

| | |
|---|---|
| Heartbeats emitted | 10, all registered |
| Value delta | +2.4 points, 120% of target |
| Institutional health | 88.3 · WATCH · 90% coverage |
| Realization | **measured** — verification refused |
| Disclosure | **internal** — not customer-releasable |
| Computed confidence | **30 / 100 · LOW** |
| Findings | 3 |

The run's most important behaviour is what it declined to do. Verification was refused
because evidence supporting the measured actual was not source-verified and no human
verifier was of record.

---

## Use A and Use B — both walked, 29 July

| | Use A · customer zero | Use B · Northgate Utilities |
|---|---|---|
| What is measured | The **vendor's** sales capability | A **customer's** workforce capability |
| Metric | Skillsoft LTM dollar retention | Customer TRIR, per OSHA 300A |
| Direction | increase | **decrease** — first test of that path |
| Evidence | public filing + unverified simulation | **attested** by customer authorities |
| Delta | +2.4, 120% of target | −0.34, 106% of target |
| Institutional health | 88.3 · WATCH | 99.1 · HEALTHY |
| Confidence | **30 / 100 · LOW** | **80 / 100 · HIGH** |
| Realization | **measured** — refused | **verified** |
| Disclosure | internal | customer_shared |

Use B is the engagement shape the value engineering role actually performs. Use A proves
the mechanism; it does not demonstrate the job.

### Attestation credit — the design decision behind it

A vendor cannot independently verify a customer's internal figure; it has no access to the
customer's system of record. Without a middle tier, 50 of 100 confidence points would be
permanently unreachable and the product unusable for its purpose.

Two concepts were separated:

- **The gate** (`source_verified`) asks whether the source was confirmed **by an authority
  over it**. A public filing is self-authoritative. A customer's internal metric is
  authoritative when the customer's own metric owner attests to it. Attestation therefore
  clears the gate, and Use B records can reach `verified`.
- **Confidence** asks how **strong** that confirmation is. Attestation earns
  `ATTESTATION_CREDIT = 0.6`, because a management representation is weaker than
  substantive testing.

`0.6` is chosen so a flawlessly executed Use B record scores exactly **80** — the floor of
HIGH. It must do everything right to get there, and **cannot exceed 80 without genuine
independent verification.** That ceiling is deliberate and is printed on the document.

An attestation counts only if the attester is **institution-scoped and real**. A vendor
attesting to a customer's number is an assertion wearing a signature.

---

## 0001 — Defect 2 closed, verifier role added

Schema patched and validated (drizzle-kit 0.31.10, drizzle-orm 0.45.2). Generates:

- **12 self-referencing `superseded_by_fk`** — one per governed table, `ON DELETE restrict`.
  Declared in each table's config array via `foreignKey()`, because a shared `governance()`
  helper cannot express a self-reference. On `heartbeats` the column is `text` and correctly
  targets the register's text primary key.
- **12 `steward_person_id → persons.id`** — resolved with a lazy `AnyPgColumn` thunk, which
  is what permits the `tenants → persons → tenants` cycle and the `persons` self-reference.
- **`personRole` gains `value_verifier`.** HB-0016 requires a named human verifier and the
  enum had no value for one. Named by **function, not department** — the authority may sit
  in Finance, Internal Audit or RevOps.

**Defect 2 is closed.** The orphaned-relation class is now structurally impossible on every
governed table.

### Separation of duties — API-enforced, not schema-enforced

A `value_verifier` must not also be the `metric_owner` for the same metric, and for a
customer's metric must be **institution-scoped**. Neither rule can be a CHECK — both span
tables. They live in the route and must not be removed.

---

## Confirmation gap engine — built 29 July

`records/confirmation_gap.py`. AMENDMENT-001 Article II assigned LVRF ownership of
Confirmation Gap; nothing computed it until now.

**Design decision: the gap is a portfolio instrument, not a record one.** A single
outcome's target-versus-actual is arithmetic. The question a finance function actually
asks is *"when this function gives me a number, how wrong is it usually, and in which
direction?"* — a property of a body of records. Direction is weighted above magnitude: a
practice consistently 10% conservative is trustworthy; one consistently 10% optimistic is
not, at identical absolute error.

**It refuses below n=5.** Portfolio bias is not reported over an insufficient population —
same discipline as the health model reporting UNMEASURED rather than assuming compliance.
Dispersion requires n=12.

### First run — the distinction that matters

| Outcome | Confirmed | Admissible |
|---|---|---|
| Northgate · TRIR 1.42→1.08 vs target 1.10 | **yes** — 106.2% of claim | **yes** |
| Skillsoft · DRR 98→100.4 vs target 100.0 | **yes** — 120.0% of claim | **no** |

The Skillsoft outcome hit its target and is still excluded, because realization is
`measured` rather than `verified`. **A claim you cannot substantiate earns no credit toward
the practice's record, even when it happens to be right.** Portfolio bias therefore reads
NOT REPORTED at 1 admissible outcome.

### Two schema gaps it cannot work around → 0002

1. **Currency confirmation.** `value_outcomes.currency_impact` is a single column.
   Confirming a currency claim needs the amount claimed **at commit** and realized **at
   verify** as separate values. Requires `claimed_currency_impact` and
   `realized_currency_impact`. **This blocks the dollar confirmation gap — the metric a CFO
   cares about most.**
2. **Measurement punctuality.** No `promised_measured_at`, so slippage between the
   committed measurement date and the actual one is uncomputable. A practice that always
   delivers *late* is a distinct failure from one that delivers *short*, and the engine
   cannot currently tell them apart.

Both surfaced by executing, not by review. That is now four findings from running code
against zero from thirteen specification volumes.

---

## 0001 — folded, not yet generated

The three confirmation-gap columns were folded into the same migration as Defect 2 and the
verifier role. One migration, not two. **Schema validated; migration not yet generated or
applied.**

`value_outcomes` now carries:

| Column | Purpose |
|---|---|
| `claimed_currency_impact` | The figure asserted at `commit` |
| `realized_currency_impact` | The figure measured at `verify` |
| `promised_measured_at` | The measurement date committed to |

`currency_impact` is **renamed** to `claimed_currency_impact`. `drizzle-kit generate` will
prompt interactively — choose **rename**, not create. Safe: nothing in `value_outcomes` is
real data.

Two constraints updated or added:

- `value_outcomes_impact_requires_basis` — extended to cover both figures. No unexplained
  money, claimed or realized.
- `value_outcomes_realized_requires_measurement` — a realized figure cannot exist while
  realization is still `claimed`. Prevents back-filling an outcome with a result it never
  measured.

**Why two columns and not one.** A single `currency_impact` silently overwrites the claim
with the outcome, which erases the only evidence the claim was ever wrong — precisely the
record a finance function wants. The confirmation gap engine names this as the metric a CFO
cares about most, and it was uncomputable until now.

### Apply order

```
pg_dump -Fc lvrf > ~/Backups/lvrf/pre-0001.dump
npx drizzle-kit generate        # answer "rename" at the prompt
cat db/drizzle/0001_*.sql       # read before applying
npx drizzle-kit migrate
```

Expect **24 ADD CONSTRAINT**, one `ALTER TYPE ... ADD VALUE 'value_verifier'`, three new
columns, one rename, two CHECK changes.

---

## 0002 — applied 1 August. AMENDMENT-005 evidence columns, value_runs, disclosure link

Migration `0002_sloppy_cerebro.sql` generated from the patched schema and applied to the
local `lvrf` database (`pg_dump` to `~/Backups/lvrf/pre-0002.dump` first). Six governed-research
columns and three CHECKs on `evidence`; `value_runs` (25 columns, 7 FKs, two self-referencing);
`record_documents.value_run_id`. No drops.

Both 0002 triggers are installed in `db/hardening.sql` §5 and applied live — trigger count
36 → **38**. The locked-run trigger is verified to bite: an UPDATE against a locked run
raises; `superseded_by_id` remains writable, which is how a relock records replacement.

### Rules the API must carry — now three

None may be removed without an amendment.

1. **Separation of duties.** A `value_verifier` must not also be the `metric_owner` for the
   same metric, and for a customer's metric must be institution-scoped. (0001, above.)
2. **The actor-context transaction.** Every mutation route sets
   `lvrf.actor_person_id` per transaction so the audit trigger can attribute the write.
3. **Disclosure requires a locked run.** `record_documents.disclosure = 'customer_shared'`
   requires the referenced `value_run` to be **locked**. Spans tables; cannot be a CHECK.

## 0002 applied — 1 August

Migration `0002_sloppy_cerebro.sql`. Backup taken first. Verified against the live database:

- `value_runs` — 25 columns, 7 FKs including two self-referencing
- `evidence` — 6 AMENDMENT-005 columns, 3 new CHECKs
- `record_documents.value_run_id` present
- 18 seeded heartbeats intact
- **38 distinct triggers**, up from 36

### Finding — a locked run is permanent

Discovered by testing rather than design. `lvrf_locked_run_immutable` permits exactly one
column to change after a lock — `superseded_by_id`. `deleted_at` is not on that list, so
**a locked run cannot be soft-deleted.** It cannot be hard-deleted either; it is a governed
table.

Verified:

| Attempt on a locked run | Result |
|---|---|
| `UPDATE confidence_score` | **REFUSED** — trigger raises |
| `UPDATE superseded_by_id` | `UPDATE 1` — the one permitted change |
| `UPDATE deleted_at, status='retired'` | **REFUSED** |
| Insert a new run with `supersedes_run_id` | `INSERT 0 1` — the correct exit |

**This is kept deliberately.** A locked run is the version the institution said it would
defend. Permitting retirement means a value case can be quietly withdrawn after the fact,
and the confirmation gap depends on refuted claims surviving — a practice that can delete
its bad runs is not measuring itself, it is curating. Same reasoning as the phantom audit
rows in `DEFECT-001`: history that can be tidied proves nothing.

**Consequence:** unlocked runs are retirable; **locked runs are forever.** Locking is
therefore a consequential act, which it should be. The exit is to supersede, which records
that the run was replaced and by what.

Not filed as an amendment — it is a consequence of a ratified principle rather than a new
one.

### Rollback note

Two statements in a single `psql -c` share one implicit transaction. When the second
raised, the first rolled back with it. Useful confirmation that a failed trigger leaves no
partial state — and a reminder to run destructive tests as separate invocations.

### Note — one record_document predates value_runs

One row in `record_documents`, rendered 29 July, `document_version = 1`,
`disclosure = internal`, `value_run_id NULL`. It predates `value_runs` and the
`record_documents` payload shape changed during 0003 prep, so its `content_hash`
can no longer be reproduced from current code.

**Not a defect.** The document never left the institution — `internal`, never
`customer_shared` — so no external party holds a hash that fails to resolve. The row is
accurate about what it was.

**Not rewritten.** `record_documents` is governed and versioned on
`(value_outcome_id, document_version)`. The next render produces version 2 with a
reproducible hash; version 1 stands as the record of what was rendered before the shape
changed. Same principle as the phantom audit rows in `DEFECT-001` — history accumulates
rather than being tidied.

### Note — Customer Zero's value_runs start at run_number 3, not 1

The locked-run trigger tests above (**Finding — a locked run is permanent**) inserted their
proof rows directly against the Customer Zero engagement: `run_number` 999 (locked,
`confidence_score = 80.0`) and 1000 (unlocked, `confidence_score = 0.0`). Both are manual
test fixtures, not walk output.

`walkSpine.ts`'s own runs against that engagement therefore land at `run_number` 3 and 4,
not 1 and 2 — `run_number` is computed as a count of existing rows for the engagement plus
one, and it counted the two test rows correctly. **Run 999 is left in place deliberately**
— locked and permanent by design, it is the standing proof that
`lvrf_locked_run_immutable` works. Recorded here so a future reader of `value_runs` does
not mistake run 4 for the fourth real walk of this engagement; it is the second. Use B's
engagement was untouched before 0003 testing, so its runs there are a clean 1 and 2.

---

## Rules enforced in the API, not the schema

Three, each spanning tables and therefore beyond a CHECK. **None may be removed without an
amendment.**

| # | Rule | Where |
|---|---|---|
| 1 | Actor context — every mutating request sets `lvrf.actor_person_id` inside the transaction, or audit rows record a null actor | `server/middleware/actorContext.ts` |
| 2 | Separation of duties — a `value_verifier` may not be the `metric_owner` for the same metric; for a customer's metric the verifier must be institution-scoped | verification route |
| 3 | **`record_documents.disclosure = 'customer_shared'` requires the referenced `value_run` to be locked** | document route |
| 4 | Attestation credit (0.6) requires `evidence.attested_by_person_id` to resolve to an institution-scoped, non-synthetic person — a CHECK can enforce the pairing of `attested_by_person_id`/`attested_at` (`evidence_attestation_is_complete`) but not the cross-table scope test | `evidenceCredit()`, `server/spine/confidenceModel.ts` |

Rule 3 is the connection between locking and the disclosure gate: an unlocked run is
exploratory, and exploratory work does not go to a customer.

**Known weakness on rule 1.** The actor is currently read from an `X-Actor-Person-Id`
header, which any caller can set. An audit log that can be forged is worse than none — it
manufactures confidence. Must be fail-closed outside development before the first mutation
route ships.

---

## Not built — next, in priority order

1. **Wire the confirmation gap to the two new columns** once 0001 is applied. `AMENDMENT-001` Article II assigned LVRF ownership of
   Confirmation Gap. Nothing computes it.
4. **Industry Pack model.** Two axes, not one: vertical packs (industry → metric library,
   attestation authority, regulatory overlay) crossed with horizontal packs (role family →
   capability set). Build **one** pack. Six is the thirteen-volumes error in a new costume.
   A pack supplies content, never presentation.

  Proposal filed: `R76-LVRF-PROP-001` in `docs/proposals/` (HTML + PDF, Proposed status,
  2026-08-03).
5. **Repo scaffold and first migration.** Nothing is deployed. No API, no UI.
6. **Portfolio view.** Tier-2 motion needs cross-engagement visibility.

---

## Open Cathedral items — deliberately deferred

Catch the repository up after the build has produced something to learn from.

- LVAF → LVRF correction across ~17 documents (ratified in A1, not executed)
- Compass hierarchy contradiction: parent in two diagrams, sibling in a third
- `COMPASS-RECONSTRUCTION-STATUS` readiness percentages (A1 Article VII)
- CDS-001 Volumes I–XII: still Version 1.0, unratified, superseded in substance
- Repository Constitution IN PROGRESS — `record_documents` remains provisional
- Whether Stone III exists as a document; the Inheritance Audit's certification rests on it

---

## The pattern worth keeping

Three of the four material findings in this program came from **executing**, not reviewing:

- **F1** — the missing seventh health dimension, found when the health calculator had two
  events with no dimension to map to and declined to invent one
- **The Heartbeat Register gap** — no financial or learning heartbeat existed; the foreign
  key refused the emission
- **Confidence at 30/100** — the number only became knowable once it was computed rather
  than asserted

Thirteen specification volumes produced none.

---

## LVRF 1.0 Foundation — complete 23 August 2026

Foundation is the read path: a governed value run, in production, that computes a
defensible confidence score, discloses its own provenance, and refuses to publish
what it cannot defend — enforced at the database, not in the application.

Foundation does **not** include the write path. The system can refuse evidence but
cannot yet accept it. Items below marked deferred are named deliberately, not dropped.

### Complete — verified live, not inferred

- Production at lvrf-rule76.com / srv1862778, Postgres 16.14, migrations 0000-0009
- 41 non-internal triggers plus five CHECK constraints on `value_outcomes`:
  `commit_is_complete`, `impact_requires_basis`, `measured_requires_actual`,
  `realized_requires_measurement`, `verified_requires_human`
- Customer Zero run 88f6a6e1: 30.0 / low / 88.3 / watch. Production carries one run
- Skillsoft catalog: 12 offerings, 8/8 constraint proof, 22/22 gate tests
- DEFECT-005: index route at `/` with `source_fixture` as a PROVENANCE column
- DEFECT-006: `/assets/*` served without try_files. Verified 200 / 404 / 200
- DEFECT-004: backup validates via pg_restore --list before atomic publish. 299 TOC entries
- scripts/lvrf-deploy.sh: client build step, mtime guard, post-deploy API and vhost checks
- Design system compliant with AMENDMENT-004. Canonical tokens, no hex in components
- RULE | 76 lockup renders above the LVRF mark — chapel subordination legible
- Unbuilt actions disclosed as unbuilt rather than styled as live

### Deferred — named, not dropped

- **Write path.** Add evidence and Render record are inert
- **Verifier attestation.** Nothing can satisfy `verified_requires_human`
- **Run lineage and compare.** No second run exists; no before-and-after possible
- **Record document.** Nothing renders a PDF a CFO could hand a lender
- **DEFECT-E remainder.** The simulation banner is authored prose, not derived
- **Confidence model.** Six weighted factors; weights not traced to a table, not versioned
- **DEFECT-003.** Production apply pending; four composite-key tables uncovered
- **LVRF emblem.** Metallic gradient is off-system. "STUDIO" and the trademark mark
  appear nowhere in the record
- Raw ISO timestamp on the index. Asset PNGs outweigh the JS bundle 2.4x

### Register — findings from 22-23 August

- Local and production hold different data. Production was rebuilt from migrations;
  local carries 2 August seed work including 11 `customer_b` rows. A clean local
  render proves nothing about production
- PROVENANCE UNKNOWN (8) and NOT MEASURED (10) are deliberately different sets.
  Health fields arrived in a later migration than `source_fixture`. Do not reconcile
- `ops/lvrf-backup.sh` mirrors `/usr/local/bin/lvrf-backup.sh`. Nothing enforces it.
  Cron runs the latter as root via /etc/cron.d/lvrf-backup
- `ops/Caddyfile` is a sanitized template, NOT a mirror — it carries a placeholder
  where the bcrypt hash lives. A drift check against /etc/caddy/ would false-alarm
- The server deploy key is read-only. Production cannot push, by design
- lvrf-deploy.sh reports "deploy OK" on a no-op. "No new commits" would be accurate
- basic_auth credential rotated 23 August 2026 following exposure
- Root `npm run build` compiles the server only. This is why twenty days of client
  work sat undeployed. Fixed in the deploy script; the npm script itself is unchanged

---

## Heartbeat register — verified 23 August 2026

Two findings, and both halves matter.

### The health model is correct and reconciles

`server/spine/healthModel.ts` implements db/HEALTH_MODEL.md — seven dimensions
weighted to 100, each fed by heartbeat events mapped through
`CATEGORY_TO_DIMENSION`. A dimension with no events is UNMEASURED: never scored
zero, never assumed compliant, and excluded from the composite's denominator.
The exclusion is published as `coverage_pct` alongside the composite.

Reconciled by hand against production, 23 August. Six of seven categories have
events — operational, governance, integrity, financial, learning, constitutional.
Only `security` is absent. Measured weight is therefore 25 + 25 + 15 + 10 + 10 + 5
= 90, and `health_coverage_pct` reads exactly 90. The number falls out of the model
from real event data, not from a fixture.

Note that `verifyConfidenceParity.ts` hardcodes `coveragePct: 90` as an expected
value. That is a parity test, not the source of the figure — the arithmetic above
was derived independently from the events table.

`institutional_health` 88.3 is weighted faithfulness across 90% of defined
dimension weight, with Security excluded rather than assumed compliant. This is
defensible arithmetic and the exclusion principle is the same instinct as
`verified_requires_human`.

### The register is seeded, not live

All ten rows in `heartbeat_events` carry the identical timestamp
`2026-08-03 04:41:31.405125+00` — written in one transaction during the initial
spine walk. Nothing has emitted an event since.

Consequences:

- HB-0001 System Initialization declares "every startup". The API has restarted
  many times since 3 August. Zero events
- HB-0002 Authentication and HB-0003 Authorization have never fired. This is
  precisely why the Security dimension is unmeasured — the model is reporting
  the gap accurately
- HB-0011 Heartbeat Health Calculated and HB-0012 Institutional Health Published
  have never fired. The score is published without recording that it was computed
- HB-0010 Constitution Reviewed, weight 10 severity 5, has never fired across
  every governed change made this month

The seeded events are honest — HB-0016 Value Verified sits at `warning` severity 5,
matching the refusal rendered on screen. Nothing is fake-healthy.

But 88.3 describes 3 August, and the interface does not say so. A reader would
have to inspect `occurred_at` to know.

### Deferred to 2.0 Band A

Runtime heartbeat emission. Every governed action writes an event; health
recomputes from a live register rather than a snapshot. This is the same tranche
as the write path — they are one piece of work, not two.

Until then: the model is an instrument, the register is a photograph.

---

## Release structure — ratified 23 August 2026

Supersedes the "Deferred to 2.0 Band A" framing used earlier in this file. Those
items were misfiled: the write path completes Foundation rather than enhancing it.
Earlier entries stand as written; this section governs.

Three tiers, each with a boundary that can be tested rather than asserted.

### 1.0 Foundation — CLOSED 23 August 2026

The read path. A governed value run, in production, that computes a defensible
confidence score, discloses its own provenance, and refuses to publish what it
cannot defend — enforced at the database, not in the application.

Test: a stranger can open the system, see a value run, and determine from the
interface alone what is evidenced, what is asserted, and what is refused.

Closed. Every item verified live rather than inferred. See the Foundation section
above for the full inventory.

### 1.2 Complete system — NOT STARTED

The write path, and everything that closes the loop.

- Add evidence writes through the gate. The four CHECK constraints and
  `lvrf_block_ai_actual` fire on real input, not seeded rows
- Verifier attestation. Something must be able to satisfy
  `value_outcomes_verified_requires_human` — named person, timestamp, and what
  they attested to
- A second run. Lineage and compare. The before-and-after does not currently exist
- Record document rendered. `record_documents` is an empty table; the rendered
  artifact is the actual output of the system
- Runtime heartbeat emission. Health recomputes from a live register rather than
  the 3 August snapshot
- `_no_delete` on `heartbeat_events` and `record_documents`. Both are evidence
  substrate and both are currently deletable without trace

Test: **a real cohort can be measured end to end by someone other than the author,
and the output is a document a CFO would carry to a lender.** If that is not true,
the system is in 1.2 regardless of how many items are ticked.

Sequencing note: 1.2 should not be built speculatively. Every item exists because
a real engagement needs it. Build the write path against an actual cohort's data,
not against an assumption about what that cohort will have. Building the wrong loop
carefully is worse than building nothing.

### 2.0 Enhancements — SCOPED, NOT COMMITTED

Additive. Each assumes 1.2 works.

- Cohort roll-up, with composite confidence derived from the weakest link rather
  than averaged. Averaging launders the gaps
- Gap register as a product surface. What each missing input costs to obtain and
  what it buys in confidence. Turns a diagnosis into a decision
- Confidence model weights versioned as data, with a changelog, and every run
  recording which model version scored it. Tuning a weight currently makes every
  prior score silently incomparable
- Portfolio learning across engagements

Explicitly out of scope for all three tiers: multi-tenancy, user management,
dashboards, third-party integrations, industry packs. Named here so they are
deferred rather than quietly assumed.

---

## 1.2 roster — ratified 24 August 2026

Supersedes the 1.2 item list in the release structure section above. Every item
below came from a finding against production, not from an assumption about what
the system might need. Findings are recorded with each item.

### The governing addition

**A pack is earned, never authored.** A metric enters an industry pack only when
it has been sourced from a named institution's own system of record, and it
carries that provenance for as long as it remains canonical. Promotion requires a
stated threshold set in advance. Demotion must exist — a pack that cannot lose an
argument accumulates stale truth.

This is Cathedral law, not an LVRF rule. It governs CVAF's industry packs equally,
and CVAF's EPC pack should be audited against it: was it earned, or authored?

Consequence: benchmarking is not a separate feature. A benchmark is a read of the
earned pack with the provenance chain attached. Removed from the 2.0 roster.

### 1. Gate coverage — the AI-assisted assessment hole

FINDING, 24 August. `lvrf_block_ai_actual` checks `evidence.ai_sourced`. It does
not traverse `evidence.assessment_id`. The single assessment on production carries
`ai_assisted = true`, score 3.400 on a 0-5 scale, and one evidence row references
it. An AI-assisted capability score can therefore reach a measured actual through
a path the gate does not inspect.

Not live: the assessment is `status = draft` and the run is refused at VERIFY.
Nothing false has been published. The wall is real; it has a side door.

Related: no column records vendor publication. Skillsoft's own Curia case study
reports 102,584 accesses, 8,487 badges, 5,282 learning hours for Jan-Jun 2023 —
all consumption, all vendor-published, none independently verified. That evidence
cannot currently be loaded honestly.

Fix — one rule, three doors, AMENDMENT-005 Article I already covers all of them:

  Evidence may not support a measured actual when it is AI-sourced, when it
  derives from an AI-assisted assessment, or when its only provenance is
  vendor publication.

Requires: extend the trigger to follow `assessment_id`; add `vendor_published`
to `evidence`.

NOT a finding — already correct: `evidence_ai_requires_query` forces AI evidence
to record its query and tool. `evidence_ai_verify_requires_resolution` forbids
marking AI evidence source-verified until its citation resolves. Deep Research
governance is already enforced at the schema. Nothing to port from CVAF.

### 2. Account Inputs — the external entry point

There is no way to enter an account. Customer Zero was seeded by `walkSpine.ts`,
not entered. Without this the external process has no beginning.

Carries: institution, industry, and capability baselines written to `assessments`,
which is the existing and correct mechanism — `learner_person_id`, `capability_id`,
bounded score, named assessor, `ai_assisted` flag, and `evidence.assessment_id`
already links an assessment to a value claim. Maps to Skillsoft Skill Benchmarks.

### 3. capability_metric_links — the missing edge

FINDING. A value lever already exists as a path: `offerings` ->
`offering_capabilities` -> `capabilities`, and `value_outcomes` links capability
to `business_metrics`. What is missing is the standalone edge capability ->
business_metric. Without it the linkage can only be asserted inside a specific
value outcome; it cannot be queried in reverse to assemble a solution mix.

Do NOT add a lever entity. Add the edge:

  capability_metric_links
    capability_id, business_metric_id
    institution_id      -- sourced from whom
    data_class          -- sourced / derived / asserted
    source_verified
    evidence_id         -- what backs it
    promoted_at         -- null until it earns pack status

`institution_id` set with `promoted_at` null is an account fact. Promotion across
enough institutions makes it canonical, carrying its sources. The industry pack is
a view over this table, not separate structure. No pack format is required.

### 4-10. The write path

- Evidence writes through the gate. Constraints and triggers fire on real input
- Verifier attestation. Something must satisfy `verified_requires_human`
- Second run and compare. Curia as the worked external example
- Executive output rendered. `record_documents` exists, is empty, and is the
  actual deliverable of the system
- Runtime heartbeat emission. All ten events carry the identical timestamp
  2026-08-03 04:41:31.405125. The model is an instrument; the register is a
  photograph
- `_no_delete` on `heartbeat_events` and `record_documents`. Both are evidence
  substrate and both are currently deletable without trace
- Catalog refresh against Skillsoft's current line: Percipio, Skillsoft Coaching,
  Codecademy for Enterprise, CAISY simulations, ICF-aligned AI Coach, LX Design
  Studio, Skill Benchmarks, Aspire Journeys, Content Marketplace. Four solution
  lines. Instructor-led training still appears under Products pointing at Global
  Knowledge, divested July 2026. Each offering needs an honest `evidence_class` —
  most learning products can produce consumption evidence only

### Explicitly not in 1.2

Lever entity (the edge suffices). Pack format (a view suffices). Financial
modelling — LVRF's differentiator is refusing numbers evidence cannot carry, and
CVAF's financial engine remains unbuilt; if LVRF ever models money the model must
be gated by confidence and render the refusal below threshold. Benchmarking (now a
read of the pack). Multiple industries — one only, biotech/pharma CDMO, worked
through Curia, following CVAF's EPC reference-implementation pattern. Abstraction
comes after the second industry, not before.

### Studios and Compass OS

Studios are the Chapels. Compass OS is the substrate every Studio runs on, and
HB-0010's producer is already recorded as Compass while HB-0012 names CVAF, LVRF,
Compass and the Executive Portal as consumers. The register anticipated this
architecture and has never fired.

Industry Packs, Deep Research, the benchmarking corpus and any financial model are
Compass OS concerns inherited by both Studios — not features copied into each. Three
times this month a repo artifact and a deployed artifact were free to diverge
silently (client bundle, backup script, Caddyfile). Copying CVAF implementations
into LVRF would institutionalise that failure. Where LVRF needs a Compass concern
before Compass exists, it declares the seam and stubs it returning UNMEASURED —
never a plausible default.

### Unused tables — decided, not abandoned

- `assessments` — 1 row, written by walkSpine.ts:576, emits a heartbeat. This is
  the capability baseline mechanism. Load-bearing. See item 2
- `stewardship_returns` — 1 row, written by walkSpine.ts:790. Spine stage 07,
  RETURN. Load-bearing, currently awaiting verification
- `reflections` — 0 rows, no code path. The only genuinely unused table. Retained:
  `reflection_evidence` holds a foreign key to it and `lvrf_block_delete` guards it

---

## Correction and 1.2 item 1 closed — 24 August 2026

### CORRECTION: the trigger count is 46, not 41

Every prior statement of 41 in this file is wrong, including the Foundation
inventory and the heartbeat register section. Production was running FIVE FEWER
triggers than db/hardening.sql declared:

  value_runs_audit
  value_runs_touch
  value_runs_no_delete
  record_documents_audit
  record_documents_no_delete

They were created for the first time when hardening.sql was applied on 24 August.
Until that moment:

- `record_documents` — the executive output table, the artifact a CFO would hold —
  had no audit trail and no delete protection
- `value_runs` — the table Customer Zero *is* — had no audit trail and no delete
  protection

Nothing was lost. Four rows exist across both tables and no writes were made
outside the seed walk. But production held less governance than its own definition
claimed, for three weeks.

### How the divergence check missed it

On 23 August the check counted 11 literal CREATE TRIGGER statements plus a loop
over 13 governed tables at 3 triggers each: 11 + 39 = 50, less the 9 explicit
statements that duplicate loop coverage, reconciling to 41 — which matched the
database exactly. The conclusion drawn was "no divergence."

The arithmetic reconciled by coincidence. Five explicit CREATE TRIGGER statements
below the loop had never been applied, and the count still landed on the number
production happened to hold.

METHOD NOTE, worth more than the corrected number:

  A count that reconciles is not proof the right things are present. Compare
  lists, not totals. The full trigger list is the only valid check.

The correct form:

  psql -At -c "select tgrelid::regclass, tgname from pg_trigger
               where not tgisinternal order by 1,2;" > /tmp/db.txt
  # then diff against the triggers hardening.sql actually declares

### 1.2 item 1 — CLOSED

The gate now covers four doors, verified live on production 24 August.

Delivered in three parts, in order:

1. Backup by hand first — lvrf-20260824-022447.dump, 270404 bytes, 299 TOC
   entries, validated by the DEFECT-004 fix. First schema change since that
   fix; it earned its keep.

2. Migrations 0010 and 0011 (commits 1120547, 46d35b1):
   - `vendor_publication` added to the evidence_kind enum, beside public_filing
   - `simulated` boolean added to evidence, NOT NULL DEFAULT false
   - Backfill: simulated = true where provenance LIKE '[SIM]%'. Two rows on
     production. The '[SIM]' prefix was NOT stripped — the column is what the
     gate reads, the prefix is what a human reads in a raw query, and editing
     existing provenance text is not something this system does
   - Split into two files so the enum add can commit alone. Note recorded in
     0010: drizzle-kit migrate wraps ALL pending files in one outer transaction
     (verified against drizzle-orm/pg-core/dialect.js), so the split does not
     isolate the enum on a combined run. It is safe here only because nothing in
     0011 references the new value

3. lvrf_block_ai_actual extended (commit eacea23). One function, one LEFT JOIN,
   four cases, each raising its own message so the reason is named:

     Evidence may not support a measured actual when it is AI-sourced, when it
     derives from an AI-assisted assessment, when it is simulated, or when its
     only provenance is vendor publication.

   AMENDMENT-005 Article I on all four. ERRCODE = check_violation. Function and
   trigger names unchanged.

Verified by rollback test:

  begin; update value_outcome_evidence set supports='actual'
  where supports='actual'; rollback;

  ERROR: LVRF: evidence from an AI-assisted assessment may not support a
  measured actual. AMENDMENT-005 Article I.

### Consequence: production holds two rows the rules now forbid

Both value_outcome_evidence rows supporting `actual` are simulated; one is also
from an AI-assisted assessment (score 3.400 on 0-5, ai_assisted = true, status
draft). The trigger is BEFORE INSERT OR UPDATE, so existing rows are not
re-validated and nothing errors at rest.

Nothing false is published: the run is refused at VERIFY, sharing is disabled,
and the simulation banner discloses the boundary.

RESOLUTION: not surgery. The second run supersedes the first. `value_runs` already
carries supersedes_run_id and superseded_by_id, and value_runs_immutable protects
a locked run precisely so supersession is the only available move. Run 1 remains
an honest record of what the system held before the rule existed. This is roster
item 6, unchanged.

Supersession of the evidence rows themselves was considered and rejected: there is
no replacement to supersede them WITH (one row's own provenance states that
Skillsoft has not reported Q2 FY2027 and the figure does not exist), and
value_outcome_evidence has no superseded_by_id to use.

### New finding: value_outcome_evidence is ungoverned

It carries the link between evidence and a value claim and holds exactly one
trigger — the gate. No audit, no delete block, no touch.

It CANNOT be added to the governed array as it stands. It is a bare composite-key
join: value_outcome_id, evidence_id, supports. No `id`, no `updated_at`. lvrf_audit
writes NEW.id and lvrf_touch writes NEW.updated_at, so attaching them would error
on every write to the table — breaking the write path in the change meant to
protect it.

This is DEFECT-003's territory: four composite-key tables uncovered by governance,
deferred since July. Governing them requires a schema migration, not a hardening
edit. The deferral was correct.

### Second new finding: `supports` is free text

value_outcome_evidence.supports is `text`, not an enum, defaulting to 'baseline'.
The gate compares NEW.supports <> 'actual'. A typo — 'Actual', 'actuals' — skips
the gate silently. Added to the 1.2 roster.

### Roster item 5 is already built — remove it

value_outcomes_verified_requires_human demands verified_by_person_id, verified_at,
AND source_verified = true, together. The columns exist, the pairing is enforced,
the foreign key resolves to a real person. Attestation is not missing; a caller is.
That is part of the write path, not separate work.

---

## Corrections and verification discipline — 24 August 2026

### CORRECTION: the catalog was never on production until tonight

The Foundation inventory lists "Skillsoft catalog: 12 offerings, 8/8 constraint
proof, 22/22 gate tests" as complete and verified. Foundation describes
PRODUCTION. Production had zero offerings until 24 August.

What was true: migration 0005 creates the offerings table and its constraints,
and those were applied. The constraint proof is real. What was false: the twelve
rows. They existed only in the local development database, from a seed that was
never committed to the repository. `grep -c "INSERT INTO"` on migration 0006
returns 0 — no migration ever inserted them.

Now resolved. server/seed/seedOfferings.ts commits the catalog, and it has been
applied to production:

  12 offerings present, 12 audit rows, all attributed to a real person
  Idempotent — second run reports 0 inserted, 12 already present, audit count
  unchanged at 12
  Tenant resolved by name, not by id. Local tenant is
  e30917e8-6593-45eb-8036-03a62aa6d9e7; production is
  20b625bc-3c67-4238-9ccd-1e5cafe7f896. A hardcoded id is portable to exactly
  one database and is a bug in every other

Catalog shape, for the record: evidence_class is 6 assessed, 4 demonstrated,
1 consumption, 1 none. verification_source is 7 vendor_platform, 2 human_observer,
1 customer_system, 1 third_party, 1 none. ALL TWELVE carry
evidence_ratification = 'unratified' — nobody has audited these evidentiary
claims, and the schema says so.

Open question, not a defect: six offerings claim `assessed` or `demonstrated`
while verifying through `vendor_platform` — the vendor's own telemetry. Telemetry
can establish that a capability was delivered. It cannot establish an outcome;
that comes from the customer's system of record, which is what
lvrf_block_ai_actual already enforces. The catalog is left as-is deliberately:
the gate refuses at the point of use, and the refusal is the product. Weakening
the catalog pre-emptively would hide the question rather than answer it.

`global_knowledge_ilt` remains market_status = 'active' despite the July 2026
divestiture. Retiring it is a deliberate change, not a seed decision. Per
migration 0006's own comment: 'retired' means the vendor stopped selling it and
the fact stays citable; deleted_at means the row was created in error.

### The pattern: four record-versus-reality gaps in one week

1. The client bundle. Twenty days of committed client work undeployed, because
   the root build script only ever compiled the server
2. Five triggers. value_runs_audit, value_runs_touch, value_runs_no_delete,
   record_documents_audit, record_documents_no_delete — declared in
   hardening.sql, never applied
3. The trigger count. Recorded as 41, actually 46, and the divergence check that
   should have caught it reconciled by coincidence
4. The catalog. Recorded as verified on production, existed only on a laptop

Every one was found by LOOKING, not by reading. Three of the four were repeated
back as verified fact in working documents, and the catalog claim reached a
document titled "claims-to-evidence ledger" in a row marked Built.

### VERIFICATION DISCIPLINE — applies to this file from here

This document is authored prose describing a system. That is precisely the
condition DEFECT-E describes, one level up. The fix is the same one applied to
evidence: a claim carries its provenance or it is not a claim.

From this entry forward, every assertion in the Foundation inventory or any
status section must carry:

  - The DATE it was last verified against production
  - The COMMAND that verified it

An assertion without both is a belief, not a record. Beliefs are fine — they
just have to be marked as such, the same way `asserted` is a valid data_class.

And the method note from the trigger-count correction still governs:

  A count that reconciles is not proof the right things are present.
  Compare lists, not totals.

### Verified state, 24 August 2026

  offerings                12   psql -At -c "select count(*) from offerings;"
  offerings audit rows     12   psql -At -c "select count(*) from audit_log
                                where table_name='offerings'
                                and actor_person_id is not null;"
  non-internal triggers    49   psql -At -c "select tgrelid::regclass, tgname
                                from pg_trigger where not tgisinternal
                                order by 1,2;" | wc -l
  value runs                1   customer_zero, 30.0 / low / 88.3 / watch
  persons                   5   1 real, 4 simulated = true
  evidence                  4   2 simulated = true
  heartbeat events         10   all timestamped 2026-08-03 04:41:31.405125
  audit_log rows           42+  6 null-actor, all from migrations 0011 and 0012

---

## First account measured end to end — 24 August 2026

The write path ran on a real account for the first time. Every link entered
through an endpoint, attributed to a real person, with the basis stated at
capture. Nothing seeded.

### What was built

**server/routes/offeringAttachment.ts** — POST /api/institutions/:id/offerings.
Attaches a tenant-level offering to an account and creates the account's
capability. This is the link that makes an account's capabilities exist at all;
before it, offering_capabilities was empty and capabilities could not be created,
which is why accountInputs.ts had an unreachable assessments branch.

The stated basis is REQUIRED and is written as an evidence row — kind
'observation', confidence 'low', source_verified false, provenance naming the
asserting person. An unexplained link is the authored-prose problem this system
exists to prevent. The basis is not validated for content: a weak basis is
visible, a missing one is not. Judging quality is what evidence_ratification is
for.

**server/routes/institutionInputs.ts** — POST /api/institutions/:id/inputs.
Adds persons and assessments to an institution that ALREADY EXISTS.
accountInputs.ts is create-only and 409s on a duplicate name, so there was no way
to add to an account. This had been worked around by hand twice, putting rows in
production that no code path could reproduce — the same failure class as the
offerings seed that lived only on a laptop.

Capabilities are deliberately NOT creatable here. They arrive by attaching an
offering. ai_assisted is required and never defaulted: a default would have the
system assert a human scored something when nobody said so.

### Verified on production

  institutions              2   Skillsoft (is_tenant_self), Curia
  offering_capabilities     1   skillsoft_leadership_development_program ->
                                "New manager effectiveness", is_primary
  capabilities              2   1 at Curia, owner named
  assessments               2   Curia baseline: 2.000 on 0-5, ai_assisted false,
                                status draft, assessor Brad Piver (unaffiliated),
                                learner Brad Piver (external analyst of record)
  evidence                  6   includes the Curia case study as
                                kind = 'vendor_publication'

### The gate refused, on real data

Attempting to make the Curia case study support a measured actual:

  ERROR: LVRF: vendor-published evidence may not support a measured actual.
  AMENDMENT-005 Article I. The actual comes from the customer's system of record.

That door was added on 23 August specifically because the Curia study is this
shape. It now works on the real thing. Note what the refusal does NOT say: it does
not say no value was created at Curia. It says this evidence cannot support that
claim. Those are different statements and keeping them apart is the discipline.

### Findings

**A capability owner must be a person at the account.** capabilities.owner_person_id
is NOT NULL with an FK to persons. Correct for a real engagement — a capability
owned by the vendor is one the customer never agreed to. But Curia has no people,
and inventing a synthetic one is refused by both the middleware and
lvrf_block_simulated_attestor. Resolved by creating a real, non-simulated person
row named "Brad Piver (external analyst of record)" with the title stating plainly
that this is not a Curia employee. The name carries the qualifier because
full_name is what a human reads in a raw query — same reasoning as retaining the
'[SIM]' prefix beside the simulated column.

This is the system correctly refusing to let a reference example impersonate an
engagement.

**The create-only pattern appeared three times** — account inputs, adding a
person, adding an assessment. That was one missing endpoint shape, not three
gaps. institutionInputs.ts closes it.

**Curia has no value outcome.** value_outcomes holds one row, Skillsoft's. So
evidence cannot be attached to a Curia claim at all — the gate test above had to
use a deliberately wrong pairing to fire. business_metrics and value_outcomes
have no entry point: the middle of the spine (attach, model, commit) exists only
in walkSpine.ts. This is the next build item and the largest remaining gap.

**Local has diverged further from production.** Local now carries 29 value runs,
11 customer_b rows, the 12 offerings, and Northgate Utilities fixtures created
during endpoint testing — a capability, its evidence row, a person, an assessment.
Governance forbids hard deletes so they persist. Production is clean. A clean
local render continues to prove nothing about production.

**Local was three migrations behind** (0010-0012 unapplied), which made
actorContext's own persons.simulated lookup fail and surface as a 500 in the new
endpoint. Backed up and migrated. Worth checking migration parity before
attributing a failure to new code.

Provenance of this entry: all production counts and the gate refusal above were
executed against srv1862778 via psql as postgres and curl against 127.0.0.1:3001,
24 August 2026, in a session separate from the one that authored this file. The
authoring session ran only against the local dev database and could not attest to
the production figures — flagged by that session rather than silently asserted.

---

## Roster cut to four — ratified 25 August 2026

Supersedes the 1.2 roster of 24 August. Nothing below is a reversal of that
analysis; the scope changed because the destination changed.

### Why the cut

If LVRF is rebuilt on Skillsoft's stack and owned by Skillsoft, then what is
being built here is a REFERENCE IMPLEMENTATION — a working specification that
proves the method is real and shows what to rebuild. Not a product.

What transfers: the schema, the constraints, the trigger functions, the
confidence model, the health model, the evidence taxonomy, the migration
sequence. All of it expressible as a spec another engineering org implements.

What does not transfer: the React client, the emblem, the visual hierarchy, the
deploy script, the polish items. Skillsoft has an engineering org and its own
conventions. Every hour spent there is an hour on something that gets discarded.

THE TEST, from here: build only what proves a claim that would be made out loud.
If an item does not change what can be demonstrated or handed over, it is
deferred — named, not dropped.

### The four

**1. Value outcome and business metric entry**
The middle of the spine — attach, model, commit — exists only inside
walkSpine.ts. Curia has a capability, a baseline and evidence, and nothing to
attach a claim to; the gate test on 24 August required a deliberately wrong
pairing to fire. This is also the industry-to-metric link, which is the entire
content-to-solutions argument.
PROVES: that a value claim can be stated and bounded before it is evidenced.

**2. Verifier attestation with a caller**
value_outcomes_verified_requires_human refuses today and nothing in the system
can satisfy it. A gate that can only refuse proves half the point. The other
half is that it opens for a named, real, non-simulated human and for nothing
else.
PROVES: that the refusal is a gate rather than a wall.

**3. A second run**
value_runs already carries supersedes_run_id and superseded_by_id, and
value_runs_immutable protects a locked run so that supersession is the only
available move. One run proves the record works. Two prove measurement works,
and the before-and-after is what is actually being sold.
PROVES: that change over time can be shown without editing history.

**4. capability_metric_links with promoted_at**
A metric enters an industry pack only when sourced from a named institution's
own system of record. institution_id set with promoted_at null is an account
fact; promotion across enough institutions makes it canonical, carrying its
sources. The pack is a view over this table, not separate structure.
PROVES: packs earned, not authored — the claim that separates this from every
industry pack on the market.

### Deferred — named, not dropped

- Executive output renderer. record_documents exists and is empty
- Runtime heartbeat emission. All ten events still carry the 3 August timestamp;
  the model is an instrument, the register is a photograph
- `_no_delete` on heartbeat_events and record_documents
- value_outcome_evidence.supports is free text where the gate compares against
  'actual'. A typo skips the gate silently
- The LVRF emblem's metallic gradient, off-system. "STUDIO" and the trademark
  mark still absent from the record
- Raw ISO timestamp on the index; asset PNGs outweigh the JS bundle
- DEFECT-003: four composite-key tables ungoverned, including
  value_outcome_evidence and offering_capabilities

Two of these are answerable in a sentence rather than a build. Runtime heartbeat
emission and the record document are both "known, deferred, here is the design,"
which is a sufficient answer from someone who wrote down why.

### The standing constraint on item 1

What a CDMO's money turns on — audit outcomes, batch reliability,
time-to-productivity — is inference from the industry, not sourced from Curia.
The endpoint must FORCE that classification rather than permit it. An asserted
metric is honest. An asserted metric that reads as sourced is the failure the
whole system exists to prevent.

---

## Item 1 closed — the spine has a middle — 25 August 2026

**server/routes/valueOutcomes.ts** — POST /api/institutions/:id/value-outcomes.
Creates an engagement, a business metric and a baselined value outcome in one
transaction. Before this, attach/model/commit existed only inside walkSpine.ts
and Curia had no claim for evidence to attach to — the 24 August gate test
required a deliberately wrong pairing to fire.

### Verified on production

  engagement        c47d075f  "Curia — reference example, not an engagement"
  business metric   e6c42f98  Time to full productivity, newly promoted manager
                              unit days, direction decrease
  value outcome     bf6f5b2d  baseline / claimed / low / source_verified false
                              baseline 180.0000 days, measured 2023-01-01

Nothing targeted, measured or verified. The record says so.

### The gate refused, on the right pairing

Curia's own published case study offered as the actual for Curia's own outcome:

  ERROR: LVRF: vendor-published evidence may not support a measured actual.
  AMENDMENT-005 Article I. The actual comes from the customer's system of record.

That is the content-to-solutions problem in two commands. The vendor has
published numbers about this account; the system will not let them stand as the
outcome. What would stand is a figure from Curia's HRIS — which nobody
collected, because nobody decided in advance what to measure.

### Finding: silent metric reuse was a provenance hole

business_metrics has a unique constraint on (institution_id, name), so the
endpoint must find-or-create. The first implementation, per spec, used the found
row's identity and discarded the rest of the payload silently.

That is a provenance failure hiding in an idempotency decision. A caller posting
the metric name with source_system "Curia HRIS, extracted 2026-08-25" against a
stored row reading "ASSERTED — not sourced from any Curia system" would have had
an outcome created against a metric whose origin is not what they believe it to
be. No error, no warning. Exactly what the NOT NULL on source_system exists to
prevent.

Three options, only one safe: updating rewrites provenance, ignoring conceals it,
refusing preserves it.

Now: on a found metric, unit, direction and source_system are compared
field-by-field. Any mismatch returns 409 with a mismatches array carrying field,
existing and submitted, and the request stops — no update, no outcome created.
Verified live; all three fields reported, count unchanged at 1.

### Schema notes worth keeping

- business_metrics.source_system is NOT NULL. Every metric names its origin
  before it exists. The endpoint additionally rejects blank or trivially short
  values: an unstated origin is the failure this system exists to prevent
- metric_direction is `increase` | `decrease` only. The enum cannot express
  whether a direction is good — `decrease` on audit findings is good, on
  retention is not. The metric NAME must carry that meaning
- value_outcomes requires baseline_value and baseline_measured_at NOT NULL. An
  outcome cannot be created empty and walked forward. The baseline stage is
  load-bearing
- claimed_currency_impact is deliberately not set at creation:
  impact_requires_basis would demand a basis, and no basis exists at baseline
- engagements.tenant_id resolves from the institution, never the payload

### Standing caveat on the Curia figures

Baseline 180 days is INFERRED from the published story, not sourced from Curia.
The source_system field says so in full, names what would replace it (Curia HRIS
or performance management), and states that Curia has not participated. The
metric is honest about being asserted. That is the distinction the whole system
turns on.

### Cut roster remaining

2. Verifier attestation with a caller
3. A second run
4. capability_metric_links with promoted_at

Provenance of the entry above: executed against srv1862778 via curl to
127.0.0.1:3001 and psql as postgres, 25 August 2026, in a session separate from
the one that authored this file. The authoring session ran only against local dev
and flagged that it could not attest to the production figures rather than
silently asserting them.

---

## Item 2 closed — the walk is enforced — 25 August 2026

**server/routes/outcomeWalk.ts** — two endpoints advancing a value outcome
through realization_status (claimed | measured | verified | not_realized).

  POST /api/value-outcomes/:id/measure   claimed  -> measured
  POST /api/value-outcomes/:id/verify    measured -> verified

Before this, value_outcomes_verified_requires_human refused and nothing in the
system could satisfy it. The gate was a wall. It is now a gate: it opens for a
named, real, non-simulated person belonging to the institution, and for nothing
else.

### Two preconditions the schema could not enforce

**1. Measuring requires admissible evidence.**
value_outcomes_measured_requires_actual demands only that actual_value exists.
lvrf_block_ai_actual fires on value_outcome_evidence, not on value_outcomes — so
an actual could be written with no admissible evidence behind it at all. The wall
would have had a door beside it, the same shape as the AI-assisted assessment
hole found on 23 August.

/measure now refuses unless at least one value_outcome_evidence row already
exists for the outcome with supports = 'actual'. Enforced in the application
because the schema cannot express it.

**2. A verifier must belong to the institution.**
The constraint requires a named person. It does not require that person to be AT
the institution — so a vendor could verify its own claim, which is the conflict
this role exists to remove. /verify refuses a verifier who does not belong to the
outcome's institution, or who is simulated.

The ACTOR who makes the write and the PERSON who attests are recorded separately:
actor via the audit trigger, verifier in verified_by_person_id. Different roles,
possibly different people.

### Verified on production — Curia is correctly stuck

  POST /measure  -> 422
  "no admissible evidence supports an actual for this outcome. AI-sourced,
   AI-assisted, simulated and vendor-published evidence are refused by
   lvrf_block_ai_actual, so an outcome with no admissible evidence cannot be
   measured."

  POST /verify   -> 409
  "value outcome bf6f5b2d... is not 'measured' (currently 'claimed');
   cannot verify"

FOUR independent mechanisms agree, none aware of the others: the evidence
taxonomy classified the case study as vendor_publication; lvrf_block_ai_actual
refuses to link it as an actual; the application precondition refuses to measure
without one; the state guard refuses to verify without a measurement.

Curia is not blocked by a missing feature. It is blocked because the only
evidence in existence is the vendor's own marketing and nobody at Curia has
measured anything. Unsticking it requires exactly two things: one figure from
Curia's HRIS, and one person at Curia willing to put their name to it.

### Finding: `supports` is free text and only three values are understood

value_outcome_evidence.supports is text, defaulting to 'baseline'. The verify
endpoint writes an attestation evidence row and needed a supports value for it.
A grep of walkSpine.ts and confidenceModel.ts confirms the consuming code handles
only 'baseline', 'actual' and 'impact_basis'. Writing 'attestation' would create a
row the confidence model silently ignores — worse than a slightly wrong label.

The endpoint therefore checks SELECT DISTINCT supports at request time and only
uses 'attestation' if some other write has already established it; today it always
resolves to 'impact_basis'.

This compounds the already-logged hole that a typo in `supports` skips the gate
entirely. The field wants to be an enum. Still deferred, now with a second reason.

### Deliberate no-ops, documented rather than invented

- `note` on /measure is type-validated and not persisted. value_outcomes has no
  column for it and inventing an evidence row nobody asked for would be worse
- evidence.attested_by_person_id and attested_at ARE set on the verify evidence
  row, from the verifier. The columns exist with
  evidence_attestation_is_complete requiring both together; leaving them null
  would mean an attestation whose attestor is only discoverable by joining back
  to value_outcomes

### Cut roster remaining

3. A second run
4. capability_metric_links with promoted_at

---

## Roster revised — the two axes — 25 August 2026

### The correction

Two independent axes were being collapsed into one.

  REALIZATION — did the value happen?
    claimed | measured | verified | not_realized

  EVIDENCE — how well do we know?
    confidence, computed from the ledger across six weighted factors

An Outside-In value hypothesis is `realization = claimed` with `confidence = low`.
That is a COMPLETE, LOCKABLE, DEFENSIBLE state — not a failed attempt at
`measured`.

The 25 August conclusion that "Curia is stuck" applied the realization axis to
something that lives on the evidence axis. Curia does not need to be measured. It
needs to be locked as a hypothesis and later relocked as validated. Movement along
the EVIDENCE axis while realization stays put is the actual product motion — and
it is the motion already proven on the CVAF side across Southern Glazer's,
Carhartt, OmniOn and MGP, all built from public filings before any customer
conversation.

### What the schema already supports

More than assumed. Validation is not an update, it is SUPERSESSION:

  business_metrics.superseded_by_id   asserted metric -> sourced metric
  value_outcomes.superseded_by_id     outcome -> outcome pointing at the new metric
  value_runs.supersedes_run_id        hypothesis run -> validated run
  value_runs_immutable                a locked run cannot be edited, so
                                      supersession is the only available move

Run 1 survives intact as the record of what was believed before the customer said
otherwise. That is the point.

### Revised items

**3. Lock a run from an engagement**
The missing entry point. walkSpine.ts produces runs for Customer Zero and nothing
else can. Confirmed feasible without refactor: computeHealth() in healthModel.ts
and the confidence model are pure standalone exports taking inputs and returning
results — no database, no walk. Locking a run is: load the engagement's outcomes
and evidence, feed the two models, insert a value_runs row.
A hypothesis run is FIRST-CLASS. terminal_value_stage reflects how far the
outcomes actually got; source_fixture records the provenance mode; confidence
comes out low and honest.
Open decision: does locking at `claimed` require the run to STATE that it is a
hypothesis, or is low confidence sufficient? Recommendation: require the
statement. source_system already forces it on the metric.

**4. capability_metric_links with promoted_at**
Unchanged. Small. Packs earned, not authored.

**5. Validate and supersede**
Replace an asserted metric with a sourced one, supersede the outcome, keep both.
This is the customer conversation expressed in software.

**6. Compare two runs on CONFIDENCE, not value**
Same claim, better evidence. The delta is how much more of this can now be
defended. Nobody demos a confidence delta.
Note: CVAF built compare-runs and then deliberately STOPPED persisting the
result — comparisons between two locked, immutable runs are deterministic and
reproducible on demand, so persisting them was accumulation with no benefit. That
reasoning transfers; do not persist.

### Why this is the right direction

The system was never missing the ability to research. It was missing a lawful
destination for a hypothesis. Outside-In has always been a value hypothesis with a
locked baseline; LVRF already had data_class, a NOT NULL source_system, computed
confidence, and supersession. What it lacked was a run that could hold one.

---

## Item 3 delivered, and six client type defects — 25 August 2026

### server/routes/produceRun.ts

POST /api/engagements/:id/produce-run. Produces a value_runs row from live data.
walkSpine.ts did this for the Customer Zero fixture and nothing else could.

Feasible without refactor because computeHealth(), computeConfidence() and
computeDelta() are pure standalone exports taking plain data. ConfidenceInput is
booleans, an evidence array, two nullable numbers and two names — nothing
fixture-shaped. The payload is a flat snapshot of ONE outcome, reproduced in the
same field order as walkSpine so payload_hash is comparable.

Named /produce-run, not /lock. locked_at, locked_by_person_id and lock_reason are
a separate mechanism protected by value_runs_immutable; walkSpine's own insert
never sets them. Producing a run and locking it are two acts, and collapsing them
was an error in the original spec.

Deliberately does NOT emit heartbeat events. walkSpine calls buildHeartbeatPlan
and that sequence is tied to the fixture walk; a guessed or partial sequence would
corrupt the health register, which is the instrument. Consequence: a produced run
reports institutional health as UNMEASURED with 0% coverage. That is honest, and
it is why the Rail crashed — see below.

Conservative defaults where no live column exists:
  metricDefinitionConfirmed  hardcoded false
  impactIsInference          hardcoded true
Absence of proof scores as absence of proof. But this means EVERY live run
permanently forfeits the 20-point metric_definition_confirmed factor. That is a
missing business_metrics column, not a scoring decision. ROSTER ITEM.

### Verified on production — Curia's Outside-In hypothesis

  run 1fd8e160, run_number 1, confidence 10.0 / low
  institutional_health null, health_band null, coverage 0
  terminal_value_stage 'baseline'
  banner_title 'OUTSIDE-IN HYPOTHESIS'

Every zero on the factor list explains itself: no evidence on the baseline, no
evidence on the actual, calculation method not disclosed, sponsor synthetic,
verifier synthetic. The only credit earned is 10/10 for "no currency figure
claimed — nothing to substantiate," which is honest rather than generous.

Skillsoft at 30 and Curia at 10, same instrument, both defensible. The
difference is entirely evidence, not opinion.

### The crash: a governed null reached the client for the first time

Rail.tsx:128 rendered `{h.composite} · {h.band.toUpperCase()}`. computeHealth
returns null for both when no dimension is measured — by design, because
unmeasured is never scored zero and never assumed compliant. toUpperCase on null
threw during render and blanked the entire page.

The health model has always been able to return a null band. Nothing had ever
produced a run that did.

### ROOT CAUSE: client types were written from the fixture, not the server

client/src/types/run.ts asserted shapes the server does not produce. Six
instances found:

  1. health.composite / health.band     typed non-null; null when unmeasured
                                        THIS ONE CRASHED THE PAGE
  2. targetValue / actualValue          typed non-null; null before commit and
                                        measure. Rendered the literal "null"
  3. RunDelta                           typed as a struct; DeltaResult is a
                                        discriminated union returning
                                        { available: false }. Rendered blank
  4. claimedCurrencyImpact /
     realizedCurrencyImpact             typed non-null; nullable columns, null on
                                        Curia's live run
  5. RunEvent.valueStage                typed non-null; nullable by design for
                                        events outside a walk
  6. RunConfidence.asserted             typed non-null; ConfidenceResult declares
                                        ConfidenceLevel | null

Plus a blind spot, not a nullability defect: EvidenceItem did not declare
`simulated` or `vendor_published`, both of which produceRun writes into every
snapshot. So the evidence ledger rendered a vendor-published case study without
disclosing that it was vendor-published — the one fact the gate refused on. Now
declared and rendered.

### The limitation worth keeping

**A wrong type in this client fails silently unless a method call happens to
expose it.** The compiler flagged ZERO consumers for four of the six fields —
all were bare interpolation, which JSX accepts for null. The Rail crash was
visible only because someone called .toUpperCase().

Three defects were found by rendering, one by a blank page, none by the type
checker. A type that permits an impossible value is authored prose in the type
system.

All six now render explicit states: UNMEASURED for health, "Target not yet set",
"Not yet measured", "No stage" for an unstaged event. Never 0, never a dash,
never blank, never the literal "null". A zero would assert compliance the model
refuses to assert.

### Two more roster items from this session

- `confidenceModel.ts` isSynthetic() still keys off a '[SIM]' name prefix rather
  than the persons.simulated column. Same convention-not-a-constraint gap closed
  on evidence and persons on 24 August, still live in the confidence model. A
  person with simulated = true and no prefix would earn full credit for being
  real. Bridged defensively in produceRun by presenting such a person as
  '[SIM] ...'; the model itself is unfixed
- `business_metrics` has no column for whether a metric's calculation method is
  confirmed. Every live run therefore forfeits 20 points permanently

### The payload holds exactly one outcome

engagement, ONE capability, ONE businessMetric, one baseline. produceRun returns
422 if an engagement has more or fewer. Fine today; a real cohort will need a
different payload shape. That is a 2.0 concern, recorded here so it is not
discovered later.

### Cut roster remaining

4. capability_metric_links with promoted_at
5. Validate and supersede
6. Compare two runs on confidence, not value

### Note on the entry above

It initially claimed the valueStage fallback was complete while
HeartbeatCard.tsx:47 still rendered bare {e.valueStage}. Caught by the session
asked to append it, which checked the code against the claim rather than trusting
the document, and refused to append until they agreed. Fixed and committed
together in 6177d35, so the claim is true as of the commit that makes it.

Seventh instance this week of a record asserting a property the system lacks, and
the first authored AFTER the verification discipline was adopted three commits
earlier. The discipline works when something checks; it does not work by being
written down.

---

## Metric definition confirmation, and the first confidence delta — 25 August 2026

### The problem

confidenceModel.ts scores `metric_definition_confirmed` at 20 of 100 points,
binary. Its question is "Is the metric's calculation method known and
DOCUMENTED?" There was no live column for it, so produceRun.ts hardcoded false
and every real run permanently forfeited a fifth of the available score. Curia
scored 10 partly because a field that could legitimately be true had nowhere to
be recorded.

### Migration 0013 — two columns, not a flag

  business_metrics.definition_confirmed_by_person_id  uuid, FK to persons
  business_metrics.definition_confirmed_at            timestamptz
  CHECK business_metrics_definition_confirmation_is_complete
    — both set or neither, mirroring evidence_attestation_is_complete

Deliberately NOT a boolean. A flag someone ticks is an unbacked assertion, which
is what this system refuses everywhere else. Presence of the pair IS the flag.

No backfill. No existing metric had been confirmed by anyone, and setting one
would have fabricated the exact fact the factor measures.

### The factor now requires three things

Credit is earned only when ALL of:

  definition_notes is present and not blank
  the confirmation pair is set
  the confirming person is NOT simulated

Any one missing earns zero. A confirmation without notes documents nothing. Notes
without a confirmer are unattested. A simulated confirmer is not a person of
record — the same rule lvrf_block_simulated_attestor enforces at the database.

And the factor note now says WHICH of the three is missing, rather than only that
it failed. Observed in production across the three runs below:

  run 1  "Calculation method NOT disclosed by the source. The metric cannot be
          independently reproduced."
  run 2  "Calculation method documented, but not confirmed by a named person.
          Notes without a confirmer are unattested."
  run 3  "Calculation method documented."   earned 20

A zero reading "not disclosed" when the real problem is "nobody confirmed it"
sends a reader looking in the wrong place. The note is what someone acts on.

### The first confidence delta — verified on production

Three runs on Curia's engagement c47d075f, same claim, same 180-day inferred
baseline, no value touched:

  run_number  score  band  what changed
  1           10.0   low   Outside-In hypothesis as first locked
  2           10.0   low   migration 0013 applied, columns exist and are unset
  3           30.0   low   definition confirmed by a named real person

Run 2 is the important one. It proves that adding the columns credited nothing —
the factor reads live data and correctly earns zero when nothing is confirmed. A
jump there would have meant the model was crediting the schema rather than the
fact.

Run 3's twenty points trace to a person, a date, and a documented definition.

BAND STAYS LOW ACROSS ALL THREE. Thirty is still low, and confirming a
calculation method does not turn an inferred figure into a measured one. The
model declining to promote the band is it being right.

### Why this matters more than the feature

This is the two-axes distinction demonstrated rather than argued. REALIZATION did
not move — all three runs are realization 'claimed', terminal stage 'baseline',
health UNMEASURED at 0% coverage. EVIDENCE moved. The number rose because what is
known improved, not because a figure was adjusted.

That is the product motion: lock an Outside-In hypothesis, validate it, relock,
and the delta is HOW MUCH MORE OF THIS CAN BE DEFENDED. Nobody demos a confidence
delta.

It also means cut-roster item 6 (compare two runs on confidence) now has real data
to compare rather than needing a synthetic second run. The demo was produced while
proving a prerequisite.

### Still open from this pair of prerequisites

confidenceModel.ts isSynthetic() still keys off a '[SIM]' name prefix rather than
the persons.simulated column. Wider than it looks: ConfidenceInput carries
sponsorName and verifierName as strings, so fixing it properly changes the input
shape and touches walkSpine.ts — which is the fixture path producing Customer
Zero's 30, the run currently used for demonstration. Breaking that to fix the
model would be a worse trade. Bridged defensively in produceRun by presenting a
simulated person as '[SIM] ...'; the model itself is unfixed.

### Minor, recorded rather than fixed

Drizzle's auto-generated FK name for the new column is 64 bytes and Postgres
silently truncated it to business_metrics_definition_confirmed_by_person_id_perso
ns_id_f, dropping the trailing _fk. Second instance — stewardship_returns has the
same problem from an earlier migration. Harmless until a migration references a
constraint by its expected name. Left as generated rather than hand-naming a
one-off, so the convention stays consistent.

Provenance of the entry above: the three run scores and the migration application
were executed against srv1862778 via curl to 127.0.0.1:3001 and psql as postgres,
25 August 2026, in a session separate from the one that authored this file. That
session verified the FK truncation independently from the generated SQL — the
same fact from two sources — and flagged that it could not attest to the
production figures.

---

## Item 5 closed — supersession, and the confidence curve — 26 August 2026

### Delivery A: lvrf_supersession_is_sane

Fourteen tables carry superseded_by_id and nothing enforced what supersession
MEANS — only a foreign key. A row could point at itself, fork the chain by
claiming a successor another row already claimed, run backwards in time, or
cycle. A broken chain is worse than no chain: the chain is what makes "what did
we believe before" answerable, and it cannot fork or loop.

Four rules, each naming which one fired, applied by loop to all fourteen:

  1. not self
  2. target exists and deleted_at IS NULL
  3. target is not already superseding something else — no forked chains
  4. the target is NEWER than the row it supersedes

AMENDMENT-005 deliberately NOT cited. That amendment governs AI-sourced and
simulated evidence and who may attest. These rules are about the shape of the
supersession graph. A citation that does not apply weakens the ones that do.

Trigger count 49 -> 63, reconciled by list.

### Rule 4 was inverted, and my tests confirmed the bug while appearing to confirm the rule

The trigger fires on the row being MODIFIED, which in supersession is the OLD row
having its pointer set. So NEW is the predecessor and the looked-up target is the
successor. The original comparison required the successor to be OLDER — the
opposite of its own stated intent and its own error message. It would have
rejected every correct supersession.

Caught by the session asked to build the validate endpoint against it, which
traced what the trigger variables actually refer to rather than trusting the
comment.

THE TESTING FAILURE MATTERS MORE THAN THE BUG. Two tests were run against the
inverted trigger. One refused and one passed, and both were read as confirming
correct behaviour — because both results are equally consistent with a working
trigger and an inverted one. The pass case chosen was the wrong direction.

  A check that agrees with the expected answer is not proof the check is right.

Same shape as the trigger count reconciling by coincidence on 23 August. The
correct verification, run after the fix, was that BOTH results reversed — the
previously-refused case now passes and the previously-passed case now refuses.
A reversal cannot happen by accident.

### Delivery B: POST /api/business-metrics/:id/validate

Replaces an ASSERTED metric with a SOURCED one and supersedes the outcome that
used it. Both old rows survive. `name` is not accepted in the payload — it is
copied, because a different name is a different metric, not a validation of this
one. A caller sending one gets a 422 rather than having it silently ignored.

### Two structural collisions found by running it

**business_metrics_institution_name_key was UNIQUE (institution_id, name).**
Supersession requires two rows sharing a name — ancestor and successor. The
endpoint inserts the successor while the ancestor is still current, so both
briefly match any "current rows only" predicate. Postgres cannot defer a unique
INDEX, and a deferrable UNIQUE CONSTRAINT cannot carry a WHERE clause, so no
index formulation permits the transient state. Migration 0014 tried a partial
index and still collided; 0015 dropped it.

A metric's identity is its id. Its name is a label, and a chain of rows sharing a
label is what supersession looks like.

**The unique index had been MASKING a lookup bug.** valueOutcomes.ts:260 resolved
a metric by (institution_id, name, deleted_at IS NULL) with no superseded_by_id
filter. One live row per name meant the lookup could not be ambiguous. Remove the
constraint and it can return either the ancestor or the successor, arbitrarily —
attaching a new outcome to a superseded metric with nothing to catch it.

That was more serious than the collision that surfaced it.

### Audit: name-based lookups against governed tables

  valueOutcomes.ts:267      business_metrics   FIXED
  offeringAttachment.ts:129 capabilities       no superseded_by_id filter
  valueOutcomes.ts:324      capabilities       no superseded_by_id filter
  institutionInputs.ts:232  capabilities       no superseded_by_id filter
  accountInputs.ts:202      capabilities       no superseded_by_id filter
  accountInputs.ts:152      institutions       filters NEITHER deleted_at nor
                                               superseded_by_id

The four capabilities lookups are latent only because nothing supersedes a
capability yet — exactly the situation business_metrics was in until it wasn't.

Then a SEVENTH instance the audit missed, because the audit scoped to NAME
lookups: produceRun.ts resolves value_outcomes by engagement_id and counted a
superseded row, refusing with "has 2 value outcomes." The real rule is broader:

  ANY query resolving a governed row by something other than its primary key
  can hit a superseded ancestor.

### Verified on production — the supersession chain

  value_outcomes    180.0000 -> superseded by -> 214.0000
  business_metrics  "ASSERTED — not sourced from any Curia system"
                    -> superseded by ->
                    "Curia HRIS and performance management module"

Nothing overwritten. The Outside-In hypothesis of 180 days is still there, and
visibly wrong by 34 days. That is the record doing the one thing a record is for.

### THE CONFIDENCE CURVE — five runs, one claim

  run  score  what changed
  1    10.0   Outside-In hypothesis, first locked
  2    10.0   migration 0013 applied; confirmation columns exist, unset
  3    30.0   metric definition confirmed by a named real person
  4    30.0   metric superseded: source_system now names Curia's HRIS
  5    45.0   the HRIS extract attached as evidence and attested

TWO PLATEAUS, AND THEY MATTER MORE THAN THE RISES.

Run 2 proved that adding columns credits nothing — the factor reads facts, not
schema. Run 4 proved that a claim about provenance credits nothing without
evidence behind it: the confidence model does not score source_system. Replacing
an asserted origin with a real one changed the honesty of the metric and earned
zero, because baseline_evidence_verified scores EVIDENCE ATTACHED TO THE OUTCOME.

  Validating a metric's source is not the same as evidencing a baseline.

Run 5 earned 15 of 25, not the full weight. The factor note:

  "1 item(s): 0 independent, 1 attested. Strongest — attested by Brad Piver
   (external analyst of record)."

Self-reported customer data attested by the consultant who obtained it is better
than vendor marketing and worse than an audit. The model prices it at 60% and
names the person. That is a discount a CFO would recognise.

Band stays `low` across all five. Forty-five is still low.

A model that only ever rises when you do work is a scoring tool. One that holds
flat when you do the WRONG work is an instrument.

### Process note: five misreports in one session

Five separate claims tonight were wrong and caught only by testing:

  - rule 4 inverted, and the tests that "confirmed" it
  - three applied migrations reported as unapplied
  - a produceRun.ts fix reported as committed that was never made — the commit
    hash cited already existed from the previous turn

The last is a different class from the others: not a stale view of production,
but a claim about actions taken in its own session. The widened audit produced in
that same turn should be treated as unverified until re-run.

Every one was caught by running something rather than reading something.

### Correction to the process note above

The third bullet claimed a produceRun.ts commit was fabricated or
pre-existing. Checked against git history and false. a316495 is a
genuine commit from this session, timestamped 2026-08-25 20:41:27,
parent 9f25d94, with exactly the reported diff.

What actually happened: the fix was first reported against hash
9f25d94, which was the previous commit (the name-uniqueness drop).
grep on production confirmed the filter was absent, correctly showing
the work had not landed. The conclusion drawn — that a commit had been
fabricated — did not follow. A misreported hash and work landing a
turn later than claimed is a bookkeeping error, not an integrity one.

Four misreports that session, not five. The widened audit produced
alongside it should still be re-run before use, but on ordinary
caution rather than suspicion.

Caught by the session asked to append this, which checked git history
rather than trusting the document. Second time in two days that an
append was refused until the claim and the code agreed.

---

## Supersession filters closed — 26 August 2026

Seven queries resolved governed rows without filtering the supersession chain.
All fixed, deployed as 0ee7f18 and 257c207, verified by grep on production rather
than by report.

  accountInputs.ts:152       institutions   added deleted_at AND superseded_by_id
  accountInputs.ts:201       capabilities
  institutionInputs.ts:231   capabilities
  offeringAttachment.ts:104  offerings      NOT in the earlier audit
  offeringAttachment.ts:129  capabilities
  valueOutcomes.ts:324       capabilities
  engagements.ts:20          engagements    list query, zero consumers today

THE RULE, now stated at each site in a comment:

  Any query resolving a governed row by something other than its primary key can
  hit a superseded ancestor. Resolution by primary key is safe.

The offerings lookup was found only because the audit was re-run. The earlier
audit scoped to capabilities and institutions and never checked the catalog. Once
an offering is superseded — a product retired and replaced — attaching by
offering_key could have resolved to the ancestor.

### FINDING: institutions_tenant_name_key is a plain unique constraint

From migration 0000: CONSTRAINT institutions_tenant_name_key UNIQUE(tenant_id,
name), declared inline, no WHERE clause, never altered since.

**A soft-deleted or superseded institution permanently occupies its name.** The
constraint has no concept of deleted_at or superseded_by_id — it blocks an insert
against a dead row exactly as it would against a live one.

This is the same shape business_metrics had before migration 0015, and it will
block supersession of institutions in the same way whenever that becomes possible.
When it does, the fix is the same: drop the constraint, and let the application
enforce uniqueness among current rows.

Not urgent — no route currently sets deleted_at or superseded_by_id on
institutions.

Handled correctly in the meantime: adding the filter to accountInputs.ts:152
created an empty-result case the old code could not produce. The handler now
checks for it explicitly and returns a 409 stating that the name is held by a
retired or superseded row, rather than dereferencing an empty array or handing
back a dead row's id in a 409 that looks identical to a live conflict.

### engagements.ts:20 — filtered, with a note

Added AND e.superseded_by_id IS NULL. The endpoint has ZERO consumers today —
nothing in client/src references /api/engagements — which made this free to change
before it acquires callers.

The argument against filtering was real and is recorded here: this list has no
history or archive view to redirect anyone to, so a row that vanishes on
supersession has nowhere to be found. Filtering is correct as the house default;
a ?include_superseded=true parameter or a distinct history endpoint is the right
answer when someone needs the chain rather than the head.

Provenance of the entry above: 0ee7f18 and 257c207 were deployed via
scripts/lvrf-deploy.sh on srv1862778 on 26 August 2026, and verified there by
grep against server/routes and a curl to 127.0.0.1:3001 confirming the 409 path
resolves to a live institution_id. The session that authored this entry had no
SSH access to that box and flagged that it could not attest to the production
claims rather than silently asserting them.

---

## Lock endpoint, and the runs that were never immutable — 29 August 2026

### The gap

`value_runs` carries `locked_at`, `locked_by_person_id` and `lock_reason`, and
`lvrf_locked_run_immutable` has existed since early hardening. **Nothing in the
system ever set them.** Every run produced to date was editable, including the
Customer Zero record shown externally since the first screenshot, and the five-run
Curia sequence being used to demonstrate the confidence curve.

The trigger had never fired.

Found during item 6 recon, checking whether the "comparisons between locked
immutable runs are deterministic, so do not persist them" argument actually held.
It did not — because nothing was locked.

### server/routes/lockRun.ts

`POST /api/value-runs/:runId/lock`. Sets the three fields; `locked_by_person_id`
comes from the actor header, never the payload. 404 if missing, 409 if already
locked with the existing locker named.

**The trigger permits its own first write.** `lvrf_locked_run_immutable` opens with
`IF OLD.locked_at IS NULL THEN RETURN NEW` — it keys on the row's PRIOR state, so
locking passes and every subsequent update is caught. Locking is a one-way door
that closes behind itself. This was checked before the handler was written; had it
guarded on `NEW.locked_at`, the endpoint would have refused its own first write.

**Race guard added beyond spec.** The `UPDATE` carries
`WHERE ... AND locked_at IS NULL` with its own 409 on zero rows. Without it, two
concurrent lock requests could interleave between the `SELECT` check and the
`UPDATE`; whether the trigger caught the second depends on transaction
serialisation. A conditional update is atomic. "Might, depending on ordering" is
not a guarantee.

### Verified on production

Six runs locked — Customer Zero and the five Curia runs. Re-lock refused with 409.
Then the trigger, firing for the first time since it was written:

```
update value_runs set confidence_score = 99 where id = '48b8a997...';

ERROR:  LVRF: value_run 48b8a997-592c-460b-8b05-6089e64fc34b is locked and
        immutable. Relock by creating a new run that supersedes it — do not
        edit history.
```

---

## Item 6 closed — compare two runs on confidence — 29 August 2026

### server/routes/compareRuns.ts

`GET /api/value-runs/:baselineRunId/compare/:comparisonRunId`.

**It persists nothing, and now has grounds to.** Both runs must be locked;
`lvrf_locked_run_immutable` makes a locked run unchangeable; a comparison between
two immutable rows is deterministic and reproducible on demand. Storing it would be
accumulation with no benefit. CVAF built a persisted compare and deliberately
reversed it for this reason — that reasoning transfers, and as of the lock endpoint
above it rests on the actual state of the data rather than on intent.

Refuses rather than compares: 404 on a missing run, **409 if either run is
unlocked** — a comparison against a mutable row is a snapshot of something that can
still change — 422 on the same id twice, 422 across engagements. That last one
matters: two runs on different engagements are two different claims, not one claim
at two moments.

Returns confidence delta with bands, a factor-by-factor diff joined on the `factor`
key ordered by delta then weight, health with UNMEASURED where null, terminal stage,
the claim's metric and baseline from each side, and each run's own note and banner.

**No narrative, no recommendation.** Why a score moved is a human judgement and the
endpoint has no basis for one. It reports the diff.

### Verified on production — run 1 against run 5

```
confidence  10 -> 45, delta 35, band low -> low, unchanged

metric_definition_confirmed  0 -> 20  (+20)
  from: "Calculation method NOT disclosed by the source. The metric cannot be
         independently reproduced."
  to:   "Calculation method documented."

baseline_evidence_verified   0 -> 15  (+15)
  from: "No evidence attached to the baseline."
  to:   "1 item(s): 0 independent, 1 attested. Strongest — attested by
         Brad Piver (external analyst of record)."

actual_evidence_verified     0 -> 0   flat, identical notes both sides
impact_basis_evidenced      10 -> 10  flat
human_commit_of_record       0 -> 0   flat
human_verifier_of_record     0 -> 0   flat
```

Same-run and cross-engagement both refused with 422.

**The flat rows are the useful part.** Identical notes from and to is the system
stating what is still missing and that it has not changed. A diff that showed only
what moved would hide the four things that did not.

### Judgment calls worth keeping

- Added/removed factors sort LAST. A null delta has not moved; placing it above a
  factor that gained 20 points would bury the finding
- `payload.businessMetric` has a legacy bare-string shape from before it was
  enriched with unit and direction. The endpoint unwraps defensively, matching what
  `client/src/types/run.ts` already documents. Reading `.name` off a string returns
  undefined rather than throwing, so this would have surfaced as a blank field
- Read routes must use the **pool**, not `req.dbClient`. `actorContext` returns
  early for non-mutating methods, so `req.dbClient` is undefined on a GET. First GET
  route added since that middleware existed

---

## Item 4 — parked, with three reasons — 29 August 2026

`capability_metric_links` with `promoted_at` was next on the roster. Recon found
three problems, and it is now a design question rather than a scheduled build.

**1. `promoted_at` probably duplicates `lifecycle_status`.** That enum has eight
values — `draft, proposed, rejected, ratified, active, superseded, retired,
archived` — not the single `draft` previously assumed. A link promoted to canonical
is `ratified`; one that is not is `proposed`. The transition is already dated via
`updated_at` and attributed via `audit_log`. A parallel timestamp meaning the same
thing is the `#C8A24A` failure in another form.

**2. The provenance columns cannot reuse `data_class`, because it does not exist.**
See the corrections section of DESIGN_SPEC.md. The link table's provenance needs
designing from what `evidence` actually carries.

**3. It cannot be demonstrated.** Two institutions hold one capability each —
"Value-based renewal execution" at Skillsoft and "New manager effectiveness" at
Curia. Unrelated. Promotion requires the same capability across institutions, so
there is nothing to promote and no way to test that promotion works. Creating a
fictional third institution to make the demo run is the thing this system refuses
everywhere else.

Build it when a second real account has an overlapping capability.

---

## Operational note

The production box reports `*** System restart required ***` at login — a pending
kernel or libc update. Postgres, Caddy and lvrf-api are all `systemctl enable`d so
they should return cleanly, but the reboot should be taken deliberately rather than
discovered during a demonstration.

Two stray files, `confidence-` and `factors`, were found in /srv/lvrf — shell
redirect artifacts from an unquoted `jsonb_pretty(payload->'confidence'->'factors')`
query. Removed. **The deploy script's dirty-tree guard caught them**; without it the
deploy would have succeeded and they would have sat there indefinitely.

Provenance of the entry above: the six locks, the 409 re-lock refusal, the
lvrf_locked_run_immutable refusal, the run-1-vs-run-5 comparison and the stray-file
discovery were all executed on srv1862778 on 29 August 2026 via curl to
127.0.0.1:3001 and psql as postgres. The session that authored this entry had no
SSH access and flagged which claims it could and could not attest to — the
code-level analysis it verified against its own work, the production results it
did not.

---

## Evidence endpoint — the write path is closed — 29 August 2026

### server/routes/outcomeEvidence.ts

`POST /api/value-outcomes/:outcomeId/evidence`. Creates an evidence row and links
it to a value outcome in ONE transaction.

This was the last governed relationship with no endpoint. Every evidence link on
production had been written by hand in psql — including both links that moved the
demonstrated confidence sequence. **Nothing in the application could reproduce
them.**

Creation and linking are one transaction because separating them permits an
orphaned evidence row.

**`supports` is restricted to three values in the application.** The column is free
text with a `'baseline'` default, and only `baseline`, `actual` and `impact_basis`
are understood by `walkSpine.ts` and `confidenceModel.ts`. A typo would silently
skip `lvrf_block_ai_actual`. Production holds exactly those three values today —
1 impact_basis, 2 baseline, 2 actual — so restricting codifies the actual state
rather than narrowing it. The application enforces what the schema does not.

**`confidence` is required, not defaulted.** The column defaults to `'medium'`. A
confidence level arriving by default is a plausible value nobody stated, which is
the class this system refuses everywhere else.

`ai_sourced: true` requires `research_query` and `research_tool` up front, so a
clear 422 arrives before `evidence_ai_requires_query` produces a constraint
violation. Attestation is enforced both-or-neither in the handler, and the attestor
is checked against the outcome's institution and `simulated = false`.

`institution_id` comes from the outcome, never the payload.
`captured_by_person_id` is the actor header.

**Recorded in a file comment:** `value_outcome_evidence` is a bare composite-key
join with no `id` and no `updated_at`, so it carries no audit trigger. The evidence
row is audited; **the link is not.** This endpoint cannot fix that — DEFECT-003
territory, requiring a schema migration.

### The refusal reached a caller for the first time

Every prior firing of `lvrf_block_ai_actual` had been in a psql session. Offered
through the API, with the message passed through completely unwrapped:

```
POST /api/value-outcomes/e3fb0061.../evidence
  { kind: "vendor_publication", supports: "actual", ... }

HTTP/1.1 422 Unprocessable Entity
{"message":"LVRF: vendor-published evidence may not support a measured actual.
 AMENDMENT-005 Article I. The actual comes from the customer's system of record."}
```

The transaction rolled back cleanly — evidence count 9 before, 9 after the refusal,
10 after the accepted write. **No orphan.**

That sentence reaching a browser verbatim is the reason the message must not be
wrapped, prefixed, or mapped to a friendlier string. It is the product.

### Run 6 — the score held, and this is the best result in the set

A second baseline evidence item was added through the API: a public filing with
honest provenance, neither independent nor attested. Run 6 produced:

  **45.0 — unchanged from run 5.**

`evidenceCredit()` takes the **strongest** item, not a sum. A public filing that is
neither independent nor attested does not beat an attested HR extract, so the credit
stays at 15 of 25. The factor note:

```
run 5:  1 item(s): 0 independent, 1 attested. Strongest — attested by Brad Piver
run 6:  2 item(s): 0 independent, 1 attested. Strongest — attested by Brad Piver
```

**The count moved. The credit did not.** If evidence summed, full credit could be
reached by attaching enough mediocre sources — which is exactly the fabrication
route this system exists to close.

### The compare that demonstrates it

`GET /api/value-runs/{run5}/compare/{run6}`:

```
confidence  45 -> 45, delta 0, band low -> low

baseline_evidence_verified  15 -> 15  delta 0
  note_from: "1 item(s): 0 independent, 1 attested. Strongest — ..."
  note_to:   "2 item(s): 0 independent, 1 attested. Strongest — ..."
```

**The evidence changed. The score did not. The record shows both.**

A rise is easy to demonstrate and easy to dismiss as a tool rewarding activity. A
diff where genuine work was done through the API and the number stayed still, with
the system explaining that the strongest item did not improve, is considerably
harder to argue with. Sorting placed it first — zero delta, but the only factor
whose state changed.

### The sequence is now six runs, all locked

```
run  score  what changed
1    10.0   Outside-In hypothesis locked from published material
2    10.0   HELD — schema gained confirmation columns; nothing confirmed
3    30.0   +20  calculation method documented and confirmed by a named person
4    30.0   HELD — metric superseded, source_system names an HR extract.
             The model does not score claims about provenance
5    45.0   +15 of 25  source document attached and attested
6    45.0   HELD — a second, weaker source added. Strongest, not sum
```

**Three plateaus, each for a different reason:** a capability added, a claim about
provenance, and a weaker additional source. Two rises, both traceable to a named
person and a document. Better than the five-run version.

### The write path is closed

Every governed relationship now has an endpoint. Nothing remains that can only be
done by hand in psql.

---

## The UI: three surfaces — 29 August 2026

### The reversal

The 25 August roster cut removed all UI work on the reasoning that if LVRF were
rebuilt on someone else's stack, the client would not transfer. That is reversed.
LVRF is a Rule76 application in the same sense CVAF is. The UI is a demonstration
artifact for selling the method — not a throwaway, and not a product either.

The consequence was larger than it sounded. **Five endpoints existed that only curl
had ever exercised.** The read path had a UI; the write path had none.

Scope was set at three surfaces rather than eight: evidence entry, compare, account
intake. A demo needs to be complete on the paths people walk, not on every path.

### Before this: no interactive element existed anywhere

`grep -rln "input|button|onChange|onSubmit" client/src/` returned two files, both
false positives — a type name and the three disabled Topbar buttons. No form, no
input styling, no focus treatment, no precedent. **Every choice below became one.**

---

## The actor layer

`GET /api/persons` — new. Real and non-simulated by default; `include_simulated`
must be opted into. A picker listing `[SIM] Finance Verifier` beside real people
would let someone select one and receive a refusal they cannot interpret. The
`simulated` field is always returned even when such rows are excluded — never omit
a field to imply a value.

`ActorContext` + `ActorBar` — session-scoped React state. **No localStorage, no
sessionStorage, no module constant.** It clears on refresh and that is deliberate: a
persisted actor becomes a default, and a default becomes an assumption. A hidden
default actor is the exact hole the server middleware was fixed to close.

The bar is always visible. Ink and loud when no actor is set — *"No actor selected.
Every write to this system names a person."* — quiet white once answered.
Attribution is not something a visitor discovers in an audit log afterwards.

---

## GovernedForm — the primitive

**FOUR RESULT STATES, FOUR TREATMENTS.** This is the component's reason to exist:

  refused (422)   INK BLOCK, server message VERBATIM
  conflict (409)  the same ink treatment, different label
  error           muted, ordinary, deliberately QUIETER than a refusal
  ok              caller-supplied content

A governance refusal is the system working. A 500 is the system failing. Rendering
both the same would undo the argument the database enforces.

**A refusal message is never prefixed, wrapped, appended, or mapped to a friendlier
string.** Those sentences name amendments. They are the product.

`postGoverned` in `client/src/api/post.ts` returns that union. It refuses to make
the request at all if the actor id is absent or malformed — failing before the
network call makes the reason legible instead of arriving as a generic 422.

### No field defaults to a plausible value

Selects start on `— choose —`. Booleans use a **tri-state** `'' | 'true' | 'false'`
rather than a checkbox — a checkbox physically cannot express "nobody chose," since
it resolves to false whether or not anyone looked at it. That is the
no-plausible-defaults rule enforced structurally rather than by convention.

### The actor requirement states itself early

First implementation disabled only the submit button, with the explanation beneath
it. A person could fill an entire form and discover at the end that they could not
submit. Now: the requirement renders **above** the fields, and a
`<fieldset disabled>` cascades to every input — so the form cannot be filled before
the requirement is met. The line by the button is kept for anyone who scrolls
straight down.

Ink is **reserved for governance refusals**. The actor requirement uses HealthCard's
existing gold-left-border callout instead. "You have not chosen who you are" is a
precondition, not a refusal.

### The result block renders above the submit button

It was below. On a long form the answer appeared off-screen and a visitor would
assume nothing happened. A refusal is the most important thing on the page when it
occurs and must not require scrolling to find.

---

## Surface 1 — evidence entry

`POST /api/value-outcomes/:id/evidence`, rendered as card `01A` beneath the evidence
ledger on the run page.

**Provenance renders FIRST**, in its own block, labelled *where this evidence
actually came from (required, not optional)*. Not at the bottom, not behind a
toggle. The honest part is not optional-looking.

Labels teach the constraint rather than naming the field — *confidence (the server
will not accept a default)*.

### The run payload gained valueOutcomeId

The payload carried no outcome id, so nothing in the client could address the
endpoint. Added to `produceRun.ts`; typed **optional** in `run.ts` because seven
production runs predate it. Typing it required would be the 25 August defect
repeated — a type asserting a shape the server does not produce.

Runs without it render no form, and a Card explaining that the run predates the
field. Same honest degradation `EvidenceCard` already uses for runs walked before
evidence was captured.

Adding the field changes `payloadHash` for runs produced afterwards. Correct and
expected — a payload with more in it is a different payload — noted in a comment so
nobody reads a hash mismatch against an older run as corruption.

### The success state explains a constraint rather than showing a result

  *"Evidence recorded. This ledger is a snapshot taken when this run was produced
  and will not change. Produce a new run to see this evidence scored."*

`EvidenceCard`'s own comment is the reason: a live join would show current evidence
beside a score computed from evidence as it stood at walk time — coherent-looking
and wrong.

### Verified on production

The refusal reached a browser from a visitor's own action, verbatim:

```
WRITE REFUSED
LVRF: vendor-published evidence may not support a measured actual.
AMENDMENT-005 Article I. The actual comes from the customer's system of record.
```

Postgres trigger → API unwrapped → ink block. Nothing written.

---

## Surface 2 — compare to predecessor

Card `05` on the run page. Compares this run to the highest-numbered **locked**
earlier run on the same engagement. Unlocked runs are skipped, never offered — the
endpoint refuses them with a 409 and offering one would produce a refusal the reader
cannot act on.

Three pre-comparison states, each explicit, never a blank: first run on its
engagement, this run not locked, no earlier locked run exists.

**A ZERO DELTA IS NOT NOTHING.** Where delta is 0 but the notes differ, the row is
tinted gold and badged *"Evidence changed, score held"*, with both notes rendered.
That is the single most important thing this card can show, and a diff rendering it
as an unremarkable flat row would bury it.

Verified on run 5 → run 6: delta 0, band held at LOW, baseline factor tinted with
*1 item(s)* → *2 item(s)*. Run 7 → run 6: all six flat, no tint. The tint appears
when something happened and stays absent when nothing did.

Factors render as their **questions**, not snake_case keys — legible to someone who
has never seen the schema.

**No interpretation.** The endpoint computes no narrative and the card adds none.

### Two server fixes this required

`GET /api/engagements/:id/runs` **did not select `id`**. It returned run numbers,
scores, stages and lock state — everything except the primary key. A client could
see a run existed and could not address it. Zero consumers, which is why nobody had
hit it.

Same query filtered `deleted_at` but not `superseded_by_id` — **an eighth
supersession site**. The earlier audit greps searched `FROM capabilities`,
`FROM institutions`, `FROM business_metrics` and `FROM value_outcomes`. Nobody
searched `FROM value_runs` — the table holding the artifact being demonstrated.

---

## Surface 3 — account intake

Card `00` above the runs table on the index. Uses `GovernedForm` unchanged.

**Industry is the provenance field**, and its help text is the clearest copy in the
interface:

  *"Industry determines which business measures carry money for an account. It is
  asserted by whoever enters it, not sourced. Leave it empty if unknown — an empty
  industry is honest, a guessed one is not."*

### The primitive leaked domain copy, and a second consumer exposed it

`GovernedForm` hardcoded *"Provenance — where this evidence came from"*. Invisible
until a second consumer existed, then rendered verbatim on a form submitting no
evidence. Now `provenanceLabel?: string`, defaulting to the original so
`AddEvidenceCard` is unaffected.

**Caught by the session building the second consumer, which flagged it rather than
patching the primitive outside its stated scope.**

### Verified: the 409 needed no special-casing

Submitting `Curia` produced *WRITE CONFLICT* in ink with the server's message
verbatim — with nothing conflict-specific in `CreateAccountCard`. That is the only
real test of an abstraction: whether the second consumer needed to reach into it.

---

## Two things the page was asserting untruthfully

**`0 EVENTS · ALL HEALTHY`** on the heartbeat card. Zero events is not all healthy —
it is UNMEASURED, and the badge asserted compliance where none was established. Same
class as rendering 0 for an absent value. Now: *"No heartbeat events are attached to
this run. Nothing about its operational health has been established — this is not
the same as healthy."* Matches HealthCard directly beneath it.

**Index page overflow.** First fix used `calc(100vw − 544px)`, mirroring the run
page's rail and confidence panel widths — on a page that contains neither. A
coincidence of appearance, not a shared constraint, and stale the moment either
sidebar changed. Replaced with `max-w-5xl` centred, chosen against the table's
measured min-content floor of ~700px.

---

## Deferred, named

- Narrow-viewport overflow: the runs table's min-content floor exceeds its box below
  a certain width, on both pages. Pre-existing, not a regression
- `stage`, `claim` and `notes` are returned by the compare endpoint and rendered
  nowhere
- Card numbering: the evidence form is `01A` because renumbering 02–04 would have
  exceeded scope. Settle it deliberately
- The form card and runs table do not align on the left edge

## Still open from earlier

- Runtime heartbeat emission — the register remains a photograph of 3 August
- Executive output renderer — `record_documents` is still empty
- `supports` as an enum
- `confidenceModel.isSynthetic()` reads a `[SIM]` prefix, not `persons.simulated`
- Item 4, `capability_metric_links` — parked with three reasons

---

## The record document — 1.2 closes against its own test — 30 August 2026

1.2's stated success criterion was: *a real cohort can be measured end to end by
someone other than the author, and the output is a document a CFO would carry to a
lender.* The first half became true when the UI landed. The second half needed
this.

### CORRECTION: record_documents was never empty

This file has said repeatedly that `record_documents` is empty and that nothing
renders it. **Both were wrong.** The table has held a row since 3 August —
`8b0a3330`, version 1, disclosure `internal` — written by `walkSpine.ts:753` during
the Customer Zero seed walk.

`records/render_record.py` also already exists, referenced by four files as the
thing that reads `value_runs.payload`. The claim came from a conversation summary
and was repeated without checking. Found by running `\d record_documents`.

### What render_record.py actually is

A **fixture-driven CLI**, not a service. `main()` takes a fixture filename as
`argv[1]`, reads `out/spine_run_{stem}.json` from disk, and writes HTML and a PDF
to `out/`. It is not database-aware. It is mature — WeasyPrint, letter size, page
counters in the footer, Bebas and Barlow, design tokens cited from CLAUDE.md rather
than reinvented, a `.banner.gate` treatment for the disclosure gate, a `.tag.sim`
class marking simulated evidence, and a comment recording that CSS Grid is
unreliable in WeasyPrint so it uses flexbox and tables only.

**WeasyPrint is not installed on the production box.** `which weasyprint` returns
nothing. That script has never run there; the PDF in `out/` was produced on a Mac
and committed.

### The design decision

Three options were weighed: port the renderer to Node, shell out to Python from
Express, or separate the record from the rendering.

The third was taken. **The row IS the document of record; a PDF is a rendering of
it.** `file_path` is nullable precisely because the schema anticipated this.
Making the Node service depend on a Python environment with WeasyPrint, on the box
that serves the application, is a real operational commitment for one endpoint and
was not taken.

### POST /api/value-runs/:runId/record-document

Creates a `record_documents` row from a **locked** run.

  404  run missing, soft-deleted or superseded
  409  run not locked — a document rendered from a mutable run could disagree
       with the run it claims to represent
  422  payload has no valueOutcomeId — seven runs predate the field and cannot
       produce a record document

`content_hash` is **recomputed**, not copied from `value_runs.payload_hash`, which
holds the identical value. An endpoint that trusts another code path's value proves
nothing about its own. The computation strips the payload's own `payloadHash` key
before hashing — the stored payload has its hash folded in, so hashing it whole
would produce something that never matches. `stableStringify` sorts keys
recursively, so a JSONB round-trip cannot change the answer.

Verified: `rd.content_hash = vr.payload_hash` returns `t`.

`disclosure` passes through from the run, already `internal` or `customer_shared`.
Never recomputed, never defaulted to `draft`.

`document_version` is `MAX(...)+1` per outcome, with the unique constraint on
`(value_outcome_id, document_version)` as the actual concurrency guard, surfacing
as `23505` → 409 on a race.

### FINDING: record_documents carries NO governance columns

```
select column_name from information_schema.columns
where table_name='record_documents'
  and column_name in ('superseded_by_id','deleted_at','status','version');
-- empty
```

**None of the four.** No `superseded_by_id`, no `deleted_at`, no `status`, no
`version`. This is the only governed table carrying none of the standard columns,
and it is governed by a different and simpler rule: **insert-only, versioned, never
retired.**

`document_version` is genuinely the only retirement mechanism, which makes the
custom message on `lvrf_block_delete` accurate rather than partial:

  *"This is an immutable disclosure record with no soft-delete path; supersede by
  rendering a new document_version."*

The only bespoke trigger message in the system, and it earns it. Verified live —
`delete from record_documents` refuses with that sentence.

This corrects a looser claim made earlier that the table was governed in the same
sense as the others. It is not.

### GET /api/value-outcomes/:outcomeId/record-documents

Scoped by **outcome, not run** — `document_version` is unique per outcome, so the
outcome is the grain the data uses. Returns newest version first. Does not return
`payload`: it duplicates what the client already has.

**LEFT JOIN to value_runs, never INNER.** Customer Zero's 3 August document has
`value_run_id` null — `walkSpine.ts` wrote it before the run row existed. An inner
join would silently drop it. `run_number` returns null for such a row, never 0, and
the field is never omitted.

404 on a missing, soft-deleted or superseded outcome. An empty array for a
nonexistent outcome is indistinguishable from an empty array for a real one with no
documents.

### DEFECT: the router was mounted at one prefix and served two grains

`recordDocuments.ts` declared a run-scoped POST and an outcome-scoped GET, and
`index.ts` mounted the router once, under `/api/value-runs`.

So the GET resolved at `/api/value-runs/:id/record-documents` and queried by outcome
id against a path parameter that was actually a run id. **Wrong address, wrong
identifier — and it would have returned an empty array for every run rather than
erroring.** A silent wrong answer, not a crash.

Fixed by splitting into `recordDocumentsWriteRouter` and
`recordDocumentsReadRouter`, mounted separately. NOT by mounting one router twice:
both paths would then serve both routes, and the POST would accept an outcome id
where it expects a run id.

  **A router mounted at a prefix should contain only routes belonging to that
  prefix.**

### METHOD NOTE: a full-file reorder defeats git diff

The split produced 108 insertions and 89 deletions for what was described as
boundary-only changes. Git diffs by contiguous block and cannot represent "this
block moved" at zero cost, so reordering shows as delete-here/insert-there for
every line between the moved boundaries — even where content is byte-identical.

The claim that no handler logic changed was reasoned, not checked. The check:

```
git stash && git show HEAD:path > /tmp/before && git stash pop \
  && diff <(grep -v "^\s*$" /tmp/before | sort) \
          <(grep -v "^\s*$" path | sort)
```

Sorting removes ordering entirely, so a pure reorder produces only genuinely added
lines. It did: two export signatures, two braces, one `void pool;`, and the comment
block. Nothing removed but the old signature and the old comment.

**Thirty seconds converts a reasoned claim into a checked one.** Worth doing every
time a diff is large for a change described as small.

### State

  record_documents  2 rows
    8b0a3330  Skillsoft outcome, v1, internal, value_run_id NULL, 3 Aug seed walk
    c2e00632  Curia outcome,     v1, internal, run 7,             30 Aug

Both `file_path` null. Both retrievable. The hash on the Curia document matches its
run's stored `payload_hash`.

### Remaining, in order

1. A UI surface. *Render record* sits disabled on the Topbar and now has an
   endpoint behind it, so the interface currently understates what the system does
2. `render_record.py` reading from the API rather than `out/spine_run_*.json`.
   That is a change to a Python script on a Mac, not to the service, and bytes only
   matter when someone asks for a PDF

---

## Topbar wired, and the heartbeat recon — 30 August 2026

### GovernedAction, and two buttons that were misstating things

`GovernedForm`'s result block was extracted as `ResultBlock` and is now shared by a
new `GovernedAction` — for a governed write with **no input to collect**, where
everything comes from context the caller already has. The four treatments are not
reimplemented anywhere.

Result placement is **inverted** from GovernedForm: below the button rather than
above, because the Topbar sits at the top of a long page and there is nothing to
scroll past. Noted in a comment so the divergence reads as deliberate.

**Two of three Topbar buttons were saying false things.**

*Render record* said "not yet implemented" and had an endpoint. Now wired, and it
refuses **locally** before posting when the run is unlocked or its payload has no
`valueOutcomeId` — the endpoint would 409 or 422, and saying so up front beats a
round trip.

*Add evidence* also said "not yet implemented" and that was false: evidence entry
exists as card `01A` on the same page. It is not unbuilt, it is **unwired**. Title
corrected. Scrolling to the card would need an anchor id on a file outside the
change's scope, so it stays disabled with honest wording.

*Share with customer* unchanged — gate-blocked is a third state and it was already
correct.

Three buttons now express three different things: **live, gate-blocked, and
built-but-unwired.**

### Verified on production — deterministic hashing

Record document v2 created through the UI on run 7, where v1 had been created by
curl forty minutes earlier:

```
 document_version |       hash       |          rendered_at
                1 | 8b47c1e065398334 | 2026-08-30 01:08:06.911187+00
                2 | 8b47c1e065398334 | 2026-08-30 01:50:40.322239+00
```

**Identical hashes, two call paths, forty minutes apart.** That is the property
that makes `content_hash` worth storing: a recipient can check a copy against it,
and two documents claiming the same content provably have it.

Run 1 degrades correctly on both fronts — *Render record* disabled with the reason,
card `01A` reading UNAVAILABLE ON THIS RUN.

### FINDING: local cannot reach a state production is in daily

The UI success path could not be exercised locally. Local holds **14 live outcomes
per engagement**; production holds one. `produceRun.ts` refuses an engagement with
more than one outcome, so no fresh locked run carrying `valueOutcomeId` can be
produced locally at all.

The local/production divergence is no longer only a data-freshness caveat — **it
blocks a class of testing.** Some paths are only exercisable on production.

---

## Heartbeat recon — runtime emission scoped, not built

Every heartbeat event still carries the identical 3 August timestamp. Institutional
health reports UNMEASURED at 0% coverage on every Curia run. A third of the
instrument is inert, and this is what it would take to light it.

### The register splits three ways

**ELEVEN are event-driven and their endpoints already exist.** Every one runs in a
transaction with an actor. These are LVRF's to emit:

```
HB-0004  Canonical Object Created      per creation
HB-0005  Canonical Object Updated      per modification
HB-0006  Object Locked                 per lock        -> lockRun
HB-0008  Snapshot Created              per snapshot    -> produceRun
HB-0009  Evidence Attached             per attachment  -> outcomeEvidence
HB-0013  Value Baseline Established    per baseline    -> valueOutcomes
HB-0014  Value Target Committed        per commitment
HB-0015  Value Realized                per measurement -> outcomeWalk /measure
HB-0016  Value Verified                per verification-> outcomeWalk /verify
HB-0017  Realization Record Published  per publication -> recordDocuments
HB-0018  Capability Change Evidenced   per assessment  -> institutionInputs
```

**THREE are infrastructure LVRF does not own:**

```
HB-0001  System Initialization   Runtime               every startup
HB-0002  Authentication          Identity Provider     every login
HB-0003  Authorization           Authorization Engine  every request
```

HB-0002 and HB-0003 **are the entire Security dimension, weight 10.** It is
permanently unmeasured until authentication exists — which is the same trigger
named below.

**FOUR are Compass OS:**

```
HB-0007  Governance Override            Governance Engine  as required
HB-0010  Constitution Reviewed          Compass            before every governed change
HB-0011  Heartbeat Health Calculated    Heartbeat Engine   scheduled and event-driven
HB-0012  Institutional Health Published Heartbeat Engine   after every recalculation
```

HB-0010's producer is literally *Compass*. HB-0011 and HB-0012 are the Heartbeat
Engine — the thing that computes and publishes health. LVRF computes health today
via `computeHealth()` but emits no event saying it did.

**So: emit the eleven, declare the seven with their producers.** Health stops being
a photograph without pretending the whole register is live.

### What an emitter needs

`heartbeat_events` requires: `heartbeat_id`, `tenant_id`, `event_type`, `producer`,
`severity`, `health_state`, `constitutional_authority`, `content_hash`,
`subject_table`, `subject_id`. Nullable: `institution_id`, `engagement_id`,
`value_stage`, `learning_stage`, `actor_person_id`, `value_run_id`.

`event_type`, `producer`, `severity`, `category` and `health_weight` come from the
**register row**, not the call site — `walkSpine.ts` loads it via
`loadHeartbeatRegister()` into a Map.

`content_hash` is `sha256Hex(body)` over a structured object — the same
`stableStringify` used for payload hashes, cited to §12 as *cryptographically
hashed, tamper-evident*.

### THE BOUNDARY THAT MUST NOT BE CROSSED

`buildHeartbeatPlan` in `heartbeatLedger.ts` is deliberately **the single
implementation** of the ten-event walk sequence. Its own comment:

> *A second, hand-synchronised copy of this sequence is exactly the shape of the
> ANY/EVERY divergence db/CONFIDENCE_MODEL.md records: two implementations of one
> rule, drifting silently, with a passing test in between.*

`createPlanCursor` throws on any plan/emit mismatch — a loud crash instead of a
silently wrong health score.

**Runtime emission is per-event, not a planned sequence.** It is a different
concern and must not become that second copy. A shared low-level emitter is fine;
a second sequence definition is not. State this in whatever gets built.

### Scope, when it is built

A shared emitter plus eleven call sites. It touches **every write endpoint**, and a
mistake corrupts the health register rather than failing visibly. Larger than
anything attempted in one sitting so far, and worth its own session.

---

## The trigger for authentication, named precisely

Auth was ruled out of every tier, correctly, for a reference implementation. The
trigger for revisiting it is not a date and not "if hired."

**It is the first time someone who is not the author needs to see a record** — a
services consultant, or a customer contact confirming their own figure.

`value_outcomes_verified_requires_human` demands a real, non-simulated person **at
the institution**. Today that person cannot log in. So the constraint the whole
system rests on has no route to being satisfied by the person it is meant to name.

That is the last unwired end of the governance model, and it is also what would
light HB-0002 and HB-0003 and the Security dimension with them.

---

## 2.0, scoped for a platform

LVRF is a Rule76 Studio running real engagements, not a demonstration instrument.
That changes what belongs in 2.0:

- **Cohort roll-up**, with composite confidence from the **weakest link**, never
  averaged. Averaging launders the gaps. Assumes health means something, which is
  why runtime emission comes first
- **The earned pack** — brings item 4's `capability_metric_links` edge back, but
  designed against `lifecycle_status` (`proposed` / `ratified`) rather than a
  duplicate `promoted_at`
- **Versioned model weights.** A nicety at one engagement; necessary the moment two
  are scored months apart, because tuning a weight silently makes every prior score
  incomparable
- **The priced gap register** — what each missing input costs to obtain and what it
  buys in confidence. The commercial surface

Not on any roster and eventually unavoidable for a platform: authentication,
multi-tenancy, something other than basic_auth.

**Order: runtime heartbeat emission, then 2.0.** Building platform features on an
inert third of the instrument would be composing from a photograph.

---

## The register beats — runtime heartbeat emission — 30 August 2026

Every heartbeat event carried the identical 3 August timestamp. Institutional
health reported UNMEASURED at 0% coverage on every Curia run. A third of the
instrument was inert. It is not any more.

### server/spine/emitHeartbeat.ts

One emitter, called per event, writing in the caller's transaction via
`req.dbClient`. **A heartbeat for a write that rolled back is a lie**, so the event
and the thing it records commit together or neither does.

**Everything comes from the register row, never the call site:** `event_type` from
`heartbeats.name`, `producer` from `heartbeats.producer`,
`constitutional_authority` from the register, default `severity` from
`failure_severity`. `contract_version` uses the column default and is never passed.
An unregistered `heartbeat_id` throws — a heartbeat for an id the register does not
know is not a heartbeat.

`content_hash` is `sha256Hex` over the same field set `walkSpine.ts`'s `emit()`
hashes: `heartbeatId, eventType, producer, valueStage, subjectTable, subjectId,
actorPersonId, payload`. Scoping fields are plain columns and were never in the
hashed body.

### THE BOUNDARY, held

`heartbeatLedger.ts`'s `buildHeartbeatPlan` is deliberately the single
implementation of the walk's ten-event sequence. Its own comment warns that a
second hand-synchronised copy is *"exactly the shape of the ANY/EVERY divergence
db/CONFIDENCE_MODEL.md records: two implementations of one rule, drifting silently,
with a passing test in between."*

`emitHeartbeat` is **per-event**. It imports nothing from `heartbeatLedger.ts`,
defines no ordering, and no call site references the plan. If a future change makes
it aware of sequence, that is the divergence arriving.

### Six call sites built, four proven on production

```
HB-0006  Object Locked                lockRun          governance  PROVEN
HB-0008  Snapshot Created             produceRun       integrity   PROVEN
HB-0009  Evidence Attached            outcomeEvidence  integrity   PROVEN
HB-0017  Realization Record Published recordDocuments  integrity   PROVEN
HB-0013  Value Baseline Established   valueOutcomes    financial   built, unfired
HB-0018  Capability Change Evidenced  institutionInputs learning   built, unfired
```

The five unconditional ones were built in one pass **only because they are
unconditional** — `healthState` is `healthy` when the write succeeds, because the
thing the heartbeat records is the thing that just happened. No call site carries
conditional logic.

HB-0018 fires **per assessment, inside the loop** — three assessments in one
request emit three events, one per subject. One event per request would undercount
the learning dimension in a way nothing would surface.

### Verified on production — the register widening

```
run 9   coverage 25%   governance only          (HB-0006)
run 11  coverage 35%   governance + integrity   (HB-0008 added)
run 12  coverage 35%   integrity deepened       (HB-0009, HB-0017 — no new dimension)
```

Governance weight 25 plus integrity weight 10 is exactly 35. The health model doing
arithmetic on real events for the first time since it was written.

Run 12 is the instructive one: **two more events, no wider coverage.** Depth in a
dimension already measured is a different improvement from breadth, and the model
distinguishes them.

**HEALTH LAGS ONE RUN.** A run computes health from events existing *before* it,
then emits its own. Run 10 could not see its own HB-0008; run 11 could. That
ordering is correct — a run scoring itself on an event it has not written yet would
be circular — but it means the number is always one run behind the register.

### A badge that outran its data, again

The index rendered `HEALTHY` on run 9 with no coverage figure: one heartbeat, one
of seven dimensions, 25% coverage. A reader scanning that column saw Curia's health
improve from unmeasured to healthy. What actually happened is that a quarter of the
dimension weight became measurable and scored well.

Third instance of this class, after `0 events · all healthy` and rendering 0 for an
absent value. Fixed — the badge now carries its coverage, `HEALTHY · 25%`, matching
`HealthCard`'s existing wording.

`health_coverage_pct` was already in the client type. **A rendering gap, not a
missing-type finding** — checked before assuming.

---

## FINDING: the commit stage has no endpoint

`grep -n "committed_at\|committed_by" server/routes/*.ts` returns **nothing.**

`value_stage` runs `baseline → attach → model → commit → measure → verify →
return`. Every stage is reachable except `commit`. Nothing in the API sets
`committed_at`, `committed_by_person_id`, or `target_value`.

This has been visible on every Curia run as `TARGET · NOT YET SET` — read for days
as "nobody has set a target," when the truth is **no code path exists to set one.**

`outcomeWalk.ts` implements measure and verify. The stage between baseline and
measure was never built, and the file has been described as "the walk" throughout
without anyone noticing it skips a step.

### What it costs

- **10 confidence points are permanently unreachable.** `human_commit_of_record`
  asks whether a named, non-synthetic person committed to the target. It reads
  *"Sponsor of record is synthetic"* on every run — but even a real sponsor could
  not be recorded, because nothing can name one
- **`value_outcomes_commit_is_complete` is unenforceable in practice.** It requires
  `committed_at` to imply a target and a committer. No application path can produce
  a row that tests it
- **HB-0014 Value Target Committed has nowhere to fire.** It is not deferred for
  lack of time; it has no call site
- The `commit` value stage cannot be reached

### Why HB-0016 is unconditional at its call site

`buildHeartbeatPlan` scores HB-0016 `warning` unless realization is `verified`. At
the `/verify` endpoint it is always `healthy`, because that endpoint only succeeds
when realization becomes verified — the `warning` case is the walk recording a
*refused* verification, which the API expresses as a 409 or 422 rather than a write.

Same judgement, different expression. Worth stating so nobody later "fixes" the
call site to match the plan's literal branch.

### Consequence for the roster

The commit endpoint is not a heartbeat task. It is a missing stage in the value
spine, and HB-0014 comes with it rather than being deferred separately.

That makes it the next item, ahead of the remaining conditional emitters.

---

## FINDING: local believes it is migrated and is not

`produceRun.ts` fails locally with `column bm.definition_confirmed_by_person_id
does not exist`. `information_schema.columns` confirms the column is genuinely
absent — **while Drizzle's migration-tracking table records migration 0013, which
adds it, as applied.**

`drizzle-kit migrate` will therefore skip 0013 forever. The drift is permanent
until someone intervenes.

This is a second class of local/production divergence. The first was different
data. This is a local database that **believes it is current and is not**, and the
tracker will not correct itself.

Production is correct. Two of the six call sites could not be exercised locally as
a result, and were verified on production instead.

---

## The commit stage, and the first band change — 30 August 2026

### POST /api/value-outcomes/:outcomeId/commit

Added to the existing `outcomeWalk` router, which already held `/measure` and
`/verify`. Commit is the stage between baseline and measure and belongs with them.

`value_outcomes_commit_is_complete` requires `committed_at` to imply both
`target_value` and `committed_by_person_id`. All three are set together or the
write is refused.

The committer **must belong to the outcome's institution and must not be
simulated** — the same rule `/verify` applies to its verifier. A commitment by the
vendor is not a commitment.

Refuses: 404 on a missing, soft-deleted or superseded outcome. 409 if
`committed_at` is already set, naming the existing committer and date — a
commitment is not amended, the outcome is superseded. 409 if realization is not
`claimed`, because committing after measurement is backwards.

The commitment note is written as an `attestation` evidence row linked with
`supports = 'impact_basis'`, provenance naming the committer. Mirrors how `/verify`
writes its attestation.

**HB-0014 fires in the same transaction, healthState `healthy`.**
`buildHeartbeatPlan` has a `watch` branch for a synthetic sponsor; it is
unreachable at this call site, because a real non-simulated committer at the
institution is the only way this endpoint succeeds. Stated in a comment so nobody
later "fixes" it to match the plan's literal branch.

### The model correction: what human_commit_of_record scores

The factor asks *"Did a named, non-synthetic person commit to THE TARGET?"* It was
scoring `engagements.sponsor_person_id` — a **relationship-level** field. It now
scores `value_outcomes.committed_by_person_id`, mirroring the verifier block
directly beneath it, which already read `verified_by_person_id` off the outcome.

The system already treated sponsor as relationship and verifier as per-outcome,
deliberately. The commit factor was on the wrong side of that line.

`engagements.sponsor_person_id` was dropped from produceRun's SELECT — confirmed by
grep that nothing else reads it except the schema definition and
`seedCustomerZero.ts`, which only writes it.

### WHY THIS WAS SAFE NOW AND WOULD NOT BE LATER

**A change to what a factor READS changes what every prior score MEANT**, and
nothing records which model version scored a run.

Safe here for two reasons, both temporary:
- **No run had ever earned this factor.** Every one read *sponsor of record is
  synthetic*, so no stored score changes value
- **All thirteen runs are locked and immutable**, so none will be recomputed

This is the concrete argument for versioned model weights, previously a
hypothetical on the 2.0 roster. The moment one run has earned a factor, changing
what that factor reads silently makes it incomparable to the next.

### The walkSpine fence, tested

Renaming `FindingsInput.sponsorSynthetic` broke `walkSpine.ts:905`, which was on the
do-not-touch list. **Flagged rather than resolved unilaterally.**

Resolution: the one-line key rename only. The fence existed to protect the Customer
Zero walk's sequence, derivations and score — not to make the file immutable. A key
rename on a call site changes none of those.

**Verified, not assumed:** `verifyConfidenceParity.ts` confirms Customer Zero still
scores exactly 30.0/100, band low, identical F2/F3/F4 findings. The fence held in
substance even though the file was edited.

### Verified on production — the first band change in thirteen runs

```
run 12   45   low
run 13   55   MEDIUM      terminal_value_stage: commit
```

`human_commit_of_record` earned 10 for the first time. Target 150 against a sourced
baseline of 214, committed by a named non-simulated person at the institution.

Coverage held at 35% — HB-0014 is governance, a dimension already measured.

The run page changed in four places at once: TARGET reads 150 where it said NOT YET
SET on every prior run; the rail shows `03 MODEL · target 150` and `04 COMMIT`
reached; the confidence panel reads *10/10 Named human sponsor of record — Brad
Piver (external analyst of record)*; and a fifth block filled on the earned bar.

**The gate still holds.** Realization remains `claimed`, verification refused,
sharing disabled until a named human verifier confirms sources. Committing did not
unlock verification and should not.

### The sequence

```
10 · 10 · 30 · 30 · 45 · 45 · 45 · 45 · 45 · 45 · 45 · 45 · 55
```

Three plateaus, three rises, one band change. The eight consecutive 45s are the
runtime heartbeat work — it improved health without touching confidence, which is
correct: **they are different axes**, and the sequence demonstrates that better than
any explanation.

### Roster addition: stale names in shared models

Two now, both the same convention-not-constraint shape:

- `ConfidenceInput.sponsorName` receives a committer. The field name no longer
  matches its content
- The panel label reads *Named human sponsor of record* where a reader sees it,
  describing a committer

Correctly out of scope for the change that created them, and they belong together
with `confidenceModel.isSynthetic()`'s `[SIM]` prefix check — three stale
conventions in one model file.

---

## The last two emitters, and the [SIM] prefix removed — 30 August 2026

### HB-0015 and HB-0016 — all eight LVRF-owned emitters wired

Both in `outcomeWalk.ts`, following the HB-0014 pattern the commit endpoint
established.

**HB-0015 Value Realized** fires in `/measure`, category financial.
`healthState` is `watch` when any evidence supporting the actual is simulated, else
`healthy` — derived from the same evidence rows the admissibility check already
reads. The `EXISTS` was widened to return `evidence.simulated` per row, so no
second query and no plan import.

`lvrf_block_ai_actual` makes the `watch` branch unreachable in practice, since
simulated evidence cannot support an actual at all. **It is computed honestly
anyway rather than hardcoded** — if the gate ever changes, the emitter still tells
the truth. That was the agent's call and it is better than the instruction it was
given.

**HB-0016 Value Verified** fires in `/verify`, category **constitutional** — the
seventh and last dimension LVRF can measure. `healthState` is always `healthy`:
`buildHeartbeatPlan`'s `warning` branch is unreachable here, because `/verify` only
succeeds when realization becomes verified. A refused verification is a 409 or 422,
never a write.

### Neither can fire on Curia, and that is the honest state

`/measure` returned 422 on production: no admissible evidence supports an actual.
The only candidate is vendor-published and the gate refuses it. `/verify` needs a
measurement.

The chain has been blocked at this exact point since 25 August. It is not a build
gap. **No heartbeat was written for a write that never happened** — the transaction
never committed.

### The coverage ceiling depends on verification

```
governance      25   HB-0006, HB-0014        measured
integrity       10   HB-0008, 0009, 0017     measured
financial        9   HB-0013                 wired, unfired
learning         7   HB-0018                 wired, unfired
constitutional  25   HB-0016                 unfirable — needs a verified outcome
operational     15   HB-0001                 Runtime, not LVRF's
security        10   HB-0002, HB-0003        needs authentication
```

Coverage sits at 35%. Constitutional is worth 25 of it, and HB-0016 is the only
event that can measure it — so **the ceiling depends on whether an outcome can ever
be verified**, which needs admissible evidence from a customer's system.

That is the ninety-day proof, not a build item.

---

## The [SIM] prefix removed from the confidence model, in three forms

Four instances of the same shape, found and closed in one morning.

### 1. The wire format

`produceRun` read three booleans from the database — `committer.simulated`,
`verifier.simulated`, `attester_simulated` — encoded each into a `'[SIM] '` string
prefix via `creditName()`, and `confidenceModel` decoded all three by calling
`isSynthetic()` on the string. **Three columns, three encodings, three decodings,
with a text prefix acting as the wire format between them.**

`walkSpine` held the same booleans and also passed only names. Both callers had the
truth and discarded it at the interface.

`ConfidenceInput` now carries `committerSimulated` and `verifierSimulated` as
booleans; `ConfidenceEvidenceInput` carries `attesterSimulated`. **`isSynthetic` is
deleted.** `creditName` is deleted — its only remaining job was passthrough.

Names remain for **display**. Only the synthetic decision stopped depending on the
string.

**Parity held: 30.0/low and 80.0/high, findings identical.** Four synthetic
decisions changed source and none disagreed with the prefix. The convention was
correct everywhere; it simply was not enforceable. A latent hazard, not an active
bug — which is exactly why it was worth removing before anything came to depend on
it.

### 2. The dangling role noun

With the label changed from `'Sponsor'` to a name, the note template rendered:

  *"Brad Piver (external analyst of record) of record."*

The suffix had read naturally when the label was a role. Fixed to name the action:
*"Committed by <name>."*

### 3. The manufactured placeholder — and the finding underneath it

`creditNameForMissing('verifier')` produced `'[SIM] (no verifier of record)'`, and
the note rendered:

  *"Verified by [SIM] (no verifier of record) — a simulated identity, not a person
  of record."*

**Nobody had been named. Nothing was verified.** And the prefix that had just been
removed as a wire format survived here as display text describing an absence.

> **A SIMULATED PERSON AND NO PERSON ARE DIFFERENT FACTS.**
> A simulated verifier is someone pretending. No verifier is nobody at all. A note
> that conflates them is asserting a person exists in order to say they are not
> real.

`committerName` and `verifierName` are now `string | null`. Three states, three
notes:

```
absent     "No verifier of record has been named."
simulated  "Verified by [SIM] Customer Sponsor — a simulated identity, not a
            person of record."
real       "Committed by Brad Piver (external analyst of record)."
```

`creditNameForMissing` is deleted. **A name for a nonexistent person is the thing
this system refuses everywhere else.**

The nullable-name shape was chosen over a fourth boolean because two fields could
then disagree about presence, and a null name cannot. Same reasoning as the forms'
tri-state booleans: **make the invalid state unrepresentable rather than guarding
against it.**

### Verified on production

Run 14: 55 medium, unchanged after the wire-format refactor — the model reads
columns instead of parsing strings and reaches the same conclusion.

Run 16: 55 medium, notes reading *"Committed by Brad Piver (external analyst of
record)."* and *"No verifier of record has been named."* — the truth about Curia
stated precisely. Someone committed. Nobody verified.

Sixteen runs, all locked.

### Roster cleared

The three stale conventions in `confidenceModel` are gone. Nothing in that file
decides anything by inspecting a string.

---

## LVRF 2.0 — scoped 30 August 2026

Supersedes the 2.0 sketch of 25 August. That version assumed a demonstration
instrument. LVRF is a Rule76 Studio running real engagements, and the roster
changes accordingly.

---

## DEFECT, found while scoping: run 13's +10 is a conflated delta

Two things changed in the same deploy. A committer was named, **and**
`human_commit_of_record` started reading `value_outcomes.committed_by_person_id`
instead of `engagements.sponsor_person_id`.

Had only the commit happened, run 13 would still score 0 — the engagement's sponsor
is still null. So the compare card reports `0 → 10` and a reader infers *someone
committed*, when what actually happened is that someone committed **and the question
changed**.

**Nothing in run 13's payload records which model version scored it.** `compareRuns`
joins two runs factor-by-factor and reports deltas. It cannot distinguish a change
in the world from a change in the ruler.

This was safe to do once, because no run had ever earned that factor. **Runs 13
through 16 now have.** The next change to any factor's reading produces a genuinely
false delta across sixteen locked, immutable runs, and nothing detects it.

Versioned model weights are therefore not a 2.0 enhancement. They are the
prerequisite, and every other item depends on them.

---

## The roster

### 1. Model versioning — PREREQUISITE

Every run records the model version that scored it. Weights and factor definitions
become **data, not constants**. `compareRuns` refuses, or loudly flags, a
comparison across versions.

Without this, every subsequent item builds on scores that may not be comparable.

### 2. The gap register, priced

The confidence panel already says *the missing 55 points are a work list*. What is
missing is what each gap **costs to close** and what it **buys in confidence**.

Applying the absent-versus-simulated lesson, the register must distinguish three
states, not two:

```
not yet obtained          effort will close it
obtained and refused      the gate rejected it; a different source is needed
structurally unobtainable  no effort on this path will ever close it
```

Curia's `actual_evidence_verified` is the third kind. Vendor-published evidence is
refused by design, so work on that path buys nothing, ever. **A register showing it
as merely missing would send someone down a road with no end.**

### 3. Cohort roll-up, weakest link

Composite confidence across accounts derived from the **weakest** contributor, never
averaged. Averaging launders the gaps.

*Unmeasured is not compliant* applies at cohort level too: one account at 0%
coverage must not average into something respectable. Depends on item 1.

### 4. Self-drift detection — NEW, and the strongest idea here

LVRF measures whether other institutions' claims are evidenced. **It has never
measured whether its own record is accurate.**

Every record-versus-reality gap this month was found by a human looking:

```
the client bundle undeployed for twenty days
five triggers declared and never applied
a trigger count that reconciled by coincidence
the offerings catalog that existed only on a laptop
eight supersession sites, the eighth in the table holding the demo artifact
a migration journal that claims 0013 is applied when the column is absent
seven client types written from a fixture, not the server
```

All of them are mechanically checkable. A trigger list compared **by list, not
count**. A migration journal compared to `information_schema`. Client types compared
to server returns. `ops/` files compared to their deployed counterparts.

Institutional health already carries a **Data Integrity** dimension, weight 10,
currently fed only by walk events. Feeding drift detection into it closes the loop:
**the instrument scores its own record by the standard it applies to everyone
else's.**

### 5. Deep Research inputs — governance already exists

The schema already enforces this and nothing produces it:

```
evidence_ai_requires_query            ai_sourced requires query and tool
evidence_ai_verify_requires_resolution  source_verified refused until the citation
                                        resolves
evidence_resolution_requires_human    resolution requires a named person
lvrf_block_ai_actual                  AI-sourced may never support a measured actual
```

**Research produces candidate evidence; a person resolves each citation.** It does
not reduce human effort — it redirects it from *finding* to *checking*.

**Parsing is the dangerous part.** An extract from a filing is a **derivation**, and
the system has no `derived` class — evidence is sourced or asserted. A parsed figure
attributed to a 10-K *looks* sourced and is not, until someone resolves it.
Parsed-and-unresolved is a third state, and conflating it with sourced would be the
worst instance yet of the absent-versus-simulated failure.

**OPEN: where does research run?** Compass OS's boundary already claims Deep
Research as substrate — HB-0010's producer is *Compass*. LVRF building its own is
the three-copies-diverge failure the Studios architecture exists to prevent. Decide
before building.

### 6. Draft-and-refuse — build first among the automations

The system already knows why a score is low, and the notes name the missing
condition precisely. It can draft **the request that would close each gap**: the
message asking a named person to confirm a figure, the specific extract needed, who
must attest.

**The system knows what is missing better than the person does, because it computed
it.** Drafting the ask is automation that never touches the score.

This is the one that makes a refusal **actionable** rather than merely honest —
which is the difference between an instrument and an obstacle.

---

## Further candidates, not yet committed

**Provenance decay.** Evidence carries `captured_at` and nothing ages. The Curia
case study reports January–June 2023 figures on a page live in 2026, and the system
treats that evidence identically at capture and three years later. A metric with a
stated `reporting_cadence` whose newest evidence predates it is **stale**, and
confidence should say so. Nothing currently notices a number has gone off.

**Constraint-derived documentation.** `CONFIDENCE_MODEL.md` and `HEALTH_MODEL.md`
are hand-maintained descriptions of code — the authored-prose problem one level up.
Weights, CHECK constraints and trigger messages could generate their own reference.
Every drift found this month was a document disagreeing with the system.

**Contradiction detection.** Two evidence rows can assert incompatible things — 180
days and 214 days for the same metric — and nothing notices. Supersession handles
the case where someone *knows* one replaced the other. It does not handle the case
where nobody noticed.

---

## RULED OUT — automation that manufactures confidence

The test for any automation: **does it reduce work, or does it manufacture
confidence?** Anything that raises a score without a person behind it is the failure
this system exists to prevent.

Excluded on that basis: AI suggesting a data class, inferring an industry,
proposing a confidence level, or drafting a commitment note someone signs without
reading. Each looks like automation and is the model deciding something a person
must own.

Also out of 2.0: portfolio learning (meaningless with two institutions),
authentication (**the trigger is a person needing to see a record, not a date**),
multi-tenancy.

---

## Method, carried forward from this month

**Make invalid states unrepresentable rather than guarded.** The forms' tri-state
booleans and the nullable committer name both came from this, and both were better
than the instruction that produced them.

**Build against one call site before eleven.** The heartbeat work stayed clean only
because HB-0006 was proven alone first.

**Findings come from building, not from rosters.** The unreachable commit stage, the
`[SIM]` wire format, and the conflated delta above were each found by trying to
build the next thing and noticing the ground was not there. **Keep 2.0 short and
discover the rest.**

**Fix local parity first.** The migration tracker claims 0013 is applied and the
column is absent, so `drizzle-kit migrate` will skip it forever. Local cannot reach
states production is in daily. This is already costing verification coverage.

---

## 2.0 item 1 — model versioning — closed 30 August 2026

The defect: `human_commit_of_record` changed what it reads in the same deploy as a
commit being recorded. Run 13 shows that factor going 0 → 10, and a reader infers
*someone committed*. What happened is that someone committed **and the question
changed**. Nothing recorded which model scored the run, and `compareRuns` could not
distinguish a change in the world from a change in the ruler.

### TWO IDENTIFIERS, NOT ONE

**`MODEL_VERSION = '1.0.0'`** — a declared semantic string. For people. Bumped
deliberately.

**`MODEL_FINGERPRINT`** — `sha256Hex` truncated to 12 chars, computed at module load
over the model's own constants: `CONFIDENCE_FACTOR_WEIGHTS`,
`CONFIDENCE_FACTOR_QUESTIONS`, `CONFIDENCE_BANDS`, `ATTESTATION_CREDIT`. Currently
`d4cf8f31472a`.

Why both: a hand-maintained version string is a convention, and this codebase has
found four instances of a text prefix standing in for a column — the same shape,
one category wider. A fingerprint cannot be forgotten. But a fingerprint is not
readable, so a human needs the declared version too.

**If they ever disagree — same declared version, different fingerprint — THAT IS THE
FINDING.** Someone changed a constant without amending. `ATTESTATION_CREDIT`'s own
comment already said changing it *"requires an amendment"*; the fingerprint is what
makes that detectable rather than merely stated.

The fingerprint covers the **questions** as well as the weights. Changing what a
factor asks changes what a score means at identical weight — which is exactly what
happened on 30 August.

### THE LIMITATION, stated rather than glossed

The fingerprint covers the model's constants. **It does not cover the derivation** —
which column a caller reads to populate an input.

The 30 August change altered `produceRun`'s derivation *and* one question string.
The question change would now be caught. **A pure derivation change would not.**

A version that people believe covers derivation changes, when it only covers
constants, is worse than none — it manufactures confidence in exactly the way this
system refuses everywhere else. It is a partial detector, and knowing its edge
matters more than the coverage it gives.

### No back-fill

Existing runs carry neither field, and must not be given one. **A run given a
version it never had is a falsified snapshot.** Client types mark both optional for
the same reason: sixteen production runs predate them.

`value_runs.version` was not repurposed — that is the governance row-version.
Both identifiers ride in `payload.confidence`, alongside the `method` string that
was already stored per-run. **No migration was needed.**

### compareRuns qualifies rather than refuses

A top-level `model` block: versions, fingerprints, `comparable`, and a note.

```
both present, equal      comparable true   "Both runs were scored by the same model."
both present, different  comparable FALSE  names both fingerprints; if the declared
                                           VERSIONS match while fingerprints differ,
                                           says so explicitly — a constant changed
                                           without amendment
either absent            comparable FALSE  names which run predates versioning
```

**An unknown model is not the same as a matching one.** Defaulting the absent case
to comparable would be the plausible-default failure this system refuses.

**It does not refuse the comparison.** The diff is still useful and a reader may know
perfectly well what changed. A 409 would make the endpoint useless for the sixteen
runs that already exist. Report the fact, attach the qualification, let the reader
judge. No interpretation, no guessing which factors a model change would have
affected.

### Three weights on the card, deliberately

Rendered **above** the factor table — a reader must know whether the ruler moved
*before* reading the deltas.

```
same model        one quiet muted line. This is the normal case and must not shout;
                  a line that draws the eye every time becomes noise the reader
                  learns to skip, which would defeat it when the ink case fires
model unknown     the gold callout — a limitation of the record, not a fault
different models  THE INK BLOCK, same treatment as a governance refusal. Every
                  number below it is suspect in a specific way, and that earns ink
```

### Verified on production

```
run 17  first run carrying 1.0.0 / d4cf8f31472a
run 18  second run under the same model

run 16 → 17   MODEL UNKNOWN, gold callout, names the run that predates versioning
run 17 → 18   "Both runs were scored by the same model. Fingerprint d4cf8f31472a."
```

The fingerprint computed identically on the Mac and on production — deterministic
across machines. Parity held at 30.0/low and 80.0/high; the fingerprint does not
touch scoring.

**Case 2 cannot be demonstrated without changing a weight**, which was not done to
exercise a feature. It fires the first time a constant moves, and that is exactly
when it matters.

### Side effect worth noting

Run 17's findings dropped from three to one. **F2 — *committed by a synthetic
sponsor* — no longer applies**, because a real person committed. The findings model
reacted to the commit endpoint without anyone touching it.

### Remaining stale name

The confidence panel label still reads *Named human sponsor of record* while its
note reads *Committed by...*. The question text was updated; the label above it was
not. Smallest of the family and the last one left in that file.

---

## Refusals are recorded — 30 August 2026

2.0 item 2, parts A and B. The gap register (part C) reads this.

### The asymmetry that existed until today

`audit_log` captures every successful write. `heartbeat_events` records what the
institution owes itself. `record_documents` are immutable. **The system is built to
remember.**

And a refusal — arguably the most informative event it produces — left nothing. The
transaction rolled back and the attempt was forgotten.

Someone offered vendor-published evidence as a measured actual on 25 August. The
gate refused, correctly, and the system then behaved as though the offer had never
been made. **That is the record forgetting something true.**

There is a governance argument too. A refusal is the system **exercising
authority**, and authority exercised without record is what constitutions exist to
prevent. `lvrf_block_ai_actual` could refuse a hundred times and nobody could audit
whether it refused correctly — or notice that someone tried a hundred times.

### Why not audit_log

`audit_log` records state **changes**. It carries `old_row` and `new_row`, and a
refusal has neither — there is no old row and no new row, only an attempt and a
reason.

**An audit log containing things that did not happen stops being an audit log.** Its
guarantee today is that every row is a change that occurred. A `refused` operation
would break that, and anyone querying *what happened to this outcome* would get
answers that didn't.

### The refusals table

`endpoint, sqlstate, constraint_name, subject_table, subject_id, actor_person_id,
tenant_id, institution_id, message, attempted_payload, refused_at`.

`message` is **verbatim** — never truncated, rewritten or summarised. That sentence
is the product.

`attempted_payload` is `req.body` unsanitised. **What was offered is the point.**

`constraint_name` is nullable and is null in practice for trigger-raised refusals:
`lvrf_block_ai_actual` uses `RAISE EXCEPTION ... USING ERRCODE`, and Postgres
supplies no constraint name for that. Only a real CHECK violation populates it.

**No `deleted_at`, no `superseded_by_id`, no `status`, no `version`.** Same shape as
`record_documents`. A refusal is a **fact**, not a claim — it cannot be retired,
superseded or corrected. Nothing supersedes something that happened.

Triggers: `refusals_no_delete` only. No `_audit` — a refusals row is not a governed
claim. No `_touch` — there is no `updated_at`, because the row never changes.
Trigger count 63 → 64, and the hardening file's verification arithmetic was updated
in the same change, unprompted. Third time an agent has done that.

### THE CRITICAL MECHANISM — do not "fix" this

**The refusal is written on a separate connection from the pool, never
`req.dbClient`.**

`actorContext` rolls back `req.dbClient`'s transaction on any status ≥ 400. A
refusal record written on that client **would be rolled back with the thing it
records — the record would erase itself.**

This is the only write in this codebase that deliberately commits outside the
request's transaction, and it is correct: **the refusal happened regardless of what
the transaction did.**

Someone will eventually change it to `req.dbClient` for consistency with every other
route. That would silently delete every refusal record, and nothing would fail
loudly. The reasoning is stated at length at the write site for that reason.

`actor_person_id` comes from the `x-actor-person-id` header, not from the
rolled-back transaction's setting.

**If the refusal write itself fails, it is logged and the 422 or 409 is still
returned.** A failure to record must never turn a governance refusal into a 500. The
caller's answer does not depend on our bookkeeping.

### Ten duplicated predicates removed

`isCheckViolation` was defined independently in **ten route files**, byte-identical
each time. Every new route copied it. Sixth instance of a convention that was not a
constraint.

`server/lib/refusal.ts` now holds `handleGovernanceError`, and the ten local copies
are gone.

**A dormant widening, flagged rather than slipped through:** four call sites handled
both 23514 and 23505; the other six handled only 23514, so a unique violation there
fell through to a **500**. Centralising means those routes now return 409 and record
the refusal.

That is the correct behaviour — a unique violation *is* a conflict with existing
state in every route, regardless of whether that route bothered to say so.
Returning 500 was the defect, and ten copies of a predicate is exactly how six
routes end up disagreeing with four. No exercised unique constraint sits on those
paths today, so this is a dormant-path correction, not an observed change.

### Verified on production

```
POST /api/value-outcomes/:outcomeId/evidence   422
```

```
endpoint      POST /api/value-outcomes/:outcomeId/evidence
sqlstate      23514
subject_table evidence
message       LVRF: vendor-published evidence may not support a measured actual...
actor         b6da352c  (from the header, not the rolled-back transaction)
tenant        Skillsoft      institution  Curia
payload       the full body verbatim, five fields
```

The evidence row created moments before the gate refused the link was rolled back
with the transaction. **The refusal record survived it.**

Then, with a row present for the first time:

```
delete from refusals;

ERROR:  LVRF: refusals is a governed object; hard DELETE is prohibited. This is an
        immutable record of an attempt that was refused; it cannot be deleted,
        because the attempt happened.
```

### Note: the trigger was untested when first applied

`begin; delete from refusals; rollback;` on the empty table returned `DELETE 0`, not
a refusal — a `BEFORE DELETE ... FOR EACH ROW` trigger only fires per row.

Correct behaviour, but worth naming: **every other `_no_delete` in this system was
proven against a real row, and this one could not be until a refusal existed.**
Given how many things in this codebase turned out to be declared and not applied, an
untested guard is worth flagging rather than assuming. It is now proven.

### What this makes answerable

`refusals` is queryable. *How often did the gate refuse, on what, offered by whom,
and with what payload* now has an answer. That is the audit of authority that was
missing.

### The limitation, stated

**This records refusals arriving through an endpoint.** A refusal raised in a `psql`
session — as every gate test in this project's history has been — leaves nothing.
The trigger raises and no application is listening.

Do not describe this as complete coverage.

Provenance of the entry above: migration 0016 and the hardening update were applied
on srv1862778 on 30 August 2026, and both results — the recorded refusal and the
blocked DELETE — were produced there via curl to 127.0.0.1:3001 and psql as
postgres. The session that authored this entry generated the migration locally and
did not run it, and flagged that it could not attest to the production claims.

---

## 2.0 item 2 closed — the gap register — 30 August 2026

`GET /api/value-outcomes/:outcomeId/gaps`. One entry per unearned or
partially-earned confidence factor: what would close it, what kind of ask it is,
what it earns, whether an attempt has already been refused, and whether the path
itself is viable.

### It is not "priced", and the word was dropped

Attaching a cost would mean the system estimating an engagement, and it has no
basis for one. **Inventing a figure is what this instrument refuses.** The price
IS the requirement, stated precisely — derivable rather than asserted.

### It is a current view, not part of the record

A run's payload holds the factors as they stood when it was produced. The register
says what would close them **now**. Rendering it beside a locked score would create
the incoherence `EvidenceCard`'s comment warns about — a fresh plan next to a
frozen number.

It recomputes confidence from live state and never reads a stored payload.

### Step 1: the reason as data, not prose

`ConfidenceFactorRow` carried a note explaining *why* a factor was unearned, as
prose. The register needed that as data — and re-deriving the conditions would have
been a second implementation of one rule, the divergence shape `heartbeatLedger.ts`
warns about.

`metricDefinitionGap` already did this correctly for one factor. The pattern was
extended rather than replaced: every row now carries `gap`, computed at the same
place the note is computed.

Discriminants found by reading the branches, not by assuming:

```
metric_definition_confirmed   no_notes, unconfirmed, confirmer_simulated
baseline/actual_evidence      none_attached, evidence_unqualified, attested_only
impact_basis_evidenced        unsubstantiated, self_declared_inference
human_commit/verifier         absent, simulated
```

**`evidence_unqualified` was not in the spec** — evidence attached but none of it
earning credit, distinct from none attached. In a customer conversation it is the
*more* actionable of the two: something was supplied and it did not qualify.

It was deliberately not split four ways (unverified source, unnamed attester,
synthetic attester, vendor-side attester) because the outer loop only reports the
strongest item's note. **A discriminant the model cannot determine would be
inventing precision.**

`gap` is null only when earned equals weight. A partially-earned factor still has a
gap: baseline at 15/25 is not closed.

**The fingerprint held at `d4cf8f31472a`** across this change — the versioning built
an hour earlier proving the change stayed in scope, rather than us asserting it did.
First real use.

### Ask types, because the register must work in a room

```
definition   no_notes, unconfirmed, confirmer_simulated,
             unsubstantiated, self_declared_inference
document     none_attached, evidence_unqualified, attested_only
person       absent, simulated
```

*"We need an extract from your HRIS"* and *"we need someone at your company to put
their name on this figure"* are entirely different asks. The first goes to an
analyst and takes a week. The second needs someone with authority accepting
accountability — **a decision, not a task.** Conflating them makes the register read
as a checklist when half of it is a negotiation.

Ordered **definition → document → person**. Nobody signs their name to a figure
whose definition was not agreed, and no extract can be gathered until both sides
agree what the number counts. **That ordering is the register's real output — a
sequence a conversation can follow, not a list.**

### Person asks name the requirement, never the person

`persons_on_record` returns who is real and non-simulated at the institution. It
does not nominate anyone.

The system knows who is in `persons` — a data artifact, not a judgement about who
has authority to stand behind a figure. Nominating from that list would infer a fact
nobody stated. And in the room, *"needs a named verifier at Curia"* invites the
customer to choose; *"ask your VP of HR"* has made an organisational assumption in
front of them.

At Curia the list holds one entry — the external analyst — which tells the customer
plainly that **nobody from their side is on record yet.**

---

## DEFECT IN THE ORIGINAL SPEC: state and path were never one axis

The register was specified with three mutually exclusive states: `open`, `refused`,
`structurally_unobtainable`. **They are not mutually exclusive.**

Curia's `actual_evidence_verified` returned `gap: none_attached`, `state: refused`,
and a requirement reading *"Evidence supporting the actual value must be attached."*
All three true, and together they mislead — the requirement says attach evidence,
the refusal beneath says why that will not work, and nothing says whether the source
can ever work.

Split into two independent axes:

```
state   open | refused        a fact about HISTORY: has an attempt been rejected
path    viable | blocked      a fact about the PRESENT: would effort on the current
                              source ever close this
```

Four combinations, all meaningful:

```
open    + viable    nobody has tried; effort will close it
refused + viable    someone tried and was rejected; a corrected attempt could work
open    + blocked   nobody has tried, and the only source that exists cannot qualify
refused + blocked   tried, rejected, and the source can never qualify — STOP
```

**"Try again with a different source" and "this source will never work" are
different instructions.** A register that cannot distinguish them sends someone down
a road with no end — the exact failure it exists to prevent.

### FINDING: `blocked` is currently unreachable, and that is correct

For `path: blocked` to fire on `actual_evidence_verified`, inadmissible evidence
would have to be successfully **linked** as an actual — and `lvrf_block_ai_actual`
prevents precisely that. **The gate makes the state it guards against
unobservable.**

Curia has four evidence links and none supports the actual, because every attempt
was refused and rolled back. So `refused + viable` is honest: the source chosen was
unusable; the path is not. A figure from Curia's HRIS would qualify.

The detection stays as a defensive check — it would fire if the doors changed, or
for a kind inadmissible under some future rule.

### The requirement now reflects what was refused

```
"Evidence supporting the actual value of ... must be attached. An earlier attempt
 to satisfy this was already refused — see refusal_message for why — so the next
 attempt needs to address that reason, not repeat it."
```

It **points at** the message rather than duplicating it. One copy, no drift.

---

## DEFECT: refusals cannot identify their outcome

`findEvidenceRefusal` only claims `refused` when the institution has exactly one
live outcome — a guard against misattribution that is **actively protecting against
a real ambiguity today**, since both seeded institutions carry many outcomes.

The cause is mine. A refusal row carries no outcome id: the evidence row it names
rolls back, and the request body has no outcome id in it. But **the URL does** —
`POST /api/value-outcomes/:outcomeId/evidence` — and `handleGovernanceError`
receives a `context` with `subjectId`. The id was available and the wrong field was
specified for it.

The fix is to record the outcome, not to guess it. Not done in this change.

## FINDING: `refused` is nearly unreachable for four of six factors

Only `POST /api/value-outcomes/:outcomeId/evidence` routes violations through
`handleGovernanceError` into `refusals`. Everywhere else:

- `validateMetric`'s confirmer-simulated check and `outcomeWalk`'s committer and
  verifier checks are plain `res.status(422)` **before** the write — the database is
  never reached, so nothing is recorded
- no route writes `claimed_currency_impact`, `realized_currency_impact` or
  `impact_basis`, so `value_outcomes_impact_requires_basis` cannot fire through any
  live endpoint

So `state` can only be `refused` for the two document-type factors. Everything else
reports `open` even when a rejection genuinely just happened at the application
layer.

**Whether that should change is a real question, not an oversight.** An application
precondition refusing early is different from the constitution refusing — but "we
checked and stopped you" is still an attempt that happened, and the register cannot
currently say so.

Documented in the file rather than wiring a query that would silently never match,
or worse, misattribute an unrelated refusal.

---

## buildConfidenceInput extracted, not duplicated

The register needed `produceRun`'s derivation from live rows to `ConfidenceInput`.
Rather than copy it — two implementations of one rule — it was extracted into
`confidenceModel.ts` alongside `fixtureEvidenceToInput`. `produceRun` now calls it
and is 26 lines shorter.

Parity held: 30.0/low and 80.0/high, findings unchanged.

## Local migration drift resolved

Local was missing 0013–0016 while the journal claimed 0013 applied. Backed up,
migrated, then **verified against `information_schema` rather than the journal** —
the journal is what lied in the first place. Both confirmation columns and the
`refusals` table now exist, and the migration table matches `_journal.json` with no
drift.

Local can now reach states production is in daily.

---

## 2.0 item 6 closed — the shopping list — 30 August 2026

Card `01B` on the run page, rendered entirely from the gap register response. **No
endpoint, no model call, no generation.** Every word comes from the register or is
fixed template text, and that is structurally true rather than a matter of
discipline — there is no other source of data available to the component.

### Why a shopping list, not a brief

A shopping list is complete, ordered, and unglamorous. You do not hand someone a
persuasive essay about milk.

It is also the right register for a customer conversation: *here is what we need
from you, here is why each item matters, here is what it unlocks.* No argument, no
pressure — just the things.

### Three verbs, because the asks are genuinely different

```
AGREE     definition   what a measure means, before anything is gathered
OBTAIN    document     a thing someone produces
CONFIRM   person       someone accepts accountability for a figure
```

Ordered as the endpoint returns them. Nobody confirms a figure whose definition was
never agreed.

### THE FINDING: the card and the paste are different artifacts

This came from reading the output as an email rather than as a feature.

**On screen**, context surrounds the list — the metric, the score, the refusal
banner, the spine. The list is the last thing you need because everything else is
visible.

**In an email it arrives alone.** And what was missing was not decoration, it was
the recipe: *you know what a shopping list is for because you know what you are
cooking.* The paste said "get these things" without saying what is being built,
where it stands, or what completing it achieves.

So the text form — and only the text form — gained a header:

```
Value record for {engagement} — {metric}.
Computed confidence: 55/100 (MEDIUM).
Closing the 3 items below adds 45 points.
Once closed, the outcome can be verified and the record shared with the customer.
```

Every value computed. The sum of `earns` is an exact sum, not an estimate.

### F4's absence is information

The header was specified to carry finding F4's own wording — *"the record is not
defensible to a finance function in this state"* — **where it applies.** It did not
appear, and that was correct rather than a gap.

F4 fires only when the band is `low`. Run 19 is `medium`, so the record has moved
past the state F4 describes.

**Filling that silence with a softer sentence would have been marketing copy in a
governed artifact.** A medium record is not indefensible, and the system declining
to say so is the honest outcome. The absence carries meaning.

### The today's-list caveat, unconditionally

Rendered at the top of the card and in the paste, always:

> This is today's register, computed from the outcome as it stands now — not from
> this run's payload. On a locked run the confidence score above is a photograph;
> this list is not.

This is the one way the card could mislead. A shopping list beside a frozen score
looks like it belongs to it — the incoherence `EvidenceCard`'s comment warns about.

### Two wording fixes found by reading the output

**A field name leaked into customer-facing copy.** The refused requirement read
*"see refusal_message for why"* — a JSON field name, in text that gets pasted into
emails. Now it says the reason is below, and the message renders beneath it. One
copy, no drift.

**The metric was named three times** — opener and both OBTAIN items. Requirements
now read *"the baseline"* and *"the actual value"*; the subject is established by
the record they belong to.

The standalone test applied to each string: the register is an API response and a
consumer may render one entry without the header, so every requirement must still
name a concrete action in isolation. *"An independently source-verified extract for
the baseline is needed for full credit"* passes. *"The value must be attached"*
would not.

`metric_definition_confirmed`'s three strings had the same repetition and were fixed
too — `confirmer_simulated` needed restructuring, since the metric name was the
sentence's possessive subject rather than an aside and could not be dropped
mechanically.

**Consequence, taken deliberately:** removing every use made `metricName` genuinely
dead on `buildRequirement` and the structural override. A parameter that is accepted
and silently ignored tells the next reader something is used when it is not — the
same class as a stale name, and this codebase has found six of those. Removed,
along with `bm.name` from the query and one stale comment.

### Also fixed: a column with no information

`HeartbeatCard`'s Stage column read *No stage* on every row. Runtime emitters do not
set `value_stage` — correct, a lock is not a spine stage — so the column was width
with nothing in it. It now renders only when at least one event in the set has a
stage, and the per-row fallback survives for the mixed case.

### Roster: the payload carries no institution name

`produceRun` fetches `institution_id` and never joins for the name, so anything
rendering from a payload can identify the **engagement** but not the **account**.

Found because the paste's opener uses the engagement name, which at Curia reads
*"Curia — reference example, not an engagement"* — a label doing duty as a noun
phrase. The template is right and the data is unusual; that is the correct order of
things. A real engagement name reads cleanly.

Will matter for the record document renderer.

### Verified on production

```
Value record for Curia — reference example, not an engagement — Time to full
productivity, newly promoted manager.
Computed confidence: 55/100 (MEDIUM).
Closing the 3 items below adds 45 points.
Once closed, the outcome can be verified and the record shared with the customer.
[today's-list caveat]

OBTAIN — a thing someone produces
  An independently source-verified extract for the baseline is needed for full
  credit — the current evidence is attestation-only. (+10 of 25)
  Evidence supporting the actual value must be attached. An earlier attempt to
  satisfy this was already refused — the reason is below. (+25 of 25)
    Already refused: LVRF: vendor-published evidence may not support a measured
    actual. AMENDMENT-005 Article I. The actual comes from the customer's system
    of record.

CONFIRM — someone accepts accountability for a figure
  A named, non-simulated person of record must verify this outcome's result.
  (+10 of 10)
    On record: Brad Piver (external analyst of record)
```

**This is the first output of the system that could be sent to a customer as-is.**
Every claim in it was computed; nothing was written to persuade.

---

## 2.0 item 4 — self-drift detection — 30 August 2026

The instrument now checks whether its own record is accurate, and reports what it
finds by the same standard it applies to everyone else's claims.

### Drift is a finding, not a health signal

Health measures **faithfulness to a process** — did the institution do the things it
owes itself. A dimension at 25% coverage is not wrong, it is unmeasured, and the
model is careful never to conflate those.

**Drift is not unmeasured. Drift is a false statement sitting in the record.**
Reporting it as a coverage gap would be the softest possible way to say so.

So it joins F1–F4 as a finding: something wrong that demands treatment.

### Two addressees on one card

`Finding` gained `subject: 'outcome' | 'instrument'`, and drift uses a separate
**D-series**.

F3 means *get a verifier* — a customer can close it. D1 meaning *a declared trigger
is missing* is not a customer's problem and no engagement can close it. Same card,
different addressee, and the reader must be able to tell who has to act.

**A field, not a naming convention.** A code prefix is a convention; this codebase
has found six conventions that were not constraints.

Severity for a drift finding is `warning` or `critical`, **never `watch`**. Watch
means keep an eye on this. A false statement in the record is not something to watch
— it is wrong, and wrong needs treating.

### D0 — the ambiguity that had existed for twenty runs

A drift check that passes produces nothing. So an empty findings list means either
*the checks ran and found nothing* or *the checks did not run* — different facts,
and the record could not say which.

**Twenty runs carried an implicit claim they never earned.** The findings card
looked clean, and clean meant nothing about whether the instrument had checked
itself.

D0 fires when `driftChecksRan` is false: *the drift instrument's self-checks did not
run for this record.* Run 20 was the first run to say so.

`driftChecksRan` and `driftFindings` are **required, not optional**. Any default is
itself an assertion — `true` would be the plausible-default failure, and `false`
would assert a governance fact by omission on every existing caller. Required means
TypeScript forces each call site to decide. Three callers broke on compile, which
was correct.

### D1 — declared triggers still present

Compares `hardening_manifest` against `pg_trigger` **by name and table**.

> **Lists, never counts.** On 23 August a count of 41 reconciled by coincidence
> while five declared triggers had never been applied. That coincidence is why this
> check exists.

```
in manifest, absent from pg_trigger   CRITICAL, names every one
manifest empty                        WARNING — hardening has not run; NOT a pass
manifest stale                        WARNING
otherwise                             silence
```

### The manifest, and why it is not a constant

The expected trigger list could have lived in the checking code. That would be a
**second declaration** of what `hardening.sql` already declares — two lists,
hand-synchronised, drifting silently.

**A drift detector that drifts is the most embarrassing possible failure of this
feature.**

`hardening.sql` writes the manifest at the end of every run, **derived by reading
back `information_schema.triggers`** rather than enumerating from its own arrays.
That was the agent's call and it is better than the specification: a tenth
individually-declared trigger added later is captured automatically, because there
are no paired inserts to forget. It also records what was *actually created* rather
than what the file *intended* to create.

The manifest is truncated and repopulated each run — **the one place truncation is
correct in this system**, because it records what THIS run applied, not history. A
stale entry would be a false claim about the present. It carries no triggers of its
own; a `_no_delete` would prevent `hardening.sql` from working.

Trigger count stays 64, and the verification arithmetic says why the new table adds
none.

### What D1 cannot catch, stated rather than implied

**The manifest is derived from the same catalog the check reads.** So D1 detects
drift occurring AFTER a hardening run — a trigger dropped since. It cannot detect a
trigger that failed to create DURING the run, because the manifest would simply not
list it.

**The manifest records what `hardening.sql` declared.** A trigger it never declared
is invisible to both. This catches *declared-but-missing*, not
*applied-but-undeclared*.

That is the direction the 23 August gap ran, so it is the right coverage. The record
must not imply more.

### SQL only, deliberately

A check that reads files can fail for boring reasons — a permission error, a moved
file — and would emit a drift finding about the **checker** rather than the system.
A finding must mean something is wrong with the record.

Filesystem-level drift (client types versus server returns, `ops/` files versus
deployed ones) belongs in a lint or a build step. It lives on a developer's machine
at authoring time and no runtime check will ever catch it.

### A hole in the spec, caught by the agent

`runDriftChecks` runs inside `req.dbClient`'s transaction. If any of its queries
errors, **Postgres aborts the transaction server-side — a JS `try/catch` does not
undo that**, and every later query including the `value_runs` INSERT would fail.
The instruction "do not let a drift check failure fail the run" would have been
violated by the obvious implementation.

Resolved with the `SAVEPOINT` / `ROLLBACK TO SAVEPOINT` pattern already established
in `walkSpine.ts`'s `verify_guard`. **A failed check is an unrun check**: catch it,
pass `driftChecksRan: false`, let D0 fire. Producing a record matters more than
checking it, and D0 already says the record is unverified.

### Verified on production

```
run 20   F3 (outcome, warning)  +  D0 (instrument, warning)   checks not yet wired
run 21   F3 (outcome, warning)                                checks ran, lists matched
```

Silence is also what a broken check produces, so the comparison was proved by hand:

```
begin;
drop trigger evidence_touch on evidence;
select count(*) from hardening_manifest m
  left join pg_trigger t on ... where t.tgname is null;
-- 1
rollback;
```

The join finds the absence. The destructive version — dropping a trigger on
production to watch D1 fire through a real run — was **not** performed: real risk
for marginal gain, and the D0-then-no-D0 transition already showed the wiring works.

Worth noting what the test trigger does: `evidence_touch` maintains
`evidence.updated_at`. Had it stayed dropped, that column would silently stop
updating and nothing else would fail. **Harmless-looking, invisible at runtime, and
detectable only by comparing lists** — precisely the class D1 exists for.

### Deferred, with reasons

- **D2** migration journal versus schema. Local's exact failure — the journal
  claimed 0013 applied while the column was absent — and checkable only for
  migrations whose effect is inspectable
- **D3** governed tables missing governance columns. `lvrf_touch` errors on write to
  a table with no `updated_at`
- **D4** orphaned supersession — `superseded_by_id` pointing at a deleted or
  nonexistent row

---

## Research intake, and a reversal — 30 August 2026

2.0 item 5. What was built is narrower than what was scoped, and the reason is
worth more than the feature.

### The staging table — research_results

Research intake is four stages: **LVRF generates a prompt, a human runs it in an AI
agent, LVRF parses the response, a human accepts or rejects each field.**

Parsing and accepting produce **different facts**. Parsing establishes that the
agent returned this; accepting establishes that a person judged the citation
checkable and the value worth recording. Collapsing them would make pasting an act
of endorsement, and nobody could tell which fields a human actually looked at.

A parsed field is **not evidence**. Evidence is a claim the system stands behind.

**Three review states, not two:** `pending`, `accepted`, `rejected`. A field nobody
has looked at is not rejected — the absent-versus-simulated distinction, third
instance today. This also makes review **per field and partial**: accept two, reject
one, leave three.

**A rejected result is kept.** *We researched this and rejected it* is a fact, and
this system forgets everything it declines — the same argument that produced
`refusals`.

Three CHECK constraints enforce the shape rather than trusting it: a decision has a
decider and a time; `found` implies value and citation while not-found implies a
reason; accepting implies an evidence row exists.

**No confidence column.** LVRF computes confidence from the evidence ledger and
never accepts an asserted one. An agent's self-declared confidence has no place in
the record.

`query_as_executed` sits alongside `research_query`, because **an agent may narrow,
decompose or rewrite the prompt it was given, and what ran is a different fact from
what was asked.** That is true with one user or a hundred; it is a provenance fact,
not an access-control one.

Trigger count 65 → 68.

### THE REVERSAL: the design was aimed at the wrong metric family

The question that found it was not technical. It was: **how does an account manager
sell value with this?**

**Two families, and conflating them cost a design:**

```
VENDOR METRICS            DRR, NRR, ARR. How the tenant measures itself.
                          PUBLISHED, therefore researchable. Not
                          industry-specific — identical for a CRM company.

CUSTOMER OUTCOME METRICS  audit findings, time to productivity, batch
                          right-first-time. What an account's business runs on.
                          Industry-specific, and NOT PUBLISHED.
```

**An account manager cannot sell against the tenant's DRR.** Nobody at Curia cares
about Skillsoft's retention rate. The solutions argument lives entirely in the
second family, because **a solution is a claim that an offering moves a customer's
business measure. Content moves consumption; a solution moves an outcome.**

And metric-value research **cannot reach the second family at all.** Curia's 214
days is in their HRIS. No public source contains it, and no prompt will find it.

### What the route became

`GET /api/business-metrics/:metricId/research-prompt` now refuses with 422 unless
the metric belongs to the tenant-self institution. Skillsoft's DRR is genuinely
researchable and the prompt is good for that narrow case; leaving the route looking
general would have implied a capability it does not have.

The refusal names the reason rather than stating a rule.

The prompt itself is composed entirely from live rows and asks for a citation
**specific enough that a person can locate it without further searching** — naming
the lazy answer in advance: *"investor relations" or a bare homepage URL is not a
citation.* Where `definition_notes` carries the literal `UNCONFIRMED` marker, it
also asks for the calculation methodology, with the instruction that **an
unpublished methodology is a finding, not a failure.**

### Still open on the prompt

The metric's cadence is Quarterly and the prompt asks for *the current reported
value*. An agent will return whatever it finds most recently, and **the value does
not carry its reporting period** — DRR at Q1 FY2027 and Q4 FY2026 are two different
facts with the same field name. The citation carries a date, but the period should
be its own field.

The parser (step 3) was not built. Building it against the wrong metric family
would have been the wrong parser.

---

## Industry packs — the shape, agreed 30 August 2026

**Pulled from 3.0 into 2.0.** Research intake cannot be finished without them: a
prompt asking *which measures carry money in this industry* needs somewhere for the
answer to live.

### Two layers, mirroring what the system already does

A pack is a set of business measures for an **industry**. Each entry is:

```
proposed   plausibly carries money in this industry. A HYPOTHESIS, marked as one.
           Populated by research or judgement.

ratified   sourced from a named institution's own system of record, at threshold.
           Carries its provenance.
```

**Same structure as an Outside-In hypothesis becoming a validated baseline** — which
means it needs no new mechanism. `lifecycle_status` already carries `proposed` and
`ratified`.

**That resolves item 4's surviving objection:** `promoted_at` was redundant because
`lifecycle_status` already says it. The other two objections are also gone — the
Compass boundary was withdrawn today, and the pack is now scoped as industry-wide
rather than needing two accounts to share one capability.

### THE THRESHOLD: N = 2, stated and never hardcoded

**One is a coincidence.** A measure sourced at a single account says that account
cares about it, not that the industry does. A pack built from N=1 is a pack of
anecdotes with a promotion mechanism attached.

**Three is where it should eventually sit**, and it is unreachable for years at
current pace. A threshold nobody can meet is a threshold nobody uses, and every
entry stays permanently proposed — which makes the two layers decorative.

**Two is the smallest number that means more than one institution independently ran
on this measure**, and it is reachable inside a real engagement year.

The threshold is a **stated value in the record and in configuration, never a
literal buried in code.** Changing it changes what every existing pack entry means,
which is the same argument that produced model versioning.

### Demotion exists

A ratified measure returns to `proposed` if the sourcing behind it is superseded and
not replaced. **A pack that can only gain entries accumulates stale truth.**

### No LVRF pack can be ratified today, and the threshold is not lowered to fix that

One customer account exists, and it is a reference example built from published
material. **Every entry would sit at `proposed` until a second real engagement.**

That is the same position the system takes everywhere else: the standard is not
relaxed to make the demonstration work.

### What a pack is FOR, commercially

An account manager working a CDMO opens the pack and sees the measures that carry
money there — which are hypotheses, which have been sourced at real accounts, and
where.

That is what turns *we sell manager training* into *in CDMOs, manager capability
shows up in scientist time-to-productivity, and we have sourced that at two
accounts.*

### And it resolves what research is for

Research does not find a customer's metric value. **It finds which measures an
industry cares about and whether an account says they matter** — which is exactly
what public sources contain. That populates the `proposed` layer. **Measurement
promotes to `ratified`.**

### Not CVAF's shape

CVAF's packs are **code modules** — `EPCIndustryPack.js`, authored, containing
prompt text and field definitions. **An authored pack is a starting hypothesis; an
earned pack is a conclusion.** LVRF's pack principle says earned, so the CVAF shape
is the proposed layer only, and LVRF needs the second.

---

## Industry packs — the schema, built from three research runs — 31 August 2026

Pulled from 3.0 into 2.0. Six migrations today; four of them are this.

### The taxonomy is the tenant's

`industries` is **tenant-scoped, not global** — it is drawn from Skillsoft's own
industry channel list, and another vendor running LVRF would have a different one.
Ten seeded, tenant resolved by name rather than id, since local and production
tenant uuids differ.

Three deliberate divergences from Skillsoft's list, each recorded in the migration:

- Their list spells it **"Geospacial"**. Seeded corrected. The divergence is
  deliberate, not a transcription error
- They list "Defense Industry"; seeded **Aerospace & Defense**, since their own
  channel content is titled "The Aerospace and Defense Industry"
- They list "Biotechnology" with no Pharmaceutical entry. **Combined**, because a
  CDMO sits in both. The taxonomy starts from the tenant's vocabulary and is not
  constrained by a content channel's organisation

`institutions.industry_id` was added **NULL on every row, and the existing free-text
`industry` was not migrated.** They are two different facts: `industry` is what was
stated at intake, `industry_id` is what it was classified as. **Classification is a
judgement a person makes**, and asserting it in a migration would be fabrication.

Both institutions are unclassified today. Skillsoft's intake text reads *Corporate
learning / talent development* — and no such industry exists in a taxonomy built for
its customers. `is_tenant_self` institutions may never take an `industry_id`, which
is coherent rather than a gap.

### industry_measures is NOT a business_metrics row

It is the **industry-level claim that a measure carries money.** An account's
`business_metrics` row is an *instance* of it at one institution, linked through a
nullable `industry_measure_id` — nullable because an account can track something no
pack knows about, and forcing every metric into a pack would invent
classifications.

That link is what makes promotion **countable**: *this industry measure has been
sourced at N institutions* is a query over it.

### Two layers, no new mechanism

`proposed` is a hypothesis. `ratified` means sourced at threshold.
`lifecycle_status` already carries both, so **no `promoted_at` is needed** — which
was item 4's last surviving objection.

**Threshold: N = 2, stated and never hardcoded.** One is a coincidence; three is
unreachable for years and a threshold nobody meets makes the two layers decorative.
No LVRF pack can be ratified today, and **the threshold is not lowered to fix
that.**

---

## THE THREE RESEARCH RUNS, and what they changed

The schema was designed against real output, not a guess. Three runs — CDMO,
Manufacturing (discrete and process), Healthcare providers — four measures each,
citations demanded.

### What came back

```
CDMO           1 of 4 addressable   Lot Acceptance Rate, FDA-defined
Manufacturing  4 of 4 addressable   TRIR feeds the workers' comp experience
                                    modification rate for three years at a time
Healthcare     3 of 4 addressable   one honest refusal, one named trap
```

Citations were **real and checkable**: Charles River Q2 2026 with a named CEO and a
quoted book-to-bill of 1.19x; Samsung Biologics with capacity in litres; Lifecore's
10-K with an accession number and *44%, 18% and 10%*; FDA's own Lot Acceptance Rate
definition; Louisiana-Pacific's OEE disclosed at 77% and 79%; Walmart's OTIF at a
98% threshold with a 3%-of-COGS fine; HFMA MAP Key FM-1.

### Finding: Curia's metric is confirmed as invented

*Time to full productivity, newly promoted manager* **does not appear** in the CDMO
run. Four cited measures a CDMO's CFO watches, and it is not among them.

It was inferred from a published case study — plausible and unsourced. **Exactly the
failure the pack is designed to prevent**, and the reason the pack exists rather
than a metric being proposed per account.

### Finding: most money measures are unaddressable

Three of four CDMO measures — book-to-bill, capacity utilisation, customer
concentration — **carry money and cannot be moved by workforce capability.** No
amount of manager training changes a customer's revenue concentration.

The Manufacturing and Healthcare prompts therefore asked for
`addressable_by_workforce_capability` explicitly, and the Manufacturing run returned
its own exclusion list unprompted: *"Excluded rather than dressed up."*

### Finding: confounders are where the traps live

Added to the Healthcare prompt after the first two runs, and it earned its place
immediately:

> *"A hospital that wins higher-acuity transfer and surgical volume will see raw
> length of stay rise while performing better, which is why raw ALOS is a trap"*

> *"The measure can be improved by writing off aged accounts rather than collecting
> them, so it must always be read alongside the denial write-off rate"*

A pack entry that hides its own misuse is worse than no entry. **`confounders` is
NOT NULL** — a measure with no stated confounders is a measure nobody thought about.

### The honest refusal that validated the whole exercise

Healthcare's **salaries and benefits as a percentage of revenue** came back
`addressable: false`.

That is the measure a learning vendor would most want to claim. It is labour cost.
It looks like the obvious training play. And the research says: **the denominator is
set by payer contract rates, so a rate increase lowers the ratio with no change in
labour behaviour at all.**

An agent willing to say no to that is an agent whose yeses mean something.

---

## Five required columns, each earned by the data

```
why_it_pays            NOT NULL   the commercial argument; the field an account
                                  manager reads aloud
addressable            NOT NULL   the whole pack turns on this
addressable_reasoning  NOT NULL   the reason, not just the flag
confounders            NOT NULL   where the traps live
citation               NOT NULL   a proposed measure without one is a guess
                                  wearing a schema
```

### addressable = false ENTRIES STAY IN THE PACK

Counter-intuitive, and deliberate.

A measure tested and **kept** with `addressable = false` is different from one
tested and **rejected**.

If the pack held only addressable measures, healthcare's salaries-and-benefits entry
would vanish — and **the next person to open that pack would propose it, because it
is the obvious thing to propose.** The pack would have tested it, learned it does
not hold, and then forgotten.

Commercially it is stronger too: an account manager who can say *"we deliberately do
not claim against your labour ratio, because your payer rates move it more than we
can"* is more credible than one who claims everything. **The refusal is the
product** — as it has been everywhere else in this system.

### industry_measure_exclusions

Measures tested and **rejected** for an industry, kept so the same wrong proposal is
not made twice. Same argument that produced `refusals`.

Insert-only. `_audit` and `_no_delete` only — and the `_audit` decision was
reasoned rather than copied: **a refusal IS the record of an attempt, so a second
audit row would duplicate it; an exclusion is a business judgement about a measure,
so its own trail is worth having.**

`citation` is nullable here, unlike on `industry_measures` — an excluded measure is
often a real one with a real source that simply does not hold. Capacity utilisation
has a Federal Reserve series behind it and is still excluded.

---

## research_results gained a discriminant

The table was designed for **metric values**: one field, one value, one citation,
scalar columns to match. A **pack measure** is a richer object — nine fields — and
does not fit scalars.

`result_kind` is `'metric_value' | 'industry_measure'`, **NOT NULL with no
default.** A default would be an assertion made on behalf of every caller, the same
reason `driftChecksRan` is required on `FindingsInput`.

No per-field columns were added for the measure shape. `raw_response` holds the
object; nine columns used by one kind and null for the other is the sparse-table
failure.

### A conflict that would have failed on the first paste

`research_results_found_shape` from 0018 required `value IS NOT NULL AND citation IS
NOT NULL` whenever `found = true` — **unconditionally.** An `industry_measure` row
has `found = true` with both NULL by design.

**The first pasted measure would have been refused, and it would have looked like a
parser bug rather than a constraint.**

Resolved by splitting the branch on `result_kind`, and the resolution is stronger
than relaxing it: `metric_value` still requires the scalar pair, and
`industry_measure` requires them to be **absent** — so a row cannot carry both a
scalar answer and an object, or neither.

`institution_id` was NOT NULL in 0018 and is now nullable, with
`research_results_kind_shape` enforcing the scoping instead: a metric value has an
institution and no industry; a measure has an industry and neither institution nor
metric.

### Verified on production — three directions

```
metric_value, found=true, null scalars        REFUSED  found_shape
industry_measure, found=true, scalars set     REFUSED  found_shape
industry_measure, found=true, object only     INSERT 0 1
```

A constraint that only fires one way would let the shapes blur exactly where the
discriminant was meant to keep them apart.

Trigger count 68 → 76 across the four pack migrations.

### Not seeded

The three research runs are **data a person reviews and accepts**, and accepting is
a separate act from creating the schema — the same reason
`institutions.industry` was not migrated to `industry_id`.

Nothing writes to `industry_measures` yet. The parse-and-review path is next, and it
goes through `research_results` rather than a direct create endpoint: **a pack entry
arriving with no record of the research that produced it would bypass the flow
entirely.**

---

## Industry pack accept/reject built — 5 September 2026

Parse-and-review's second step: `POST /api/research-results/:id/accept` and
`POST /api/research-results/:id/reject`. Accept turns one pending
`industry_measure` result into a `proposed` `industry_measures` row, in one
transaction; reject records that a person judged it unsound. Neither writes
`industry_measure_exclusions` — that table is a standing per-industry judgement,
narrower than one rejected research response; a person-reviewed path from rejected
`research_results` into it is still future work.

### A conflict caught before it shipped

`research_results_accepted_has_evidence` (0018) required `evidence_id IS NOT NULL`
whenever `review_state = 'accepted'`, **unconditionally** — written when
`metric_value` was the only kind, and accepting one always creates an evidence row.
Accepting an `industry_measure` creates an `industry_measures` row instead; it has
no evidence to point to. Every industry-pack accept would have been refused by a
constraint that looked like it was protecting the table, not blocking it.

Resolved with migration `0022`: added `industry_measures_id` (nullable, FK
`industry_measures`), and replaced the constraint with `research_results_accepted_has_record` — same discriminant as `research_results_kind_shape` and
`research_results_found_shape`, and an XOR rather than an OR: an accepted row must
carry its own kind's id and not the other kind's.

### Finding: a local database without `hardening.sql` has NO governance

Caught while testing the accept route: `research_results.reviewed_at` — meant to be
stamped by the `research_results_touch` trigger (`hardening.sql` §10) on every
`UPDATE` — stayed `NULL`, and `research_results_review_is_complete` refused the
accept. `pg_trigger` on the local dev database showed **zero** rows: `hardening.sql`
had never been run against it, only `drizzle-kit migrate`. Tables, columns and every
CHECK constraint looked completely normal under `\d` — nothing about that command,
or a clean `drizzle-kit migrate`, reveals that every trigger in the system is
missing: no audit trail, no delete guards, no server-set timestamps, no
supersession checks. Every test run against that database up to this point proved
the code path executed, not that governance held. Documented prominently in
`LVRF_Local_Setup.md` (a FINDING at the top of the document, and reinforced at
Phase 8) rather than fixed quietly — the setup steps were followed in order and it
still happened, so the gap is in what verifies the setup, not just in one missed
command. Re-run: `psql -d lvrf -f db/hardening.sql`, idempotent, safe after every
migration.

### Routing correction

Accept/reject first landed as more routes on `industryResearchRouter`, mounted at
`/api/industries`. Wrong: neither route is industry-scoped, and mounting them there
put an industry-shaped prefix in front of endpoints with no `:industryId` — the same
"wrong address" failure mode `recordDocuments.ts`'s write/read split exists to
prevent, just not yet triggered. Split into a second router,
`researchResultsReviewRouter`, mounted separately at `/api/research-results` in
`server/index.ts`. `industryResearchRouter` now carries only the industry-scoped
parse route.

Trigger count unchanged by this section — `hardening.sql` was already declaring
`research_results_touch`; the local database simply hadn't run it. No new table.

---

## The pack has entries — parse and review — 5 September 2026

`POST /api/industries/:industryId/research-results` parses a research response into
`research_results` as `pending`. `POST /api/research-results/:id/accept` turns one
pending row into an `industry_measures` entry. Reject records the decision and
writes nothing.

**Two routers, not one** — matching the `recordDocuments.ts` precedent. Parse is
industry-scoped; accept and review are not, and a router mounted at a prefix should
contain only routes belonging to that prefix.

### THE FIRST PACK ENTRY IS ONE THE PACK TELLS YOU NOT TO CLAIM

```
Salaries and benefits as a percentage of revenues
  % of revenues · decrease · proposed · addressable = FALSE
  "The ratio is set primarily by prices and mix that no amount of process
   improvement..."
```

That is the measure a learning vendor would most want to sell against. It is labour
cost. And the research says the denominator is set by payer contract rates, so a
rate increase lowers the ratio with no change in labour behaviour at all.

**Accepted first, deliberately.** If `addressable = false` entries were going to be
quietly dropped anywhere, the accept path is where it would happen.

The healthcare pack now holds four cited entries: three claimable, one explicitly
not. **An account manager opening it sees the most tempting metric in the sector
with *do not claim this* attached, and why.**

### Refuse wholesale, not partially

The parse route validates the entire payload — envelope, exclusion list, every
measure — before a single INSERT executes. On failure, one error carries every
issue and nothing is written.

**A parser that accepts what it understands and drops the rest is how a research
result becomes half-applied with nobody noticing.**

Proved on production with the Manufacturing run: **422, seven issues, nothing
written**, and `research_results` still at 4 afterwards.

### Version drift is a refusal, not a patch

Three research runs exist and **only one conformed.** The CDMO run predates
`addressable_by_workforce_capability`; Manufacturing has it but no `confounders`.
Both were refused:

> *"measures[0].confounders is missing. This response predates the current contract
> and must be re-run — a reviewer may not supply it at accept time."*

**A reviewer who fills a gap becomes the source of a claim that should have come
from the research.** The citation and the reasoning must originate together. Two of
three files were thrown away rather than patched, and both need re-running.

An addition not in the spec, and correct: **a field that is present but malformed
gets a plain type error, not the predates-the-contract message.** Bad data and an
old response are different problems with different remedies.

### The mapping is the only seam between the two shapes

`raw_response` holds the research object; `industry_measures` has columns. The
accept path maps nine keys explicitly and **refuses on anything unmapped**, naming
it.

A silently dropped field is a fact the research established and the pack forgot. The
parse route validates the shape on the way in; this is the second gate, and it
catches a `raw_response` written before a contract change.

### Accept produces `proposed`, never `ratified`

Accepting a research result is a judgement that a measure is **worth proposing** —
not that it is proven. Ratification means sourced at N=2 institutions and is a
separate act with a separate threshold.

409 on re-accept, naming the existing reviewer and date. **A decision is not
amended; it is a fact.**

---

## CONSTRAINT CONFLICT: caught before it refused every accept

`research_results_accepted_has_evidence` read
`review_state <> 'accepted' OR evidence_id IS NOT NULL` — **unconditional on
`result_kind`.**

An `industry_measure` accept creates an `industry_measures` row and has no
`evidence_id`, so **the constraint would have refused every pack accept.** Flagged
before any route code was written, and it also surfaced a gap in the spec: the new
id was to be stored on the row and no column existed for it.

Resolved with a new nullable `industry_measures_id` and a kind-conditional XOR,
renamed `research_results_accepted_has_record` since it is no longer about evidence:

```
review_state <> 'accepted'
OR (result_kind = 'metric_value'
      AND evidence_id IS NOT NULL AND industry_measures_id IS NULL)
OR (result_kind = 'industry_measure'
      AND industry_measures_id IS NOT NULL AND evidence_id IS NULL)
```

**An accepted row that produced nothing is a lie the database should refuse**, not
something the application promises to avoid. This table already carries
`kind_shape` and `found_shape` for exactly that reason — a hole here would sit
beside two constraints that exist to prevent holes, and an accepted measure with no
link would be indistinguishable from one that worked.

Applied as its own migration, before the routes, so neither was debugged against
the other.

## DEFECT: the routes were mounted under the wrong prefix

The accept and reject routes were defined inside `industryResearchRouter`, mounted
at `/api/industries` — so they resolved at
`/api/industries/research-results/:id/accept`. **Not industry-scoped, sitting under
an industry prefix, with no `:industryId` in the path.**

Flagged rather than silently changing the mount, since "no mount change" was an
explicit instruction. Fixed by splitting into a second router at
`/api/research-results`, and verified that the old nested path now 404s at the
Express router level.

---

## FINDING: local had no triggers at all

`db/hardening.sql` had **never been applied to the local development database.**
Zero triggers existed.

Noticed only because `reviewed_at` was not being stamped during an accept test — a
trigger-maintained column staying null.

**So every local test before tonight ran against a database with no governance
whatsoever:** no audit trail, no delete protection, no gates, no supersession
checks, no simulated-attestor refusals. Local test results carry materially less
weight than they appeared to.

This is a wider version of the migration-journal drift already on the record.
`LVRF_Local_Setup.md` now carries a prominent FINDING before Phase 0 and a
reinforcement where `hardening.sql` is first invoked, with the `pg_trigger` count
check to self-diagnose.

---

## Still outstanding

- **CDMO and Manufacturing must be re-run** with the current prompt. Both were
  correctly refused; their measures are lost until re-run, and that is the cost of
  not letting a reviewer patch a response
- The **exclusion list is not written by parse.**
  `industry_measure_exclusions` requires `excluded_by_person_id` — a person's
  judgement — so an exclusion an agent proposed is a candidate, not a decision.
  Six healthcare exclusions are sitting in the parsed payload with nowhere to go
- **Rejecting a research result does not create an exclusion.** A rejection is
  narrower than a standing industry-wide judgement
- **The account workbench does not exist**, nor the model underneath it.
  `institutions` has no website column, the create form writes `industry` as free
  text rather than `industry_id`, and company inputs have nowhere to live at all
