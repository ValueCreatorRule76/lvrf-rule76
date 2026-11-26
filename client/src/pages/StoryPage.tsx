import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { apiFetch } from '../api/http';
import { postGoverned } from '../api/post';
import { useActor } from '../actor/ActorContext';
import { FOCUS_RING } from '../components/GovernedForm';
import { MARKER_KIND, type MarkerKind } from '../api/pov';
import { PrintClose, PrintCover, PrintRecordLine } from '../components/print/PrintFamily';
import { printFontsReady } from '../components/print/printFonts';
import { KICKER_PRINT } from '../components/print/printText';
import type { IssuedStory, StoryAudience, StoryEngagement, StoryListItem, StoryPayload, StoryRun, StoryStage } from '../api/story';

/**
 * S7b (3.1; LVRF_PLAN §27; Brad's rulings 24-25 Nov 2026) — the story of record.
 *
 *   /accounts/:id/story   the DRAFT, composed now, on screen only (never printed), with the account's issued stories and,
 *                         for the steward, "Issue this story…"
 *   /stories/:id          an ISSUED story, rendered from its sealed row alone; the one page or the full story; Print; and,
 *                         for the steward, "Withdraw…"
 *
 * Everything printed is the seal's: the stage computed, never chosen; each sealed score with its own errata beside it, the
 * same size and weight, in the platform's wording, never recomputed or hidden; every figure with its ledger number; the
 * published rows with what they can and cannot support. "Results" renders only at Realization and above.
 */
const STAGES: StoryStage[] = ['reference', 'decision', 'realization', 'compounding'];
const STAGE_WORD: Record<StoryStage, string> = { reference: 'Reference', decision: 'Decision', realization: 'Realization', compounding: 'Compounding' };
const KICK = 'text-[10px] font-semibold uppercase tracking-[.16em] text-ink-45 print:font-condensed print:text-[7.6pt]';
const H2 = 'm-0 mt-7 font-display text-[22px] font-normal tracking-[.02em] text-ink print:text-[15pt]';
const TH = 'border-b border-ink py-1 pr-3 text-left text-[10px] font-semibold uppercase tracking-[.12em] text-ink-45';
const TD = 'border-b border-rule py-1.5 pr-3 align-top text-[12.5px] [overflow-wrap:anywhere] max-sm:block max-sm:border-b-0 max-sm:py-0.5';
/** At phone width each row stacks, its cells one under another (390: no sideways scroll, nothing cramped). */
const TABLE = 'mt-1 w-full border-collapse max-sm:block max-sm:[&_thead]:hidden max-sm:[&_tbody]:block max-sm:[&_tr]:block max-sm:[&_tr]:border-b max-sm:[&_tr]:border-rule max-sm:[&_tr]:py-1.5';

function stageWhy(stage: StoryStage, s: StoryStage): string {
  const reached = STAGES.indexOf(s) <= STAGES.indexOf(stage) && !(stage === 'reference' && s !== 'reference');
  if (s === 'reference') return stage === 'reference' ? 'its marker: a reference example' : 'not a reference example';
  if (stage === 'reference') return s === 'decision' ? 'never, for a reference example' : s === 'realization' ? 'needs a verified actual in a sealed run' : 'needs a second verified actual, from a separate measurement';
  if (s === 'decision') return reached ? 'a locked run' : '';
  if (s === 'realization') return reached ? 'a verified actual in a sealed run' : 'needs a verified actual in a sealed run';
  return reached ? 'verified actuals in two sealed runs, separate measurements' : 'needs a second verified actual, from a separate measurement';
}

/** "Prepared by …, with LVRF" (S7b.1, D2): v2 names the firm for the tenant, with a comma; v1 reads as it was issued. */
const preparedLine = (p: StoryPayload) => `Prepared by ${p.prepared_by}${p.storyVersion >= 2 ? ',' : ''} with LVRF`;

