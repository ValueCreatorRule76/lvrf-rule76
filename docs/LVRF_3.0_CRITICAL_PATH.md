# LVRF 3.0 — the critical path to the first engagement-ready release

**Ratified by Brad Piver, 1 November 2026.** Target: 3.0 complete by **15 November 2026**
(14 days), for the proposed SOW.

This document governs the order of work until 3.0 ships. Where it and `LVRF_PLAN.md`
disagree on order, this document wins until 3.0 is released; `CLAUDE.md` wins over both.
Every slice still runs Gate A, B and C, and rules 1–10 of `CLAUDE.md` hold throughout
(rule 9: verification never writes on prod; rule 10: steward acts are performed by the
steward).

---

## What "ready" means

LVRF 3.0 is ready to **run an engagement**: capture the customer's baseline, a committed
target, attested monetization rates, measured actuals and verification, and render a
value case that **honestly refuses** until each is in. It does not produce a customer
value case with numbers before the customer supplies them. An outside-in account (Scotts)
renders the CFO refusal page with its asks; that is the product working.

3.0 is also the release in which the oldest open test can finally pass — 1.2's "a real
cohort measured end to end by someone other than the author; a document a CFO would
carry" — through the SOW engagement itself.

**Version:** LVRF 3.0 = the 3.0 draft (`LVRF_3.0_DRAFT.md`, adopted 11 Oct, never
ratified), ratified against exactly the scope below once it ships. Everything deferred is
recorded as **3.1**.

---

## Scope and order

| # | Work | Estimate (build + Gate A) | Gate B batch |
|---|---|---|---|
| 1 | **Close L52 and L50** (supersession batch; "No" opening requires a reason; the about control offers tenant, accounts and a typed party; no-change marker correction refused). Lift the hold on customer-side role grants | ~1 day | **B1** |
| 2 | **§14: commit, measure and verify in the interface**, with the **attribution method fixed at commit** (design §3.2, core only: the method enum and its rules; comparison populations are 3.1) | 2–3 days | **B2** |
| 3 | **Pack ratify and demote** (steward act, its own governance act) and the **case snapshot** (§16, payload v4, sealing each pack entry with a hash of its fields) | ~2 days | **B2** |
| 4 | **P6: the value case** — `lens_policies` (CFO ≥ 55, CHRO), `/runs/:id/case` with the CFO refusal page; outcomes by lever with basis and attribution; **cost of delay** under ruling (b) (committed target × client-stated, customer-side-attested monetization rate × 6/12; refuses with every reason); **roadmap milestones**; **recommended solutioning** (only offerings linked to the lever, not excluded); "what it takes to raise confidence"; the confidence curve (sealed scores, breaks, erratum marks); **print** with banners and the full hash on every page | 4–5 days | **B3** |
| 5 | **War Room `/book`**, read-only: membership as book confidence, no money summed across accounts | ~1 day | **B3** |
| 6 | Consolidated Gate C, Brad's acts, **3.0 ratified** (`LVRF_3.0_DRAFT.md` updated to what shipped; the 3.1 list recorded) | ~2 days | — |

**In parallel (Brad, content, not build):** the SOW customer's industry pack made fit for
use — measures accepted and ratified; one lever per measure, ratified, its citation an
opened evidence row (§17); solutions linked; attestation roles named. **Open: the SOW
customer's industry and what must exist on day one** — these decide the content work and
whether P4c (the Utilities pack) moves up.

---

## The rules that make the date

1. **Scope freeze after L52.** Any new data finding becomes a 3.1 loose end, **unless it
   puts a false claim on a page a customer will see**.
2. **Batched gates.** Three Gate Bs (B1, B2, B3), not one per slice. No check is
   weakened; the full regression runs before each.
3. **Act sessions planned.** Brad blocks a short session at each Gate B for the acts
   that slice needs (role grants, ratifications, fixture-free acts on prod only).
4. **The cut line (day 9, 10 November).** If P6 is not through Gate A by day 9, the
   **War Room** and the **CHRO lens** move to 3.1. The **CFO lens, its refusal page and
   cost of delay are never cut.**

**What would sink it:** a new structural defect found mid-P6, or the customer's industry
needing a pack that does not exist yet. Either is raised the day it is found, with the
cut line applied first.

---

## 3.1 (deferred, recorded so nothing is lost)

- The full Pack Contract (design §5.2): import, deltas, validation, certification,
  activation, inheritance, the projection drift check, the pack driving every stage
  (P4a–P4b); the Utilities pack certified (P4c) unless the SOW needs it.
- P3 fetch verification; P5 beyond the attribution method (comparison populations,
  k-suppression view, cohort exports); P8 admin pages (`/people`, `/policies`).
- The Board lens; CVAF-style standalone briefs (cost of delay, roadmap appendix) cut
  from the sealed case; the drafting assistant (Q9).
- UX-1 slice 5 (copy pass, index pages, L44, L45), L40 code-splitting, L43 the walk
  showing every engagement.
- Loose ends L46–L53 not closed by item 1, and any finding frozen out by rule 1.
