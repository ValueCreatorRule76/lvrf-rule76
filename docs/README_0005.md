# 0004 — Offerings Catalog · run order

Everything here was executed against **Postgres 16.14** (same minor as `srv1862778`) before delivery. Results are at the bottom.

Related proposal: `R76-LVRF-PROP-001` is filed at `docs/proposals/` (HTML + PDF).

---

## Files

| Path | What it is |
|---|---|
| `db/migrations/0004_offerings_catalog.sql` | The DDL. Executed and verified. |
| `db/prove_0004_constraints.sql` | Step-0 proof that every constraint bites. Rolls back; writes nothing. |
| `db/schema_0004_append.ts` | Drizzle parity. **Append to `db/schema.ts` — never replace it.** |
| `records/seed_offerings.mjs` | Seed loader. Introspects rather than guesses. `--dry-run` supported. |
| `records/offering_catalog_skillsoft.json` | The 12 offerings. |
| `src/gates/evidentiaryBasis.ts` | The route-level refusal. Truth table green, 9/9. |
| `src/gates/__tests__/evidentiaryBasis.test.mjs` | That truth table. |

---

## Run order

**0 · Recon first.** Confirm `0004` is actually the next migration number — I do not know whether `0003` (the `value_run_id` deferrable FK) was applied or is still spec-only. Confirm no catalog table already exists. Confirm the real shape of `capabilities`.

**1 · Back up.**
```bash
pg_dump -Fc -d lvrf -f ~/lvrf-backups/pre-0004-$(date +%Y%m%d_%H%M%S).dump
ls -lh ~/lvrf-backups/ | tail -1
```

**2 · Apply the migration.**
```bash
psql -d lvrf -v ON_ERROR_STOP=1 -f db/migrations/0004_offerings_catalog.sql
```
Verification queries run automatically at the end. Expect 2 tables, 5 CHECKs, 3 enums (5/8/5), **0 triggers**.

**3 · Harden.** `offerings` is a governed table; `offering_capabilities` is not.

In `db/hardening.sql`, extend the governed array:

```diff
   governed text[] := ARRAY[
     'tenants', 'institutions', 'persons', 'engagements', 'business_metrics',
     'capabilities', 'assessments', 'evidence', 'reflections',
-    'value_outcomes', 'stewardship_returns', 'heartbeats'
+    'value_outcomes', 'stewardship_returns', 'heartbeats', 'offerings'
   ];
```

and the expectation comment:

```diff
-  -- Expect 24 rows (12 governed tables x 2 triggers).
+  -- Expect 26 rows (13 governed tables x 2 triggers).
```

Then re-run it. **Use the numbers recon actually found, not the numbers above** — I am working from the schema as of migration 0002.

```bash
psql -d lvrf -v ON_ERROR_STOP=1 -f db/hardening.sql
```

Then confirm DEFECT-001 has not come back on the new table — audit must be **AFTER**, touch must be **BEFORE UPDATE**:

```sql
SELECT tgname,
       CASE WHEN (tgtype & 2) = 2 THEN 'BEFORE' ELSE 'AFTER' END AS timing
FROM pg_trigger WHERE tgrelid = 'offerings'::regclass AND NOT tgisinternal;
```

**4 · Prove the constraints before trusting them.**
```bash
psql -d lvrf -f db/prove_0004_constraints.sql
```
Every line must read PASS. If one reads FAIL, the constraint is wrong — **do not adjust the test to match the behaviour.** Needs one tenant row and one capability row to exist.

**5 · Seed.**
```bash
export DATABASE_URL=postgresql://lvrf_app@localhost/lvrf
node records/seed_offerings.mjs --dry-run   # verify, rolls back
node records/seed_offerings.mjs             # commit
```

**6 · Wire the gate.** Put `src/gates/evidentiaryBasis.ts` beside the existing `customer_shared` refusal — same file or same directory, whichever recon found — and call `requireEvidentiaryBasis()` on the path that advances a `value_outcome` to `verified`. Flag it in `CLAUDE.md` next to the `customer_shared` rule.

```bash
node --experimental-strip-types src/gates/__tests__/evidentiaryBasis.test.mjs
```

**7 · The validation run.** Re-derive Use B (must pass, 80) and Use A (must refuse, 30) **from catalog data, not fixture data**. Render both via WeasyPrint, `pdftoppm -png`, and actually look at them.

