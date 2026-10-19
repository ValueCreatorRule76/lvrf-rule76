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

/** The label for a stored value; an unknown value is shown as stored, never guessed. */
export const label = (map: Record<string, string>, v: string) => map[v] ?? v;
