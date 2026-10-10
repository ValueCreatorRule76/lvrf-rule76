import { useEffect, useState } from 'react';
import { Card, Badge } from './workbench/Card';
import { GovernedForm, FOCUS_RING } from './GovernedForm';
import type { InstitutionFact, InstitutionFactKind } from '../api/institution';

const LABEL_CLASS = 'mb-1 block text-[10px] font-semibold uppercase tracking-[.16em] text-ink-45';
const INPUT_CLASS =
  'w-full border border-rule bg-white px-2.5 py-1.5 text-[13px] text-ink ' + FOCUS_RING;
const HELP_CLASS = 'm-0 mt-1 text-[11px] text-ink-45';

const KIND_LABEL: Record<InstitutionFactKind, string> = {
  revenue: 'Revenue',
  headcount: 'Headcount',
  stated_priority: 'Stated priority',
  system: 'System',
};
const KIND_ORDER: InstitutionFactKind[] = ['revenue', 'headcount', 'stated_priority', 'system'];
const NUMERIC_KINDS: InstitutionFactKind[] = ['revenue', 'headcount'];

const EVIDENCE_KIND_OPTIONS = [
  'public_filing',
  'system_export',
  'artifact',
  'observation',
  'attestation',
  'vendor_publication',
] as const;
const CONFIDENCE_OPTIONS = ['low', 'medium', 'high'] as const;

// Same tri-state as AddEvidenceCard.tsx: a checkbox resolves to false on
// page load without anyone choosing it.
type YesNo = '' | 'true' | 'false';

interface AddFactResponse {
  fact_id: string;
  evidence_id: string;
}

// value_numeric arrives as pg's numeric string. Grouped for reading, never
// parsed to a float — a revenue figure must not lose digits on the way to
// the screen. "0" renders as 0: zero is data.
function formatNumeric(v: string): string {
  const [whole, frac] = v.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return frac && !/^0+$/.test(frac) ? `${grouped}.${frac.replace(/0+$/, '')}` : grouped;
}

function factValue(f: InstitutionFact): string {
  if (f.value_text !== null) return f.value_text;
  if (f.value_numeric === null) return '';
  const n = formatNumeric(f.value_numeric);
  return f.kind === 'headcount' ? `${n} people` : `${n} ${f.unit ?? ''}`.trim();
}

// Calls `fn` once when it mounts. Rendered inside renderSuccess so the page
// reloads its view after a fact is recorded, without renderSuccess itself
// causing a side effect during render.
function OnMount({ fn }: { fn: () => void }) {
  useEffect(() => {
    fn();
  }, [fn]);
  return null;
}

