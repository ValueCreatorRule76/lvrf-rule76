import { useEffect, useMemo, useState } from 'react';
import { useActor } from '../actor/ActorContext';
import {
  fetchIndustryResearch,
  type FetchIndustryResearchResult,
  type GeneratedPrompt,
  type PendingResult,
  type ResearchPrompt,
} from '../api/research';
import { Card, Badge } from './workbench/Card';
import { GovernedAction } from './GovernedAction';
import { FOCUS_RING, GovernedForm } from './GovernedForm';

/**
 * Q4c1 — the pack's research loop, on the pack page (LVRF_PLAN §4b).
 *
 * Five existing routes get a UI here; nothing new is written by this
 * component that a route did not already govern:
 *   generate a prompt   POST /api/industries/:id/research-prompts   authorized
 *   parse a response    POST /api/industries/:id/research-results   authorized
 *   accept / reject     POST /api/research-results/:id/accept|reject steward
 *   exclude a measure   POST /api/industries/:id/exclusions          steward
 * Read: GET /api/industries/:slug/research.
 *
 * STEWARD-ONLY CONTROLS ARE DISABLED, NOT HIDDEN, for everyone else, with
 * the steward's name — the same rule as Band A's other steward acts. The
 * server's 403 stays the authority; this only saves a round trip.
 *
 * THE AGENT'S EXCLUSION LIST IS SHOWN, NOT STORED. Parse validates
 * measures_tested_and_excluded_as_unaddressable and stores none of it (an
 * agent does not decide what leaves a pack). It is read here from the text
 * that was just parsed and listed, so the steward can record each one as a
 * person's exclusion. Brad's rule (12 Oct): the agent's wording goes ONLY
 * into the proposal fields (proposed_by_research_tool / proposal_text,
 * 0026) — never into the reason. The reason box starts empty and only the
 * steward types in it.
 */

const LABEL_CLASS = 'mb-1 block text-[10px] font-semibold uppercase tracking-[.16em] text-ink-45';
const INPUT_CLASS = 'w-full border border-rule bg-white px-2.5 py-1.5 text-[13px] text-ink ' + FOCUS_RING;
const HELP_CLASS = 'm-0 mt-1 text-[11px] text-ink-45';
const SMALL_BUTTON =
  'border border-silver px-2.5 py-1 text-[9.5px] font-semibold uppercase tracking-[.1em] text-ink-45 hover:border-ink hover:text-ink ' +
  FOCUS_RING;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function when(ts: string): string {
  return ts.replace('T', ' ').slice(0, 16) + ' UTC';
}

