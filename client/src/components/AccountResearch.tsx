import { useEffect, useMemo, useState } from 'react';
import {
  fetchAccountResearch,
  type AccountPendingResult,
  type AccountPrompt,
  type FetchAccountResearchResult,
  type GeneratedAccountPrompt,
} from '../api/accountResearch';
import { Card, Badge } from './workbench/Card';
import { GovernedAction } from './GovernedAction';
import { FOCUS_RING, GovernedForm } from './GovernedForm';

/**
 * Q4h — account research intake (3.0 item 6), on the account page; plan
 * LVRF_PLAN §4e. Mirrors the pack's R1–R5:
 *
 *   A1 Entity and regime   the pinned entity and the disclosure regime (or
 *                          "not pinned: research the entity first"), and what
 *                          research reported it could not find, with why
 *   A2 Generate            the prompt, by phase: the entity first, then facts
 *   A3 Prompts on record   stale ones (an older contract version) flagged
 *   A4 Parse               an entity mismatch is named, both sides
 *   A5 Pending review      per field: as_of beside the period as stated, the
 *                          source kind, citation, quote and caveats; the
 *                          ticks "caveats read" and "I opened the citation"
 *                          (H1); accept, accept as not found, or reject
 *
 * Every act here is an AUTHORIZED user's (H2): recording a fact is, and
 * accepting a researched one is recording a fact. No steward gate.
 *
 * NEVER a measure- or verify-stage value: the contract has no field for one
 * and the prompt does not ask (AMENDMENT-005 Art. I).
 */

const LABEL_CLASS = 'mb-1 block text-[10px] font-semibold uppercase tracking-[.16em] text-ink-45';
const INPUT_CLASS = 'w-full border border-rule bg-white px-2.5 py-1.5 text-[13px] text-ink ' + FOCUS_RING;
const SMALL_BUTTON =
  'border border-silver px-2.5 py-1 text-[9.5px] font-semibold uppercase tracking-[.1em] text-ink-45 hover:border-ink hover:text-ink ' +
  FOCUS_RING;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const when = (ts: string) => ts.replace('T', ' ').slice(0, 16) + ' UTC';
const KIND: Record<string, string> = {
  revenue: 'Revenue', headcount: 'Headcount', stated_priority: 'Stated priority', system: 'System',
  entity: 'Entity', disclosure_regime: 'Disclosure regime',
};
const REGIME: Record<string, string> = {
  public_filer: 'Public filer', private: 'Private', subsidiary_of_filer: 'Subsidiary of a filer', public_sector: 'Public sector',
};
const describeEntity = (e: Record<string, unknown>) =>
  `${String(e['legal_name'])} — ${String(e['identifier_type'])} ${String(e['identifier'])}${e['registry_jurisdiction'] ? ` (${String(e['registry_jurisdiction'])})` : ''}`;

function PromptText({ text }: { text: string }) {
  const [copied, setCopied] = useState<'idle' | 'copied' | 'failed'>('idle');
  return (
    <div className="mt-2">
      <button type="button" className={SMALL_BUTTON}
        onClick={() => navigator.clipboard.writeText(text).then(() => setCopied('copied'), () => setCopied('failed'))}>
        {copied === 'copied' ? 'Copied' : copied === 'failed' ? 'Copy failed — select the text' : 'Copy prompt'}
      </button>
      <pre className="m-0 mt-2 max-h-80 overflow-auto whitespace-pre-wrap border border-rule bg-offwhite p-3 font-mono text-[11px] leading-relaxed text-ink">
        {text}
      </pre>
    </div>
  );
}

// ------------------------------------------------------------------ A1