function StoryBody({ p, form, hash, issuedOn, withdrawn }: { p: StoryPayload; form: 'full' | 'onepage'; hash: string | null; issuedOn: string | null; withdrawn: boolean }) {
  const L = (key: string) => {
    const n = p.refs[key];
    return n === undefined
      ? <sup className="pl-px font-mono text-[9px] text-critical" data-testid="ledger-ref-missing" data-key={key}>?</sup>
      : <sup className="pl-px font-mono text-[9px] text-gold-ink" data-testid="ledger-ref" data-n={n}>{n}</sup>;
  };
  const used = new Set<number>();
  const LU = (key: string) => { const n = p.refs[key]; if (n !== undefined) used.add(n); return L(key); };
  const onePage = form === 'onepage';
  const runLabel = (g: StoryEngagement) => `${g.name}${g.retired ? ' (retired)' : ''}`;
  const withUnit = (v: number | string, unit: string | null) => (unit ? (unit === '%' ? `${v}%` : `${v} ${unit}`) : `${v}`);
  const reachedResult = p.stage === 'realization' || p.stage === 'compounding';

  // The sealed score and, beside it, its own errata: ONE element, one size and one weight (Brad, 24 Nov 2026).
  const scoreline = (r: StoryRun, testid: string, timeline = false) => (
    <p className={'m-0 font-body font-medium leading-[1.35] text-ink ' + (timeline ? 'text-[12.5px]' : 'text-[17px] print:text-[13pt]')} data-testid={testid} data-run={r.id}>
      <span data-testid="sealed-score">{r.score} / 100 as sealed{LU(`run:${r.id}`)}</span>
      {r.errata.map((x) => (
        <span key={x.id}><span className="px-1 text-ink-45" aria-hidden="true">·</span>
          <span className="text-warning" data-testid="score-erratum" data-erratum={x.id}>{x.line}{LU(`erratum:${x.group}`)}</span></span>))}
    </p>
  );

  // A finding prints under the engagement that owns it (v2 seals which one); a v1 story, or a finding whose engagement
  // has no locked real run, prints its findings in their own block, under no engagement (S7b.1, D3).
  const placed = p.findings.filter((f) => f.engagement_id !== undefined && p.engagements.some((g) => g.id === f.engagement_id));
  const unplaced = p.findings.filter((f) => !placed.includes(f));
  const finding = (f: StoryPayload['findings'][number]) => (
    <p key={f.id} className="m-0 mt-1 text-[13px] text-warning" data-testid="finding" data-finding={f.id}>The finding under it: {f.line}{LU(`finding:${f.id}`)}.</p>);

  const headline = p.headline.map((h) => {
    const g = p.engagements.find((e) => e.id === h.engagement_id)!;
    const r = g.runs.find((x) => x.id === h.run_id)!;
    return { g, r };
  });

  return (
    <div data-testid="story-body" data-form={form} data-stage={p.stage}>
      <span className={KICK + ' ' + KICKER_PRINT}>Rule 76 · Learning Value Realization · the story of record</span>
      <h1 className="m-0 my-1.5 font-display text-[34px] leading-[1.02] tracking-[.012em]" data-testid="story-account">{p.account.name}</h1>
      <p className="m-0 font-display text-[20px] tracking-[.02em] text-gold-ink" data-testid="story-title">{p.title}</p>
      {p.subtitle && <p className="m-0 mt-1 text-[13px] italic text-ink-70" data-testid="story-subtitle">{p.subtitle}.</p>}
      <p className="m-0 mt-1 text-[12px] text-ink-45" data-testid="story-meta">
        Stage: {STAGE_WORD[p.stage]} · {p.engagements.reduce((n, g) => n + g.runs.length, 0)} runs read, none a system exercise
        {issuedOn ? ` · issued ${issuedOn} (UTC)` : ' · a draft, not issued'}{withdrawn ? ' · withdrawn' : ''}
      </p>
      <p className="m-0 mt-1 font-condensed text-[11px] font-semibold tracking-[.08em] text-ink-45" data-testid="story-prepared">{preparedLine(p)}</p>

      <h2 className={H2}>Where it stands</h2>
      <div className="mt-2 flex flex-wrap border-t-2 border-ink" data-testid="stage-strip">
        {STAGES.map((s) => {
          const now = s === p.stage;
          const reached = !now && p.stage !== 'reference' && s !== 'reference' && STAGES.indexOf(s) < STAGES.indexOf(p.stage);
          return (
            <div key={s} className={'min-w-[120px] flex-1 border-r border-rule py-1.5 pr-2 font-condensed text-[11px] font-semibold uppercase tracking-[.14em] last:border-r-0 '
              + (now ? 'text-gold-ink' : reached ? 'text-ink-70' : 'text-ink-45')} data-testid={`stage-${s}`} data-now={now ? 'yes' : 'no'}>
              {STAGE_WORD[s]}
              <span className="mt-0.5 block font-body text-[11px] font-normal normal-case tracking-normal text-ink-45">{stageWhy(p.stage, s)}</span>
            </div>);
        })}
      </div>

      <h3 className={KICK + ' mt-4 block'} data-testid="headline-heading">{headline.length > 1 ? 'Each line’s latest sealed run' : 'The latest sealed run'}</h3>
      {headline.map(({ g, r }) => (
        <div key={g.id} className="mt-1" data-testid="headline">
          {scoreline(r, 'headline-score')}
          <p className="m-0 mt-1 text-[12px] text-ink-70">Run {r.run_number} of {runLabel(g)}, {r.band}. The sealed figure is never recomputed or hidden.</p>
        </div>))}
      {headline.length > 1 && <p className="m-0 mt-1 text-[12px] text-ink-45" data-testid="headline-note">No score is averaged or combined across lines.</p>}

      {!onePage && <>
        <h2 className={H2}>{p.stage === 'reference' ? 'What outside-in research found' : 'What they chose'}</h2>
        {p.engagements.map((g) => (
          <div key={g.id} className="mt-2" data-testid="measure" data-engagement={g.id}>
            <h3 className={KICK + ' block'}>{runLabel(g)}</h3>
            <p className="m-0 text-[13px]">{g.metric.name}{g.metric.baseline !== null && <>: baseline {withUnit(g.metric.baseline, g.metric.unit)}{LU(`baseline:${g.id}`)}</>}.</p>
            {g.commitment && p.stage !== 'reference' && (
              <p className="m-0 text-[13px]" data-testid="commitment">Target {withUnit(g.commitment.target, g.metric.unit)}{LU(`target:${g.id}`)}
                {g.commitment.measured_by ? `, measured by ${g.commitment.measured_by}` : ''}
                {g.commitment.committer ? `; committed by ${g.commitment.committer}${g.commitment.committer_customer_side === false ? ', who the record does not find customer-side' : ''}` : ''}.</p>)}
            {placed.filter((f) => f.engagement_id === g.id).map(finding)}
          </div>))}
        {unplaced.length > 0 && (
          <div className="mt-2" data-testid="findings-unplaced">
            <h3 className={KICK + ' block'}>Findings on the record</h3>
            {unplaced.map(finding)}
          </div>)}
      </>}

      {p.published.length > 0 && <>
        <h2 className={H2}>The published story, read against the record</h2>
        <h3 className={KICK + ' block'}>What each published figure can and cannot support</h3>
        <table className={TABLE} data-testid="published">
          <thead><tr><th className={TH}>What it says</th><th className={TH}>Class</th><th className={TH}>It can support</th><th className={TH}>It cannot support</th></tr></thead>
          <tbody>
            {p.published.map((e) => (
              <tr key={e.id} data-testid="published-row" data-evidence={e.id} data-class={e.class}>
                <td className={TD}>“{e.quote ?? e.summary}”{LU(`evidence:${e.id}`)}
                  {e.quote && <span className="mt-0.5 block text-[12px] text-ink-70" data-testid="published-states">It states: {e.summary}</span>}
                  <span className="mt-0.5 block text-[11px] text-ink-45" data-testid="published-basis">Basis: {e.basis.replace(/_/g, ' ')}{e.basis === 'inferred' ? ' (the vendor’s own publication about another company)' : ''}. {e.open_state === 'verified' ? 'Verified: the source was opened and says what it states.' : e.open_state === 'not_supported' ? 'Opened: the source does not support it.' : 'Unverified: the source has not been opened.'}</span></td>
                <td className={TD + ' sm:whitespace-nowrap font-condensed text-[11px] font-semibold uppercase tracking-[.08em] text-ink-70'}>{e.class_label}</td>
                <td className={TD + ' text-healthy'} data-testid="published-can"><span className="font-semibold sm:hidden">It can support: </span>{e.can}</td>
                <td className={TD + ' text-critical'} data-testid="published-cannot"><span className="font-semibold sm:hidden">It cannot support: </span>{e.cannot}</td>
              </tr>))}
          </tbody>
        </table>
      </>}

      {!onePage && <>
        <h2 className={H2}>How it went</h2>
        <h3 className={KICK + ' block'}>The runs, as sealed</h3>
        <table className={TABLE} data-testid="timeline">
          <thead><tr><th className={TH}>Run</th><th className={TH}>Locked</th><th className={TH}>As sealed, and beside it its own errata</th></tr></thead>
          <tbody>
            {p.engagements.flatMap((g) => g.runs.map((r, i) => (
              <tr key={r.id} data-testid="timeline-row">
                <td className={TD}>{i === 0 ? `${runLabel(g)}, ` : ''}run {r.run_number}{r.id === g.latest_run_id ? ' (latest)' : ''}</td>
                <td className={TD + ' sm:whitespace-nowrap'}>{r.locked_on}</td>
                <td className={TD}>{scoreline(r, 'timeline-score', true)}</td>
              </tr>)))}
          </tbody>
        </table>
        <p className="m-0 mt-1 text-[12px] text-ink-45" data-testid="timeline-note">Each line’s latest run is its score; earlier runs print here only.</p>
      </>}

      {reachedResult && (
        <>
          <h2 className={H2} data-testid="results-heading">Results</h2>
          {p.engagements.filter((g) => g.result).map((g) => (
            <p key={g.id} className="m-0 mt-1 text-[13px]" data-testid="result">{g.metric.name}: measured {withUnit(g.result!.actual, g.metric.unit)}{LU(`actual:${g.id}`)}, verified by a named person against their own records.</p>))}
        </>
      )}

      <h2 className={H2}>{p.stage === 'reference' ? 'What a results story would need' : 'The results story waiting to be earned'}</h2>
      {p.engagements.map((g) => g.asks.length > 0 && (
        <div key={g.id} className="mt-1" data-testid="asks">
          <h3 className={KICK + ' block'}>{runLabel(g)}: the asks, from its latest run’s seal</h3>
          <table className={TABLE}>
            <thead><tr><th className={TH}>Ask</th><th className={TH}>The question that converts it</th></tr></thead>
            <tbody>{g.asks.map((a) => <tr key={a.code} data-testid="ask"><td className={TD}>{a.need}</td><td className={TD}>{a.question}</td></tr>)}</tbody>
          </table>
        </div>))}

      <h2 className={H2}>The ledger</h2>
      <h3 className={KICK + ' block'}>Every figure, and where it comes from</h3>
      <table className={TABLE} data-testid="ledger">
        <thead><tr><th className={TH + ' w-[3.2em]'}>#</th><th className={TH}>Figure</th><th className={TH}>Source</th></tr></thead>
        <tbody>
          {p.ledger.filter((l) => !onePage || used.has(l.n)).map((l) => (
            <tr key={l.n} data-testid="ledger-entry" data-n={l.n}>
              <td className={TD + ' w-[3.2em] whitespace-nowrap font-mono text-gold-ink [overflow-wrap:normal]'} data-testid="ledger-n">{l.n}</td>
              <td className={TD}>{l.figure}</td>
              <td className={TD}>{l.source}
                <span className="mt-0.5 block font-mono text-[10.5px] text-ink-45 [overflow-wrap:anywhere]" data-testid="ledger-ids">{l.ids.map((x) => x.slice(0, 8)).join(', ')}{l.full_hash ? ` · run hash ${l.full_hash}` : ''}</span></td>
            </tr>))}
        </tbody>
      </table>
      {hash && <p className="m-0 mt-3 font-mono text-[11px] text-ink-45 [overflow-wrap:anywhere]" data-testid="story-hash">Story record hash {hash}</p>}
    </div>
  );
}

