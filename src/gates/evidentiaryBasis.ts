/**
 * NOT WIRED. As of 2026-08-02 this gate has no caller. walkSpine.ts does not
 * invoke it and render_record.py cannot see its result. The 22 passing tests
 * prove the logic, not that anything is protected by it. Every refusal
 * described below is currently hypothetical. Do not read the presence of this
 * file as evidence that an unverifiable outcome cannot be rendered as verified
 * — today it can.
 *
 * LVRF — Evidentiary Basis Gate
 *
 * ┌────────────────────────────────────────────────────────────────────┐
 * │  DO NOT LET COPILOT AUTOCOMPLETE THIS AWAY.                        │
 * │  This is a constitutional refusal, not a validation helper.        │
 * │  It belongs beside the `customer_shared` disclosure refusal and    │
 * │  is enforced the same way, for the same reason.                    │
 * └────────────────────────────────────────────────────────────────────┘
 *
 * THE RULE
 *   An offering whose evidence_class is 'none' or 'consumption' may not be
 *   the sole evidentiary basis for a value_outcome advanced to 'verified'.
 *   Separately: value_outcomes.capability_id is a single NOT NULL reference
 *   (checked against schema.ts — a value outcome is value OF exactly one
 *   capability, never several), so the capability is a property of the call,
 *   not of any one offering. If that capability is soft-deleted, the whole
 *   basis is void regardless of what offerings are attached.
 *
 * HOW EVIDENCE ACTUALLY ATTACHES (checked against schema.ts before this
 * revision, because the first version of this gate got it backwards)
 *   value_outcomes -> value_outcome_evidence -> evidence -> (optionally,
 *   evidence.assessment_id, nullable) -> assessments -> capability_id.
 *   Evidence has NO offering_id, and assessments have NO offering_id either
 *   — capabilities reach offerings only through the many-to-many
 *   offering_capabilities junction. So evidence cannot be traced to a
 *   SPECIFIC offering; it can only be traced to the value_outcome as a
 *   whole (directly) and loosely to a capability (only when
 *   evidence.assessment_id is set, which it need not be). That is a schema
 *   gap, and it changes the shape of this gate: "has evidence actually been
 *   collected" is a fact about the OUTCOME, not about any one attached
 *   offering, and it applies uniformly to every offering in the basis.
 *
 * 0009 — CATALOG PRIOR vs. ENGAGEMENT FACT (the fix; my own prior version
 * of this gate committed the error it now guards against)
 *   evidence_access is a CATALOG-LEVEL PRIOR about a product — "has this
 *   offering's evidence ever been confirmed retrievable, in general." It is
 *   not a fact about THIS engagement. Treating it as one — refusing an
 *   outcome because the catalog says 'unconfirmed' when real evidence was
 *   actually collected for this outcome — lets a prior override a fact,
 *   which is exactly backwards. The rule:
 *     An offering (evidence_class above consumption) qualifies if EITHER
 *       (a) evidence was actually collected for this outcome, regardless
 *           of the catalog prior — engagement evidence beats the prior; OR
 *       (b) no engagement evidence exists at all AND evidence_access is
 *           'confirmed' — the prior governs ONLY in evidence's absence.
 *   Because evidence-collected is an outcome-level fact (see above), (a)
 *   and (b) are evaluated once for the whole basis, not per offering.
 *
 * WHY THIS IS NOT A CHECK CONSTRAINT
 *   The rule spans three tables — value_outcomes, offering_capabilities,
 *   and offerings. A row-level CHECK can only see the row it is attached to.
 *   Postgres cannot express "every offering reachable from this outcome is
 *   non-evidential" without a trigger holding a subquery, and a trigger that
 *   silently rewrites or blocks a write is exactly the opaque behaviour this
 *   framework exists to refuse. The refusal belongs where a human can read
 *   it in the response.
 *
 * WHY IT TESTS THE FLOOR, NOT THE AVERAGE
 *   One qualifying offering is sufficient to pass. The gate asks whether ANY
 *   real capability evidence exists — not whether most of it is good. A
 *   Compliance Suite outcome is not weakened by also having Content
 *   Marketplace attached; it is simply not carried BY Content Marketplace.
 *
 * WHY IT RETURNS EVERY FAILING CONDITION, NOT THE FIRST
 *   A refusal that stops at the first problem hides how many things are
 *   actually wrong. A basis can fail data integrity AND evidence/access AND
 *   evidence class simultaneously — each is independent, and a human
 *   deciding what to fix first needs to see all of them, ordered
 *   most-severe first: data integrity, then evidence/access, then class.
 *
 * WHAT THIS GATE DOES NOT DO
 *   It does not refuse Use A (Skillsoft measuring its own sellers) on
 *   evidence_class grounds — both CAISY and 1:1 Coaching are 'demonstrated'.
 *   Its refusal must come from the metric side — vendor-reported metric,
 *   undisclosed definition, `customer_system` verification unsatisfiable
 *   when the vendor is the institution — OR from no engagement evidence
 *   existing alongside an unconfirmed catalog prior.
 */

