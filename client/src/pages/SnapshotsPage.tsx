import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { apiFetch } from '../api/http';
import { MARKER_KIND, type MarkerKind } from '../api/pov';
import { FOCUS_RING } from '../components/GovernedForm';
import { Card, Badge } from '../components/workbench/Card';
import { SystemExerciseLine, type SystemExerciseMark } from '../components/SystemExercise';
import { CaseSealed, type SealedCase } from '../components/snapshots/CaseSealed';
import { ConfidenceCurve } from '../components/snapshots/ConfidenceCurve';

interface SnapRun {
  id: string; run_number: number; locked_at: string | null; locked_by: string | null; lock_reason: string | null;
  score: number; band: string; stage: string; payload_hash: string; superseded_by_id: string | null; payload_version: number;
  value_outcome_id: string | null; realization: string | null; baseline_value: number | null; target_value: number | null; actual_value: number | null;
  metric: string | null; model_version: string | null; model_fingerprint: string | null; erratum_line: string | null;
  errata: { kind: string; recomputed_score: number | null }[]; system_exercise: SystemExerciseMark | null; case: SealedCase | null;
}
interface Snapshots { engagement: { id: string; name: string; account: string; institution_id: string; retired: boolean }; reference_example: { kind: MarkerKind; source_citation: string } | null; runs: SnapRun[] }
interface CaseDiff {
  sealed: 'both' | 'one' | 'neither'; note: string | null;
  evidence: { added: { evidence_id: string | null; summary: string; supports: string }[]; removed: { evidence_id: string | null; summary: string; supports: string }[] };
  hypotheses?: { added: { id: string; statement: string }[]; removed: { id: string; statement: string }[]; changed: { id: string; statement: string; what: string[] }[] };
  offerings?: { added: string[]; removed: string[] }; summaries?: { lens: string; from_version: number | null; to_version: number | null }[];
  pack_entry?: { changed: boolean }; marker?: { changed: boolean; from: string | null; to: string | null }; findings?: { added: number; removed: number };
}
interface Compare { confidence: { score_from: number; score_to: number; delta: number; band_from: string; band_to: string }; model: { comparable: boolean; note: string }; case: CaseDiff }

const fig = (v: number | null) => (v === null || v === undefined ? 'not recorded' : String(v));

/** What changed between two sealed runs, from compare: no narrative and no recommendation (CS-D6). */
function Changed({ from, to }: { from: SnapRun; to: SnapRun }) {
  const [c, setC] = useState<Compare | 'error' | null>(null);
  useEffect(() => {
    let cancelled = false;
    apiFetch(`/api/value-runs/${from.id}/compare/${to.id}`).then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j) => { if (!cancelled) setC(j as Compare); }, () => { if (!cancelled) setC('error'); });
    return () => { cancelled = true; };
  }, [from.id, to.id]);
  if (c === null) return <p className="m-0 text-[11.5px] text-ink-45">loading</p>;
  if (c === 'error') return <p className="m-0 text-[11.5px] text-ink-70" data-testid="changed-unavailable">Couldn&apos;t compare run {from.run_number} with run {to.run_number}.</p>;
  const d = c.case;
  const lines: string[] = [];
  if (d.sealed === 'both') {
    for (const h of d.hypotheses?.added ?? []) lines.push(`Hypothesis stated: “${h.statement}”`);
    for (const h of d.hypotheses?.removed ?? []) lines.push(`Hypothesis no longer sealed: “${h.statement}”`);
    for (const h of d.hypotheses?.changed ?? []) lines.push(`“${h.statement.slice(0, 60)}”: ${h.what.join('; ')}`);
    for (const k of d.offerings?.added ?? []) lines.push(`Offering added: ${k}`);
    for (const k of d.offerings?.removed ?? []) lines.push(`Offering removed: ${k}`);
    for (const s of d.summaries ?? []) lines.push(`Summary (${s.lens}): version ${s.from_version ?? 'none'} → ${s.to_version ?? 'none'}`);
    if (d.pack_entry?.changed) lines.push('The pack entry changed (its fingerprint differs)');
    if (d.marker?.changed) lines.push(`Marker: ${d.marker.from ?? 'none'} → ${d.marker.to ?? 'none'}`);
    if (d.findings && (d.findings.added || d.findings.removed)) lines.push(`Findings: ${d.findings.added} added, ${d.findings.removed} removed`);
  }
  for (const e of d.evidence.added) lines.push(`Evidence sealed: ${e.summary} (${e.supports.replace(/_/g, ' ')})`);
  for (const e of d.evidence.removed) lines.push(`Evidence no longer sealed: ${e.summary} (${e.supports.replace(/_/g, ' ')})`);
  return (
    <div className="text-[11.5px]" data-testid="changed" data-sealed={d.sealed}>
      <p className="m-0 text-ink-70">Run {from.run_number} → run {to.run_number}: {c.confidence.score_from} → {c.confidence.score_to} / 100 ({c.confidence.delta > 0 ? '+' : ''}{c.confidence.delta}). {c.model.comparable ? '' : c.model.note}</p>
      {d.note && <p className="m-0 text-ink-45" data-testid="changed-note">{d.note}</p>}
      {d.sealed === 'both' && lines.length === 0 && <p className="m-0 text-ink-45" data-testid="changed-none">Nothing in the sealed case changed.</p>}
      {lines.length > 0 && <ul className="m-0 list-disc pl-5 text-ink-70">{lines.map((l, i) => <li key={i}>{l}</li>)}</ul>}
    </div>
  );
}

