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
| 5 | **P6: the value case** — `lens_policies` (the CFO lens, ≥ 55), `/runs/:id/case` with the CFO refusal page; outcomes by lever with basis and attribution; **cost of delay** under ruling (b) (committed target × client-stated, customer-side-attested monetization rate × 6/12; refuses with every reason); **roadmap milestones**; **recommended solutioning** (only offerings linked to the lever, not excluded); "what it takes to raise confidence"; the confidence curve (sealed scores, breaks, erratum marks); **print** with banners and the full hash on every page; the steward act **"Shared for review as an outside-in hypothesis"** (D-M21); proposed entries labeled, with a line that no pack is certified; `monetization_rates` and `policy_values` in its migration, D = 6 months set by the steward (P6 rulings, 4 Nov; LVRF_PLAN §19) | 5 days (plan approved 5 Nov; LVRF_PLAN §19) | **B3**, **closed 5 Nov** (Gate C clean at `9c93671`; planned for 11 Nov) |
| 6 | **§14: commit, measure and verify in the interface**, with the **attribution method and the measure class fixed at commit** (cost of delay refuses a `compliance_assurance` class; P6 ruling 2, 4 Nov) (design §3.2, core only: the method enum and its rules; comparison populations are 3.1). M21 needs none of it: an outside-in account has no commitment, actual or verifier, and the refusal page lists them as asks. **It takes ratify's freed day** | about 3¾ days (plan approved 5 Nov; LVRF_PLAN §14), steward safety with it | **B4**, built Fri 6 – Tue 10 Nov; Gate B **Thu 12 Nov**, buffer Wed 11 |
| 7 | ~~Consolidated Gate C, Brad's acts, **3.0 ratified** about **15 Nov**~~ **DONE: 3.0 ratified by Brad, 15 Nov 2026** (revision 4 of `LVRF_3.0_DRAFT.md`, against `cd38210`; B4 lens Gate C clean 15 Nov) (B2 and B3 each closed early, 5 Nov) (`LVRF_3.0_DRAFT.md` updated to what shipped; the 3.1 list recorded) | with B4 | — |

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

- **From the 3.0 ratification (Brad, 15 Nov 2026):** Q1, the Rule76 doctrine source; roster items 7 (total vs
  addressable) and 8 (sources as entities) (Q11); 11 (research reliability) (Q12); 14 (staleness and
  contradiction) (Q13); 15's reference sections generated from the system; the rest of 3 (Q7: parents and
  affiliates, L4, L9, the entity mismatch rate) and of 4 (Q8). Item 12 and the draft's test go with the first
  2027 engagement; D9 stays open for a `claimed` run on a real engagement.
- **Brad's rulings for 3.1 (15 Nov 2026):**
  - **One Rule76 family with CVAF.** LVRF's design, colours and UX are Rule76-compliant and read as the same family as
    CVAF. The reference is CVAF's `docs/RULE76_DESIGN_SYSTEM.md` (read from `cvaf-rule76`, nothing copied into CVAF).
    Tokens stay cited from `CLAUDE.md`, never restated; any value where CVAF's system and `CLAUDE.md` disagree is named
    for Brad, not resolved silently. The read-only UI conformance audit (CVAF pattern 3, above) is the first step.
  - **A hypothesis is sealed with every run.** **Confirmed as read (Brad, 15 Nov 2026):** producing a run is refused
    while its outcome has no current hypothesis, in the route and in the database; runs already sealed keep what they
    sealed, are never changed, and no re-run is forced; the next run on any outcome needs one. The tenant's own account
    gets a hypothesis path first (L33: it has no workspace today).
