import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../api/http';
import { useActor } from '../actor/ActorContext';
import { FOCUS_RING, GovernedForm } from './GovernedForm';

/**
 * C3 (LVRF_PLAN §12; Brad's rulings, 26 Oct 2026) — the steward's two batches, each a dry run read first,
 * then one submit carrying the count it showed; the server re-reads the list and refuses if it changed.
 *   - the errata the seals call for: points a seal credited to a person not customer-side, one per run;
 *   - system-exercise marks: every unmarked evidence row and run, each with its own note; nothing pre-ticked.
 */
const H2 = 'm-0 font-display text-[22px] tracking-[.03em] text-ink';
const L = 'mb-1 block text-[10px] font-semibold uppercase tracking-[.16em] text-ink-45';
const I = 'w-full border border-rule bg-white px-2.5 py-1.5 text-[13px] text-ink ' + FOCUS_RING;

interface CreditErratum { run_id: string; run_number: number; engagement: string; account: string; points: number; sealed_score: number; text: string }
interface Candidate { subject_table: 'evidence' | 'value_runs'; subject_id: string; account: string; label: string; note: string }
interface Marked { subject_table: string; subject_id: string; reason: string; marked_by: string; marked_on: string }

function useJson<T>(path: string, reload: number): T | null | 'error' {
  const [v, setV] = useState<T | null | 'error'>(null);
  useEffect(() => {
    let cancelled = false;
    apiFetch(path).then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j) => { if (!cancelled) setV(j as T); }, () => { if (!cancelled) setV('error'); });
    return () => { cancelled = true; };
  }, [path, reload]);
  return v;
}

export function CreditErrataBatch() {
  const { actor } = useActor();
  const [reload, setReload] = useState(0);
  const [reason, setReason] = useState('');
  const data = useJson<{ count: number; errata: CreditErratum[] }>('/api/errata/non-customer-credit', reload);
  const [recorded, setRecorded] = useState<number | null>(null);
  const notSteward = actor?.is_steward ? undefined : `Recording these errata is the steward's act — ${actor?.steward_name ?? "the tenant's steward"}'s alone.`;
  return (
    <section className="mt-8 flex flex-col gap-3" data-testid="credit-errata-batch">
      <h2 className={H2}>Errata the seals call for</h2>
      <p className="m-0 max-w-[90ch] text-[12.5px] text-ink-45">
        Each locked run whose seal credited points to a person who is not customer-side under the C3 rule (a role named from a source).
        Read from each seal; the sealed scores stand. This list writes nothing.
      </p>
      {data === null ? <p className="m-0 text-[12.5px] text-ink-45">Reading the seals…</p>
        : data === 'error' ? <p className="m-0 text-[12.5px] text-critical">Couldn&apos;t read the list.</p>
          : <>
            {recorded !== null && <p className="m-0 text-[13px] text-healthy" data-testid="credit-errata-recorded">Recorded {recorded}.</p>}
            <p className="m-0 text-[13px] text-ink" data-testid="credit-errata-count">{data.count === 0 ? 'No run calls for one.' : `${data.count} run${data.count === 1 ? ' calls' : 's call'} for one.`}</p>
            {data.count > 0 && (
              <ul className="m-0 list-none border border-rule bg-white p-0" data-testid="credit-errata-list">
                {data.errata.map((e) => (
                  <li key={e.run_id} className="border-b border-rule-soft px-4 py-2 text-[12px] last:border-b-0" data-testid="credit-erratum-candidate">
                    <Link to={`/runs/${e.run_id}`} className={'font-semibold text-ink hover:text-gold-ink ' + FOCUS_RING}>{e.account} · {e.engagement}, run {e.run_number}</Link>
                    <span className="text-ink-45"> · {e.points} points · sealed {e.sealed_score} / 100</span>
                    <span className="block text-ink-70">{e.text}</span>
                  </li>))}
              </ul>
            )}
            {data.count > 0 && (
              <GovernedForm<{ recorded: number }>
                path="/api/errata/non-customer-credit"
                provenanceLabel="What this records"
                provenance={<p className="m-0 text-[12.5px] text-ink">One erratum beside each run listed, by you, dated, each with its act. <strong>No sealed run is changed</strong>, and no score is recomputed: each erratum states the points from its seal.</p>}
                fields={<label className="block"><span className={L}>Why they are recorded</span>
                  <textarea rows={2} className={I} value={reason} onChange={(ev) => setReason(ev.target.value)} /></label>}
                confirm={<span data-testid="confirm-text">Record {data.count} errata, one beside each run listed. If the seals now call for a different number, nothing is recorded.</span>}
                disabledReason={notSteward}
                canSubmit={reason.trim().length >= 12}
                unmet={reason.trim().length < 12 ? ['say why, in at least 12 characters'] : []}
                buildBody={() => ({ expected_count: data.count, reason: reason.trim() })}
                submitLabel={`Record the ${data.count} errata`}
                onSuccess={(d) => { setReason(''); setRecorded(d.recorded); setReload((n) => n + 1); }}
                renderSuccess={(d) => <>Recorded {d.recorded}.</>}
              />
            )}
          </>}
    </section>
  );
}

