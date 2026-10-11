## LVRF 3.0 — DRAFT, not ratified — 11 October 2026 (revision 3)

**Status: adopted as the working plan, not ratified.** *[rev 3: decided by Brad
Piver, 11 October 2026; was "proposed". Q1, the doctrine source, stays open, so the
draft is not ratified. The forward order lives in `docs/LVRF_PLAN.md`.]* Where this draft and `CLAUDE.md` disagree, `CLAUDE.md` wins and the
conflict is named under *Open before ratification*.

**Revision 3 changes only what the build has overtaken.** Every change is marked
*[rev 3]* where it is made:

- Sign-in P3, the tenant check on every route, is **built and deployed** (`75e92c3`,
  11 October). It is done, not deferred. Item 2's role check is the **next** sign-in
  phase after P3, not a replacement for it.
- P3 is filed under 2.x, platform.
- P4 was decided on 11 October: keep basic_auth for now.
- The item 10 recon was done on 11 October.
- Conflicts with `CLAUDE.md` and `BUILD_STATUS.md` are named in a new section,
  *Conflicts named in revision 3*.
- **Three open questions decided by Brad Piver on 11 October:**
  - Q2, who may grant access: Brad alone.
  - Q3, which acts are Brad's alone: the list below.
  - Q4, the basis vocabulary: derived, not stored.

  Items 1, 2 and 5 are updated to match.

**Brad-only acts mapped to the routes that perform them today** *[rev 3; plan only,
nothing built]*. Item 2's single shared check applies to this list:

| Brad-only act (Q3) | Performed today by | Flag |
|---|---|---|
| Grant / revoke access | **No route.** `scripts/set_password.ts` (and `set_email.ts`), run over SSH on the box. There is no revoke act: `set_password` revokes only the person's previous credential | ⚠ Outside the API. Brad-only only because only Brad has SSH, and the decider is not recorded as such. Item 1 needs a grant/revoke act whose actor is Brad: an audited route behind the check, or the scripts made to record Brad as actor |
| Accept or exclude pack entries | `POST /api/research-results/:id/accept`, `POST /api/research-results/:id/reject`, `POST /api/industries/:industryId/exclusions` | ⚠ *reject* is not named in Q3. Proposed Brad-only, since accept and reject are one review decision on a pack entry. Brad to confirm |
| Ratify or demote | **No route.** Accepted entries enter `industry_measures` as `proposed`; nothing sets `ratified`, and nothing demotes | ⚠ No route yet. It arrives with Band D item 16, and must be behind the check from its first commit |
| Retire an engagement | `POST /api/engagements/:id/retire` | — |
| Issue a model version | **No route.** `MODEL_VERSION` is a constant in `server/spine/confidenceModel.ts` (with a computed `MODEL_FINGERPRINT`), issued by commit and deploy | ⚠ Outside the API. Brad-only through git push and SSH, not through the app. Either record that as the governance path (the commit author is the decider), or add a route |
| Change any stated threshold | **No route.** Thresholds are code constants: `ATTESTATION_CREDIT` and the band cut-offs in `server/spine/`, and the `MIN_*_LENGTH`s in routes. Pack ratification's N = 2 is not coded yet | ⚠ Outside the API, as for model versions. Item 16's "threshold in configuration" would need the check if it became editable |

**Every other mutating route is an authorized-user act** (research, record facts
and evidence, walk outcomes, produce and lock runs):

- `account-inputs`, `facts`, the fact supersession route (planned), `inputs`,
  `evidence`, `value-outcomes`;
- `commit`, `measure`, `verify`;
- `produce-run`, `lock`, `record-document`;
- `industries/:id/research-results` (research intake).

⚠ These are not named by either list and are proposed as authorized-user acts. Brad
to confirm:

- **`industry`** (classify an account);
- **`offerings`** (attach an offering);
- **`validate`** (supersede a metric definition with a confirmed baseline);
- **`pack-basis`** and **`industry-measures`** (claims). These reference a pack
  entry but do not change the pack.

**What the check needs.** A stored statement of who Brad is, not his id in code. The
nearest existing column is `tenants.steward_person_id`, which is NULL today; it is a
candidate to decide on in item 2's own plan.

The roster is otherwise unchanged and not acted on.

**Revision 2 corrects revision 1 on two points the author set:**

