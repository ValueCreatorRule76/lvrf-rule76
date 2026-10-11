# LVRF — Build Status

**28 July 2026.** Build officially commenced.

**Forward plan:** [`docs/LVRF_PLAN.md`](docs/LVRF_PLAN.md) — the one ordered plan (status ledger, loose ends, decisions, queue). DRAFT until approved.

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

> **Unverifiable, annotated 10 October 2026.** No row on prod supports this, and
> none could: the parser's `ValidationError` 422 returns before
> `handleGovernanceError` is reached, and `refusals` records only database
> refusals (CHECK and unique violations). A refused parse leaves no trace by
> design. The claim may well be true, but the database cannot show it.

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

- ~~**CDMO and Manufacturing must be re-run** with the current prompt.~~ Both
  were **re-run on 5 September at 2 measures each** and accepted:
  CDMO (filed under `pharmaceutical-biotechnology`) produced Lot Acceptance Rate
  and Order Backlog; Manufacturing produced TRIR and Manufacturing Capacity
  Utilization Rate. ~~**Both packs are thin next to Healthcare's 4.**~~ Item (b)
  closed this on 10 October: both are now at 4. See *Item (b) — Manufacturing and
  CDMO packs filled out* at the end of this file.
- The **exclusion list is not written by parse** — still true, by design.
  An exclusion an agent proposed is a candidate, not a decision. ~~**Thirteen
  candidates have nowhere to go.**~~ 10 October: `POST
  /api/industries/:industryId/exclusions` is the person's path (see *Exclusions
  get a writer*). ~~The 13 still await a decision each.~~ **Decided 10 October:
  12 excluded, 1 promoted, 0 dropped.** See *The 13 exclusion decisions*.
- ~~**Case mix index (healthcare): approved for promotion to a not-addressable
  pack entry, 10 October. Needs a research run producing the full measure
  shape with a citation; the 10 October decision was not to exclude it.**~~
  **Closed 10 October 2026.** Researched, parsed and accepted as a
  not-addressable Healthcare entry. See *Case mix index promoted*.
- ~~**Write routes respond before COMMIT.**~~ Closed 10 October 2026 — see *Commit
  before the response*.
- ~~**Sign-in P3, the tenant check on every route.**~~ **Deployed 11 October 2026.**
  Sign-in P1–P3 are complete; see *Sign-in P3* at the end of this file.
- ~~**A supersession writer for institution facts.**~~ **Deployed 11 October 2026
  (0028)**, and its first use is done: Skillsoft's `LVAF` was corrected to "LVRF
  (value realization records)" by Brad in the browser. See *Fact supersession* at
  the end of this file. **2.0's last roster item is closed.** What comes next is
  in `docs/LVRF_PLAN.md`, §4: Band A, once D3–D6 are confirmed. Moved up from
  the workbench's own list on 11 October, because a real fact now needs
  correcting.
  - The column, its `_supersession_sane` trigger and `_no_delete` exist; the route
    does not. A wrong fact today can only be outnumbered by a newer `as_of`.
  - **The first correction to make with it:** Skillsoft's `system` fact
    `c966ef3b-e9b3-423e-9026-dfcb07781b0c`. It was recorded on prod on
    11 October as the sign-in P2a verification write, with the value typed as
    `LVAF` instead of `LVRF (value realization records)`. Its evidence
    (`1e85f541…`) and provenance correctly say LVRF.
  - **The correction must supersede, not edit.** It needs a new fact with the
    right value, and the old row's `superseded_by_id` pointing at it, with the
    reason stated: *"Typed LVAF for LVRF at capture; the provenance says LVRF."*
    The typo stays in history.
  - **Until then it is deliberately left as is.** It is not edited in the
    database, and there is no second `system` fact alongside it.
- **Rejecting a research result does not create an exclusion.** A rejection is
  narrower than a standing industry-wide judgement
- ~~**The account WORKBENCH does not exist.**~~ Closed by `680dd29`: website,
  classify at create, and account facts backed by evidence. See *The account
  workbench — 9 October 2026* below; deployed 10 October.
- ~~**Local `lvrf` has no real pack data.**~~ Still true of `lvrf` itself, by
  design. **Since 10 October there is `lvrf_prodcopy`**, a local restore of a prod
  snapshot made by `scripts/restore_prod_copy.sh`. Its API responses are
  byte-identical to prod's (see *A local copy of prod data*). Test against
  `lvrf_prodcopy`. `lvrf` keeps its test fixtures and the four item (b) parses,
  left pending on purpose.
- **"Proved on production with the Manufacturing run: 422, seven issues,
  nothing written" is unverifiable.** No row on prod supports it, because
  `refusals` records database refusals (CHECK and unique violations), not the
  parser's 422s. It is annotated in place under *Refuse wholesale, not partially*,
  not deleted. A parse refusal that should be on record needs a writer of its
  own.
- ~~**Two readers don't check that an outcome's engagement is current:** the gap
  register's single-outcome count and metric re-validation's supersession of
  outcomes. Both include outcomes under retired engagements (`bf6f5b2d…`,
  `e3fb0061…` under `c47d075f…`). Filter them, or add an outcome retirement
  route if one is ever needed.~~ **Closed 10 October 2026.** See *Retirement
  freezes outcomes*. Four write paths were fixed as well.
- ~~Evidence refusals should record the value outcome id at write time, and the gap
  register should attribute only exact matches.~~ Closed 10 October 2026 by `0025` — see
  *Refusals name their outcome*.

---

## The pack and the account meet — 5 September 2026

Three screens built to close a demo gap: **the pack and the account were separate
demonstrations, and the argument only lands if an account inherits its industry's
pack.**

### /packs/:slug — the pack view

By **slug, not id** — this is a URL a person types or forwards, and
`/packs/manufacturing` is legible where a uuid is not.

Two groups, and the split is the whole page:

```
WHAT YOU CAN CLAIM AGAINST     addressable = true
WHAT YOU CANNOT — AND WHY      addressable = false
```

The second is a numbered card with equal weight, not a footnote. On the
manufacturing pack it is half the page.

**`WHAT MOVES THIS THAT IS NOT CAPABILITY`** renders in gold on every entry. That
label does the work — an account manager reads it before making a claim, and it
names the confounder rather than gesturing at uncertainty.

Every page carries, unconditionally: *nothing in this pack is ratified today.*
**An unratified pack that reads as settled is the overclaim this system exists to
prevent.**

Seven of ten industries are empty and say *no measures have been proposed for this
industry yet* — which reads as not-yet-researched, correctly.

### POST /api/institutions/:id/industry — classification is an act

Every institution had `industry_id` NULL, deliberately: the migration did not
classify anything, because **classification is a judgement a person makes, not a
fact a migration asserts.** This is that act.

`classification_note` is **required**, and written as an evidence row naming the
classifier. `institutions.industry` — the intake text — is never touched. Two
different facts: what was said, and what it was classified as.

Curia's classification names the reasoning that would otherwise have been lost:

> *The intake text reads CDMO, and the taxonomy has no CDMO entry... Classified
> here rather than Manufacturing because the regulatory regime, not the process,
> determines what carries money — lot acceptance is an FDA construct.*

409 on re-classification, naming the current industry. **Changing what an account IS
changes what every pack lookup against it meant** — same reasoning as a locked run.

### /accounts/:id — where the two halves meet

Everything else in this system is about one run or one industry. **This is about one
customer.**

```
00  INTAKE VS. CLASSIFICATION      both facts, side by side
01  WHAT THIS INDUSTRY SAYS CARRIES MONEY
02  WHAT THIS ACCOUNT IS ACTUALLY MEASURING
03  THE GAP
```

Section 03 is the demo. Two columns, four words of label, **no sentence connecting
them**:

```
NO PACK BASIS                    CLAIMABLE, NOT MEASURED
Time to full productivity,       Lot Acceptance Rate (LAR)
newly promoted manager
```

Nobody has to be told that a CDMO account measuring a manager-productivity metric
while ignoring FDA-defined lot acceptance has the wrong measure. **The screen
renders the mismatch and the reader draws the conclusion.**

This is also where Curia's invented metric — inferred from a case study in August,
absent from both CDMO research runs — becomes visible rather than argued.

---

## Four badge families, because coverage and basis are opposite questions

Five badges existed across two pages doing three different jobs with inconsistent
framing. `NOT MEASURING` and `NO PACK BASIS` were both absences, inversely framed,
and **neither said whether the absence mattered.**

The tenant-self case exposed it: DRR carried `NO PACK BASIS` — true, and reading as
a deficiency when the state is by design. There is no vendor-metrics pack for
Skillsoft's own metric to belong to.

```
STATUS        PROPOSED | RATIFIED              what the pack claims about itself
CLAIMABILITY  CLAIMABLE | NOT ADDRESSABLE      can an offering move it
COVERAGE      MEASURED | NOT MEASURED          does this account measure this
                                               PACK MEASURE
BASIS         PACK BASIS | NO PACK BASIS |     does this ACCOUNT METRIC map to
              NOT APPLICABLE                   a pack measure
```

**Coverage and basis are the reverse of each other**, which is why forcing account
metrics into a coverage vocabulary produced the harsh reading. A pack measure the
account fails to measure is a gap; an account metric with no pack basis is a
finding.

**No silent good state.** `CLAIMABLE` and `MEASURED` are rendered, not implied —
absence of a badge is ambiguous, and this system does not render absence as a state.

`NOT APPLICABLE` in neutral is the tenant-self case, and it reads as by-design
rather than as a deficiency.

**Coverage does not appear on the pack page at all** — that page has no account in
frame, so *applicable* has no referent there. Rendering nothing is correct rather
than a silent state. That was the agent's call and it was right.

---

## SIX RENDERING DEFECTS, all found by reading pages rather than code

1. **Section 01 said "yet" where section 00 said "never".** On a tenant-self
   account: *"not classified against an industry yet"* directly below *"and it never
   will be."* The `is_tenant_self` branch was handled in classification and not in
   the pack section. **Two sections contradicting each other on one screen.**

2. **`21 RUNS · 55.0 MEDIUM`** gave equal weight to the score and the count. The
   count is honest and it is also what makes a customer record look like a test
   harness. Current state now leads; history is a quiet secondary label. **No number
   changed and nothing was removed.**

3. **`source_system` competed with the metric name** — monospace at body weight,
   wrapping to two lines. The provenance was louder than the label.

4. **`NO PACK BASIS` on a tenant-self metric** read as a deficiency where the state
   is by design.

5. **Vocabulary drift in the gap section.** After the four families were defined,
   section 03's headings were the last place using the superseded words — a reader
   saw *addressable* in a heading and `CLAIMABLE` on a badge for the same property.
   Fixed, along with an empty-state message one line below it and a code comment
   describing the same states in old words.

6. **The empty pack**, which was not a defect — `/packs/retail` renders correctly
   and seven of ten industries are in that state.

### A judgement call worth recording

`IndustryPackPage`'s section titles — *WHAT YOU CAN CLAIM AGAINST* and *WHAT YOU
CANNOT — AND WHY* — are prose framings of `CLAIMABLE` and `NOT ADDRESSABLE`, and
were **deliberately left alone.**

> A heading is a topic sentence; a badge is a state label. Different registers can
> name the same property in different words without disagreeing. *What you can claim
> against* is better copy than *claimable*, and it answers a different question:
> which basket is this, versus what is this row.

The gap-section headings were different in kind — terse all-caps labels sitting
directly over rows whose badges said something else. **Same register, competing.**

That distinction is the rule for future copy in this client.

---

## Curia done right — the solution-to-measure chain — 5 September 2026

The demo argument: **an outside-in hypothesis without an industry benchmark reaches
for the measure that resembles the product. With the benchmark, it reaches for the
measure that carries money.** Same account, same vendor, better claim.

Both now exist on Curia, side by side, and both started at 10/100.

### What the first hypothesis was

*Time to full productivity, newly promoted manager* — inferred from a published
case study in August, with a baseline of 180 days that no Curia system supplied.
The capability behind it was named `New manager effectiveness`, **with no
description and no role family**, created by the attachment route with just a name
because nobody stated what capability was being claimed.

That is the content-shaped hypothesis visible in the data: **a capability named
after a training topic, with nothing said about what it changes.**

Neither CDMO research run produced that measure. The pack says the money is in lot
acceptance.

### What the second one is

```
Skillsoft Compliance Suite        content     PRIMARY
Skillsoft CAISY (simulation)      practice
Skill Benchmarks & Readiness      assessment
        ↓
GMP procedural execution — deviation handling and batch-record discipline
        ↓
Lot Acceptance Rate (LAR)         FDA-defined, addressable
```

**Three offerings, not one**, and of three different families. Deviation handling
under GMP is procedural competence: content delivers it, simulation rehearses it,
and the assessment is what makes the claim measurable at all. Without the third the
value claim rests on consumption rather than demonstrated ability.

### The claim names what it does NOT address

`capability_industry_measures.claim` is required and is the **mechanism**, not a
restatement of the link. Curia's reads:

> *Lot rejection under GMP traces to execution against the batch record...*
> *It does not address the confounders the research names: new-product introduction
> and technology transfer depress the rate for the first several batches regardless
> of skill, raw-material variability produces supply-chain rejections, equipment age
> drives deviations independent of the operator, and the ratio moves mechanically
> with how a site defines a lot. A claim on this measure must be read against those
> four.*

**That second half is what stops it being the same overclaim in better clothes.**

### THE BASELINE: researched, not invented

Curia's lot acceptance rate is not public, and `baseline_value` is NOT NULL — so
the outcome could not be created without a number.

**The rule is not "never infer." It is "never invent, and mark what is inferred."**
Run 1 of the first hypothesis did this correctly: 180 days marked ASSERTED, scoring
10/100 with `baseline_evidence_verified` at 0 of 25.

So a research run asked one question: **does a published benchmark VALUE exist for
lot acceptance rate?** Not the definition — that was already in hand from FDA.

**It does, and the search that found it is the useful part.** Nine sources checked,
five returning nothing:

```
FOUND      ISPE Quality Metrics Pilot Wave 1 (2015) and Wave 2 (June 2016) —
           figure-level medians, quartiles and distributions
NOTHING    FDA/CDER — definitions and a reporting framework only; the programme
           never reached mandatory collection
NOTHING    PDA — metrics defined, no values reported
GATED      BioPhorum, McKinsey POBOS — member and subscription only
WITHHELD   Wang et al. (2022) reports regression coefficients and explicitly
           withholds the baseline rates at two anonymised API sites
NOTHING    Samsung Biologics, Catalent, Lonza filings — no rate disclosed
```

**95.3%** was taken: the low end of Wave 1's API/Biologics/Other median range
(95.3–98.1%), because Curia does API and drug-substance work and **a claim built on
a conservative baseline does not collapse if the real figure is higher.**

Three limitations travel with it in `definition_notes`, all named by the research
itself: the data is from 2014–2015 and nothing comparable has been published since;
the sample **pooled innovator and contract sites** without segmenting CDMOs; and it
is **self-reported under a proposed FDA definition that participants applied
inconsistently**, which the Wave 2 report states itself.

`baseline_measured_at` is **2015-12-31** — the end of the ISPE collection window,
not a date on which anything at Curia was measured. Stated in the notes, so a 2015
date on a 2026 record reads as deliberate rather than as an error.

### Both hypotheses scored 10/100

**A better-aimed claim does not start with more confidence.** It starts in the same
place — asserted baseline, no evidence, nobody named — and the difference is what it
is aimed at, not how well supported it is on day one.

That is a stronger demonstration than a high score would have been.

---

## Two missing edges, both closed

```
offering -> capability          EXISTED  offering_capabilities, with is_primary
capability -> business_metric   EXISTED  value_outcomes ties them
capability -> industry_measure  BUILT    capability_industry_measures
business_metric -> industry_measure  WRITER BUILT — the column existed since 0019
                                     and nothing had ever written it
```

`capability_industry_measures` takes a **surrogate id** where `offering_capabilities`
uses a composite PK, and the reason is stated: **this table records a judgement with
an author**, and `lvrf_audit()` cannot serve a composite-key table. Dropping `_audit`
would keep the author and lose the record of changes to it.

That **sidesteps DEFECT-003 rather than closing it** — `offering_capabilities`,
`value_outcome_evidence`, `person_roles` and `reflection_evidence` still lack
`_audit` for the same reason. Forking `lvrf_audit()` inside a feature migration was
declined; that decision belongs on its own.

`POST /api/business-metrics/:id/pack-basis` requires a `basis_note`, because **the
two are not always the same thing**: a site computing lot acceptance over lots
RELEASED rather than lots STARTED is measuring a different number under the same
name. Curia's note says exactly that, and says the metric must be superseded rather
than reinterpreted if it turns out to be true.

Trigger count 76 → 78.

---

## FINDING: two individually-correct computations, jointly misleading

The account view showed Lot Acceptance Rate on **both sides of the gap** — `NO PACK
BASIS` on the left and `CLAIMABLE, NOT MEASURED` on the right.

The obvious diagnosis was a disagreement between two joins. **It was not.** The
investigation found the computation had only ever joined on `industry_measure_id`,
with no name-matching and no second key, and both lists were individually right:

- the account metric had `industry_measure_id IS NULL`, so it belonged on the left
- the pack measure was claimed by no metric, so it belonged on the right

**The fact that would have collapsed them — a person's judgement that this metric
instantiates that measure — had nowhere to be recorded.** The column had no writer.

Nothing in the code was wrong. That shape is worth remembering: **a defect that
looks like a logic error and is actually a missing writer.** It was invisible until
an account metric shared a name with a pack measure.

### And the gap was computed twice

The gap was **client-only and implicit**, unpinned by any test or schema, while the
server returned the raw arrays. It now has one canonical server-computed answer.

`measuredIndustryMeasureIds()` was **kept client-side for the coverage badge only**,
and that was argued rather than assumed: `gap.addressable_unmeasured` is filtered to
addressable, so it cannot answer *is this measure covered* for the non-addressable
rows the pack section also renders. **Different questions, not the same rule twice**
— and the alternative was API surface to save a Set built from data already in hand.

The helper's comment now states it serves exactly one purpose, with an instruction
to replace rather than duplicate if the server ever returns per-measure coverage.
**A leftover helper that looks like it still drives the gap is how the second
implementation grows back.**

### Eighth instance of a type written from a description

`InstitutionBusinessMetric` was missing `id`, which the server had been selecting.
Found while wiring the client to the server's gap — in a type that had been asked
to be read from the server rather than inferred.

Also fixed while there: the unmapped list keyed off `m.name`, which was never safe
since duplicate metric names are legal.

---

## The account workbench — 9 October 2026

Closes the three gaps named under *Still outstanding*: no website column, the create
form writing `industry` as free text only, and nowhere for company inputs to live.
Value spine stage: **baseline**.

### Migration 0024 — additive, orphans nothing

