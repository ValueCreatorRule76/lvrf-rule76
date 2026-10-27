import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { apiFetch } from '../api/http';
import { day } from '../lib/workspaceStatus';
import { formatQuantity } from '../lib/format';
import { supportsShort } from '../lib/labels';
import { SystemExerciseLine, type SystemExerciseMark } from '../components/SystemExercise';

const isMark = (v: unknown): v is SystemExerciseMark => typeof v === 'object' && v !== null && 'reason' in v;

/**
 * P2 (LVRF_PLAN §10; design §2.4, §4) — /lineage/:table/:id: where a figure
 * came from, each step with what, who, when and its source. Reads only
 * (GET /api/lineage/:table/:id). History before governance acts is labelled
 * "from the record", never shown as an act (P2-D2); a sealed run's outcome
 * evidence is labelled "matched by kind, summary and source; not sealed by id"
 * (P2-D7). Prints.
 */

interface Step {
  step: number; kind: string; row_table: string | null; row_id: string | null;
  actor: string | null; at: string | null; source: 'act' | 'record' | 'seal'; detail: Record<string, unknown> | null;
}
interface Lineage { table: string; id: string; figure: string | null; steps: Step[] }

const TITLE: Record<string, string> = {
  institution_facts: 'A fact', institution_entities: 'An entity', industry_measures: 'A pack measure', evidence: 'A piece of evidence',
};
const KIND: Record<string, string> = {
  prompt: 'Research prompt', import: 'Research import', result: 'Research result', accept: 'Accepted', reject: 'Rejected', pending: 'Not yet reviewed',
  origin: 'Origin', evidence: 'Evidence', open_citation: 'Citation opened', attested: 'Attested', figure_check: 'Figure check',
  fact: 'The fact', entity: 'The entity', measure: 'The pack measure', supersedes: 'Corrects an earlier one', superseded_by: 'Corrected since',
  withdrawn: 'Withdrawn', link: 'Linked to the outcome', correct: 'Link corrected', seal: 'Sealed in a run', erratum: 'Erratum',
  baseline: 'The baseline', actual: 'The actual', verify: 'Verified',
};
const SOURCE: Record<Step['source'], string> = { act: 'recorded as an act', record: 'from the record', seal: 'sealed' };
const str = (v: unknown) => (v === null || v === undefined ? '' : String(v));