If either confidence moves, **the catalog is wrong, not the record.** Report the delta and stop.

**Correction, 2026-08-02 (G6/G7 — Global Knowledge divestiture):** that rule assumed
a static world. It still holds for movement caused by a modelling error — a bug in
the confidence engine, a miscoded evidence_class, a fixture that doesn't match the
catalog. It does **not** hold for movement caused by the world changing out from
under the catalog. Skillsoft divested Global Knowledge (announced 2026-05-20,
completed 2026-07-06 — see the G6 resolution above); if Use B's confidence moves
because the third-party credential leg's data access is now uncertain
post-divestiture (G7, open), that is a **finding about Global Knowledge's current
verifiability**, not evidence the catalog or the confidence engine is wrong.
Record which kind a movement is before treating it as a stop-the-line failure —
the distinguishing question is "did our model of the fact change, or did the fact
itself?"

---

## What was executed here, and what it found

Postgres 16.14, clean instance, minimal `tenants` and `capabilities` stand-ins.

```
migration            applied clean · 2 tables, 5 CHECKs, 3 enums, 0 triggers
constraint proof     8/8 PASS · 0 rows residue after rollback
seed (dry run)       12 inserted · assessed 6 / demonstrated 4 / none 1 / consumption 1
                     commercial_model null ×12 · governance_status unratified ×12
                     applied empty by design
gate truth table     9/9 PASS
```

**Three defects found by running it, none by reading it.**

1. **`array_length(a,1) >= 1` is an inert CHECK.** `array_length('{}',1)` returns NULL, `NULL >= 1` is NULL, and a CHECK **passes** on NULL — so the constraint silently accepts the exact row it exists to reject. Demonstrated side by side on 16.14. This is the form that shipped in the proposal document two messages ago. Corrected to `cardinality()`, which returns 0.

2. **A plpgsql `BEGIN..EXCEPTION` block is an implicit savepoint.** Setup statements that succeed inside a block that later throws are rolled back with it. That made the FK-restrict test report a false FAIL — the constraint was fine; the test had destroyed its own fixture. Same family as DEFECT-001: a misleading result produced by transaction-scope semantics rather than by the thing under test. Setup now lives in its own block.

3. **TypeScript parameter properties break strip-only runtimes.** `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX` under `node --experimental-strip-types` and `tsx`. Rewritten as explicit fields.

There is also a fourth, smaller one: the migration's own enum-count verification query hardcoded `::evidence_class` inside `enum_range()` and therefore reported 5 for all three enums. It looked correct and proved nothing. Fixed to count from `pg_enum`.

---

## Not built, deliberately

The Phase 5 validation runner. It depends on how the Realization Records are actually produced — fixtures, seed rows, or generated — and recon has not answered that yet. Writing it now would mean guessing at the record pipeline, and a validation harness built on a guess would pass for the wrong reason, which is worse than not having one.

Also out: any UI, portfolio views, the confirmation-gap engine, and anything filling G1–G6.

---

## Learnings ledger — recorded here, not as a live row (2026-08-02)

`stewardship_returns` (kind='lesson_learned') is the Learning spine's terminal write — the
actual Learnings ledger, not a metaphor for this file. All defects below belong there. None
was written as a live row, and that is itself part of what this entry records: I looked for a
place to put a real INSERT and the schema currently refuses one.

