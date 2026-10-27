import { useEffect, useState } from 'react';
import { apiFetch } from '../api/http';
import { useActor } from '../actor/ActorContext';
import { FOCUS_RING, GovernedForm } from './GovernedForm';
import { day } from '../lib/workspaceStatus';

/**
 * C3 (Brad, 26 Oct 2026) — customer-side roles on an account. A steward names a role (metric owner or executive
 * sponsor) for a person of the account FROM A SOURCE: evidence of this account showing the person holds it. No
 * source, no role. Every role shows its source; a revoked one stays shown, struck through, with who, when and why.
 * The database refuses a simulated person, a person not of the account, an analyst of record or anyone external,
 * anyone vendor-side, and the steward themself; this form offers only people it would accept, and says why not.
 */
interface Person { id: string; full_name: string; title: string; ineligible: string | null; roles: string | null }
interface Grant {
  id: string; person_id: string; person: string; role: string; reason: string; source_evidence_id: string; source_summary: string; source: string;
  named_by: string; named_on: string; revoked_on: string | null; revoked_by: string | null; revocation_reason: string | null;
}
interface Source { id: string; kind: string; summary: string; provenance: string }

const L = 'mb-1 block text-[10px] font-semibold uppercase tracking-[.16em] text-ink-45';
const I = 'w-full border border-rule bg-white px-2.5 py-1.5 text-[13px] text-ink ' + FOCUS_RING;
const ROLE = (r: string) => r.replace('_', ' ');

