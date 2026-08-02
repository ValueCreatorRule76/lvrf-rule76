// Truth table for the evidentiary basis gate. Run: node --experimental-strip-types <file>
import { assertEvidentiaryBasis, requireEvidentiaryBasis, EvidentiaryBasisRefusal } from '../evidentiaryBasis.ts';

// access defaults 'confirmed' so pre-0009 cases keep testing what they were
// built to test (evidence_class / soft-delete) without the access dimension
// silently flipping their expected outcome. Cases that DO test access pass
// it explicitly. evidenceCollected is a basis-level fact, passed on the
// basis object itself, not per-offering — see the gate's docstring on why.
const o = (key, evidenceClass, { deletedAt = null, evidenceAccess = 'confirmed' } = {}) =>
  ({ offeringId: key, offeringKey: key, name: key, evidenceClass, evidenceAccess, deletedAt });

const cap = (deletedAt = null) => ({ id: 'cap_1', deletedAt });

const basis = (offerings, { capability = cap(), evidenceCollected = false } = {}) =>
  ({ capability, offerings, evidenceCollected });

const DELETED_AT = '2026-01-01T00:00:00Z';

const cases = [
  ['empty basis',                        basis([]),                                                            false, ['NO_OFFERING_ATTACHED']],
  ['consumption only',                   basis([o('content_marketplace','consumption')]),                      false, ['NON_EVIDENTIAL_BASIS_ONLY']],
  ['enabler only',                       basis([o('lx_design_studio','none')]),                                false, ['NON_EVIDENTIAL_BASIS_ONLY']],
  ['enabler + consumption',              basis([o('lx','none'), o('cm','consumption')]),                       false, ['NON_EVIDENTIAL_BASIS_ONLY']],
  ['floor not average: 1 good + 2 bad',  basis([o('caisy','demonstrated'), o('lx','none'), o('cm','consumption')]), true, null],
  ['Use A basis (CAISY + 1:1)',          basis([o('caisy','demonstrated'), o('coach','demonstrated')]),        true, null],
  ['Use B basis (Compliance + ILT)',     basis([o('compliance','assessed'), o('gk_ilt','assessed')]),          true, null],
  ['applied clears',                     basis([o('x','applied')]),                                            true, null],
  // Soft-deleted offering checked ahead of evidence class — data integrity outranks evidence quality.
  ['soft-deleted alone',                 basis([o('retired_x','demonstrated',{deletedAt:DELETED_AT})]),        false, ['SOFT_DELETED_OFFERING_IN_BASIS']],
  ['soft-deleted + qualifying',          basis([o('retired_x','demonstrated',{deletedAt:DELETED_AT}), o('caisy','demonstrated')]), false, ['SOFT_DELETED_OFFERING_IN_BASIS']],
  ['soft-deleted + consumption-only',    basis([o('retired_x','demonstrated',{deletedAt:DELETED_AT}), o('cm','consumption')]), false, ['SOFT_DELETED_OFFERING_IN_BASIS']],
  // Capability checked BEFORE offerings, unconditionally — "regardless of what is attached".
  ['capability deleted alone',                       basis([], {capability: cap(DELETED_AT)}),                 false, ['NO_OFFERING_ATTACHED','SOFT_DELETED_CAPABILITY_IN_BASIS']],
  ['capability deleted + qualifying offerings',       basis([o('caisy','demonstrated')], {capability: cap(DELETED_AT)}), false, ['SOFT_DELETED_CAPABILITY_IN_BASIS']],
  ['capability deleted + soft-deleted offering (reports BOTH, capability first)',
                                                       basis([o('retired_x','demonstrated',{deletedAt:DELETED_AT})], {capability: cap(DELETED_AT)}), false, ['SOFT_DELETED_CAPABILITY_IN_BASIS','SOFT_DELETED_OFFERING_IN_BASIS']],
  // 0009 — engagement evidence beats the catalog prior; the prior governs only in its absence.
  ['engagement evidence present + prior unconfirmed — must PASS (fact beats prior)',
                                                       basis([o('caisy','demonstrated',{evidenceAccess:'unconfirmed'})], {evidenceCollected: true}), true, null],
  ['no evidence + prior unconfirmed — must REFUSE',
                                                       basis([o('caisy','demonstrated',{evidenceAccess:'unconfirmed'})], {evidenceCollected: false}), false, ['NO_COLLECTED_EVIDENCE_UNCONFIRMED_ACCESS']],
  ['no evidence + prior confirmed — must PASS (prior governs in evidence\'s absence)',
                                                       basis([o('caisy','demonstrated',{evidenceAccess:'confirmed'})], {evidenceCollected: false}), true, null],
  ['no evidence + prior denied — must REFUSE, distinct wording from unconfirmed',
                                                       basis([o('caisy','demonstrated',{evidenceAccess:'denied'})], {evidenceCollected: false}), false, ['NO_COLLECTED_EVIDENCE_UNCONFIRMED_ACCESS']],
  ['two independent failures both reported: non-evidential AND uncollected/unconfirmed, neither rescues the other',
                                                       basis([o('lx','none'), o('caisy','demonstrated',{evidenceAccess:'unconfirmed'})], {evidenceCollected: false}), false, ['NO_COLLECTED_EVIDENCE_UNCONFIRMED_ACCESS','NON_EVIDENTIAL_BASIS_ONLY']],
];

