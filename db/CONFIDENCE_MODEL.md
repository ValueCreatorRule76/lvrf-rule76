# LVRF Confidence Model — Canonical Specification

The formula, stated independently of any implementation.

Written because it currently exists only in `records/simulate_spine.py`, which the client
zero milestone retires. A model defined only in the code being deleted is a model about to
be lost.

**Confidence is computed. It is never asserted, and never estimated.** A value engineer
able to type "high" would eventually type it under pressure; a placeholder that looks
computed is worse still, because nothing marks it as a placeholder.

---

## Six factors, weights summing to 100

| Factor | Weight | Question |
|---|--:|---|
| `metric_definition_confirmed` | 20 | Is the metric's calculation method known and documented? |
| `baseline_evidence_verified` | 25 | Is the baseline supported by confirmed evidence? |
| `actual_evidence_verified` | 25 | Is the measured actual supported by confirmed evidence? |
| `impact_basis_evidenced` | 10 | Is the currency figure's derivation stated and supported? |
| `human_commit_of_record` | 10 | Did a named, non-synthetic person commit to the target? |
| `human_verifier_of_record` | 10 | Did a named, non-synthetic person verify the result? |

## Bands

```
score >= 80  ->  high
score >= 55  ->  medium
otherwise    ->  low
```

Thresholds are not arbitrary. **80 is the ceiling a perfectly executed attested record can
reach** — see the evidence credit below. It must do everything right to arrive there, and
cannot exceed it without independent verification.

---

## Evidence credit — graded, not binary

For a single evidence item:

```
if NOT source_verified                     -> 0.0
if kind = 'attestation' OR attested_by set:
    if no attester named                   -> 0.0
    if attester is synthetic               -> 0.0
    if attester is NOT institution-scoped  -> 0.0   # a vendor attesting to a
                                                    # customer's number is an
                                                    # assertion with a signature
    otherwise                              -> 0.6   # ATTESTATION_CREDIT
otherwise                                  -> 1.0   # independently verified
```

**`ATTESTATION_CREDIT = 0.6` exactly.** Chosen so a flawless Use B record — definition
confirmed, both sides attested, basis evidenced, real sponsor, real verifier — scores
`20 + 15 + 15 + 10 + 10 + 10 = 80`, the floor of HIGH. Changing this constant moves that
ceiling and requires an amendment.

---

## The verification gate — ANY, not EVERY

An outcome may advance to `verified` when **at least one** evidence item supporting the
actual has credit > 0 — independently verified, or attested by a named,
institution-scoped, non-synthetic authority.

**Not every item.** Requiring all of them means a weak corroborating source downgrades the
record, which teaches value engineers to omit corroborating sources. A gate that punishes
disclosure produces less disclosure.

The three concerns stay separate:

- **Gate** — was the source confirmed by an authority over it? ANY.
- **Confidence** — how strong is that confirmation? MAX credit.
- **Disclosure** — the record prints every item and its state. ALL.

Northgate is the working case: two attested items plus one unverified observation. It
verifies, scores 80, and the document shows the unverified item plainly.

---

## Factor computation

**1 · metric_definition_confirmed** — full weight if the business metric's calculation
method is confirmed, otherwise zero. No partial credit: a metric is either reproducible or
it is not.

**2 · baseline_evidence_verified** — take every evidence item supporting `baseline`, grade
each, and award `25 × max(credit)`. **Best item, not average.** One independently verified
source is not weakened by three weak ones beside it. Zero if no baseline evidence exists.

**3 · actual_evidence_verified** — identical, for `actual`.

**4 · impact_basis_evidenced** —

```
if no currency claimed at all              -> full 10   (nothing to substantiate)
if basis stated AND max(credit) > 0
       AND NOT impact_is_inference         -> full 10
if basis stated AND max(credit) > 0        -> 5         (self-declared inference)
otherwise                                  -> 0
```

**5 · human_commit_of_record** — full weight if the sponsor of record is real and named,
zero if synthetic.

**6 · human_verifier_of_record** — same, for the verifier.

Round the total to one decimal place.

---

## The one field the database lacks

The model needs to know whether a person is **synthetic** — a demo or fixture identity
rather than a real human. `persons` has no such column. The fixtures encode it as a `[SIM]`
name prefix.

**For 0003: detect the `[SIM]` prefix.** It reproduces current behaviour and keeps the two
implementations in agreement.

**Record it as a known weakness.** Prefix-matching on a display name is fragile, and the
underlying concern is real and governance-shaped: a demonstration record must be
permanently distinguishable from a real one, or a demo can be presented as genuine. That
argues for `persons.is_synthetic boolean NOT NULL DEFAULT false` in **0004**, with the
prefix check replaced by the column.

Do not silently treat all database persons as real. Customer zero would then score 50
instead of 30, the two implementations would disagree, and the disagreement would look like
a bug in whichever you checked second.

---

## Acceptance test — parity with the retired implementation

The TypeScript must reproduce the Python exactly. Walk both fixtures and compare:

| Fixture | Expected score | Band | Realization |
|---|--:|---|---|
| `customer_zero` | **30.0** | low | measured |
| `customer_b` | **80.0** | high | verified |

Factor-level breakdown for `customer_zero`, for debugging a mismatch:

| Factor | Earned |
|---|--:|
| metric_definition_confirmed | 0 / 20 |
| baseline_evidence_verified | 25 / 25 |
| actual_evidence_verified | 0 / 25 |
| impact_basis_evidenced | 5 / 10 |
| human_commit_of_record | 0 / 10 |
| human_verifier_of_record | 0 / 10 |

**If the numbers do not match, one implementation is wrong — do not adjust the expected
values to fit.** These figures are cited in `BUILD_STATUS.md`, printed on two rendered
records, and quoted in the Skillsoft discovery agenda as the confidence arithmetic. They
are load-bearing outside the codebase.

---

## What must never happen

- A placeholder, midpoint or estimated value written to `confidence_score`. The column is
  on a table designed to be **locked and immutable** — a placeholder becomes permanent.
- The asserted `value_outcomes.confidence` copied into `value_runs.confidence_band`. The
  computed band governs; the asserted value is advisory and may contradict it.
- A confidence figure produced anywhere other than this model.

If the model cannot be computed because an input is missing, that is a finding to surface,
not a gap to fill with a number.