**Defect A — gap state has no home in the database.** `confirmation_gaps` on `offerings` is
`text[]` — an array of gap IDs, nothing else. Status, holder, and resolution (`G6`'s
`RESOLVED`/`resolved_at`/`answer`/`correction_produced` fields, `G7`'s `opened_at`/`opened_by`)
exist only in `records/offering_catalog_skillsoft.json`. Resolving G6 today was a real event with
real evidence (SEC 8-K, IR press releases) — none of that landed in Postgres; it landed in a
JSON file this codebase treats as a seed source, not a system of record. `evidence_access` (0008)
is an interim denormalization of exactly one bit the evidentiary basis gate needs today — whether
the currently-open gap for a given offering has been confirmed, denied, or neither. **The gap
engine named in AMENDMENT-001 is what makes this derived rather than stored**: once it exists,
`evidence_access` should be computed from live gap state, not hand-set at seed time from a JSON
file's snapshot of that state.

**Defect B — `rule76_steward` is unassignable.** The `person_role` enum (`db/schema.ts`) contains
`'rule76_steward'` as a role value. `persons_scoped_to_exactly_one`
(`(tenant_id IS NOT NULL)::int + (institution_id IS NOT NULL)::int = 1`) requires every person to
be filed under exactly one vendor tenant or one of that vendor's customer institutions — there is
no third scope for the platform operator. A person actually representing Rule76 (as opposed to
Skillsoft or one of Skillsoft's customers) cannot exist without being misfiled as belonging to one
of them. The role value was added; the row-scoping to hold it was not. Confirmed against live
data: one tenant (Skillsoft), two institutions (Skillsoft-as-self, Northgate Utilities), no
Rule76 entity anywhere.

**Defect C — a catalog prior was allowed to override an engagement fact.** The evidentiary basis
gate's first cut of `evidence_access` (0008) treated a CATALOG-LEVEL prior ("has this offering's
evidence ever been confirmed retrievable, in general") as if it were an ENGAGEMENT-LEVEL fact
("was evidence actually collected for this specific outcome"). That let an unconfirmed prior
refuse an outcome that had real, collected evidence behind it — a prior overriding a fact, which
is backwards in exactly the way `attachable_metrics` already got wrong once. Fixed in the gate
(`src/gates/evidentiaryBasis.ts`, 2026-08-02): engagement evidence now beats the prior
unconditionally; the prior governs only in evidence's absence. **This is the second instance of
the same mistake in this build, and the pattern is worth naming on its own: a fact that varies per
engagement must never live on the catalog row, however convenient the read.** A catalog is a
prior. An engagement is where priors get overridden by what actually happened. Confusing the two
is not a one-off bug; it is a category this codebase needs to keep checking for.

**Defect D — the acceptance test was circular.** `records/offering_catalog_skillsoft.json`'s
`validation_test` block specified that the catalog was correct if two records re-derived at
confidence 30 and 80, and both numbers were themselves read off rendered PDFs whose underlying
`value_outcomes` never matched what the test claimed to check (see the correction on the block
itself, 2026-08-02). Four rounds of work — gate design, seeding, catalog corrections — proceeded
against that circularity before it surfaced. A rendered document is not evidence that an
engagement occurred. An acceptance test whose expected values come from the artifact under test
proves nothing about that artifact, however confidently it is asserted as ground truth.

**Defect E — the disclosure is authored, not derived.** `records/customer_b.json`'s "ILLUSTRATIVE
COMPOSITE — NOT A REAL ENGAGEMENT" banner and `records/customer_zero.json`'s "SIMULATION —
MECHANISM DEMONSTRATION" banner are both free-text prose written into the fixture JSON, not
derived from any database fact. Checked `records/render_record.py` directly:
`fx['run'].get('banner_title','PROVENANCE')` — if a future fixture author omits `banner_title`,
the page silently renders a bland, unalarming "PROVENANCE" heading instead of failing or warning.
`fx['run']['note']` has no such fallback and would crash instead — an inconsistency in its own
right, one field fails loud, the other fails quiet, and quiet is the dangerous one. Confirmed via
git history that both fixtures have carried correct disclosure text since their first commit, so
no artifact rendered from either one today lacks a disclosure — but the mechanism guarantees
nothing, and one keystroke's omission is the entire distance between today's safe state and a
live artifact asserting a fabricated engagement as real.

Also found while establishing scope for this check: `customer_b.json` marks every Northgate person
(`S. Bhatt`, `D. Okonkwo`, `R. Castellanos`, `M. Lindqvist`) `"synthetic": false`, while its own
run-level banner says "no real individual is represented." `customer_zero.json` gets this right —
its non-Brad-Piver persons are `"synthetic": true` AND carry `[SIM]`-prefixed names, doubly
marked. `customer_b.json`'s flavor-named-but-tagged-non-synthetic persons are a regression from a
pattern this same codebase already had correct.

**This is the THIRD instance of the same recurring pattern, not three coincidences**
(`attachable_metrics` → Defect C's `evidence_access` → this): **a fact that must govern how a
record is read or interpreted keeps landing in the layer that is convenient to write, not the
layer that is checked.** A catalog prior placed where an engagement fact belongs. A gap's
resolution state placed in a JSON seed file instead of the database. Now a real/illustrative
disclosure placed in authored prose instead of a queryable column. Three different tables, three
different sessions, the same shape of mistake. Worth watching for on sight from here forward,
not re-discovering each time.

**Self-correction on my own prior turn.** The instruction that opened this exact investigation —
"take one real Northgate 'Switching order verification' outcome and render it" — called those 8
rows real without having verified that assumption first. It was itself an instance of the pattern
Defect D names: treating a rendered artifact's apparent shape as proof of what it represents,
rather than checking. The rows turned out to be exactly as real as Defect D said the confidence
scores were — not at all, and self-disclosed as such on their own first page, which the instruction
that asked for them did not know to check for.

**Why none of the five is a `stewardship_returns` row:** that table's own
`stewardship_returns_requires_source` CHECK — `source_reflection_id IS NOT NULL OR
source_value_outcome_id IS NOT NULL` — requires linking this entry to an existing reflection or
value outcome. `reflections` has zero rows in this database, and every existing `value_outcome`
(17 rows) belongs to an unrelated pre-existing engagement — attaching this finding to one of them
would misattribute where the lesson actually came from (this offerings-catalog build, not a
customer engagement). Creating a fresh reflection to satisfy the constraint would need an
`author_person_id` — which runs straight into Defect B. Writing a false source to get a true
lesson into the ledger would be the same failure this framework exists to refuse, just moved one
table over.

**This is a Cathedral-level defect, not a note.** The learning spine's terminal write — the one
mechanism this framework has for recording what it learned about itself — is currently
unreachable for any finding that is ABOUT the framework rather than about a customer engagement.
Every one of the defects above is exactly that kind of finding, and none could be
committed. A learning spine that can only record lessons about customers, never about its own
construction, is not fully built yet, regardless of what else works. Recorded here until the
schema can hold all five honestly.

**Defect F — enforcement was specified in a layer that does not exist.** `src/gates/
evidentiaryBasis.ts` was designed, hardened over six rounds of revision, and tested to 22 passing
cases — and has no caller. `walkSpine.ts` does not invoke it; `render_record.py` cannot see its
result; nothing in `server/` references it. Distinct from Defects C and E, which are the same
pattern (a fact in the wrong layer) — this is a rule in *no* layer at all. **No test suite can
detect this defect**, and that is worth sitting with: every one of the 22 truth-table cases calls
`assertEvidentiaryBasis()` directly, which proves the function's logic is correct in isolation and
proves nothing about whether it ever runs. A green test suite and an unwired gate are
indistinguishable from the outside a test file can see.

**Defect G — correctness and legibility are separate properties, and only one was tested.** The
illustrative disclosure on the rendered Northgate record is accurate and present (Defect E is
about its structural fragility, not its current truth). It still loses the page to the verified
banner: a plain black-bordered box versus a gold-bordered "Disclosure Gate — Cleared," and gold is
this framework's own token for emphasis. Nothing in this build tested how a document *reads* —
only what it *says*. A sentence can be true and still lose to a box.

**Closing entry.** This session set out to add a catalog table. It shipped one — 12 sourced,
independently-verified offerings; four migrations; an 8/8 constraint proof; a 22/22 gate test
suite. Along the way it also found that the acceptance test it was building toward was circular,
that this database cannot structurally distinguish invented data from real, that the document
template can only affirm and has no refusal counterpart, and that the gate built to prevent
exactly that was never connected to anything that could call it.

Which findings came from executing versus reading: Defect A surfaced from reading `schema.ts`'s
column type. Defects C, D, E, and F did not — C came from actually running the gate against real
value_outcomes and watching a false refusal fire; D came from checking whether Use B's
value_outcome existed and finding it did not; E came from reading `render_record.py`'s source and
finding the silent `.get(...,'PROVENANCE')` fallback, then confirming via git history that no
un-disclosed artifact happens to exist yet; F came from grepping for callers and finding none. Every
one of them was found by executing something — a query, a test run, a git-log check, a grep for
call sites — not by reading a spec or trusting a prior description of what should be true. That
count is not a coincidence particular to this session; it is the same discipline this whole build
kept rewarding, applied one more time to the build's own acceptance criteria.

---

*Rule76 · No Excuses. Play Like a Champion.*
