import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../api/http';
import { useActor } from '../actor/ActorContext';
import { FOCUS_RING, GovernedForm } from './GovernedForm';
import { useEvidenceForm } from './EvidenceFormInput';
import { AboutSelect, type AccountChoice } from './AboutSelect';
import { aboutBody } from './useAbout';
import { ShortId } from './ShortId';

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
  const data = useJson<{ count: number; rows: AboutRow[]; accounts: AccountChoice[] }>('/api/evidence/about-batch', reload);
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
            <span className="block text-ink-70 [overflow-wrap:anywhere]">{r.summary} <ShortId id={r.id} /></span>
            <span className="block text-ink-45 [overflow-wrap:anywhere]">Source: {r.provenance}</span>
            <span className="mt-1 flex flex-wrap items-center gap-2">
              <AboutSelect accounts={data.accounts} ownName={r.account} value={choice(r)} disabled={Boolean(notSteward)} className={I + ' max-w-[280px]'} testId="about-batch-choice"
                onChange={(v) => setPicked((p) => ({ ...p, [r.id]: v }))} />
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

interface CorrectableRow { id: string; institution_id: string; account: string; kind: string; summary: string; provenance: string; source_reference: string | null; evidence_form: string; about: string | null; source_verified: boolean; citation_resolved: boolean; marked: boolean }
interface CorrectableErratum { id: string; account: string; engagement: string; run_number: number; what_was_wrong: string; what_is_right: string; reason: string }
type Item = Record<string, unknown> & { evidence_id: string };
type ErratumItem = Record<string, unknown> & { erratum_id: string };
interface PlanRow {
  evidence_id: string; account?: string; kind?: string; summary?: string; provenance?: string;
  current?: { about: string | null; form: string; verified: boolean; opened: boolean };
  next?: { about: string | null; summary: string; provenance: string; form: string; reading: unknown; ai_sourced: boolean };
  mark?: { carries: boolean; reason: string | null };
  links?: { outcome_id: string; metric: string; supports: string; moves: boolean; frozen: boolean }[];
  withdrawn_links?: number; errata?: number; sealed_runs?: number; blockers: string[];
}
interface ErratumTexts { what_was_wrong: string; what_is_right: string; reason: string }
interface PlanErratum { erratum_id: string; run_number?: number; engagement?: string; current?: ErratumTexts; next?: ErratumTexts; supersession_reason?: string; blockers: string[] }
interface DryRun { count: number; rows: PlanRow[]; errata: PlanErratum[]; plan_hash: string; can_submit: boolean }

/** One row of the list: ticked, it says what it should be about, and gives a reading if it records none. */
function CorrectRow({ row, accounts, disabled, onItem }: { row: CorrectableRow; accounts: AccountChoice[]; disabled: boolean; onItem: (id: string, item: Item | null, unmet: string[]) => void }) {
  const [on, setOn] = useState(false);
  const [choice, setChoice] = useState('');
  const [party, setParty] = useState('');
  const [summary, setSummary] = useState('');
  const [provenance, setProvenance] = useState('');
  const legacy = row.evidence_form === 'legacy';
  const form = useEvidenceForm({ allowed: ['quote', 'locator'], kind: row.kind, sourceReference: row.source_reference ?? '' });
  const unmet = !on ? [] : [...(choice === '' ? ['say what it is about'] : []), ...(choice === 'other_party' && party.trim().length < 3 ? ['name the company'] : []), ...(legacy ? form.unmet : [])];
  const item = on ? JSON.stringify({ evidence_id: row.id, about: aboutBody(choice, party), ...(summary.trim() ? { summary: summary.trim() } : {}), ...(provenance.trim() ? { provenance: provenance.trim() } : {}), ...(legacy ? form.body() : {}) }) : null;
  const unmetKey = unmet.join('|');
  useEffect(() => { onItem(row.id, item === null ? null : JSON.parse(item) as Item, unmetKey === '' ? [] : unmetKey.split('|')); }, [item, unmetKey]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <li className="border-b border-rule-soft px-4 py-2 text-[12px] last:border-b-0" data-testid="supersession-row" data-evidence={row.id}>
      <label className="flex items-start gap-2">
        <input type="checkbox" className="mt-0.5" checked={on} disabled={disabled} onChange={(ev) => setOn(ev.target.checked)} data-testid="supersession-tick" />
        <span>
          <span className="font-semibold text-ink">{row.account} · {row.kind.replace(/_/g, ' ')} · about {row.about ?? 'nothing stated'}</span>
          <span className="block text-ink-70 [overflow-wrap:anywhere]">{row.summary} <ShortId id={row.id} /></span>
          <span className="block text-ink-45 [overflow-wrap:anywhere]">Source: {row.provenance}</span>
        </span>
      </label>
      {on && (
        <div className="mt-2 flex flex-col gap-2 pl-6">
          <label className="block"><span className={L}>What it is about</span>
            <AboutSelect accounts={accounts} ownId={row.institution_id} ownName={row.account} value={choice} onChange={setChoice} className={I + ' max-w-[320px]'} testId="supersession-about" /></label>
          {choice === 'other_party' && <label className="block"><span className={L}>The company</span>
            <input className={I + ' max-w-[320px]'} value={party} onChange={(ev) => setParty(ev.target.value)} data-testid="supersession-party" /></label>}
          <label className="block"><span className={L}>New text (empty keeps the row&apos;s text)</span>
            <textarea rows={3} className={I} value={summary} onChange={(ev) => setSummary(ev.target.value)} data-testid="supersession-summary" /></label>
          <label className="block"><span className={L}>New source (empty keeps the row&apos;s source)</span>
            <input className={I} value={provenance} onChange={(ev) => setProvenance(ev.target.value)} data-testid="supersession-provenance" /></label>
          {legacy && <div data-testid="supersession-reading"><p className="m-0 mb-1 text-[11.5px] text-ink-45">This row records no reading, and a new row must. Open the source and give it here.</p>{form.fields}</div>}
        </div>
      )}
    </li>
  );
}