/**
 * §16 (LVRF_PLAN; CS-D1–D6): each run of an engagement as it was sealed, the confidence curve, and what changed between
 * runs. Read-only. Rule 6: the disclosure banner prints on every page; a reference example says so (O-D3).
 */
export function SnapshotsPage() {
  const { id } = useParams<{ id: string }>();
  const [d, setD] = useState<Snapshots | 'not_found' | 'error' | null>(null);
  const [pick, setPick] = useState<{ a: string; b: string }>({ a: '', b: '' });
  useEffect(() => {
    let cancelled = false;
    setD(null);
    apiFetch(`/api/engagements/${id}/snapshots`).then(async (r) => {
      if (cancelled) return;
      if (r.status === 404) { setD('not_found'); return; }
      if (!r.ok) { setD('error'); return; }
      setD(await r.json() as Snapshots);
    }, () => { if (!cancelled) setD('error'); });
    return () => { cancelled = true; };
  }, [id]);
  if (d === null) return <p className="p-8 text-ink-45">loading</p>;
  if (d === 'not_found') return <p className="p-8 text-ink-45" data-testid="snapshots-not-found">This engagement was not found.</p>;
  if (d === 'error') return <p className="p-8 text-ink-70">Couldn&apos;t load this engagement&apos;s runs. Reload the page to try again.</p>;
  const locked = d.runs.filter((r) => r.locked_at !== null);
  const unlocked = d.runs.length - locked.length;
  const unverified = locked.some((r) => r.realization !== 'verified');
  const latest = locked[locked.length - 1];
  const banners = (
    <div data-testid="banners">
      {d.reference_example && <div className="bg-ink px-6 py-2 font-mono text-[12px] tracking-[.04em] text-gold [overflow-wrap:anywhere]" data-testid="banner-reference">{MARKER_KIND[d.reference_example.kind].banner}</div>}
      {unverified && <div className="border-b border-warning bg-white px-6 py-2 font-mono text-[12px] tracking-[.04em] text-warning" data-testid="banner-unverified">UNVERIFIED — not every run on this page has a verified actual</div>}
    </div>
  );
  const chosenA = locked.find((r) => r.id === pick.a), chosenB = locked.find((r) => r.id === pick.b);
  return (
    <div className="min-h-screen bg-offwhite print:min-h-0 print:bg-white" data-testid="snapshots">
      <div className="print:hidden">{banners}</div>
      <table className="block w-full border-collapse print:table print:table-fixed">
        <thead className="hidden print:table-header-group" data-testid="print-header"><tr className="print:table-row"><td className="p-0 print:table-cell">{banners}</td></tr></thead>
        <tfoot className="hidden print:table-footer-group" data-testid="print-footer"><tr className="print:table-row"><td className="p-0 print:table-cell">
          <p className="m-0 px-6 py-2 font-mono text-[9.5px] text-ink-45 [overflow-wrap:anywhere]">{d.engagement.account} · {d.engagement.name} · {locked.length} locked runs{latest ? ` · latest: run ${latest.run_number}, record hash ${latest.payload_hash}` : ''} · printed {new Date().toISOString().slice(0, 10)} · each run&apos;s full hash is in its row</p>
        </td></tr></tfoot>
        <tbody className="block print:table-row-group"><tr className="block print:table-row"><td className="block p-0 print:table-cell">
          <div className="mx-auto max-w-5xl px-4 pb-14 pt-6 sm:px-[30px]">
            <header className="mb-5">
              <span className="text-[10px] font-semibold uppercase tracking-[.16em] text-ink-45">Snapshots</span>
              <h1 className="m-0 my-1.5 font-display text-[34px] leading-[1] tracking-[.012em]">{d.engagement.name}{d.engagement.retired ? ' (retired)' : ''}</h1>
              <p className="m-0 text-[12.5px] text-ink-45"><Link to={`/accounts/${d.engagement.institution_id}`} className={'text-gold-ink underline ' + FOCUS_RING}>{d.engagement.account}</Link> · each run as it was sealed; nothing on this page is read live{unlocked > 0 ? ` · ${unlocked} run${unlocked === 1 ? '' : 's'} not locked, not shown` : ''}</p>
            </header>
            <Card title="The confidence curve">
              <ConfidenceCurve points={locked.map((r) => ({ run_number: r.run_number, score: r.score, band: r.band, locked_at: r.locked_at,
                model_fingerprint: r.model_fingerprint, model_version: r.model_version, value_outcome_id: r.value_outcome_id,
                erratum: r.errata.length > 0, recomputed: r.errata.find((x) => x.recomputed_score !== null)?.recomputed_score ?? null, system_exercise: r.system_exercise !== null }))} />
            </Card>
            <div className="mt-5" />
            <Card title="Each run as sealed" badge={<Badge tone="neutral">{locked.length}</Badge>}>
              <ol className="m-0 list-none p-0" data-testid="snapshot-runs">
                {locked.map((r, i) => (
                  <li key={r.id} className="border-b border-rule-soft py-3 last:border-b-0" data-testid="snapshot-run" data-run={r.run_number}>
                    <p className="m-0 text-[13px] text-ink"><Link to={`/runs/${r.id}`} className={'font-semibold text-gold-ink ' + FOCUS_RING}>Run {r.run_number}</Link> · {r.score} / 100, {r.band} · locked {r.locked_at?.slice(0, 10)} by {r.locked_by ?? 'not recorded'}{r.lock_reason ? `: ${r.lock_reason}` : ''}</p>
                    <p className="m-0 mt-0.5 text-[11.5px] text-ink-45">{r.metric ?? 'metric not sealed'}: baseline {fig(r.baseline_value)}, target {fig(r.target_value)}, actual {fig(r.actual_value)} · stage {r.stage} · {r.realization ?? 'realization not sealed'} · model {r.model_version ?? 'unknown'}{r.superseded_by_id ? ' · superseded by a later run' : ''}</p>
                    <p className="m-0 mt-0.5 text-[10.5px] text-ink-45">Record hash <span className="font-mono [overflow-wrap:anywhere]">{r.payload_hash}</span></p>
                    {r.erratum_line && <p className="m-0 mt-0.5 text-[11px] text-warning" data-testid="snapshot-erratum">{r.erratum_line}{r.errata.some((x) => x.recomputed_score !== null) ? ` Its recompute: ${r.errata.filter((x) => x.recomputed_score !== null).map((x) => `${x.recomputed_score} / 100`).join(', ')}.` : ''}</p>}
                    {r.system_exercise && <SystemExerciseLine mark={r.system_exercise} className="mt-0.5" />}
                    <details className="mt-1.5 print:hidden"><summary className="cursor-pointer text-[11.5px] font-semibold text-ink-70">The case as sealed</summary><div className="mt-1.5"><CaseSealed c={r.case} compact /></div></details>
                    {/* A closed details prints as its summary alone; the printed page carries the case itself. */}
                    <div className="mt-1.5 hidden print:block" data-testid="case-sealed-print"><div className="text-[11.5px] font-semibold text-ink-70">The case as sealed</div><div className="mt-1"><CaseSealed c={r.case} compact /></div></div>
                    {i > 0 && <div className="mt-1.5 border-l-[3px] border-rule pl-3"><Changed from={locked[i - 1]} to={r} /></div>}
                  </li>))}
              </ol>
            </Card>
            {locked.length > 2 && <div className="mt-5 print:hidden"><Card title="Compare any two runs">
              <div className="flex flex-wrap items-end gap-3">
                {(['a', 'b'] as const).map((k) => (
                  <label key={k} className="block"><span className="mb-1 block text-[10px] font-semibold uppercase tracking-[.16em] text-ink-45">{k === 'a' ? 'From' : 'To'}</span>
                    <select className={'border border-rule bg-white px-2.5 py-1.5 text-[13px] text-ink ' + FOCUS_RING} value={pick[k]} onChange={(e) => setPick({ ...pick, [k]: e.target.value })} data-testid={`compare-pick-${k}`}>
                      <option value="" disabled>— choose —</option>
                      {locked.map((r) => <option key={r.id} value={r.id}>Run {r.run_number}</option>)}
                    </select></label>))}
              </div>
              {chosenA && chosenB && chosenA.id !== chosenB.id && <div className="mt-3"><Changed from={chosenA} to={chosenB} /></div>}
            </Card></div>}
          </div>
        </td></tr></tbody>
      </table>
    </div>
  );
}