- **Customers do not sign in.** LVRF is used by Brad Piver and the Skillsoft users he
  authorizes, and he decides who gets access. Revision 1's test and its item 2
  (customer-side sign-in) are withdrawn.
- **3.0 is research**, covering accounts and packs, governed by the Rule76
  disciplines of **Provenance, Truth and Governance**. CVAF, the most mature Rule76
  application, has already paid for many of the lessons. They are carried in rather
  than relearned.

---

## Why a 3.0 now

The 2.0 roster of 30 August is delivered: model versioning, the gap register, cohort
roll-up, self-drift detection, research intake, draft-and-refuse. *[rev 3: this said
"What remains on it is the fact supersession writer". That was not the whole of it.
Open from 2.0 are the fact supersession writer (built 11 October, deploy pending),
drift checks D2–D4 (only D1 is built), and account research (2.0 item 5 shipped
packs only; it is item 6 here). Model versioning also records a version and a
fingerprint, but weights are still constants rather than data. See
`docs/LVRF_PLAN.md`.]*

**The 23 August release structure has been overtaken by the build.** It named, as out
of scope for all three tiers: multi-tenancy, user management, dashboards,
third-party integrations, industry packs. Industry packs, the account workbench and
sign-in P1-P3 *[rev 3: was P1-P2b]* have all since been built, each pulled by a real need. 3.0 puts the
plan back in step with the build, and names what comes next before it gets built
unplanned.

**Research is the right centre.** Research intake shipped narrower than scoped (30
August), and the narrowing was correct: it found that metric-value research cannot
reach customer outcome metrics, and turned to packs. What remains unbuilt is the
other half: **researching the account itself**, which is the baseline stage and
AMENDMENT-005's *"highest-value use."* Today account facts are typed into the
workbench by hand, each backed by evidence. That is honest, and it does not scale
past the author.

"3.0" was referred to twice in this file (30 and 31 August) and never written down.
This is the first time it is.

---

## Filing what was built outside the tiers

| Work | Filed under | Reason |
|---|---|---|
| Industry packs, pack review, exclusions, research intake | **2.0** | As recorded on 30 August |
| Account workbench | **2.0** | Where the pack and the account meet; the hand-entry path 3.0 research feeds |
| Sign-in P1, `set_email`, P2a, P2b | **2.x, platform** | Its trigger was a person other than the author needing a record. The person is an authorized Skillsoft user |
| Sign-in P3: the tenant check on every route, reads and writes, one helper and a coverage guard (`d794f17`, `75e92c3`, deployed 11 October) *[rev 3]* | **2.x, platform** | It finishes sign-in's actor model. Every route answers for the actor's tenant. With one tenant it guards nothing today, but it is cheap now and the coverage guard keeps new routes in it |
| Fact supersession writer | **2.0, last item** | Already "next after P2b"; corrects a real fact |

---

## The governing disciplines

The task is to work under Rule76's **Provenance, Truth and Governance**. One problem
has to be named first, as `CLAUDE.md` requires for any conflict:

> **The Cathedral does not yet hold these as ratified doctrine.**
> `06-governance/GOVERNANCE-DOCTRINE-INDEX.md` lists *Governance and Provenance
> Doctrine* and *Trust Doctrine* as **awaiting source verification**.
> `00-constitution/registers/GOVERNED-TRUTH-REGISTER.md` is an initialized scaffold
> with every section *awaiting governed excavation*. `CVAF-INHERITANCE-AUDIT`
> records CVAF's governance and provenance as *missing inheritance*.

So 3.0 does not quote a doctrine that has not been excavated. It works from what
**is** in force and states each discipline in those terms. If the doctrine is
excavated later and says otherwise, it wins and this table is re-mapped.

| Discipline | What it requires of research | Already in force |
|---|---|---|
| **Provenance** | Every researched fact names its source, the query that produced it, the tool that ran it, and the person who opened the citation. What ran is a separate fact from what was asked | Rule 5; AMENDMENT-005 Art. III-IV (`ai_sourced`, `research_query`, `research_tool`, `citation_resolved`); `query_as_executed` |
| **Truth** | A fact is exactly as true as its evidence. A missing fact stays missing and says why. Published is not client-stated. An unpublished figure is a finding, not a failure. Nothing is defaulted into looking measured | Governing AI principle; Rule 1 (zero is data); Rule 6 (disclosure gate); AMENDMENT-005 Art. II (*evidence, not numbers*) |
| **Governance** | A person accepts each field. AI never certifies its own sources. Research may inform the baseline and model and never supplies the actual. Who may decide is Brad's to set, and every decision names its decider | Rule 4; AMENDMENT-005 Art. I and VI; `research_results` three review states; audit log append-only |

