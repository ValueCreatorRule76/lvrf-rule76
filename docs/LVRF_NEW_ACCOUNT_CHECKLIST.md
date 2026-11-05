# New-account checklist: from a named account to a printed outside-in POV and value case

**Draft, 5 November 2026, for Brad to check.** Required by `LVRF_3.0_CRITICAL_PATH.md` (M21: each named account
printed by 22 November). It follows the screens as they stand at `bd5cb7c`. Steps that arrive with B2 or B3 are
marked, and the time per account is filled in only once it has been measured on a fixture.

**Who does what.** Every act below is Brad's, through the page (`CLAUDE.md` rules 4 and 10). LVRF generates every
research prompt from live rows. A person runs it in the research tool and pastes the response back, and a person
accepts or rejects each field. Claude Code can check a reading against a downloaded source, but it never records one.

---

## 0. Before the first account: the pack

An account can be walked only against a pack entry that its capability claims. For the account's industry, check on
the **Packs** page:

- [ ] **The industry exists.** If not, use "Add an industry…" (steward): name, slug, reason. Utilities was added on 1 Nov.
- [ ] **The pack has measures.** If not, on the industry's pack page: "Generate a research prompt" (R1), run it, then
      "Parse a research response" (R3), then accept or exclude each measure under "Pending review" (R4/R5).
- [ ] **Measures accepted; entries proposed until N = 2 institutions' systems of record** (Brad, 4 Nov 2026).
      Ratification is 3.1 and is never lowered to make it reachable. The value case shows each entry as proposed.
- [ ] **Each measure the account will use has one lever.** A lever is ratified by the steward's proposal (O-D2a), and
      it can be written while its entry is proposed. Its citation names an **opened evidence row** (§17), not free
      text: record the source on card 01c of the tenant's own account, about its publisher, open it, then name that
      row in the lever's citation.
- [ ] **Solutions are linked to the lever** (offerings), each with the steward's basis.
- [ ] **The attestation roles that will be needed are known.** No role is granted from an unopened source.

**Utilities: stage 0 complete for M21 (Brad, 5 Nov 2026).**

