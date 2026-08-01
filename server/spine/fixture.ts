import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * One source of truth for the fixture data: records/*.json, the same files
 * records/simulate_spine.py reads. Field names below mirror the JSON exactly
 * (snake_case) rather than being remapped to camelCase, so a diff against the
 * fixture file stays legible.
 */

const RECORDS_DIR = fileURLToPath(new URL('../../records/', import.meta.url));

/** basename() strips any directory component — resolution never leaves records/. */
function fixturePath(fixtureFile: string): string {
  return `${RECORDS_DIR}${basename(fixtureFile)}`;
}

export interface PersonFixture {
  name: string;
  title: string;
  scope: 'tenant' | 'institution';
  synthetic: boolean;
}

export interface EvidenceFixture {
  kind: string;
  summary: string;
  provenance: string;
  source_reference: string;
  confidence: 'low' | 'medium' | 'high';
  source_verified: boolean;
  supports: 'baseline' | 'attach' | 'actual' | 'impact_basis';
  simulated: boolean;
  /** Key into `persons` (e.g. "metric_owner") when this evidence is an attestation. */
  attested_by?: string | null;
  attested_at?: string | null;
}

export interface CustomerZeroFixture {
  run: {
    label: string;
    executed_at: string;
    contract_version: string;
    constitutional_authority: string;
    simulation_boundary: string;
    note: string;
  };
  tenant: { id: string; is_self_measuring: boolean };
  institution: { name: string; industry: string; is_tenant_self: boolean };
  persons: {
    value_engineer: PersonFixture;
    account_executive: PersonFixture;
    sponsor: PersonFixture;
    metric_owner: PersonFixture;
    verifier: PersonFixture;
    assessor: PersonFixture;
  };
  engagement: { name: string; renewal_date: string };
  capability: { name: string; role_family: string; description: string };
  business_metric: {
    name: string;
    unit: string;
    direction: 'increase' | 'decrease';
    source_system: string;
    reporting_cadence: string;
    definition_notes: string;
    calculation_confirmed: boolean;
  };
  value_outcome: {
    baseline_value: number;
    baseline_measured_at: string;
    baseline_sourced: boolean;
    target_value: number;
    target_simulated: boolean;
    actual_value: number;
    actual_measured_at: string;
    actual_simulated: boolean;
    /** 0001 split currency_impact into these two; they are never the same value. */
    claimed_currency_impact: number | null;
    realized_currency_impact: number | null;
    currency_code: string;
    impact_basis: string;
    confidence: 'low' | 'medium' | 'high';
    impact_is_inference: boolean;
  };
  evidence: EvidenceFixture[];
  assessment: {
    score: number;
    scale_min: number;
    scale_max: number;
    prior_score: number;
    ai_assisted: boolean;
    simulated: boolean;
  };
  stewardship_return: {
    kind: string;
    summary: string;
    narrative: string;
    target_chapel: string;
  };
}

export async function loadFixture(fixtureFile: string = 'customer_zero.json'): Promise<CustomerZeroFixture> {
  const path = fixturePath(fixtureFile);
  let raw: string;
  try {
    raw = await readFile(path, 'utf-8');
  } catch (err) {
    throw new Error(`Cannot read fixture "${fixtureFile}" (resolved to ${path}): ${(err as Error).message}`);
  }
  return JSON.parse(raw) as CustomerZeroFixture;
}