function Revoke({ g, onDone, notSteward }: { g: Grant; onDone: () => void; notSteward?: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  if (!open) {
    return <button type="button" disabled={Boolean(notSteward)} onClick={() => setOpen(true)} data-testid="role-revoke-open"
      className={'ml-2 border border-silver px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-[.1em] text-ink-45 hover:border-ink hover:text-ink disabled:cursor-not-allowed ' + FOCUS_RING}>Revoke…</button>;
  }
  return (
    <div className="mt-1.5 border-t border-rule-soft pt-2" data-testid="role-revoke">
      <GovernedForm<{ revoked: boolean }>
        path={`/api/customer-roles/${g.id}/revoke`} provenanceLabel="What this records"
        provenance={<p className="m-0 text-[12.5px] text-ink">The role is <strong>revoked</strong> with your name, the date and your reason, and stays shown struck through. Runs already sealed keep it as it stood.</p>}
        fields={<label className="block"><span className={L}>Why</span><textarea rows={2} className={I} value={reason} onChange={(ev) => setReason(ev.target.value)} /></label>}
        confirm={<span data-testid="confirm-text">Revoke {g.person}&apos;s {ROLE(g.role)} role (per {g.source}). From now on it earns no credit.</span>}
        canSubmit={reason.trim().length >= 12} unmet={reason.trim().length < 12 ? ['give the reason, in at least 12 characters'] : []}
        buildBody={() => ({ reason: reason.trim() })} submitLabel="Revoke the role"
        onSuccess={() => { setOpen(false); onDone(); }} renderSuccess={() => <>Revoked.</>}
      />
    </div>
  );
}

export function CustomerRoles({ institutionId }: { institutionId: string }) {
  const { actor } = useActor();
  const [reload, setReload] = useState(0);
  const [data, setData] = useState<{ persons: Person[]; grants: Grant[]; sources: Source[] } | null | 'error'>(null);
  const [open, setOpen] = useState(false);
  const [personId, setPersonId] = useState('');
  const [role, setRole] = useState('');
  const [sourceId, setSourceId] = useState('');
  const [reason, setReason] = useState('');
  useEffect(() => {
    let cancelled = false;
    apiFetch(`/api/institutions/${institutionId}/customer-roles`).then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j) => { if (!cancelled) setData(j); }, () => { if (!cancelled) setData('error'); });
    return () => { cancelled = true; };
  }, [institutionId, reload]);
  const notSteward = actor?.is_steward ? undefined : `Naming a customer-side role is the steward's act — ${actor?.steward_name ?? "the tenant's steward"}'s alone.`;
  if (data === null) return <p className="m-0 text-[12.5px] text-ink-45">Reading the account&apos;s roles…</p>;
  if (data === 'error') return <p className="m-0 text-[12.5px] text-critical">Couldn&apos;t read the account&apos;s roles.</p>;
  const person = data.persons.find((p) => p.id === personId);
  const source = data.sources.find((s) => s.id === sourceId);
  const unmet = [...(!person ? ['choose the person'] : []), ...(role === '' ? ['choose the role'] : []), ...(!source ? ['choose the source'] : []),
    ...(reason.trim().length < 12 ? ['give the reason, in at least 12 characters'] : [])];
  const close = () => { setOpen(false); setPersonId(''); setRole(''); setSourceId(''); setReason(''); };
  return (
    <div className="flex flex-col gap-2" data-testid="customer-roles">
      <p className="m-0 text-[12px] text-ink-45">Only a customer-side person earns credit for an attestation, a commitment or a verification: a person of this account whose role is named here, from a source (C3).</p>
      {data.grants.length === 0
        ? <p className="m-0 text-[12.5px] text-ink-45" data-testid="customer-roles-none">No customer-side role named yet.</p>
        : <ul className="m-0 list-none p-0">{data.grants.map((g) => (
          <li key={g.id} className="py-1 text-[12.5px] text-ink" data-testid={g.revoked_on ? 'customer-role-revoked' : 'customer-role'}>
            {g.revoked_on ? <s>{g.person}: {ROLE(g.role)} per {g.source}, named by {g.named_by}, {day(g.named_on)}</s>
              : <>{g.person}: <strong>{ROLE(g.role)}</strong> per {g.source}, named by {g.named_by}, {day(g.named_on)}</>}
            {g.revoked_on
              ? <span className="text-ink-45"> — revoked by {g.revoked_by}, {day(g.revoked_on)}: {g.revocation_reason}</span>
              : <Revoke g={g} notSteward={notSteward} onDone={() => setReload((n) => n + 1)} />}
          </li>))}</ul>}
      {!open
        ? <span className="flex items-center gap-2">
            <button type="button" disabled={Boolean(notSteward)} onClick={() => setOpen(true)} data-testid="customer-role-open"
              className={'self-start border border-ink px-3 py-1.5 text-[12px] font-semibold text-ink hover:bg-ink hover:text-offwhite disabled:cursor-not-allowed disabled:border-silver disabled:text-ink-45 ' + FOCUS_RING}>Name a customer-side role…</button>
            {notSteward && <span className="text-[11px] text-ink-45" data-testid="customer-role-reason">{notSteward}</span>}
          </span>
        : <div className="border-t border-rule-soft pt-3" data-testid="customer-role-form">
          <GovernedForm<{ customer_role_grant_id: string }>
            path={`/api/institutions/${institutionId}/customer-roles`} provenanceLabel="What this records"
            provenance={<p className="m-0 text-[12.5px] text-ink">A customer-side role for a person of this account, <strong>named from a source</strong>: evidence of this account showing they hold it (their org chart, an email from them, a filing naming them). By you, dated, with your reason and its act. Every credit the role earns shows this source.</p>}
            fields={<div className="flex flex-col gap-3">
              <label className="block"><span className={L}>The person</span>
                <select className={I} value={personId} onChange={(ev) => setPersonId(ev.target.value)}>
                  <option value="" disabled>— choose —</option>
                  {data.persons.map((p) => <option key={p.id} value={p.id} disabled={Boolean(p.ineligible)}>{p.full_name}{p.title ? ` — ${p.title}` : ''}{p.ineligible ? ` (not eligible: ${p.ineligible})` : ''}</option>)}
                </select></label>
              <label className="block"><span className={L}>The role</span>
                <select className={I} value={role} onChange={(ev) => setRole(ev.target.value)}>
                  <option value="" disabled>— choose —</option>
                  <option value="metric_owner">metric owner</option>
                  <option value="executive_sponsor">executive sponsor</option>
                </select></label>
              <label className="block"><span className={L}>The source</span>
                <select className={I} value={sourceId} onChange={(ev) => setSourceId(ev.target.value)}>
                  <option value="" disabled>— choose —</option>
                  {data.sources.map((s) => <option key={s.id} value={s.id}>{s.summary.slice(0, 70)} — {s.provenance.slice(0, 60)}</option>)}
                </select>
                <p className="m-0 mt-1 text-[11px] text-ink-45">Evidence of this account. No source, no role: record the source as evidence first.</p></label>
              <label className="block"><span className={L}>Why</span><textarea rows={2} className={I} value={reason} onChange={(ev) => setReason(ev.target.value)} /></label>
            </div>}
            confirm={person && source && role !== '' && <span data-testid="confirm-text">Name {person.full_name} the {ROLE(role)} of this account, per {source.provenance}. Their attestations, commitments and verifications earn credit in runs produced from now on; runs already sealed are unchanged.</span>}
            canSubmit={unmet.length === 0} unmet={unmet}
            buildBody={() => ({ person_id: personId, role, source_evidence_id: sourceId, reason: reason.trim() })}
            submitLabel="Name the role"
            onSuccess={() => { close(); setReload((n) => n + 1); }} renderSuccess={() => <>Named.</>}
          />
          <button type="button" onClick={close} className="mt-2 text-[11px] text-ink-45 underline">Cancel</button>
        </div>}
    </div>
  );
}