| Entry | Lever | Cites (opened Yes, on the tenant's card 01c) | Solution linked | M21 |
|---|---|---|---|---|
| TRIR (`792c9a8d`) | `1b41c5cf` Hazard recognition and control training for field crews | `532f51fa`, OSHA 3885 (Oct 2016), printed page 26 (PDF page 30), Action item 4 | Skillsoft Compliance Suite (link `6d4e9da0`) | **Ready** |
| Excavation damages per 1,000 locate requests (`ba412de0`) | `9b3673be` Locator accuracy and qualification | `ce9b1a09`, CGA 2025 DIRT Data Summary & Trends, page 13, ranks 3 and 4 | **none** (no catalog offering) | **Ready** |
| CAIDI (`dda6e919`) | none | — | — | **Not used** |
| Net heat rate (`51c360c9`) | none | — | — | **Not used** |

- **The Compliance Suite link** (Brad, 08:23 ET, one `link` act). Its basis: "Its EHS and workplace safety training is the
  delivery for this lever's hazard-recognition training; the catalog lists EHS and workplace safety in its scope. Which
  courses cover hazard recognition and control is to be confirmed for each account."
- **The excavation lever has no catalog offering.** Nothing in the catalog covers utility locating, 811 practice or
  locator qualification, and LX Design Studio is not linked as custom authoring. The value case's recommended solutioning
  shows none for it. **To raise with Skillsoft:** locator and 811 content, possibly through the Content Marketplace.

- **Both quotes were checked by Brad against the downloaded documents:** OSHA 3885 through the PDF's text layer, and the
  CGA table on page 13, confirmed by eye as well. The OSHA URL opens in a browser; an automated fetch gets a bot check
  (403). `ce9b1a09` carries no URL, by Brad's choice; its citation names the document and page.
- **The first two levers, `4a864995` and `f3726d60`, are retired.** Both were ratified before their sources were
  recorded and opened, and their citations named no row. The rows they rested on, `36854f20` (instructions in its quote
  field) and `d07d8a84` (an instruction for its citation, figures from a trade-press summary), are superseded by
  `532f51fa` and `ce9b1a09`.
- **Why CAIDI and Net heat rate are not used:** each carries another entry's reviewer note on the pack page (CAIDI has
  SAIDI's; Net heat rate has the non-capacity SSO note). The correction is a 3.1 steward act (L54); until it ships, read
  those two notes as wrong. Net heat rate also has no lever until a primary source for the operator-controllable share
  is opened.
- **Attestation roles, known (Brad, 5 Nov 2026).** Known only: **no role is granted until an account's own opened
  source names the person** who holds it.

  | What is attested | Role | Their system of record |
  |---|---|---|
  | TRIR | Director of Safety / EHS | OSHA 300 logs |
  | Excavation damages | Damage Prevention Manager | damage records, 811 ticket counts |
  | Monetization rates | Controller, or operations finance | — |
  | Training share | L&D / Learning Operations lead | LMS export |

## 1. Create and classify the account

- [ ] **Accounts:** "Create account" (card 01). Give the name, what the customer says it does, and "Classify as" the
      industry, with a note of why. An account can be created unclassified and classified later.
- [ ] **Mark it a reference example** if it is one ("Mark as a reference example…"; for a published-only account the kind
      is **outside-in test**). The kind starts unchosen, and a correction that changes nothing is refused.

## 2. Research: the entity, then the facts (workspace step 1)

- [ ] **A2, entity first:** "Generate a research prompt". It asks only which legal entity this is and its disclosure
      regime. Run it, paste the response into **A4** ("Parse a research response"), and review it in **A5**.
- [ ] **Pin the entity** (A1). Facts are refused until it is pinned.
- [ ] **A2, facts:** generate the facts prompt for the pinned entity, run it, parse it, and review each fact.
- [ ] **Open each fact's source** before accepting it as verified. An AI-sourced fact is opened in research, not elsewhere.

## 3. The evidence (card 01c)

For every source the case will rest on, on **card 01c, "The account's evidence"**:

- [ ] **"Record a source…"**: kind, what it states, where it came from, the citation, **what it is about** (it starts
      unchosen: this account, the tenant, another account, or a company named), and **a quote or a locator, with how it
      was read** (page and section go in How it was read).
- [ ] **Check every quote against the source document before recording it.** A reading is final once recorded.
- [ ] **A locator holds one number.** For a table with several values, quote the rows instead.
- [ ] **Open the source** ("Record that you opened the source…"): Yes verifies it; No needs a reason.
- [ ] **Tell rows apart by their short id**, which sits beside each row's text. Near-identical rows caused both of
      B1's wrong ticks.

## 4. The outside-in walk (workspace step 2)

- [ ] **W1** Analyst of record.
- [ ] **W2** Offering and capability.
- [ ] **W3** The capability's claim on a pack entry.
- [ ] **W4** The value outcome, with its published baseline. Record only a baseline a source states for this account.
      An industry median is not this account's baseline (§17).
- [ ] **W5** The metric's pack basis.
- [ ] **W6** Evidence: the baseline, and any vendor claim. Baseline support must be **about this account**. A vendor
      publication supports the impact basis only.

## 5. The hypothesis (workspace step 3)

- [ ] **"State a hypothesis…"** names the outcome, the lever, the statement and the falsifier.
- [ ] **The falsifier's reference** is quoted by the database and frozen. Use `baseline` only when the baseline is the
      account's own; otherwise wait for a committed target (§14, B2).

## 6. The executive summary (workspace step 4)

- [ ] **"Write the executive summary…"**, per lens. Say so if it was drafted with AI, and name the tool.

## 7. Run and lock (workspace step 5)

- [ ] **W7, Produce the run.** It seals the evidence, facts and case as they stand, and the case chain once §16 ships.
- [ ] **W8, Lock the run**, with a reason. A locked run never changes. Corrections go beside it as errata.

## 8. The point of view (workspace step 6)

- [ ] **"Open the point of view"** and read it as the prospect will: the **OUTSIDE-IN HYPOTHESIS** and **UNVERIFIED**
      banners, the marker, every figure and its basis.
- [ ] **Any flagged figure** on a page the prospect will see is resolved before printing: a sourced derivation, or a
      finding where the guard allows one.
- [ ] **If no source supports a flagged figure, withdraw its link** (Brad, 4 Nov 2026), so the case prints the refusal
      for that figure instead of a figure nothing supports. "Withdraw a link…" is on the run page. For an outcome whose
      runs predate the link to it, there is no screen for this until B2 adds "Withdraw this link…" to card 01c. The
      first case is Skillsoft's 7,000,000 impact basis: the guidance row is linked to it and does not state it.

## 9. The value case *(B3: P6)*

- [ ] `/runs/:id/case` under the **CFO lens**: the refusal page with its asks (a system-of-record baseline, a committed
      target by a named person, an attested monetization rate, a verifier). That page opens the conversation.

## 10. Share and print *(B3)*

- [ ] **"Shared for review as an outside-in hypothesis"** (D-M21), the steward act recording who, with whom, when, the
      run and its hash. Allowed only while both banners print. It never changes the run's verification state.
- [ ] **Print to PDF and look at every page:** both banners and the run's full hash on each.

---

## Time per account

| Stage | Measured on a fixture |
|---|---|
| 0, the pack (once per industry) | not yet |
| 1–3, the account, research and evidence | not yet |
| 4–8, the walk to the POV | not yet |
| 9–10, the value case and print (B3) | not yet |

The critical path's estimate is one to two days per account, after the pack. This checklist will be timed once on a
fixture when B3 ships, and the table filled in from that.
