import { useEffect, useState } from 'react';
import { Card, Badge } from './workbench/Card';
import { GovernedForm, FOCUS_RING } from './GovernedForm';
import type { InstitutionFact, InstitutionFactHistoryEntry, InstitutionFactKind } from '../api/institution';
import { useEvidenceForm, type EvidenceFormChoice } from './EvidenceFormInput';
import { EvidenceRestsOn, FigureCheckLine } from './EvidenceRestsOn';
import { label, EVIDENCE_KIND } from '../lib/labels';

const LABEL_CLASS = 'mb-1 block text-[10px] font-semibold uppercase tracking-[.16em] text-ink-45';
const INPUT_CLASS =
  'w-full border border-rule bg-white px-2.5 py-1.5 text-[13px] text-ink ' + FOCUS_RING;
const HELP_CLASS = 'm-0 mt-1 text-[11px] text-ink-45';

const KIND_LABEL: Record<InstitutionFactKind, string> = {
  revenue: 'Revenue',
  headcount: 'Headcount',
  stated_priority: 'Stated priority',
  system: 'System',
  disclosure_regime: 'Disclosure regime',
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

const BUTTON_CLASS =
  'border border-silver px-3 py-1.5 text-[9.5px] font-semibold uppercase tracking-[.1em] text-ink-45 hover:border-ink hover:text-ink ';

// value_numeric arrives as pg's numeric string. Grouped for reading, never
// parsed to a float — a revenue figure must not lose digits on the way to
// the screen. "0" renders as 0: zero is data.
function formatNumeric(v: string): string {
  const [whole, frac] = v.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return frac && !/^0+$/.test(frac) ? `${grouped}.${frac.replace(/0+$/, '')}` : grouped;
}

function factValue(
  kind: InstitutionFactKind,
  f: Pick<InstitutionFact, 'value_text' | 'value_numeric' | 'unit'>,
): string {
  if (f.value_text !== null) return f.value_text;
  if (f.value_numeric === null) return '';
  const n = formatNumeric(f.value_numeric);
  return kind === 'headcount' ? `${n} people` : `${n} ${f.unit ?? ''}`.trim();
}

// A timestamp as a date and minute, in the reader's zone — enough to place
// a correction, without seconds that read as precision.
function when(ts: string): string {
  return new Date(ts).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
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

/**
 * Records a new fact, or — with `correcting` — a correction of a current
 * one (fact supersession). A correction keeps the fact's kind, starts from
 * its value and as-of date, and needs its own source and a stated reason;
 * the earlier value is kept as history, never overwritten.
 */
function FactForm({
  institutionId,
  onRecorded,
  correcting,
}: {
  institutionId: string;
  onRecorded: () => void;
  correcting?: InstitutionFact;
}) {
  const [kind, setKind] = useState<InstitutionFactKind | ''>(correcting?.kind ?? '');
  const [valueNumeric, setValueNumeric] = useState(correcting?.value_numeric ?? '');
  const [valueText, setValueText] = useState(correcting?.value_text ?? '');
  const [currency, setCurrency] = useState(correcting?.kind === 'revenue' ? (correcting.unit ?? '') : '');
  const [asOf, setAsOf] = useState(correcting?.as_of ?? '');
  const [reason, setReason] = useState('');
  const [evidenceKind, setEvidenceKind] = useState('');
  const [provenance, setProvenance] = useState('');
  const [sourceReference, setSourceReference] = useState('');
  const [confidence, setConfidence] = useState('');
  const [sourceVerified, setSourceVerified] = useState<YesNo>('');
  const [aiSourced, setAiSourced] = useState<YesNo>('');
  const [researchQuery, setResearchQuery] = useState('');
  const [researchTool, setResearchTool] = useState('');
  // P1: a fact's evidence rests on a quote or a locator. A correction keeps
  // the form of the evidence it corrects (institution_facts_form_kept); a
  // legacy fact may move to either.
  const keep = correcting && (correcting.evidence_form === 'quote' || correcting.evidence_form === 'locator') ? correcting.evidence_form : null;
  const allowed: EvidenceFormChoice[] = keep ? [keep] : ['quote', 'locator'];
  const evidenceForm = useEvidenceForm({ allowed, kind: evidenceKind, sourceReference });

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
    aiFieldsValid &&
    evidenceForm.unmet.length === 0 &&
    (!correcting || reason.trim().length >= 12);
  // Every reason the submit waits, in words (Q4l).
  const unmet = [
    ...(kind === '' ? ['choose the fact'] : []),
    ...(kind !== '' && !valueValid ? ['give the value'] : []),
    ...(!unitValid ? ['give the currency code'] : []),
    ...(asOf === '' ? ['give the as-of date'] : []),
    ...(correcting && reason.trim().length < 12 ? ['say why it is being corrected, in at least 12 characters'] : []),
    ...(provenance.trim().length < 12 ? ['state the provenance, in at least 12 characters'] : []),
    ...(evidenceKind === '' ? ['choose the evidence kind'] : []),
    ...evidenceForm.unmet,
    ...(confidence === '' ? ['choose the confidence you state'] : []),
    ...(sourceVerified === '' ? ['say whether the source was opened and confirmed'] : []),
    ...(aiSourced === '' ? ['say whether a model located it'] : []),
    ...(aiSourced === 'true' && !aiFieldsValid ? ['name the research query and tool'] : []),
  ];

  return (
    <GovernedForm<AddFactResponse>
      path={
        correcting
          ? `/api/institutions/${institutionId}/facts/${correcting.id}/supersede`
          : `/api/institutions/${institutionId}/facts`
      }
      provenanceLabel={
        correcting ? 'Provenance — where the corrected value came from' : 'Provenance — where this fact came from'
      }
      submitLabel={correcting ? 'Record correction' : 'Record fact'}
      canSubmit={canSubmit}
      unmet={unmet}
      buildBody={() => ({
        ...(correcting ? { supersession_reason: reason } : { kind }),
        ...evidenceForm.body(),
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
          <p className="m-0">
            {correcting
              ? 'Correction recorded with its evidence. The earlier value is kept in the history.'
              : 'Fact recorded with its evidence.'}
          </p>
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
                  <option key={k} value={k}>{label(EVIDENCE_KIND, k)}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className={LABEL_CLASS}>Confidence (as you state it)</span>
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
            <div className="sm:col-span-2">{evidenceForm.fields}</div>
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
          {correcting ? null : (
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
          )}
          {correcting && (
            <label className="block sm:col-span-2">
              <span className={LABEL_CLASS}>Why it is being corrected (required)</span>
              <textarea
                required
                minLength={12}
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className={INPUT_CLASS}
              />
              <p className={HELP_CLASS}>
                Kept with the earlier value — e.g. "Typed LVAF for LVRF at capture; the provenance says LVRF."
              </p>
            </label>
          )}
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
 * A fact's earlier values, newest first. Labelled "Superseded" and set in
 * muted text so none can be read as current; each says why it was replaced,
 * by whom and when. Kept exactly as recorded — typos included.
 */
function FactHistory({ kind, entries }: { kind: InstitutionFactKind; entries: InstitutionFactHistoryEntry[] }) {
  return (
    <ol className="m-0 mt-2 list-none border-l-2 border-rule-soft p-0 pl-3">
      {entries.map((h) => (
        <li key={h.id} className="py-1.5 text-[11.5px] text-ink-45">
          <span className="mr-1.5 text-[9.5px] font-semibold uppercase tracking-[.13em]">Superseded</span>
          <span className="text-ink-45">{factValue(kind, h)}</span>
          <span className="block">
            As of {h.as_of} · {h.provenance} · {h.evidence_kind} · {h.source_verified ? 'verified' : 'unverified'} ·
            recorded by {h.captured_by}, {when(h.created_at)}
          </span>
          <span className="block">
            Replaced {when(h.superseded_at)} by {h.superseded_by}: “{h.supersession_reason}”
          </span>
        </li>
      ))}
    </ol>
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
  const [correctingId, setCorrectingId] = useState<string | null>(null);
  const [openHistory, setOpenHistory] = useState<Set<string>>(new Set());
  const toggleHistory = (id: string) =>
    setOpenHistory((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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
                      <span className="text-[13.5px] font-semibold text-ink">{factValue(f.kind, f)}</span>
                      <span className="flex items-center gap-1.5">
                        {/* Q9 (O1): the derived D2 basis — computed by the server's one function. */}
                        {f.basis && <Badge tone="neutral">{f.basis.replace(/_/g, ' ')}</Badge>}
                        {f.ai_sourced && <Badge tone="warning">AI-sourced</Badge>}
                        <Badge tone={f.source_verified ? 'healthy' : 'warning'}>
                          {f.source_verified ? 'Verified' : 'Unverified'}
                        </Badge>
                      </span>
                    </div>
                    <span className="block text-[11.5px] text-ink-45">
                      As of {f.as_of} · {f.provenance}
                    </span>
                    {/* Q4i: opening the citation (H1) is its own fact, shown apart from the
                        Unverified badge, which is source_verified (the disclosure gate). */}
                    {f.citation_resolved && (
                      <span className="block text-[11.5px] text-healthy" data-testid="citation-opened">
                        Citation opened by {f.citation_resolved_by ?? 'an unnamed reviewer'}, {f.citation_resolved_at}
                      </span>
                    )}
                    {/* P1: what it rests on, and a figure check that flagged. */}
                    <EvidenceRestsOn e={f} statedBy={f.captured_by} statedOn={f.created_at} />
                    <FigureCheckLine check={f.figure_check} />
                    <span className="block text-[10.5px] text-ink-45">
                      {label(EVIDENCE_KIND, f.evidence_kind)} · confidence stated by the analyst: {f.confidence} · {f.captured_by}
                    </span>
                    <span className="mt-1.5 flex flex-wrap items-center gap-2">
                      {f.history.length > 0 && (
                        <button
                          type="button"
                          aria-expanded={openHistory.has(f.id)}
                          onClick={() => toggleHistory(f.id)}
                          className={'text-[11px] text-gold-ink underline-offset-2 hover:underline ' + FOCUS_RING}
                        >
                          Corrected {when(f.created_at)} by {f.captured_by} · {f.history.length} earlier{' '}
                          {f.history.length === 1 ? 'value' : 'values'} {openHistory.has(f.id) ? '▴' : '▾'}
                        </button>
                      )}
                      {correctingId !== f.id && (
                        <button type="button" onClick={() => setCorrectingId(f.id)} className={BUTTON_CLASS + FOCUS_RING}>
                          Correct…
                        </button>
                      )}
                    </span>
                    {openHistory.has(f.id) && <FactHistory kind={f.kind} entries={f.history} />}
                    {correctingId === f.id && (
                      <div className="mt-3 border-l-2 border-rule pl-3">
                        {/* What is being corrected, read first — GovernedForm
                            draws its provenance block ahead of its fields. */}
                        <div className="mb-3">
                          <span className={LABEL_CLASS}>Correcting</span>
                          <p className="m-0 text-[13px] text-ink">
                            {KIND_LABEL[f.kind]}: {factValue(f.kind, f)}{' '}
                            <span className="text-ink-45">(as of {f.as_of})</span>
                          </p>
                          <p className={HELP_CLASS}>
                            The kind stays {KIND_LABEL[f.kind].toLowerCase()}. This value is kept in the history, not
                            overwritten.
                          </p>
                        </div>
                        <FactForm
                          institutionId={institutionId}
                          correcting={f}
                          onRecorded={() => {
                            setCorrectingId(null);
                            onRecorded();
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => setCorrectingId(null)}
                          className={'mt-2 text-[11px] text-ink-45 hover:text-ink ' + FOCUS_RING}
                        >
                          Cancel
                        </button>
                      </div>
                    )}
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
          <FactForm key={facts.length} institutionId={institutionId} onRecorded={onRecorded} />
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className={BUTTON_CLASS + FOCUS_RING}
          >
            Add a fact
          </button>
        )}
      </div>
    </Card>
  );
}