---

## CVAF's lessons, carried in

Read from `cvaf-rule76` on 11 October: `CVAF_Forward_Plan.md`, `Pack_Contract.md`,
`f24-revised-research-intake-path.md`, and the September-October commit history.
Each row says whether LVRF already holds the lesson or 3.0 must build it.

| CVAF lesson | Where CVAF paid for it | LVRF today | 3.0 |
|---|---|---|---|
| **Researching the wrong legal entity is worse than a wrong number** | ZCC account named "Zachry Group", a bankrupt unaffiliated brand, instead of Zachry Construction Corporation. Band 0 | `institutions.name` is free text; nothing pins the entity | **Item 3** |
| **The ceiling is the account's disclosure regime, not the method** | Fluor (filer) yielded margin and backlog; Hensel Phelps (private) yielded none. Same prompt | Nothing records filer status | **Item 4** |
| **Published is not client-stated** | 10 Oct commit; outside-in POVs must say so | `evidence.kind` separates `public_filing` from `attestation`; pack badges separate basis from coverage | **Item 5**: make it one vocabulary |
| **Two trust vocabularies in one codebase** | `disclosed > inferred > assumed` vs `verified_benchmark > directional > client_adjacent` | `evidence.kind`, `source_verified`, `ai_sourced`, pack badge families, `evidence_class` | **Item 5** |
| **Never default the trust label to the strongest claim; `assumed` is the honest floor** | `governedProposalQueueService.js:103` | Parsed fields enter `pending`; accept creates unverified evidence | Holds. Keep it in item 6 |
| **A defaulting rule that cannot refuse is a slower way to fabricate** | Kiewit `winRate` 25: the pack default sitting on an account as if measured | No pack value seeds an account | Holds. Name it a standing rule |
| **Research that stops one hop short reports false success** | Research Intake accepted proposals and wrote nothing to the account | Pack accept writes evidence and the entry in one act | **Item 6** must do the same for accounts |
| **Staged research is a separate store from account truth; state the boundary** | `research_sources` as a fourth store | `research_results` is staging; `institution_facts` is truth | Holds. Write the boundary down |
| **Total versus addressable; headcount versus the population a lever touches** | Zachry ~$10B total, commercial on about half; Hensel Phelps headcount overridden to 50 seats | `institution_facts` has `revenue` and `headcount` only | **Item 7** |
| **Sources are entities, with methodology and population** | CFMA cited five times across three object types; AIA/Catina's population (>$50M projects) vs HP's ~$40M average | `provenance` and `source_reference` are text on each evidence row | **Item 8** |
| **A certification that records no certifier is a claim** | 7 Sep EPC proposal certified with `certifiedBy` empty | Every write names its actor; accept names its reviewer | Holds |
| **One definition: the prompt, loader and runtime read one schema** | Pack content in four disagreeing places; the generate prompt had drifted to a fifth of the pack | The metric prompt is composed from live rows; pack prompt **unverified** | **Item 9**: recon |
| **A run renders from itself: seal the facts and pack ids it used** | 10 Oct commit | *[rev 3: recon done]* A run's payload is a hashed snapshot of the outcome, metric, capability, evidence and events. **No account fact and no pack entry is an input to a run today**, so neither can change one. Only the account name is joined live on `GET /api/runs/:id` | **Item 10**: becomes binding when item 6 feeds facts into runs |
| **Industry as free text fragments** | Five spellings of EPC across 13 accounts | `industries` is tenant-scoped and constrained | Holds |
| **An independent, human-derived answer is the best test** | ZCC workshop baseline as oracle for the app | Curia was built from published material; no oracle | **Item 12** |
| **Reference accounts are read-only** | Kiewit, ZCC | Curia's runs are locked and immutable | Holds |
| **Probe before building; end at a verification gate; write findings back in the same commit** | Five stranded commits in one day, 10 Aug | Practised: Gate A, Gate C, `BUILD_STATUS.md` in the same commit | Holds |

