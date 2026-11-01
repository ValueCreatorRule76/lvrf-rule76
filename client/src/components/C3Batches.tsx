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
interface UnsourcedErratum { run_id: string; run_number: number; engagement: string; account: string; sealed_score: number; line: string; text: string }
interface ErrataDryRun { count: number; errata: CreditErratum[]; unsourced_count: number; unsourced: UnsourcedErratum[]; blocked_findings: { account: string; why: string[] }[] }
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
  const data = useJson<ErrataDryRun>('/api/errata/non-customer-credit', reload);
  const [recorded, setRecorded] = useState<number | null>(null);
  const notSteward = actor?.is_steward ? undefined : `Recording these errata is the steward's act — ${actor?.steward_name ?? "the tenant's steward"}'s alone.`;
  const total = data && data !== 'error' ? data.count + data.unsourced_count : 0;
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  return (
    <section className="mt-8 flex flex-col gap-3" data-testid="credit-errata-batch">
      <h2 className={H2}>Errata the record calls for</h2>
      <p className="m-0 max-w-[90ch] text-[12.5px] text-ink-45">
        Two kinds, recorded together (C3, C3b): each locked run whose seal credited points to a person who is not customer-side (a role named from a source),
        and each locked run whose seal carries a figure a steward found to have no source on record. Read from each seal and the record; the sealed scores stand.
        This list writes nothing.
      </p>
      {data === null ? <p className="m-0 text-[12.5px] text-ink-45">Reading the seals…</p>
        : data === 'error' ? <p className="m-0 text-[12.5px] text-critical">Couldn&apos;t read the list.</p>
          : <>
            {recorded !== null && <p className="m-0 text-[13px] text-healthy" data-testid="credit-errata-recorded">Recorded {recorded}.</p>}
            <p className="m-0 text-[13px] text-ink" data-testid="credit-errata-count">{data.count === 0 ? 'No run calls for a credit erratum.' : `${plural(data.count, 'run calls', 'runs call')} for a credit erratum.`}</p>
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
            <p className="m-0 text-[13px] text-ink" data-testid="unsourced-errata-count">{data.unsourced_count === 0 ? 'No run calls for an unsourced-figure erratum.' : `${plural(data.unsourced_count, 'run calls', 'runs call')} for an unsourced-figure erratum.`}</p>
            {data.blocked_findings.map((b, i) => (
              <p key={i} className="m-0 text-[12px] text-warning" data-testid="unsourced-blocked">A finding on {b.account} calls for none: the record now holds something from {b.account} ({b.why.join('; ')}).</p>
            ))}
            {data.unsourced_count > 0 && (
              <ul className="m-0 list-none border border-rule bg-white p-0" data-testid="unsourced-errata-list">
                {data.unsourced.map((e) => (
                  <li key={e.run_id} className="border-b border-rule-soft px-4 py-2 text-[12px] last:border-b-0" data-testid="unsourced-erratum-candidate">
                    <Link to={`/runs/${e.run_id}`} className={'font-semibold text-ink hover:text-gold-ink ' + FOCUS_RING}>{e.account} · {e.engagement}, run {e.run_number}</Link>
                    <span className="text-ink-45"> · {e.line} · sealed {e.sealed_score} / 100</span>
                    <span className="block text-ink-70">{e.text}</span>
                  </li>))}
              </ul>
            )}
            {total > 0 && (
              <GovernedForm<{ recorded: number }>
                path="/api/errata/non-customer-credit"
                provenanceLabel="What this records"
                provenance={<p className="m-0 text-[12.5px] text-ink">One erratum beside each run listed, by you, dated, each with its act. <strong>No sealed run is changed</strong>, and no score is recomputed: each erratum states, from its seal, the points or the figure.</p>}
                fields={<label className="block"><span className={L}>Why they are recorded</span>
                  <textarea rows={2} className={I} value={reason} onChange={(ev) => setReason(ev.target.value)} /></label>}
                confirm={<span data-testid="confirm-text">Record {plural(data.count, 'credit erratum', 'credit errata')} and {plural(data.unsourced_count, 'unsourced-figure erratum', 'unsourced-figure errata')}, {total} in all, one beside each run listed. If the record now calls for a different number of either, nothing is recorded.</span>}
                disabledReason={notSteward}
                canSubmit={reason.trim().length >= 12}
                unmet={reason.trim().length < 12 ? ['say why, in at least 12 characters'] : []}
                buildBody={() => ({ expected_count: data.count, expected_unsourced_count: data.unsourced_count, reason: reason.trim() })}
                submitLabel={`Record the ${total} errata`}
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

interface AboutRow { id: string; account: string; kind: string; summary: string; provenance: string; proposed: 'account' | null }

/**
 * L41-D3 and Brad's condition 2 — what each row from before the "about" field is about. Every row, with its own
 * summary and its proposal; a row is pre-filled only where the server derived it, and the rows it cannot derive
 * are left for the steward. One submit with the count; the server refuses if it changed. Hidden once none waits.
 */
export function AboutBatch() {
  const { actor } = useActor();
  const [reload, setReload] = useState(0);
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [named, setNamed] = useState<Record<string, string>>({});
  const [reason, setReason] = useState('');
  const data = useJson<{ count: number; rows: AboutRow[]; accounts: { id: string; name: string }[] }>('/api/evidence/about-batch', reload);
  if (data === null || data === 'error' || data.count === 0) return null;
  const notSteward = actor?.is_steward ? undefined : `Stating what evidence from before this field is about is the steward's act — ${actor?.steward_name ?? "the tenant's steward"}'s alone.`;
  const choice = (r: AboutRow) => picked[r.id] ?? r.proposed ?? '';
  const stated = (r: AboutRow) => { const c = choice(r); return c !== '' && (c !== 'other_party' || (named[r.id] ?? '').trim().length >= 3); };
  const waiting = data.rows.filter((r) => !stated(r)).length;
  const unmet = [...(waiting > 0 ? [`state the ${waiting} row${waiting === 1 ? '' : 's'} left open`] : []), ...(reason.trim().length < 12 ? ['say why, in at least 12 characters'] : [])];
  const aboutOf = (r: AboutRow) => { const c = choice(r); return c === 'account' ? 'account' : c === 'other_party' ? { other_party: (named[r.id] ?? '').trim() } : { institution_id: c }; };
  return (
    <section className="mt-8 flex flex-col gap-3" data-testid="about-batch">
      <h2 className={H2}>What each row from before &ldquo;about&rdquo; is about</h2>
      <p className="m-0 max-w-[90ch] text-[12.5px] text-ink-45">
        {data.count} evidence rows were recorded before LVRF asked what evidence is about. Each is shown with its own summary. A row is filled in only where the record shows it can
        be about nothing but its account; a filing or vendor publication on a customer account is left for you. Nothing is written until you submit, and each statement is final.
      </p>
      <p className="m-0 text-[13px] text-ink" data-testid="about-batch-count">{data.count} rows; {data.rows.filter((r) => r.proposed === null).length} left for you to state.</p>
      <ul className="m-0 max-h-[70vh] list-none overflow-y-auto border border-rule bg-white p-0" data-testid="about-batch-rows">
        {data.rows.map((r) => (
          <li key={r.id} className="border-b border-rule-soft px-4 py-2 text-[12px] last:border-b-0" data-testid="about-batch-row" data-evidence={r.id} data-proposed={r.proposed ?? ''}>
            <span className="font-semibold text-ink">{r.account} · {r.kind.replace(/_/g, ' ')}</span>
            <span className="block text-ink-70 [overflow-wrap:anywhere]">{r.summary}</span>
            <span className="block text-ink-45 [overflow-wrap:anywhere]">Source: {r.provenance}</span>
            <span className="mt-1 flex flex-wrap items-center gap-2">
              <select className={I + ' max-w-[280px]'} disabled={Boolean(notSteward)} value={choice(r)} data-testid="about-batch-choice"
                onChange={(ev) => setPicked((p) => ({ ...p, [r.id]: ev.target.value }))}>
                <option value="" disabled>— choose —</option>
                <option value="account">{r.account} (this account)</option>
                {data.accounts.filter((a) => a.name !== r.account).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                <option value="other_party">Another company, named</option>
              </select>
              {choice(r) === 'other_party' && <input className={I + ' max-w-[280px]'} placeholder="The company" value={named[r.id] ?? ''} data-testid="about-batch-party"
                onChange={(ev) => setNamed((n) => ({ ...n, [r.id]: ev.target.value }))} />}
            </span>
          </li>))}
      </ul>
      <GovernedForm<{ stated: number }>
        path="/api/evidence/about-batch" provenanceLabel="What this records"
        provenance={<p className="m-0 text-[12.5px] text-ink">What each row is about, by you, dated, each with its act. A statement is <strong>final</strong>: a wrong one is corrected by superseding the evidence. <strong>No sealed run changes.</strong></p>}
        fields={<label className="block"><span className={L}>Why they are stated</span>
          <textarea rows={2} className={I} value={reason} onChange={(ev) => setReason(ev.target.value)} data-testid="about-batch-reason" /></label>}
        confirm={<span data-testid="confirm-text">State what {data.count} rows are about, one act each.</span>}
        disabledReason={notSteward}
        canSubmit={unmet.length === 0} unmet={unmet}
        buildBody={() => ({ expected_count: data.count, reason: reason.trim(), items: data.rows.map((r) => ({ evidence_id: r.id, about: aboutOf(r) })) })}
        submitLabel={`State the ${data.count} rows`}
        onSuccess={() => { setReason(''); setPicked({}); setNamed({}); setReload((n) => n + 1); }}
        renderSuccess={(d) => <>Stated {d.stated}.</>}
      />
    </section>
  );
}
