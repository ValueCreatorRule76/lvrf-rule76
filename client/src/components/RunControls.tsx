import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../api/http';
import { GovernedForm, FOCUS_RING } from './GovernedForm';
import { shortId } from '../lib/shortId';

/**
 * Producing and locking a run: one component for the outside-in walk (W7's later runs, W8) and for the tenant's own
 * account (card 05), which has no walk (Brad, 6 Nov 2026; B4's Act 5 found it had no Produce button). The same routes
 * and so the same acts: POST /api/engagements/:id/produce-run and POST /api/value-runs/:id/lock. The produce form takes
 * W7's three fields (banner, note, run source label).
 */
const INPUT_CLASS = 'w-full border border-rule bg-white px-2.5 py-1.5 text-[13px] text-ink ' + FOCUS_RING;
const LABEL_CLASS = 'mb-1 block text-[10px] font-semibold uppercase tracking-[.16em] text-ink-45';

/**
 * Q4l: a second (or later) run, once the latest is locked — e.g. after an
 * AI-sourced citation is opened, so the new run seals the opened state.
 * The same route as W7's first run; nothing earlier changes.
 */
export function NewRun({ engId, next, banner, onDone }: { engId: string; next: number; banner: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ banner_title: banner, note: '', source_fixture: '' });
  if (!open) {
    return (
      <div className="mt-1">
        <button type="button" onClick={() => setOpen(true)} data-testid="new-run-open"
          className={'border border-silver px-2.5 py-1 text-[9.5px] font-semibold uppercase tracking-[.1em] text-ink-45 hover:border-ink hover:text-ink ' + FOCUS_RING}>
          Produce a new run…
        </button>
      </div>
    );
  }
  return (
    <div className="mt-2 border-t border-rule-soft pt-2" data-testid="new-run">
      <GovernedForm<{ value_run_id: string }>
        path={`/api/engagements/${engId}/produce-run`} provenanceLabel="What this records"
        provenance={<p className="m-0 text-[12.5px] text-ink">Run {next}: the outcome, its evidence and its confidence as they stand now, snapshotted. Earlier runs keep what they sealed. Not locked until you lock it.</p>}
        fields={<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block"><span className={LABEL_CLASS}>Banner</span>
            <input className={INPUT_CLASS} value={v.banner_title} onChange={(e) => setV({ ...v, banner_title: e.target.value })} data-testid="new-run-banner" /></label>
          <label className="block"><span className={LABEL_CLASS}>Note (required)</span>
            <input className={INPUT_CLASS} value={v.note} placeholder="What changed since the last run, e.g. the citation was opened" onChange={(e) => setV({ ...v, note: e.target.value })} data-testid="new-run-note" /></label>
          <label className="block sm:col-span-2"><span className={LABEL_CLASS}>Run source label (required)</span>
            <input className={INPUT_CLASS} value={v.source_fixture} onChange={(e) => setV({ ...v, source_fixture: e.target.value })} data-testid="new-run-source" /></label>
        </div>}
        canSubmit={v.banner_title.trim() !== '' && v.note.trim() !== '' && v.source_fixture.trim() !== ''}
        unmet={[...(v.banner_title.trim() === '' ? ['a banner'] : []), ...(v.note.trim() === '' ? ['a note'] : []), ...(v.source_fixture.trim() === '' ? ['a run source label'] : [])]}
        buildBody={() => v}
        submitLabel={`Produce run ${next}`}
        onSuccess={() => { setOpen(false); setV({ ...v, note: '' }); onDone(); }}
        renderSuccess={() => <>Produced.</>} />
    </div>
  );
}

/** W8: locking a run is final. */
export function LockRun({ run, primary, onDone }: { run: { id: string; run_number: number }; primary?: boolean; onDone: () => void }) {
  const [reason, setReason] = useState('');
  return (
    <GovernedForm<{ run_id: string }>
      path={`/api/value-runs/${run.id}/lock`} provenanceLabel="What this records"
      provenance={<p className="m-0 text-[12.5px] text-ink">Locking run {run.run_number} is final: the run cannot change. Earlier locked runs stay as they were.</p>}
      fields={<label className="block"><span className={LABEL_CLASS}>Lock reason</span>
        <textarea rows={2} className={INPUT_CLASS} value={reason} onChange={(e) => setReason(e.target.value)} data-testid="lock-reason" /></label>}
      canSubmit={reason.trim() !== ''}
      unmet={['say why the run is locked']}
      buildBody={() => ({ lock_reason: reason })}
      primary={primary} submitLabel={`Lock run ${run.run_number}`} onSuccess={() => { setReason(''); onDone(); }} renderSuccess={() => <>Locked.</>} />
  );
}

interface EngagementRun { id: string; run_number: number; locked_at: string | null; confidence_band: string | null; confidence_score: string | null }

/**
 * Card 05 on the tenant's own account: one engagement's runs, newest first, each linking to its page; "Produce a new
 * run…" when none is open, and "Lock run N" when one is.
 */
export function EngagementRuns({ engagementId, onChanged }: { engagementId: string; onChanged?: () => void }) {
  const [runs, setRuns] = useState<EngagementRun[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    apiFetch(`/api/engagements/${engagementId}/runs`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((rows: EngagementRun[]) => { if (live) { setRuns(rows); setFailed(false); } })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [engagementId, tick]);
  const reload = () => { setTick((t) => t + 1); onChanged?.(); };
  if (failed) return <p className="m-0 text-[12px] text-ink-45">Couldn&apos;t read this engagement&apos;s runs.</p>;
  if (!runs) return <p className="m-0 text-[12px] text-ink-45">Reading the runs…</p>;
  const open = runs.find((r) => !r.locked_at) ?? null;
  const next = runs.reduce((m, r) => Math.max(m, r.run_number), 0) + 1;
  return (
    <div className="mt-1" data-testid="engagement-runs" data-engagement={engagementId}>
      {runs.length === 0 ? <p className="m-0 text-[12px] text-ink-45">No run yet.</p> : (
        <ul className="m-0 list-none p-0">
          {runs.map((r) => (
            <li key={r.id} className="py-0.5 text-[12.5px] text-ink" data-testid="engagement-run" data-locked={r.locked_at ? 'true' : 'false'}>
              <Link to={`/runs/${r.id}`} className={'font-semibold text-gold-ink ' + FOCUS_RING}>Run {r.run_number}</Link>
              {' '}<span className="font-mono text-[11px] text-ink-45" data-testid="run-short-id">{shortId(r.id)}</span> · {r.locked_at ? `locked ${r.locked_at.slice(0, 10)}` : 'not locked'} · confidence {r.confidence_band ?? '—'}{r.confidence_score !== null ? ` ${r.confidence_score}` : ''}
            </li>))}
        </ul>)}
      {open ? (
        <div className="mt-2 border-t border-rule-soft pt-2" data-testid="lock-run">
          <LockRun run={open} onDone={reload} />
        </div>
      ) : <NewRun engId={engagementId} next={next} banner="OUTSIDE-IN HYPOTHESIS" onDone={reload} />}
    </div>
  );
}