- **Raised 14–15 Nov 2026 (Brad's review of the Skillsoft case and the navigation). Ruled by Brad, 15 Nov 2026: all
  approved as recommended, with the conditions below; the order is under "3.1 build order".**
  - **Links to the value case and both lenses** on every run page, in the Runs list, and on the tenant's own account.
    Today the only links sit in a customer account's workspace. **Approved.**
  - **The War Room and account focus:** enter the War Room, choose an account, and keep that focus through the
    workflow, as CVAF does. **Reverses** the design's navigation decision (`LVRF_DESIGN_PACKS_ADMIN_VALUE_CASE.md` §4:
    accounts as the front door, flat object-keyed routes, no stage sequence). **Approved in this shape:** the flat,
    shareable routes stay underneath; an account frame on top carries the chosen account through every page (header,
    runs, case, POV, research) until it is left. The War Room never sums or averages money across accounts (CVAF's
    lesson, design §4.3). Mock-ups before code, as UX-1.
  - **In-app AI research with Rule76's API key,** on CVAF's design (`cvaf-rule76/ops/ai-drafting.md`, rulings P1–P4:
    the key is Rule76 Consulting LLC's, on the box only; the model named with its retention disclosed; each account
    cleared with a reason before its data is sent; spend capped, with an audit row before and after each call). The
    server would run the generated research prompt that a person pastes today; parse, the entity check and the
    per-field accept are unchanged. **Reverses** `CLAUDE.md`'s research seam (D1: no code calls a research tool) and
    Brad's 5 Nov ruling (offline only). **Approved for research only** (the drafting assistant stays deferred, Q9/P10).
    **Key and model (Brad):** Rule76 Consulting LLC's key, on the box only; the strongest model generally available,
    with its retention (at least 30 days) disclosed on the page and in each account's clearance; Anthropic's retention
    pages re-read when the slice is built. **Guardrails:** every result arrives `ai_sourced`, basis assumed until a
    person opens its citation and accepts it field by field (D2 rule 2, rules 4 and 5); the call carries published,
    outside-in material only and is refused if the generated prompt would carry a customer-side row. **Spend (Brad,
    15 Nov 2026, option 1):** Rule76 Consulting LLC's Console organisation, its own LVRF workspace with a workspace
    spend limit equal to Brad's Claude Pro fee a month, prepaid credits, auto-reload off, so calls stop at the limit.
    Claude Pro itself carries no API usage. `CLAUDE.md`'s research seam is amended when the slice passes Gate C (the OWN-1-D3 precedent).
    **S2 rulings (Brad, 18 Nov 2026; LVRF_PLAN §21, approved with D1–D10 as recommended):**
    - **The model is Claude Opus 5.5 (`claude-opus-5-5`). This ruling replaces "the strongest model generally available"
      above (15 Nov).** Brad's reason: Opus 5.5's results already pass review (35 of the 43 on record), it costs half as
      much, and its retention is lighter (Fable 5.2 is a Covered Model with no zero-retention option). Switching later
      stays a setting plus a new clearance for each account.
    - **The key is held by a separate system user** running the research process, and is not readable by `brad`: no
      `brad` process and no Claude session may ever be able to read it.
    - **The disclosure states 30 days,** the longer of Anthropic's two readings.
    - **Spend:** the LVRF workspace's limit stays equal to Brad's Claude Pro fee, **$20 a month**. After Brad's first test
      calls, the actual cost per call is reported against §21.3's estimates, so the cap can be revisited before 4 Jan
      2027.
    - **D5 holds for Skillsoft:** before any Skillsoft call, Brad sources or retires its two unsourced "system" facts
      (S2's act session).
    - **The SDK is pinned to an exact version;** `npm audit` is run and reported, never `npm audit fix --force`.
    - **On Gate A's findings (Brad, 18 Nov 2026):** a row that fails D5 is left out of the prompt and never sent, and the
      research page lists each one left out, with its short id and why. A call is refused only if such a row would still
      be in the prompt (only the pinned entity can be). No supersession of Scotts' rows and no act on `f1e2385e` is
      needed for S2.
    An API key is billed apart from a Claude subscription.
  - **Admin:** a page for the Skillsoft solution catalog (offerings are loaded by a script today), with `/people`
    (P8, above). **Approved:** adding, changing or retiring an offering is a steward act with its own act row.
  - **Copy:** an ask on a percentage measure says "one point", not "one unit" (the Skillsoft CFO print, 15 Nov 2026). **Approved.**
  - **Classify as… on an unclassified customer account** (the shared component S1 built), with the account frame.
    Raised at S1's Gate A (Brad, 15 Nov 2026); not in S1. Until then a customer account is classified when it is created.
- **3.1 build order (Brad, 15 Nov 2026).** Before the pilot starts on 4 Jan 2027: the case links and the copy fix; the
  hypothesis rule with the tenant's hypothesis path; in-app AI research; the printed case and POV brought into the CVAF
  family. *(Its "during the pilot" and "after" grouping is replaced by the revised order below, Brad, 19 Nov 2026.)*
- **3.1 build order, revised (Brad, 19 Nov 2026).** After S3's Gate B and Gate C:
  1. **S4:** the steward-form full-text confirmation and the repeated-value refusal (from the 3.1 list), as a small
     slice, before the pilot.
  2. **S5:** the account frame, mock-ups first (as UX-1). **Approved (Brad, 19 Nov 2026), LVRF_PLAN §24.** It must
     pass Gate C by **Fri 18 Dec 2026**; otherwise it waits until after 15 Jan 2027. **Closed 20 Nov 2026:** deployed at
     `5b0edb9`, Gate C clean (`BUILD_STATUS.md`, "S5 closed").
  3. **S6:** the War Room, mock-ups first. **Approved (Brad, 20 Nov 2026), LVRF_PLAN §25, with D1–D8 and D5
     changed.** **The same cut-off** (Brad, 19 Nov 2026): if it has not passed Gate C by
     **Fri 18 Dec 2026**, it waits until after the pilot's account-selection weeks (4–15 Jan 2027). No large navigation
     change deploys in that window.
     **Closed 23 Nov 2026:** deployed at `bf875e9` (20 Nov 2026), Gate C clean (`BUILD_STATUS.md`, "S6 closed").
  4. **Then:**
     - the solution catalog page;
     - `/people`;
     - the small items:
       - **first, right after S6 (Brad, 20 Nov 2026), with its own plan: the commit form records a promised
         measurement date.** `value_outcomes.promised_measured_at` exists, and no route writes it. A commitment made
         without it can never be given one afterwards (append-only), so it **ships before the pilot's first
         commitment**. Until then the War Room says "no promised date on record", never "on time" (§25 D5). **Approved (Brad, 23 Nov 2026), LVRF_PLAN §26, with D1–D6; closed 24 Nov 2026,** deployed at `f3e8fe7`, Gate C clean;
       - **first now, before the pilot (Brad, 24 Nov 2026): §26's two findings** (LVRF_PLAN §28, planned 24 Nov 2026,
         for Brad's approval; one slice, one deploy).
         - **Plan codes on screen:** card 01d's "(committed before §26)" and "(committed before B4)" become "committed
           before promised dates were recorded (24 Nov 2026)" and "committed before attribution was recorded (6 Nov
           2026)". A Gate A check: no "§" and no slice code (B1–B4, S1–S7, L-numbers) in any client string.
         - **"Committed on" defaults to the person's local date,** not the UTC date (at 22:28 New York time on 23 Nov it
           showed 11/24/2026). Gate A proves that the route's "after the commit date" rule holds for a measure-by date
           entered the same evening.
         **Closed 24 Nov 2026,** deployed at `2dc3f71`, Gate C clean (`BUILD_STATUS.md`, "§28 closed");
       - **next, after §28 and before the pilot (Brad, 24 Nov 2026, from §28's look): only a customer-side person
         commits** (LVRF_PLAN §29, planned 24 Nov 2026, for Brad's approval). The commit form offers only customer-side
         people at the account, and the route and the database refuse anyone else with a plain sentence. Curia's
         `e3fb0061` stays frozen as recorded. Proposed with the verifier in the same slice (§29 D6);
       - **then, before the pilot (Brad, 24 Nov 2026): no walk date in the future.** A Committed on,
         Measured on or Verified on date later than one day after today's UTC date is refused, by the route and by the
         database (hardening §34's guard, which every walk step passes through), with a Gate A break. One day's margin admits
         every local date on Earth (§28 D4), and nothing later;
       - **`verify_deploy_steps`' positive control made deterministic (Brad, 24 Nov 2026).** Section F reruns the deploy
         script from before the fix (`7f889b4`) and expects it to stop silently (exit 7), because the stub API is not up
         on its first try. That depends on a race: in §28's full regression it found the stub already up and failed
         (24/3), then passed alone (27/0). **The stub API starts on a signal the test controls** (it answers only
         after the test says so), never on timing. A red result is then never ignorable;
       - **The leaked Vite servers (approved by Brad, 24 Nov 2026, from §28's Gate A).** 27 scripts stop Vite by the
         subshell's pid, which leaves Vite's own node process running; 20 were found in §28's regression. Every script
         stops Vite by its port, as `verify_s5`, `s6` and six others already do, and the regression checks that no
         Vite, Chrome or API is left running after each script;
       - **then S7, the success story of record (Brad, 24 Nov 2026), after the two findings above:** LVRF_PLAN §27,
         approved by Brad (24 Nov 2026) with four conditions, mock-ups before code, S7b's Gate C targeted by Fri 18 Dec
         2026 (January the fallback only); two deploys (S7a the published-figure class, then Brad's
         acts recording Curia's published figures; S7b the story);
       - **next, after S6 and the promised measurement date (Brad, 20 Nov 2026): ONE contrast item.**
         - **Small gold text on paper uses `--gold-ink`** (AMENDMENT-004; CLAUDE.md: gold on white is 2.40:1 and fails
           AA at every size). Two places are known:
           - **`Card`'s number** (`workbench/Card.tsx`, `text-gold` on white, about 2.4:1), in every card in the
             app. Found at S6's Gate A.
           - **S1's form's provenance band** (`GovernedForm`, on `bg-rule-soft`): the gold-ink label at 4.39:1, and the
             ink-45 label and help text at 4.42:1, under AA. Found at S5's Gate A. Likely the band's background.
         - **A Gate A check that every page's text meets AA, app-wide,** so it cannot recur: every visible text element
           on every route, at 1280 and 390, computed against its background.
       - **the verify scripts audited for sections that pass with zero checks (Brad, 19 Nov 2026).** All 55
         `verify_*` scripts, and their walks, read for any section or mode that can end with no PASS or FAIL line and
         still pass. Then one shared helper, used by every script, under which **a section that prints no lines
         fails**. Found at S5's Gate A: the walk's deep account checks and the post-classification check never ran in
         the main pass, and the script still reported 180/0 (`BUILD_STATUS.md`, "S5 … Gate A");
       - **one confidence format everywhere (Brad, 20 Nov 2026).** The tenant's own account page shows its headline as a
         red badge, "25.0 · LOW" (`InstitutionPage`'s plain record view: `view.runs.latest_confidence_score`, unrounded,
         `CONFIDENCE_TONE` low = critical), while the frame above it shows "25 / 100 · LOW" (`ConfidenceBadge`, UX-1
         standard 5: "n / 100 · Band", Low never critical red). Found at S5's Gate B walk. One format, `ConfidenceBadge`'s,
         on every page; the runs table's score and band columns read against it too;
       - **the War Room's "Late outcomes" tile (Brad, 23 Nov 2026):** its empty dash is longer than the other tiles'
         dashes. One dash for every empty tile. Found at S6's Gate B look;
       - the pack-basis note correction, retiring a fact, the "Moves first" label, tenant card 05, and the confidence
         legend's markers as SVG (Brad, 19 Nov 2026).
     - *The dependency change moved ahead (Brad, 19 Nov 2026):* it ships before S5's mock-ups, with the deploy-script
       fix, as one ops change (`BUILD_STATUS.md`, "Ops: the deploy script's silent stop fixed"). **Closed
       (19 Nov 2026):** deployed at `4e5c13b`, Gate C clean.

  S2's Gate B step 8 and its act session stay deferred until Brad funds the API.

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
- **From the B4 findings lens Gate A (14 Nov 2026), recorded, not changed:**
  - **32 of the 49 verify scripts clone local dev `lvrf`, not the prod copy** (`make_clone`'s default template). Only
    17 run on prod's data. Point them at the copy, or say in each why dev data is the right fixture. For example,
    `verify_tenant_scope`'s misstated-finding leak check reads tenant A with no misstated run on dev `lvrf`, so it has
    nothing to leak.
  - **The verify scripts leave their vite and API servers running:** cleanup kills the `( … ) &` subshell's pid, not
    its child (about 22 vite processes after one full regression). Stop them by port, as `scripts/equivalence_gets.sh`
    does.

- **From S1's Gate C (Brad, 15 Nov 2026):** **a correction path for a pack-basis note.** A metric's basis note is
  final once set (the route refuses a second basis: "supersede the metric instead"), and on Skillsoft act 4's note
  (`eed11e02`) holds the claim's text by mistake. The correction is an **appended correction row that points to the
  original, never an edit**: the original row, its text and its link stay as recorded. Card 01c's "Supersede…" is not
  this shape: it sets `superseded_by_id` on the original and moves its links. Until it exists, a further observation on
  01c carries the corrected note (Brad's act, 15 Nov 2026).

- **From S1's act session (Brad, 15 Nov 2026): steward forms that write to prod confirm every field in full, and a
  field may not repeat another.**
  - "Record a source…", "Supersede…" and the pack basis each show a confirmation before recording, with each field's
    full text: no slice, no ellipsis.
  - The route refuses a value identical to another field's in the same request, such as a supersede reason that
    matches "How it was read".
  - **The cause: three paste departures on prod, 15 Nov 2026.**
    - `eed11e02`: the pack-basis note holds the claim's text.
    - `c56a3d33`: "What it states" holds only the last 340 of its 557 characters.
    - The `supersede` act that made `673861eb`: its reason holds the how-read text.

- **A route to retire a fact (Brad, 18 Nov 2026, from S2's Gate A).** Today an account fact can only be superseded, by a
  new fact of the same kind with its own evidence. Nothing retires one that should not stand, such as Skillsoft's
  unsourced "system" fact `f1e2385e` ("LVRF (value realization records)", evidence `f41102bc`, recorded before evidence
  forms). Retiring means `deleted_at` and a reason, with a `withdraw` act, never a delete (rule 2), and it is the
  steward's act through the page (rule 10).

- **One small dependency change, after S3** (Brad, 18 and 19 Nov 2026), with its own full regression:
  - the plain `npm audit fix` for `body-parser` (high) and `qs` (moderate), never `--force`;
  - `"argon2@0.45.1": false` in `allowScripts`, which silences npm's warning on every `npm ci` (argon2 loads from its
    shipped prebuilds; sign-in P1, 11 Oct 2026).

  The four moderate findings in the dev tooling (`esbuild` through `drizzle-kit`) are fixable only with `--force`, so
  they stay.

- **Revisit S2's two residual risks when LVRF first holds confidential customer-side data** (Brad, 18 Nov 2026).
  The two: a `brad` process changing the API's code, and one using the API's database login to insert a prompt and a
  `sent` row for a cleared account. The fix then: the research process builds its own prompt from a root-owned copy of
  the composer, so "the prompt is current" and the published-rows rule (D5) are its checks too, not the API's alone.

- **A verified case's status line on every printed page** (Brad, 19 Nov 2026, from S3's Gate A; not in S3).
  - **Today:** a verified case on customer-side evidence prints no banner, because the case prints one only when there
    is something to disclose. Its verification shows only in the closing disclaimer, while the run page shows a
    VERIFIED banner (`Workbench.tsx`).
  - **The item:** every page of a verified case carries a status line, matching the run page's VERIFIED banner. For
    example: "VERIFIED: measured result verified by {name, role} on {date} against {system}".
  - **Condition (Brad):** it ships before any verified case is printed for a customer.
  - S3's fixture, a verified case the CFO lens shows (`scripts/lib/s3_cfo_fixture.sh`), is the test bed.

- **A full-text confirmation on the other free-text steward forms** (Brad, 19 Nov 2026, S4's D1; a follow-up, not in
  S4). The forms with no confirmation that record free text:
  - the claim;
  - the walk's "Record the opened citation";
  - outcome evidence (`AddEvidenceCard`);
  - "State the hypothesis";
  - "Record the summary";
  - "Record the erratum";
  - "Record fact".

  Each gets S4's `ConfirmFields`: every field in full, with its count. S4's route and database refusals already cover
  their evidence fields.

- **The confidence legend's markers as SVG** (Brad, 19 Nov 2026, from S3's Gate C; a small item, not in the fix).
  - **The problem:** the legend of the "Confidence over time" chart sets four glyphs that no face the app carries
    has, so the print falls back to system fonts, embedded as Type 3:

    | Glyph | Code point | Fell back to |
    |---|---|---|
    | ● | U+25CF | `.SFNS` |
    | ○ | U+25CB | `.SFNS` |
    | ◆ | U+25C6 | Lucida Grande |
    | ┆ | U+2506 | PingFang SC |

    Read from Brad's run 3 default print, 19 Nov 2026.
  - **The item:** draw them as SVG shapes in the tokens, so a print embeds only Bebas Neue, Barlow, Barlow Condensed
    and the mono face.

## 4.0 (recorded so nothing is lost)

- **The Realization Flywheel** (a CVAF pattern; Brad, 5 Nov 2026): for each measured outcome, variance against the
  sealed projection split into timing and adoption, base, rate, and an unexplained remainder that is shown, never
  absorbed; negative variance reported as plainly as positive; never smoothed or netted before it is shown per item;
  null is not zero. It needs measured actuals against committed targets, which the 2027 engagements will be the first to
  supply.
