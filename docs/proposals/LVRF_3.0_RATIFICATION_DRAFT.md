# LVRF 3.0 — ratification draft (revision 4, proposed)

**Status: RULED by Brad Piver, 15 Nov 2026: all four decisions as recommended (decision 3 worded as in revision 4); applied as revision 4 of `docs/LVRF_3.0_DRAFT.md`.** Kept as the record of what was proposed. *Originally:* proposed, not ratified. Drafted 15 Nov 2026 (UTC) for Brad Piver's review. Nothing in
`docs/LVRF_3.0_DRAFT.md` is changed until Brad rules on the four decisions in section 4; then the
draft's status line, its roster and its *Open before ratification* are updated to match, in one
docs commit. Where this file and `CLAUDE.md` disagree, `CLAUDE.md` wins and the conflict is named.

**What ratification means here** (`LVRF_3.0_CRITICAL_PATH.md`, ratified 1 Nov 2026): LVRF 3.0 is
the 3.0 draft, ratified against exactly the scope that shipped; everything deferred is recorded as
3.1. "Ready" means ready to **run an engagement**: capture the customer's baseline, a committed
target, attested monetization rates, measured actuals and verification, and render a value case
that honestly refuses until each is in.

---

## 1. What shipped: the critical path's scope

| # | Work | Batch | Closed |
|---|---|---|---|
| 1 | L52 and L50 closed; the hold on customer-side role grants lifted | B1 | Gate C clean at `bd5cb7c`, 5 Nov |
| 2 | Short ids in every evidence picker and list; "Withdraw this link…" on card 01c | B2 | Gate C clean at `bdf9971`, 5 Nov |
| 3 | ~~Pack ratify and demote~~ | — | **moved to 3.1** (4 Nov) |
| 4 | The case snapshot (§16, payload v4) | B2 | Gate C clean at `bdf9971`, 5 Nov |
| 5 | P6, the value case: the CFO lens (≥ 55) and its refusal page, cost of delay under ruling (b), roadmap, solutioning, "what it takes to raise confidence", the confidence curve, print with banners and the full hash, the D-M21 steward act "Shared for review as an outside-in hypothesis" | B3 | Gate C clean at `9c93671`, 5 Nov |
| 6 | §14: commit, measure and verify in the client, with the attribution method and measure class fixed at commit; steward safety with it; the card 05 addendum | B4 | deployed at `5b834f2`, Gate C clean 6 Nov |
| 6a | The B4 findings lens: misstated-finding errata (41 on 25 runs, Brad's batch), the CFO print request naming its lens policy, the withheld-claim line on the CFO refusal page, absence no longer sealed as synthetic | B4 lens | deployed at `cd38210`, Gate C clean 15 Nov; post-act dump TOC 908 |

**Cut to 3.1 by the cut line (4 Nov):** the War Room, the CHRO lens, link corrections in the
supersession batch.

## 2. The draft's roster (revision 3), item by item

| Item | Disposition | Where |
|---|---|---|
| **A1** access grant is a record | **Shipped** | Q2, 11 Oct (`da00660`, `7c7e90e`) |
| **A2** Brad-only acts, one shared check | **Shipped** | Q3, 11 Oct (`9560bfd`); steward-only routes since, each added to the guard's list |
| **B3** entity pinned | **Shipped, minimum** (legal name and identifier; parse refuses a different entity) | Q4h, 12 Oct (`92ae23b`). **3.1:** parents and affiliates, L4, L9, the entity mismatch rate (Q7) |
| **B4** disclosure regime | **Shipped, minimum** (recorded with evidence; the prompt reads it) | Q4h. **3.1:** the gap register computing *structurally unobtainable* (Q8) |
| **B5** one trust vocabulary, derived | **Shipped** (D2 mapping) | O1, 12 Oct (`1db189b`) |
| **B6** account research intake | **Shipped** | Q4h, 12 Oct; P2 adds `research_imports` (0041) |
| **B7** total vs addressable | **3.1** | Q11 |
| **B8** sources as entities | **3.1** | Q11 |
| **B9** one definition behind every pack prompt | **Shipped** (recon found drift; fixed) | Q4b, 12 Oct (`0ee288d`) |
| **B10** a run renders from itself | **Shipped**: the run seals the fact ids and values it used (O1); the whole case (B2, §16) | O1; B2 |
| **B11** research reliability, measured | **3.1** | Q12 |
| **B12** a human-derived oracle | **Carried to the first real engagement** (D13 stays open for it) | Q12 |
| **C13** correction and re-checking | **Shipped**: an opening is what verifies (L41, `930c8f7`); parse refusals on record (L8). **3.1:** the `website` path (L9, with Q7) | |
| **C14** staleness and contradiction | **3.1** (needs a new model version) | Q13 |
| **C15** documentation and the PDF | **PDF shipped** as a browser print (O-D5; B3), which settles D10: no WeasyPrint. **3.1:** reference sections generated from the system | Q13 |
| **D16** pack ratification | **3.1** (N = 2 institutions' systems of record, not lowered) | critical path, 4 Nov |
| **D17** the earned pack | **Band D**, on its trigger | — |
| **D18** portfolio learning | **Band D**, on its trigger | — |

**The 3.1 list** is the critical path's *3.1* section as it stands at `92821ee`, plus Q7, Q8, Q11,
B11, C14 and C15's generated documentation above. The 4.0 list (the Realization Flywheel) is
unchanged.

## 3. *Open before ratification*, item by item

| Q | State | Proposed disposition |
|---|---|---|
| Q1 the Rule76 doctrine source | **Open.** Provenance, Truth and Governance are still not excavated in the Cathedral | Decision 1 |
| Q2–Q6, Q8 | Decided (11 Oct) or fixed (L21) | Recorded as decided; no change |
| Q7 `record_documents` provisional | The draft accepts it "while no record leaves Skillsoft. **Restate it if one does.**" **That trigger is now met:** D-M21 shares a printed outside-in case with a prospect, recorded in `record_documents` | Decision 2 |
| Q9 the first real engagement (D13) | **Open** for the real engagement; not blocking | Carried, with B12 |
| — D9 a run locked at `claimed` states it is a hypothesis (L18) | Open, "nothing urgent" | Proposed answered by the OUTSIDE-IN and UNVERIFIED banners for outside-in runs; **to confirm** (decision 4) |

## 4. Decisions for Brad

1. **Ratify with Q1 open?** Recommended: **yes**, with the disciplines table recorded as a
   *working statement, not a citation*, exactly as the draft already says, and Q1 carried to 3.1.
   Holding 3.0 for an excavation with no date would hold M21.
2. **`record_documents` and M21.** The draft's own condition is met. Recommended: restate it as
   **provisional, and shared only by the D-M21 act** (both banners print, the act names who, with
   whom, when, the run and its hash, and never changes verification), until the Repository
   Constitution ratifies. No schema change.
3. **The test.** The draft's test ("a Skillsoft user Brad has authorized, not Brad, takes an
   account from a name to a researched baseline") **has not been met**: no person other than Brad
   holds a grant *(to confirm on prod, read-only)*. The critical path replaced it as the bar for
   3.0 with "ready to run an engagement". Recommended: ratify against the critical path's "ready",
   and carry the draft's test, with 1.2's oldest open test, as the **acceptance test of the first
   2027 engagement** — not claimed as passed.
4. **D9.** Recommended: closed by the banners for outside-in runs; a `claimed` run on a real
   engagement keeps the question open into 3.1.

## 5. Proposed status line for `LVRF_3.0_DRAFT.md`, once ruled

> **Status: RATIFIED by Brad Piver, [date], against the scope shipped through `cd38210`** (B1–B4
> and the B4 findings lens; `LVRF_3.0_CRITICAL_PATH.md`). Deferred work is recorded as 3.1 in the
> critical path. Q1 (the doctrine source) is carried open: the disciplines table is a working
> statement, not a citation. `record_documents` stays provisional, shared only by the D-M21 act.
> The draft's test is the acceptance test of the first 2027 engagement and is not claimed as passed.