let fails = 0;
console.log('\n  EVIDENTIARY BASIS GATE — truth table');
console.log('  ' + '-'.repeat(72));
for (const [label, b, expectOk, expectConditions] of cases) {
  const r = assertEvidentiaryBasis(b);
  let pass, got;
  if (expectOk) {
    pass = r.ok === true;
    got = 'pass';
  } else {
    const actual = r.ok ? [] : r.conditions.map(c => c.condition);
    pass = r.ok === false
      && actual.length === expectConditions.length
      && actual.every((c, i) => c === expectConditions[i]);
    got = r.ok ? 'pass (WRONG)' : actual.join('+');
  }
  if (!pass) fails++;
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${label.padEnd(80)} -> ${got}`);
}
console.log('  ' + '-'.repeat(72));

// A refusal must always explain itself, on every condition it carries.
const refusal = assertEvidentiaryBasis(basis([o('cm','consumption')]));
const explains = !refusal.ok
  && refusal.conditions.length === 1
  && refusal.conditions[0].reason.length > 40
  && refusal.offered.length === 1;
if (!explains) fails++;
console.log(`  ${explains ? 'PASS' : 'FAIL'}  refusal names its reason(s) and what it saw`);

// The 'denied' and 'unconfirmed' wording must actually differ, even though
// both map to the same condition type.
const deniedR = assertEvidentiaryBasis(basis([o('x','demonstrated',{evidenceAccess:'denied'})], {evidenceCollected:false}));
const unconfR = assertEvidentiaryBasis(basis([o('x','demonstrated',{evidenceAccess:'unconfirmed'})], {evidenceCollected:false}));
const wordingDiffers = !deniedR.ok && !unconfR.ok
  && deniedR.conditions[0].reason.includes('DENIED')
  && unconfR.conditions[0].reason.includes('never confirmed retrievable');
if (!wordingDiffers) fails++;
console.log(`  ${wordingDiffers ? 'PASS' : 'FAIL'}  denied vs unconfirmed prior read differently in the reason text`);

// EvidentiaryBasisRefusal must carry the full conditions array, not just one.
let threw = null;
try {
  requireEvidentiaryBasis(basis([o('lx','none'), o('caisy','demonstrated',{evidenceAccess:'unconfirmed'})], {evidenceCollected:false}));
} catch (e) { threw = e; }
const throwsCorrectly = threw instanceof EvidentiaryBasisRefusal
  && threw.conditions.length === 2
  && threw.conditions.map(c => c.condition).join('+') === 'NO_COLLECTED_EVIDENCE_UNCONFIRMED_ACCESS+NON_EVIDENTIAL_BASIS_ONLY';
if (!throwsCorrectly) fails++;
console.log(`  ${throwsCorrectly ? 'PASS' : 'FAIL'}  requireEvidentiaryBasis throws with all conditions carried`);

const total = cases.length + 3;
console.log(`  ${'-'.repeat(72)}\n  RESULT: ${fails === 0 ? `${total}/${total} PASS` : `${fails} FAILURE(S)`}\n`);
process.exit(fails ? 1 : 0);