---

## The test

> **A Skillsoft user Brad has authorized, not Brad, takes an account from a name to
> a researched baseline. The resulting record satisfies all four of these:**
>
> - every fact, and every pack entry it draws on, traces to a named source that a
>   named person opened;
> - each fact says whether it is published, client-stated, inferred or assumed;
> - each fact names the legal entity it is about;
> - where a fact could not be sourced, the record says why, and nothing was filled
>   in.

If research still depends on the author typing facts by hand, or a researched fact
cannot answer *who opened this, and what is it about*, the system is in 2.0
regardless of how many 3.0 items are ticked.

---

## The roster

Four bands. A and B are buildable now, in that order. C is the record. D waits for
a second real engagement and must not be built before one exists.

### Band A — access, as Brad decides it

#### 1. Access is granted, and the grant is a record

Brad decides who uses LVRF. Today a credential comes into existence when someone
with SSH runs `set_password.ts` on the box. The act is real, but **who authorized
the person is not recorded anywhere.**

- **A grant is an audited act** naming the person granted, who granted it and when.
  Revocation is the same, and revoking ends that person's sessions in the same
  transaction, as `set_password` already does.
- **No self-service.** No sign-up, no invitations a user can send. Access starts
  only from Brad's act.
- **Who may grant: Brad alone, with no delegates.** *[rev 3: DECIDED by Brad Piver,
  11 October 2026 (Q2); this was an open question.]* A grant or revocation is an
  audited act **whose actor must be Brad**. Nobody else can grant or revoke. So
  granting and revoking access belong on item 2's list of Brad-only acts, and are
  enforced by its one shared check.

#### 2. Which acts are Brad's alone

Some acts are governance, not use: accepting or excluding pack entries, retiring an
engagement, changing the ratification threshold, issuing a model version, granting
access. Today any signed-in vendor staff member can do all of them.

- **The list is DECIDED.** *[rev 3: decided by Brad Piver, 11 October 2026 (Q3);
  this was open.]* Brad-only acts are exactly:
  - grant or revoke access;
  - accept or exclude pack entries;
  - ratify or demote;
  - retire an engagement;
  - issue a model version;
  - change any stated threshold.

  Authorized users may research, record facts and evidence, walk outcomes, and
  produce and lock runs. The routes that perform each act, and the acts with no
  route yet, are mapped in the revision note at the top.

- Decide the list (*Open before ratification*), then enforce it through **one**
  shared check, the way P2a enforces same-origin. Make the wider reach
  unrepresentable, not checked per handler.
