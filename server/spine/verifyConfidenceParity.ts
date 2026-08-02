import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { computeConfidence, evidenceCredit, fixtureEvidenceToInput, type ConfidenceLevel } from './confidenceModel.js';
import { computeDelta } from './deltaEngine.js';
import { computeHealth, type HealthEventInput, type HealthState } from './healthModel.js';
import { buildHeartbeatPlan } from './heartbeatLedger.js';
import { computeFindings, type Finding } from './findingsModel.js';
import type { CustomerZeroFixture } from './fixture.js';

/**
 * Four acceptance tests against the retired Python: db/CONFIDENCE_MODEL.md's
 * confidence/gate arithmetic, db/DELTA_AND_PROVENANCE.md's delta engine,
 * db/HEALTH_MODEL.md's institutional health composite, and
 * db/FINDINGS_MODEL.md's findings. Reads both fixtures directly — no
 * database, no seeding — because the assertion is about the arithmetic and
 * the gate, not about a full customer_b walk (which nothing in this
 * codebase wires up yet; only customer_zero has a seed/walk path).
 *
 * Findings asserts codes and severities only, not message text — per
 * db/FINDINGS_MODEL.md, message text is expected to change; the codes and
 * severities should not.
 *
 * Health needs the actual ten-event heartbeat ledger a walk would emit, with
 * each event's real health_state. That sequence is buildHeartbeatPlan() —
 * server/spine/heartbeatLedger.ts — the same function server/spine/walkSpine.ts
 * drives its emit() calls from, not a second copy of the rule reconstructed
 * here by hand. REGISTER_SUBSET below is the one remaining, much narrower
 * duplication: the `heartbeats` table's category/health_weight for the nine
 * heartbeats a walk emits, confirmed against the live register rather than
 * guessed, needed only because this script has no database connection.
 *
 * The realization and disclosure checks use the SAME evidenceCredit /
 * fixtureEvidenceToInput functions server/spine/walkSpine.ts calls — one
 * gate implementation, not a second one reproduced here. That duplication is
 * exactly what let the two implementations disagree the first time this
 * test was written, silently, on the highest-stakes rule in the system
 * (whether a record may be shown to a customer). The same principle is why
 * buildHeartbeatPlan() moved out of this file: REGISTER_SUBSET/buildHeartbeat-
 * Ledger() used to be a second, hand-synchronised implementation of the
 * walk's health_state logic — exactly that shape of risk, caught before it
 * caused a second silent divergence.
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

interface HealthExpectation {
  dimensions: Record<string, number | null>;
  composite: number;
  band: HealthState;
  coveragePct: number;
}

interface FindingExpectation {
  code: string;
  severity: HealthState;
}

interface Expectation {
  file: string;
  score: number;
  band: ConfidenceLevel;
  realization: 'measured' | 'verified';
  disclosure: 'internal' | 'customer_shared';
  delta: DeltaExpectation;
  health: HealthExpectation;
  findings: FindingExpectation[];
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
    // db/HEALTH_MODEL.md — taken from the reference implementation, not
    // derived by hand. Constitutional reads 68.0 because HB-0016 fired at
    // 'warning' when verification was refused: the composite is depressed
    // because the framework declined to overclaim, which is correct.
    health: {
      dimensions: {
        'Constitutional Compliance': 68.0,
        'Governance Integrity': 92.9,
        'Operational Health': 100.0,
        'Data Integrity': 100.0,
        Security: null,
        'Financial / Value Realization': 92.1,
        'Learning & Improvement': 100.0,
      },
      composite: 88.3,
      band: 'watch',
      coveragePct: 90,
    },
    // db/FINDINGS_MODEL.md — codes and severities only; message text is
    // expected to change and is not asserted.
    findings: [
      { code: 'F2', severity: 'watch' },
      { code: 'F3', severity: 'warning' },
      { code: 'F4', severity: 'warning' },
    ],
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
    health: {
      dimensions: {
        'Constitutional Compliance': 100.0,
        'Governance Integrity': 100.0,
        'Operational Health': 100.0,
        'Data Integrity': 92.1,
        Security: null,
        'Financial / Value Realization': 100.0,
        'Learning & Improvement': 100.0,
      },
      composite: 99.1,
      band: 'healthy',
      coveragePct: 90,
    },
    findings: [],
  },
];

/**
 * Mirrors the `heartbeats` register for the nine heartbeats a walk emits —
 * confirmed against the live table (category, health_weight), not guessed.
 * Not read from the database: this script runs with no DB connection, and
 * this is stable, ratified constitutional data (the register), not fixture
 * data or walk logic — a materially lower-risk duplication than the
 * sequence/health_state RULE, which is not duplicated here; see
 * buildHeartbeatPlan() in server/spine/heartbeatLedger.ts for that.
 */
