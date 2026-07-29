# LVRF — Working Constitution

**Learning Value Realization Framework.** A Chapel of the Rule76 Living Cathedral,
sibling to CVAF. This file is normative for all agent-assisted work in this repo.
Read it before writing code.

---

## What this product is

A **vendor-facing value engineering instrument.** Its user is a value engineer or
account executive at a learning vendor. Its audience is **the customer's CFO**. Its
output is a defensible document — the Realization Record — that makes a renewal or
expansion survive procurement.

It is **not** an LMS, an LXP, or a learning experience. Learners and coaches are
*subjects of measurement*, not users of the system.

If a proposed feature serves a learner's experience rather than a value engineer's
argument, it is out of scope for 1.x. Say so rather than building it.

### The two spines

LVRF has two, because it has two users.

- **Value spine** (the operator, 7 stages) — `baseline → attach → model → commit →
  measure → verify → return`. Mirrors CVAF's ECC spine. This is the primary workflow.
- **Learning spine** (the subject, 13 stages) — `observe → assess → understand → plan
  → learn → practice → reflect → demonstrate → measure → preserve → improve → teach →
  return_to_rule76`. Nests *inside* `attach`/`measure` as the mechanism producing the
  capability change.

The learning spine's terminal stage is a **write**, not a label. Two prior documents
truncated it at `teach`; that is a defect, not a variant.

---

## Non-negotiable rules

These encode failures already paid for in CVAF 1.2. Violating them recreates known bugs.

1. **Zero is data.** Numeric fields are `NOT NULL` with CHECK ranges that include zero.
   Never coerce `0` to null/blank. An assessment score of 0 and a baseline of 0 are both
   legitimate.
2. **No hard deletes on governed objects.** Every FK is `ON DELETE RESTRICT`. Retirement
   is `deleted_at` plus a status change. `hardening.sql` installs a `BEFORE DELETE`
   trigger that raises — do not work around it.
3. **The audit log and heartbeat are append-only.** `UPDATE`, `DELETE` and `TRUNCATE`
   are revoked from `lvrf_app` at the database level. Do not add routes that attempt them.
4. **A human authorizes.** AI may draft a reflection or recommend a lever. AI may never
   be the assessor of record, the reviewer of a reflection, or the verifier of a value
   outcome. Enforced in CHECK constraints; keep it enforced in the API.
5. **Provenance is required on evidence.** Evidence without a named source is an
   assertion. `provenance` is `NOT NULL` on `evidence`.
6. **The disclosure gate is visible.** A record that is not `verified` must *render* as
   unverified. Never suppress the banner to make a document look finished.
7. **Never `npm audit fix --force`.**
8. **Back up before migrating.** `pg_dump -Fc` before any schema change against a
   database with data in it.

### The governing AI principle

> **AI assists the evidence. It never manufactures the value.**

The measured actual comes from the customer's system of record. If a number cannot be
sourced, the field stays empty and the record says so. Fabricating a plausible figure is
the single worst failure this system can commit — it destroys the only thing the product
sells, which is defensibility.

---

## Stack

**Installed and verified on the VPS `srv1862778`:** Postgres 16.14 (db `lvrf`, role
`lvrf_app`, localhost only, **data page checksums on**, tuning drop-in at
`conf.d/10-lvrf-tuning.conf` for 8GB RAM) · pgvector 0.6.0 (unused for now) ·
Node 24.18.0 / npm 11.16.0, matched on the dev Mac · Caddy with valid certs for
`lvrf-rule76.com`, proxying `127.0.0.1:3001` · nightly `pg_dump -Fc` at 03:00,
14-day retention.

> **Caddy is pinned to IPv4 deliberately.** `localhost` resolved to `::1` while
> Express binds IPv4, which 502s. Do not "simplify" it back to `localhost`.

**Chosen, not yet installed:** Express + argon2 sessions · Drizzle ORM + Drizzle Kit
(schema in TS, versioned migrations) · React/Vite + Tailwind · WeasyPrint 69.0
(`pip install weasyprint --break-system-packages`, then Bebas Neue and Barlow into
`~/.fonts` and **`fc-cache -f`** — skip the cache step and rendering falls back to
default fonts silently).

Separate repo, database and VPS from CVAF. CVAF carries live revenue; nothing here
may reach it.

### WeasyPrint constraints

CSS **Grid is unreliable** — use flexbox and HTML tables. QA every template with
`pdftoppm -png` and actually look at it. The Grid restriction is **PDF-pipeline
only**; Grid is fine in the React SPA.

---

## Rule76 design tokens

Canonical. Do not restate these values anywhere else in the repo — cite this file.

