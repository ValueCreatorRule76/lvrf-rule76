import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { apiFetch } from '../api/http';
import { useActor } from '../actor/ActorContext';
import { FOCUS_RING, GovernedForm } from './GovernedForm';
import { EvidenceRestsOn, type EvidenceFormShown } from './EvidenceRestsOn';
import { useEvidenceForm } from './EvidenceFormInput';
import { VerifiedUnopenedLine } from './RecordReadings';
import { SystemExerciseLine, type SystemExerciseMark } from './SystemExercise';
import { LineageLink } from './LineageLink';
import { Badge } from './workbench/Card';
import { useAbout } from './useAbout';
import { label, EVIDENCE_KIND, SUPPORTS } from '../lib/labels';
import { day } from '../lib/workspaceStatus';

/**
 * L41 + L47 (LVRF_PLAN §13; Brad's D1–D8 and four conditions, 1 Nov 2026) — the account's evidence, the one place
 * every row of an account is reachable: what it is about, what it rests on, who opened it, and the acts on it.
 *
 *   - Record a source: account evidence, with no outcome link and no `supports` (L47).
 *   - Record that you opened the source: the only act that verifies. A row from before evidence forms gives what
 *     was read; an attestation gives the attester's own words, from a document from that person (condition 1).
 *   - Withdraw the verification (steward): a row verified with no opening, which nobody can open.
 *   - Supersede (steward): the correction, a new row born unverified. Links are not moved.
 */
const L = 'mb-1 block text-[10px] font-semibold uppercase tracking-[.16em] text-ink-45';
const I = 'w-full border border-rule bg-white px-2.5 py-1.5 text-[13px] text-ink ' + FOCUS_RING;
const SMALL = 'border border-silver px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-[.1em] text-ink-45 hover:border-ink hover:text-ink disabled:cursor-not-allowed disabled:hover:border-silver disabled:hover:text-ink-45 ' + FOCUS_RING;
/** The kinds a source recorded here may be; an attestation comes with commit and verify, a result with an assessment. */
const SOURCE_KINDS = ['public_filing', 'system_export', 'artifact', 'vendor_publication', 'observation'];

interface Row extends EvidenceFormShown {
  id: string; kind: string; summary: string; provenance: string; source_reference: string | null;
  source_verified: boolean; citation_resolved: boolean; ai_sourced: boolean; simulated: boolean; superseded_by_id: string | null;
  attester_document: string | null; opened_by: string | null; opened_on: string | null; attested_by: string | null;
  captured_by: string; captured_on: string; about: string | null; basis: string | null; basis_reason: string | null;
  under_finding: boolean; system_exercise: SystemExerciseMark | null; links: { supports: string; withdrawn: boolean }[];
}
function SourceForm({ institutionId, path, submitLabel, provenance, extraFields, extraBody, extraUnmet = [], onDone, simulatedChoice }: {
  institutionId: string; path: string; submitLabel: string; provenance: ReactNode; extraFields?: ReactNode;
  extraBody?: () => Record<string, unknown>; extraUnmet?: string[]; onDone: () => void; simulatedChoice?: boolean;
}) {
  const [kind, setKind] = useState('');
  const [summary, setSummary] = useState('');
  const [origin, setOrigin] = useState('');
  const [reference, setReference] = useState('');
  const [simulated, setSimulated] = useState('false');
  const about = useAbout(institutionId);
  const form = useEvidenceForm({ allowed: ['quote', 'locator'], kind, sourceReference: reference });
  const unmet = [...(kind === '' ? ['choose the kind'] : []), ...(summary.trim() === '' ? ['write the summary'] : []),
    ...(origin.trim().length < 12 ? ['state where it came from, in at least 12 characters'] : []), ...form.unmet, ...about.unmet, ...extraUnmet];
  return (
    <GovernedForm<{ evidence_id: string }>
      path={path} provenanceLabel="What this records" provenance={provenance}
      fields={<div className="flex flex-col gap-3">
        <label className="block"><span className={L}>Kind</span>
          <select className={I} value={kind} onChange={(ev) => setKind(ev.target.value)} data-testid="source-kind">
            <option value="" disabled>— choose —</option>
            {SOURCE_KINDS.map((k) => <option key={k} value={k}>{label(EVIDENCE_KIND, k)}</option>)}
          </select></label>
        <label className="block"><span className={L}>What it states</span>
          <textarea rows={2} className={I} value={summary} onChange={(ev) => setSummary(ev.target.value)} data-testid="source-summary" /></label>
        <label className="block"><span className={L}>Where it came from</span>
          <input className={I} value={origin} onChange={(ev) => setOrigin(ev.target.value)} data-testid="source-provenance" /></label>
        <label className="block"><span className={L}>Citation, export ID or URL</span>
          <input className={I} value={reference} onChange={(ev) => setReference(ev.target.value)} data-testid="source-reference" /></label>
        {about.fields}
        {form.fields}
        {simulatedChoice && <label className="block"><span className={L}>Simulated?</span>
          <select className={I} value={simulated} onChange={(ev) => setSimulated(ev.target.value)}>
            <option value="false">No</option><option value="true">Yes</option>
          </select></label>}
        {extraFields}
      </div>}
      canSubmit={unmet.length === 0} unmet={unmet}
      buildBody={() => ({ kind, summary: summary.trim(), provenance: origin.trim(), about: about.body(), ...form.body(),
        ...(reference.trim() !== '' ? { source_reference: reference.trim() } : {}),
        ...(simulatedChoice && simulated === 'true' ? { simulated: true } : {}), ...(extraBody?.() ?? {}) })}
      submitLabel={submitLabel} onSuccess={onDone} renderSuccess={() => <>Recorded, unverified.</>}
    />
  );
}

