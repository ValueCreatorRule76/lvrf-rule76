# LVRF — Build Status

**28 July 2026.** Build officially commenced.

---

## Constitutional state

| Instrument | Status |
|---|---|
| `AMENDMENT-001` — Chapel reorientation, LVAF→LVRF, Learning ROI struck | **Ratified** |
| `AMENDMENT-002` — Heartbeat Register extension, HB-0013..0018 | **Ratified** |
| `AMENDMENT-003` — Financial as seventh health dimension | **PROPOSED — awaiting ratification** |
| `AMENDMENT-004` — Pack as Cathedral canonical object | Not drafted |

`AMENDMENT-003` is already implemented in `records/simulate_spine.py`. Code is ahead of
governance on this one item. Ratify or amend.

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

## Known defects

Found reviewing the generated migration (`db/drizzle/0000_*.sql`) before anything was
applied to the database.

- **Defect 1 — resolved.** `heartbeats.superseded_by_id` inherited `uuid` from
  `governance()`, but `heartbeats.id` is `text` (register IDs like `HB-0001`) — the
  column could never hold a valid reference. Overridden in `db/schema.ts` immediately
  after `...governance()` to `text('superseded_by_id')`. Migration regenerated from a
  clean `db/drizzle/`; column confirmed `text` where every other table still has `uuid`.
- **Defect 2 — open, deferred.** Neither `superseded_by_id` nor `steward_person_id`
  carries a foreign key on any of the 18 tables — 49 FKs generated, none for these two
  columns. Unconstrained UUIDs are the orphaned-relation defect class this file warns
  against. Deferred deliberately rather than rushed: `stewardPersonId` is circular
  through `persons`, and `supersededById` is a genuine self-reference requiring Drizzle's
  `AnyPgColumn` return-type annotation on the FK builder — both need to be done as a
  considered `0001` migration, not a same-sitting edit. Nothing currently writes either
  column, so there is no live orphan risk yet.

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

## Not built — next, in priority order

1. **Use B record.** Customer zero measures Skillsoft's *sales capability*. The role
   requires measuring a *customer's* workforce capability against the *customer's* metric.
   Different value hypothesis, same schema. Fixture change plus item 2.
2. **Attestation weighting in the confidence engine.** A vendor cannot source-verify a
   customer's internal metric, so 50 of 100 points are structurally unreachable in Use B.
   `evidenceKind` already includes `attestation`; the engine must credit it at partial
   weight.
3. **Confirmation-gap engine.** `AMENDMENT-001` Article II assigned LVRF ownership of
   Confirmation Gap. Nothing computes it.
4. **Industry Pack model.** Two axes, not one: vertical packs (industry → metric library,
   attestation authority, regulatory overlay) crossed with horizontal packs (role family →
   capability set). Build **one** pack. Six is the thirteen-volumes error in a new costume.
   A pack supplies content, never presentation.
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