| Token | Value |
|---|---|
| ink | `#09090A` |
| gold | `#C9A24A` |
| silver | `#C0C0C0` |
| off-white | `#FAFAFA` |
| display | Bebas Neue |
| body | Barlow |

`#C8A24A` is a typo that appeared in an early PDF. The SPA's HSL value is drift. Gold is
`#C9A24A`.

No decorative stripes.

---

## Amendments to CDS-001

The written volumes are **drafts, none ratified**. Where this repo departs from them, the
code is authoritative and the departure is recorded here.

| # | Change | Reason |
|---|---|---|
| A1 | Learning spine of record = 13 stages ending `return_to_rule76` | Four documents gave four sequences; two dropped the return |
| A2 | Lifecycle reordered: `ratified` **before** `active` | Volume III put objects in production before governance approved them |
| A3 | `Versioned` removed as a state; `superseded_by_id` added | It is an event, not a state; adds the version loop |
| A4 | `provenance`/`confidence` scoped to evidence-bearing tables only | Universal fields meaningless on most objects — the zero-is-blank setup |
| A5 | Learner / Coach / Steward unified as `persons` + `person_roles` | One human is often all three |
| A6 | Agent renamed Learning **Copilot** | Collided with the Coach persona and object |
| A7 | Stack is Postgres on one VPS, not cloud-native microservices | Volume IX described infrastructure that does not exist |
| A8 | Product reoriented from learner-facing to **vendor-facing** | CDS-001 targets a CLO; the actual buyer is a CRO |
| A9 | `tenants` added above `institutions`; two spines formalized | A vendor operates across many customer institutions |
| A10 | `COMPASS-INHERITANCE-AUDIT` §14/§15 amended via `AMENDMENT-001` | §14 certified LVRF as learner-facing and assigned it Learning ROI; both superseded |

---

## The Cathedral corpus

LVRF is a Chapel. The governing instruments live in the **`rule76-cathedral`**
repo, not here. Where they and this file conflict, the conflict must be **named**,
not resolved silently.

**Adopted without reservation — normative for this repo:**

- `HEARTBEAT-REGISTER.md` (R76-HB-001). Twelve registered heartbeats, seven
  categories, five health states, six severity levels, the canonical event
  contract (§11) and persistence rules (§12). It is the most implementable
  instrument in the corpus.
  - `db/schema.ts` holds the register as the `heartbeats` table; `heartbeat_events`
    is foreign-keyed to it. **An unregistered event is refused by Postgres.**
    Seed with `db/seed_heartbeat_register.sql`.
  - **Adding a heartbeat is a governance act.** If a feature needs one that isn't
    registered, stop and say so — do not insert a row.
  - **Known gap:** no `financial` or `learning` heartbeat is registered. LVRF's
    core events (baseline established, target committed, value verified) have no
    registered heartbeat yet. This requires a register amendment before those
    events can be emitted constitutionally.
- `COMPASS-INHERITANCE-AUDIT` Principles I–V, root object set, and every finding
  other than §14/§15.

**Amended by `AMENDMENT-001` (ratified 28 Jul 2026, in force):**

- §14 LVRF ownership — now Value Baseline, Capability-to-Metric Attachment,
  Realization Record, Evidence Coverage, Confirmation Gap. Learning assessments
  and competencies are retained as **mechanism**, not owned capability.
- Learning ROI **struck** as an owned capability. Report numerator and investment
  separately; never compute the ratio.
- Compass consolidated to the §15 definition. Two competing definitions superseded.

**Unresolved — do not build against either side:**

- Compass sits **above** the Canonical Object Constitution in
  `HEARTBEAT-REGISTER` §3, and as a **sibling** of the Chapels in
  `COMPASS-INHERITANCE-AUDIT` §4. Parent in one diagram, peer in another.
- The **Repository Constitution** is IN PROGRESS and will govern immutability,
  snapshots and lineage. `record_documents` here is **provisional** and must be
  reconciled when that instrument ratifies.

---

## The one document registry rule

**No file in this repo may restate a canonical value — only cite this one.**

Spine sequences, design tokens, object ownership, ratification authority: defined here,
referenced everywhere. Two golds and four spines happened because canonical values were
restated in multiple places with nothing declaring authority. Cite, don't copy.

---

## Working conventions

- Before proposing a feature, name which value spine stage it serves. If none, it is out
  of scope.
- Before a migration, state what it changes and what it could orphan.
- Prefer a CHECK constraint over a validation comment; constraints survive refactors.
- When a spec and this file disagree, this file wins — and **flag the conflict** rather
  than silently resolving it.
