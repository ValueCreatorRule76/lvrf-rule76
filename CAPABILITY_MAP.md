# LVRF — Capability Architecture Check

Fifteen capabilities named 29 July 2026. **This is not a work plan.** It is a test of
whether the current architecture accommodates them, and an identification of what must be
decided *now* because retrofitting it later is expensive.

Sequencing is unchanged and set by the founder: **client zero milestone → UX → deployment.**
Nothing here reorders that. One item is an exception, and it is stated as such.

---

## The one structural gap

### A Value Run is not an object

A spine walk currently produces `out/spine_run_{fixture}.json` — a file, gitignored, with
no identity, no owner, no lifecycle and no place in the database.

**Five of the fifteen capabilities have nothing to attach to without it:**

| Capability | Needs a run because |
|---|---|
| Lock / Relock | You lock a *run*. Locking a value outcome alone doesn't capture the inputs, evidence set, or confidence at the moment of locking. |
| Value Runs / Assessments | It is the capability. |
| Executive Outputs | A document renders *a run*. `record_documents` currently points at a value outcome and snapshots a payload, which is a partial substitute. |
| Roadmap | A roadmap is derived from a run's findings. |
| Close Plans | An AE's plan hangs off the run they are selling from. |

**Recommendation: `value_runs` is the one object to add before the client-zero milestone,
not after.** Everything else on this list can be built in any order; this one is a
dependency for a third of the list, and adding it after those exist means rewriting them.

Shape, minimally: tenant, engagement, run number, walked-at, walked-by, terminal value
stage, computed confidence, institutional health, a `locked_at` / `locked_by` pair, and the
payload hash. `record_documents` and `value_outcomes` then reference it.

---

## Status of all fifteen

| # | Capability | Status | Note |
|---|---|---|---|
| 1 | **Industry Packs** | New · accommodated | Two axes: vertical (industry → metric library, attestation authority, regulatory overlay) × horizontal (role family → capability set). A pack supplies **content, never presentation**. Build one. |
| 2 | **Account Inputs** | Partial | `institutions`, `business_metrics`, `capabilities` exist. Needs an intake surface, not new objects. |
| 3 | **Deep Research** | AMD-005 proposed | Permitted at `baseline`/`attach`/`model`; **prohibited** at `measure`/`verify`. |
| 4 | **Executive Lenses** | New · **needs decision** | See below. Not a rendering concern. |
| 5 | **Lock / Relock** | New · blocked on runs | See below. |
| 6 | **Value Runs** | New · **structural gap** | The item above. |
| 7 | **Value Hypothesis** | Partial | Implicit in `attach`. Should become explicit and **falsifiable** — see below. |
| 8 | **Value Levers** | New · accommodated | The mechanism by which capability change moves the metric. Sits between capability and outcome. |
| 9 | **Benchmarking** | New · accommodated | Largely a research artifact under AMD-005; needs a `benchmarks` object so a peer figure carries its own provenance. |
| 10 | **Solution Catalogs** | New · accommodated | What the vendor sells that addresses a capability gap. |
| 11 | **Roadmap** | New · accommodated | **CVAF lesson: `roadmapPhases.roadmapId` was an orphaned relation.** Declare the FK with the object. |
| 12 | **Executive Outputs** | Partial | Realization Record exists. Others render from a run. |
| 13 | **Close Plans** | New · accommodated | AE-facing. Explicitly **not** client zero. |
| 14 | **Administration Workbench** | New · accommodated | Tenant, person, role, pack administration. |
| 15 | **Governance & Provenance** | **Built** | 37 triggers, append-only audit, computed confidence, disclosure gate, five amendments, one defect record. |

---

## Two capabilities that are not what they appear

### Executive Lenses are governance, not templating

The obvious reading is that a CFO, CHRO and COO see different sections of the same
document. That is the small version.

**The real version: different lenses admit different evidence and enforce different
thresholds.**

- A **CFO lens** should refuse to render below a confidence threshold. A record at 30/100
  has no business appearing in a finance review, and the instrument should say so rather
  than let a reader discover it in a footnote.
- A **CHRO lens** legitimately shows capability movement and assessment coverage — which a
  CFO lens should suppress, because it is the consumption metric this framework exists to
  displace.
- A **Board lens** shows the confirmation gap across the portfolio, not any single record.

So a lens is a **policy** — an evidence filter plus a threshold plus a persona — and
policies are governed objects. If lenses are built as templates, the first CFO deck
containing an unverified number will be a template decision nobody reviewed.

**There is also a live gap here.** At Skillsoft's *customers*, the economic buyer for
learning is usually a CHRO or CLO. The current thesis routes around them to the CFO, which
a CHRO can reasonably hear as *your metrics don't count*. The lens model is where that gets
resolved — or where it hardens into a problem.

### A Value Hypothesis must be falsifiable to be worth recording

Currently the hypothesis is implicit: attaching a capability to a metric asserts that the
first moves the second. That assertion is never written down, never dated, and never
marked wrong.

If it becomes an object it should carry **what would disprove it** — and the confirmation
gap engine should be able to report hypotheses that were *refuted*, not only those that
confirmed. A practice that never records a failed hypothesis is not learning; it is
curating.

---

## What this list does not change

Sequencing stands: **client zero milestone, then UX, then deployment.** Fifteen capabilities
is a 2.x surface, and enumerating them is how CDS-001 reached thirteen volumes without a
line of running code.

The discipline that has worked all day holds: build the thing the next real conversation
requires, let execution surface the defects, and record what it teaches. Four material
findings today came from running code and none from reading a specification.

**The single exception is `value_runs`.** Add it before the milestone. Everything else waits
its turn.