function Banners({ p, withdrawn, draft }: { p: StoryPayload; withdrawn: boolean; draft: boolean }) {
  const name = p.account.name;
  return (
    <div data-testid="banners" className="text-[10.5px] tracking-[.03em]">
      {draft && <div className="border-b border-warning px-4 py-1 font-mono sm:px-6 print:px-1 text-warning" data-testid="banner-draft">DRAFT — on screen only; a story prints once the steward issues it</div>}
      {withdrawn && <div className="border-b border-critical px-4 py-1 font-mono sm:px-6 print:px-1 text-critical" data-testid="banner-withdrawn">WITHDRAWN — this story is on the record as it was issued, and no longer stands</div>}
      {p.marker && MARKER_KIND[p.marker.kind as MarkerKind] && <div className="border-b border-rule px-4 py-1 font-mono sm:px-6 print:px-1 text-ink-70" data-testid="banner-reference">{MARKER_KIND[p.marker.kind as MarkerKind].banner}</div>}
      {p.banners.outside_in && <div className="border-b border-rule px-4 py-1 font-mono sm:px-6 print:px-1 text-ink-70" data-testid="banner-outside-in">OUTSIDE-IN HYPOTHESIS — {p.marker ? 'built from published sources only; ' : ''}no figure rests on {name}’s own records or on a named person at {name}</div>}
      {p.banners.unverified && <div className="border-b border-warning px-4 py-1 font-mono sm:px-6 print:px-1 text-warning" data-testid="banner-unverified">UNVERIFIED — this story has no verified actual</div>}
    </div>
  );
}