const REGISTER_SUBSET: Record<string, { category: string; healthWeight: number }> = {
  'HB-0004': { category: 'operational', healthWeight: 10 },
  'HB-0005': { category: 'governance', healthWeight: 10 },
  'HB-0009': { category: 'integrity', healthWeight: 8 },
  'HB-0013': { category: 'financial', healthWeight: 9 },
  'HB-0014': { category: 'governance', healthWeight: 9 },
  'HB-0015': { category: 'financial', healthWeight: 10 },
  'HB-0016': { category: 'constitutional', healthWeight: 10 },
  'HB-0017': { category: 'integrity', healthWeight: 9 },
  'HB-0018': { category: 'learning', healthWeight: 7 },
};

/** Enriches buildHeartbeatPlan()'s (heartbeatId, healthState) steps with the register's (category, healthWeight). */
function enrichWithRegister(steps: { heartbeatId: string; healthState: HealthState }[]): HealthEventInput[] {
  return steps.map((step) => {
    const reg = REGISTER_SUBSET[step.heartbeatId];
    return { heartbeatId: step.heartbeatId, category: reg.category, healthWeight: reg.healthWeight, healthState: step.healthState };
  });
}

/**
 * Mirrors server/spine/walkSpine.ts STAGE 6 exactly: ANY actual-supporting
 * evidence item with credit > 0, and a non-synthetic verifier. Disclosure
 * follows realization the same way walkSpine.ts's STAGE 7 does.
 */
