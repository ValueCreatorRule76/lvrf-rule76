# LVRF Findings — Canonical Specification

The last item from the port inventory. **Not a straight port** — two of the four findings
carry messages that no longer describe what the system does.

---

## Decision — payload only

**Findings live in `value_runs.payload.findings`. No table, no heartbeat.**

A finding is *derived from* a run, not an independent object. A run is immutable once
locked, so the payload is already a durable, hashed, attributable record — everything a
table would provide, without the risk of a finding drifting from the run that produced it.

Rejected, with reasons worth keeping:

- **A table.** The cross-run query is genuinely valuable — *how often is verification
  refused* is a real question about the practice. But findings would then need lifecycle,
  stewardship and a rule preventing them diverging from their run. The query can be
  answered by reading `payload` across runs, more slowly and with no duplication.
- **A heartbeat.** No registered heartbeat covers a finding, and adding one is a register
  amendment for something already captured.

**If the cross-run query becomes routine**, revisit — but as a read-side view over
payloads, not a second store.

---

## Severity

Findings use the same five-value vocabulary as health states: `healthy`, `watch`,
`warning`, `critical`, `constitutional_failure`. One vocabulary across the system.

Only `watch` and `warning` are currently emitted.

**Severity is informational today. It drives nothing.** That is a deliberate deferral, not
an oversight — see the open question at the foot of this document.

---

## The four findings

### F1 · Unmapped heartbeat category

**Fires when** an emitted event's category has no health dimension.
**Severity** `warning`.

**Cannot fire today.** `AMENDMENT-003` made the mapping total across all seven categories.
It survives as a guard against a future register amendment adding an eighth category
without a corresponding dimension.

**The existing message is stale and must be rewritten.** It reads:

> *N event(s) in the 'financial' category have no health dimension … §7 defines six
> dimensions … Requires a Cathedral amendment.*

That describes the pre-AMD-003 state, names one category specifically, and would be
actively misleading if it ever fired. Replace with something general:

> `{n}` event(s) in category `{category}` have no health dimension and were excluded from
> the composite. `HEARTBEAT-REGISTER` §6 and `COMPASS-HEARTBEAT-STATUS` §7 have diverged —
> a category exists with no dimension to receive it. Requires a Cathedral amendment.

### F2 · Synthetic sponsor committed

**Fires when** the sponsor of record is synthetic at the `commit` stage.
**Severity** `watch`.

> HB-0014 committed by a synthetic sponsor. A real commitment requires a named customer
> sponsor; this event is simulated and the outcome may not be published externally.

### F3 · Verification refused

**Fires when** the gate declines to advance realization to `verified`.
**Severity** `warning`.

**The message must state the actual reason, not a fixed sentence.** The current text
asserts both causes every time:

> *Evidence supporting the measured actual is not source-verified **and** the verifier is
> synthetic.*

Since the ANY/EVERY change, those are independent — the gate can refuse for either alone.
A finding that always reports both is misleading in exactly the situation someone is
relying on it to explain a refusal.

Build the message from the conditions that actually held:

- no evidence supporting the actual has credit > 0
- the verifier of record is synthetic
- no verifier of record

Then append, unchanged:

> The outcome remains `measured`. Schema CHECK `value_outcomes_verified_requires_human`
> would reject an attempt to force `verified`.

### F4 · Computed confidence LOW

**Fires when** the computed band is `low`.
**Severity** `warning`.

> Computed confidence is `{score}`/100 (LOW). The record is not defensible to a finance
> function in this state. Confidence is derived from the evidence ledger and cannot be
> overridden by assertion.

---

## Shape

```json
"findings": [
  { "code": "F2", "severity": "watch",   "message": "…" },
  { "code": "F3", "severity": "warning", "message": "…" }
]
```

Ordered by code. Empty array when none — **not null**, and not omitted. A run with no
findings is a meaningful result and should be distinguishable from a run where findings
were never computed.

---

## Expected values — acceptance test

| Fixture | Findings |
|---|---|
| `customer_zero` | **3** — F2 `watch`, F3 `warning`, F4 `warning` |
| `customer_b` | **0** |

F4's message must contain `30.0/100`. F3's must name only the conditions that actually
held.

Add the count and the codes to the parity script. Message text is not asserted — it will
change; the codes and severities should not.

---

## Open question — should severity drive behaviour?

Deferred deliberately.

A `critical` or `constitutional_failure` finding could plausibly **block a lock**, tying
findings into the disclosure gate: a run carrying an unresolved critical finding cannot be
declared authoritative and therefore cannot back a `customer_shared` document.

That is coherent and probably right. It is not implemented because **no finding currently
carries either severity**, and building an enforcement path for a state that cannot occur
would be untestable.

Revisit when the first `critical` finding is defined. At that point it is an amendment, not
an implementation detail — it would change what locking means.
