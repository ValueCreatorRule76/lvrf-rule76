# Delta Engine + Fixture Provenance

Two items from the port inventory. Neither is large; the first unblocks the currency
confirmation gap, which was the entire purpose of splitting `currency_impact` in 0001.

---

# Part 1 — The delta engine

Pure computation. **No schema change** — the result goes in `value_runs.payload`, which
the confirmation gap engine and the renderer both read.

## Inputs

`baseline_value`, `target_value`, `actual_value`, `claimed_currency_impact`,
`realized_currency_impact`, `promised_measured_at`, `actual_measured_at`, and the
metric's `direction`.

## Output shape

```
{
  available, raw, improved, target_met, pct_of_target,
  currency: { claimed, realized, gap, share_of_claim },
  punctuality_days, on_time
}
```

If `actual_value` is null, return `{ available: false }` and nothing else. A claim that was
never measured is open, not failed.

## Computation

```
raw          = actual - baseline                      round 3
improved     = raw > 0   when direction = 'increase'
               raw < 0   when direction = 'decrease'
target_met   = actual >= target  (increase)
               actual <= target  (decrease)
               null if no target
pct_of_target = (raw / (target - baseline)) * 100      round 1
                null if no target, or target = baseline
```

### `pct_of_target` needs no direction branch — and this looks wrong

For a decreasing metric both numerator and denominator are negative and the signs cancel.
Northgate: `raw = 1.08 − 1.42 = −0.34`, `target − baseline = 1.10 − 1.42 = −0.32`, so
`−0.34 / −0.32 = 1.0625` → **106.2%**. Correct, and correct for the same reason on an
increasing metric.

**Do not add a direction branch here.** It looks like it needs one, someone will eventually
add it, and it will invert every decreasing metric. Leave a comment saying so.

## Currency

```
currency.claimed  = claimed_currency_impact
currency.realized = realized_currency_impact

if claimed is not null AND realized is not null AND claimed != 0:
    gap             = realized − claimed                round 2
    share_of_claim  = realized / claimed                round 4
else:
    gap = null, share_of_claim = null
```

The `claimed != 0` guard matters — division by a zero claim, not a null one.

## Punctuality

```
if promised_measured_at AND actual_measured_at:
    punctuality_days = date(actual) − date(promised)     whole days
    on_time          = punctuality_days <= 0
else both null
```

Compare **dates, not timestamps** — take the first 10 characters. A run measured at 09:00
against a promise dated the same day is on time, not fifteen hours early.

Negative is early, positive is late. A practice that always delivers *late* is a distinct
failure from one that delivers *short*, which is why this is separate from `raw`.

## Expected values — acceptance test

| | customer_zero | customer_b |
|---|--:|--:|
| direction | increase | **decrease** |
| `raw` | +2.4 | −0.34 |
| `improved` | true | true |
| `target_met` | true | true |
| `pct_of_target` | 120.0 | 106.2 |
| `currency.gap` | +1400000.00 | +173430.00 |
| `currency.share_of_claim` | 1.2 | 1.0625 |
| `punctuality_days` | 0 | 0 |
| `on_time` | true | true |

Both share values are exact, not rounded artefacts. If either is off, the arithmetic is
wrong rather than the rounding.

Add these to the parity script.

---

# Part 2 — Fixture provenance

## The column — 0004

```ts
/**
 * The fixture file this run was walked from, e.g. 'customer_b'.
 *
 * Restores a guard lost in the move to Postgres: render_record.py refused to
 * render when a run came from a different fixture than the one requested.
 * Nothing recorded which fixture produced a row, so the refusal became
 * inoperative and a document could silently carry another engagement's numbers.
 *
 * Nullable — runs predating this column have none, which is accurate.
 */
sourceFixture: text('source_fixture'),
```

Set it in `walkSpine.ts` from the resolved fixture filename, stem only, no extension.
Include it in the hashed payload so it is covered by `payload_hash`.

## Restore the refusal

`render_record.py` must refuse when the run's `source_fixture` does not match the fixture
it was asked to render — same as the JSON-era check.

That guard existed, was correct, and silently stopped working during the migration. **The
worst kind of regression: a safety check that fails open.** Nothing errored; the protection
simply left.

---

## Sequence

Do Part 1 and Part 2 together — one commit, one parity run. Part 2's column is a 0004
migration; Part 1 needs none.

Still to come, in order: `health()`, the findings system, repointing
`confirmation_gap.py`, then retiring the Python.

**`records/simulate_spine.py` stays until all of those land.** It is the only artifact the
ports can be diffed against, and this inventory found two silently-absent computations that
nothing else would have surfaced.
