# LVRF 3.0 — the critical path to the first engagement-ready release

**Ratified by Brad Piver, 1 November 2026.** Target: 3.0 complete by **15 November 2026**
(14 days), for the proposed SOW.

**Revised by Brad Piver, 4 November 2026:** B1 closed on 5 Nov. B2 is split, §14 becomes B4, and the cut line is
applied. **3.0 is ratified about 17 November; M21 stays 22 November.** The table below is the revised order.

**Revised again (Brad, 4 Nov 2026): pack ratify and demote move to 3.1.** Ratification means an entry sourced from
two institutions' systems of record (N = 2, recorded and not lowered), and no entry can reach that before the 2027
engagements. **Entries stay proposed until then, and the value case shows them so.** The freed day goes into §14 (B4).

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
| 1 | **Close L52 and L50** (supersession batch; "No" opening requires a reason; the about control offers tenant, accounts and a typed party; no-change marker correction refused). Lift the hold on customer-side role grants | done | **B1**, closed 5 Nov (Gate C clean at `bd5cb7c`) |
| 2 | **Short ids** in every evidence picker and list, and **"Withdraw this link…" on card 01c** (the same route as the run page's) | ½ day | **B2**, closed 5 Nov (Gate C clean at `bdf9971`) |
| 3 | ~~Pack ratify and demote~~ **moved to 3.1** (4 Nov): N = 2 institutions' systems of record, not reachable before the 2027 engagements | — | **3.1** |
| 4 | **The case snapshot** (§16, payload v4, sealing each pack entry with a hash of its fields) | 2 days | **B2**, closed 5 Nov (Gate C clean at `bdf9971`) |
| 5 | **P6: the value case** — `lens_policies` (the CFO lens, ≥ 55), `/runs/:id/case` with the CFO refusal page; outcomes by lever with basis and attribution; **cost of delay** under ruling (b) (committed target × client-stated, customer-side-attested monetization rate × 6/12; refuses with every reason); **roadmap milestones**; **recommended solutioning** (only offerings linked to the lever, not excluded); "what it takes to raise confidence"; the confidence curve (sealed scores, breaks, erratum marks); **print** with banners and the full hash on every page; the steward act **"Shared for review as an outside-in hypothesis"** (D-M21); proposed entries labeled, with a line that no pack is certified; `monetization_rates` and `policy_values` in its migration, D = 6 months set by the steward (P6 rulings, 4 Nov; LVRF_PLAN §19) | 5 days (plan approved 5 Nov; LVRF_PLAN §19) | **B3**, Gate B **Wed 11 Nov**, buffer to Fri 13 Nov (roadmap milestones cut first) |
| 6 | **§14: commit, measure and verify in the interface**, with the **attribution method and the measure class fixed at commit** (cost of delay refuses a `compliance_assurance` class; P6 ruling 2, 4 Nov) (design §3.2, core only: the method enum and its rules; comparison populations are 3.1). M21 needs none of it: an outside-in account has no commitment, actual or verifier, and the refusal page lists them as asks. **It takes ratify's freed day** | 2–3 days | **B4**, pulled forward (Brad, 5 Nov): built from Wed 11 Nov on B3's code; Gate B **Sat 14 Nov**, latest Tue 17 Nov |
| 7 | Consolidated Gate C, Brad's acts, **3.0 ratified** about **15 Nov** (was ~17 Nov; B2 closed 3 days early, 5 Nov) (`LVRF_3.0_DRAFT.md` updated to what shipped; the 3.1 list recorded) | with B4 | — |

**The cut line, applied (4 Nov):** P6 cannot be through Gate A by day 9, so the **War Room** and the **CHRO lens** move
to 3.1. The **CFO lens, its refusal page and cost of delay stay.** **Link corrections in the supersession batch** also
move to 3.1: card 01c already corrects a link, so they would only save steward time.

**Revised again (Brad, 5 Nov 2026):** B2 closed on 5 Nov, three days early. The three days are B3's buffer, and B4 is
pulled forward: B3 Gate B Wed 11 Nov (buffer to Fri 13), B4 Gate B Sat 14 Nov (latest Tue 17), **3.0 ratified about
15 Nov**, M21 unchanged at 22 Nov. B3 refuses cost of delay until B4 states the measure class at commit; its rate kind
is a separate fact, and neither is inferred from the other.

**Every Gate B carries a "your acts" section:** every field's exact text, and the short id of each row, so the acts are
done in one sitting.

**In parallel (Brad, content, not build) — pack readiness in general** (revised 1 Nov:
the SOW's 3–5 accounts are not known until after day 14). The two packs PROP-001
ratified, **Utilities first and Manufacturing second**, made fit for use: **measures
accepted; entries proposed until N = 2 institutions' systems of record** (revised 4 Nov);
one lever per measure, ratified by the steward's proposal (O-D2a), its citation an opened
evidence row (§17);
solutions linked; attestation roles named. Utilities is researched and accepted through
the existing generated-prompt flow; Manufacturing mostly exists (Scotts' precedent).

**The new-account checklist** (Brad, with Claude Code's help, during the 14 days): the
repeatable path from a named account to a printed outside-in POV and value case —
research the entity and facts; classify to a pack (research the pack first if none
exists); the walk; the hypothesis; the summary; run and lock; the POV and the value
case; print. Timed once on a fixture, so the time per account can be promised.

---

## Milestone M21 — the printed outside-in review (22 November 2026)

**Ratified by Brad, 1 Nov 2026.** For the SOW (Skillsoft, "Matt", 3–5 accounts or
opportunities for 2027): by **22 November**, each named account has a **printed
outside-in POV and value case**, ready to review with the account executive and the
customer or prospect.

- **What it is:** built only from published material. The OUTSIDE-IN HYPOTHESIS and
  UNVERIFIED banners print on every page. The CFO lens shows its **refusal page with the
  asks** — what the customer would supply (a system-of-record baseline, a committed target
  by a named person, an attested monetization rate, a verifier). That page is the
  conversation opener, not a gap to hide.
- **Depends on:** 3.0 through B3 (the value case and print) by 15 Nov; the accounts named
  **by 15 Nov at the latest** (earlier is better); one to two days of research and walk per
  account, done by Brad (rule 10). With 7 days after 15 Nov, **3 accounts are safe, 5 is
  tight**: if all 5 are named late, the first 3 print by 22 Nov and the rest follow.
- **Disclosure — a decision for 3.0 (D-M21):** today "Share with customer" is refused
  until a named person verifies the outcome, and runs are disclosed `internal`. Printing an
  outside-in POV for a prospect is a disclosure act that does not fit either state. Proposed:
  a steward act **"Shared for review as an outside-in hypothesis"**, recorded in
  `record_documents` (who, with whom, when, the run and its hash), allowed only while both
  banners print, never changing the run's verification state. Added to B3's scope.
  **Approved by Brad, 1 Nov 2026, as proposed.**

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
  (P4a–P4b); the Utilities pack certified (P4c). **Scheduled after 3.0 and before the
  first 2027 engagement data** (engagements start next year).
- P3 fetch verification; P5 beyond the attribution method (comparison populations,
  k-suppression view, cohort exports); P8 admin pages (`/people`, `/policies`).
- The Board lens; CVAF-style standalone briefs (cost of delay, roadmap appendix) cut
  from the sealed case; the drafting assistant (Q9).
- UX-1 slice 5 (copy pass, index pages, L44, L45), L40 code-splitting, L43 the walk
  showing every engagement.
- **The War Room `/book`** and **the CHRO lens** (the cut line, 4 Nov); **link corrections in the supersession
  batch** (card 01c already corrects a link).
- **Pack ratify and demote** (4 Nov): ratification at N = 2 institutions' systems of record, the threshold a
  recorded value, never lowered; demotion with a reason.
- **L54 and "Correct the reviewer's note"** (Brad, 5 Nov 2026; frozen out by rule 1): one migration making a reviewed
  result's note final (insert-only), and the steward act that corrects a note beside it. Until then CAIDI (`dda6e919`)
  and Net heat rate (`51c360c9`) are not used for M21.
- **CVAF patterns, in this order (Brad, 5 Nov 2026; patterns only, no CVAF client data):**
  1. **The drafting assistant, on CVAF's Executive Outputs Assistant pattern** (replaces the design's P10 shape; Q9's
     ruling still applies). From a sealed run: export an evidence pack (every item with a stable evidence id, the pack
     hashed) and a generated prompt; a person drafts outside LVRF; import with deterministic checks (same pack, every
     sentence cites, every figure matches a cited item, no other account, attributions only to a client-stated source,
     outside-in honesty, no placeholders); review the proposal against the current text, sentence by sentence; accept as
     authored by the person (`executive_summaries`, `drafted_with_ai` and the tool); seal with the run. **Ruled (Brad,
     5 Nov 2026): the offline flow only.** LVRF generates no prose, and no code calls a research or drafting tool (D1).
     CVAF's server-call phase is not adopted.
  2. **Solutioning verdicts:** ADMIT · CONDITIONAL · DEFER · EXCLUDE, each with a qualifier; enablers; and a refusal to
     render when the money doesn't reconcile. With the authored `solution_recommendations` and offering exclusions
     already deferred here. **Ruled (Brad, 5 Nov 2026): in LVRF the verdicts reconcile to the case's levers and
     outcomes, not to money.** Every line names a current lever on a hypothesis in the sealed case, and the output
     refuses to render if one does not. Money reconciliation waits until monetization rates exist on real accounts.
     **A design ruling still to write for 3.1.**
  3. **A read-only UI conformance audit (P13-style)**, before the steward-safety slice.
- **Steward safety** (LVRF_PLAN §19; about 1 day), **if it did not ship in B4's Gate B**: first in 3.1, after the
  P13-style audit. Card 01c current rows first with history collapsed; simulated and system-exercise rows muted, their
  actions behind a toggle; short labels with context above; destructive acts in a marked zone; every confirmation names
  the item and its short id; no dead ends.
- **From Brad's UX message (5 Nov 2026):**
  - a source file attached to each evidence row, with the quote checked against the file's text;
  - a planned-acts queue: reviewed act text pre-filled, and the steward reads and submits each one (rule 10 holds:
    the steward performs every act);
  - accessibility: the contrast of secondary text, focus, labels;
  - code-splitting (the bundle is over 600 kB; L40).
- Loose ends L46–L53 not closed by item 1, and any finding frozen out by rule 1.

## 4.0 (recorded so nothing is lost)

- **The Realization Flywheel** (a CVAF pattern; Brad, 5 Nov 2026): for each measured outcome, variance against the
  sealed projection split into timing and adoption, base, rate, and an unexplained remainder that is shown, never
  absorbed; negative variance reported as plainly as positive; never smoothed or netted before it is shown per item;
  null is not zero. It needs measured actuals against committed targets, which the 2027 engagements will be the first to
  supply.
