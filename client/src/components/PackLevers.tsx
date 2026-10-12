import { useState } from 'react';
import { useActor } from '../actor/ActorContext';
import type { CatalogOffering, IndustryMeasure, LeverSolution, ValueLever, Withdrawal } from '../api/packs';
import { Badge } from './workbench/Card';
import { FOCUS_RING, GovernedForm } from './GovernedForm';

/**
 * O1 (Outputs band, LVRF_PLAN §5) — on each pack entry: its value levers
 * (output 3) and, per lever, the Skillsoft solutions that pull it (output 4),
 * each solution BESIDE what it can evidence — consumption is not
 * realization. A lever is a mechanism, not a promise: it shows no effect
 * size, because it has none.
 *
 * WITHDRAWN, NEVER DELETED: a withdrawn lever or link stays here, marked
 * with who withdrew it, when and why. A withdrawn lever takes no new link.
 *
 * On success a form closes and resets: the new row in the list is the
 * confirmation (a disabled form left open would describe a stale choice).
 *
 * Proposing, linking and withdrawing are STEWARD acts (O-D2): disabled for
 * anyone else, naming the steward; the server's 403 stays the authority.
 */

const LABEL_CLASS = 'mb-1 block text-[10px] font-semibold uppercase tracking-[.16em] text-ink-45';
const INPUT_CLASS = 'w-full border border-rule bg-white px-2.5 py-1.5 text-[13px] text-ink ' + FOCUS_RING;
const SMALL_BUTTON = 'border border-silver px-2.5 py-1 text-[9.5px] font-semibold uppercase tracking-[.1em] ';

function useStewardReason(act: string): string | undefined {
  const { actor } = useActor();
  return actor?.is_steward ? undefined : `${act} is the steward's act — ${actor?.steward_name ?? "the tenant's steward"}'s alone (O-D2).`;
}

function Opener({ label, reason, onOpen }: { label: string; reason: string | undefined; onOpen: () => void }) {
  return (
    <span className="inline-flex items-center gap-2">
      <button type="button" disabled={Boolean(reason)} title={reason} onClick={onOpen}
        className={SMALL_BUTTON + (reason ? 'cursor-not-allowed text-ink-25' : 'text-ink-45 hover:border-ink hover:text-ink') + ' ' + FOCUS_RING}>
        {label}
      </button>
      {reason && <span className="text-[11px] text-ink-45">{reason}</span>}
    </span>
  );
}

function withdrawnLine(w: Withdrawal): string {
  return `Withdrawn by ${w.withdrawn_by ?? 'an unrecorded person'}, ${(w.withdrawn_at ?? '').slice(0, 10)} — ${w.withdrawal_reason ?? ''}`;
}

/** "Withdraw…" for a lever or a link: a reason (≥ 12), the steward's act. */
function Withdraw({ path, what, act, label, onChanged }: { path: string; what: string; act: string; label: string; onChanged: () => void }) {
  const reason = useStewardReason(act);
  const [open, setOpen] = useState(false);
  const [why, setWhy] = useState('');
  if (!open) return <div className="mt-1.5"><Opener label={label} reason={reason} onOpen={() => setOpen(true)} /></div>;
  return (
    <div className="mt-2 border-t border-rule-soft pt-2" data-testid="withdraw">
      <GovernedForm<Record<string, unknown>>
        path={path} provenanceLabel="What this records"
        provenance={<p className="m-0 text-[12.5px] text-ink">That {what} is withdrawn, by you, with your reason. It is <strong>not deleted</strong>: it stays here, marked, and a withdrawal is not amended.</p>}
        disabledReason={reason}
        fields={<label className="block"><span className={LABEL_CLASS}>Why it is withdrawn (required)</span>
          <textarea rows={2} className={INPUT_CLASS} value={why} onChange={(e) => setWhy(e.target.value)} /></label>}
        canSubmit={why.trim().length >= 12}
        buildBody={() => ({ retirement_reason: why })}
        submitLabel="Withdraw" onSuccess={() => { setOpen(false); setWhy(''); onChanged(); }} renderSuccess={() => <>Withdrawn.</>} />
    </div>
  );
}

