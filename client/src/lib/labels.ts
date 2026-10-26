/**
 * Stored values in words (UX-1 standards: no internal terms). One place for
 * each enum's label, read by every page that shows it; the stored value is
 * unchanged on the record.
 */
export const FACT_KIND: Record<string, string> = {
  revenue: 'Revenue', headcount: 'Headcount', stated_priority: 'Stated priority', system: 'System',
  entity: 'Entity', disclosure_regime: 'Disclosure regime',
};
// `public_filer` means "files with a securities regulator" (the research
// contract), so its label names no particular regulator.
export const DISCLOSURE_REGIME: Record<string, string> = {
  public_filer: 'Public filer', private: 'Private', subsidiary_of_filer: 'Subsidiary of a filer', public_sector: 'Public sector',
};
export const IDENTIFIER_TYPE: Record<string, string> = { sec_cik: 'SEC CIK', ticker: 'Ticker', registry: 'Registry number' };
export const SUMMARY_LENS: Record<string, string> = { general: 'General', cfo: 'CFO', chro: 'CHRO', board: 'Board' };
export const ASK_TYPE: Record<string, string> = { definition: 'Definition', document: 'Document', person: 'Person' };
// A gap's state is history (has an attempt been refused?); its path is the
// present (can the current source still close it?). gapRegister.ts.
export const GAP_STATE: Record<string, string> = { open: 'Open', refused: 'Refused' };
export const GAP_PATH: Record<string, string> = { viable: 'can still be closed', blocked: 'cannot be closed from the current source' };

// The value spine in plain labels (UX-1 standard 4); the enum keeps its values (db/schema.ts).
export const STAGE_LABEL: Record<string, string> = {
  baseline: 'Baseline set', attach: 'Capability attached', model: 'Value modelled', commit: 'Target committed',
  measure: 'Actual measured', verify: 'Verified', return: 'Returned to the record',
};
export const REALIZATION: Record<string, string> = {
  claimed: 'Claimed: a target or hypothesis, no measured actual', measured: 'Measured: an actual arrived, not yet verified',
  verified: 'Verified: a named person confirmed the sources and the change', not_realized: 'Not realized: measured, and the target was not met',
};
export const DISCLOSURE: Record<string, string> = {
  draft: 'Draft: not for circulation', internal: 'Internal: not shared with the customer', customer_shared: 'Shared with the customer',
};
export const EVIDENCE_KIND: Record<string, string> = {
  assessment_result: 'Assessment result', system_export: 'System export', artifact: 'Artifact', observation: 'Observation',
  attestation: 'Attestation', public_filing: 'Public filing', vendor_publication: 'Vendor publication',
};
export const SUPPORTS: Record<string, string> = {
  baseline: 'the baseline', actual: 'the actual', impact_basis: 'the impact basis',
  // C2 (LVRF_PLAN §11): a commitment's and a verification's attestation support those acts; no factor reads them.
  target_commitment: 'the commitment', verification: 'the verification',
};
/** What a link supports, short, as the lists read it ("impact basis", "the commitment"); an unknown value as stored. */
export const supportsShort = (v: string) => (v === 'target_commitment' || v === 'verification' ? SUPPORTS[v] : v.replace('_', ' '));

/** The label for a stored value; an unknown value is shown as stored, never guessed. */
export const label = (map: Record<string, string>, v: string) => map[v] ?? v;

/** P1: a locator as read: "Document · table · row · column: value (scale)". */
export function locatorText(l: { document: string; value: number; scale: string; table?: string; row?: string; column?: string }): string {
  return `${[l.document, l.table, l.row, l.column].filter(Boolean).join(' · ')}: ${l.value} (${l.scale})`;
}