export type EvidenceClass =
  | 'none' | 'consumption' | 'assessed' | 'demonstrated' | 'applied';

export type EvidenceAccess = 'unconfirmed' | 'confirmed' | 'denied';

/** Classes that cannot carry a verified outcome on their own. */
const NON_EVIDENTIAL: ReadonlySet<EvidenceClass> = new Set(['none', 'consumption']);

export interface AttachedOffering {
  offeringId: string;
  offeringKey: string;
  name: string;
  evidenceClass: EvidenceClass;
  /**
   * 0008. The CATALOG PRIOR: whether this offering's evidence artifacts
   * have EVER been confirmed retrievable, in general. NOT a fact about this
   * engagement — see EvidentiaryBasis.evidenceCollected for that. Consulted
   * only when no engagement evidence exists at all; a confirmed engagement
   * fact always beats an unconfirmed prior, and an unconfirmed prior never
   * overrides a confirmed engagement fact.
   */
  evidenceAccess: EvidenceAccess;
  /**
   * Null unless the offering is soft-deleted. No read convention in this
   * repo filters deleted_at yet (checked: zero references anywhere in
   * server/ or src/ as of this writing), so this gate cannot assume its
   * caller already excluded retired rows — it has to check for itself.
   */
  deletedAt: string | null;
}

export interface AttachedCapability {
  id: string;
  /**
   * Null unless the capability is soft-deleted. db/prove_0005_constraints.sql
   * test 12 confirmed this UPDATE succeeds today with nothing blocking it —
   * capabilities_no_delete only guards hard DELETE, not a write that merely
   * sets deleted_at — so this gate cannot assume that state never arises.
   */
  deletedAt: string | null;
}

export type BasisCondition =
  | 'NO_OFFERING_ATTACHED'
  | 'SOFT_DELETED_CAPABILITY_IN_BASIS'
  | 'SOFT_DELETED_OFFERING_IN_BASIS'
  | 'NO_COLLECTED_EVIDENCE_UNCONFIRMED_ACCESS'
  | 'NON_EVIDENTIAL_BASIS_ONLY';

/** Most-severe first. */
const SEVERITY: Record<BasisCondition, number> = {
  NO_OFFERING_ATTACHED: -1,
  SOFT_DELETED_CAPABILITY_IN_BASIS: 0,
  SOFT_DELETED_OFFERING_IN_BASIS: 1,
  NO_COLLECTED_EVIDENCE_UNCONFIRMED_ACCESS: 2,
  NON_EVIDENTIAL_BASIS_ONLY: 3,
};

export interface ConditionFailure {
  condition: BasisCondition;
  reason: string;
}

export type BasisResult =
  | { ok: true; qualifying: AttachedOffering[] }
  | { ok: false; conditions: ConditionFailure[]; offered: AttachedOffering[] };

export interface EvidentiaryBasis {
  capability: AttachedCapability;
  offerings: AttachedOffering[];
  /**
   * Whether ANY evidence has actually been collected for THIS value_outcome
   * (i.e. value_outcome_evidence rows exist for it). A fact about the whole
   * outcome, not about any one attached offering — schema.ts gives evidence
   * no offering_id, so it cannot be attributed more narrowly than this. See
   * the module docstring's "HOW EVIDENCE ACTUALLY ATTACHES" for why.
   */
  evidenceCollected: boolean;
}

/**
 * Decide whether the attached offerings can carry a verified value outcome.
 *
 * A refusal ALWAYS names every failing condition and the offerings it saw —
 * not just the first. A refusal that does not say why is worthless to a CFO
 * — and a document that renders "VERIFIED" without a basis is worse than no
 * document.
 */