- *[rev 3: this replaced "This replaces the planned P3 tenant check as the next
  sign-in phase … The tenant check stays recorded as deferred".]* **P3 is built and
  deployed** (`75e92c3`, 11 October): every route answers for the actor's tenant
  through one helper, and a coverage guard fails any route without a tenant case.
  **This role check is the next sign-in phase after P3, not a replacement for it.**
  With one tenant the tenant check guards little today; the role check guards the
  governance acts. Both apply, through the same kind of single shared check.
- **P4 (basic_auth)** is decided after this item, not before. *[rev 3: on
  11 October basic_auth was kept for now, with a pre-removal list recorded in
  `BUILD_STATUS.md`. Whether to remove it is still decided after this item.]*

### Band B — research, accounts and packs

Order inside the band matters: 3 → 4 → 5 come before 6, because researching an
account before its entity, disclosure regime and trust vocabulary are fixed
produces facts that cannot be judged.

#### 3. The entity is pinned before anything is researched

**The Zachry lesson.** An institution gains an **entity record**: legal name, the
identifier that makes it unambiguous (SEC CIK, ticker, or a registry number), and
parent and affiliate relationships with their own evidence.

- A research result about a **different** entity is refused at parse, with the
  reason named. A result that does not say which entity it is about is not accepted
  as a fact about this one.
- Correcting an entity supersedes it. A locked run keeps the entity it was locked
  against. CVAF's open question (*a captured name since corrected*) is answered by
  supersession plus the run sealing its entity (item 10).

#### 4. The disclosure regime is an account property, read before the prompt runs

Filer status: **public filer, private, subsidiary of a filer, public sector.** It
sets the ceiling on what research can reach, so it is recorded first, with its
evidence.

- The account research prompt reads it and asks only for what that regime can
  publish. For a private company, a not-found on margin is **expected**, and the
  record says so rather than showing a gap that effort would close.
- That connects directly to the gap register's three states. *Structurally
  unobtainable by research* becomes computable per account rather than asserted.

#### 5. One trust vocabulary, before a third appears

LVRF already carries several partial answers to *how strong is this*: `evidence.kind`
(`public_filing`, `vendor_publication`, `attestation`, `system_export`...),
`source_verified`, `ai_sourced`, `citation_resolved`, the pack's four badge families,
and `evidence_class` for offerings. Account research is about to add a fifth
unless this is decided first.

- **Decide one basis vocabulary**, at minimum `published · client-stated ·
  inferred · assumed`, ordered, with `assumed` as the floor.
- **DERIVED, not stored.** *[rev 3: DECIDED by Brad Piver, 11 October 2026 (Q4); this
  was "decide whether it is derived or stored".]* The basis is computed from
  `evidence.kind`, plus `source_verified`, `ai_sourced`, `citation_resolved`,
  `simulated` and the attester where needed. Nothing is stored beside it, so there
  is nothing to drift.
- **The mapping, DECIDED by Brad Piver, 11 October 2026 (plan D2).** *[rev 3: this
  replaced a proposal with five flagged kinds.]* Five levels, strongest first:
  **system of record > published > client-stated > inferred > assumed** (the floor).
  The five-level order is a **product decision citing AMENDMENT-005**, not a new
  evidence class: the basis is derived and nothing new is stored (D11: no
  amendment). Rules are applied in order, and the first that matches decides:

  | # | Condition | Basis |
  |---|---|---|
  | 1 | `simulated = true` | **assumed**, always |
  | 2 | `ai_sourced = true` and `citation_resolved = false` | **assumed** until a person opens the citation, whatever the kind |
  | 3 | `system_export` | **system of record** (A) — the customer's own system, where the governing AI principle says actuals come from |
  | 4 | `public_filing` | **published** |
  | 5 | `attestation` **with** a non-simulated, customer-side `attested_by` and `attested_at` | **client-stated** (named person, dated) |
  | 6 | `attestation` without a customer-side attester | **assumed**: a vendor's report that the client said it |
  | 7 | `vendor_publication` | **published** for facts about the tenant itself; **inferred** for facts about a customer (C) |
  | 8 | `artifact` | **client-stated** with a customer-side attester; otherwise **inferred** (D) |
  | 9 | `observation` | **assumed**, unless it carries a source reference, then **inferred** (B). **Self-declared confidence never raises the basis** |
  | 10 | `assessment_result` | **outside the account-fact vocabulary — no basis** (E). A measurement of learners; its strength is the instrument's |

  `source_verified` does not raise the basis. It is the disclosure gate (Rule 6) and
  stays separate from it: a published figure can be unverified, and the record says
  both.
- **Published is not client-stated.** A figure from a 10-K is published. The same
  figure confirmed in a meeting with a named person is client-stated, and carries
  that person and date as its evidence. They are two facts, not one fact upgraded.
- This is a governance decision before it is a build. CVAF recorded its two
  vocabularies as *owed rather than decided*. LVRF decides before building.

#### 6. Account research intake

Extend the research pipeline that packs already use (generate prompt → a person
runs it → parse → accept or reject per field) to accounts. `research_results`
gains a third `result_kind`, `institution_fact`.

- **What it may research,** per AMENDMENT-005 Art. I: the baseline (revenue,
  headcount, stated priorities, systems, filer status, entity relationships) and the
  attach stage (which pack measures this account says matter). **Never** the
  measure or verify stages. Customer outcome values are in the customer's systems
  and no prompt will find them, which is the 30 August reversal. The prompt does not
  ask.
- **No hop left short.** Accepting a field writes the evidence row and the
  `institution_facts` row in one transaction, through the one existing writer, or it
  writes nothing. No clipboard export, and no "sent for governance" that wrote
  nothing.
- **Every accepted fact carries its period.** A fact's `as_of` is the date it
  describes. A citation's date is not the period (the 30 August DRR finding).
- **"Says it matters" is not ratification.** An account's 10-K naming a measure is
  evidence for attach and a `client-stated`/`published` signal on the pack entry. It
  never counts toward a pack's N = 2, which requires a system of record.
- **A rejection is kept.** *We researched this and rejected it* is a fact, as it is
  for packs.

#### 7. Total versus addressable

LVRF's version of Zachry's *$10B total, commercial on about half* is **the population a
capability touches**, not total headcount. Manager training reaches managers. A
time-to-productivity measure reaches new hires.

- `institution_facts` gains an addressable-population kind, which **must state its
  basis and exclusion**: *"people managers, from the 10-K workforce note; excludes
  hourly field staff."* No basis, no row. A CHECK, not a comment.
- Any computation that scales by population names which population it used.
  Headcount used where the addressable population was meant is the Hensel Phelps
  override in another form.

#### 8. Sources are entities

A source cited by many evidence rows, pack entries and account facts becomes one
record: publisher, title, published date, URL, **methodology** and **population
note**, plus its own confidence. Evidence rows cite it rather than restating it.

- **The population note is what makes a benchmark arguable rather than asserted.**
  A benchmark drawn from projects above $50M, applied to an account averaging $40M,
  must say so. CVAF found that voiding a benchmark (Fluor's reimbursable backlog) is
  a population judgment, and only a population field can carry it.
- Migrate by reference, not rewrite. Existing `provenance` text stays. New rows
  link a source, and old rows gain one when a person resolves them.

#### 9. One definition behind every pack prompt (recon first)

CVAF's pack lived in four places that disagreed, and the generate prompt had drifted
to describe a pack a fifth the size of the real one. LVRF's metric prompt is composed
from live rows. **Verify that the industry-measure prompt is too** and that the parser
validates against the same definition the prompt was built from. If either is
hand-written, fix it before account research adds a third prompt.

#### 10. A run renders from itself (recon first)

*[rev 3: recon done 11 October; see `BUILD_STATUS.md`, Fact supersession. Today
no account fact or pack entry is an input to `produceRun`'s payload. The payload
is a hashed snapshot, and record documents render from it, so a superseded fact
cannot change an old run. The item stands for the day item 6 or 7 makes facts
inputs: from then on the run must seal the fact ids and values it used. The
account name is still joined live on `GET /api/runs/:id`, which is item 3's
concern.]*

CVAF's 10 October fix: a locked run seals the account facts and pack ids it used, so
it renders identically after either changes. **Verify whether LVRF's locked run
payload carries the fact ids, entity and pack entry ids it was produced from.** If it
carries only computed values, a corrected fact or a demoted pack entry changes what
an old run appears to say, and its `payload_hash` cannot show it.

#### 11. Research reliability, measured

AMENDMENT-005 Art. V, recorded as *not built*. `ai_sourced` and `citation_resolved`
make it computable:

- **Citation resolution rate:** what share of AI-sourced citations survive a person
  opening them, per research tool.
- **Differential verification rate:** do AI-sourced items reach `source_verified`
  less often than human-gathered ones?
- **Entity mismatch rate**, new with item 3: how often research returns the wrong
  entity.

These are findings about the tooling, addressed to Brad, and they never touch an
account's score. If a tool resolves materially worse, the institution knows rather
than infers it.

#### 12. A human-derived oracle

CVAF's most valuable asset was the ZCC workshop baseline: an answer reached
independently, by people, from validated inputs, against which the app's output
could be checked. LVRF has none. Curia was built from published material.

- The first real engagement researched under item 6 should also have its baseline
  established **by hand, independently**, by the authorized user, and the two
  compared field by field. Agreement validates the research path. Disagreement says
  which side is wrong while it is still cheap.
- The hand-built side is read-only once compared, as CVAF's reference accounts are.

### Band C — the record

#### 13. Correction and re-checking, beyond facts

After the fact supersession writer (2.0's last item):

- **Verification after capture.** `source_verified` is set at capture or never.
  *I opened it later and it says this* is a separate dated, attributed act, for facts
  and outcome evidence alike.
- **`website` update path**, or fold `website` into the entity record (item 3).
- **Parse refusals on record.** A parser 422 leaves no trace today. Research at
  volume (item 6) makes this matter.

#### 14. Staleness and contradiction

- **Provenance decay.** A fact or measure whose newest evidence is older than its
  stated cadence is **stale**, and confidence says so. This is a model change, so it
  ships as a new model version.
- **Contradiction detection.** Two sources giving one account two revenues for the
  same period is a **finding**, addressed to whoever must resolve it. It never picks
  a winner. Depends on every fact carrying its period (item 6).

#### 15. Documentation derived from the system, and the PDF on the box

- `CONFIDENCE_MODEL.md` and `HEALTH_MODEL.md` reference sections generated from
  weights, CHECKs and trigger messages. Document-versus-system feeds self-drift.
- `render_record.py` reads from the API. WeasyPrint is installed on the VPS (fonts,
  then `fc-cache -f`), or rendering stays on the Mac by decision. The rendered bytes
  trace to the run's `payload_hash`. Every page of an unverified record carries the
  banner.

### Band D — on the trigger of a second real engagement

**Do not build before the trigger.** Listed so each is deferred, not quietly assumed.

- **16. Pack ratification, exercised.** `proposed` → `ratified` at N = 2, sourced
  from two institutions' systems of record, with the threshold in configuration.
  Demotion when sourcing is superseded. The threshold is not lowered.
- **17. The earned pack, `capability_metric_links`.** It still waits for an overlapping
  capability at a second real account.
- **18. Portfolio learning.** Its threshold is a stated value decided before anything is
  built. What it finds is `proposed`, and never raises a score. This is the `return`
  stage research AMENDMENT-005 permits.

---

## Order

```
2.0 tail   fact supersession writer (Skillsoft LVAF → LVRF)
3.0 A      1 → 2                     access granted; Brad's acts enforced
3.0 B      3 → 4 → 5 → 6             entity, regime, vocabulary, then account research
           9, 10                     recons; before 6 if either finds drift
           7, 8                      alongside 6
           11, 12                    with the first real account researched under 6
3.0 C      13, 14, 15                as engagements need them; 14 after 6
3.0 D      16, 17, 18                only on a second real engagement
```

---

## Not in 3.0

- **Customer sign-in, of any kind.** Customers are recorded, never users. Their
  confirmations are entered by an authorized user and carry their own evidence
  (meeting, date, document), as CVAF's *John Berger confirmed three of six levers
  face to face, 15 July* did.
- **Multi-tenancy.** One tenant. *[rev 3: was "The tenant check is deferred, not
  dropped". The tenant check is built (P3, `75e92c3`). What stays out is
  multi-tenancy beyond it: onboarding a second tenant, and cross-tenant
  administration.]*
- **Financial modelling**, unless gated by confidence and rendering its refusal
  below threshold (carried from 1.2).
- **Anything learner-facing.**
- **Dashboards** without an argument.
- **Automation that manufactures confidence:** AI suggesting a data class, inferring
  an industry, proposing a confidence level, choosing the entity, or picking the
  winner of a contradiction.
- **Tailwind 4.** A chore with its own regression pass.

### Further candidates, not yet committed

- **System-of-record integrations.** Reading an actual from a customer's HRIS is a
  provenance gain. The number still comes from their system. Consider it per
  customer, when one asks.

---

## Conflicts named in revision 3

This draft says `CLAUDE.md` wins wherever they disagree, and that the conflict is
named. These are the ones found on 11 October:

1. **AMENDMENT-005 is relied on but not listed as in force.** This draft treats it
   as in force throughout: the disciplines table, the lessons, items 6 and 11. The
   Cathedral marks it `status: Canonical`, and code has implemented its evidence
   columns since migration 0002. But `CLAUDE.md`'s *Amended and in force* list
   names only AMENDMENT-001 to 004. Until `CLAUDE.md` lists it, `CLAUDE.md`'s list
   is the authority, and the conflict stands. *[rev 3: RESOLVED by decision D7,
   Brad Piver, 11 October 2026: AMENDMENT-005 is added to `CLAUDE.md`'s in-force
   list, in the hygiene batch's docs commit.]*
2. **The working convention requires a value-spine stage for every feature.**
   `CLAUDE.md` says: *"Before proposing a feature, name which value spine stage it
   serves. If none, it is out of scope."* Items 3, 4, 6 and 7 name or imply
   `baseline`/`attach`. Items 1, 2, 5, 8, 9, 11 and 15 name none. Each needs a stage
   (or *cross-cutting*, with its reason) before ratification. *[rev 3: RESOLVED by
   decision D8, Brad Piver, 11 October 2026: baseline — 3, 4, 6, 7, 8; attach — 9;
   measure/verify — 10; verify — 12, 13; measure — 14; return — 15; cross-cutting
   — 1, 2 (Band A, as built), 5 (the evidence basis) and 11 (tooling
   reliability).]*
3. **The `BUILD_STATUS.md` amendment table is stale.** This confirms open item 5
   below. Its row reads *"AMENDMENT-004 — Pack as Cathedral canonical object — Not
   drafted"*, and the line after it says *"All three ratified amendments"*.
   `CLAUDE.md` (A11) and the Cathedral record AMENDMENT-004 as the UI semantic
   palette, ratified and implemented. `BUILD_STATUS.md` is the stale side; it is
   not edited by this revision. *[rev 3: fixed in `BUILD_STATUS.md` by the hygiene
   batch (L21).]*
4. **Overtaken by the build, and corrected above:** P3 deferred (items 2 and *Not in
   3.0*), and the item 10 recon. Nothing in revision 3 changes `CLAUDE.md`.

---

## Open before ratification

1. **Rule76 doctrine.** Provenance, Truth and Governance are not excavated in the
   Cathedral (Governance Doctrine Index; Governed Truth Register). Does a source
   for them exist outside the repos, such as the Rule76 Canon manuscript or the
   *Intelligent Commercial OS* canon CVAF cites, that should be excavated before or
   alongside 3.0? Until then the table above is a working statement, not a citation.
2. ~~**Who may grant access:** Brad alone, or Brad plus named delegates?~~
   **DECIDED by Brad Piver, 11 October 2026: Brad alone, no delegates.** A grant
   or revocation is an audited act whose actor must be Brad, and it is on item 2's
   list. *[rev 3]*
3. ~~**Which acts are Brad's alone** (item 2).~~ **DECIDED by Brad Piver,
   11 October 2026**, as proposed below. The route map is in the revision note.
   *[rev 3]* The proposal as written: grant/revoke access; accept or
   exclude pack entries; ratify or demote; retire an engagement; issue a model
   version; change any stated threshold. Authorized users research, record facts and
   evidence, walk outcomes, produce and lock runs.
4. ~~**The basis vocabulary** (item 5): derived from `evidence.kind`, or stored?~~
   **DECIDED by Brad Piver, 11 October 2026: DERIVED** from `evidence.kind`, plus
   `source_verified` / `ai_sourced` (and `citation_resolved`, `simulated`, the
   attester) where needed. Not stored. *[rev 3]* **The mapping is DECIDED too (plan
   D2, Brad Piver, 11 October 2026):** five levels, system of record > published >
   client-stated > inferred > assumed; see item 5. Not built.
5. ~~**`AMENDMENT-004` drift.**~~ *[rev 3: fixed — `BUILD_STATUS.md`'s table now
   reads UI semantic palette, ratified (hygiene batch, L21).]*
6. ~~**Does account research need an amendment?**~~ **DECIDED by Brad Piver,
   11 October 2026 (plan D11): no amendment** for the entity record (product
   schema) or the vocabulary (derived; no new stored class). *[rev 3]*
7. **`record_documents` stays provisional** until the Repository Constitution
   ratifies. That is acceptable while no record leaves Skillsoft. Restate it if one
   does.
8. **Where does research run: LVRF's own pipeline, or Compass OS?** *[rev 3: added.
   Open since 2.0 item 5, 30 August.]* Compass OS's boundary claims Deep Research as
   substrate (HB-0010's producer is Compass). LVRF building its own risks the
   three-copies-diverge failure the Studios architecture exists to prevent. **Must be
   decided before item 6.** **DECIDED by Brad Piver, 11 October 2026 (plan D1):**
   research runs in **LVRF's own pipeline now, behind a declared seam** — one module
   boundary for research intake — and **migrates to Compass OS once Compass exists
   as code.** `CLAUDE.md` names the research-intake module as a Compass seam. *[rev 3]*
9. **The first real account for item 6, with an independent hand-built baseline
   (item 12).** *[rev 3: added; plan D13.]* **Open, pending Brad.** Recommended: the
   first real Skillsoft engagement an authorized user is working — not Curia, a
   read-only reference built from published material — with the hand-built baseline
   done before the research runs. **Blocks item 6 only.**
