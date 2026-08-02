# LVRF Institutional Health Model — Canonical Specification

The seven-dimension weighted composite from `COMPASS-HEARTBEAT-STATUS` §7, as amended by
`AMENDMENT-003`. Stated independently of any implementation, for the same reason as
`CONFIDENCE_MODEL.md`: the only existing implementation is in
`records/simulate_spine.py`, which the client zero milestone retires.

**Health measures faithfulness, not performance.** A Chapel that correctly refused to
overclaim during a quarter in which no value was realized is faithful, not unhealthy. That
principle is why Financial is weighted 10 rather than 20 — see AMD-003 Article II.

---

## Two levels of weighting

This is the part most easily got wrong.

- **Within a dimension**, events are weighted by the emitting heartbeat's `health_weight`
  from the register — HB-0016 carries 10, HB-0018 carries 7.
- **Across dimensions**, by the dimension weight below.

`loadHeartbeatRegister()` does not currently select `health_weight`. It must.

---

## Dimensions — weights sum to 100

| Dimension | Weight | Fed by heartbeat category |
|---|--:|---|
| Constitutional Compliance | 25 | `constitutional` |
| Governance Integrity | 25 | `governance` |
| Operational Health | 15 | `operational` |
| Data Integrity | 10 | `integrity` |
| Security | 10 | `security` |
| Financial / Value Realization | 10 | `financial` |
| Learning & Improvement | 5 | `learning` |

**The mapping is total** — all seven constitutional categories map. An event whose category
has no dimension raises finding **F1** and is excluded. That cannot occur today; it is a
guard against a future register amendment adding an eighth category without a dimension.

## Health state → score

```
healthy                 100
watch                    85
warning                  68
critical                 50
constitutional_failure   30
```

---

## Computation

**1 · Bucket** every heartbeat event by its category's dimension. Unmapped categories go to
F1 and are excluded entirely.

**2 · Score each dimension** as the `health_weight`-weighted mean of its events' state
scores:

```
score = Σ(health_weight × state_score) / Σ(health_weight)      round 1
```

**3 · A dimension with no events is UNMEASURED.** Score `null`, and **excluded from the
composite denominator.** It is not scored zero, and it is not assumed compliant.

**4 · Composite** over measured dimensions only:

```
composite  = Σ(dimension_score × dimension_weight) / Σ(measured dimension_weights)
coverage   = Σ(measured dimension_weights)          # as a percentage
```

Null composite if nothing was measured.

**5 · Band:**

```
>= 90   HEALTHY
>= 75   WATCH
>= 60   WARNING
>= 40   CRITICAL
otherwise  CONSTITUTIONAL FAILURE
```

---

## Coverage must be published with the composite

Per AMD-003 Article III. **A composite of 100 at 40% coverage describes an unobserved
institution, not a healthy one**, and a score presented without its coverage invites
exactly that misreading.

Both fixtures currently run at 90% coverage — Security is unmeasured, because no security
heartbeat fires during a value spine walk.

---

## Expected values — acceptance test

Taken from the reference implementation, not derived by hand. **A hand-typed 92.4 for
Governance Integrity appeared in an early UI mockup and is wrong; the figure is 92.9.**

### customer_zero

| Dimension | Weight | Score |
|---|--:|--:|
| Constitutional Compliance | 25 | **68.0** |
| Governance Integrity | 25 | **92.9** |
| Operational Health | 15 | 100.0 |
| Data Integrity | 10 | 100.0 |
| Security | 10 | **UNMEASURED** |
| Financial / Value Realization | 10 | **92.1** |
| Learning & Improvement | 5 | 100.0 |

**Composite 88.3 · WATCH · coverage 90%**

Worth understanding rather than just matching: Constitutional reads 68.0 because HB-0016
fired at `warning` when verification was refused. **The composite is depressed because the
framework declined to overclaim** — which is the system working, not failing.

### customer_b

| Dimension | Weight | Score |
|---|--:|--:|
| Constitutional Compliance | 25 | 100.0 |
| Governance Integrity | 25 | 100.0 |
| Operational Health | 15 | 100.0 |
| Data Integrity | 10 | **92.1** |
| Security | 10 | **UNMEASURED** |
| Financial / Value Realization | 10 | 100.0 |
| Learning & Improvement | 5 | 100.0 |

**Composite 99.1 · HEALTHY · coverage 90%**

Add both to the parity script — every dimension, the composite, the band, and coverage.

---

## Output shape

Into `value_runs.payload` under `health`, and into the three columns:

```
institutional_health   = composite
health_band            = band, lowercased with underscores
health_coverage_pct    = coverage
```

The per-dimension breakdown lives in the payload; the renderer prints it.

`health_band` uses the existing `health_state` enum, so `CONSTITUTIONAL FAILURE` maps to
`constitutional_failure`.

---

## What a NULL composite means

`value_runs.institutional_health` is nullable, so a run where health was never computed is
currently indistinguishable from one where nothing measurable occurred.

**Once this model is implemented, every walk produces a composite.** A NULL therefore means
one of exactly two things: a run predating this model, or a walk that emitted no mappable
events at all. Both are real states; neither should be confused with a score of zero.

Runs 1–6 predate the model and will retain NULL. That is accurate and they should not be
back-filled — recomputing a historical run from current code would produce a number that
run never actually had.