function AddFactForm({ institutionId, onRecorded }: { institutionId: string; onRecorded: () => void }) {
  const [kind, setKind] = useState<InstitutionFactKind | ''>('');
  const [valueNumeric, setValueNumeric] = useState('');
  const [valueText, setValueText] = useState('');
  const [currency, setCurrency] = useState('');
  const [asOf, setAsOf] = useState('');
  const [evidenceKind, setEvidenceKind] = useState('');
  const [provenance, setProvenance] = useState('');
  const [sourceReference, setSourceReference] = useState('');
  const [confidence, setConfidence] = useState('');
  const [sourceVerified, setSourceVerified] = useState<YesNo>('');
  const [aiSourced, setAiSourced] = useState<YesNo>('');
  const [researchQuery, setResearchQuery] = useState('');
  const [researchTool, setResearchTool] = useState('');

  const numeric = kind !== '' && NUMERIC_KINDS.includes(kind);
  // '' is unset; '0' is a real value and passes — zero is data.
  const valueValid = numeric
    ? valueNumeric.trim() !== '' && Number.isFinite(Number(valueNumeric))
    : valueText.trim() !== '';
  const unitValid = kind !== 'revenue' || currency.trim() !== '';
  const aiFieldsValid =
    aiSourced !== 'true' || (researchQuery.trim() !== '' && researchTool.trim() !== '');

  // Shape rules a CHECK owns (non-negative, whole headcount, ISO currency)
  // are NOT restated here — the server returns the constraint's refusal.
  // Only "has each field been filled or chosen" is checked.
  const canSubmit =
    kind !== '' &&
    valueValid &&
    unitValid &&
    asOf !== '' &&
    evidenceKind !== '' &&
    provenance.trim().length >= 12 &&
    confidence !== '' &&
    sourceVerified !== '' &&
    aiSourced !== '' &&
    aiFieldsValid;

  return (
    <GovernedForm<AddFactResponse>
      path={`/api/institutions/${institutionId}/facts`}
      provenanceLabel="Provenance — where this fact came from"
      submitLabel="Record fact"
      canSubmit={canSubmit}
      buildBody={() => ({
        kind,
        ...(numeric
          ? {
              value_numeric: Number(valueNumeric),
              unit: kind === 'headcount' ? 'people' : currency.trim().toUpperCase(),
            }
          : { value_text: valueText }),
        as_of: asOf,
        evidence_kind: evidenceKind,
        provenance,
        confidence,
        ...(sourceReference.trim() !== '' ? { source_reference: sourceReference } : {}),
        source_verified: sourceVerified === 'true',
        ai_sourced: aiSourced === 'true',
        ...(aiSourced === 'true' ? { research_query: researchQuery, research_tool: researchTool } : {}),
      })}
      renderSuccess={() => (
        <>
          <OnMount fn={onRecorded} />
          <p className="m-0">Fact recorded with its evidence.</p>
        </>
      )}
      provenance={
        <>
          <label className="mb-3 block">
            <span className={LABEL_CLASS}>Provenance (required)</span>
            <textarea
              required
              minLength={12}
              rows={2}
              value={provenance}
              onChange={(e) => setProvenance(e.target.value)}
              className={INPUT_CLASS}
            />
            <p className={HELP_CLASS}>
              Where this came from — "FY2025 10-K, Item 7" or "Stated by the CHRO on the 3 Oct
              discovery call." A figure with no source is an assertion.
            </p>
          </label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block">
              <span className={LABEL_CLASS}>Evidence kind</span>
              <select value={evidenceKind} onChange={(e) => setEvidenceKind(e.target.value)} className={INPUT_CLASS}>
                <option value="" disabled>— choose —</option>
                {EVIDENCE_KIND_OPTIONS.map((k) => (
                  <option key={k} value={k}>{k}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className={LABEL_CLASS}>Confidence</span>
              <select value={confidence} onChange={(e) => setConfidence(e.target.value)} className={INPUT_CLASS}>
                <option value="" disabled>— choose —</option>
                {CONFIDENCE_OPTIONS.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </label>
            <label className="block sm:col-span-2">
              <span className={LABEL_CLASS}>Source reference (optional)</span>
              <input
                type="text"
                value={sourceReference}
                onChange={(e) => setSourceReference(e.target.value)}
                className={INPUT_CLASS}
              />
              <p className={HELP_CLASS}>Citation, filing reference, export ID or URL.</p>
            </label>
            <label className="block">
              <span className={LABEL_CLASS}>Source opened and confirmed?</span>
              <select value={sourceVerified} onChange={(e) => setSourceVerified(e.target.value as YesNo)} className={INPUT_CLASS}>
                <option value="" disabled>— choose —</option>
                <option value="false">No — unverified</option>
                <option value="true">Yes — verified</option>
              </select>
            </label>
            <label className="block">
              <span className={LABEL_CLASS}>Located by a model?</span>
              <select value={aiSourced} onChange={(e) => setAiSourced(e.target.value as YesNo)} className={INPUT_CLASS}>
                <option value="" disabled>— choose —</option>
                <option value="false">No</option>
                <option value="true">Yes — AI-sourced</option>
              </select>
            </label>
            {aiSourced === 'true' && (
              <>
                <label className="block">
                  <span className={LABEL_CLASS}>Research query</span>
                  <input type="text" value={researchQuery} onChange={(e) => setResearchQuery(e.target.value)} className={INPUT_CLASS} />
                </label>
                <label className="block">
                  <span className={LABEL_CLASS}>Research tool</span>
                  <input type="text" value={researchTool} onChange={(e) => setResearchTool(e.target.value)} className={INPUT_CLASS} />
                </label>
              </>
            )}
          </div>
        </>
      }
      fields={
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className={LABEL_CLASS}>Fact</span>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as InstitutionFactKind)}
              className={INPUT_CLASS}
            >
              <option value="" disabled>— choose —</option>
              {KIND_ORDER.map((k) => (
                <option key={k} value={k}>{KIND_LABEL[k]}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={LABEL_CLASS}>As of</span>
            <input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} className={INPUT_CLASS} />
            <p className={HELP_CLASS}>The date the fact describes, not today.</p>
          </label>
          {numeric && (
            <label className="block">
              <span className={LABEL_CLASS}>{kind === 'headcount' ? 'People' : 'Amount'}</span>
              <input
                type="number"
                min={0}
                step={kind === 'headcount' ? 1 : 'any'}
                value={valueNumeric}
                onChange={(e) => setValueNumeric(e.target.value)}
                className={INPUT_CLASS}
              />
            </label>
          )}
          {kind === 'revenue' && (
            <label className="block">
              <span className={LABEL_CLASS}>Currency</span>
              <input
                type="text"
                maxLength={3}
                placeholder="ISO code, e.g. USD"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className={INPUT_CLASS}
              />
            </label>
          )}
          {kind !== '' && !numeric && (
            <label className="block sm:col-span-2">
              <span className={LABEL_CLASS}>{kind === 'system' ? 'System' : 'Priority, as stated'}</span>
              <input
                type="text"
                placeholder={kind === 'system' ? 'e.g. Workday (HRIS)' : ''}
                value={valueText}
                onChange={(e) => setValueText(e.target.value)}
                className={INPUT_CLASS}
              />
              {kind === 'system' && <p className={HELP_CLASS}>One system per fact.</p>}
            </label>
          )}
        </div>
      }
    />
  );
}

/**
 * Account workbench — the company inputs a baseline is argued against.
 * Every row shows its evidence's verification state: a fact is exactly as
 * verified as the evidence behind it, and an unverified figure renders as
 * one (CLAUDE.md rule 6).
 */
export function AccountFactsCard({
  n,
  institutionId,
  facts,
  onRecorded,
}: {
  n: string;
  institutionId: string;
  facts: InstitutionFact[];
  onRecorded: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const grouped = KIND_ORDER.map((k) => ({ kind: k, rows: facts.filter((f) => f.kind === k) }));

  return (
    <Card n={n} title="Account facts" badge={<Badge tone="neutral">{facts.length}</Badge>}>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        {grouped.map(({ kind, rows }) => (
          <div key={kind}>
            <span className="block text-[9.5px] font-semibold uppercase tracking-[.13em] text-ink-45">
              {KIND_LABEL[kind]}
            </span>
            {rows.length === 0 ? (
              <p className="m-0 mt-1.5 text-[12.5px] text-ink-45">Not recorded.</p>
            ) : (
              <ul className="m-0 mt-1.5 list-none p-0">
                {rows.map((f) => (
                  <li key={f.id} className="border-b border-rule-soft py-2 last:border-b-0">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="text-[13.5px] font-semibold text-ink">{factValue(f)}</span>
                      <span className="flex items-center gap-1.5">
                        {f.ai_sourced && <Badge tone="warning">AI-sourced</Badge>}
                        <Badge tone={f.source_verified ? 'healthy' : 'warning'}>
                          {f.source_verified ? 'Verified' : 'Unverified'}
                        </Badge>
                      </span>
                    </div>
                    <span className="block text-[11.5px] text-ink-45">
                      As of {f.as_of} · {f.provenance}
                    </span>
                    <span className="block font-mono text-[10.5px] text-ink-45">
                      {f.evidence_kind} · {f.confidence} confidence · {f.captured_by}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>

      <div className="mt-5 border-t border-rule-soft pt-4">
        {adding ? (
          // key remounts the form after each recorded fact, so the next one
          // starts blank instead of on a spent, disabled form.
          <AddFactForm key={facts.length} institutionId={institutionId} onRecorded={onRecorded} />
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className={
              'border border-silver px-3 py-1.5 text-[9.5px] font-semibold uppercase tracking-[.1em] text-ink-45 hover:border-ink hover:text-ink ' +
              FOCUS_RING
            }
          >
            Add a fact
          </button>
        )}
      </div>
    </Card>
  );
}