const Frame = ({ children }: { children: ReactNode }) => (
  <div className="mx-auto max-w-4xl px-4 pb-14 pt-6 font-body text-ink sm:px-[30px] print:max-w-none print:px-0 print:pt-3">{children}</div>
);

/** /accounts/:id/story — the draft, the issued stories, and "Issue this story…" for the steward. */
export function StoryDraftPage() {
  const { id = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const audience: StoryAudience = params.get('audience') === 'client' ? 'client' : 'internal';
  const { actor } = useActor();
  const [draft, setDraft] = useState<StoryPayload | string | null>(null);
  const [stories, setStories] = useState<StoryListItem[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [issued, setIssued] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await apiFetch(`/api/institutions/${id}/story-draft?audience=${audience}`);
    const b = await r.json().catch(() => ({}));
    setDraft(r.ok ? (b.payload as StoryPayload) : (b.message ?? 'The draft could not be composed.'));
    const l = await apiFetch(`/api/institutions/${id}/stories`);
    if (l.ok) setStories(((await l.json()).stories ?? []) as StoryListItem[]);
  }, [id, audience]);
  useEffect(() => { void load(); }, [load]);

  async function issue() {
    const r = await postGoverned<{ id: string }>(`/api/institutions/${id}/stories`, { audience });
    if (r.status !== 'ok') { setNote('message' in r ? r.message : 'The story was not issued.'); return; }
    setConfirming(false); setNote(null); setIssued(r.data.id); void load();
  }

  const stewardOnly = actor?.is_steward ? undefined : `Issuing a story of record is the steward's act — ${actor?.steward_name ?? 'the steward'}'s alone.`;
  if (draft === null) return <Frame><p className="text-[13px] text-ink-45">Composing the draft…</p></Frame>;
  return (
    <div className="min-h-screen bg-offwhite" data-testid="story-draft-page">
      {typeof draft !== 'string' && <Banners p={draft} withdrawn={false} draft />}
      <Frame>
        <div className="mb-4 flex flex-wrap items-center gap-2" data-testid="story-controls">
          <span className="text-[10px] font-semibold uppercase tracking-[.16em] text-ink-45">For</span>
          {(['internal', 'client'] as const).map((a) => (
            <button key={a} type="button" onClick={() => setParams(a === 'client' ? { audience: 'client' } : {})} aria-pressed={audience === a}
              className={'border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[.1em] ' + (audience === a ? 'border-ink bg-ink text-offwhite' : 'border-silver text-ink-45 hover:border-ink hover:text-ink') + ' ' + FOCUS_RING}
              data-testid={`audience-${a}`}>{a === 'internal' ? 'Your company' : 'The client'}</button>))}
          <Link to={`/accounts/${id}`} className={'ml-auto text-[11.5px] text-gold-ink underline ' + FOCUS_RING}>Back to the account</Link>
        </div>

        {stories.length > 0 && (
          <section className="mb-5 border border-rule bg-paper p-3" data-testid="issued-stories">
            <h2 className="m-0 text-[13px] font-semibold">Issued stories</h2>
            <ul className="m-0 mt-1 list-none p-0">
              {stories.map((s) => (
                <li key={s.id} className="py-0.5 text-[12.5px]" data-testid="issued-story">
                  <Link to={`/stories/${s.id}`} className={'text-gold-ink underline ' + FOCUS_RING}>{STAGE_WORD[s.stage]}, for {s.audience === 'internal' ? 'your company' : 'the client'}</Link>
                  {' '}· issued {s.issued_at.slice(0, 10)} by {s.issued_by}{s.withdrawn_at ? ` · withdrawn ${s.withdrawn_at.slice(0, 10)}` : ''}
                </li>))}
            </ul>
          </section>)}

        {typeof draft === 'string'
          ? <p className="text-[13px] text-ink-70" data-testid="draft-refused">{draft}</p>
          : <>
              <div className="mb-4 border border-rule bg-paper p-3" data-testid="issue-panel">
                {issued && <p className="m-0 mb-2 text-[12.5px] text-healthy" data-testid="issued-note">Issued. <Link to={`/stories/${issued}`} className={'underline ' + FOCUS_RING}>Open the issued story</Link> to print it.</p>}
                {!confirming
                  ? <button type="button" onClick={() => setConfirming(true)} disabled={Boolean(stewardOnly)} title={stewardOnly}
                      className={'border border-ink px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[.1em] text-ink hover:bg-ink hover:text-offwhite disabled:border-silver disabled:text-ink-45 disabled:hover:bg-transparent ' + FOCUS_RING}
                      data-testid="issue-open">Issue this story…</button>
                  : <div data-testid="issue-confirm">
                      <p className="m-0 text-[10px] font-semibold uppercase tracking-[.16em] text-ink-45">Confirm what this records</p>
                      <p className="m-0 mt-1 text-[13px]">Issue {draft.account.name}’s {draft.title.toLowerCase()}, for {audience === 'internal' ? 'your company’s people' : 'the client'}, as it reads below: stage {STAGE_WORD[draft.stage]}, {draft.engagements.reduce((n, g) => n + g.runs.length, 0)} sealed runs, {draft.published.length} published rows, {draft.ledger.length} ledger entries. It is sealed when issued: it is never edited, and is withdrawn, never deleted. Only an issued story prints.</p>
                      <div className="mt-2 flex gap-2">
                        <button type="button" onClick={issue} className={'border border-ink bg-ink px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[.1em] text-offwhite ' + FOCUS_RING} data-testid="issue-yes">Yes, issue it</button>
                        <button type="button" onClick={() => setConfirming(false)} className={'border border-ink px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[.1em] text-ink ' + FOCUS_RING}>Back</button>
                      </div>
                    </div>}
                {note && <p className="m-0 mt-2 text-[12.5px] text-critical" data-testid="issue-note">{note}</p>}
              </div>
              <StoryBody p={draft} form="full" hash={null} issuedOn={null} withdrawn={false} />
            </>}
      </Frame>
    </div>
  );
}