export function SystemExerciseBatch() {
  const { actor } = useActor();
  const [reload, setReload] = useState(0);
  const [ticked, setTicked] = useState<Record<string, boolean>>({});
  const data = useJson<{ candidates: Candidate[]; marked: Marked[] }>('/api/system-exercise/candidates', reload);
  const notSteward = actor?.is_steward ? undefined : `Marking items as a system exercise is the steward's act — ${actor?.steward_name ?? "the tenant's steward"}'s alone.`;
  const key = (c: { subject_table: string; subject_id: string }) => `${c.subject_table}|${c.subject_id}`;
  const chosen = data && data !== 'error' ? data.candidates.filter((c) => ticked[key(c)]) : [];
  return (
    <section className="mt-8 flex flex-col gap-3" data-testid="system-exercise-batch">
      <h2 className={H2}>Mark system exercises</h2>
      <p className="m-0 max-w-[90ch] text-[12.5px] text-ink-45">
        Every evidence row and run not yet marked, each with its own note as the record holds it. Tick the ones entered to exercise the
        system rather than as case evidence; nothing is ticked for you. A mark is never undone, and nothing is deleted.
      </p>
      {data === null ? <p className="m-0 text-[12.5px] text-ink-45">Reading the record…</p>
        : data === 'error' ? <p className="m-0 text-[12.5px] text-critical">Couldn&apos;t read the list.</p>
          : <>
            <ul className="m-0 max-h-[60vh] list-none overflow-y-auto border border-rule bg-white p-0" data-testid="system-exercise-candidates">
              {data.candidates.map((c) => (
                <li key={key(c)} className="border-b border-rule-soft px-4 py-2 text-[12px] last:border-b-0" data-testid="system-exercise-candidate" data-subject={key(c)}>
                  <label className="flex gap-2">
                    <input type="checkbox" disabled={Boolean(notSteward)} checked={Boolean(ticked[key(c)])}
                      onChange={(ev) => setTicked((t) => ({ ...t, [key(c)]: ev.target.checked }))} className={FOCUS_RING} />
                    <span>
                      <span className="font-semibold text-ink">{c.account} · {c.subject_table === 'value_runs' ? 'run' : 'evidence'} · {c.label}</span>
                      <span className="block text-ink-70 [overflow-wrap:anywhere]">“{c.note}”</span>
                    </span>
                  </label>
                </li>))}
            </ul>
            <GovernedForm<{ marked: number }>
              path="/api/system-exercise/marks"
              provenanceLabel="What this records"
              provenance={<p className="m-0 text-[12.5px] text-ink">A mark on each ticked item, by you, dated, each with its act. Each mark&apos;s reason reads: &ldquo;Entered to exercise the system, not as case evidence; its own note reads: &lsquo;…&rsquo;&rdquo;, quoting the item. <strong>Nothing is deleted</strong>; a marked run is never a headline.</p>}
              fields={<p className="m-0 text-[12.5px] text-ink" data-testid="system-exercise-ticked">{chosen.length} ticked.</p>}
              confirm={<span data-testid="confirm-text">Mark {chosen.length} item{chosen.length === 1 ? '' : 's'} as a system exercise: {chosen.map((c) => `${c.account} · ${c.label}`).join('; ')}. If the list changed, nothing is marked.</span>}
              disabledReason={notSteward}
              canSubmit={chosen.length > 0}
              unmet={chosen.length === 0 ? ['tick at least one item'] : []}
              buildBody={() => ({ items: chosen.map((c) => ({ subject_table: c.subject_table, subject_id: c.subject_id })), expected_count: chosen.length })}
              submitLabel="Mark the ticked items"
              onSuccess={() => { setTicked({}); setReload((n) => n + 1); }}
              renderSuccess={(d) => <>Marked {d.marked}.</>}
            />
            {data.marked.length > 0 && (
              <details className="text-[12px] text-ink-45" data-testid="system-exercise-marked">
                <summary className={'cursor-pointer ' + FOCUS_RING}>{data.marked.length} already marked</summary>
                <ul className="m-0 list-none p-0">{data.marked.map((m) => <li key={key(m)} className="py-0.5">{m.subject_table === 'value_runs' ? 'run' : 'evidence'} · marked by {m.marked_by}, {m.marked_on}: {m.reason}</li>)}</ul>
              </details>
            )}
          </>}
    </section>
  );
}