function CopyButton({ text }: { text: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  return (
    <button
      type="button"
      className={SMALL_BUTTON}
      onClick={() => {
        navigator.clipboard.writeText(text).then(
          () => setState('copied'),
          () => setState('failed'),
        );
      }}
    >
      {state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy failed — select the text' : 'Copy prompt'}
    </button>
  );
}

function PromptText({ text }: { text: string }) {
  return (
    <div className="mt-2">
      <CopyButton text={text} />
      <pre className="m-0 mt-2 max-h-80 overflow-auto whitespace-pre-wrap border border-rule bg-offwhite p-3 font-mono text-[11px] leading-relaxed text-ink">
        {text}
      </pre>
    </div>
  );
}

// ------------------------------------------------------------------ generate

function GenerateCard({ industryId, onGenerated }: { industryId: string; onGenerated: () => void }) {
  const [key, setKey] = useState(0);
  const [generated, setGenerated] = useState(false);
  return (
    <Card n="R1" title="Generate a research prompt">
      <p className="m-0 mb-3 max-w-[80ch] text-[12.5px] text-ink-45">
        Built from this pack as it stands now — its current entries, its exclusions with their
        reasons, and every field the contract requires. Stored exactly as generated; it cannot be
        edited. Give the agent the whole text: its response must return the prompt_id and the
        industry slug exactly as shown, or parse refuses it.
      </p>
      <GovernedAction<GeneratedPrompt>
        key={key}
        label="Generate research prompt"
        path={`/api/industries/${industryId}/research-prompts`}
        actorRequiredNote="Sign in to generate a prompt — the prompt records who generated it."
        onSuccess={() => {
          setGenerated(true);
          onGenerated();
        }}
        renderSuccess={(d) => (
          <>
            <p className="m-0 font-mono text-[11px] text-ink-45">
              prompt {d.prompt_id} · contract v{d.contract_version} · template v{d.template_version}
            </p>
            <p className="m-0 mt-0.5 font-mono text-[11px] text-ink-45">sha256 {d.prompt_sha256}</p>
            <PromptText text={d.prompt} />
          </>
        )}
      />
      {generated && (
        <button
          type="button"
          className={SMALL_BUTTON + ' mt-3'}
          onClick={() => {
            setGenerated(false);
            setKey((k) => k + 1);
          }}
        >
          Generate another
        </button>
      )}
    </Card>
  );
}

// ------------------------------------------------------------------ prompts

function PromptsCard({ prompts, versionNow }: { prompts: ResearchPrompt[]; versionNow: number }) {
  return (
    <Card n="R2" title="Prompts on record" badge={<Badge tone="neutral">{prompts.length}</Badge>}>
      {prompts.length === 0 ? (
        <p className="m-0 text-[12.5px] text-ink-45">No prompt has been generated for this pack yet.</p>
      ) : (
        prompts.map((p) => {
          const stale = p.contract_version !== versionNow;
          return (
            <div key={p.id} className="border-b border-rule-soft py-3 last:border-b-0">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-mono text-[11.5px] text-ink">{p.id}</span>
                <span className="flex items-center gap-1.5">
                  <Badge tone="neutral">contract v{p.contract_version}</Badge>
                  {stale && <Badge tone="warning">Stale</Badge>}
                </span>
              </div>
              <p className="m-0 mt-1 text-[11.5px] text-ink-45">
                Generated by {p.generated_by}, {when(p.generated_at)} · template v{p.template_version} ·
                lists {p.listed_measures} {p.listed_measures === 1 ? 'entry' : 'entries'} and{' '}
                {p.listed_exclusions} {p.listed_exclusions === 1 ? 'exclusion' : 'exclusions'} ·{' '}
                {p.results_count} {p.results_count === 1 ? 'result' : 'results'} parsed against it
              </p>
              <p className="m-0 mt-0.5 font-mono text-[10.5px] text-ink-45">sha256 {p.prompt_sha256}</p>
              {stale && (
                <p className="m-0 mt-1 text-[11.5px] text-warning">
                  Generated against contract v{p.contract_version}; the contract is now v{versionNow}.
                  Parse refuses its responses — generate a new prompt.
                </p>
              )}
              <details className="mt-1.5">
                <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-[.1em] text-ink-45">
                  Show the prompt
                </summary>
                <PromptText text={p.prompt_text} />
              </details>
            </div>
          );
        })
      )}
    </Card>
  );
}

// ------------------------------------------------------------------ parse

interface ParseResponse {
  count: number;
  results: { id: string; field_name: string }[];
}

export interface AgentExclusionPrefill {
  key: number;
  name: string;
  tool: string;
  proposal: string;
}

/** The agent's list, from the text just parsed. Never stored by parse. */
interface AgentList {
  tool: string;
  lines: string[];
}

// The agent's line is "<measure> — <its reason>" by the prompt's own
// example, but nothing holds it to that. The part before the first
// separator is offered as the NAME (the steward can edit it); the WHOLE
// line, unaltered, is the proposal text. Neither ever reaches the reason.
function nameFromLine(line: string): string {
  const m = line.match(/^(.+?)\s+(?:—|–|-)\s+|^(.+?):\s+/);
  return (m ? (m[1] ?? m[2]) : line).trim();
}

function ParseCard({
  industryId,
  prompts,
  versionNow,
  onParsed,
  onRecordExclusion,
}: {
  industryId: string;
  prompts: ResearchPrompt[];
  versionNow: number;
  onParsed: () => void;
  onRecordExclusion: (p: Omit<AgentExclusionPrefill, 'key'>) => void;
}) {
  const [key, setKey] = useState(0);
  const [text, setText] = useState('');
  const [parsedOnce, setParsedOnce] = useState(false);
  const [agentList, setAgentList] = useState<AgentList | null>(null);

  const parsed = useMemo((): { ok: true; value: Record<string, unknown> } | { ok: false; message: string } | null => {
    if (text.trim() === '') return null;
    try {
      const v: unknown = JSON.parse(text);
      return isRecord(v) ? { ok: true, value: v } : { ok: false, message: 'The response must be one JSON object.' };
    } catch (e) {
      return { ok: false, message: `Not valid JSON — nothing will be sent. ${e instanceof Error ? e.message : ''}` };
    }
  }, [text]);

  const promptId = parsed?.ok ? parsed.value['prompt_id'] : undefined;
  const matched = typeof promptId === 'string' ? prompts.find((p) => p.id === promptId) : undefined;

  return (
    <Card n="R3" title="Parse a research response">
      <GovernedForm<ParseResponse>
        key={key}
        path={`/api/industries/${industryId}/research-results`}
        provenanceLabel="What this records"
        provenance={
          <p className="m-0 text-[12.5px] text-ink">
            What the agent returned, parsed by you. Nothing enters the pack until the steward accepts
            it. A response with any problem is refused whole — nothing is written.
          </p>
        }
        fields={
          <label className="block">
            <span className={LABEL_CLASS}>The agent's JSON response</span>
            <textarea
              rows={10}
              value={text}
              onChange={(e) => setText(e.target.value)}
              className={INPUT_CLASS + ' font-mono text-[11.5px]'}
              spellCheck={false}
            />
            {parsed && !parsed.ok && <p className="m-0 mt-1 text-[11.5px] text-critical">{parsed.message}</p>}
            {parsed?.ok && (
              <p className={HELP_CLASS}>
                {typeof promptId !== 'string' ? (
                  'No prompt_id in this response — parse will refuse it.'
                ) : matched ? (
                  <>
                    Answers prompt <span className="font-mono">{promptId}</span>, on record
                    {matched.contract_version !== versionNow
                      ? ` — but generated against contract v${matched.contract_version}; parse will refuse it.`
                      : '.'}
                  </>
                ) : (
                  <>
                    prompt_id <span className="font-mono">{promptId}</span> is not a prompt on record for
                    this pack — parse will refuse it.
                  </>
                )}{' '}
                The server decides; this is only what the text says.
              </p>
            )}
          </label>
        }
        canSubmit={parsed?.ok === true}
        buildBody={() => (parsed?.ok ? parsed.value : {})}
        submitLabel="Parse"
        onSuccess={() => {
          const v = parsed?.ok ? parsed.value : {};
          const raw = v['measures_tested_and_excluded_as_unaddressable'];
          const lines = Array.isArray(raw) ? raw.filter((l): l is string => typeof l === 'string' && l.trim() !== '') : [];
          setAgentList({ tool: typeof v['research_tool'] === 'string' ? (v['research_tool'] as string) : '', lines });
          setParsedOnce(true);
          onParsed();
        }}
        renderSuccess={(d) => (
          <>
            {d.count} {d.count === 1 ? 'result' : 'results'} pending review:{' '}
            {d.results.map((r) => r.field_name).join('; ')}.
          </>
        )}
      />
      {parsedOnce && (
        <button
          type="button"
          className={SMALL_BUTTON + ' mt-3'}
          onClick={() => {
            setParsedOnce(false);
            setText('');
            setKey((k) => k + 1);
          }}
        >
          Parse another response
        </button>
      )}

      {agentList && (
        <div className="mt-4 border-t border-rule pt-3">
          <span className={LABEL_CLASS}>The agent's own exclusions — shown, not stored</span>
          {agentList.lines.length === 0 ? (
            <p className="m-0 text-[12px] text-ink-45">The response listed none.</p>
          ) : (
            <>
              <p className="m-0 mb-2 text-[11.5px] text-ink-45">
                Parse stores none of these. Each becomes an exclusion only if the steward records it,
                with their own reason; the agent's line travels as the research's proposal.
              </p>
              <ul className="m-0 list-none p-0">
                {agentList.lines.map((line, i) => (
                  <li key={i} className="flex flex-wrap items-baseline justify-between gap-2 border-b border-rule-soft py-2 last:border-b-0">
                    <span className="text-[12.5px] text-ink">{line}</span>
                    <button
                      type="button"
                      className={SMALL_BUTTON}
                      onClick={() => onRecordExclusion({ name: nameFromLine(line), tool: agentList.tool, proposal: line })}
                    >
                      Record as exclusion…
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </Card>
  );
}

// ------------------------------------------------------------------ pending

function RawMeasure({ raw }: { raw: unknown }) {
  if (!isRecord(raw)) return <p className="m-0 font-mono text-[11px] text-ink-45">{JSON.stringify(raw)}</p>;
  // Every key the agent returned, in its order — what is being judged is the
  // response itself, not a reading of it.
  return (
    <dl className="m-0 mt-2 grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-[11rem_1fr]">
      {Object.entries(raw).map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-[10px] font-semibold uppercase tracking-[.13em] text-ink-45 [overflow-wrap:anywhere]">{k}</dt>
          <dd className="m-0 text-[12.5px] text-ink">
            {isRecord(v)
              ? Object.entries(v).map(([sk, sv]) => (
                  <span key={sk} className="block">
                    <span className="text-ink-45">{sk}: </span>
                    {typeof sv === 'string' ? sv : JSON.stringify(sv)}
                  </span>
                ))
              : typeof v === 'string'
                ? v
                : JSON.stringify(v)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

// Q4c1b — THE RESEARCH'S OWN CAVEATS. The agent writes them inside its
// fields (in Q4e both sat in `citation`: "reviewer should confirm…"); the
// contract has no caveats field yet (Q4g). So: a TEXT SEARCH of every
// string field for caveat phrases, each matching sentence shown verbatim
// with its field. A search can miss — which is why the "read" tick is
// required on EVERY pending result before Accept (Brad, 12 Oct), not only
// where something matched. UI aid only; the server is unchanged.
const CAVEAT_PHRASE =
  /reviewer should|should (?:be )?confirm|confirm (?:in|the|this|before)|secondary (?:summar|source)|per secondary|unverified|not (?:been )?verified|could not (?:verify|confirm|access)|unable to (?:verify|confirm|access)|paywall|gated|estimate/i;

function findCaveats(raw: unknown): { field: string; sentence: string }[] {
  const out: { field: string; sentence: string }[] = [];
  const walk = (v: unknown, path: string) => {
    if (typeof v === 'string') {
      for (const sentence of v.split(/(?<=[.;!?])\s+/)) {
        if (CAVEAT_PHRASE.test(sentence)) out.push({ field: path, sentence: sentence.trim() });
      }
    } else if (isRecord(v)) {
      // v4's own `caveats` field has its own block (StatedCaveats); searching
      // it too would show each caveat twice.
      for (const [k, sub] of Object.entries(v)) if (!(path === '' && k === 'caveats')) walk(sub, path ? `${path}.${k}` : k);
    }
  };
  walk(raw, '');
  return out;
}

// Q4g — the research's STATED caveats: contract v4 makes `caveats` a
// required list on every measure ([] = the research states none). Shown
// first, as the research's own word; the text search below is the backstop.
function StatedCaveats({ raw, version }: { raw: unknown; version: number | null }) {
  const stated = isRecord(raw) && Array.isArray(raw['caveats']) ? (raw['caveats'] as unknown[]) : null;
  return (
    <div className="mt-3 border-l-[3px] border-warning bg-offwhite px-3.5 py-3" data-testid="stated-caveats">
      <span className="block text-[10px] font-semibold uppercase tracking-[.16em] text-warning">
        The research's stated caveats
      </span>
      {stated === null ? (
        <p className="m-0 mt-1 text-[12px] text-ink-45">
          This result predates stated caveats (contract v{version ?? 3}). Read the citation and the search below.
        </p>
      ) : stated.length === 0 ? (
        <p className="m-0 mt-1 text-[12px] text-ink-45">The research stated none.</p>
      ) : (
        <ul className="m-0 mt-1.5 list-disc pl-5">
          {stated.map((c, i) => (
            <li key={i} className="py-0.5 text-[12.5px] text-ink">{typeof c === 'string' ? c : JSON.stringify(c)}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CaveatBlock({ caveats }: { caveats: { field: string; sentence: string }[] }) {
  return (
    <div className="mt-3 border-l-[3px] border-warning bg-offwhite px-3.5 py-3" data-testid="caveats">
      <span className="block text-[10px] font-semibold uppercase tracking-[.16em] text-warning">
        Caveat phrases elsewhere in the response
      </span>
      {caveats.length === 0 ? (
        <p className="m-0 mt-1 text-[12px] text-ink-45">
          No caveat phrases found. This is a text search, not a finding that there are none.
        </p>
      ) : (
        <ul className="m-0 mt-1.5 list-none p-0">
          {caveats.map((c, i) => (
            <li key={i} className="py-1 text-[12.5px] text-ink">
              <span className="mr-1.5 font-mono text-[10.5px] text-ink-45">{c.field}</span>
              {c.sentence}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ReviewForm({
  result,
  stewardReason,
  onDecided,
}: {
  result: PendingResult;
  stewardReason: string | undefined;
  onDecided: (decision: string) => void;
}) {
  const [decision, setDecision] = useState<'accept' | 'reject'>('accept');
  const [note, setNote] = useState('');
  const [caveatsRead, setCaveatsRead] = useState(false);
  const caveats = useMemo(() => findCaveats(result.raw_response), [result.raw_response]);
  return (
    <div className="mt-3">
      <StatedCaveats raw={result.raw_response} version={result.contract_version} />
      <CaveatBlock caveats={caveats} />
      <GovernedForm<{ review_state: string }>
        path={`/api/research-results/${result.id}/${decision}`}
        provenanceLabel="Your review"
        provenance={
          <p className="m-0 text-[12px] text-ink">
            Accepting proposes it into the pack (proposed, never ratified). Rejecting records that this
            response was unsound. Either is final: a decision is not amended.
          </p>
        }
        disabledReason={stewardReason}
        fields={
          <>
            <div className="mb-3 flex gap-4 text-[12.5px] text-ink">
              {(['accept', 'reject'] as const).map((d) => (
                <label key={d} className="flex items-center gap-1.5">
                  <input type="radio" name={`decision-${result.id}`} checked={decision === d} onChange={() => setDecision(d)} />
                  {d === 'accept' ? 'Accept into the pack' : 'Reject'}
                </label>
              ))}
            </div>
            <label className="mb-3 flex items-center gap-2 text-[12.5px] text-ink">
              <input type="checkbox" checked={caveatsRead} onChange={(e) => setCaveatsRead(e.target.checked)} />
              {caveats.length > 0 || (isRecord(result.raw_response) && Array.isArray(result.raw_response['caveats']) && result.raw_response['caveats'].length > 0)
                ? "I have read the research's caveats"
                : 'I have read the citation'}
              <span className="text-[11px] text-ink-45">(required to accept)</span>
            </label>
            <label className="block">
              <span className={LABEL_CLASS}>Review note (required)</span>
              <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} className={INPUT_CLASS} />
              <p className={HELP_CLASS}>Travels with the entry on the pack — a caveat written here is what the account manager reads.</p>
            </label>
          </>
        }
        canSubmit={note.trim() !== '' && (decision === 'reject' || caveatsRead)}
        buildBody={() => ({ review_note: note })}
        submitLabel={decision === 'accept' ? 'Accept' : 'Reject'}
        onSuccess={() => onDecided(`${result.field_name}: ${decision === 'accept' ? 'accepted into the pack' : 'rejected'}`)}
        renderSuccess={(d) => <>Recorded as {d.review_state}.</>}
      />
    </div>
  );
}

function PendingCard({
  pending,
  stewardReason,
  lastDecision,
  onDecided,
}: {
  pending: PendingResult[];
  stewardReason: string | undefined;
  lastDecision: string | null;
  onDecided: (d: string) => void;
}) {
  return (
    <Card n="R4" title="Pending review" badge={<Badge tone="neutral">{pending.length}</Badge>}>
      {lastDecision && <p className="m-0 mb-2 text-[12px] text-healthy">Recorded — {lastDecision}.</p>}
      {pending.length === 0 ? (
        <p className="m-0 text-[12.5px] text-ink-45">Nothing is waiting for review.</p>
      ) : (
        pending.map((r) => (
          <div key={r.id} className="border-b border-rule-soft py-4 last:border-b-0">
            <h4 className="m-0 font-display text-[17px] tracking-[.01em] text-ink">{r.field_name}</h4>
            <p className="m-0 mt-1 text-[11.5px] text-ink-45">
              Parsed by {r.parsed_by}, {when(r.parsed_at)} · research: {r.research_tool} ·{' '}
              {r.prompt_id ? (
                <>
                  prompt <span className="font-mono">{r.prompt_id}</span>, contract v{r.contract_version}
                </>
              ) : (
                'predates prompts'
              )}
            </p>
            <RawMeasure raw={r.raw_response} />
            <ReviewForm result={r} stewardReason={stewardReason} onDecided={onDecided} />
          </div>
        ))
      )}
    </Card>
  );
}

// ------------------------------------------------------------------ exclude

function ExcludeForm({
  industryId,
  prefill,
  stewardReason,
  onExcluded,
}: {
  industryId: string;
  prefill: AgentExclusionPrefill | null;
  stewardReason: string | undefined;
  onExcluded: () => void;
}) {
  const [name, setName] = useState(prefill?.name ?? '');
  // THE REASON STARTS EMPTY, ALWAYS — prefilled or not (Brad, 12 Oct). It is
  // the steward's judgement in the steward's words; the agent's wording is
  // the proposal below, never this.
  const [reason, setReason] = useState('');
  const [tool, setTool] = useState(prefill?.tool ?? '');
  const [proposal, setProposal] = useState(prefill?.proposal ?? '');
  const proposalHalf = (tool.trim() === '') !== (proposal.trim() === '');
  return (
    <GovernedForm<{ exclusion_id: string }>
      path={`/api/industries/${industryId}/exclusions`}
      provenanceLabel="What this records"
      provenance={
        <p className="m-0 text-[12.5px] text-ink">
          A person's judgement that this measure does not belong in this pack, so it is not proposed
          again. Final: there is no route that reverses an exclusion.
        </p>
      }
      disabledReason={stewardReason}
      fields={
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className={LABEL_CLASS}>Measure name</span>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={INPUT_CLASS} />
          </label>
          <label className="block sm:col-span-2">
            <span className={LABEL_CLASS}>Your reason (required)</span>
            <textarea
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className={INPUT_CLASS}
              data-testid="exclusion-reason"
            />
            <p className={HELP_CLASS}>
              Your judgement, in your words. The research's wording, if any, is the proposal below —
              never this.
            </p>
          </label>
          <label className="block">
            <span className={LABEL_CLASS}>Proposed by research tool</span>
            <input type="text" value={tool} onChange={(e) => setTool(e.target.value)} className={INPUT_CLASS} />
          </label>
          <label className="block">
            <span className={LABEL_CLASS}>The research's proposal, verbatim</span>
            <textarea rows={2} value={proposal} onChange={(e) => setProposal(e.target.value)} className={INPUT_CLASS} />
          </label>
          {proposalHalf && (
            <p className="m-0 text-[11.5px] text-critical sm:col-span-2">
              The research's proposal needs both its tool and its text, or neither.
            </p>
          )}
        </div>
      }
      canSubmit={name.trim() !== '' && reason.trim() !== '' && !proposalHalf}
      buildBody={() => ({
        name: name.trim(),
        reason,
        ...(tool.trim() !== '' ? { proposed_by_research_tool: tool, proposal_text: proposal } : {}),
      })}
      submitLabel="Record exclusion"
      onSuccess={onExcluded}
      renderSuccess={() => <>Excluded from this pack.</>}
    />
  );
}

// ------------------------------------------------------------------ section

export function PackResearch({
  industry,
  onPackChanged,
}: {
  industry: { id: string; name: string; slug: string };
  onPackChanged: () => void;
}) {
  const { actor } = useActor();
  const [tick, setTick] = useState(0);
  const [research, setResearch] = useState<FetchIndustryResearchResult | null>(null);
  const [lastDecision, setLastDecision] = useState<string | null>(null);
  const [prefill, setPrefill] = useState<AgentExclusionPrefill | null>(null);
  const [excludeKey, setExcludeKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchIndustryResearch(industry.slug).then((r) => {
      if (!cancelled) setResearch(r);
    });
    return () => {
      cancelled = true;
    };
  }, [industry.slug, tick]);

  const reload = () => {
    setTick((t) => t + 1);
    onPackChanged();
  };

  const stewardReason = actor?.is_steward
    ? undefined
    : `This is the steward's act — ${actor?.steward_name ?? "the tenant's steward"}'s alone (3.0 Band A).`;

  return (
    <section className="mt-10 border-t border-rule pt-6">
      <header className="mb-4">
        <span className="text-[10px] font-semibold uppercase tracking-[.16em] text-ink-45">Research</span>
        <p className="m-0 mt-1 max-w-[85ch] text-[12.5px] leading-relaxed text-ink-45">
          How this pack gets entries: a prompt generated from the pack, run by a person in their research
          tool, parsed here, and judged by the steward. No code here calls a research tool.
        </p>
      </header>

      {!research ? (
        <p className="text-ink-45">loading</p>
      ) : research.status !== 'ok' ? (
        <p className="text-critical">{research.message}</p>
      ) : (
        <>
          <GenerateCard industryId={industry.id} onGenerated={reload} />
          <PromptsCard prompts={research.research.prompts} versionNow={research.research.contract_version_now} />
          <div id="parse-card">
          <ParseCard
            industryId={industry.id}
            prompts={research.research.prompts}
            versionNow={research.research.contract_version_now}
            onParsed={() => {
              setLastDecision(null);
              reload();
            }}
            onRecordExclusion={(p) => {
              setPrefill({ ...p, key: Date.now() });
              setExcludeKey((k) => k + 1);
              document.getElementById('exclude-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}
          />
          </div>
          <div id="pending-card">
          <PendingCard
            pending={research.research.pending}
            stewardReason={stewardReason}
            lastDecision={lastDecision}
            onDecided={(d) => {
              setLastDecision(d);
              reload();
            }}
          />
          </div>
          <div id="exclude-card">
            <Card n="R5" title="Exclude a measure from this pack">
              {prefill && (
                <p className="m-0 mb-3 text-[11.5px] text-ink-45">
                  From the agent's list: the name and the research's proposal are filled in. The reason is
                  yours to write.
                </p>
              )}
              <ExcludeForm
                key={excludeKey}
                industryId={industry.id}
                prefill={prefill}
                stewardReason={stewardReason}
                onExcluded={reload}
              />
              <button
                type="button"
                className={SMALL_BUTTON + ' mt-3'}
                onClick={() => {
                  setPrefill(null);
                  setExcludeKey((k) => k + 1);
                }}
              >
                Clear
              </button>
            </Card>
          </div>
        </>
      )}
    </section>
  );
}
