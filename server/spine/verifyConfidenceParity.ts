import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { computeConfidence, evidenceCredit, fixtureEvidenceToInput, type ConfidenceLevel } from './confidenceModel.js';
import type { CustomerZeroFixture } from './fixture.js';

/**
 * db/CONFIDENCE_MODEL.md's acceptance test: the TypeScript model must
 * reproduce records/simulate_spine.py exactly. Reads both fixtures directly
 * — no database, no seeding — because the assertion is about the arithmetic
 * and the gate, not about a full customer_b walk (which nothing in this
 * codebase wires up yet; only customer_zero has a seed/walk path).
 *
 * The realization and disclosure checks use the SAME evidenceCredit /
 * fixtureEvidenceToInput functions server/spine/walkSpine.ts calls — one
 * gate implementation, not a second one reproduced here. That duplication is
 * exactly what let the two implementations disagree the first time this
 * test was written, silently, on the highest-stakes rule in the system
 * (whether a record may be shown to a customer).
 *
 * If a number here does not match, one implementation is wrong. Do not
 * adjust the expected values to fit — CONFIDENCE_MODEL.md is explicit that
 * these figures are cited in BUILD_STATUS.md, printed on two rendered
 * records, and quoted in the Skillsoft discovery agenda.
 */

interface Expectation {
  file: string;
  score: number;
  band: ConfidenceLevel;
  realization: 'measured' | 'verified';
  disclosure: 'internal' | 'customer_shared';
}

const EXPECTATIONS: Expectation[] = [
  { file: '../../records/customer_zero.json', score: 30.0, band: 'low', realization: 'measured', disclosure: 'internal' },
  { file: '../../records/customer_b.json', score: 80.0, band: 'high', realization: 'verified', disclosure: 'customer_shared' },
];

/**
 * Mirrors server/spine/walkSpine.ts STAGE 6 exactly: ANY actual-supporting
 * evidence item with credit > 0, and a non-synthetic verifier. Disclosure
 * follows realization the same way walkSpine.ts's STAGE 7 does.
 */
function computeRealization(fixture: CustomerZeroFixture): 'measured' | 'verified' {
  const actualEvidence = fixture.evidence.filter((e) => e.supports === 'actual');
  const anyVerified =
    actualEvidence.length > 0 && actualEvidence.some((e) => evidenceCredit(fixtureEvidenceToInput(fixture, e)).credit > 0);
  const verifierSynthetic = fixture.persons.verifier.synthetic;
  return anyVerified && !verifierSynthetic ? 'verified' : 'measured';
}

async function loadFixtureAt(relativePath: string): Promise<CustomerZeroFixture> {
  const path = fileURLToPath(new URL(relativePath, import.meta.url));
  const raw = await readFile(path, 'utf-8');
  return JSON.parse(raw) as CustomerZeroFixture;
}

async function main() {
  let failed = false;

  for (const expectation of EXPECTATIONS) {
    const fixture = await loadFixtureAt(expectation.file);
    const bm = fixture.business_metric;
    const vo = fixture.value_outcome;

    const confidence = computeConfidence({
      metricDefinitionConfirmed: bm.calculation_confirmed,
      evidence: fixture.evidence.map((e) => fixtureEvidenceToInput(fixture, e)),
      claimedCurrencyImpact: vo.claimed_currency_impact,
      realizedCurrencyImpact: vo.realized_currency_impact,
      impactBasisStated: Boolean(vo.impact_basis),
      impactIsInference: vo.impact_is_inference,
      sponsorName: fixture.persons.sponsor.name,
      verifierName: fixture.persons.verifier.name,
      assertedConfidence: vo.confidence,
    });
    const realization = computeRealization(fixture);
    const disclosure = realization === 'verified' ? 'customer_shared' : 'internal';

    const scoreOk = confidence.score === expectation.score;
    const bandOk = confidence.band === expectation.band;
    const realizationOk = realization === expectation.realization;
    const disclosureOk = disclosure === expectation.disclosure;
    const ok = scoreOk && bandOk && realizationOk && disclosureOk;
    if (!ok) failed = true;

    console.log(`${fixture.run.label}`);
    console.log(
      `  score       ${confidence.score.toFixed(1)}  (expected ${expectation.score.toFixed(1)})  ${scoreOk ? 'OK' : 'MISMATCH'}`,
    );
    console.log(`  band        ${confidence.band}  (expected ${expectation.band})  ${bandOk ? 'OK' : 'MISMATCH'}`);
    console.log(
      `  realization ${realization}  (expected ${expectation.realization})  ${realizationOk ? 'OK' : 'MISMATCH'}`,
    );
    console.log(
      `  disclosure  ${disclosure}  (expected ${expectation.disclosure})  ${disclosureOk ? 'OK' : 'MISMATCH'}`,
    );
    if (!ok) {
      console.log('  factor breakdown:');
      for (const f of confidence.factors) {
        console.log(`    ${f.factor.padEnd(28)} ${f.earned}/${f.weight}  ${f.note}`);
      }
    }
    console.log();
  }

  if (failed) {
    console.error('Confidence model parity FAILED — one implementation disagrees with the reference. Do not adjust the expected values.');
    process.exitCode = 1;
  } else {
    console.log('Confidence model parity OK for both fixtures.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