/** One erratum of the list: ticked, it takes its new text, starting from what it says now, and why it is superseded. */
function CorrectErratum({ row, disabled, onItem }: { row: CorrectableErratum; disabled: boolean; onItem: (id: string, item: ErratumItem | null, unmet: string[]) => void }) {
  const [on, setOn] = useState(false);
  const [v, setV] = useState({ what_was_wrong: row.what_was_wrong, what_is_right: row.what_is_right, reason: row.reason, supersession_reason: '' });
  const unmet = on && v.supersession_reason.trim().length < 12 ? ['say why the erratum is superseded'] : [];
  const item = on ? JSON.stringify({ erratum_id: row.id, ...v }) : null;
  useEffect(() => { onItem(row.id, item === null ? null : JSON.parse(item) as ErratumItem, unmet); }, [item]); // eslint-disable-line react-hooks/exhaustive-deps
  const field = (k: keyof typeof v, label: string) => (
    <label className="block"><span className={L}>{label}</span>
      <textarea rows={2} className={I} value={v[k]} onChange={(ev) => setV({ ...v, [k]: ev.target.value })} data-testid={`supersession-erratum-${k}`} /></label>);
  return (
    <li className="border-b border-rule-soft px-4 py-2 text-[12px] last:border-b-0" data-testid="supersession-erratum" data-erratum={row.id}>
      <label className="flex items-start gap-2">
        <input type="checkbox" className="mt-0.5" checked={on} disabled={disabled} onChange={(ev) => setOn(ev.target.checked)} data-testid="supersession-erratum-tick" />
        <span>
          <span className="font-semibold text-ink">{row.account} · run {row.run_number} · erratum</span>
          <span className="block text-ink-70 [overflow-wrap:anywhere]">{row.what_is_right}</span>
        </span>
      </label>
      {on && <div className="mt-2 flex flex-col gap-2 pl-6">{field('what_was_wrong', 'What was wrong')}{field('what_is_right', 'What is right')}{field('reason', 'Reason')}{field('supersession_reason', 'Why it is superseded')}</div>}
    </li>
  );
}

function PlanErratumLine({ r }: { r: PlanErratum }) {
  const line = (label: string, now?: string, next?: string) => (now === next
    ? <span className="block text-ink-45">{label}: unchanged. {now}</span>
    : <span className="block text-ink-70 [overflow-wrap:anywhere]">{label} now: {now}<span className="block text-ink">{label} new: {next}</span></span>);
  return (
    <li className="border-b border-rule-soft px-4 py-3 text-[12px] last:border-b-0" data-testid="supersession-plan-erratum" data-erratum={r.erratum_id}>
      <span className="font-semibold text-ink">{r.engagement} · run {r.run_number} · erratum</span>
      {r.current && r.next && <>{line('What was wrong', r.current.what_was_wrong, r.next.what_was_wrong)}{line('What is right', r.current.what_is_right, r.next.what_is_right)}{line('Reason', r.current.reason, r.next.reason)}
        <span className="block text-ink-45">Why it is superseded: {r.supersession_reason}</span>
        <span className="block text-ink-45">The earlier erratum stays on the record. The recompute is the server&apos;s, as the first one was.</span></>}
      {r.blockers.map((b, i) => <span key={i} className="mt-1 block text-warning" data-testid="plan-blocker">{b}</span>)}
    </li>
  );
}

