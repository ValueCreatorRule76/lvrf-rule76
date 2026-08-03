# 0005 — Attester, Distinct From Capturer

Resolves the `customer_b` divergence surfaced while fixing `DEFECT-002`. Two columns on
`evidence`. Patch document, not a replacement file.

---

## The decision

**`kind` and `attested_by` are independent facts. The schema must express both.**

`records/simulate_spine.py` — the reference every port was validated against — gates on:

```python
if ev.get("kind") == "attestation" or ev.get("attested_by"):
```

An **or**. An assessment result can carry a named attester; a coach signing that scores are
accurate does not make the artifact an attestation document. The fixture has always modelled
these as orthogonal.

The database could not, so the read-back inferred `attested_by` from `kind` and silently
promoted a coach's own assessment from attested (0.6) to independently verified (1.0).

### Why not the alternative

"`attested_by` is only valid alongside `kind = 'attestation'`" does not work:

- **Drop `attested_by`** from customer_b's assessment item → it becomes independently
  verified. Credit 1.0, score still 90, and now a coach's assessment of their own cohort
  is scored as independent. Worse, not better.
- **Change its `kind` to `attestation`** → 80, by misrepresenting what the evidence is.

Neither is a fix. The fixture is correct; the schema was incomplete.

### Two different questions

| Column | Question |
|---|---|
| `captured_by_person_id` | Who entered this into LVRF? Normally the value engineer. |
| `attested_by_person_id` | Who puts their name to the claim that it says what it says? |

Attestation credit requires the attester be **institution-scoped and non-synthetic** — a
statement about who vouches for a number, not who typed it. Conflating them means a vendor
capturing a customer's export would read as the customer attesting to it.

---

## Schema — `db/schema.ts`

In `evidence`, after `capturedAt`:

```ts
  /**
   * Who puts their name to the claim that this evidence says what it says.
   *
   * DISTINCT from capturedByPersonId, which is whoever entered it — normally
   * the value engineer. Attestation credit (0.6) requires the attester be
   * institution-scoped and non-synthetic: a vendor capturing a customer's
   * export is not the customer attesting to it.
   *
   * Independent of `kind`. An assessment_result may be attested; a coach
   * signing that scores are accurate does not make the artifact an
   * attestation document. simulate_spine.py has always gated on
   * `kind == 'attestation' OR attested_by`.
   */
  attestedByPersonId: uuid('attested_by_person_id')
    .references(() => persons.id, { onDelete: 'restrict' }),
  attestedAt: timestamp('attested_at', { withTimezone: true }),
```

And in the config array:

```ts
  check('evidence_attestation_is_complete',
    sql`(${t.attestedByPersonId} IS NULL AND ${t.attestedAt} IS NULL)
        OR (${t.attestedByPersonId} IS NOT NULL AND ${t.attestedAt} IS NOT NULL)`),
  index('evidence_attested_idx').on(t.attestedByPersonId),
```

An attestation with no date, or a date with no attester, is a half-recorded fact.

**The institution-scoped requirement is not a CHECK** — it spans `evidence` and `persons`.
The credit function already returns 0 for a tenant-scoped attester, which is the correct
enforcement point. Record it with the other cross-table rules in `BUILD_STATUS.md`.

---

## `walkSpine.ts`

**Revert `resolveEvidenceCapturer()`.** It was correct given one column and is wrong given
two.

- `captured_by_person_id` → **always the value engineer.** They enter evidence into LVRF.
- `attested_by_person_id` → the fixture's `attested_by`, resolved to a person, with
  `attested_at` from the fixture.
- Where the fixture has no `attested_by`, both stay null.

**Then delete the `kind`-based inference from the read-back.** Select
`attested_by_person_id` and join `persons` for name, synthetic flag and scope. No heuristic
survives.

---

## Acceptance

| | Score | Band | actual_evidence_verified |
|---|--:|---|---|
| customer_zero | **30.0** | low | 0 / 25 |
| customer_b | **80.0** | high | **15 / 25** |

customer_b's actual-supporting evidence is one attestation, one attested assessment result,
one unattested observation. Best credit is 0.6, so `25 × 0.6 = 15`. **The 90 was the bug;
80 is the correct answer**, now reachable structurally rather than by coincidence.

If either score is anything else, the read-back is still inferring something.

---

## Apply

```
pg_dump -Fc lvrf > ~/Backups/lvrf/pre-0005-$(date +%H%M).dump
npx drizzle-kit generate      # expect 2 ADD COLUMN, 1 CHECK, 1 INDEX, 1 FK, no DROP
cat db/drizzle/0005_*.sql
npx drizzle-kit migrate
```

Re-walk both fixtures, verify the scores, and confirm by direct query that
`attested_by_person_id` is populated on the four attested items and null on the observation.

---

## The pattern this is the fourth instance of

| | The model needed | The schema had |
|---|---|---|
| `synthetic` | A demo/real distinction | A `[SIM]` name prefix |
| `institutional_health` | A computed composite | A column, never written |
| `source_fixture` | Run provenance | Nothing — a guard failing open |
| **`attested_by`** | **Attester ≠ capturer** | **One conflated column** |

**The fixture has consistently been richer than the schema**, because the fixture was
written first as a working artifact and the schema was derived from it incompletely. Each
gap surfaced only when something computed from the database disagreed with something
computed from the file.

That is now the strongest argument for the `DEFECT-002` fix beyond correctness: **once every
scored value is database-derived, a fixture-schema gap produces an immediate, loud
divergence** rather than sitting undetected. This one took a 90 to surface. The next takes a
failing acceptance value.