function computeRealization(fixture: CustomerZeroFixture): {
  realization: 'measured' | 'verified';
  anyActualEvidenceVerified: boolean;
  verifierSynthetic: boolean;
} {
  const actualEvidence = fixture.evidence.filter((e) => e.supports === 'actual');
  const anyActualEvidenceVerified =
    actualEvidence.length > 0 && actualEvidence.some((e) => evidenceCredit(fixtureEvidenceToInput(fixture, e)).credit > 0);
  const verifierSynthetic = fixture.persons.verifier.synthetic;
  const realization = anyActualEvidenceVerified && !verifierSynthetic ? 'verified' : 'measured';
  return { realization, anyActualEvidenceVerified, verifierSynthetic };
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
    const { realization, anyActualEvidenceVerified, verifierSynthetic } = computeRealization(fixture);
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
      targetMet: delta.target_met === de.targetMet,
      pctOfTarget: delta.pct_of_target === de.pctOfTarget,
      gap: delta.currency.gap === de.gap,
      shareOfClaim: delta.currency.share_of_claim === de.shareOfClaim,
      punctualityDays: delta.punctuality_days === de.punctualityDays,
      onTime: delta.on_time === de.onTime,
    };
    const deltaOk = Object.values(deltaChecks).every(Boolean);

    const heartbeatPlan = buildHeartbeatPlan({
      baselineEvidenceCount: fixture.evidence.filter((e) => e.supports === 'baseline').length,
      sponsorSynthetic: fixture.persons.sponsor.synthetic,
      actualSimulated: vo.actual_simulated,
      realization,
      disclosure,
    });
    const health = computeHealth(enrichWithRegister(heartbeatPlan));
    const he = expectation.health;
    const dimensionChecks = health.dimensions.map((d) => ({
      dimension: d.dimension,
      ok: d.score === he.dimensions[d.dimension],
    }));
    const healthChecks = {
      dimensions: dimensionChecks.every((d) => d.ok),
      composite: health.composite === he.composite,
      band: health.band === he.band,
      coveragePct: health.coverage_pct === he.coveragePct,
    };
    const healthOk = Object.values(healthChecks).every(Boolean);

    const findings: Finding[] = computeFindings({
      unmappedEvents: health.unmappedEvents,
      sponsorSynthetic: fixture.persons.sponsor.synthetic,
      anyActualEvidenceVerified,
      verifierSynthetic,
      confidenceBand: confidence.band,
      confidenceScore: confidence.score,
    });
    const fe = expectation.findings;
    const findingsOk =
      findings.length === fe.length &&
      findings.every((f, i) => f.code === fe[i].code && f.severity === fe[i].severity);

    const scoreOk = confidence.score === expectation.score;
    const bandOk = confidence.band === expectation.band;
    const realizationOk = realization === expectation.realization;
    const disclosureOk = disclosure === expectation.disclosure;
    const ok = scoreOk && bandOk && realizationOk && disclosureOk && deltaOk && healthOk && findingsOk;
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
    console.log(`  delta       raw ${delta.raw}, improved ${delta.improved}, target_met ${delta.target_met}, ` +
      `pct_of_target ${delta.pct_of_target}  ${deltaChecks.raw && deltaChecks.improved && deltaChecks.targetMet && deltaChecks.pctOfTarget ? 'OK' : 'MISMATCH'}`);
    console.log(`  currency    gap ${delta.currency.gap}, share_of_claim ${delta.currency.share_of_claim}  ` +
      `${deltaChecks.gap && deltaChecks.shareOfClaim ? 'OK' : 'MISMATCH'}`);
    console.log(`  punctuality ${delta.punctuality_days} day(s), on_time ${delta.on_time}  ` +
      `${deltaChecks.punctualityDays && deltaChecks.onTime ? 'OK' : 'MISMATCH'}`);
    console.log(
      `  health      composite ${health.composite} [${health.band}], coverage ${health.coverage_pct}%  ` +
        `${healthChecks.composite && healthChecks.band && healthChecks.coveragePct ? 'OK' : 'MISMATCH'}`,
    );
    for (const d of dimensionChecks) {
      const row = health.dimensions.find((r) => r.dimension === d.dimension)!;
      console.log(
        `    ${d.dimension.padEnd(30)} ${row.score == null ? 'UNMEASURED' : row.score.toFixed(1).padStart(5)}  ` +
          `${d.ok ? 'OK' : 'MISMATCH'}`,
      );
    }
    console.log(
      `  findings    ${findings.length} (${findings.map((f) => f.code).join(', ') || 'none'})  ` +
        `(expected ${fe.length} (${fe.map((f) => f.code).join(', ') || 'none'}))  ${findingsOk ? 'OK' : 'MISMATCH'}`,
    );
    if (!ok) {
      console.log('  factor breakdown:');
      for (const f of confidence.factors) {
        console.log(`    ${f.factor.padEnd(28)} ${f.earned}/${f.weight}  ${f.note}`);
      }
      if (!deltaOk) {
        const actualByKey: Record<keyof DeltaExpectation, unknown> = {
          raw: delta.raw,
          improved: delta.improved,
          targetMet: delta.target_met,
          pctOfTarget: delta.pct_of_target,
          gap: delta.currency.gap,
          shareOfClaim: delta.currency.share_of_claim,
          punctualityDays: delta.punctuality_days,
          onTime: delta.on_time,
        };
        console.log('  delta breakdown:');
        for (const key of Object.keys(deltaChecks) as (keyof DeltaExpectation)[]) {
          if (!deltaChecks[key]) {
            console.log(`    ${key.padEnd(16)} got ${JSON.stringify(actualByKey[key])} expected ${JSON.stringify(de[key])}`);
          }
        }
      }
      if (!healthOk) {
        console.log('  health breakdown:');
        for (const d of dimensionChecks) {
          if (!d.ok) {
            const row = health.dimensions.find((r) => r.dimension === d.dimension)!;
            console.log(`    ${d.dimension.padEnd(30)} got ${JSON.stringify(row.score)} expected ${JSON.stringify(he.dimensions[d.dimension])}`);
          }
        }
        if (!healthChecks.composite) console.log(`    composite got ${health.composite} expected ${he.composite}`);
        if (!healthChecks.band) console.log(`    band got ${health.band} expected ${he.band}`);
        if (!healthChecks.coveragePct) console.log(`    coveragePct got ${health.coverage_pct} expected ${he.coveragePct}`);
      }
      if (!findingsOk) {
        console.log('  findings breakdown:');
        console.log(`    got      ${JSON.stringify(findings.map((f) => ({ code: f.code, severity: f.severity })))}`);
        console.log(`    expected ${JSON.stringify(fe)}`);
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