// Q4h addition (Brad, 12 Oct) — correcting the pinned entity supersedes it,
// with a reason; an authorized act, as pinning is. What was accepted under
// the old entity is listed below for review, never changed or hidden.
function CorrectEntityForm({ institutionId, onCorrected }: { institutionId: string; onCorrected: () => void }) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ legal_name: '', identifier_type: 'sec_cik', identifier: '', registry_jurisdiction: '', source_kind: 'public_filing', citation: '', supersession_reason: '' });
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV({ ...v, [k]: e.target.value });
  if (!open) return <button type="button" className={SMALL_BUTTON + ' mt-3'} onClick={() => setOpen(true)}>Correct the entity…</button>;
  return (
    <div className="mt-3 border-t border-rule-soft pt-3" data-testid="correct-entity">
      <GovernedForm<{ entity: string; facts_accepted_under_previous_entity: unknown[] }>
        path={`/api/institutions/${institutionId}/entity/supersede`}
        provenanceLabel="What this records"
        provenance={<p className="m-0 text-[12.5px] text-ink">A correction: the pinned entity is superseded by this one, with your reason. Nothing accepted under the old entity is changed; it is listed for review. Every later prompt names the corrected entity.</p>}
        fields={
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block sm:col-span-2"><span className={LABEL_CLASS}>Legal name</span><input className={INPUT_CLASS} value={v.legal_name} onChange={set('legal_name')} /></label>
            <label className="block"><span className={LABEL_CLASS}>Kind of identifier</span>
              <select className={INPUT_CLASS} value={v.identifier_type} onChange={set('identifier_type')}>
                <option value="sec_cik">sec_cik</option><option value="ticker">ticker</option><option value="registry">registry</option>
              </select></label>
            <label className="block"><span className={LABEL_CLASS}>Identifier</span><input className={INPUT_CLASS} value={v.identifier} onChange={set('identifier')} /></label>
            {v.identifier_type === 'registry' && (
              <label className="block"><span className={LABEL_CLASS}>Registry jurisdiction</span><input className={INPUT_CLASS} value={v.registry_jurisdiction} onChange={set('registry_jurisdiction')} /></label>
            )}
            <label className="block"><span className={LABEL_CLASS}>Source kind</span>
              <select className={INPUT_CLASS} value={v.source_kind} onChange={set('source_kind')}>
                <option value="public_filing">public_filing</option><option value="company_publication">company_publication</option><option value="third_party_publication">third_party_publication</option>
              </select></label>
            <label className="block sm:col-span-2"><span className={LABEL_CLASS}>Where it is established (citation)</span><input className={INPUT_CLASS} value={v.citation} onChange={set('citation')} /></label>
            <label className="block sm:col-span-2"><span className={LABEL_CLASS}>Why the pinned entity is wrong (required)</span><textarea rows={2} className={INPUT_CLASS} value={v.supersession_reason} onChange={set('supersession_reason')} /></label>
          </div>
        }
        canSubmit={v.legal_name.trim() !== '' && v.identifier.trim() !== '' && v.citation.trim().length >= 12 && v.supersession_reason.trim().length >= 12}
        buildBody={() => ({ ...v, registry_jurisdiction: v.identifier_type === 'registry' ? v.registry_jurisdiction : null })}
        submitLabel="Correct the entity"
        onSuccess={onCorrected}
        renderSuccess={(d) => <>Corrected: now {d.entity}. {d.facts_accepted_under_previous_entity.length} fact(s) accepted under the previous entity are listed for review.</>}
      />
    </div>
  );
}