/** What the dry run says will happen to one row. */
function PlanLine({ r }: { r: PlanRow }) {
  return (
    <li className="border-b border-rule-soft px-4 py-3 text-[12px] last:border-b-0" data-testid="supersession-plan-row" data-evidence={r.evidence_id}>
      <span className="font-semibold text-ink">{r.account} · {r.kind?.replace(/_/g, ' ')} <ShortId id={r.evidence_id} /></span>
      {r.current && r.next && <>
        <span className="mt-1 block text-ink-70 [overflow-wrap:anywhere]" data-testid="plan-text">Text now: {r.summary}</span>
        <span className="block text-ink [overflow-wrap:anywhere]" data-testid="plan-new-text">Text new: {r.next.summary === r.summary ? 'unchanged' : r.next.summary}</span>
        {r.next.provenance !== r.provenance && <span className="block text-ink [overflow-wrap:anywhere]" data-testid="plan-new-source">Source now: {r.provenance}. Source new: {r.next.provenance}</span>}
        <span className="mt-1 block text-ink" data-testid="plan-statement">About {r.current.about ?? 'nothing stated'} → about {r.next.about ?? 'not yet stated'}</span>
        <span className="block text-ink-45" data-testid="plan-verification">
          {r.current.verified ? 'Source-verified now' : 'Not source-verified now'}{r.current.opened ? ', opened' : ''}. The new row starts unverified and unopened, and {r.next.reading ? 'records the reading given here' : 'carries its reading'}.{r.next.ai_sourced ? ' It stays AI-sourced: that origin is permanent.' : ''}
        </span>
        <span className="block text-ink-45" data-testid="plan-mark">{r.mark?.carries ? 'Mark: the system-exercise mark carries to the new row; the old row keeps its own.' : 'Mark: none.'}</span>
        <span className="block text-ink-45" data-testid="plan-links">
          {r.links && r.links.length > 0
            ? r.links.map((l) => `Link: supports the ${l.supports.replace(/_/g, ' ')} of "${l.metric}": moves to the new row${l.frozen ? ', with its support unchanged (the outcome stays frozen)' : ''}.`).join(' ')
            : `Links: none current${r.withdrawn_links ? `; ${r.withdrawn_links} withdrawn stay on the old row` : ''}.`}
        </span>
        <span className="block text-ink-45" data-testid="plan-lineage">
          Lineage: the old row stays, reading "superseded by"; the new row reads "supersedes". {r.sealed_runs ?? 0} sealed run{r.sealed_runs === 1 ? '' : 's'} and {r.errata ?? 0} errat{r.errata === 1 ? 'um' : 'a'} stay as they are.
        </span>
      </>}
      {r.blockers.map((b, i) => <span key={i} className="mt-1 block text-warning" data-testid="plan-blocker">{b}</span>)}
    </li>
  );
}

/**
 * L52 (LVRF_PLAN §18): correcting rows by supersession, in one act. Tick the rows, say what each should be about,
 * read the dry run, then one submit carrying its count and plan; the server re-reads both and refuses if they changed.
 */
