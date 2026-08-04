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