/** L47: "Record a source…", on this card and on the roles card. */
export function RecordSource({ institutionId, onRecorded }: { institutionId: string; onRecorded: () => void }) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return <button type="button" onClick={() => setOpen(true)} data-testid="record-source-open"
      className={'self-start border border-ink px-3 py-1.5 text-[12px] font-semibold text-ink hover:bg-ink hover:text-offwhite ' + FOCUS_RING}>Record a source…</button>;
  }
  return (
    <div className="border-t border-rule-soft pt-3" data-testid="record-source">
      <SourceForm institutionId={institutionId} path={`/api/institutions/${institutionId}/evidence`} submitLabel="Record the source"
        provenance={<p className="m-0 text-[12.5px] text-ink">A source this account&apos;s evidence rests on, with what it states and where it came from. It supports <strong>no outcome</strong>, and it is recorded <strong>unverified</strong>: a person verifies it by opening the source.</p>}
        onDone={() => { setOpen(false); onRecorded(); }} />
      <button type="button" onClick={() => setOpen(false)} className="mt-2 text-[11px] text-ink-45 underline">Cancel</button>
    </div>
  );
}

function OpenSource({ row, onDone }: { row: Row; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [supports, setSupports] = useState<'' | 'true' | 'false'>('');
  const [document, setDocument] = useState('');
  const attestation = row.kind === 'attestation' || row.attested_by !== null;
  const needsReading = row.evidence_form === 'legacy' || row.evidence_form === 'statement';
  const form = useEvidenceForm({ allowed: ['quote', 'locator'], kind: row.kind, sourceReference: row.source_reference ?? '' });
  if (!open) return <button type="button" onClick={() => setOpen(true)} className={SMALL} data-testid="open-source-open">Record that you opened the source…</button>;
  const yes = supports === 'true';
  const unmet = [...(supports === '' ? ['say whether the source supports it'] : []),
    ...(yes && attestation && document === '' ? ["name the document from the attester"] : []),
    ...(yes && needsReading ? form.unmet : [])];
  return (
    <div className="mt-1.5 w-full border-t border-rule-soft pt-2" data-testid="open-source">
      <GovernedForm<{ evidence_id: string }>
        path={`/api/evidence/${row.id}/open-citation`} provenanceLabel="What this records"
        provenance={<p className="m-0 text-[12.5px] text-ink">That you opened this source and read it, with your name and the time. It is <strong>final</strong>: a wrong opening is corrected by superseding the evidence.{attestation ? <> An attestation is verified on <strong>the attester&apos;s own words</strong>, from a document from that person, never on the analyst&apos;s typing.</> : null}</p>}
        fields={<div className="flex flex-col gap-3">
          <label className="block"><span className={L}>Does the source say what this evidence states?</span>
            <select className={I} value={supports} onChange={(ev) => setSupports(ev.target.value as '' | 'true' | 'false')} data-testid="open-source-supports">
              <option value="" disabled>— choose —</option>
              <option value="true">Yes — the source is verified</option>
              <option value="false">No — opened, and it stays unverified</option>
            </select></label>
          {yes && attestation && <label className="block"><span className={L}>The document from {row.attested_by ?? 'the attester'}</span>
            <select className={I} value={document} onChange={(ev) => setDocument(ev.target.value)} data-testid="open-source-document">
              <option value="" disabled>— choose —</option>
              <option value="email">An email</option><option value="signed_statement">A signed statement</option><option value="letter">A letter</option>
            </select></label>}
          {yes && needsReading && form.fields}
        </div>}
        canSubmit={unmet.length === 0} unmet={unmet}
        buildBody={() => ({ source_verified: yes, ...(yes && attestation ? { attester_document: document } : {}), ...(yes && needsReading ? form.body() : {}) })}
        submitLabel="Record the opening" onSuccess={onDone} renderSuccess={() => <>Recorded.</>} />
      <button type="button" onClick={() => setOpen(false)} className="mt-2 text-[11px] text-ink-45 underline">Cancel</button>
    </div>
  );
}

function WithdrawVerification({ row, notSteward, onDone }: { row: Row; notSteward?: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  if (!open) return <button type="button" disabled={Boolean(notSteward)} title={notSteward} onClick={() => setOpen(true)} className={SMALL} data-testid="withdraw-verification-open">Withdraw the verification…</button>;
  const unmet = reason.trim().length < 12 ? ['say why, in at least 12 characters'] : [];
  return (
    <div className="mt-1.5 w-full border-t border-rule-soft pt-2" data-testid="withdraw-verification">
      <GovernedForm<{ evidence_id: string }>
        path={`/api/evidence/${row.id}/withdraw-verification`} provenanceLabel="What this records" disabledReason={notSteward}
        provenance={<p className="m-0 text-[12.5px] text-ink">That this evidence is no longer verified, by you, with your reason. <strong>No sealed run changes</strong>; the next run reads it unverified. Only an opening can verify it after this.</p>}
        fields={<label className="block"><span className={L}>Why</span><textarea rows={2} className={I} value={reason} onChange={(ev) => setReason(ev.target.value)} data-testid="withdraw-verification-reason" /></label>}
        confirm={<span data-testid="confirm-text">Withdraw the verification of &ldquo;{row.summary.slice(0, 90)}&rdquo;.</span>}
        canSubmit={unmet.length === 0} unmet={unmet}
        buildBody={() => ({ reason: reason.trim() })}
        submitLabel="Withdraw the verification" onSuccess={onDone} renderSuccess={() => <>Withdrawn.</>} />
      <button type="button" onClick={() => setOpen(false)} className="mt-2 text-[11px] text-ink-45 underline">Cancel</button>
    </div>
  );
}

function Supersede({ row, institutionId, notSteward, onDone }: { row: Row; institutionId: string; notSteward?: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  if (!open) return <button type="button" disabled={Boolean(notSteward)} title={notSteward} onClick={() => setOpen(true)} className={SMALL} data-testid="supersede-open">Supersede…</button>;
  return (
    <div className="mt-1.5 w-full border-t border-rule-soft pt-2" data-testid="supersede">
      <SourceForm institutionId={institutionId} path={`/api/evidence/${row.id}/supersede`} submitLabel="Supersede this evidence" simulatedChoice
        provenance={<p className="m-0 text-[12.5px] text-ink">A new row that replaces this one, recorded <strong>unverified</strong>. This row stays on the record, pointing to it. <strong>Its links are not moved</strong>: withdraw or correct them on the outcome.</p>}
        extraFields={<label className="block"><span className={L}>Why it is superseded</span><textarea rows={2} className={I} value={reason} onChange={(ev) => setReason(ev.target.value)} data-testid="supersede-reason" /></label>}
        extraBody={() => ({ reason: reason.trim() })}
        extraUnmet={reason.trim().length < 12 ? ['say why, in at least 12 characters'] : []}
        onDone={onDone} />
      <button type="button" onClick={() => setOpen(false)} className="mt-2 text-[11px] text-ink-45 underline">Cancel</button>
    </div>
  );
}

export function AccountEvidence({ institutionId }: { institutionId: string }) {
  const { actor } = useActor();
  const [rows, setRows] = useState<Row[] | null | 'error'>(null);
  const load = useCallback(() => {
    apiFetch(`/api/institutions/${institutionId}/evidence`).then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j) => setRows(j.evidence as Row[]), () => setRows('error'));
  }, [institutionId]);
  useEffect(load, [load]);
  const steward = (act: string) => (actor?.is_steward ? undefined : `${act} is the steward's act — ${actor?.steward_name ?? "the tenant's steward"}'s alone.`);
  if (rows === null) return <p className="m-0 text-[12.5px] text-ink-45">Reading the evidence…</p>;
  if (rows === 'error') return <p className="m-0 text-[12.5px] text-critical">Couldn&apos;t read the evidence.</p>;
  return (
    <div className="flex flex-col gap-3" data-testid="account-evidence">
      {rows.length === 0 ? <p className="m-0 text-[12.5px] text-ink-45">No evidence recorded for this account yet.</p>
        : <ul className="m-0 list-none p-0">
          {rows.map((e) => {
            const live = e.links.filter((l) => !l.withdrawn);
            const openable = !e.citation_resolved && e.superseded_by_id === null && !e.under_finding && !e.simulated
              && !(e.evidence_form === 'statement' && e.kind === 'observation') && !(e.ai_sourced && live.length === 0);
            return (
              <li key={e.id} className="border-b border-rule-soft py-2.5 last:border-b-0" data-testid="account-evidence-row" data-evidence={e.id}>
                <div className="flex flex-wrap items-baseline gap-2">
                  <Badge tone={e.source_verified ? 'healthy' : 'warning'}>{e.source_verified ? 'Source-verified' : 'Not source-verified'}</Badge>
                  <span className="text-[13px] text-ink">{e.summary}</span>
                </div>
                <p className="m-0 mt-1 text-[11.5px] text-ink-45">
                  {label(EVIDENCE_KIND, e.kind)} · recorded by {e.captured_by}, {day(e.captured_on)}
                  {' · '}<span data-testid="evidence-about">{e.about ? <>about {e.about}</> : <span className="text-warning">what it is about is not yet stated</span>}</span>
                  {' · '}{live.length === 0 ? 'supports no outcome' : `supports ${live.map((l) => label(SUPPORTS, l.supports)).join(', ')}`}
                </p>
                <p className="m-0 mt-0.5 text-[11.5px] text-ink-45 [overflow-wrap:anywhere]">Source: {e.provenance}</p>
                <EvidenceRestsOn e={e} className="mt-0.5" />
                {e.citation_resolved && (
                  <p className="m-0 mt-0.5 text-[11.5px] text-ink-45" data-testid="evidence-opened">
                    Opened by {e.opened_by ?? 'a person not on record'}{e.opened_on ? `, ${day(e.opened_on)}` : ''}{e.attester_document ? `, from a ${e.attester_document.replace('_', ' ')} from ${e.attested_by}` : ''}{e.source_verified ? '' : ': it does not support this evidence'}
                  </p>
                )}
                {e.source_verified && !e.citation_resolved && <VerifiedUnopenedLine className="mt-0.5" />}
                {e.basis_reason && <span className="mt-0.5 block text-[11.5px] text-warning" data-testid="evidence-basis-reason">{e.basis}: {e.basis_reason}</span>}
                {e.superseded_by_id && <p className="m-0 mt-0.5 text-[11.5px] text-ink-45" data-testid="evidence-superseded">Superseded by a later row.</p>}
                {e.system_exercise && <SystemExerciseLine mark={e.system_exercise} className="mt-0.5" />}
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <LineageLink table="evidence" id={e.id} />
                  {openable && <OpenSource row={e} onDone={load} />}
                  {e.source_verified && !e.citation_resolved && <WithdrawVerification row={e} notSteward={steward('Withdrawing a verification')} onDone={load} />}
                  {e.superseded_by_id === null && <Supersede row={e} institutionId={institutionId} notSteward={steward('Superseding evidence')} onDone={load} />}
                </div>
              </li>
            );
          })}
        </ul>}
      <RecordSource institutionId={institutionId} onRecorded={load} />
    </div>
  );
}