export function SupersessionBatch() {
  const { actor } = useActor();
  const [open, setOpen] = useState(false);
  const [reload, setReload] = useState(0);
  const data = useJson<{ count: number; rows: CorrectableRow[]; errata: CorrectableErratum[] }>('/api/evidence/supersession-batch', reload);
  const choices = useJson<{ accounts: AccountChoice[] }>('/api/evidence/about-batch', 0);
  const [items, setItems] = useState<Record<string, { item: Item; unmet: string[] }>>({});
  const [errata, setErrata] = useState<Record<string, { item: ErratumItem; unmet: string[] }>>({});
  const [plan, setPlan] = useState<DryRun | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const notSteward = actor?.is_steward ? undefined : `Superseding evidence is the steward's act — ${actor?.steward_name ?? "the tenant's steward"}'s alone.`;
  const onItem = (id: string, item: Item | null, unmet: string[]) => {
    setPlan(null); setFailed(null);
    setItems((all) => { const { [id]: _gone, ...rest } = all; return item === null ? rest : { ...rest, [id]: { item, unmet } }; });
  };
  const onErratum = (id: string, item: ErratumItem | null, unmet: string[]) => {
    setPlan(null); setFailed(null);
    setErrata((all) => { const { [id]: _gone, ...rest } = all; return item === null ? rest : { ...rest, [id]: { item, unmet } }; });
  };
  const chosen = [...Object.values(items), ...Object.values(errata)];
  const waiting = chosen.flatMap((c) => c.unmet);
  const body = { items: Object.values(items).map((c) => c.item), errata: Object.values(errata).map((c) => c.item) };
  const dryRun = async () => {
    setFailed(null);
    const r = await apiFetch('/api/evidence/supersession-batch/dry-run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => null);
    if (r.ok) setPlan(j as DryRun); else setFailed((j as { message?: string } | null)?.message ?? "Couldn't run the dry run.");
  };
  if (!open) {
    return (
      <section className="mt-8 flex flex-col gap-3" data-testid="supersession-batch">
        <h2 className={H2}>Correct evidence by supersession</h2>
        <button type="button" onClick={() => setOpen(true)} data-testid="supersession-open" className={'self-start border border-ink px-3 py-1.5 text-[12px] font-semibold text-ink hover:bg-ink hover:text-offwhite ' + FOCUS_RING}>Correct evidence…</button>
      </section>
    );
  }
  if (data === null || choices === null) return <p className="mt-8 text-[12.5px] text-ink-45">loading</p>;
  if (data === 'error' || choices === 'error') return <p className="mt-8 text-[12.5px] text-ink-70" data-testid="supersession-unavailable">Couldn&apos;t load the evidence or the accounts, so nothing can be corrected here. Reload the page.</p>;
  const unmet = [...(plan === null ? ['run the dry run'] : []), ...(plan && !plan.can_submit ? ['clear what the dry run stops'] : []), ...(reason.trim().length < 12 ? ['say why, in at least 12 characters'] : [])];
  return (
    <section className="mt-8 flex flex-col gap-3" data-testid="supersession-batch">
      <h2 className={H2}>Correct evidence by supersession</h2>
      <p className="m-0 max-w-[90ch] text-[12.5px] text-ink-45">
        A row is never edited: a new row replaces it, and the old row stays on the record. Tick the rows to correct and say what each should be about. Nothing is written until you submit.
      </p>
      <ul className="m-0 max-h-[60vh] list-none overflow-y-auto border border-rule bg-white p-0" data-testid="supersession-rows">
        {data.rows.map((r) => <CorrectRow key={r.id} row={r} accounts={choices.accounts} disabled={Boolean(notSteward)} onItem={onItem} />)}
      </ul>
      {data.errata.length > 0 && <ul className="m-0 max-h-[40vh] list-none overflow-y-auto border border-rule bg-white p-0" data-testid="supersession-errata">
        {data.errata.map((r) => <CorrectErratum key={r.id} row={r} disabled={Boolean(notSteward)} onItem={onErratum} />)}
      </ul>}
      <button type="button" disabled={chosen.length === 0 || waiting.length > 0} onClick={() => { void dryRun(); }} data-testid="supersession-dry-run"
        className={'self-start border border-ink px-3 py-1.5 text-[12px] font-semibold text-ink hover:bg-ink hover:text-offwhite disabled:cursor-not-allowed disabled:opacity-50 ' + FOCUS_RING}>
        Show what this will do
      </button>
      {chosen.length > 0 && waiting.length > 0 && <p className="m-0 text-[11.5px] text-ink-45" data-testid="supersession-waiting">Still needed: {[...new Set(waiting)].join('; ')}.</p>}
      {failed && <p className="m-0 text-[12.5px] text-warning" data-testid="supersession-failed">{failed}</p>}
      {plan && <ul className="m-0 list-none border border-rule bg-white p-0" data-testid="supersession-plan">{plan.errata.map((r) => <PlanErratumLine key={r.erratum_id} r={r} />)}{plan.rows.map((r) => <PlanLine key={r.evidence_id} r={r} />)}</ul>}
      {plan && (
        <GovernedForm<{ superseded: number }>
          path="/api/evidence/supersession-batch" provenanceLabel="What this records"
          provenance={<p className="m-0 text-[12.5px] text-ink">A new row for each, by you, dated, each with its acts. Each is <strong>final</strong>, and the old rows stay on the record. <strong>No sealed run changes.</strong></p>}
          fields={<label className="block"><span className={L}>Why they are superseded</span>
            <textarea rows={2} className={I} value={reason} onChange={(ev) => setReason(ev.target.value)} data-testid="supersession-reason" /></label>}
          confirm={<span data-testid="confirm-text">Supersede {plan.count} item{plan.count === 1 ? '' : 's'}, as listed above.</span>}
          disabledReason={notSteward}
          canSubmit={unmet.length === 0} unmet={unmet}
          buildBody={() => ({ ...body, expected_count: plan.count, plan_hash: plan.plan_hash, reason: reason.trim() })}
          submitLabel={`Supersede ${plan.count} item${plan.count === 1 ? '' : 's'}`}
          onSuccess={() => { setReason(''); setItems({}); setErrata({}); setPlan(null); setOpen(false); setReload((n) => n + 1); }}
          renderSuccess={(d) => <>Superseded {d.superseded}.</>}
        />
      )}
    </section>
  );
}
