import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { computeConfidence, evidenceCredit, fixtureEvidenceToInput, type ConfidenceLevel } from './confidenceModel.js';
import { computeDelta } from './deltaEngine.js';
import type { CustomerZeroFixture } from './fixture.js';

/**
 * Two acceptance tests against the retired Python: db/CONFIDENCE_MODEL.md's
 * confidence/gate arithmetic, and db/DELTA_AND_PROVENANCE.md's delta engine.
 * Reads both fixtures directly — no database, no seeding — because the
 * assertion is about the arithmetic and the gate, not about a full
 * customer_b walk (which nothing in this codebase wires up yet; only
 * customer_zero has a seed/walk path).
 *
 * The realization and disclosure checks use the SAME evidenceCredit /
 * fixtureEvidenceToInput functions server/spine/walkSpine.ts calls — one
 * gate implementation, not a second one reproduced here. That duplication is
 * exactly what let the two implementations disagree the first time this
 * test was written, silently, on the highest-stakes rule in the system
 * (whether a record may be shown to a customer).
 *
 * If a number here does not match, one implementation is wrong. Do not
 * adjust the expected values to fit — both spec files are explicit that
 * these figures are cited in BUILD_STATUS.md, printed on two rendered
 * records, and quoted in the Skillsoft discovery agenda.
 */

interface DeltaExpectation {
  raw: number;
  improved: boolean;
  targetMet: boolean;
  pctOfTarget: number;
  gap: number;
  shareOfClaim: number;
  punctualityDays: number;
  onTime: boolean;
}

interface Expectation {
  file: string;
  score: number;
  band: ConfidenceLevel;
  realization: 'measured' | 'verified';
  disclosure: 'internal' | 'customer_shared';
  delta: DeltaExpectation;
}

// db/DELTA_AND_PROVENANCE.md's acceptance table. Both share values (1.2,
// 1.0625) are exact, not rounded artefacts — a mismatch means the arithmetic
// is wrong, not the rounding.
const EXPECTATIONS: Expectation[] = [
  {
    file: '../../records/customer_zero.json',
    score: 30.0,
    band: 'low',
    realization: 'measured',
    disclosure: 'internal',
    delta: {
      raw: 2.4,
      improved: true,
      targetMet: true,
      pctOfTarget: 120.0,
      gap: 1_400_000,
      shareOfClaim: 1.2,
      punctualityDays: 0,
      onTime: true,
    },
  },
  {
    file: '../../records/customer_b.json',
    score: 80.0,
    band: 'high',
    realization: 'verified',
    disclosure: 'customer_shared',
    delta: {
      raw: -0.34,
      improved: true,
      targetMet: true,
      pctOfTarget: 106.2,
      gap: 173_430,
      shareOfClaim: 1.0625,
      punctualityDays: 0,
      onTime: true,
    },
  },
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

    const delta = computeDelta({
      baselineValue: vo.baseline_value,
      targetValue: vo.target_value,
      actualValue: vo.actual_value,
      claimedCurrencyImpact: vo.claimed_currency_impact,
      realizedCurrencyImpact: vo.realized_currency_impact,
      promisedMeasuredAt: vo.promised_measured_at,
      actualMeasuredAt: vo.actual_measured_at,
      direction: bm.direction,
    });
    if (!delta.available) {
      throw new Error(`${fixture.run.label}: delta unavailable — actual_value missing, cannot check acceptance values.`);
    }
    const de = expectation.delta;
    const deltaChecks = {
      raw: delta.raw === de.raw,
      improved: delta.improved === de.improved,
      targetMet: delta.targetMet === de.targetMet,
      pctOfTarget: delta.pctOfTarget === de.pctOfTarget,
      gap: delta.currency.gap === de.gap,
      shareOfClaim: delta.currency.shareOfClaim === de.shareOfClaim,
      punctualityDays: delta.punctualityDays === de.punctualityDays,
      onTime: delta.onTime === de.onTime,
    };
    const deltaOk = Object.values(deltaChecks).every(Boolean);

    const scoreOk = confidence.score === expectation.score;
    const bandOk = confidence.band === expectation.band;
    const realizationOk = realization === expectation.realization;
    const disclosureOk = disclosure === expectation.disclosure;
    const ok = scoreOk && bandOk && realizationOk && disclosureOk && deltaOk;
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
    console.log(`  delta       raw ${delta.raw}, improved ${delta.improved}, target_met ${delta.targetMet}, ` +
      `pct_of_target ${delta.pctOfTarget}  ${deltaChecks.raw && deltaChecks.improved && deltaChecks.targetMet && deltaChecks.pctOfTarget ? 'OK' : 'MISMATCH'}`);
    console.log(`  currency    gap ${delta.currency.gap}, share_of_claim ${delta.currency.shareOfClaim}  ` +
      `${deltaChecks.gap && deltaChecks.shareOfClaim ? 'OK' : 'MISMATCH'}`);
    console.log(`  punctuality ${delta.punctualityDays} day(s), on_time ${delta.onTime}  ` +
      `${deltaChecks.punctualityDays && deltaChecks.onTime ? 'OK' : 'MISMATCH'}`);
    if (!ok) {
      console.log('  factor breakdown:');
      for (const f of confidence.factors) {
        console.log(`    ${f.factor.padEnd(28)} ${f.earned}/${f.weight}  ${f.note}`);
      }
      if (!deltaOk) {
        const actualByKey: Record<keyof DeltaExpectation, unknown> = {
          raw: delta.raw,
          improved: delta.improved,
          targetMet: delta.targetMet,
          pctOfTarget: delta.pctOfTarget,
          gap: delta.currency.gap,
          shareOfClaim: delta.currency.shareOfClaim,
          punctualityDays: delta.punctualityDays,
          onTime: delta.onTime,
        };
        console.log('  delta breakdown:');
        for (const key of Object.keys(deltaChecks) as (keyof DeltaExpectation)[]) {
          if (!deltaChecks[key]) {
            console.log(`    ${key.padEnd(16)} got ${JSON.stringify(actualByKey[key])} expected ${JSON.stringify(de[key])}`);
          }
        }
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