export function assertEvidentiaryBasis(basis: EvidentiaryBasis): BasisResult {
  const { capability, offerings: attached, evidenceCollected } = basis;
  const conditions: ConditionFailure[] = [];

  // The capability is singular for the whole call (value_outcomes.capability_id
  // is a single NOT NULL FK): "regardless of what is attached" means exactly
  // that — computed unconditionally, first, even against zero offerings,
  // rather than short-circuited by the empty-offerings check below.
  if (capability.deletedAt !== null) {
    conditions.push({
      condition: 'SOFT_DELETED_CAPABILITY_IN_BASIS',
      reason:
        `Capability ${capability.id} is soft-deleted (deleted_at ${capability.deletedAt}). ` +
        'A value outcome is value OF exactly one capability — if that capability is retired, ' +
        'the whole basis is void regardless of what offerings are attached. Soft-deleting a ' +
        'capability succeeds today (only hard DELETE is guarded, by capabilities_no_delete), ' +
        'so this cannot be assumed away.',
    });
  }

  // Nothing further to compute against an empty array — but the capability
  // condition above (if any) is still carried through, not discarded.
  if (attached.length === 0) {
    conditions.push({
      condition: 'NO_OFFERING_ATTACHED',
      reason:
        'No offering is attached to this outcome. A value outcome cannot be ' +
        'verified without naming what produced the capability change.',
    });
    conditions.sort((a, b) => SEVERITY[a.condition] - SEVERITY[b.condition]);
    return { ok: false, conditions, offered: [] };
  }

  // Data-integrity failure, checked independently of evidence quality. No
  // read convention in this repo filters deleted_at yet, so this gate is the
  // only thing standing between a retired offering and a verified outcome.
  // Reported even when a qualifying offering is ALSO attached: a good
  // offering next to it does not launder a soft-deleted one out of the basis.
  const softDeleted = attached.filter(o => o.deletedAt !== null);
  if (softDeleted.length > 0) {
    const listed = softDeleted
      .map(o => `${o.name} (deleted_at ${o.deletedAt})`)
      .join(', ');
    conditions.push({
      condition: 'SOFT_DELETED_OFFERING_IN_BASIS',
      reason:
        `${softDeleted.length} attached offering(s) are soft-deleted: ${listed}. ` +
        'A retired row was created in error and cannot be the basis for a verified ' +
        'value outcome — remove it from the basis rather than resolving this by ' +
        'evidence class.',
    });
  }

  // Floor, not average: one offering that is evidential-class AND (either
  // engagement evidence was actually collected, OR — only in its absence —
  // the catalog prior says confirmed) is sufficient. Engagement evidence is
  // an outcome-level fact (see EvidentiaryBasis.evidenceCollected), so it
  // applies identically to every offering here; it is not re-checked per
  // offering because the schema cannot attribute it more narrowly.
  const qualifying = attached.filter(o => {
    if (NON_EVIDENTIAL.has(o.evidenceClass)) return false;
    return evidenceCollected || o.evidenceAccess === 'confirmed';
  });

  if (qualifying.length === 0) {
    const nonEvidential = attached.filter(o => NON_EVIDENTIAL.has(o.evidenceClass));
    // Only reachable when evidenceCollected is false — if it were true every
    // evidential-class offering above would already qualify.
    const uncollectedUnconfirmed = attached.filter(
      o => !NON_EVIDENTIAL.has(o.evidenceClass) && o.evidenceAccess !== 'confirmed',
    );

    if (uncollectedUnconfirmed.length > 0) {
      const listed = uncollectedUnconfirmed
        .map(o => {
          const priorNote = o.evidenceAccess === 'denied'
            ? 'catalog prior: access confirmed DENIED'
            : 'catalog prior: never confirmed retrievable';
          return `${o.name} (${o.evidenceClass}; ${priorNote})`;
        })
        .join(', ');
      conditions.push({
        condition: 'NO_COLLECTED_EVIDENCE_UNCONFIRMED_ACCESS',
        reason:
          `No evidence has actually been collected for this outcome, and the catalog ` +
          `prior does not confirm access for the offering(s) that could otherwise carry ` +
          `it: ${listed}. This is not the same refusal for every offering listed: an ` +
          `'unconfirmed' prior means "we never confirmed it was retrievable" — genuinely ` +
          `unknown, someone should go check. A 'denied' prior means access was confirmed ` +
          `unavailable — it was sought and refused, not merely unproven. Either way, ` +
          `evidence_class describes what an offering could emit in principle; neither ` +
          `collecting real evidence nor confirming the prior happened here.`,
      });
    }

    if (nonEvidential.length > 0) {
      const listed = nonEvidential
        .map(o => `${o.name} (${o.evidenceClass})`)
        .join(', ');
      conditions.push({
        condition: 'NON_EVIDENTIAL_BASIS_ONLY',
        reason:
          `${nonEvidential.length} attached offering(s) emit consumption evidence or none ` +
          `at all: ${listed}. Consumption is not a derivation. This outcome may be ` +
          'recorded, but it may not be advanced to verified on this basis.',
      });
    }
  }

  if (conditions.length > 0) {
    conditions.sort((a, b) => SEVERITY[a.condition] - SEVERITY[b.condition]);
    return { ok: false, conditions, offered: attached };
  }

  return { ok: true, qualifying };
}

/**
 * Convenience wrapper for the verify route. Throws a typed refusal so the
 * handler surfaces every failing condition rather than a generic 400.
 */
/**
 * Note: explicit fields, NOT TypeScript parameter properties.
 * Parameter properties require type *transformation*; strip-only runtimes
 * (node --experimental-strip-types, tsx) throw
 * ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX on them. Verified on Node 22.22.
 */
export class EvidentiaryBasisRefusal extends Error {
  readonly conditions: ConditionFailure[];
  readonly offered: AttachedOffering[];

  constructor(conditions: ConditionFailure[], offered: AttachedOffering[]) {
    super(conditions.map(c => `[${c.condition}] ${c.reason}`).join(' | '));
    this.name = 'EvidentiaryBasisRefusal';
    this.conditions = conditions;
    this.offered = offered;
  }
}

export function requireEvidentiaryBasis(basis: EvidentiaryBasis): AttachedOffering[] {
  const result = assertEvidentiaryBasis(basis);
  if (!result.ok) {
    throw new EvidentiaryBasisRefusal(result.conditions, result.offered);
  }
  return result.qualifying;
}