- `institutions.website`, nullable, `CHECK institutions_website_is_url` (`^https?://`,
  no whitespace). Written only at creation, like `name` and `industry`.
- `institution_facts` — `revenue | headcount | stated_priority | system`, one row
  per fact, `as_of` the date the fact describes. Full `governance()` column set;
  corrections supersede. Two revenue rows with different `as_of` are a time series,
  not a conflict.
- `hardening.sql`: `institution_facts` joins the governed loop and the supersession
  loop. **Trigger count 78 → 82**, information_schema rows 117 → 123.

**The deploy script does not migrate.** Prod needs `pg_dump -Fc`, `drizzle-kit
migrate`, then `hardening.sql`, by hand, before the deploy that ships this code.

### Provenance goes through `evidence`, not new columns

`evidence_id` is `NOT NULL UNIQUE`. Every fact is backed by exactly one evidence row,
so the existing gate applies unchanged — required provenance, `source_reference`,
confidence, `source_verified`, and AMENDMENT-005's `ai_sourced` rules. Restating
those columns on the fact would have been a second gate to drift. **A fact is
exactly as verified as its evidence**, and the page renders it that way.

The one rule a CHECK cannot hold — the evidence row and the fact share an
institution — is held by `POST /api/institutions/:id/facts` being the only writer
and writing both rows in one transaction.

Shape rules are CHECKs, not handler code: numeric kinds `>= 0` (**zero is data** — a
revenue of 0 is accepted and renders as 0), whole-number headcount with unit
`people`, ISO 4217 currency for revenue, non-empty text and no number for text kinds.

### Classification at create — one writer, moved, not copied

The classification act moved from `institutionClassify.ts` into
`server/lib/classifyInstitution.ts`, verbatim. Both the classify endpoint and
`POST /api/account-inputs` call it. **There is still exactly one writer of
`industry_id`.** Two copies would have been two gates.

`account-inputs` takes `industry_slug` and `classification_note` together or not at
all — either half alone is a 422. A refused classification (unknown slug,
cross-tenant slug) refuses the whole create: actorContext rolls back on any non-2xx,
so an account is never left half-made. The free-text `industry` is still stored as
the statement and is never derived from the slug.

The refactor surfaced one thing worth keeping: the classify endpoint set
`refusalTenantId` before the evidence insert, so a CHECK thrown by that insert was
still attributed. Returning a result object would have lost that on the throw path.
The lib takes an `onTenantResolved` callback, called before any write.

### Client

