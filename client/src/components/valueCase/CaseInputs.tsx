import { useEffect, useState } from 'react';
import { apiFetch } from '../../api/http';
import { FOCUS_RING, GovernedForm } from '../GovernedForm';
import { Card } from '../workbench/Card';
import { ShortId } from '../ShortId';
import { shortId } from '../../lib/shortId';

/**
 * B3 (P6; LVRF_PLAN §19) — on screen only, below a value case: the inputs the NEXT run will read, and D-M21's share.
 * None of them changes this case: a run is sealed, and a new input is read by the next run produced.
 */
interface CaseRef {
  run: { id: string; run_number: number; locked_at: string | null; payload_hash: string };
  engagement: { id: string; retired: boolean };
  account: { id: string; name: string };
  lens: 'cfo' | 'general';
  banners: { outside_in: boolean; unverified: boolean } | null;
  outcomes: { value_outcome_id: string | null; metric: string; unit: string | null }[];
}
interface EvidenceRow { id: string; summary: string; kind: string; about: string | null; superseded_by_id: string | null; basis: string | null }

const L = 'mb-1 block text-[10px] font-semibold uppercase tracking-[.16em] text-ink-45';
const I = 'w-full border border-rule bg-white px-2.5 py-1.5 text-[13px] text-ink ' + FOCUS_RING;
const SMALL = 'border border-silver px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-[.1em] text-ink-45 hover:border-ink hover:text-ink disabled:cursor-not-allowed disabled:hover:border-silver disabled:hover:text-ink-45 ' + FOCUS_RING;

function RecordRate({ vc, onDone }: { vc: CaseRef; onDone: () => void }) {
  const o = vc.outcomes[0];
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<EvidenceRow[] | null>(null);
  const [rate, setRate] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [kind, setKind] = useState('');
  const [howRead, setHowRead] = useState('');
  const [evidenceId, setEvidenceId] = useState('');
  const [reason, setReason] = useState('');
  useEffect(() => {
    if (!open) return;
    apiFetch(`/api/institutions/${vc.account.id}/evidence`).then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j) => setRows(((j as { evidence: EvidenceRow[] }).evidence ?? []).filter((e) => !e.superseded_by_id)), () => setRows([]));
  }, [open, vc.account.id]);
  if (!o?.value_outcome_id) return <p className="m-0 text-[12px] text-ink-45">This run names no outcome, so no rate can be recorded from it. Record it from the account&apos;s workspace.</p>;
  if (!open) return <button type="button" onClick={() => setOpen(true)} className={SMALL} data-testid="record-rate-open">Record the client&apos;s rate…</button>;
  const n = /^\d+(\.\d+)?$/.test(rate.trim()) ? Number(rate.trim()) : null;
  const picked = rows?.find((e) => e.id === evidenceId);
  const unmet = [
    ...(n === null ? ['give the rate, a number zero or more'] : []),
    ...(/^[A-Z]{3}$/.test(currency) ? [] : ['give the currency, a three-letter code']),
    ...(kind ? [] : ['say what the rate prices']),
    ...(howRead.trim().length < 12 ? ['say how it was read, in at least 12 characters'] : []),
    ...(evidenceId ? [] : ['choose the evidence it rests on']),
  ];
  return (
    <div className="mt-2 border-t border-rule-soft pt-2" data-testid="record-rate">
      <GovernedForm<{ monetization_rate_id: string }>
        path={`/api/value-outcomes/${o.value_outcome_id}/monetization-rates`} provenanceLabel="What this records"
        provenance={<p className="m-0 text-[12.5px] text-ink">What one unit of {o.metric} is worth to {vc.account.name} per year, as the client states it, resting on evidence recorded on and about this account. Cost of delay uses it only when that evidence is client-stated or from a system of record, attested by a customer-side person. <strong>This case does not change</strong>; the next run reads it.</p>}
        fields={<>
          <label className="block"><span className={L}>Rate, per {o.unit ?? 'unit'} per year</span><input className={I} inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} data-testid="rate-value" /></label>
          <label className="mt-2 block"><span className={L}>Currency</span><input className={I} value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} data-testid="rate-currency" /></label>
          <label className="mt-2 block"><span className={L}>What it prices</span>
            <select className={I} value={kind} onChange={(e) => setKind(e.target.value)} data-testid="rate-kind"><option value="">Choose…</option><option value="performance">performance (value per unit of improvement)</option><option value="exposure">exposure (the cost of risk, for example a penalty per finding)</option></select></label>
          <label className="mt-2 block"><span className={L}>How it was read</span><textarea rows={2} className={I} value={howRead} onChange={(e) => setHowRead(e.target.value)} data-testid="rate-how-read" /></label>
          <label className="mt-2 block"><span className={L}>The evidence it rests on</span>
            <select className={I} value={evidenceId} onChange={(e) => setEvidenceId(e.target.value)} data-testid="rate-evidence">
              <option value="">{rows === null ? 'loading…' : 'Choose…'}</option>
              {(rows ?? []).map((e) => <option key={e.id} value={e.id}>{shortId(e.id)} · {e.summary.slice(0, 90)}</option>)}
            </select></label>
          <label className="mt-2 block"><span className={L}>Why (needed when it corrects a rate)</span><textarea rows={2} className={I} value={reason} onChange={(e) => setReason(e.target.value)} data-testid="rate-reason" /></label>
        </>}
        confirm={<span data-testid="confirm-text">Record {currency} {n} per {o.unit ?? 'unit'} of {o.metric} per year ({kind}), resting on <ShortId id={evidenceId} /> “{picked?.summary.slice(0, 80) ?? ''}”.</span>}
        canSubmit={unmet.length === 0} unmet={unmet}
        buildBody={() => ({ rate: n, currency, per_unit: o.unit ?? '', rate_kind: kind, how_read: howRead.trim(), evidence_id: evidenceId, ...(reason.trim() ? { reason: reason.trim() } : {}) })}
        submitLabel="Record the rate" onSuccess={onDone} renderSuccess={() => <>Recorded. The next run reads it.</>} />
      <button type="button" onClick={() => setOpen(false)} className="mt-2 text-[11px] text-ink-45 underline">Cancel</button>
    </div>
  );
}