function LinkSolution({ lever, offerings, onChanged }: { lever: ValueLever; offerings: CatalogOffering[]; onChanged: () => void }) {
  const reason = useStewardReason('Linking a solution to a lever');
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState('');
  const [basis, setBasis] = useState('');
  const linked = new Set(lever.solutions.filter((s) => !s.withdrawn_at).map((s) => s.offering_key));
  if (!open) return <div className="mt-1.5"><Opener label="Link a solution…" reason={reason} onOpen={() => setOpen(true)} /></div>;
  const chosen = offerings.find((o) => o.offering_key === key);
  return (
    <div className="mt-2 border-t border-rule-soft pt-2" data-testid="link-solution">
      <GovernedForm<{ lever_offering_id: string }>
        path={`/api/value-levers/${lever.id}/offerings`} provenanceLabel="What this records"
        provenance={<p className="m-0 text-[12.5px] text-ink">That this solution pulls the lever "{lever.name}", with your basis. A link is a fact: it is not edited or deleted, only withdrawn.</p>}
        disabledReason={reason}
        fields={<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block"><span className={LABEL_CLASS}>Solution</span>
            <select className={INPUT_CLASS} value={key} onChange={(e) => setKey(e.target.value)}>
              <option value="">— choose —</option>
              {offerings.filter((o) => !linked.has(o.offering_key)).map((o) => <option key={o.offering_key} value={o.offering_key}>{o.name}</option>)}
            </select>
            {chosen && <p className="m-0 mt-1 text-[11px] text-ink-45">Can evidence: {chosen.evidence_class}, verified by {chosen.verification_source.replace(/_/g, ' ')}.</p>}
          </label>
          <label className="block sm:col-span-2"><span className={LABEL_CLASS}>Why it pulls this lever (required)</span>
            <textarea rows={2} className={INPUT_CLASS} value={basis} onChange={(e) => setBasis(e.target.value)} /></label>
        </div>}
        canSubmit={!!key && basis.trim().length >= 12}
        buildBody={() => ({ offering_key: key, basis })}
        submitLabel="Link the solution" onSuccess={() => { setOpen(false); setKey(''); setBasis(''); onChanged(); }} renderSuccess={() => <>Linked.</>} />
    </div>
  );
}

function AddLever({ measure, onChanged }: { measure: IndustryMeasure; onChanged: () => void }) {
  const reason = useStewardReason('Proposing a value lever');
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ name: '', mechanism: '', leading_indicator: '', citation: '' });
  if (!open) return <div className="mt-2"><Opener label="Add a lever…" reason={reason} onOpen={() => setOpen(true)} /></div>;
  return (
    <div className="mt-2 border-t border-rule-soft pt-2" data-testid="add-lever">
      <GovernedForm<{ value_lever_id: string }>
        path={`/api/industry-measures/${measure.id}/levers`} provenanceLabel="What this records"
        provenance={<p className="m-0 text-[12.5px] text-ink">A lever on "{measure.name}": the mechanism by which capability moves it, what moves first, and its source. <strong>No effect size:</strong> a lever is a mechanism, not a promise.</p>}
        disabledReason={reason}
        fields={<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block sm:col-span-2"><span className={LABEL_CLASS}>Lever name</span><input className={INPUT_CLASS} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></label>
          <label className="block sm:col-span-2"><span className={LABEL_CLASS}>Mechanism (one testable sentence)</span><textarea rows={2} className={INPUT_CLASS} value={v.mechanism} onChange={(e) => setV({ ...v, mechanism: e.target.value })} /></label>
          <label className="block"><span className={LABEL_CLASS}>Leading indicator (what moves first)</span><input className={INPUT_CLASS} value={v.leading_indicator} onChange={(e) => setV({ ...v, leading_indicator: e.target.value })} /></label>
          <label className="block"><span className={LABEL_CLASS}>Citation (required)</span><input className={INPUT_CLASS} value={v.citation} onChange={(e) => setV({ ...v, citation: e.target.value })} /></label>
        </div>}
        canSubmit={v.name.trim() !== '' && v.mechanism.trim().length >= 12 && v.leading_indicator.trim() !== '' && v.citation.trim().length >= 12}
        buildBody={() => v}
        submitLabel="Propose the lever" onSuccess={() => { setOpen(false); setV({ name: '', mechanism: '', leading_indicator: '', citation: '' }); onChanged(); }} renderSuccess={() => <>Proposed.</>} />
    </div>
  );
}