function What({ s }: { s: Step }) {
  const d = s.detail ?? {};
  const note = str(d.note);
  switch (s.kind) {
    case 'prompt': return <>{note || <>phase {str(d.phase)} · contract v{str(d.contract_version)} · SHA-256 <span className="font-mono">{str(d.prompt_sha256).slice(0, 12)}…</span></>}</>;
    case 'import': return <>{note || <>{Number(d.byte_length).toLocaleString('en-GB')} bytes · SHA-256 <span className="font-mono">{str(d.raw_sha256).slice(0, 12)}…</span></>}</>;
    case 'result': return <>{str(d.field)} · {d.found ? 'found' : 'not found'} · {str(d.research_tool)}</>;
    case 'evidence': {
      const loc = d.locator as Record<string, unknown> | null;
      return (
        <>
          {str(d.kind).replace(/_/g, ' ')} · {str(d.basis)} — {str(d.summary)}
          {d.quote_text ? <span className="block">“{str(d.quote_text)}”</span> : null}
          {loc ? <span className="block">{[loc.document, loc.table, loc.row, loc.column].filter(Boolean).map(str).join(' · ')}: {str(loc.value)} ({str(loc.scale)})</span> : null}
          {d.how_read ? <span className="block text-ink-45">How it was read: {str(d.how_read)}</span> : null}
          <span className="block text-ink-45">Source: {str(d.provenance)}</span>
          {/* C3: an attester's customer-side role with its source, or why not; the row's system-exercise mark. */}
          {d.attested_by ? (d.attester_roles
            ? <span className="block text-ink-45" data-testid="lineage-attester-role">Attested by {str(d.attested_by)}: {str(d.attester_roles)}</span>
            : <span className="block text-warning" data-testid="lineage-attester-role">Attested by {str(d.attested_by)}, who is not customer-side ({str(d.attester_not_customer_side)}): no credit under the C3 rule.</span>) : null}
          {isMark(d.system_exercise) ? <SystemExerciseLine mark={d.system_exercise} className="mt-0.5" /> : null}
        </>
      );
    }
    case 'open_citation': return <>{d.source_verified ? 'source verified' : 'opened; stays unverified'}{note ? <span className="block text-ink-45">{note}</span> : null}</>;
    case 'figure_check': return <>{str(d.result)}: {str(d.detail)}</>;
    case 'fact': return <>{str(d.kind).replace(/_/g, ' ')}: {d.value_numeric !== null && d.value_numeric !== undefined ? formatQuantity(d.value_numeric as number | string, (d.unit as string | null) ?? null) : str(d.value_text)} (as of {day(str(d.as_of))})</>;
    case 'entity': return <>{str(d.legal_name)} · {str(d.identifier_type)} {str(d.identifier)}</>;
    case 'measure': return <>{str(d.name)} · {str(d.unit)} · {str(d.status)}</>;
    case 'baseline': case 'actual': return <>{str(d.metric)}: {d.value === null || d.value === undefined ? 'not recorded' : formatQuantity(d.value as number | string, (d.unit as string | null) ?? null)}{d.measured_at ? ` (measured ${day(str(d.measured_at))})` : ''}</>;
    case 'link': case 'correct': return (
      <span className={d.current ? '' : 'line-through'} data-testid={d.current ? 'lineage-link-current' : 'lineage-link-withdrawn'}>
        supports {supportsShort(str(d.supports))}{d.corrects_supports ? `, correcting ${supportsShort(str(d.corrects_supports))}: ${str(d.reason)}` : ''}
        {note ? <span className="block text-ink-45 no-underline">{note}</span> : null}
      </span>
    );
    case 'withdrawn': return <span data-testid="lineage-withdrawal">{d.supports ? `the link supporting ${supportsShort(str(d.supports))} withdrawn: ` : 'withdrawn: '}{str(d.reason)}{note ? <span className="block text-ink-45">{note}</span> : null}</span>;
    case 'seal': return (
      <>
        <Link to={`/runs/${s.row_id}`} className="underline">Run {str(d.run_number)}</Link>{d.locked ? ', locked' : ''} · <span className="font-mono">{str(d.payload_hash).slice(0, 12)}…</span>
        {d.sealed_supports ? ` · sealed as support for ${supportsShort(str(d.sealed_supports)).replace(/^(?!the )/, 'the ')}` : ''}
        {d.sealed_baseline !== undefined ? ` · sealed baseline ${d.sealed_baseline === null ? 'none' : formatQuantity(d.sealed_baseline as number | string, null)}, actual ${d.sealed_actual === null ? 'none' : formatQuantity(d.sealed_actual as number | string, null)}` : ''}
        {/* P2 review: the errata recorded after this seal, beside it (the sealed record is never changed). */}
        {Array.isArray(d.errata) && (d.errata as Record<string, unknown>[]).map((x) => (
          <span key={str(x.id)} className="block text-warning" data-testid="lineage-seal-erratum">
            Erratum recorded after sealing, {day(str(x.recorded_at))}, by {str(x.recorded_by)}{x.supersedes ? ' (it supersedes an earlier erratum)' : ''}: {str(x.what_was_wrong)} {x.kind === 'non_customer_credit' ? `${Number(x.points_not_credited)} points rest on a person not customer-side; the sealed score stands` : x.recomputed === null ? 'Not recomputed' : `Recomputed ${Number(x.recomputed)} / 100`} (sealed {Number(x.sealed)} / 100).
          </span>
        ))}
        {d.matched ? <span className="block text-ink-45">{str(d.matched)}</span> : null}
        {isMark(d.system_exercise) ? <SystemExerciseLine mark={d.system_exercise} className="mt-0.5" /> : null}
      </>
    );
    case 'erratum': return <><span className={d.superseded ? 'line-through' : ''}>run {str(d.run_number)}: sealed {Number(d.sealed)} / 100, {d.recomputed === null ? 'not recomputed' : `recomputed ${Number(d.recomputed)} / 100`}{d.superseded ? ' (superseded)' : ''}</span>{note ? <span className="block text-ink-45">{note}</span> : null}</>;
    default: return <>{str(d.reason)}{note ? <span className="block text-ink-45">{note}</span> : null}</>;
  }
}