function PlanMilestone({ vc, onDone, recorderName }: { vc: CaseRef; onDone: () => void; recorderName: string | null }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [owner, setOwner] = useState('');
  const [due, setDue] = useState('');
  const [stage, setStage] = useState('');
  if (vc.engagement.retired) return <p className="m-0 text-[12px] text-ink-45">This engagement is retired, so no milestone is planned on it.</p>;
  if (!open) return <button type="button" onClick={() => setOpen(true)} className={SMALL} data-testid="plan-milestone-open">Plan a milestone…</button>;
  const unmet = [
    ...(title.trim().length < 6 ? ['give it a title of at least 6 characters'] : []),
    ...(/^\d{4}-\d{2}-\d{2}$/.test(due) ? [] : ['give its due date']),
    ...(owner.trim().length < 3 ? ['state its owner: a name and a role'] : []),
  ];
  const o = vc.outcomes[0];
  return (
    <div className="mt-2 border-t border-rule-soft pt-2" data-testid="plan-milestone">
      <GovernedForm<{ roadmap_milestone_id: string }>
        path={`/api/engagements/${vc.engagement.id}/milestones`} provenanceLabel="What this records"
        provenance={<p className="m-0 text-[12.5px] text-ink">A step in the plan to measure, with its owner as you state it (a name and a role, often someone at the customer); it is shown as stated by you{recorderName ? ` (${recorderName})` : ''}. A later change of date, status or owner supersedes it with a reason, so a slip stays visible. <strong>This case does not change</strong>; the next run seals it.</p>}
        fields={<>
          <label className="block"><span className={L}>Title</span><input className={I} value={title} onChange={(e) => setTitle(e.target.value)} data-testid="milestone-title" /></label>
          <label className="mt-2 block"><span className={L}>Owner (name and role)</span><input className={I} value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="for example: Jane Doe, Director of Safety" data-testid="milestone-owner" /></label>
          <label className="mt-2 block"><span className={L}>Due</span><input type="date" className={I} value={due} onChange={(e) => setDue(e.target.value)} data-testid="milestone-due" /></label>
          <label className="mt-2 block"><span className={L}>Stage (optional)</span>
            <select className={I} value={stage} onChange={(e) => setStage(e.target.value)} data-testid="milestone-stage"><option value="">none</option><option value="commit">commit</option><option value="measure">measure</option><option value="verify">verify</option></select></label>
        </>}
        confirm={<span data-testid="confirm-text">Plan “{title.trim()}”, due {due}, owner {owner.trim()} (as you state it){stage ? `, at ${stage}` : ''}{o?.value_outcome_id ? `, for ${o.metric}` : ''}.</span>}
        canSubmit={unmet.length === 0} unmet={unmet}
        buildBody={() => ({ title: title.trim(), due_on: due, owner: owner.trim(), ...(o?.value_outcome_id ? { value_outcome_id: o.value_outcome_id } : {}), ...(stage ? { stage } : {}) })}
        submitLabel="Plan it" onSuccess={onDone} renderSuccess={() => <>Planned. The next run seals it.</>} />
      <button type="button" onClick={() => setOpen(false)} className="mt-2 text-[11px] text-ink-45 underline">Cancel</button>
    </div>
  );
}