function Solution({ s, leverWithdrawn, onChanged }: { s: LeverSolution; leverWithdrawn: boolean; onChanged: () => void }) {
  return (
    <li className="py-0.5 text-[12.5px] text-ink" data-testid="solution" data-withdrawn={s.withdrawn_at ? 'true' : 'false'}>
      <span className={'font-semibold' + (s.withdrawn_at ? ' line-through' : '')}>{s.name}</span>
      {s.withdrawn_at && <> <Badge tone="neutral">withdrawn</Badge></>}
      <span className="text-ink-45"> · can evidence: {s.evidence_class}, verified by {s.verification_source.replace(/_/g, ' ')} — </span>
      {s.basis}
      {s.withdrawn_at && <p className="m-0 text-[11px] text-ink-45">{withdrawnLine(s)}</p>}
      {!s.withdrawn_at && !leverWithdrawn && (
        <Withdraw path={`/api/lever-offerings/${s.id}/retire`} what={`the link of "${s.name}" to this lever`}
          act="Withdrawing a solution from a lever" label="Withdraw this solution…" onChanged={onChanged} />
      )}
    </li>
  );
}

export function PackLevers({ measure, offerings, onChanged }: { measure: IndustryMeasure; offerings: CatalogOffering[]; onChanged: () => void }) {
  const current = measure.levers.filter((l) => !l.withdrawn_at).length;
  const withdrawn = measure.levers.length - current;
  return (
    <div className="mt-3 border-l-2 border-silver pl-3" data-testid="levers">
      <span className="block text-[9.5px] font-semibold uppercase tracking-[.13em] text-ink-45">
        Value levers ({current}{withdrawn > 0 ? `, and ${withdrawn} withdrawn` : ''})
      </span>
      {measure.levers.length === 0 && <p className="m-0 mt-1 text-[12px] text-ink-45">No lever proposed for this entry yet.</p>}
      {measure.levers.map((l) => (
        <div key={l.id} className="mt-2" data-testid="lever" data-withdrawn={l.withdrawn_at ? 'true' : 'false'}>
          <div className="flex flex-wrap items-baseline gap-2">
            <span className={'text-[13px] font-semibold text-ink' + (l.withdrawn_at ? ' line-through' : '')}>{l.name}</span>
            <Badge tone="neutral">{l.withdrawn_at ? 'withdrawn' : l.status}</Badge>
          </div>
          {l.withdrawn_at && <p className="m-0 mt-0.5 text-[11.5px] text-ink">{withdrawnLine(l)}</p>}
          <p className="m-0 mt-0.5 text-[12.5px] text-ink">{l.mechanism}</p>
          <p className="m-0 mt-0.5 text-[11.5px] text-ink-45">Moves first: {l.leading_indicator}</p>
          <p className="m-0 mt-0.5 font-mono text-[10.5px] text-ink-45">{l.citation}</p>
          <p className="m-0 mt-0.5 text-[11px] text-ink-45">Proposed by {l.proposed_by}, {l.created_at.slice(0, 10)}</p>
          <ul className="m-0 mt-1.5 list-none p-0" data-testid="solutions">
            {l.solutions.length === 0 && <li className="text-[12px] text-ink-45">No solution linked yet.</li>}
            {l.solutions.map((s) => <Solution key={s.id} s={s} leverWithdrawn={Boolean(l.withdrawn_at)} onChanged={onChanged} />)}
          </ul>
          {!l.withdrawn_at && (
            <>
              <LinkSolution lever={l} offerings={offerings} onChanged={onChanged} />
              <Withdraw path={`/api/value-levers/${l.id}/retire`} what={`the lever "${l.name}"`}
                act="Withdrawing a value lever" label="Withdraw this lever…" onChanged={onChanged} />
            </>
          )}
        </div>
      ))}
      <AddLever measure={measure} onChanged={onChanged} />
    </div>
  );
}