/** /stories/:id — an issued story, from its sealed row alone. */
export function IssuedStoryPage() {
  const { id = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const form: 'full' | 'onepage' = params.get('form') === 'onepage' ? 'onepage' : 'full';
  const { actor } = useActor();
  const [s, setS] = useState<IssuedStory | string | null>(null);
  const [withdrawing, setWithdrawing] = useState(false);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await apiFetch(`/api/stories/${id}`);
    const b = await r.json().catch(() => ({}));
    setS(r.ok ? (b as IssuedStory) : (b.message ?? 'The story could not be read.'));
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  async function withdraw() {
    const r = await postGoverned<{ id: string }>(`/api/stories/${id}/withdraw`, { reason });
    if (r.status !== 'ok') { setNote('message' in r ? r.message : 'The story was not withdrawn.'); return; }
    setWithdrawing(false); setNote(null); void load();
  }
  async function print() { await printFontsReady(); window.print(); }

  if (s === null) return <Frame><p className="text-[13px] text-ink-45">Reading the story…</p></Frame>;
  if (typeof s === 'string') return <Frame><p className="text-[13px] text-ink-70" data-testid="story-missing">{s}</p></Frame>;
  const p = s.payload;
  const issuedOn = s.issued_at.slice(0, 10);
  const printedOn = new Date().toISOString().slice(0, 10);
  const recordLine = `${preparedLine(p)} · ${p.account.name} · story, ${form === 'onepage' ? 'one page' : 'full'} · composer version ${p.storyVersion} · story record hash ${s.payload_hash} · printed ${printedOn} (UTC)`;
  const banners = <Banners p={p} withdrawn={Boolean(s.withdrawn)} draft={false} />;
  const stewardOnly = actor?.is_steward ? undefined : `Withdrawing a story of record is the steward's act — ${actor?.steward_name ?? 'the steward'}'s alone.`;
  const btn = 'border border-ink px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[.1em] text-ink hover:bg-ink hover:text-offwhite ' + FOCUS_RING;
  return (
    <div className="min-h-screen bg-offwhite print:min-h-0 print:bg-transparent" data-testid="issued-story-page" data-form={form}>
      <div className="print:hidden">{banners}</div>
      <PrintRecordLine lines={[recordLine]} />
      {form === 'full' && <PrintCover banners={banners} kicker="Rule 76 · Learning Value Realization" title={p.account.name} doc={p.title}
        meta={`Stage: ${STAGE_WORD[p.stage]} · issued ${issuedOn} (UTC) by ${s.issued_by} · for ${p.audience === 'internal' ? `${p.tenant ?? p.prepared_by}’s people` : 'the client'}`}
        lede={p.subtitle ? `${p.subtitle}.` : undefined} />}
      <table className="block w-full border-collapse print:table print:table-fixed">
        <thead className="hidden print:table-header-group" data-testid="print-header"><tr className="print:table-row"><td className="p-0 print:table-cell">{banners}</td></tr></thead>
        <tbody className="block print:table-row-group"><tr className="block print:table-row"><td className="block p-0 print:table-cell">
          <Frame>
            <div className="mb-4 flex flex-wrap items-center gap-2 print:hidden" data-testid="story-controls">
              {(['onepage', 'full'] as const).map((f) => (
                <button key={f} type="button" onClick={() => setParams(f === 'onepage' ? { form: 'onepage' } : {})} aria-pressed={form === f}
                  className={'border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[.1em] ' + (form === f ? 'border-ink bg-ink text-offwhite' : 'border-silver text-ink-45 hover:border-ink hover:text-ink') + ' ' + FOCUS_RING}
                  data-testid={`form-${f}`}>{f === 'onepage' ? 'One page' : 'Full story'}</button>))}
              <button type="button" onClick={print} className={'ml-auto ' + btn} data-testid="print-story">Print</button>
              <Link to={`/accounts/${p.account.id}/story`} className={'text-[11.5px] text-gold-ink underline ' + FOCUS_RING}>The account’s stories</Link>
            </div>
            {s.newer_evidence && <p className="mb-3 text-[12.5px] text-warning print:hidden" data-testid="newer-evidence">{s.newer_evidence.note}</p>}
            {s.withdrawn && <p className="mb-3 text-[12.5px] text-critical" data-testid="withdrawn-note">Withdrawn {s.withdrawn.at.slice(0, 10)} by {s.withdrawn.by}: {s.withdrawn.reason}</p>}
            {!s.withdrawn && (
              <div className="mb-4 print:hidden" data-testid="withdraw-panel">
                {!withdrawing
                  ? <button type="button" onClick={() => setWithdrawing(true)} disabled={Boolean(stewardOnly)} title={stewardOnly}
                      className={btn + ' disabled:border-silver disabled:text-ink-45 disabled:hover:bg-transparent'} data-testid="withdraw-open">Withdraw…</button>
                  : <div className="border border-rule bg-paper p-3" data-testid="withdraw-form">
                      <label className="block"><span className="mb-1 block text-[10px] font-semibold uppercase tracking-[.16em] text-ink-45">Why it is withdrawn</span>
                        <textarea value={reason} onChange={(e) => setReason(e.target.value)} className={'w-full border border-rule bg-paper p-2 text-[13px] ' + FOCUS_RING} data-testid="withdraw-reason" /></label>
                      <p className="m-0 mt-2 text-[10px] font-semibold uppercase tracking-[.16em] text-ink-45">Confirm what this records</p>
                      <p className="m-0 mt-1 text-[13px]" data-testid="withdraw-confirm">Withdraw {p.account.name}’s {p.title.toLowerCase()}, issued {issuedOn}, with the reason above. It stays on the record as it was issued, marked withdrawn; nothing in it changes.</p>
                      <div className="mt-2 flex gap-2">
                        <button type="button" onClick={withdraw} disabled={reason.trim().length < 12} className={'border border-ink bg-ink px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[.1em] text-offwhite disabled:border-silver disabled:bg-silver ' + FOCUS_RING} data-testid="withdraw-yes">Yes, withdraw it</button>
                        <button type="button" onClick={() => setWithdrawing(false)} className={'border border-ink px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[.1em] text-ink ' + FOCUS_RING}>Back</button>
                      </div>
                      {reason.trim().length < 12 && <p className="m-0 mt-1 text-[11.5px] text-ink-45">Say why, in at least 12 characters.</p>}
                    </div>}
                {note && <p className="m-0 mt-2 text-[12.5px] text-critical" data-testid="withdraw-note">{note}</p>}
              </div>)}
            <StoryBody p={p} form={form} hash={s.payload_hash} issuedOn={issuedOn} withdrawn={Boolean(s.withdrawn)} />
            <PrintClose heading="About this story" text={`This story renders from its sealed record, hash ${s.payload_hash}, issued ${issuedOn} (UTC). Every figure carries its ledger entry and its basis; none is applied beyond it. ${p.banners.unverified ? 'It holds no verified actual.' : ''} ${preparedLine(p)}.`} />
          </Frame>
        </td></tr></tbody>
      </table>
    </div>
  );
}