function EntityCard({ state, onCorrected }: { state: Extract<FetchAccountResearchResult, { status: 'ok' }>['research']; onCorrected: () => void }) {
  const e = state.entity;
  return (
    <Card n="A1" title="Entity and disclosure regime" badge={<Badge tone={e ? 'neutral' : 'watch'}>{e ? 'Pinned' : 'Not pinned'}</Badge>}>
      {e ? (
        <div data-testid="pinned-entity">
          <p className="m-0 text-[14px] font-semibold text-ink">{e.legal_name}</p>
          <p className="m-0 mt-0.5 font-mono text-[11.5px] text-ink-45">
            {e.identifier_type} {e.identifier}{e.registry_jurisdiction ? ` (${e.registry_jurisdiction})` : ''}
          </p>
          <p className="m-0 mt-1 text-[11.5px] text-ink-45">
            Pinned by {e.captured_by}, {when(e.created_at)} · {e.citation_resolved ? 'citation opened by the reviewer' : 'citation not opened'}
          </p>
          <p className="m-0 mt-1 font-mono text-[10.5px] text-ink-45">{e.provenance}</p>
          <p className="m-0 mt-1 text-[11px] text-ink-45">Correcting an entity supersedes it; every later fact is researched against the current one.</p>
          <CorrectEntityForm institutionId={state.institution.id} onCorrected={onCorrected} />
        </div>
      ) : (
        <p className="m-0 text-[12.5px] text-ink">
          Not pinned: research the entity first. No researched fact is accepted until this account's legal entity is
          pinned (3.0 item 3).
        </p>
      )}
      <div className="mt-3 border-t border-rule-soft pt-3">
        <span className={LABEL_CLASS}>Disclosure regime</span>
        {state.regime ? (
          <p className="m-0 text-[13px] text-ink" data-testid="regime">
            {REGIME[state.regime.value] ?? state.regime.value} <span className="text-ink-45">(as of {state.regime.as_of})</span>
          </p>
        ) : (
          <p className="m-0 text-[12.5px] text-ink-45">Not recorded.</p>
        )}
      </div>
      {state.under_previous_entity.length > 0 && (
        <div className="mt-3 border-l-[3px] border-warning bg-offwhite px-3.5 py-3" data-testid="under-previous-entity">
          <span className="block text-[10px] font-semibold uppercase tracking-[.16em] text-warning">
            Accepted under the previous entity: review
          </span>
          <p className="m-0 mt-1 text-[11.5px] text-ink-45">
            These were accepted while a since-corrected entity was this account's. They are unchanged; check each against the
            current entity, and correct a fact by superseding it.
          </p>
          <ul className="m-0 mt-1.5 list-none p-0">
            {state.under_previous_entity.map((f) => (
              <li key={f.fact_id} className="py-1 text-[12.5px] text-ink">
                <span className="font-semibold">{KIND[f.kind] ?? f.kind}:</span> {REGIME[f.value] ?? f.value}
                <span className="text-ink-45"> (as of {f.as_of}) · under {f.legal_name}, {f.identifier_type} {f.identifier}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-3 border-t border-rule-soft pt-3" data-testid="not-found">
        <span className={LABEL_CLASS}>Not found by research</span>
        {state.not_found.length === 0 ? (
          <p className="m-0 text-[12.5px] text-ink-45">Nothing recorded as not found.</p>
        ) : (
          <ul className="m-0 list-none p-0">
            {state.not_found.map((n, i) => (
              <li key={i} className="py-1 text-[12.5px] text-ink">
                <span className="font-semibold">{KIND[n.kind] ?? n.kind}:</span> {n.reason}
                <span className="ml-1 text-[11px] text-ink-45">(accepted as not found by {n.reviewed_by}, {n.reviewed_at.slice(0, 10)})</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

// ------------------------------------------------------------------ A2, A3

function GenerateCard({ institutionId, phase, onGenerated }: { institutionId: string; phase: 'entity' | 'facts'; onGenerated: () => void }) {
  const [key, setKey] = useState(0);
  const [generated, setGenerated] = useState(false);
  return (
    <Card n="A2" title="Generate a research prompt">
      <p className="m-0 mb-3 max-w-[80ch] text-[12.5px] text-ink-45">
        {phase === 'entity'
          ? 'Phase: ENTITY FIRST. The prompt asks only which legal entity this account is, and its disclosure regime. Facts are refused until the entity is pinned.'
          : 'Phase: FACTS, for the pinned entity. The prompt names it, lists what is already recorded and what research could not find, and asks for every fact kind.'}{' '}
        Stored exactly as generated. Give the agent the whole text.
      </p>
      <GovernedAction<GeneratedAccountPrompt>
        key={key}
        label="Generate research prompt"
        path={`/api/institutions/${institutionId}/research-prompts`}
        actorRequiredNote="Sign in to generate a prompt — the prompt records who generated it."
        onSuccess={() => { setGenerated(true); onGenerated(); }}
        renderSuccess={(d) => (
          <>
            <p className="m-0 font-mono text-[11px] text-ink-45">
              prompt {d.prompt_id} · phase {d.phase}{d.entity ? ` · ${d.entity}` : ''} · contract v{d.contract_version}
            </p>
            <p className="m-0 mt-0.5 font-mono text-[11px] text-ink-45">sha256 {d.prompt_sha256}</p>
            <PromptText text={d.prompt} />
          </>
        )}
      />
      {generated && (
        <button type="button" className={SMALL_BUTTON + ' mt-3'} onClick={() => { setGenerated(false); setKey((k) => k + 1); }}>
          Generate another
        </button>
      )}
    </Card>
  );
}

function PromptsCard({ prompts, versionNow }: { prompts: AccountPrompt[]; versionNow: number }) {
  return (
    <Card n="A3" title="Prompts on record" badge={<Badge tone="neutral">{prompts.length}</Badge>}>
      {prompts.length === 0 ? (
        <p className="m-0 text-[12.5px] text-ink-45">No prompt has been generated for this account yet.</p>
      ) : prompts.map((p) => (
        <div key={p.id} className="border-b border-rule-soft py-3 last:border-b-0">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="font-mono text-[11.5px] text-ink">{p.id}</span>
            <span className="flex items-center gap-1.5">
              <Badge tone="neutral">{p.phase}</Badge>
              <Badge tone="neutral">contract v{p.contract_version}</Badge>
              {p.contract_version !== versionNow && <Badge tone="warning">Stale</Badge>}
            </span>
          </div>
          <p className="m-0 mt-1 text-[11.5px] text-ink-45">
            Generated by {p.generated_by}, {when(p.generated_at)} · {p.results_count} {p.results_count === 1 ? 'result' : 'results'} parsed against it
          </p>
          <details className="mt-1.5">
            <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-[.1em] text-ink-45">Show the prompt</summary>
            <PromptText text={p.prompt_text} />
          </details>
        </div>
      ))}
    </Card>
  );
}

// ------------------------------------------------------------------ A4

function ParseCard({ institutionId, onParsed }: { institutionId: string; onParsed: () => void }) {
  const [key, setKey] = useState(0);
  const [text, setText] = useState('');
  const [done, setDone] = useState(false);
  const parsed = useMemo((): { ok: true; value: Record<string, unknown> } | { ok: false; message: string } | null => {
    if (text.trim() === '') return null;
    try {
      const v: unknown = JSON.parse(text);
      return isRecord(v) ? { ok: true, value: v } : { ok: false, message: 'The response must be one JSON object.' };
    } catch (e) {
      return { ok: false, message: `Not valid JSON — nothing will be sent. ${e instanceof Error ? e.message : ''}` };
    }
  }, [text]);
  return (
    <Card n="A4" title="Parse a research response">
      <GovernedForm<{ count: number; results: { field_name: string; found: boolean }[] }>
        key={key}
        path={`/api/institutions/${institutionId}/research-results`}
        provenanceLabel="What this records"
        provenance={
          <p className="m-0 text-[12.5px] text-ink">
            What the agent returned, parsed by you, one row per field. Nothing becomes a fact until a person accepts it.
            A response about a different entity, or with any problem, is refused whole, and the refusal is recorded.
          </p>
        }
        fields={
          <label className="block">
            <span className={LABEL_CLASS}>The agent's JSON response</span>
            <textarea rows={10} value={text} onChange={(e) => setText(e.target.value)} spellCheck={false}
              className={INPUT_CLASS + ' font-mono text-[11.5px]'} />
            {parsed && !parsed.ok && <p className="m-0 mt-1 text-[11.5px] text-critical">{parsed.message}</p>}
          </label>
        }
        canSubmit={parsed?.ok === true}
        buildBody={() => (parsed?.ok ? parsed.value : {})}
        submitLabel="Parse"
        onSuccess={() => { setDone(true); onParsed(); }}
        renderSuccess={(d) => (
          <>{d.count} {d.count === 1 ? 'result' : 'results'} pending review: {d.results.map((r) => `${KIND[r.field_name] ?? r.field_name}${r.found ? '' : ' (not found)'}`).join('; ')}.</>
        )}
      />
      {done && (
        <button type="button" className={SMALL_BUTTON + ' mt-3'} onClick={() => { setDone(false); setText(''); setKey((k) => k + 1); }}>
          Parse another response
        </button>
      )}
    </Card>
  );
}

// ------------------------------------------------------------------ A5

function FieldBody({ r }: { r: AccountPendingResult }) {
  const it = r.raw_response.item;
  const row = (label: string, value: unknown, mono = false) => (
    <div className="contents">
      <dt className="text-[10px] font-semibold uppercase tracking-[.13em] text-ink-45">{label}</dt>
      <dd className={mono ? 'm-0 font-mono text-[11.5px] text-ink' : 'm-0 text-[12.5px] text-ink'}>{value === null || value === undefined ? '—' : String(value)}</dd>
    </div>
  );
  return (
    <dl className="m-0 mt-2 grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-[10rem_1fr]">
      {r.raw_response.subject === 'entity' && <>{row('Entity', describeEntity(it))}{row('Source kind', it['source_kind'])}{row('Citation', it['citation'], true)}</>}
      {r.raw_response.subject === 'disclosure_regime' && <>
        {row('Regime', REGIME[String(it['value'])] ?? it['value'])}{row('Basis', it['basis'])}{row('As of', it['as_of'])}
        {row('Source kind', it['source_kind'])}{row('Citation', it['citation'], true)}</>}
      {r.raw_response.subject === 'fact' && <>
        {row('Value', `${String(it['value'])}${it['unit'] ? ` ${String(it['unit'])}` : ''}`)}
        {/* L6: the period the fact describes, as a date and as stated, side by side. */}
        {row('As of (period end)', it['as_of'])}{row('Period, as stated', it['period'])}
        {row('Source kind', it['source_kind'])}{row('Citation', it['citation'], true)}{row('Quote', it['quote'])}</>}
      {r.raw_response.subject === 'not_found' && row('Not found, because', it['reason'])}
    </dl>
  );
}

function Caveats({ item }: { item: Record<string, unknown> }) {
  const c = Array.isArray(item['caveats']) ? (item['caveats'] as unknown[]) : null;
  if (c === null) return null;
  return (
    <div className="mt-3 border-l-[3px] border-warning bg-offwhite px-3.5 py-3" data-testid="stated-caveats">
      <span className="block text-[10px] font-semibold uppercase tracking-[.16em] text-warning">The research's stated caveats</span>
      {c.length === 0 ? <p className="m-0 mt-1 text-[12px] text-ink-45">The research stated none.</p> : (
        <ul className="m-0 mt-1.5 list-disc pl-5">{c.map((x, i) => <li key={i} className="py-0.5 text-[12.5px] text-ink">{String(x)}</li>)}</ul>
      )}
    </div>
  );
}

function ReviewForm({ r, onDecided }: { r: AccountPendingResult; onDecided: (d: string) => void }) {
  const [decision, setDecision] = useState<'accept' | 'reject'>('accept');
  const [note, setNote] = useState('');
  const [caveatsRead, setCaveatsRead] = useState(false);
  const [opened, setOpened] = useState(false);
  const found = r.found;
  const ready = note.trim() !== '' && (decision === 'reject' || !found || (caveatsRead && opened));
  return (
    <div className="mt-3">
      <GovernedForm<{ review_state: string }>
        path={`/api/account-research-results/${r.id}/${decision}`}
        provenanceLabel="Your review"
        provenance={
          <p className="m-0 text-[12px] text-ink">
            {found
              ? 'Accepting records it: one evidence row and the fact (or the entity), in one transaction, with the citation recorded as opened by you. Rejecting keeps the result as rejected. Either is final.'
              : 'Accepting records that research could not find it, and why; nothing else is written. Rejecting keeps it as rejected.'}
          </p>
        }
        fields={
          <>
            <div className="mb-3 flex gap-4 text-[12.5px] text-ink">
              {(['accept', 'reject'] as const).map((d) => (
                <label key={d} className="flex items-center gap-1.5">
                  <input type="radio" name={`decision-${r.id}`} checked={decision === d} onChange={() => setDecision(d)} />
                  {d === 'accept' ? (found ? 'Accept' : 'Accept as not found') : 'Reject'}
                </label>
              ))}
            </div>
            {found && (
              <>
                <label className="mb-1.5 flex items-center gap-2 text-[12.5px] text-ink">
                  <input type="checkbox" checked={caveatsRead} onChange={(e) => setCaveatsRead(e.target.checked)} />
                  I have read the research's caveats <span className="text-[11px] text-ink-45">(required to accept)</span>
                </label>
                <label className="mb-3 flex items-center gap-2 text-[12.5px] text-ink">
                  <input type="checkbox" checked={opened} onChange={(e) => setOpened(e.target.checked)} data-testid="citation-opened" />
                  I opened the citation and it says this <span className="text-[11px] text-ink-45">(required to accept; recorded as resolved by you)</span>
                </label>
              </>
            )}
            <label className="block">
              <span className={LABEL_CLASS}>Review note (required)</span>
              <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} className={INPUT_CLASS} />
            </label>
          </>
        }
        canSubmit={ready}
        buildBody={() => ({ review_note: note, ...(decision === 'accept' && found ? { citation_opened: opened } : {}) })}
        submitLabel={decision === 'accept' ? (found ? 'Accept' : 'Accept as not found') : 'Reject'}
        onSuccess={() => onDecided(`${KIND[r.field_name] ?? r.field_name}: ${decision === 'accept' ? (found ? 'accepted' : 'accepted as not found') : 'rejected'}`)}
        renderSuccess={(d) => <>Recorded as {d.review_state}.</>}
      />
    </div>
  );
}

function PendingCard({ pending, lastDecision, onDecided }: { pending: AccountPendingResult[]; lastDecision: string | null; onDecided: (d: string) => void }) {
  return (
    <Card n="A5" title="Pending review" badge={<Badge tone="neutral">{pending.length}</Badge>}>
      {lastDecision && <p className="m-0 mb-2 text-[12px] text-healthy">Recorded — {lastDecision}.</p>}
      {pending.length === 0 ? <p className="m-0 text-[12.5px] text-ink-45">Nothing is waiting for review.</p> : pending.map((r) => (
        <div key={r.id} className="border-b border-rule-soft py-4 last:border-b-0" data-testid="pending-field">
          <h4 className="m-0 font-display text-[17px] tracking-[.01em] text-ink">
            {KIND[r.field_name] ?? r.field_name}{r.found ? '' : ' — not found'}
          </h4>
          <p className="m-0 mt-1 text-[11.5px] text-ink-45">
            Parsed by {r.parsed_by}, {when(r.parsed_at)} · research: {r.research_tool}{r.raw_response.ai_sourced ? ' (AI-sourced)' : ''} ·
            prompt <span className="font-mono">{r.prompt_id}</span>
          </p>
          <FieldBody r={r} />
          {r.found && <Caveats item={r.raw_response.item} />}
          <ReviewForm r={r} onDecided={onDecided} />
        </div>
      ))}
    </Card>
  );
}

// ------------------------------------------------------------------ section

export function AccountResearch({ institutionId, onFactsChanged }: { institutionId: string; onFactsChanged: () => void }) {
  const [tick, setTick] = useState(0);
  const [state, setState] = useState<FetchAccountResearchResult | null>(null);
  const [lastDecision, setLastDecision] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchAccountResearch(institutionId).then((r) => { if (!cancelled) setState(r); });
    return () => { cancelled = true; };
  }, [institutionId, tick]);
  const reload = () => { setTick((t) => t + 1); onFactsChanged(); };
  return (
    <section className="mt-10 border-t border-rule pt-6" data-testid="account-research">
      <header className="mb-4">
        <span className="text-[10px] font-semibold uppercase tracking-[.16em] text-ink-45">Research</span>
        <p className="m-0 mt-1 max-w-[85ch] text-[12.5px] leading-relaxed text-ink-45">
          Baseline facts about this account, from what it publishes: the entity first, then revenue, headcount, stated
          priorities and systems. Never a measured outcome — that comes from the customer's own system of record. No code
          here calls a research tool.
        </p>
      </header>
      {!state ? <p className="text-ink-45">loading</p> : state.status !== 'ok' ? <p className="text-critical">{state.message}</p> : (
        <>
          <EntityCard state={state.research} onCorrected={reload} />
          {/* Keyed to the entity: a correction clears a prompt shown for the old one. */}
          <GenerateCard key={state.research.entity?.id ?? 'unpinned'} institutionId={institutionId} phase={state.research.phase_now} onGenerated={reload} />
          <PromptsCard prompts={state.research.prompts} versionNow={state.research.contract_version_now} />
          <div id="account-parse-card"><ParseCard institutionId={institutionId} onParsed={() => { setLastDecision(null); reload(); }} /></div>
          <div id="account-pending-card">
            <PendingCard pending={state.research.pending} lastDecision={lastDecision}
              onDecided={(d) => { setLastDecision(d); reload(); }} />
          </div>
        </>
      )}
    </section>
  );
}