export function LineagePage() {
  const { table = '', id = '' } = useParams();
  const [params] = useSearchParams();
  const figure = params.get('figure');
  const [state, setState] = useState<{ status: 'loading' } | { status: 'ok'; l: Lineage } | { status: 'error'; message: string }>({ status: 'loading' });
  useEffect(() => {
    let cancelled = false;
    apiFetch(`/api/lineage/${table}/${id}${figure ? `?figure=${encodeURIComponent(figure)}` : ''}`)
      .then(async (r) => {
        const b = await r.json().catch(() => null);
        if (cancelled) return;
        setState(r.ok ? { status: 'ok', l: b as Lineage } : { status: 'error', message: (b as { message?: string } | null)?.message ?? `HTTP ${r.status}` });
      })
      .catch(() => { if (!cancelled) setState({ status: 'error', message: "Couldn't load this lineage." }); });
    return () => { cancelled = true; };
  }, [table, id, figure]);

  if (state.status === 'loading') return <p className="p-8 text-ink-45">loading</p>;
  if (state.status === 'error') return <p className="p-8 text-critical" data-testid="lineage-error">{state.message}</p>;
  const { l } = state;
  const title = l.table === 'value_outcomes' ? `An outcome's ${l.figure}` : TITLE[l.table] ?? l.table;
  return (
    <div className="mx-auto max-w-5xl px-4 pb-14 pt-6 sm:px-[30px]" data-testid="lineage">
      <header className="mb-5">
        <span className="text-[10px] font-semibold uppercase tracking-[.16em] text-ink-45">Where this came from</span>
        <h1 className="m-0 my-1.5 font-display text-[40px] leading-[.98] tracking-[.012em]">{title}</h1>
        <p className="m-0 text-[12.5px] text-ink-45">
          Each step names who and when. <strong>Recorded as an act</strong>: a governance act at the time.{' '}
          <strong>From the record</strong>: the row's own who and when, from before governance acts (25 Oct 2026), or the audit log.{' '}
          <strong>Sealed</strong>: a run's sealed record.
        </p>
      </header>
      {l.steps.length === 0
        ? <p className="m-0 text-ink-45">Nothing recorded for this row.</p>
        : (
          <ol className="m-0 list-none border border-rule bg-white p-0" data-testid="lineage-steps">
            {l.steps.map((s) => (
              <li key={s.step} className="grid grid-cols-1 gap-1 border-b border-rule-soft px-4 py-3 last:border-b-0 sm:grid-cols-[2.2rem_11rem_1fr_13rem] sm:gap-3 print:break-inside-avoid"
                data-testid="lineage-step" data-kind={s.kind} data-source={s.source}>
                <span className="font-mono text-[12px] text-ink-45">{s.step}</span>
                <span className="text-[12.5px] font-semibold text-ink">{KIND[s.kind] ?? s.kind}</span>
                <span className="text-[12.5px] text-ink [overflow-wrap:anywhere]"><What s={s} /></span>
                <span className="text-[11.5px] text-ink-45">
                  {s.actor ?? 'no one recorded'}{s.at ? `, ${day(s.at)}` : ''}
                  <span className="block">{SOURCE[s.source]}</span>
                </span>
              </li>
            ))}
          </ol>
        )}
      <footer className="mt-4 text-[11px] text-ink-45">
        Lineage of <span className="font-mono">{l.table} {l.id}</span>{l.figure ? ` (${l.figure})` : ''} · rendered from the record as it stands{' '}
        <span className="hidden print:inline">· printed {day(new Date().toISOString())}</span>
      </footer>
    </div>
  );
}