- **Create account**: website; *Industry as stated* (free text) and *Classify as*
  (the tenant's taxonomy) as two fields, never merged; the reasoning note appears
  and becomes required only when a classification is chosen.
- **Account page**: new card 01, *Account facts*, grouped by kind, each row with its
  evidence's VERIFIED / UNVERIFIED badge and an AI-SOURCED badge where it applies;
  an *Add a fact* form on `GovernedForm`, provenance first, every select starting
  unchosen (tri-state for verified / AI-sourced, same as AddEvidenceCard). Later
  cards renumbered 02–05. Website shown under the account name.
- `value_numeric` is passed through as pg's numeric string and grouped for display,
  never parsed to a float.

### Verification

`scripts/verify_account_workbench.sh` runs against `lvrf_verify0024`, a
`createdb -T lvrf` clone dropped on exit — every governed table refuses DELETE, so
test accounts written into the real local database could never be removed. It
typechecks, migrates and hardens the clone, checks the trigger list, starts the API
on :3099 and exercises every refusal above. `--apply-local` then backs up and
applies to local `lvrf`.

Server and client both typecheck clean (server checked with TypeScript 6.0.3; the
repo's 7.0.2 is a native binary). The migration was produced with drizzle-kit's
`generateMigration` against the 0023 snapshot — the diff contained only this
change, which also confirms the snapshot was in sync with `schema.ts`.

### First run — two defects, both in the verify script, none in the code

The first real run against a database found nothing wrong in the migration,
the routes or the client. It found two faults in the script that tests them:

- **The clone's name was refused by drizzle.config.ts's target guard.** The
  guard accepts `^lvrf(_[a-z0-9]+)?$`; `lvrf_verify_0024` has a second
  underscore. Renamed to `lvrf_verify0024`. The guard was not loosened — it is
  a safety control, and the test was what was wrong.
- **The clone was owned by the wrong role.** `createdb -T lvrf` makes the
  clone owned by whoever runs it, but `.env` connects as `lvrf_app`, which
  then has no `CREATE` on the database. `drizzle-kit migrate` died on
  `CREATE SCHEMA IF NOT EXISTS drizzle` (42501) and **its spinner swallowed
  the error** — exit 1, no message. Found by running drizzle-orm's migrator
  directly. Fixed with `createdb -T lvrf -O lvrf_app`, which mirrors local
  `lvrf`'s ownership.

Also found: **local `lvrf` had never had 0023 applied.** Its last
`__drizzle_migrations` row was 0022, and it had 76 triggers, not 78. The clone
therefore migrated 0023 + 0024 together and went 76 → 82. Both applied
cleanly. `--apply-local` will do the same to local `lvrf`.

Result: 28 passed, 0 failed. Client `npm run lint` (one pre-existing warning,
`ActorContext.tsx`) and `npm run build` clean.

**Applied to local `lvrf`, 9 October 2026,** via `--apply-local`. Backup:
`db/backups/lvrf_pre_0024_20261009_223404.dump`. 0023 and 0024 both applied;
76 → 82 triggers. The create form and the Account facts card were checked in
headless Chrome; nothing was written.

### Deployed — 10 October 2026

`680dd29` to production (`srv1862778`, `/srv/lvrf`). The migration was run by
hand, in order, because `lvrf-deploy.sh` does not migrate.

- **Pre-flight:** tree clean at `ce5af3a`. Newest `__drizzle_migrations` row
  was 0023 (`9d3e0775…`, `1788636851732`), so prod was **not** missing 0023 the
  way local `lvrf` had been. Only 0024 was pending.
- **Backup:** `/home/brad/lvrf_pre_0024_20261010_024845.dump`, 484,566 bytes,
  407 TOC entries. Taken as `sudo -u postgres pg_dump -Fc lvrf`, same as the
  nightly. It sits on the same volume as the database, like the nightlies.
- `git pull` `ce5af3a..680dd29` → `drizzle-kit migrate` applied 0024 →
  `hardening.sql` exit 0.
- **Triggers 78 → 82.** `institution_facts` has exactly `_audit`, `_no_delete`,
  `_supersession_sane` and `_touch`.
- `lvrf-deploy.sh`: api 200, vhost 401, bundle `index-BjARuDzx.js` (identical
  to the local build), deploy OK. Service active since 02:50:53 UTC.
- journalctl since 2026-09-06 showed no `capability_industry_measures` or
  "does not exist" errors, so 0023's route has not been failing in prod.

**Post-deploy review, read-only** (GETs on 127.0.0.1:3001 and SELECTs as
`lvrf_app`; no POSTs):

- Both accounts' views return 200 with `website: null` and `facts: []`.
  Pack, metrics, gap, engagements and runs match Postgres: Curia has a pack
  of 2, 2 metrics, 2 engagements and 22 runs; Skillsoft (unclassified, pack
  `null`) has 1 metric, 1 engagement and 1 run.
- `/api/industries` returns 10 and `/api/runs` returns 23, both matching the
  tables. Zero refusals have been recorded since the restart.
- The box's `sudo` asks for a password, so the backup, `hardening.sql` and
  journalctl were run by hand. The agent read Postgres only through
  `lvrf_app`.

### Still outstanding from the workbench

- **No update path for `website`.** Same as `name` and `industry`: a wrong one means
  superseding the institution. Deliberate, but it will chafe first.
- **No supersession writer for facts.** The column and its trigger exist; the route
  does not. **Moved up to the main Still outstanding list on 11 October** (next
  after P2b), with its first real correction: Skillsoft's `LVAF` → LVRF.
- **Fact verification has no route.** `source_verified` is set at capture or not at
  all, same as outcome evidence; a later *I opened it and it says this* act does not
  exist for either.
- **No actor-tenant check on mutating institution routes.** Every mutating
  `/api/institutions/:id/...` route (offerings, inputs, classify, and now facts)
  checks that the institution exists but not that it belongs to the actor's
  tenant. This is pre-existing and true of all of them, so the facts route
  matches the house pattern rather than introducing the gap. Fix it together
  with the argon2 sessions work. Until then the actor header is spoofable
  anyway, so a tenant check here would be a check against a claim.

---

## Item (b) — Manufacturing and CDMO packs filled out — 10 October 2026

Value spine stage: **baseline**. A pack is what an account's baseline is argued
against. Manufacturing and CDMO each had 2 measures after the 5 September
reruns; Healthcare had 4. Both now have 4. Prod has **12 current
`industry_measures`, all `proposed`**: 4 Healthcare, 4 Manufacturing, 4
Pharmaceutical & Biotechnology. None is ratified, which is still true of every
pack.

### The two runs

Both were run with **Claude (Opus 5.5) in the Claude app**, using WebSearch to
find candidates and WebFetch to read each cited page directly. Both ran on
9–10 October 2026. Each prompt named the two measures already in its pack and
asked only for new ones.

| Run | Industry | Added | Addressable |
|---|---|---|---|
| `mfg3` | `manufacturing` | Overall Equipment Effectiveness (OEE) | yes |
| | | On-Time In-Full (OTIF) delivery rate | yes |
| `cdmo3` | `pharmaceutical-biotechnology` | FDA inspection outcome (Form 483 observations and OAI classification) | yes |
| | | Customer revenue concentration | **no** |

**What each run dropped, and why.** These were recorded in `query_as_executed`,
not in the exclusion lists:

- **Manufacturing: first-pass yield** was dropped because no public
  disclosure ties it to money with a citation, not because it is unaddressable.
  The run limited candidates to measures with a checkable public citation: a
  standard, an earnings call with a named speaker and quarter, or a dated report
  of a published customer policy.
- **CDMO: batch success rate** was dropped as a **duplicate of Lot
  Acceptance Rate**, since both count lots that pass release over lots
  dispositioned. The only public figure for it was the company's own
  marketing. It is addressable, so it is not in the exclusion list either.

### Parse

`POST /api/industries/:id/research-results`, with Brad Piver as the actor. It
ran on local `lvrf` first as a dry run, then on prod from the box against
127.0.0.1:3001. The copies on the box were checked against the originals by
SHA-256 before posting. Each run returned 201 with 2 `pending` rows, and both
validated against the current contract on the first attempt. The payload copies
on the box were removed afterwards.

**The local parses were left `pending` on purpose.** Local: OEE `cd57a552`, OTIF
`12ce4bdb`, FDA inspection `528a56ab`, concentration `41e4848b`. They were never
reviewed locally. `research_results` is governed, so they cannot be deleted.

### The four decisions

Brad Piver reviewed all four on prod and accepted each one as proposed, at
10 October 03:28 UTC. Each accept wrote a `proposed` `industry_measures` row in
the same transaction. The notes below are verbatim:

- **OEE** (`4daa7a1d`): *"Accepted as proposed. LP Q2 2025 call (78% Siding /
  79% OSB) and ISO 22400-2 definition. Speaker attribution in the transcript is
  inferred from context; the figures are not in doubt."*
- **OTIF** (`bf9d9530`): *"Accepted as proposed. The measure and retailer fines
  are well established; the 98% threshold and 3% fine come from 2020 trade press
  of a non-public memo, and a second report differs. Confirm the threshold
  against the customer's own terms before any claim relies on it."*
- **FDA inspection outcome** (`1ee7bc7e`): *"Accepted as proposed. 483 facts
  from FDA-published Bayview response (FEI 3015448605, 9 observations, 20 Apr
  2021). Revenue-guidance figures are trade press, not Emergent's own filing."*
- **Customer revenue concentration** (`6925a623`): *"Accepted as proposed, not
  addressable. Lifecore FY2025 10-K, Item 1A (44% / 18% / 10%)."* These are the
  same Lifecore figures the original CDMO run cited.

Three of the four notes record a weakness in the evidence. **The reviewer's
notes live only in `research_results.review_note`.** `/packs/:slug` selects
only `industry_measures` columns, so the notes never render. For OEE and OTIF
this happens to be covered: the research wrote the same caveats into its own
`citation` text, which the pack does show. That was luck, not design. A
caveat that only the reviewer raised would be invisible.

### The exclusion lists went nowhere

Each payload carried `measures_tested_and_excluded_as_unaddressable`. The
parser checks their shape and discards them, because nothing writes
`industry_measure_exclusions`; see *Still outstanding*.

- **Manufacturing (4):** raw material and commodity input cost; energy cost per
  unit; end-market demand, order intake and backlog; tariff and trade exposure.
- **CDMO (3):** capacity utilisation (CDMO); book-to-bill; biotech funding
  environment.

Together with Healthcare's six, that makes **13 agent-proposed exclusions
waiting for a person's judgement**. None of them is in any database.

### Still outstanding from item (b)

- ~~**Reviewer caveats do not reach the pack.**~~ Closed 10 October 2026 — see
  *The pack shows the reviewer's note*.
- **No pack is ratified.** Ratification needs sourcing at N=2 institutions, and
  the threshold is not lowered to fix that.
- ~~A partial unique index on `research_results(industry_measures_id)`~~ Added
  in `0026` as `research_results_one_accepted_per_measure`.

---

## 2.0 item 3 — cohort roll-up, weakest link — 10 October 2026

`GET /api/cohort`, and card 02 on the accounts page. Value spine stage: **verify**
— it is a read of what has been verified, across accounts.

### What a cohort is, and what it is not

The actor's tenant's **customer** accounts: the whole book, and each industry's
accounts via `industry_id`. The tenant's own account is excluded — the vendor
measuring itself is a different question from its customers' records.

"Cohort" also means *several outcomes in one engagement* in the 1.2 payload note.
**That is not what this computes.** A run still holds exactly one outcome, and the
payload change that meaning needs is untouched.

### The rule: the minimum, never an average

The composite is the **minimum** across members. There is no mean, median or
weighted sum anywhere in `cohort.ts`, and the verification script greps the
response for one. One account at 10 and three at 80 average to 62, which describes
no account.

A **member is one current engagement**; its score is its **latest locked run's**
`confidence_score`. Unlocked runs do not stand in — a mutable snapshot is not a
record, the same reason `compareRuns` refuses them.

### Unmeasured is not compliant

A member with no run of record says why: `no_engagement`, `never_run`, or
`no_locked_run`. It sorts first and sets the floor.

**Unmeasured is empty, not 0.** The first cut gave an unmeasured member a
score of 0 and rendered a large "0" for the book. Gate A review changed that.
CLAUDE.md says *a number that cannot be sourced stays empty, and the record
says so*, and a 0 for an engagement nobody measured is a number nobody sourced.
Now:

- An unmeasured member's `confidence_score` and `confidence_band` are **null**.
- When the floor is unmeasured, `composite.score` and `composite.band` are
  **null**, `floor: 'unmeasured'` says why, and `determined_by` names the
  member. The card shows **"No score"** in words, never a number.
- When the floor is a run, `composite.score` is that run's `confidence_score`
  **as stored** (a pg numeric string), not `Number()` of it.
- The old `effective_score` is now **`sort_key`**: an internal ordering key,
  never a score. It is 0 for unmeasured, so those members sort first, and the
  stored score otherwise. A recorded run of 0 ties with an unmeasured member,
  and the unmeasured one sorts first, so the composite stays null rather than
  borrowing that run's 0.

**`composite.lowest_recorded` is context, never the score.** It holds the
lowest run of record among measured members, or null if there is none. On an
unmeasured floor the card shows it on a smaller second line: *"Lowest run of
record: … excluding n unmeasured."* That tells a reader what was recorded
without letting it stand in for what the cohort scores.

An unmeasured floor has **no band**. Banding it would mean restating the model's
thresholds outside `confidenceModel.ts`, where they are part of the fingerprint; a
run's band is read from the run, and a member with no run has none.

**The account page and card 02 can disagree, on purpose.** An account page
shows its latest run, locked or not. Card 02 counts only locked runs. Locally,
Northgate's account page reads "80.0 · HIGH", from the latest of 14 unlocked
runs, while card 02 lists that engagement as unmeasured. Both are right. The
card says so under its explanation: *"Only locked runs count here; an account
page shows its latest run, locked or not."*

The card's *N unclassified accounts* note moved out of the By-industry block.
When every account is unclassified, that block does not render, and the note
was hidden in exactly the case it exists for.

### Model versions qualify, they do not refuse

Same posture as `compareRuns`. A minimum across runs with different fingerprints,
or across runs that predate versioning, is still the honest minimum of what was
recorded — but not on one ruler. `model.comparable` is true only when every
contributing run carries the same fingerprint, and the card shows MIXED RULERS
otherwise. Most of Curia's locked runs predate versioning, so expect it.

### A current view, not part of the record

Like the gap register: recomputed from live rows on every request, nothing
persisted, no write path, no migration, no trigger change (still 82). It reads
stored scores and never recomputes confidence.

### What prod will show

One customer account. The book's composite is Curia's weakest engagement, and the
pharmaceutical-biotechnology cohort is the same single account. **The roll-up is
honest and thin until a second customer exists** — built now because it is a read
that stores nothing, so the 1.2 rule against speculative write paths does not bite.

### Verification

`scripts/verify_cohort.sh`, on a clone (`lvrf_verifycohort`) dropped on exit.
The checks are arithmetic, not snapshots:

- If any member is unmeasured, the composite score is null and the floor is
  `unmeasured`. Otherwise the composite equals the minimum stored score.
- `lowest_recorded`, when present, equals the minimum stored score among runs
  of record.
- Members are sorted weakest first.
- Every unmeasured member has a null score and a null band.
- Every run of record is locked.
- The tenant's own account is absent.
- No average appears anywhere in the response.

Then it adds an account with no engagement and checks that this account sets
the floor, with a null score and no band, and that the unclassified count
rises by exactly one.

**Local data only exercises the unmeasured paths.** Local's one customer
account is unclassified and has no locked run, so the run-floor and
per-industry checks pass vacuously there. Prod, with Curia classified and
locked runs, is the first real exercise of them.

### Deployed — 10 October 2026

`0934466` to production via `lvrf-deploy.sh` (`680dd29..0934466`, bundle
`index-CMSLsC7h.js`, api 200, vhost 401, deploy OK; service up since 03:58:47
UTC). There was no migration and the trigger count is still 82. Reviewed
read-only: `GET /api/cohort` on 127.0.0.1:3001 as Brad Piver, plus SELECTs as
`lvrf_app`. No POSTs.

- **Book composite: `"10.0"`, band `low`, `floor: 'run'`.** It is determined by
  *Curia — lot acceptance, pack-grounded hypothesis*, run 1, locked
  2026-09-05 20:01 UTC. `lowest_recorded` is the same run.
- **2 of 2 engagements measured, across 1 account.** The other member is
  *Curia — reference example, not an engagement*, at run 21, `"55.0"`, medium.
- **`model.comparable: true`**, with the note *"Every contributing run was
  scored by the same model."* One fingerprint contributes: `1.0.0` /
  `d4cf8f31472a`, on 2 runs.
- **`by_industry`:** one entry, `pharmaceutical-biotechnology`, which is the
  same single account and the same composite (`"10.0"` low, set by the lot
  acceptance engagement). `unclassified_account_count: 0`.
- **Skillsoft (tenant self) is absent** from the book and from every industry
  cohort. The response has no average key.

**The MIXED RULERS prediction above was wrong.** The reference engagement has
21 locked runs, 16 of them unversioned, but only its latest locked run (run
21) is a run of record, and that run is versioned. Old unversioned runs never
contribute, so the rulers agree. The prediction counted runs, not runs of
record.

**Questionable member: *"reference example, not an engagement"*.** It
counts as a customer engagement because it is a current engagement on a
customer account. At 55 it does not set the floor, but it inflates
`measured_count`, and its name says it should not be in a book of record.
Retiring it is a governance act (set `deleted_at`, or supersede), and nothing
was changed.

On prod, the account page and card 02 agree. Curia's latest run is the locked
10.0, so the locked-only rule changes nothing there yet.

---

## Engagement retirement — the first retirement writer — 10 October 2026

`POST /api/engagements/:id/retire`, body `{ "retirement_reason": "..." }`. Value spine
stage: none directly — it is governance over which engagements the record counts.

### Why it exists

The cohort roll-up counts every current engagement. Curia's *"reference example, not
an engagement"* — its own name disclaiming it — counted as a member of the book of
record. Removing it needed a retirement, and **CLAUDE.md rule 2 ("retirement is
`deleted_at` plus a status change") had no route behind it anywhere in the
codebase.** The only way to retire anything was a hand-run UPDATE, attributed only if
whoever ran it remembered to set an actor.

### What it does

One transaction: the reason is written as an evidence row on the institution
(`observation`, `low`, unverified — the same shape as a classification note), then
`deleted_at = now()`, `status = 'retired'`, race-guarded on the row still being
current. `lvrf_audit` records it as a `soft_delete` with the actor.

A reason under 12 characters is refused. A row vanishing from every view with nothing
saying why is the authored-prose problem in reverse.

### What it deliberately does not do

- **Runs are untouched.** Locked runs are immutable; `runsIndex` already renders a run
  whose engagement is retired.
- **No cascade** to value outcomes, capabilities or evidence. Retiring removes the
  engagement from current views; it does not erase what was claimed under it.
- **No un-retire.** A mistake is corrected by a new engagement, with the retirement
  still on record.

### The tenant check is done here

The actor's tenant must own the engagement; a cross-tenant id reads as 404. Other
mutating routes still lack this (Still outstanding) — this one does not add to that
list.

### Verification

`scripts/verify_engagement_retire.sh`, on a clone dropped on exit: refusals leave the
row current; retire sets status and `deleted_at`; every run stays; the reason is an
unverified observation by the actor; `audit_log` has an attributed `soft_delete`; the
engagement leaves `/api/engagements` and the cohort; a second retire is 404; hard
DELETE is still refused.

**Gate A found three defects, all in the script, none in the route:**

- **It was not executable.** It was mode `600`, so `./scripts/…` was refused.
  It is now `755`, matching the other scripts. A stray `.bak` (an older,
  looser audit check) was deleted.
- **One check compared against the wrong string.** `status || '|' ||
  (deleted_at IS NOT NULL)` renders as `retired|true`, because a boolean cast
  to text is `true`, not psql's `t` display form. The row was right and the
  expected value was wrong.
- **The cohort check could not fail.** The script picked the engagement with
  the most runs, which locally is Skillsoft's customer-zero engagement, and
  the cohort excludes the tenant's own account. "Gone from the cohort" passed
  whether or not retirement worked. It now picks the busiest **customer**
  engagement (Northgate's Switching Order Verification, 14 runs), and first
  asserts that it is a cohort member before retirement. Result: 17 passed,
  0 failed.

Local has one tenant, so the cross-tenant 404 is not exercised.

No UI. Retirement is rare and irreversible; it goes through the API deliberately until
there is a reason to put a button on it.

### Deployed, and first use — 10 October 2026

`a24f65b` was deployed via `lvrf-deploy.sh` (`0934466..a24f65b`, bundle
unchanged at `index-CMSLsC7h.js`, api 200, vhost 401, deploy OK). There was no
migration and the trigger count is still 82.

**Before, read-only.** *Curia — reference example, not an engagement*
(`c47d075f-012c-4a3a-9085-5b3f7bdce5f6`, status `draft`) had 21 runs, all
locked. The latest was run 21 at `55.0` medium. The cohort book was `10.0`
low, with 2 of 2 measured.

**Retired** at 04:29:10 UTC by Brad Piver, on explicit instruction, via
`POST /api/engagements/c47d075f-…/retire`. The reason, verbatim: *"Retired
from the book of record: by its own name this is a reference example, not an
engagement. It was counted as a cohort member when the weakest-link roll-up
shipped (0934466). Its runs stay on record, untouched."*

- **Response:** 200, `runs_left_in_place: 21`, `locked_runs_left_in_place:
  21`, evidence `10535941-9e76-41a1-b555-7349fe497b92`.
- **Engagement row:** `status = 'retired'`, `deleted_at` set.
- **`audit_log`:** one `soft_delete` row, actor Brad Piver.
- **Runs:** all 21 still present, all 21 still locked, none deleted.
- **The reason:** recorded as an `observation`, `low` confidence, unverified,
  captured by Brad Piver.
- **`/api/cohort` after:** `10.0` low, `floor: 'run'`, set by *Curia — lot
  acceptance, pack-grounded hypothesis* run 1. **1 of 1 measured**, one
  account, `comparable: true`. The `pharmaceutical-biotechnology` cohort is
  the same: `10.0` low, 1 of 1.
- **Left untouched, as designed (no cascade):** two `draft` value outcomes
  under the engagement, `bf6f5b2d…` and `e3fb0061…`. See *Still outstanding*.

---

## Retirement freezes outcomes — the readers and writers that did not know — 10 October 2026

Closes the Still outstanding item from the reference-example retirement, and more of it
than was written down. The item named two **readers** that counted outcomes under a
retired engagement. Looking for them found four **writers** that would still *change*
those outcomes — so "retirement freezes everything under the engagement" was true for
runs and new outcomes, and false for existing ones.

### What now checks that the outcome's engagement is current

| Path | Before | After |
|---|---|---|
| `POST /value-outcomes/:id/commit` | accepted | **409** — outcomes frozen |
| `POST /value-outcomes/:id/measure` | accepted | **409** |
| `POST /value-outcomes/:id/verify` | accepted | **409** |
| `POST /value-outcomes/:id/evidence` | accepted | **409** |
| `GET /value-outcomes/:id/gaps` | a work list for a frozen outcome | **409** — no gaps to close |
| gap register's single-outcome count | counted frozen outcomes | excludes them |
| metric re-validation | superseded frozen outcomes onto the new metric | **skips** them |

**409, not 404.** A frozen outcome exists; it cannot change. A 404 would say the
opposite of the truth.

**Re-validation leaves frozen outcomes on the old metric.** They stay attached to the
metric they were claimed against, now superseded — the honest record of what was frozen
— instead of being carried forward into a measurement chain their engagement has left.

### Not changed, and why

- `recordDocuments` GET still serves documents for a frozen outcome. Reading the record
  of a retired engagement is exactly what the record is for.
- `measure` and `verify` look up outcomes without `superseded_by_id IS NULL`, unlike
  `commit` and `evidence`. Pre-existing and separate; noted, not changed here.

### Verification

`scripts/verify_frozen_outcomes.sh`, on a clone dropped on exit:

- The gap register answers before retirement.
- After retiring the engagement, **commit, measure, verify, evidence and gaps
  each return the frozen 409**. The check matches the message, not just the
  status code, because `measure` and `verify` have other 409s.
- The refused writes leave the outcome's row unchanged and write no evidence.

**The single-outcome count is tested by behaviour, not by its own SQL.** The
first draft re-ran the server's count query and compared it with itself,
which can't fail. The count's only observable effect is that the gap register
attributes an evidence refusal at the institution to an outcome *only* when
that outcome is the institution's one live outcome. So the script:

1. Takes a second outcome at the same institution, under an engagement that
   stays current. Locally that is Northgate's Heartbeat outcome.
2. Provokes a recorded evidence refusal against it, using AI-sourced evidence
   marked verified, which `evidence_ai_verify_requires_resolution` refuses.
3. Checks that its baseline-evidence gap reads `open` while the other
   engagement's outcomes are live, then `refused` after that engagement is
   retired.

**This test fails against the old code.** With the count query temporarily
reverted to the unfiltered form, the run is 14 passed, 1 failed: *"baseline
gap after retirement: open (expected refused)"*. The code was then restored
byte-for-byte. Result: 15 passed, 0 failed.

Metric re-validation's skip is reviewed in code, not exercised. Local data has
no metric that can safely be re-validated.

**Only `e3fb0061…` is frozen in practice.** An earlier line here named
`bf6f5b2d…` too. That was wrong: `bf6f5b2d…` was superseded by `e3fb0061…` on
30 August, so it is not a current outcome, and `/gaps` returns 404 for it, as
it always has for superseded outcomes. `e3fb0061…`, under `c47d075f…`, is the
one current outcome under the retired engagement, and it returns the frozen
409.

### The misattribution 02dbcf3 exposed on prod

**What prod showed.** After `02dbcf3`, `GET /gaps` for Curia's lot-acceptance
outcome (`31d097a6…`) read `actual_evidence_verified: refused`. It carried the
message *"vendor-published evidence may not support a measured actual.
AMENDMENT-005 Article I"*, and its requirement text said that source had
already failed. That refusal is prod's only one, recorded **30 August 14:45
UTC**. The lot-acceptance outcome was created on **5 September**, six days
later. When the refusal happened, Curia's only outcomes were `bf6f5b2d…` and
`e3fb0061…`, both under the reference example. A customer-facing work list
claimed something had been tried and refused for this outcome when it never
had been. No data was written or wrong, but the register said something false.

**Why.** Refusals carry no outcome id, so the gap register attributes an
evidence refusal at an institution to an outcome only when that outcome is
the institution's single live one. **That guard never checked time.** Before
`02dbcf3`, the frozen outcome still counted, so lot acceptance had a sibling
and its gap read `open`. The count fix was correct, but it made the
single-outcome condition true on prod, and the time-blind attribution took
over. Neither the review nor the 15/0 run caught it, because they exercised
the count, not the age of the refusal.

**The fix.** `findEvidenceRefusal` now also requires `refused_at >=` the
outcome's `created_at`. A refusal from before the outcome existed cannot be
about it. The code says plainly that **attribution is still a guess when two
outcomes overlap in time**. It also names an accepted side effect: when a
commit supersedes an outcome, refusals made against the predecessor read
`open` on the successor, and `open` is the register's default when
attribution is unsure.

**The test fails against the old code.** `verify_frozen_outcomes.sh`
reproduces the prod case on the clone. It inserts a refusal at the
institution timestamped a day before the second outcome's creation, using the
columns `recordRefusal` writes plus an explicit `refused_at`. No API path can
backdate a refusal, which is the point: on prod the refusal was simply older
than the outcome. Once that outcome is alone, its `actual_evidence_verified`
gap must read `open`.

- **With `02dbcf3`'s `gapRegister.ts`:** 16 passed, 1 failed — *"actual gap:
  refused (expected open) — a refusal older than the outcome was attributed to
  it"*.
- **With the fix:** 17 passed, 0 failed. The baseline refusal, made after the
  outcome existed, still reads `refused`, so real attribution is unaffected.

### Deployed — 10 October 2026, two deploys

Both went out via `lvrf-deploy.sh` with no migration (still 82 triggers) and
the bundle unchanged at `index-CMSLsC7h.js`, api 200, vhost 401. Both were
reviewed read-only, with GETs on 127.0.0.1:3001 as Brad Piver and SELECTs as
`lvrf_app`. No POSTs.

**`02dbcf3`** (`a24f65b..02dbcf3`, service up 05:27:58 UTC):

- `e3fb0061…` gaps → **409**, the frozen message. ✓
- `bf6f5b2d…` gaps → **404**. It is superseded, not frozen; see the correction
  above.
- Lot acceptance (`31d097a6…`) gaps → 200, but `actual_evidence_verified` read
  **`refused`**, carrying the 30 August AMENDMENT-005 refusal from before the
  outcome existed. **This was a defect**, recorded under *The misattribution
  02dbcf3 exposed on prod*. It went undocumented as deployed until the fix
  below.

**`e324bf5`** (`02dbcf3..e324bf5`, service up 05:38:44 UTC):

- Lot acceptance gaps → 200, and **`actual_evidence_verified` now reads
  `open`**. All five entries read `open` / `viable`: metric definition,
  baseline evidence, actual evidence, human commit and human verifier.
- `e3fb0061…` gaps → **409**, the frozen message, unchanged.
- `bf6f5b2d…` gaps → 404, unchanged.
- Prod's one refusal row is still there, and still unattributed to any
  current outcome. The cohort book is unchanged: `10.0` low, 1 of 1 measured.

---

## Refusals name their outcome — the guess is gone — 10 October 2026

Migration `0025`: `refusals.value_outcome_id`, nullable, FK `value_outcomes` RESTRICT,
indexed. Closes the Still outstanding item written an hour earlier.

### What changed

- `handleGovernanceError` takes an optional `valueOutcomeId` and writes it.
- The four outcome routes — evidence, commit, measure, verify — pass the outcome's id
  once they have resolved it. Before resolution it is null, which is accurate.
- The gap register's `findEvidenceRefusal` matches **`value_outcome_id = this outcome`**
  and nothing else.

### What was deleted, and why that is the point

Three things existed only to contain a guess, and all three are gone:

- the **single-outcome-at-institution guard** (attribute only if the outcome is its
  institution's only live one),
- the **`created_at` bound** added in `e324bf5` (ignore refusals older than the outcome),
- the **frozen-outcome exclusion in that count**, added in `02dbcf3` — the count no
  longer exists, so there is nothing to exclude from.

Tonight's sequence is the argument: `02dbcf3` fixed one thing and made the guess true on
prod; `e324bf5` bounded the guess; `0025` removes it. A guess contained twice is still a
guess.

### No back-fill, and what it costs

Existing refusals did not record their target. Inferring one now would be the guess
again. They stay NULL and are **never** attributed — on prod that is the single 30 August
AMENDMENT-005 row, which will no longer appear on any work list. That is correct: nobody
can say from the stored row which outcome it was about.

A commit that supersedes an outcome creates a new row with a new id; refusals made
against the predecessor read `open` on the successor. Same as before, now by exact
match rather than by date.

No trigger change: still 82. `hardening.sql` unchanged.

### Verification

`scripts/verify_refusal_attribution.sh`: clone, migrate to 0025, harden, 82 triggers,
existing refusals all NULL (no back-fill). Then at an institution with two current
outcomes: a refusal provoked on A records A; A's gap reads `refused`; B's is unchanged —
under the old guard both read `open`, because two live outcomes made attribution
impossible. A legacy-shaped refusal with no outcome id is attributed to neither.

**Tightened at Gate A.** A and B were first picked by age. Locally that gave
two verified outcomes that may list no evidence gap at all, so "B unchanged"
and "not the legacy refusal" could pass on `absent == absent`. The script now
picks A and B through the gap register itself, choosing two outcomes at one
institution that both list `baseline_evidence_verified` and
`actual_evidence_verified` as `open`. It also asserts `open` exactly rather
than "not refused".

**The exact-match test fails against `e324bf5`'s `gapRegister.ts`:** 12 passed,
1 failed — *"A baseline: open (expected refused)"*. The old guard will not
attribute while A has a live sibling. With 0025's register the run is 13
passed, 0 failed.

`scripts/verify_frozen_outcomes.sh` asserted the old single-outcome behaviour:
a second outcome reading `open` while not alone and `refused` once alone, plus
the backdated-refusal case. Those assertions test code that no longer exists.
They now check:

- The second outcome's own refusal names it and reads `refused` at once,
  siblings or not.
- A refusal that names no outcome reads `open`, both before and after the
  sibling engagement is retired. That includes once the outcome is alone,
  which is exactly when the old guard misfired.

Every freeze assertion is kept. That script also now **migrates and hardens
its clone**. Local `lvrf` is still at 0024, and the server code now reads and
writes `refusals.value_outcome_id`, so an unmigrated clone would have broken
`/gaps` and silently failed to record refusals. Result: 21 passed, 0 failed.

### Deployed — 10 October 2026

`eadef9b` went to production. The migration was run by hand, in order, before
the deploy:

- **Backup:** `/home/brad/lvrf_pre_0025_20261010_055502.dump`, 523,627 bytes,
  422 TOC entries, taken as `sudo -u postgres pg_dump -Fc lvrf`.
- `git pull --ff-only` (`8bf3952..eadef9b`) → `drizzle-kit migrate` applied
  0025 → `hardening.sql` exit 0 → 82 triggers, column present.
- `lvrf-deploy.sh` reported deploy OK. Service up since 05:57:56 UTC, bundle
  unchanged at `index-CMSLsC7h.js`.

**Reviewed read-only**, with GETs on 127.0.0.1:3001 as Brad Piver and SELECTs
as `lvrf_app`. No POSTs.

- Newest `__drizzle_migrations` row is 0025 (`1791611011165`). **82 distinct
  triggers**, unchanged.
- `refusals.value_outcome_id` exists: `uuid`, nullable, with FK
  `refusals_value_outcome_id_value_outcomes_id_fk` and index
  `refusals_value_outcome_idx`.
- **Prod's one refusal, the 30 August AMENDMENT-005 row (`5a54f599…`,
  supports `actual`), has `value_outcome_id` NULL.** It was not back-filled,
  and it is attributed to nobody.
- **Lot acceptance (`31d097a6…`) gaps → 200, all five entries `open` /
  `viable`.** That is metric definition, baseline evidence, actual evidence,
  human commit and human verifier. It now reads `open` because the refusal
  names no outcome, not because of a date bound.
- `e3fb0061…` gaps → **409**, the frozen message, unchanged.
- The cohort book is unchanged at `10.0` low, 1 of 1 measured. `/api/health`
  returns 200 with the database connected.

---

## The pack shows the reviewer's note — 10 October 2026

`GET /api/industries/:slug/pack` now returns each entry's accepted review, and
`/packs/:slug` renders it under the citation: **REVIEWER'S NOTE**, the note itself,
then *accepted by — on — · research: —*. The footer says only "accepted", not
"accepted as proposed": the notes already begin with that phrase, so it would
repeat on every entry.

### Why

A pack entry exists only because a person accepted a research result. Their
`review_note` is where a caveat raised at review lives — and the research may not
have written that caveat into its own citation. Before this, the page selected the
measure's columns only, so a reviewer's *confirm this threshold before relying on it*
was invisible to the account manager reading the pack, at exactly the moment they
would overclaim. OEE and OTIF were covered by luck: the research had written the same
caveats into the citation text.

### How

A LEFT JOIN from `industry_measures` to the accepted `research_results` row
(`industry_measures_id`, `review_state = 'accepted'`) and its reviewer. One review per
entry **holds by construction: accepting a result always creates a new measure; nothing
in the schema enforces one accepted result per measure** (see *Still outstanding from
item (b)*). `review` is
null when no accepted result points at the measure — the page then says *No review on
record*, rather than inventing a reviewer. Every entry reachable today has one.

The research tool is shown alongside, because which agent produced a measure is part
of how much weight its citation can bear.

No schema change, no migration, still 82 triggers. The account page's pack list is
unchanged — it lists measures by name, and the full entry is one click away on the pack.

### Verification

`scripts/verify_pack_review.sh`, on a clone dropped on exit: local has no real pack
data, so it makes one entry the way prod does — parse a one-measure payload into an
empty industry, accept it with a note — then reads the pack and checks the note,
reviewer, research tool and timestamp come back on that entry, and that the measure's
own columns are unchanged.

**The null path is tested.** A measure is inserted directly into the same industry
with no research result; no API path can create one, because accept writes the
measure and links the result in the same transaction. Its `review` must come back
`null`, and the reviewed entry beside it in the same response must keep its own
review.

**"Appears once" is reported, not tested.** With one accepted result per measure,
which holds by construction and nothing in the schema enforces, the join cannot
duplicate the entry, so a count of 1 could not fail. The script prints it as a NOTE
and counts only a duplicate as a failure. Making it testable needs a second accepted
result on the same measure, and no API path can create one. That case belongs to the
partial unique index in Still outstanding.

### Deployed — 10 October 2026

`eec3536` went out via `lvrf-deploy.sh` (`eadef9b..eec3536`, api 200, vhost
401, deploy OK; service up since 11:17:00 UTC). The bundle is now
`index-DsM57LKl.js`, identical to the local build. There was no migration and
the trigger count is still 82.

**Reviewed read-only**, with GETs on 127.0.0.1:3001 as Brad Piver and one
SELECT as `lvrf_app`. No POSTs.

- `/api/industries/manufacturing/pack`, `/pharmaceutical-biotechnology/pack`
  and `/healthcare/pack` each return 200 with 4 entries.
- **12 of 12 entries carry a review; none is null. 12 of 12 are
  `reviewed_by` Brad Piver.** The reviews date from 5 September (the 8
  original measures) and 10 October 03:28 UTC (the 4 from item (b)).
- **12 of 12 `review.note` values equal their `research_results.review_note`**
  exactly. Each pack entry was compared with its accepted result in
  Postgres.
- **OTIF's `review.note` is exactly the note accepted on 10 October:** *"…the
  98% threshold and 3% fine come from 2020 trade press of a non-public memo,
  and a second report differs. Confirm the threshold against the customer's
  own terms before any claim relies on it."* Its `research_tool` is the item
  (b) run, Claude (Opus 5.5) in the Claude app, 9–10 October 2026.

---

## Exclusions get a writer — 10 October 2026

Migration `0026`, `POST /api/industries/:industryId/exclusions`, and a third card on
`/packs/:slug`: **TESTED AND EXCLUDED**.

### Two different facts, kept apart

- **`addressable = false`** — a measure **kept** in the pack, because *do not claim
  this, and why* is something an account manager must read.
- **An exclusion** — a measure that **does not belong in the pack at all**, recorded
  so the same wrong proposal is not made twice.

A measure cannot be both, and both writers now enforce it: excluding a name that is a
current pack entry is 409; accepting a research result whose name is excluded is 409
(the result stays pending). There is no route that reverses an exclusion — the table
is insert-only by design.

### The agent proposes; the person decides — stored apart

The 13 candidates came from research runs that "tested and excluded" them. The parser
still does not write those: an agent proposing an exclusion is not a person deciding
one. This route is the person deciding:

- `reason` — the person's judgement, required, at least 12 characters;
  `excluded_by_person_id` is the actor.
- `proposed_by_research_tool` + `proposal_text` — **new in 0026**: which run proposed it
  and what it said, **verbatim**, both or neither (CHECK
  `industry_measure_exclusions_proposal_is_complete`). Never merged into `reason`, so an
  agent's prose cannot stand as a person's decision.

The pack page shows the reason first, then *Proposed by research (tool): …* in muted
text, then who excluded it and when. An industry with exclusions but no measures still
shows them, as card **00**, since there are no cards 00 and 01 above it. The first
render numbered it 02 even then; that was fixed at Gate A.

### 0026 also adds the deferred index

`research_results_one_accepted_per_measure`: partial UNIQUE on
`research_results(industry_measures_id) WHERE review_state = 'accepted'`. The pack's
one-review-per-entry join is now a constraint, not a property of how accept happens to
work. Prod has 12 accepted results on 12 distinct measures, so it builds.

Additive only; no trigger change, still 82.

### Verification

`scripts/verify_exclusions.sh`, on a clone migrated to 0026 and hardened, dropped on
exit: columns and index exist; 82 triggers; short reason, half a proposal and an
unknown industry are refused with no row written; an exclusion records the actor with
reason and proposal stored separately, audited; the same name twice is 409; excluding
a current pack entry is 409; accepting an excluded name is 409 and leaves the result
pending; a second accepted result for one measure is refused by the index; the pack
returns the exclusion, verbatim proposal included, and not as a pack entry.

**Tightened at Gate A** so that no check passes for the wrong reason:

- The three 409s ("same name again", "excluding a current pack entry",
  "accepting an excluded name") must carry their own message or constraint
  name, not just the status code.
- The duplicate-accept refusal must name `research_results_one_accepted_per_measure`.
- The audit check matches this exclusion's `record_id`.
- The both-or-neither CHECK is exercised directly at the database, since the
  route's own 422 always reaches it first.
- An industry with no exclusions must return `exclusions: []`, an empty
  array rather than a missing key. That is the shape prod's three packs will
  have.

Result: 27 passed, 0 failed.

**A race the scripts had been winning by timing.** `actorContext` commits on
`res.once('finish')`, which is *after* the response is sent. A client that gets
a 2xx and immediately reads on another connection can miss the row it just
wrote. `verify_pack_review.sh` hit it once: its psql read-back of the new
pending result came back empty, and the accept went to
`/api/research-results//accept`. The scripts now take ids from responses and
wait for a row to be visible before reading its contents. The race itself is in
the middleware, it predates this item, and it is not fixed here.

`verify_pack_review.sh` also now **migrates and hardens its clone**. The pack
route reads 0026's columns, and local `lvrf` is still at 0025. Its "appears
once" NOTE now cites the index instead of saying nothing enforces it. Re-run
against this code: `verify_pack_review.sh` 17 passed, 0 failed;
`verify_refusal_attribution.sh` 13 passed, 0 failed.

### Next

The 13 decisions, one at a time, the same way the accepts were made.

### Deployed — 10 October 2026

`9006266` went to production. The migration was run by hand, in order, before
the deploy:

- **Backup:** `/home/brad/lvrf_pre_0026_20261010_114052.dump`, 525,354 bytes,
  424 TOC entries, mode `600`, taken as `sudo -u postgres pg_dump -Fc lvrf`.
- `git pull --ff-only` (`eec3536..9006266`) → `drizzle-kit migrate` applied
  0026 → `hardening.sql` exit 0 → 82 triggers, 2 columns, index present.
- `lvrf-deploy.sh` reported deploy OK. Service up since 11:42:52 UTC; the
  bundle is now `index-2YI_7srW.js`, identical to the local build.

**Reviewed read-only**, with GETs on 127.0.0.1:3001 as Brad Piver and SELECTs
as `lvrf_app`. No POSTs.

- Newest `__drizzle_migrations` row is 0026 (`1791631805702`). **82 distinct
  triggers.**
- `industry_measure_exclusions.proposed_by_research_tool` and `proposal_text`
  exist, both nullable `text`. CHECK
  `industry_measure_exclusions_proposal_is_complete` is present.
- `research_results_one_accepted_per_measure` exists as a partial unique
  index on `(industry_measures_id) WHERE review_state = 'accepted'`. It built,
  which confirms no measure had two accepted results.
- `industry_measure_exclusions` has 0 rows. **All three packs
  (manufacturing, pharmaceutical-biotechnology, healthcare) return 200 with 4
  measures each and `"exclusions": []`, an array.**
- **The 12 reviews are unchanged.** 12 of 12 carry a review, 12 of 12
  `reviewed_by` Brad Piver, and 12 of 12 match their `research_results` row
  on note, research tool and `reviewed_at`. OTIF's note is still exactly as
  accepted. `/api/health` returns 200 with the database connected.

**Next:** the 13 exclusion decisions, one at a time. After them comes the
commit-before-response fix (Still outstanding).

---

## The 13 exclusion decisions — 10 October 2026

The 13 measures that three research runs had "tested and excluded as unaddressable"
were each decided by Brad Piver and approved as listed: **12 excluded, 1 promoted,
0 dropped.** The 12 were recorded on prod through
`POST /api/industries/:industryId/exclusions`, as Brad Piver, from the box against
127.0.0.1:3001, at 11:47 UTC.

| Pack | Excluded | |
|---|---|---|
| Healthcare | 5 | Payer mix · Adjusted admissions / volume growth · Occupancy rate · Bad debt and uncompensated care · Operating EBITDA margin |
| Manufacturing | 4 | Raw material and commodity input cost · Energy cost per unit · End-market demand, order intake and backlog · Tariff and trade exposure |
| Pharmaceutical & Biotechnology | 3 | Capacity utilisation (CDMO) · Book-to-bill · Biotech funding environment |

**The approval said "11 exclusions"; the decisions listed 12.** The count was
corrected and confirmed as 12 before anything was posted.

### The agent's wording is stored apart from the person's reason

Each row carries two different authors, in two different columns:

- **`reason`** — Brad Piver's judgement, verbatim. For example, Occupancy rate:
  *"The numerator is demand. Capability can free beds, not fill them."*
- **`proposal_text` + `proposed_by_research_tool`** — what the research run said,
  verbatim, and which run said it. Each `proposal_text` is the exact array element
  from that run's `measures_tested_and_excluded_as_unaddressable`. Each tool is that
  payload's own `research_tool`: "Claude Cowork" for Healthcare (the same tool as
  prod's 4 accepted Healthcare results), and the two 9–10 October Claude (Opus 5.5)
  runs for Manufacturing and CDMO.

Neither column is derived from the other. The pack page shows the reason first, and
the research's wording below it, labelled as the research's.

**How the mapping was made.** Each decision was matched to exactly one array element
by its leading phrase. The build refused any decision that matched none or more than
one. Every element was used once, except Healthcare `[1]`, Case mix index. Where the
stored name is shorter than the research's phrase (#3, "Adjusted admissions / volume
growth"), the name is the decider's and the longer phrase stays in `proposal_text`.
No `citation` was sent.

### The promotion: Case mix index

Healthcare's CMI was **not excluded**. It is approved for promotion to a
not-addressable pack entry, and that waits on a research run producing the full
measure shape with a citation (Still outstanding). The research's own text ends
*"Excluded because a capability claim on CMI cannot be separated from acuity drift
after the fact."* A not-addressable entry is consistent with that: it stays in the
pack as *do not claim this, and why*, rather than leaving it.

### Verified, read-only

- **12 rows**, 12 of 12 byte-equal to the request on name, `reason`,
  `proposal_text` and `proposed_by_research_tool`. `citation` is NULL,
  `excluded_by` is Brad Piver, and each row has its own attributed `audit_log` row.
- **The packs return them through the API**, byte-equal: healthcare 5,
  manufacturing 4, pharmaceutical-biotechnology 3. No name appears both as a pack
  entry and as an exclusion.
- **Measures and reviews are unchanged.** An md5 over every `industry_measures` row
  joined to its research result was the same before and after
  (`7c4620730fb804b458ee1489f55b90d0`). The 12 measures and 12 reviews by Brad Piver
  are as they were.
- No refusals were recorded. The request file, its sha256 checked on the box
  (`f11e946f…`), and every temp file were removed from the box afterwards.

---

## Commit before the response — 10 October 2026

`server/middleware/actorContext.ts` only. Every write route is fixed at once, because
every write route answers through `res.json` (checked: none uses `send`, `end`,
`sendFile` or `redirect`).

### What was wrong

The middleware committed in `res.once('finish')`, which fires **after** the response is
flushed. Two consequences:

- **Read-after-write could miss.** A client that got a 2xx and read again at once could
  get the old state. Seen in `verify_pack_review.sh` and in the Account facts card,
  which reloads the moment a fact is recorded.
- **A failed COMMIT was reported as success.** `heartbeat_events_value_run_fk` is
  DEFERRABLE INITIALLY DEFERRED and checked only at COMMIT. If it failed, the caller
  already had its 2xx while the write was rolled back — a silent loss the caller could
  not detect. Nothing shows it ever happened; nothing could have shown it.
- **And the failed COMMIT crashed the API process.** Found at Gate A, not known
  before. The old commit ran as `void finalize(...)` inside `res.once('finish')`, so a
  COMMIT error was an unhandled promise rejection, and Node exits on those. Against
  `7df208c`'s middleware the verify script's COMMIT-FAIL request got its 201, and
  then the server died. The log ends in the trace through `finalize` at
  `actorContext.ts:37`, and the next request could not connect. On prod, systemd
  would have restarted it, and every request in flight at that moment would have
  been lost too.

### What it does now

`res.json` is wrapped for mutating requests. On its first call the transaction is
finished **first** — COMMIT for a status under 400, ROLLBACK otherwise — and only then
is the body sent. If COMMIT fails, the caller gets **500 — "The write was not
committed … Nothing from this request was saved."**, never the 2xx the handler meant.

`finish` and `close` stay as fallbacks: `finish` for a response that bypasses
`res.json` (Express's default error handler), `close` for a client that disconnects
before any response. Both are no-ops once the wrapper has settled the transaction.

**Every path is handled and logged; no rejection is left unhandled.** This was
tightened at Gate A, after the old code's crash was found:

- **COMMIT succeeded:** send the body. If sending throws, log `LVRF: response
  could not be sent after a successful COMMIT; the write IS saved.` Once COMMIT has
  succeeded, the caller is never told "not committed".
- **COMMIT failed:** log `LVRF: COMMIT failed; the write was not saved.`, then send
  the 500. If even that send throws, log `LVRF: could not send the COMMIT-failure
  response.`
- **The `finish` / `close` fallbacks** use `finalize(...).catch(...)`, logging
  `LVRF: transaction finalize failed in fallback handler.`, instead of
  `void finalize(...)`. That `void` is exactly what turned a failed COMMIT into a
  process exit.

The success and failure outcomes have separate handlers on the same promise. The
first cut shared one `.catch`, so a throw while sending a successful body would have
been reported as "not committed".

**A rule this makes explicit:** a handler must not touch `req.dbClient` after
`res.json` — the client has been released. All nine heartbeat emissions were checked:
each runs before its route's response.

A COMMIT-time failure is not routed through `handleGovernanceError`, so it writes no
`refusals` row. It is a failure to save, not a governance decision.

### Verification

`scripts/verify_commit_before_response.sh`, on a clone migrated and hardened, dropped
on exit. **Deterministic:** a clone-only DEFERRABLE constraint trigger refuses an
exclusion named `COMMIT-FAIL` at COMMIT time; the response must be 500 saying the
write was not committed, and no row may exist (the old code returned 201 here).
Normal writes still 201, duplicates still 409, a missing actor still 422. **Supporting:**
25 POST-then-immediate-GET pairs must all see the row. No connection may be left idle
in transaction.

**Gate A.**

- **Against `7df208c`'s `actorContext.ts`:** COMMIT-FAIL got **201**, and the API
  process then exited. The script added a check that the server is still answering
  right after the failed COMMIT, since it had previously caught the crash only
  indirectly, when step 5 could not connect.
- **With the new middleware**, after the handling and logging fixes: **17 passed, 0
  failed**. That includes a check that the server logged the failed COMMIT.
- **Every other verify script was rerun against it, all passing:**

  | Script | Result |
  |---|---|
  | `verify_account_workbench.sh` | 28/0 |
  | `verify_cohort.sh` | 27/0 |
  | `verify_engagement_retire.sh` | 17/0 |
  | `verify_frozen_outcomes.sh` | 21/0 |
  | `verify_refusal_attribution.sh` | 13/0 |
  | `verify_pack_review.sh` | 17/0 |
  | `verify_exclusions.sh` | 27/0 |

**Route audit.** No route responds other than through `res.json`: there is no `send`,
`end`, `sendFile`, `redirect`, `write` or `pipe`, no `next(err)` in a route, and no
custom error handler. A scan of all 227 `.json(` calls in `server/routes` and
`server/lib` found every one followed by a `return`, the end of a `try`, an `else`,
or the end of the handler. No statement runs after a response. There are no
un-awaited `client.query` calls and no `void`, `.then`, `setTimeout` or
`setImmediate` work in routes, so nothing can touch `req.dbClient` after it is
released.

### Deployed — 10 October 2026

`06c60a3` went out via `lvrf-deploy.sh` (`9006266..06c60a3`, api 200, vhost
401, deploy OK; service up since 12:01:20 UTC). There was no migration and no
client change: still 82 triggers, bundle unchanged at `index-2YI_7srW.js`. The
built `dist/server/middleware/actorContext.js` carries the new COMMIT-failure
handling.

**Reviewed read-only**, with GETs on 127.0.0.1:3001 as Brad Piver and SELECTs
as `lvrf_app`. No POSTs.

- `/api/health`, `/api/cohort`, `/api/industries/healthcare/pack` and
  `/api/industries/manufacturing/pack` all return **200**.
- The cohort book is unchanged at `10.0` low, 1 of 1 measured. The healthcare
  pack still has 4 measures, 4 reviews and 5 exclusions.
- **`pg_stat_activity`: 0 connections idle in transaction.** `lvrf_app` can
  read only its own sessions' state: one idle (the API's pool) and one active
  (the query itself). No other role's session state was readable, but the
  API's own connections are the ones that matter for this change.

Not exercised on prod: a failing COMMIT. It cannot be produced there without a
write that fails at COMMIT time. The clone-only verify script is the proof:
17 passed, 0 failed, including "the API process survived the failed COMMIT"
and "the server logged the failed COMMIT".

---

## Case mix index promoted — 10 October 2026

This completes the 10 October decision to promote CMI rather than exclude it.

- **Research:** `cmi-payload.json`, one measure, `addressable = false`. Tool: Claude
  (Opus 5.5) in the Claude app, fetching cms.gov and oig.hhs.gov directly, run
  10 October. Sources: CMS's own CMI definition, and HHS OIG OEI-02-18-00380 for
  the audit exposure. Its `why` keeps the original Healthcare run's conclusion: a
  capability claim on CMI cannot be separated from acuity drift. "Do not claim it;
  claim the specific, auditable documentation measures instead."
- **Parsed on prod** as Brad Piver: research result
  `5ae027ac-906c-4360-bc68-9235347efe45`. A throwaway local clone parsed it first
  (201, one pending row). Before posting, prod had no current measure and no
  exclusion with that name. The stored `raw_response` equals the file field for
  field; only the key order inside `addressable_by_workforce_capability` differs,
  because `jsonb` reorders keys.
- **Accepted on prod** by Brad Piver at 12:07 UTC. It is now industry measure
  `79da8bb0-7771-46ec-845e-d760a7f98b94`, `proposed`, not addressable. The review
  note is stored exactly as given. It includes the caveat that the
  1%-of-revenue-per-1%-of-CMI figure is approximate arithmetic, and that the CMS
  page states no fiscal year.

**Verified read-only after the accept:**

| Check | Result |
|---|---|
| Healthcare pack | **5** current measures: 3 claimable, 2 not addressable |
| CMI entry | Under "What you cannot — and why", `reviewed_by` Brad Piver, note byte-equal |
| Healthcare's other 4 measures | Unchanged |
| Healthcare's 5 exclusions | Unchanged |
| Manufacturing and pharmaceutical-biotechnology packs | Byte-identical before and after |
| Prod totals | 13 current measures, 13 accepted results, 0 pending, 12 exclusions, no refusals |

---

## A local copy of prod data — 10 October 2026

`scripts/restore_prod_copy.sh` restores a prod snapshot into **`lvrf_prodcopy`**,
on the dev Mac only. It never touches `lvrf`, and it is repeatable. Steps and
commands are in `LVRF_Local_Setup.md`, Phase 10.

**The snapshot:** `lvrf_snapshot_20261010_121025.dump`, 537,396 bytes, 410 TOC
entries, taken on prod after the CMI accept. It was copied to
`~/lvrf-backups/` (mode `600`), sha256 `3cc8e6e1…`, matching on both ends.

**Ownership is rebuilt the way prod is built.** The dump is restored without
owners or ACLs, then:

- `lvrf_app` takes every table, sequence, type and the `drizzle` schema, as
  migrations do on prod.
- The 10 `lvrf_*` functions stay with the local superuser, as `postgres` owns
  them on prod.
- `hardening.sql` re-applies the REVOKEs and GRANTs.

A plain restore fails, because there is no `postgres` role on the Mac.
`--role=lvrf_app` was rejected: it would make the app role the owner of the
SECURITY DEFINER `lvrf_audit()`. The script checks that `lvrf_app` cannot redefine
it. **`vector` is left out**: it is unused on prod, not installed on the Mac, and
the restore filters exactly its 2 TOC entries.

**Result: 15 passed, 0 failed, twice.** The second run proves it is repeatable.

- 82 triggers.
- `audit_log` and `heartbeat_events`: UPDATE, DELETE and TRUNCATE revoked from
  `lvrf_app`; INSERT and SELECT granted.
- Every relation is owned by `lvrf_app`, and no `lvrf_*` function is.
- The newest migration is `0026_exclusion_provenance`.
- Counts match prod: 13 current measures, 12 exclusions, 2 accounts, 23 runs, and
  188 audit rows.

**Against the app:** the API and client were run on `lvrf_prodcopy`, using the URL
derived from `.env` and leaving `.env` itself unchanged.

- **9 of 9 GET responses are byte-identical to prod's**, as the same actor:
  `/api/institutions`, `/api/cohort`, `/api/industries`, `/api/runs`, the three
  packs, and both account views.
- **Rendered:** `/` shows Curia and Skillsoft, and card 02 at `10.0` low with its
  first real By-industry row. The Healthcare pack shows 5 entries, CMI under
  not addressable, 5 reviewer's notes and Tested and excluded (5). The
  Manufacturing pack shows OEE and OTIF with their reviewer's notes, and Tested
  and excluded (4).
- Nothing was written: audit rows were still 188 afterwards.

**Two small findings, which only real data could show:**

- Prod has **two people named Brad Piver**: the tenant actor, and *Brad Piver
  (external analyst of record)* at Curia. The actor picker lists both, and the
  browse run picked the second. Both resolve to the same tenant, so the pages
  are the same, but the picker does not make the difference obvious.
- Card 02's member label reads *Curia · Curia — lot acceptance…*, because the
  engagement's own name already begins with the account name. Cosmetic.

## Sign-in P1 — credentials, sessions, auth routes (0027)

**Decision (approved):** only vendor staff (persons with a `tenant_id`, not
simulated, current) can sign in. Password hashed with argon2id; session is
server-side, cookie holds only a random token, the database holds only its
SHA-256. The `X-Actor-Person-Id` header keeps working in P1. P2 makes the session the
actor and refuses the header in production unless `LVRF_ALLOW_ACTOR_HEADER=1`
outside production (the server will refuse to start otherwise). P3 adds a tenant
check to every mutating route through one shared helper. Caddy basic_auth stays
through P1–P3; P4 decides whether to remove it.

**What P1 adds**

- `person_credentials`: one current argon2id hash per person (partial unique
  index; a CHECK refuses any hash not starting `$argon2id$`). Rotation is revoke +
  insert. `set_via` records how it was set (`cli:<os user>`).
- `sessions`: token hash (unique), person, idle expiry 12 h, absolute expiry 7 d
  (CHECK `expires_at <= absolute_expires_at`), revoked_at, user agent.
- Neither table is audited, deliberately: audit rows would copy hashes into an
  append-only log. Both get `_no_delete` (hardening section 15). Triggers 82 → 84.
- `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`, mounted
  before `actorContext`. JSON only (415 otherwise). One message for every failure
  ("Email or password is incorrect."), including customer-side people, and a
  dummy hash is verified when no credential exists so timing does not reveal
  which emails exist. 5 failures per (IP, email) in 15 min → 429 (in memory;
  resets on restart; recorded as a known limit).
- Cookie `lvrf_session`: HttpOnly, SameSite=Lax, Path=/, Secure when the request
  arrived over HTTPS (`trust proxy` set to loopback, so Caddy's
  X-Forwarded-Proto is believed only from 127.0.0.1).
- `scripts/set_password.ts <email>`: run on the box. Refuses unless exactly one
  current tenant-staff person has that email. Prompts twice without echo,
  minimum 12 characters, revokes the old credential and all of that person's
  sessions in the same transaction. Never prints the password or hash.
- `scripts/verify_signin_p1.sh`: clone, migrate, harden, 84 triggers, table
  guards, credential CHECK and uniqueness, the full login/me/logout path, cookie
  flags over HTTP and HTTPS, stored hash = sha256(token), forged cookie refused,
  header path still works, rate limit, DELETE refused, no audit rows.

**Not yet:** the session is not the actor (P2); no sign-in page; no tenant
check on mutating routes (P3).

**Gate A — local, 11 October 2026.**

- **Dependency.** `argon2@0.45.1` is a runtime dependency. `package.json` gains
  only it; the lockfile adds argon2 and 11 transitive packages, and removes or
  changes none. npm 11 did **not** run argon2's install script (no allow-scripts
  approval). It loads anyway from its shipped prebuilds, which include
  `linux-x64` with glibc and musl builds, so prod must not need a compiler.
- **Fixed in `auth.ts`: the rate limiter grew without bound.** Every attempt
  created a Map key, and only a successful sign-in removed one. Now:
  - only a *failed* attempt creates a key;
  - reads drop expired keys;
  - a timer (unref'd) sweeps every window;
  - the map is capped at 10,000 keys, evicting the oldest.

  Each key holds at most 5 timestamps. Eviction under a flood larger than the
  cap can reset an older key early, and that is stated in the code.
- **Fixed in `auth.ts`: login requires exactly one matching person.**
  `persons.email` is UNIQUE case-sensitively, but login matches
  case-insensitively, so two people whose emails differ only by case could
  both match. That now goes through the same uniform 401, with the dummy
  verify.
- **Fixed in `set_password.ts`: the prompt was written before raw mode.**
  Input arriving the instant the prompt appeared was echoed in the clear and
  then lost. A pty driver answering immediately hung on "Again:". Raw mode and
  the listener now come first, the prompt after.
- **`set_password.ts` was never typechecked.** The server's tsconfig includes
  only `server/`, `db/` and `drizzle.config.ts`. It typechecks clean through a
  temporary config, which was then deleted.
- **Fixed in this section:** the header is `X-Actor-Person-Id`, not
  `X-LVRF-Actor`.
- **Migration matches schema.** `drizzle-kit generate` on a throwaway copy of
  the repo reports "No schema changes, nothing to migrate".
- **`verify_signin_p1.sh`: 35 passed, 0 failed.** Its step 9 had a test bug: it
  checked the first session's token after signing out the third one. It now
  re-reads the token it signs out.
- **Four mutations, each caught, code restored byte-identical:**

  | Mutation | Run | Caught by |
  |---|---|---|
  | Drop `HttpOnly` | 34/1 | "cookie not HttpOnly" |
  | Different message for an unknown email | 34/1 | "wrong password" no longer matches the unknown-email message |
  | Remove the tenant filter | 34/1 | "customer login -> 200" |
  | Make logout a no-op | 33/2 | old token still works; session not revoked |

- **Trigger counts are read from `hardening.sql`, not restated.** Five scripts
  hardcoded 82 and broke at 84. `verify_exclusions.sh` and
  `verify_account_workbench.sh` failed on it in the regression run. All five now
  read the "Total: N distinct triggers" line in `hardening.sql`.
- **`restore_prod_copy.sh` applies newer migrations before hardening.** A 0026
  snapshot could no longer be restored, because `hardening.sql` section 15
  references 0027's tables. It now applies any newer migrations as `lvrf_app`
  first and says so: on the 12:10 snapshot, 16/0, "applied 1 migration(s) newer
  than the snapshot".
- **Regression:**

  | Script | Result |
  |---|---|
  | `verify_commit_before_response.sh` | 17/0 |
  | `verify_exclusions.sh` | 27/0 |
  | `verify_pack_review.sh` | 17/0 |
  | `verify_cohort.sh` | 27/0 |
  | `verify_account_workbench.sh` | 28/0 |
  | `verify_refusal_attribution.sh` | 13/0 |

- **`set_password.ts`, driven through a pty on a throwaway clone:**
  - Refuses an unknown email, a customer-side email, a simulated person (a
    customer-side fixture), a short password, and mismatched entries, writing
    nothing.
  - A first set reports "First password set".
  - A second set reports "Previous password revoked. 2 active session(s)
    signed out". That leaves 2 credentials (1 revoked, 1 current, both
    argon2id, `set_via cli:<user>`), 2 sessions revoked and none deleted, and
    0 audit rows.
  - No run echoed the password or a hash.
- **Not changed, recorded:**
  - The API listens on all interfaces (`app.listen(port)`, `*:3001` on the box).
    Port 3001 is not reachable from outside: a probe from the Mac timed out, so
    the firewall holds. Binding to 127.0.0.1 would be cheap defence in depth.
  - `isHttps()` also trusts a raw `X-Forwarded-Proto` header from any source.
    The only effect is adding `Secure`, so it is harmless.
  - A simulated vendor-staff person is not exercised by any test, because
    local `lvrf` has none. The login query and `set_password` both check
    `simulated`.

**Recorded for P2: bind the API to 127.0.0.1.** `server/index.ts` calls
`app.listen(port)` with no host, so the API listens on every interface (`*:3001`
on the box). Only the firewall keeps it off the internet, and that would mean
skipping Caddy's TLS and basic_auth. Checked before deciding: Caddy proxies to
`reverse_proxy 127.0.0.1:3001` in both `/etc/caddy/Caddyfile` on the box and
`ops/Caddyfile`, so `app.listen(port, '127.0.0.1')` keeps the proxy working.
**The same change must update `client/vite.config.ts`**, whose dev proxy targets
`http://localhost:3001`. On macOS `localhost` can resolve to `::1` first, the
trap CLAUDE.md already records for Caddy. Deliberately not changed in the P1
commit.

**Deployed — 11 October 2026.** `366a20f` went to production. The migration was run
by hand before the deploy:

- **Backup:** `~/lvrf_pre_0027_20261011_045238.dump`, 537,396 bytes, mode `600`,
  425 TOC entries.
- `git pull --ff-only` (`06c60a3..366a20f`) → `drizzle-kit migrate` applied 0027 →
  `hardening.sql` exit 0. The two "does not exist, skipping" notices are the new
  `_no_delete` triggers' DROP IF EXISTS.
- `\d person_credentials` shows the `one_current` partial unique index, the
  `hash_is_argon2id` CHECK, `_no_delete`, and no `_audit`. `\d sessions` shows
  `token_hash_key`, `expiry_is_bounded`, `person_idx`, `_no_delete`, and no
  `_audit`.
- `lvrf-deploy.sh` reported deploy OK; service up since 04:55:53 UTC. The bundle
  is unchanged (`index-2YI_7srW.js`, `index-D3ophAUX.css`).
- **argon2 loads from `prebuilds/linux-x64/argon2.glibc.node`.** There is no
  `build/` directory, so nothing was compiled on the box.

**Gate C, read-only** (as `lvrf_app`, and via 127.0.0.1:3001):

- Newest migration is 0027 (`1791634775340`). **84 triggers.** The new tables
  carry exactly `person_credentials_no_delete` and `sessions_no_delete`.
- Both tables are empty, with 0 `audit_log` rows for them.
- `GET /api/auth/me` with no cookie returns **401**. `GET /api/cohort` with the
  `X-Actor-Person-Id` header returns **200**: P1 is additive. `/api/health`
  returns 200.
- **One POST, not part of the spec:** a login for `nobody@example.invalid`, sent
  to confirm the uniform answer on the live box. It returned 401 "Email or
  password is incorrect.", wrote no rows (sessions and refusals both 0), and left
  one entry in the in-memory limiter, which clears on restart or after 15
  minutes. Its temp file was removed from the box.
- Prod has **1** current vendor-staff person, still on the placeholder email.
  Setting a real sign-in email comes next, through `scripts/set_email.ts`.

---

## set_email — a vendor-staff sign-in email, changed by audited UPDATE — 11 October 2026

`scripts/set_email.ts <current email> <new email>`. This is the only writer of
`persons.email` after a person is created. It exists so prod's one vendor-staff
person can sign in with a real address instead of the placeholder. No migration;
the trigger count is unchanged at 84.

**Why an audited UPDATE, not supersession.** 44 foreign keys reference
`persons.id`:

- runs (`walked_by`, `locked_by`);
- outcome sign-offs (`committed_by`, `verified_by`);
- evidence (`captured_by`, `attested_by`);
- the actor on `audit_log`, `refusals` and `heartbeat_events`;
- research reviews and exclusions;
- since 0027, `person_credentials` and `sessions`.

Superseding the person would issue a new id and leave all of that attached to the
old one. A superseded person also cannot sign in. An email is a contact attribute
of the same person. `persons` is governed: `persons_audit` records the full
`old_row` and `new_row` with the actor, and `persons_touch` stamps `updated_at`.
No trigger or CHECK freezes `email`.

**What it does, in one transaction:**

- Refuses unless exactly one current, non-simulated vendor-staff person has the
  current email. Matching is case-insensitive, with `FOR UPDATE`.
- Refuses unless *no* person (current, retired or superseded) has the new email,
  also case-insensitively. `persons_email_key` is case-sensitive and covers every
  row, so the script checks both cases itself.
- Refuses an implausible address or a no-op change.
- **The actor is self-attested.** `lvrf.actor_person_id` is set to the person,
  exactly as `actorContext` sets it, so the audit row names them. There is no
  `--actor` flag, by decision.
- Updates the row, then **reads the audit row back and checks it**: `update`, old
  email, new email, actor. If anything differs, it rolls back.
- Prints the person id and the audit row id. The id, credential and sessions are
  untouched; a signed-in session belongs to the person, not the address.

**Gate A.**

- **A bug caught by its own safety check.** The audit lookup selected
  `id::text AS id` and sorted `ORDER BY id DESC`. Postgres sorted by the *output*
  column, as text, so `'94'` came first and the script read an old, unrelated
  persons update. The read-back check refused and rolled back. It now sorts by
  `a.id`, the bigint.
- **`verify_set_email.sh`: 29 passed, 0 failed,** on a throwaway clone. Every
  address in it is a placeholder.
  - **Refusals, writing nothing:** unknown current email; customer-side;
    simulated vendor-staff; new email taken in another case; implausible; same
    email in another case. No person row changed and no audit row was written.
  - **The change:** one audit row, `update`, old → new, actor = the person,
    record = the person. Same person id, `updated_at` advanced, no person added or
    superseded, and the credential is unchanged (same id, still current). The old
    email no longer resolves.
  - **Sign-in:** the new email signs in (200, `/me` is the same person id); the
    old email gets 401.
  - **The P1 gap is closed.** A **simulated vendor-staff person** with a valid
    credential gets 401, and `set_email` refuses them.
- **`verify_signin_p1.sh`:** 35 passed, 0 failed.
- **The real address is in no committed file.** On prod it will be in `persons`,
  in `audit_log.new_row` permanently (append-only), and in the shell history of
  whoever runs the command.

**Deployed and used — 11 October 2026.** `e19347d` went out via `lvrf-deploy.sh`
(`366a20f..e19347d`, deploy OK; service up since 05:08:24 UTC). There was no
migration and the bundle is unchanged (`index-2YI_7srW.js`).

- **Backup first:** `~/lvrf_pre_set_email_20261011_050711.dump`, 548,285 bytes,
  mode `600`, 438 TOC entries.
- **`set_email.ts` on prod.** It moved the one vendor-staff person
  (`b6da352c-…`) from the placeholder to Brad Piver's real address. The address
  is deliberately not restated in this file. The person id is unchanged.
  Audit row **200** shows `update`, old `brad.piver@skillsoft.example` → new
  address, with actor = record = `b6da352c-…` (self-attested).
  `persons.updated_at` is 2026-10-11 05:09:40Z.
- **`set_password.ts` on prod.** "First password set. 0 active session(s) signed
  out."
- **The curl sign-in test,** run from the box against 127.0.0.1:3001. The password
  was read with `read -s` and sent on stdin, so it stayed out of shell history and
  the process list. Login 200 with the right person; the cookie file was
  `-rw-------`; `/me` 200; logout 200; `/me` afterwards 401. The cookie file was
  then deleted.

**Gate C, read-only:**

| Check | Result |
|---|---|
| Vendor-staff person | 1. The real address is set and the placeholder is gone. Not superseded; 6 persons in total, unchanged. |
| Audit row 200 | As above. No later persons audit rows for that person. |
| Credentials | 1 current of 1, argon2id, `set_via cli:brad`, for that person |
| Sessions | 1 total, 1 revoked, 0 live |
| `audit_log` rows for credentials or sessions | 0 |
| Triggers | 84; newest migration 0027 |
| `/api/auth/me` with no cookie | 401 |
| `/api/cohort` with the header | 200 (still additive in P1) |
| Health | 200 |
| Leftovers on the box | No cookie file, no `lvrf_*` temp files |

---

## Sign-in P2a — the session is the actor; reads need sign-in; the write guard — 11 October 2026

P2 ships as two deploys. **P2a is additive**: the session becomes the actor and the
client signs in, while the `X-Actor-Person-Id` header **still works**, for vendor
staff only. **P2b** refuses the header unless `LVRF_ALLOW_ACTOR_HEADER=1` outside
production, and adds the startup guard. P2b comes only after a session-made write on
prod has been confirmed read-only. No migration; still 84 triggers.

### Actor versus attribution (checked before building)

**The actor** is who made the request: `audit_log.actor_person_id`, and through
`actorContext` the `lvrf.actor_person_id` setting. **Attribution columns** name
people in the record. Routes split cleanly into two groups:

- **The actor is written into a domain column.**
  - `captured_by_person_id`, the evidence and facts writer: `validateMetric`,
    `offeringAttachment`, `engagementRetire`, `outcomeEvidence`,
    `metricPackBasis`, `outcomeWalk` (commit, measure, verify),
    `institutionFacts`, `classifyInstitution` (through `institutionClassify` and
    `accountInputs`), and `valueOutcomes`.
  - `assessed_by_person_id`: `institutionInputs` and `accountInputs`.
  - `walked_by`, `locked_by`, `claimed_by`, `rendered_by`, `excluded_by`, and
    `parsed_by`/`reviewed_by`.
- **A chosen value in the request body, validated as a person at the account's
  institution:** `committed_by`, `verified_by`, `attested_by`, `confirmed_by`,
  `owner_person_id`, and the assessment learner. This is where customer
  verification and attestation live. P2 does not touch them. Customer-side people
  stay nameable there, as chosen values, never as the actor.

**Prod, read-only:**

- No customer-side or simulated person has ever been the actor. `audit_log` has
  183 rows by vendor staff and 6 system rows; refusals are by staff only.
- Every actor-written column is vendor staff only. The exceptions are one
  simulated `assessed_by` and four simulated heartbeat actors, which come from the
  seeded simulation and not the API; `actorContext` already refused simulated
  actors.
- Customer-side people appear only in the body-chosen columns: `committed_by` ×1,
  `attested_by` ×2, `definition_confirmed_by` ×2, and owners.

**So P2a lets only current, non-simulated vendor staff act, by session or by
header.** One column to watch: `assessed_by_person_id` is the actor. If a
customer-side assessor of record is ever needed, it becomes a body-chosen value,
like `committed_by`, and is not tied to the actor.

### What P2a changes

- **`resolveActor`** (`server/lib/session.ts`). A valid session is the actor, and
  any header is then ignored. Otherwise the header is accepted, for vendor staff
  only (P2a). Anything else is a 401. The session refresh is throttled to once a
  minute.
- **`requireActor`** covers every `/api` route except `/api/health` and
  `/api/auth/*`, reads included. `actorContext` and all 24 routes read `req.actor`;
  `resolveActor` is the only reader of the header. The three
  `resolveActorTenantId` helpers return `req.actor.tenantId`.
- **`originGuard`** (`server/lib/origin.ts`) covers every mutating `/api` request,
  sign-in included:
  - JSON only, or 415;
  - `Sec-Fetch-Site: cross-site` is a 403;
  - an `Origin`, when present, must be allowed, or 403. With no `Origin` the
    client is not a browser.

  **Allowed origins come from `LVRF_PUBLIC_ORIGIN`, a comma-separated list.**
  - **Missing in production:** the `Origin` must equal the request's own scheme
    and Host. Cross-site writes stay refused and the site keeps working. It is
    logged at startup, reported as `origin_check: "fallback"` by `/api/health`, and
    `lvrf-deploy.sh` fails on it.
  - **Missing outside production:** `http://localhost:5173` and
    `http://127.0.0.1:5173`.
  - **Malformed:** the server refuses to start.
- **The API binds 127.0.0.1**, and the Vite proxy targets `127.0.0.1:3001`. Caddy
  already proxies to `127.0.0.1:3001`.
- **`lvrf-deploy.sh`'s smoke test** now requires `/api/health` 200 with
  `origin_check: "configured"`, then `/api/runs/:id` with no session → **401**
  (the app is up and fail-closed), then the vhost → 401, all on 127.0.0.1.
- **Client.**
  - `ActorContext` is now the auth provider, keeping the `useActor` name; the
    picker is gone. `/api/auth/me` runs on load. With no session, the sign-in
    page shows and the URL is kept.
  - Every call goes through `api/http.ts`'s `apiFetch`, which sends the cookie and
    no header.
  - A 401 mid-task opens a sign-in overlay over the still-mounted page, so a
    half-filled form keeps its fields. **Nothing is replayed**; the person
    resubmits.
  - Sign-out POSTs `{}` as JSON.
- **The only body-less mutating route** is `POST /api/auth/logout`. There are no
  PUT, PATCH or DELETE routes. Every client write goes through `postGoverned`,
  which sends `application/json`.

### The two hosts

Caddy serves **`lvrf-rule76.com, www.lvrf-rule76.com`** from one site block, with
no redirect between them. This was found when confirming the origin; it is not a
single host. Whichever host is used, `LVRF_PUBLIC_ORIGIN` must list it, or writes
from it get a 403. The session cookie is host-only, so a sign-in on one host does
not carry to the other.

### Gate A

- **Typecheck:** server and client clean. **Client lint:** clean, apart from the
  one pre-existing fast-refresh warning, now in `ActorContext.tsx`. **Build:**
  clean.
- **`verify_signin_p2a.sh`: 49 passed, 0 failed,** covering:
  - the loopback bind;
  - 401 with no actor, for reads, writes and `/api/runs/:id`;
  - the header for staff only (customer, simulated and unknown ids are 401);
  - the session as actor, in both `audit_log` and `excluded_by`;
  - the session winning over a header naming someone else;
  - 415 for text/plain and form bodies, 403 for a foreign `Origin`, for
    cross-site, and for a foreign-origin sign-in;
  - the throttled refresh, the sliding expiry, expiry → 401, sign-out → 401;
  - configured origins (both hosts 201, localhost 403);
  - a malformed value refusing to start;
  - the production fallback (reported, own origin 201, foreign 403).
- **Four breaks, each caught, code restored byte-identical:**

  | Break | Result | Caught by |
  |---|---|---|
  | Header beats session | 48/1 | — |
  | No JSON check | 47/2 | text/plain and form reached the route |
  | GETs skip `requireActor` | 47/2 | `/api/runs/:id` returned 200; also fails tsc |
  | Binds all interfaces | 48/1 | `*:3089` |

- **Three scripts updated for intended behaviour.** A request with no actor is now
  401 from `requireActor`, not 422; this affects `verify_cohort.sh` and
  `verify_commit_before_response.sh`. `verify_engagement_retire.sh` now sends the
  header on its `/api/engagements` read.
- **Regression:**

  | Script | Result |
  |---|---|
  | `verify_commit_before_response.sh` | 17/0 |
  | `verify_account_workbench.sh` | 28/0 |
  | `verify_cohort.sh` | 27/0 |
  | `verify_engagement_retire.sh` | 17/0 |
  | `verify_frozen_outcomes.sh` | 21/0 |
  | `verify_refusal_attribution.sh` | 13/0 |
  | `verify_pack_review.sh` | 17/0 |
  | `verify_exclusions.sh` | 27/0 |
  | `verify_signin_p1.sh` | 35/0 |
  | `verify_set_email.sh` | 29/0 |

- **The browser flow, in headless Chrome on a throwaway clone:**
  1. The sign-in page, with no picker.
  2. A wrong password gives the server's own sentence, and the password field is
     cleared.
  3. Signed in, the bar reads "Signed in as …" with a Sign out button.
  4. Text was typed into Create account, the session was expired in the database,
     and Submit was pressed. The overlay opened, the typed text was still there,
     and nothing was written.
  5. Signed in again through the overlay: it closed, the text was kept, and nothing
     was resubmitted.
  6. Signing out returns to the sign-in page.
- **Noted, not changed:**
  - The nav links still show on the sign-in page; they lead back to it.
  - While the overlay is open, the bar still reads "Signed in as".
  - The Vite dev server listens on `localhost`, so open `http://localhost:5173`,
    which is in the dev-default origins.

**Decided at Gate A:** `LVRF_PUBLIC_ORIGIN=https://lvrf-rule76.com,https://www.lvrf-rule76.com`.
Both hosts Caddy serves can write.

**Checked before committing: nothing calls our own `/api` over HTTP without an actor.**

- **Server:** no outbound HTTP anywhere. There is no `fetch`, `http.request` or
  child process, and no PDF renderer yet.
- **Heartbeat writers** (`emitHeartbeat`, `walkSpine` and the routes) write to the
  database in-process.
- **`scripts/`:** the verify scripts send the header (P2a accepts it).
  `lvrf-deploy.sh` calls only `/api/health` and the deliberately unauthenticated
  `/api/runs/:id`. `restore_prod_copy.sh` mentions `/api` only in its printed
  instructions.
- **`ops/`:** only Caddy proxies to the API.
- **On the box:** brad has no crontab. `/etc/cron.d` holds `lvrf-backup` (a
  `pg_dump`) and two system jobs. There are no lvrf systemd timers.

### Later items, recorded at P2a

- **Redirect `www` to the apex in Caddy.** That gives one origin and one session
  cookie, after which `LVRF_PUBLIC_ORIGIN` can drop the `www` entry. It is a manual
  Caddy change, outside `lvrf-deploy.sh`.
- **`assessed_by_person_id` is the actor.** If a customer-side assessor of record
  is ever needed, make it a body-chosen value like `committed_by` and keep it off
  the actor. Never let a customer act.
- **Cosmetic:** the nav links show on the sign-in page (they lead back to it), and
  while the expiry overlay is open the bar still reads "Signed in as".

### Deployed — 11 October 2026

`27f6e39` went to production. There was no migration and no backup step: the only
change on the box was one line in `/srv/lvrf/.env`.

- **`.env`:** `LVRF_PUBLIC_ORIGIN=https://lvrf-rule76.com,https://www.lvrf-rule76.com`
  was added, after a copy of the file was taken
  (`~/env_pre_p2a_20261011_123738.bak`, mode `600`). There is exactly one such
  line, and `NODE_ENV=production` is still present.
- **The first deploy run reported DEPLOY FAILED. That came from the deploy
  script, not the app.** Bash had already started reading the old
  `lvrf-deploy.sh` before the script's own `git pull` replaced it on disk, so the
  run kept executing the old file and applied the old smoke test ("expect 200").
  An unauthenticated `/api/runs/:id` now correctly returns 401, so the old check
  failed. **The second run, now executing the new file, passed:** health 200 with
  `origin_check: configured`, `/api/runs/:id` with no session 401, the vhost 401,
  deploy OK. The service has been up since 12:40:48 UTC, with bundle
  `index-Bq_62G2h.js`.
- **Gate C, read-only:**
  - `/api/health` reports `origin_check: "configured"`. An unauthenticated
    `/api/cohort` gets **401**.
  - The API listens on **`127.0.0.1:3001`** only (`ss -ltn`).
  - 84 triggers and 1 current credential. No refusals since the deploy.
- **The browser verification write came through the session.** Brad Piver signed
  in at https://lvrf-rule76.com, browsed, and recorded a `system` fact on Skillsoft:
  - fact `c966ef3b…` and evidence `1e85f541…`, both `captured_by` =
    `b6da352c-…`;
  - audit rows **201** (evidence) and **202** (fact), both with actor
    `b6da352c-…`;
  - written at 12:47:54.513902, inside browser session `8f40e4da…` (12:42:56 →
    revoked 12:50:20 by the sign-out). That session's `last_seen_at` is
    **12:47:54.512403**, its resolution on the write request itself, 1.5 ms
    before the insert.
  - The client sends no header. Those were the only 2 audit rows written in the
    window, both his.
- **The value was mistyped as `LVAF`.** It is left in place by decision and listed
  as the first correction for the fact supersession writer (Still outstanding).
- ~~**The sign-in after signing out does not appear on the server.**~~ Resolved:
  Gate C's query ran before he signed in again. A read-only check afterwards
  found the session, created at **12:58:12 UTC** and still live. Nothing was
  wrong.

## npm audit fix, and the deploy script re-runs itself — 11 October 2026

Two commits, one deploy.

### The non-forced audit fix (lockfiles only)

`npm audit fix` was run without `--force` in the server and the client. Only the
two lockfiles changed; both `package.json` files are byte-identical (`cmp`).

- Server: `proxy-addr` 2.0.7 → 2.0.8 (**clears the critical**), `qs` 6.15.3 → 6.16.0,
  and `drizzle-kit` 0.31.10 → 0.31.11.
- Client: `nanoid` 3.3.16 → 3.3.20, `source-map-js` 1.2.1 → 1.2.2.

**What remains, all accepted:**

- **Server, 4 moderate:** `esbuild` through `drizzle-kit`
  (`@esbuild-kit/core-utils`, `@esbuild-kit/esm-loader`). This is a dev tool, and
  this repo never runs an esbuild dev server.
- **Client, 7 (5 high, 2 moderate):** `braces`, `chokidar`, `fast-glob`, `micromatch`,
  `postcss-nested`, `postcss-selector-parser`, `tailwindcss`. All are build-time
  only, and clearing them needs Tailwind 4, which is a deliberate upgrade rather
  than an audit fix.

**Regression:** all 11 verify scripts pass, 0 failed:

| Script | Passed |
|---|---|
| `signin_p2a` | 49 |
| `signin_p1` | 35 |
| `set_email` | 29 |
| `commit_before_response` | 17 |
| `account_workbench` | 28 |
| `cohort` | 27 |
| `engagement_retire` | 17 |
| `frozen_outcomes` | 21 |
| `refusal_attribution` | 13 |
| `pack_review` | 17 |
| `exclusions` | 27 |

The client `tsc` and build pass, with bundle `index-Bq_62G2h.js` unchanged. Lint
shows only the existing `only-export-components` warning on `useActor`.

### The deploy script re-runs itself when the pull changed it

This fixes the P2a deploy's false failure. After `git pull`, `lvrf-deploy.sh`
compares its own `git hash-object` from before and after the pull. If the hash
changed, it runs `exec` on the new file with `LVRF_DEPLOY_REEXEC=1`, the old HEAD and
the pull time. The re-run then:

- skips the clean-tree check and the pull;
- logs the range `old..new` from the first run;
- carries on from `npm ci`.

The re-run refuses in two cases:

- it starts without the old HEAD or the pull time (the mode exists only for the
  script's own re-run);
- the file on disk is not HEAD's copy of the script. Its hash is still checked
  against `HEAD:scripts/lvrf-deploy.sh`, so a second re-exec cannot happen.

**Verified by `scripts/verify_deploy_reexec.sh`: 13 passed, 0 failed.** The setup
touches no database, service or network:

- a throwaway bare "origin" repo and a "box" clone;
- the real script, with only `REPO_DIR` repointed;
- a stub `npm` on PATH that stops each run at step 3.

| Case | Result |
|---|---|
| A. A pull that changes the script | Exactly one re-exec. The new version runs once, `git pull` runs once, the old HEAD is carried, and the run reaches `npm ci`. |
| B. A pull that does not change the script | No re-exec. |
| C. `LVRF_DEPLOY_REEXEC=1` with no old HEAD | Refused, nothing built. |
| D. A re-run whose file was edited after the pull | "refusing a second re-exec", nothing built. |

**This deploy does not exercise the re-exec.** Bash on the box has already
started reading the old script by the time the pull brings in the new one, so
this deploy runs entirely on the old script. The old script's smoke test already
expects 401, so it should pass. The first deploy that runs with the new script
already on the box is the first that can re-exec, and it only does so if that
pull changes the script again.

### Deployed — 11 October 2026

`27f6e39..020f39b` went to production. There was no migration and no backup step.

- **The deploy passed on its first run: deploy OK, exit 0.** It ran the old script
  start to finish, as expected. There was no re-exec line: bash had loaded the old
  file before the pull. Its checks all passed: health 200 with
  `origin_check: configured`, then the run and the vhost each returned 401 without
  a session. The service has been up since **13:06:28 UTC**, and the bundle is
  still `index-Bq_62G2h.js`.
- **`npm ci` on the box** reports what was accepted: server 4 moderate; client 7
  (5 high, 2 moderate). The installed versions are `proxy-addr` 2.0.8, `qs` 6.16.0
  and `drizzle-kit` 0.31.11.
- **Gate C, read-only, as `lvrf_app`:**
  - HEAD is `020f39b` and level with origin. Health reports `origin_check:
    configured`, an unauthenticated `/api/cohort` gets 401, and the API listens on
    `127.0.0.1:3001` only.
  - 84 triggers, 1 current credential, 1 live session.
  - No audit rows and no refusals since the deploy; the last audit id is still
    202. Since the P2a deploy, every audit actor has been staff (2 rows).
  - **The P2b prerequisite holds:** no customer-side, simulated or retired person
    holds a credential or a session.
- **The first deploy that can re-exec** is the next one after this, and only if
  its pull changes `lvrf-deploy.sh`.

## Sign-in P2b — the header is off; the session is the only actor — 11 October 2026

From P2b, the only way to act in production is a signed-in session.

### What P2b changes

- **`server/lib/actorHeader.ts`** reads `LVRF_ALLOW_ACTOR_HEADER`:

  | Value | Result |
  |---|---|
  | unset, `''` or `0` | off |
  | `1` | on, outside production only |
  | anything else | the server refuses to start |

  **The startup guard:** `NODE_ENV=production` with the flag set to `1` refuses to
  start. The flag is not quietly ignored: a production `.env` asking for the
  header is a mistake to fix.
- **`resolveActor`** reads the header only when the mode is `on`. When it's off, a
  request with a header and no session gets 401 like any other. A session still
  wins over a header in every mode.
- **`/api/health`** reports `actor_header`, and the startup log names the mode. With
  the header on, it also logs a warning.
- **`lvrf-deploy.sh`** step 7 now also fails unless:
  - `actor_header` is `off`;
  - a header naming a current vendor-staff person with no session gets 401. The id
    comes from a `SELECT` as `lvrf_app`, via `.env`'s `DATABASE_URL`.
- **The verify scripts that drive the API with the header** set
  `LVRF_ALLOW_ACTOR_HEADER=1` on their own throwaway server: account_workbench,
  cohort, commit_before_response, engagement_retire, exclusions, frozen_outcomes,
  pack_review, refusal_attribution, signin_p1, signin_p2a. `set_email` sends no
  header and doesn't set it.
  - In `signin_p2a`, the flag is set by default, and its simulated-production
    step signs in instead of using the header.
- **The client is unchanged.** It has sent no header since P2a. Local use is through
  the sign-in page: `LVRF_Local_Setup.md` Phase 11. Local `lvrf` is at 0026 (82
  triggers) and needs 0027 before anyone can sign in there; that phase gives the
  backup, migrate and `set_password` steps.

There is no migration and no schema change; triggers stay at 84.

### The way back

The startup guard means **no `.env` setting re-opens the header in production.**
That is deliberate.

- **The way back from P2b is reverting its commit and redeploying:**

  ```
  git revert <P2b sha> && git push
  ./scripts/lvrf-deploy.sh
  ```

  `lvrf-deploy.sh` will re-exec, because the revert changes it, and run the P2a
  checks. P2a accepted the header for current vendor staff, so it is a working state
  to fall back to.
- **If sign-in itself breaks** (a lost password, or a bad credential):
  - SSH to the box is unaffected;
  - `npx tsx scripts/set_password.ts <email>` from `/srv/lvrf` sets a new password
    directly. It needs no session and no running server.

  These two are the backstops; neither needs the header.

### Gate A

- **`verify_signin_p2b.sh` passes 44/0**, on a throwaway clone:
  - dev, flag unset and flag `0`: health `off`; a header naming staff → 401 for a
    GET and for a write, with nothing written. Sign-in works, and a session write
    is audited as the signed-in person even with a header naming someone else.
  - dev, flag `1`: health `on`, with the warning logged; header GET 200; header write
    audited as the header's person; a session still beats the header.
  - **production + flag `1`**: refuses to start, and nothing listens.
  - **malformed (`true`, `yes`)**: refuses to start, in dev and in production.
  - production, flag unset or `0`: starts, `off`, header 401, and the session works.
  - 84 triggers, unchanged.
- **Four deliberate breaks, each caught, then restored byte-identical:**

  | Break | Result |
  |---|---|
  | The header always read | 10 FAIL |
  | `requireActor` forcing `on` | 10 FAIL |
  | No startup guard | 2 FAIL |
  | Malformed values accepted | 4 FAIL |

  **The no-guard break first hung the script instead of failing it.** A server
  that wrongly starts never exits, and `must_refuse` waited on it. `must_refuse`
  now gives a refused start 20 seconds and fails on a server that is still running.
- **The deploy smoke block was run against a local clone:**
  - production, flag unset: passes (health `off`, 401, header 401);
  - dev, flag `1`: fails with `header=200`, as it should.
- **Regression:**
  - all 13 verify scripts pass, 0 failed: p2b 44, deploy_reexec 13, p2a 49, p1 35,
    set_email 29, commit_before_response 17, account_workbench 28, cohort 27,
    engagement_retire 17, frozen_outcomes 21, refusal_attribution 13,
    pack_review 17, exclusions 27;
  - the client `tsc` and build pass, with bundle `index-Bq_62G2h.js`;
  - lint shows only the existing warning.
- **The P2b deploy is the first to exercise the re-exec.** The pull changes
  `lvrf-deploy.sh`, so the old script should log "changed in this pull; re-running
  the new version". The new step 7 checks then run.

### Deployed — 11 October 2026

`020f39b..bfb9371` went to production. There was no migration and no backup step,
and `.env` was unchanged (it has no `LVRF_ALLOW_ACTOR_HEADER` line).

- **The re-exec worked on its first real deploy.**
  - The old script pulled once (`020f39b..bfb9371`), saw that the pull changed
    its own file, and logged "lvrf-deploy.sh changed in this pull; re-running the
    new version".
  - The new script then logged "re-running the updated lvrf-deploy.sh; pulled
    020f39b..bfb9371 by the first run". There was no second pull.
  - The new step 7 ran: health 200, `origin_check=configured`, **`actor_header=off`**;
    no-session run 401; **a header naming vendor staff with no session → 401**;
    vhost 401.
  - Deploy OK, exit 0. The service has been up since **13:38:07 UTC**, and the
    bundle is still `index-Bq_62G2h.js`.
- **Cookie curl (Brad Piver, 13:40 UTC):**
  - login 200; the cookie file was `-rw-------`;
  - `me` 200; `/api/cohort` with the cookie 200;
  - **header-only `/api/cohort` 401** "Sign in to continue.", naming his own id;
  - logout 200; `me` after logout 401;
  - the cookie file was deleted.
- **Gate C, read-only, as `lvrf_app`:**
  - HEAD is `bfb9371`, level with origin.
  - Health reports `{"origin_check":"configured","actor_header":"off"}`.
  - The curl session `78713bcc…` (13:40:06.59) was **revoked at 13:40:06.65**
    by the logout.
  - The browser session `4e6011a2…` (12:58:12) is still live, unused since then,
    with idle expiry at 00:58:12 UTC.
  - 84 triggers, 1 current credential, 1 live session.
  - No non-staff credential or session.
  - **No audit rows and no refusals since the restart.** The last audit id is
    still 202: the curl wrote nothing governed.

## Sign-in P3 — every route answers for the actor's tenant only — 11 October 2026

**Spine stage:** cross-cutting. It guards the reads and writes behind every value-spine
stage, from `baseline` (account inputs) to `verify` (the outcome walk) and the record
documents.

**Why now.** Prod has one tenant and one staff person, so nothing can be reached
across tenants today. That changes the moment a second tenant exists. Before P3:

- no mutating route compared the target's tenant with the actor's (the lookups
  resolved `tenant_id` only to attribute refusals);
- six GET files had no tenant reference at all, so `GET /api/runs/:id` would serve
  another tenant's run.

### Decisions (approved 11 October)

1. **A mismatch is a 404**: the route's own not-found answer, so an id of another
   tenant reads exactly like an id that does not exist. An id inside a request body
   gets that field's own not-found answer.
2. **A mismatch is not a refusal.** `refusals` rows are attributed to a tenant and feed
   its gap register, so a probe would land in the victim's record. A mismatch is
   logged at **warn**, with the actor person, the actor's tenant, the route pattern
   and the target id. The request body is never logged.
3. **Reads are in P3**, through the same helper. The coverage guard lists **every**
   `/api` route under `requireActor`, GET included; `/api/health` and `/api/auth/*`
   are exempt.

### The helper — `server/lib/tenantScope.ts`

| Function | Used for |
|---|---|
| `isOtherTenant(req, targetTenantId, {table, id})` | Every lookup by id. True (and logged) when the row's tenant is not the actor's. A null tenant counts as another tenant: fail closed. |
| `actorTenantId(req)` | Every list, as a filter. |
| `personTenantId(db, personId)` | A person id chosen in a body that nothing else ties to the account (the metric owner). |

The three local `resolveActorTenantId` copies (`cohort`, `industryPack`,
`institutionView`) are gone.

Four lookups had the tenant inside their SQL `WHERE` (`engagementRetire`,
`industryExclusions`, and `industryResearch`'s parse and review routes). They now
look up by id and call the helper, so a mismatch is logged rather than silent.

### Table classification: TENANT-OWNED or SHARED REFERENCE

**How it was determined.** It was read from the schema, not assumed, by querying
`pg_attribute` for a `tenant_id` column and its nullability, and `pg_constraint` for
the foreign-key chains. Usage in the routes was then checked against that.

**No table the routes take an id of is shared.** Industries, pack measures, research
results and offerings all carry a **`NOT NULL tenant_id`**: each tenant has its own
taxonomy, pack, research and catalog. So `industry_slug` on classify is resolved
*within* the institution's tenant, which is correct, not an over-check. A slug is
unique only inside a tenant.

| Table | Class | Determined by |
|---|---|---|
| `engagements`, `industries`, `industry_measures`, `industry_measure_exclusions`, `institutions`, `offerings`, `research_results`, `value_runs`, `record_documents`, `heartbeat_events`, `refusals`, `stewardship_returns` | TENANT-OWNED | own `tenant_id`, NOT NULL |
| `persons` | TENANT-OWNED | own `tenant_id` (staff) **or** `institution_id` → `institutions.tenant_id` (customer side); `persons_scoped_to_exactly_one` makes it exactly one |
| `value_outcomes`, `business_metrics`, `capabilities`, `evidence`, `institution_facts`, `assessments`, `reflections` | TENANT-OWNED | FK chain: `institution_id` → `institutions.tenant_id` |
| `value_outcome_evidence` | TENANT-OWNED | FK chain: `value_outcome_id` → `value_outcomes` → institution |
| `capability_industry_measures` | TENANT-OWNED | FK chain: `capability_id` → `capabilities` → institution (and `industry_measure_id`, tenant-owned) |
| `offering_capabilities` | TENANT-OWNED | FK chain: `offering_id` / `capability_id` |
| `reflection_evidence` | TENANT-OWNED | FK chain: `reflection_id` / `evidence_id` |
| `person_roles` | TENANT-OWNED | FK chain: `person_id` |
| `heartbeats` | **SHARED REFERENCE** | No tenant column, and no FK to a tenant-owned table (only `persons` as steward, and itself). It is the HEARTBEAT-REGISTER: 18 rows, governance-owned. Read only as a join in `produceRun`; no route takes a heartbeat id. |
| `tenants` | **SHARED REFERENCE** | The root. No route takes a tenant id from a caller. |
| `hardening_manifest`, `audit_log` | **SHARED (system)** | No tenant column. Not readable through any route. |

Enum labels (`pg_enum`, e.g. `metric_direction`) are read by several routes. They
are schema, not rows, and are not checked.

### Inventory: all 35 routes under `requireActor`

The path id is what the route looks up; body ids are those chosen in the request.
"Was" is the state before P3.

| Route | Path id → tenant | Body ids → tenant | Was |
|---|---|---|---|
| GET /api/business-metrics/:metricId/research-prompt | metric → institution | — | unchecked |
| GET /api/cohort | list, `i.tenant_id` | — | scoped (local copy) |
| GET /api/engagements | list, `e.tenant_id` | — | **all tenants** |
| GET /api/engagements/:id/runs | `engagements.tenant_id` | — | unchecked |
| GET /api/industries | list, `ind.tenant_id` | — | scoped (local copy) |
| GET /api/industries/:slug/pack | slug + tenant in WHERE (slug unique per tenant; nothing to log) | — | scoped |
| GET /api/institutions | list, `i.tenant_id` | — | **all tenants** |
| GET /api/institutions/:id/view | `institutions.tenant_id` | — | scoped in WHERE (silent) |
| GET /api/persons | list, `COALESCE(p.tenant_id, institution tenant)`; `?institution_id` of another tenant → `[]`, logged | — | **all tenants** |
| GET /api/runs | list, `vr.tenant_id` | — | **all tenants** |
| GET /api/runs/:id | `value_runs.tenant_id` | — | unchecked |
| GET /api/value-outcomes/:outcomeId/gaps | outcome → institution | — | unchecked |
| GET /api/value-outcomes/:outcomeId/record-documents | outcome → institution | — | unchecked |
| GET /api/value-runs/:a/compare/:b | both runs' `tenant_id` | — | unchecked |
| POST /api/account-inputs | creates in the **actor's** tenant | persons/assessments created inside the new account | "the only tenant" (422 if ≠ 1) |
| POST /api/business-metrics/:metricId/pack-basis | metric → institution | `industry_measure_id` → `industry_measures.tenant_id` (**new**: it leaked the other tenant's industry name) | unchecked |
| POST /api/business-metrics/:metricId/validate | metric → institution | `confirmed_by` → must be of the account (existing); `metric.owner_person_id` → `personTenantId` (**new**) | unchecked |
| POST /api/capabilities/:capabilityId/industry-measures | capability → institution | `industry_measure_id` → tenant (**new**, same leak) | unchecked |
| POST /api/engagements/:engagementId/produce-run | `engagements.tenant_id` | — | unchecked |
| POST /api/engagements/:id/retire | `engagements.tenant_id` | — | scoped in WHERE (silent) |
| POST /api/industries/:industryId/exclusions | `industries.tenant_id` | — | scoped in WHERE (silent) |
| POST /api/industries/:industryId/research-results | `industries.tenant_id` | — | scoped in WHERE (silent) |
| POST /api/institutions/:institutionId/facts | `institutions.tenant_id` | — | unchecked |
| POST /api/institutions/:institutionId/industry | `institutions.tenant_id` (in `classifyInstitution`) | `industry_slug` resolved in the institution's tenant; another tenant's slug is now the same 404 as an unknown one (**was a 422 that said so**) | unchecked |
| POST /api/institutions/:institutionId/inputs | `institutions.tenant_id` | `owner_or_learner_person_id` → must be of the account (existing) | unchecked |
| POST /api/institutions/:institutionId/offerings | `institutions.tenant_id` | `offering_key` resolved in the tenant (existing); `owner_person_id` → of the account (existing) | unchecked |
| POST /api/institutions/:institutionId/value-outcomes | `institutions.tenant_id` | `engagement_id` → `engagements.tenant_id` (**new**: before, its 422 confirmed the engagement existed); `engagement_owner_person_id` → of the account (existing); `metric.owner_person_id` → `personTenantId` (**new**) | unchecked |
| POST /api/research-results/:id/accept | `research_results.tenant_id` | — | scoped in WHERE (silent) |
| POST /api/research-results/:id/reject | `research_results.tenant_id` | — | scoped in WHERE (silent) |
| POST /api/value-outcomes/:outcomeId/commit | outcome → institution | `committed_by` → of the account (existing) | unchecked |
| POST /api/value-outcomes/:outcomeId/evidence | outcome → institution | `attested_by` → of the account (existing) | unchecked |
| POST /api/value-outcomes/:outcomeId/measure | outcome → institution | — | unchecked |
| POST /api/value-outcomes/:outcomeId/verify | outcome → institution | `verified_by` → of the account (existing) | unchecked |
| POST /api/value-runs/:runId/lock | `value_runs.tenant_id` | — | unchecked |
| POST /api/value-runs/:runId/record-document | `value_runs.tenant_id` (outcome from the run's own payload) | — | unchecked |

Rows reached *from* a checked target (an outcome's evidence, a run's engagement,
an account's metrics) are the target's own tenant by their FK chain, and are not
checked again.

### Behaviour that changes beyond the check

- **`POST /api/account-inputs`** creates the account in the actor's tenant. Before,
  it used the only tenant and refused with 422 when there wasn't exactly one.
- **Classify with another tenant's slug** is now a 404, as for an unknown slug. It
  used to be a 422 that said the slug belonged elsewhere.
- **`metric.owner_person_id`** (`value-outcomes`, `validate`) used to be checked
  only by its foreign key. A retired, superseded or unknown person was accepted or
  hit a 500. Now it must be a current person of the actor's tenant, or it gets 422
  "not found".

### Later items, recorded at P3

- **The database-level backstop. Not built; needs its own plan.** `actorContext`
  would also set `lvrf.actor_tenant_id`, and Postgres would refuse cross-tenant
  writes itself, either by a trigger on each tenant-owned table or by row-level
  security. CLAUDE.md prefers constraints to code, so this is the stronger
  long-term answer. It touches every governed table and the read path, so it is
  planned separately.
- **`GET /api/value-runs/:a/compare/:b` returns 500 for old runs.** Their payload
  has no `confidence.modelVersion`: "Cannot read properties of undefined
  (reading 'modelVersion')". This predates P3 (HEAD gives the same on local
  `lvrf`). It should be a 422 naming the run that predates the model version.

### Gate A

- **`verify_tenant_scope.sh`: 10 setup checks and 121 cases, 0 failed.** It runs on a
  throwaway clone. Tenant A is local Skillsoft; tenant B is created with staff, an
  account, a customer, an engagement, an industry and a measure. Both sign in with
  **sessions; the header is off.**
  - **Coverage guard.** `scripts/list_api_routes.mjs` reads every route statically:
    `index.ts` mounts plus each factory's `router.<method>('…')`. Express 5 keeps
    mount paths in closures, so the running app cannot be asked. It **refuses** on
    any shape it cannot read: an unknown mount, a non-literal path,
    `router.use/all/route`. Result: 35 routes, all with a case, and no case without
    a route.
  - **B against A.** Every id route gives the route's exact not-found answer, and
    each mismatch is logged with actor, tenant, route and target. The slug route
    gives a plain not-found with no log, by design. `?institution_id` of A's
    account → `[]`, logged. Every list shows B none of A's rows and all of its own.
    **Not one `audit_log` row came from B's requests.**
  - **Body ids of another tenant** (claim and pack-basis measures; value-outcome
    engagement and metric owner; validate's metric owner; commit's
    `committed_by`; classify's slug) get **the same status and message as an
    unknown id**, logged where they are tenant mismatches.
  - **Logging.** `refusals` is unchanged across all of it, and a marker placed in
    every request body never reaches the server log.
  - **Controls.** A's identical requests never get the not-found answer, so each
    case proves that only the tenant differed. A's lists show its rows and none of
    B's.
  - **`account-inputs`.** B creating an account with A's account name → 201, in
    tenant B. A, same name → 409.
- **Six deliberate breaks, each caught, then restored byte-identical:**

  | Break | Result |
  |---|---|
  | The helper always passes | 67 FAIL |
  | One route unchecked (`GET /api/runs/:id`) | 2 FAIL |
  | `GET /api/runs` unfiltered | 1 FAIL |
  | `GET /api/persons` unfiltered | 2 FAIL |
  | The claim route's body measure unchecked | 2 FAIL |
  | **A new route with no case** | **coverage guard FAIL** |

  With the claim check removed, the other tenant's measure reached the
  industry-mismatch 422, which is the leak this check closes.
- **Regression:**
  - all 14 verify scripts pass, 0 failed: tenant_scope 121+10, signin_p2b 44,
    deploy_reexec 13, signin_p2a 49, signin_p1 35, set_email 29,
    commit_before_response 17, account_workbench 28, cohort 27,
    engagement_retire 17, frozen_outcomes 21, refusal_attribution 13,
    pack_review 17, exclusions 27;
  - the client `tsc` and build pass, with bundle `index-Bq_62G2h.js`, unchanged:
    no client change;
  - lint shows only the existing warning.
- No migration; 84 triggers.

### Before Gate B: two checks on the prod copy

- **Reads are byte-identical on prod data.** `lvrf_prodcopy` (the 10 October
  snapshot, all 28 migrations, one tenant) was served by HEAD `bfb9371` and by the
  P3 tree side by side, as `b6da352c-…` via the header (it is not production).
  - Every GET route was fetched for every applicable id: every metric, engagement,
    institution, outcome and run; every industry slug; `persons` with and without
    each `institution_id`; 40 locked-run pairs for compare.
  - **99 requests across all 14 routes, 0 differences** in status or body. That
    includes the existing 404, 409 and 422 answers.
  - Nothing was written to the copy (audit max id 199 → 199, sessions 0 → 0), and
    no mismatch was logged.
- **One write per kind succeeds on prod data.** Two throwaway clones of the prod
  copy were made (never `lvrf_prodcopy` itself), one served by HEAD and one by P3,
  and the same sequence was sent to each.
  - **Every write succeeded on P3, with status and message identical to HEAD**: 201
    or 200 for facts, inputs, offerings, value-outcomes, pack-basis, validate,
    claim, exclusion, evidence, commit, measure, verify, produce-run → lock →
    record-document, account-inputs (classified), classify and retire.
  - The research-result accept and reject routes have no pending row in the prod
    copy. They are covered by `verify_pack_review` and `verify_tenant_scope`.
  - Both clones were dropped.
- **Customer-side people are accepted.** Two new cases in `verify_tenant_scope`
  (123 passed now):
  - a **customer-side person at A's own account** as `metric.owner_person_id`:
    the value-outcome request → 201, stored as the owner;
  - the same person on validate passes the owner check.

  The prod-copy dry run did the same with Curia's non-simulated customer-side
  person as metric owner, confirmer, attester, committer and verifier.

**Which person ids go through which check:**

| Check | Accepts | Fields |
|---|---|---|
| `personTenantId`, new in P3 | any **current** person of the actor's tenant: staff, **or customer side at any of the tenant's accounts**. Simulated is accepted, as the FK alone did before. | `metric.owner_person_id` (value-outcomes, validate) |
| Of the target account (`institution_id = $account AND NOT simulated`), unchanged | customer-side people **of that account**, not simulated, not retired; staff are not accepted | `committed_by` (commit), `verified_by` (verify), `attested_by` (evidence), `confirmed_by` (validate), `engagement_owner_person_id` (value-outcomes), `owner_person_id` (offerings), `owner_or_learner_person_id` (inputs) |

The second check already implies the tenant, because the account was
tenant-checked first.

### Deployed — 11 October 2026

`bfb9371..75e92c3` (`d794f17` writes, `75e92c3` reads) went to production. There
was no migration and no backup step.

- **The deploy passed:** health 200, `origin_check=configured`, `actor_header=off`;
  no-session 401; header-only 401; vhost 401; deploy OK.
  - There was no re-exec: `lvrf-deploy.sh` did not change in P3.
  - It was pasted twice. The second run was a no-op rebuild and restart, and it
    also passed.
  - The service has been up since **14:26:00 UTC**, and the bundle is still
    `index-Bq_62G2h.js`.
- **Cookie curl (Brad Piver, 14:27 UTC):**
  - login 200; the cookie file was `-rw-------`;
  - `me` 200;
  - **`/api/institutions` now filters by tenant and returns the same two
    accounts as before:** Curia (Pharmaceutical & Biotechnology, 1 engagement)
    and Skillsoft (no industry, 1 engagement);
  - his run `88f6a6e1…` 200;
  - header-only 401; logout 200; `me` after logout 401; the cookie file was
    deleted.
- **Gate C, read-only, as `lvrf_app`:**
  - HEAD is `75e92c3`, level with origin. Health reports `configured` / `off`.
  - The curl session `9fc5c12f…` (14:27:22.58) was revoked at 14:27:22.67.
  - The only live session is the browser session `4e6011a2…` (12:58:12).
  - **No audit rows and no refusals since the restart; the last audit id is still
    202.**
  - 84 triggers, 1 tenant, 2 accounts, 1 credential.
  - Both accounts carry the one tenant, so the P3 filter hides nothing on prod.

## Sign-in P1–P3 complete — what protects prod now — 11 October 2026

1. **Only a signed-in person acts.** argon2id passwords and server-side sessions
   (HttpOnly, SameSite=Lax, Secure); every `/api` read and write needs a session.
2. **The header cannot act in production.** `LVRF_ALLOW_ACTOR_HEADER=1` refuses to
   start there, health reports `actor_header`, and the deploy fails unless it is
   `off`.
3. **Every write must be JSON and same-origin** (`LVRF_PUBLIC_ORIGIN`), and the API
   listens on `127.0.0.1` only, behind Caddy's TLS and basic_auth.
4. **Every route answers for the actor's tenant only.** Another tenant's id reads
   as not found and is logged. A coverage guard fails any new route without a
   tenant case.
5. **The database still enforces the rest.** Audit triggers record the session's
   person as actor, deletes are blocked, the audit log is append-only, and the
   nightly `pg_dump` runs.

## P4 — Caddy basic_auth is kept (decision, 11 October 2026)

**Decided by Brad Piver: keep basic_auth in front of everything.** It costs one
extra prompt for the one person who signs in, and it keeps unauthenticated internet
traffic off Express while sign-in is new and has no MFA.

**When it is revisited:** when a second person needs access, and per the 3.0 draft
(revision 3), only after its item 2 (the acts that are Brad's alone) is built.

**Before removal, all of these, through the usual gates:**

1. a per-email sign-in throttle across all IPs (today it is 5 failures per IP and
   email per 15 minutes), plus an alarm on global failures;
2. security headers: HSTS and a CSP;
3. the `www` → apex redirect in Caddy (one origin, one cookie), then drop `www`
   from `LVRF_PUBLIC_ORIGIN`;
4. TOTP as an option for vendor staff;
5. a flip of `lvrf-deploy.sh`'s vhost check, from "401 (basic_auth)" to "the
   sign-in page is served, and `/api/*` without a session is 401".

Removal itself is then one Caddy change plus that script change.

## Fact supersession — a fact is corrected by a new fact — 11 October 2026

**Spine stage:** `baseline`. The last item of 2.0. Its first use is Skillsoft's
`system` fact `c966ef3b…`, `LVAF` → "LVRF (value realization records)". That
correction is Brad's to make in the browser after deploy.

### Before building: does an old run read facts live? (3.0 draft item 10)

**No. Facts are not an input to runs or records at all.**

- `produceRun` builds its payload from the outcome, metric, capability, evidence
  and heartbeat events, and stores it with its hash. No fact id or value is in it.
- `GET /api/runs/:id` returns that stored payload, with only the account *name*
  joined live.
- Record documents are produced from the run payload.

So superseding a fact cannot change an old run or record, and this did not need
to wait for item 10. Item 10 becomes binding when research (3.0 item 6) feeds
facts into runs.

### What was built

- **Migration `0028_fact_supersession`**: `institution_facts.supersession_reason`
  plus `CHECK institution_facts_supersession_reason`. A fact is superseded
  exactly when it carries a reason of at least 12 characters.
  - The CHECK holds against every existing row: prod 1 fact / 0 superseded,
    `lvrf_prodcopy` 0 / 0, local `lvrf` 0 / 0.
  - Verify scripts create facts only through the route, and every clone migrates
    cleanly.
  - No new trigger; 84 stays 84. `_supersession_sane`, `_audit`, `_touch` and
    `_no_delete` already covered the table.
  - **Back up before applying it on prod** (rule 8).
- **`POST /api/institutions/:institutionId/facts/:factId/supersede`**, in
  `institutionFacts.ts` beside the create route. The two share one parser and one
  insert, so that file is still the one writer of `institution_facts`.
  - The fact must be on that account; otherwise, or for another tenant's fact, the
    answer is 404 (the P3 helper).
  - Only the current fact can be corrected: correcting an earlier one gets 409,
    naming the current one.
  - The kind cannot change (422). The reason must be at least 12 characters
    (422; the CHECK is the backstop).
  - The new fact carries its own evidence. The old row is updated with
    `superseded_by_id` and the reason, guarded on `superseded_by_id IS NULL`, so
    a second, racing correction gets 409 and its rows roll back.
- **`GET /api/institutions/:id/view`**: each current fact carries `history`,
  newest first, from a recursive walk down the chain. Each entry gives the earlier
  value, its source, who recorded it, **who replaced it, when, and why**.
- **The account card**:
  - "Correct…" on each fact opens a form headed *Correcting: …*. The kind is
    locked, the value and as-of date are pre-filled, and the source and reason are
    required.
  - A corrected fact shows "Corrected <when> by <who> · N earlier value(s)".
    Expanded, each earlier value is labelled **Superseded**, in `--ink-45`.
  - Checked at desktop and 390 px.
- **Coverage guard.** The new route raised the count to 36, and its case was
  required. `verify_tenant_scope`: B gets 404 on A's fact; A gets 201.

### Gate A

- **`verify_fact_supersession.sh`: 38 passed, 0 failed**, on a clone migrated to
  0028.
  - The correction mirrors the real one, LVAF → LVRF (value realization records).
  - Refused before any write: no reason, a short reason, a kind change, a short
    provenance, another account's path, an unknown fact.
  - The old row keeps `LVAF`, points at its successor and carries the reason. The
    new fact is the same kind, current, with its own evidence.
  - Audit rows: the UPDATE and the INSERT, both with the corrector as actor.
  - Re-correcting the old fact → 409 naming the current one.
  - The view lists only the current fact. A chain of two shows its history newest
    first.
  - A correction to 0 is stored as 0.
  - **A deterministic race:** a held row lock makes both requests queue on the
    UPDATE. The result is 201 / 409, one new fact, one current fact.
  - By SQL, the CHECK refuses: a successor without a reason, a reason under 12
    characters, a reason on a current fact. The same UPDATE with a reason is
    accepted.
  - The superseded row cannot be deleted.
- **Five deliberate breaks, then restored byte-identical:**

  | Break | Result |
  |---|---|
  | The race guard removed | 3 FAIL: 201 / 201, two current facts. The first, timing-based race test let this pass, and was made deterministic |
  | The "already corrected" check removed | 1 FAIL (wrong 409) |
  | History removed from the view | 2 FAIL |
  | The tenant check removed | 3 FAIL in `verify_tenant_scope` |
  | The route's reason check removed | **still refused**: the CHECK returned the 422. This is the constraint doing its job |

- **Browser check**, on a throwaway clone, signed in by session:
  - an LVAF fact → "Correct…" → the form → a correction is recorded;
  - the card shows the corrected value, the "Corrected … · 1 earlier value"
    line, and the expanded *Superseded LVAF* entry with the reason;
  - checked at 390 px;
  - the "Correcting" summary was moved above the provenance block after the
    first screenshot showed it read last.
- **Regression:** all 15 verify scripts pass, 0 failed. The client `tsc`, build and
  lint pass. The bundle is now `index-CUeqTSHI.js`; the client changed.

### Deployed — 11 October 2026, and the LVAF correction made

`75e92c3..cb666e9` (`3e691c8` fact supersession; `50306d5` and `cb666e9` docs) went
to production, with migration 0028.

- **Backup first:** `~/lvrf_pre_0028_20261011_180905.dump` (549,997 bytes,
  `-rw-------`, 438 TOC entries), taken with the box at `75e92c3`.
- **Migration:**
  - `0028` applied cleanly; `hardening.sql` exited 0; 84 triggers.
  - The newest migration is `1791729812829`, row 29.
  - Facts before the correction: 1 / 0 superseded / 0 reasons.
  - `\d institution_facts` shows the `supersession_reason` column, the
    `institution_facts_supersession_reason` CHECK and the same four triggers.
- **Deploy:** deploy OK, exit 0, HEAD `cb666e9`, bundle **`index-CUeqTSHI.js`** /
  `index-D8pRZG-E.css` (the account card changed). Up since **18:12:50 UTC**.
- **The correction, made by Brad Piver in the browser at 18:16:11 UTC.** The card
  shows "LVRF (value realization records)", his new provenance, Unverified, and
  "Corrected Oct 11, 2026, 2:16 PM by Brad Piver · 1 earlier value".
- **Gate C, read-only, as `lvrf_app`:**
  - **The chain.** `c966ef3b…` still reads **`LVAF`** (the typo stays in history).
    It now points at `f1e2385e…` with the reason *"Typed LVAF for LVRF at capture;
    the provenance says LVRF."*, and its `updated_at` is the correction's
    moment. `f1e2385e…` reads "LVRF (value realization records)", is current,
    and has no reason of its own. Both were captured by Brad.
  - **Separate evidence.** The original evidence `1e85f541…` is unchanged. The new
    fact's own evidence is `f41102bc…`: observation, high confidence,
    unverified, not AI-sourced. Its provenance: *"Stated by Brad Piver: Skillsoft
    records value realization in LVRF. Correcting the value typed at capture on
    11 October 2026."*
  - **Audit.** Rows **203** (evidence insert), **204** (fact insert) and **205**
    (the old fact's update) are the only rows since the deploy, and **all three
    have Brad as actor**, at one transaction time, 18:16:11.091796.
  - **The session.** It came through browser session `4e6011a2…` (from 12:58),
    whose `last_seen_at` of 18:16:11.0877 is the resolution on that request.
  - **Nothing else.** No refusals; 84 triggers; 0028 newest; the CHECK is present
    with 0 violations.


## 3.0 Band A — access is granted, and the grant is a record — 11 October 2026

**Spine stage:** cross-cutting. Band A decides who may act at all (item 1), and who
may perform the acts that are Brad's alone (item 2). Decisions Q2–Q4 and D3–D6 were
made by Brad Piver on 11 October 2026 (`docs/LVRF_PLAN.md` §3).

It ships in three deploys, so that nobody can be locked out:

| Deploy | Contents |
|---|---|
| **A** | The record, the scripts and change-password. Sign-in is **not** yet gated on a grant |
| **B** | Sign-in requires a current grant, plus the deploy-script pre-check |
| **C** | Brad-only acts, through one shared check |

### The trust root, stated rather than hidden

**SSH to the box, and the postgres superuser, are trusted.** Everything below
guards the app role (`lvrf_app`) and the scripts that connect as it. It does not
guard against those two:

- **Break-glass `set_password.ts` can reset the steward's own password** for anyone
  with SSH. That is its purpose: the steward's password, lost.
- **The postgres superuser can bypass everything**: it can disable
  `access_grants_steward_only`, write `tenants.steward_person_id`, or read and write
  any row.

Both are accepted. What the scripts add on top of SSH is the **steward's own
password** (argon2, against their current credential) as the proof of every
grant, revocation and reset. Naming the steward needs **the named person's own
password**.

### Deploy A — what was built

- **Migration `0029_access_grants`:**
  - **`access_grants`:** person, tenant, granted_by, granted_at, a reason of at least
    12 characters; then revoked_at, revoked_by and a revocation reason, all or none,
    the reason at least 12 characters, and never before the grant. One current grant
    per person (partial unique index).
  - **`person_credentials.must_change`:** default false; every existing credential
    is unaffected.
- **`hardening.sql` section 16:** `access_grants_audit`, `access_grants_no_delete`,
  and **`access_grants_steward_only`**. Triggers 84 → 87.
  - On INSERT, the grantee must be current, non-simulated vendor staff of
    `NEW.tenant_id`. That tenant must have a steward, and `granted_by` must be that
    steward. The revocation fields must be empty.
  - On UPDATE, only the revocation may be written, once, and `revoked_by` must be the
    steward.
  - The steward's own first grant (grantor = grantee) passes the same rule: it is
    the bootstrap.
- **The scripts.** They share `scripts/lib/cli.ts`: the hidden prompt, the staff
  lookup, `provePassword` (three tries, argon2) and the audit read-back.
  - **`set_steward.ts <email>`:**
    - proves the **named person's** password first;
    - refuses if a steward is already set;
    - self-attested, like `set_email`;
    - `tenants_audit` is read back and checked.
  - **`grant_access.ts <email> --reason … [--name …]`:**
    - proves the steward's password;
    - creates a new vendor-staff person if needed (audited, actor = the steward). The
      email must be **plausible** and **unique case-insensitively across all persons**,
      as `set_email` requires;
    - refuses a second current grant;
    - prompts twice for a **starting password**, never printed, stored with
      `must_change`. Any earlier credential and session of the person is revoked;
    - the bootstrap self-grant keeps the steward's own password.
  - **`revoke_access.ts <email> --reason …`:**
    - proves the steward's password;
    - refuses the steward's own grant;
    - in one transaction, revokes the grant, the credential and every session.
  - **`reset_password.ts <email>`:**
    - proves the steward's password;
    - the person must hold a current grant (a reset is not a way in);
    - not for the steward;
    - sets a new starting password with `must_change` and ends their sessions.
  - **`set_password.ts`** now covers only **break-glass** (the steward) and **initial
    setup** (a tenant with no steward yet). It refuses anyone else and points at
    `grant_access` and `reset_password`. Until Band A, anyone with SSH could set any
    staff password this way, bypassing every grant.
- **must_change and change-password:**
  - A session now stands on a current credential. Revoking the credential ends it.
  - The session carries `must_change`. **`requireActor` answers 403
    `password_change_required` on every `/api` route past it, reads included**, so
    no route can forget the gate.
  - **`POST /api/auth/change-password`** requires the current password (throttled like
    sign-in), at least 12 characters and a different password. In one transaction it
    revokes the old credential, inserts the new one (`set_via self`, `must_change`
    false), and **ends every other session**, keeping this one.
  - The client shows a forced "Choose a new password" page while `must_change` holds,
    and a "Change password" dialog from the bar at any time.
- **Supporting files:**
  - `tsconfig.scripts.json`, so the scripts are type-checked by the verify suite;
  - `scripts/lib/pty_answer.py`, which drives the scripts' hidden prompts and fails
    any run that echoes an answer or an argon2 hash.

### Deploy B — sign-in requires a current grant

- **`resolveSession` and `POST /api/auth/login`** both require a current access grant,
  as well as a current credential.
  - At sign-in, no grant gets the same 401 and the same message as a wrong password.
  - Revoking a grant ends every session at its next request. The session row
    itself is untouched; the check is on every request.
  - The test-only header path is unchanged. It is off in production (P2b).
- **The lockout pre-check.** `scripts/precheck_steward_grants.sql` counts the tenants
  that have people with current passwords but whose steward lacks a current grant
  or a current password.
  - `lvrf-deploy.sh` step **5b** runs it as `lvrf_app` **before the restart**, and
    stops the deploy unless it reads 0. The running service is left untouched.
  - The deploy script changed in this commit, so the deploy re-execs into the new
    version (as at P2b), and the check runs.
- **The fixtures.** The verify scripts that sign in by session (`signin_p1`, `p2a`,
  `p2b`, `set_email`, `tenant_scope`) now name their staff person steward and grant
  them access, in the bootstrap shape the trigger allows.
  - `verify_access_grants` flips one assertion: a person with no grant now gets 401.
- **Local development:** `LVRF_Local_Setup.md` Phase 11 now gives `set_password`
  (initial setup) → `set_steward` → `grant_access` for local `lvrf` (needs 0029).