function ShareForReview({ vc, notSteward, onDone }: { vc: CaseRef; notSteward?: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [withWhom, setWithWhom] = useState('');
  const bothBanners = Boolean(vc.banners?.outside_in && vc.banners?.unverified);
  const blocked = notSteward ?? (!vc.run.locked_at ? 'Only a locked run is shared for review; lock it first, on the run page.'
    : !bothBanners ? 'A run is shared for review as an outside-in hypothesis only while both banners print; this one does not carry both.' : undefined);
  if (!open) return <button type="button" disabled={Boolean(blocked)} title={blocked} onClick={() => setOpen(true)} className={SMALL} data-testid="share-open">Shared for review as an outside-in hypothesis…</button>;
  const unmet = withWhom.trim().length < 3 ? ['say with whom: the person and their organisation'] : [];
  return (
    <div className="mt-2 border-t border-rule-soft pt-2" data-testid="share">
      <GovernedForm<{ record_document_id: string }>
        path={`/api/value-runs/${vc.run.id}/share-for-review`} provenanceLabel="What this records" disabledReason={blocked}
        provenance={<p className="m-0 text-[12.5px] text-ink">That you shared run {vc.run.run_number} for review as an outside-in hypothesis: who, with whom, when, the run and its hash. <strong>It never changes the run or its verification</strong>, and is allowed only while both banners print. Check the printed PDF against the record first (checklist stage 10).</p>}
        fields={<label className="block"><span className={L}>Shared with</span><input className={I} value={withWhom} onChange={(e) => setWithWhom(e.target.value)} data-testid="share-with" /></label>}
        confirm={<span data-testid="confirm-text">Record that run {vc.run.run_number} of {vc.account.name} ({vc.lens === 'cfo' ? 'CFO lens' : 'general'}, record hash {vc.run.payload_hash.slice(0, 12)}…) was shared for review as an outside-in hypothesis with {withWhom.trim()}.</span>}
        canSubmit={unmet.length === 0} unmet={unmet}
        buildBody={() => ({ shared_with: withWhom.trim(), lens: vc.lens })}
        submitLabel="Record the share" onSuccess={onDone} renderSuccess={() => <>Recorded.</>} />
      <button type="button" onClick={() => setOpen(false)} className="mt-2 text-[11px] text-ink-45 underline">Cancel</button>
    </div>
  );
}

export function CaseInputs({ vc, actorIsSteward, stewardName, onDone, actorName }: {
  vc: CaseRef; actorIsSteward: boolean; stewardName: string | null; onDone: () => void; actorName?: string | null;
}) {
  const notSteward = actorIsSteward ? undefined : `Only the steward (${stewardName ?? 'the tenant’s steward'}) records a share for review.`;
  return (
    <div className="mt-8" data-testid="case-inputs">
      <Card title="For the next run">
        <p className="m-0 mb-2 text-[12px] text-ink-45">This case is sealed. What you record here is read by the next run produced, never by this one.</p>
        <div className="flex flex-col gap-3">
          <RecordRate vc={vc} onDone={onDone} />
          <PlanMilestone vc={vc} onDone={onDone} recorderName={actorName ?? null} />
        </div>
      </Card>
      <Card title="Share for review (D-M21)">
        <ShareForReview vc={vc} notSteward={notSteward} onDone={onDone} />
      </Card>
    </div>
  );
}
