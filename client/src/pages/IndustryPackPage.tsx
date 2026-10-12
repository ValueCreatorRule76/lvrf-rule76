import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useActor } from '../actor/ActorContext';
import {
  fetchIndustryPack,
  type IndustryExclusion,
  type IndustryMeasure,
  type IndustryPack,
  type IndustryRetiredMeasure,
  type CatalogOffering,
} from '../api/packs';
import { Card, Badge } from '../components/workbench/Card';
import { PackResearch } from '../components/PackResearch';
import { PackLevers } from '../components/PackLevers';
import { FOCUS_RING, GovernedForm } from '../components/GovernedForm';

// Lifecycle statuses this table has ever supported (db/schema.ts's
// lifecycleStatus enum) mapped to a tone, even though industry_measures'
// own status default — the only one reachable today — is 'proposed'.
// Deliberately muted, not healthy/critical: 'proposed' is not a pass/fail
// state, it is "not yet judged," and the neutral tone is the one this
// component already uses elsewhere for that (see RunsTable.tsx's
// "Not measured").
const STATUS_TONE: Record<string, 'healthy' | 'watch' | 'critical' | 'neutral'> = {
  proposed: 'neutral',
  draft: 'neutral',
  active: 'healthy',
  ratified: 'healthy',
  superseded: 'watch',
  retired: 'critical',
  archived: 'neutral',
  rejected: 'critical',
};

// Q4c1b — the steward's "Retire this entry…". Closed until asked for; the
// reason box starts empty. Disabled for anyone else, naming the steward:
// the server's 403 (requireSteward) stays the authority.
function RetireEntry({ measure, onRetired }: { measure: IndustryMeasure; onRetired: () => void }) {
  const { actor } = useActor();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const stewardReason = actor?.is_steward
    ? undefined
    : `This is the steward's act — ${actor?.steward_name ?? "the tenant's steward"}'s alone (3.0 Band A).`;
  if (!open) {
    return (
      <div className="mt-3">
        <button
          type="button"
          disabled={Boolean(stewardReason)}
          title={stewardReason}
          onClick={() => setOpen(true)}
          className={
            'border border-silver px-2.5 py-1 text-[9.5px] font-semibold uppercase tracking-[.1em] ' +
            (stewardReason ? 'cursor-not-allowed text-ink-25' : 'text-ink-45 hover:border-ink hover:text-ink') +
            ' ' + FOCUS_RING
          }
        >
          Retire this entry…
        </button>
        {stewardReason && <span className="ml-2 text-[11px] text-ink-45">{stewardReason}</span>}
      </div>
    );
  }
  return (
    <div className="mt-3 border-t border-rule-soft pt-3" data-testid="retire-form">
      <GovernedForm<{ retired_at: string }>
        path={`/api/industry-measures/${measure.id}/retire`}
        provenanceLabel="What this records"
        provenance={
          <p className="m-0 text-[12.5px] text-ink">
            Retires "{measure.name}" from this pack, with your reason. Final: a retired entry is not
            restored — it can return only by a new accepted research result. Its accepted review stays on
            record, and it stays visible under "Retired".
          </p>
        }
        disabledReason={stewardReason}
        fields={
          <label className="block">
            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[.16em] text-ink-45">
              Why it is being retired (required, at least 12 characters)
            </span>
            <textarea
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className={'w-full border border-rule bg-white px-2.5 py-1.5 text-[13px] text-ink ' + FOCUS_RING}
            />
          </label>
        }
        canSubmit={reason.trim().length >= 12}
        buildBody={() => ({ retirement_reason: reason })}
        submitLabel="Retire"
        onSuccess={onRetired}
        renderSuccess={() => <>Retired.</>}
      />
    </div>
  );
}

// THIS IS WHAT AN ACCOUNT MANAGER SEES WHEN THEY OPEN AN ACCOUNT'S
// INDUSTRY — not an admin table. why_it_pays (or, for an unaddressable
// measure, addressable_reasoning) gets the prominent slot because it is
// the sentence read aloud; confounders gets its own labeled, bordered
// block because it is the sentence that stops an overclaim, and burying
// it beside the definition is how an overclaim happens.
function MeasureEntry({ measure, onRetired, offerings }: { measure: IndustryMeasure; onRetired: () => void; offerings: CatalogOffering[] }) {
  const m = measure;
  return (
    <div className="border-b border-rule-soft py-4 last:border-b-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="m-0 font-display text-[17px] tracking-[.01em] text-ink">{m.name}</h4>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[11px] text-ink-45">
            {m.unit} · {m.direction}
          </span>
          {/* STATUS then CLAIMABILITY — same order and same two families
              InstitutionPage.tsx's PackSection uses; that file also adds a
              COVERAGE badge, which has no meaning here: there is no
              institution in this page's frame for "measured" to be true or
              false of. CLAIMABLE is rendered explicitly, not left implied
              by which of the two groups below a measure landed in — same
              "no silent good state" rule as everywhere else this
              vocabulary appears. */}
          <Badge tone={STATUS_TONE[m.status] ?? 'neutral'}>{m.status}</Badge>
          <Badge tone={m.addressable ? 'neutral' : 'watch'}>
            {m.addressable ? 'Claimable' : 'Not addressable'}
          </Badge>
        </div>
      </div>

      <p className="m-0 mt-1.5 text-[12.5px] text-ink-45">{m.definition}</p>

      {m.addressable ? (
        <p className="m-0 mt-3 text-[14px] leading-snug text-ink">{m.why_it_pays}</p>
      ) : (
        <>
          <p className="m-0 mt-3 text-[14px] leading-snug text-ink">{m.addressable_reasoning}</p>
          <p className="m-0 mt-2 text-[12px] leading-snug text-ink-45">
            The temptation: {m.why_it_pays}
          </p>
        </>
      )}

      <div className="mt-3 border-l-2 border-gold pl-3">
        <span className="block text-[9.5px] font-semibold uppercase tracking-[.13em] text-gold-ink">
          What moves this that is NOT capability
        </span>
        <p className="m-0 mt-1 text-[12.5px] text-ink-45">{m.confounders}</p>
      </div>

      <p className="m-0 mt-3 font-mono text-[10.5px] text-ink-45">{m.citation}</p>

      {/* The reviewer's word, beside the research it judged. A caveat raised
          at review (a threshold to confirm, a figure that is trade press) is
          only useful if the reader of the pack sees it — this is the place
          the account manager is when they would otherwise overclaim. */}
      {m.review ? (
        <div className="mt-3 border-l-2 border-silver pl-3">
          <span className="block text-[9.5px] font-semibold uppercase tracking-[.13em] text-ink-45">
            Reviewer's note
          </span>
          {m.review.note && <p className="m-0 mt-1 text-[12.5px] text-ink">{m.review.note}</p>}
          <p className="m-0 mt-1 text-[11px] text-ink-45">
            Accepted by {m.review.reviewed_by ?? 'an unnamed reviewer'} on{' '}
            {m.review.reviewed_at.slice(0, 10)}
            {m.review.research_tool ? ` · research: ${m.review.research_tool}` : ''}
          </p>
        </div>
      ) : (
        <p className="m-0 mt-3 text-[11px] text-ink-45">No review on record for this entry.</p>
      )}

      {/* O1: the entry's value levers and, per lever, its solutions. */}
      <PackLevers measure={m} offerings={offerings} onChanged={onRetired} />
      <RetireEntry measure={m} onRetired={onRetired} />
    </div>
  );
}

function MeasureGroup({
  n,
  title,
  measures,
  emptyText,
  onRetired,
  offerings,
}: {
  n: string;
  title: string;
  measures: IndustryMeasure[];
  emptyText: string;
  onRetired: () => void;
  offerings: CatalogOffering[];
}) {
  return (
    <Card n={n} title={title} badge={<Badge tone="neutral">{measures.length}</Badge>}>
      {measures.length === 0 ? (
        <p className="m-0 text-[12.5px] text-ink-45">{emptyText}</p>
      ) : (
        measures.map((m) => <MeasureEntry key={m.id} measure={m} onRetired={onRetired} offerings={offerings} />)
      )}
    </Card>
  );
}

// NOT the "cannot claim" card above. Those entries are KEPT in the pack
// because the reason not to claim them is worth reading; these were judged
// not to belong in the pack at all. The person's reason leads; the research
// run's own proposal, when there was one, follows in muted text and is
// labeled as the agent's, never blended into the person's reason.
function ExclusionEntry({ exclusion }: { exclusion: IndustryExclusion }) {
  const x = exclusion;
  return (
    <div className="border-b border-rule-soft py-3 last:border-b-0">
      <h4 className="m-0 text-[13.5px] font-semibold text-ink">{x.name}</h4>
      <p className="m-0 mt-1 text-[12.5px] text-ink">{x.reason}</p>
      {x.citation && <p className="m-0 mt-1.5 font-mono text-[10.5px] text-ink-45">{x.citation}</p>}
      {x.proposal_text && (
        <p className="m-0 mt-1.5 text-[11.5px] text-ink-45">
          Proposed by research ({x.proposed_by_research_tool}): {x.proposal_text}
        </p>
      )}
      <p className="m-0 mt-1 text-[11px] text-ink-45">
        Excluded by {x.excluded_by} on {x.excluded_at.slice(0, 10)}
      </p>
    </div>
  );
}

function ExclusionGroup({ n, exclusions }: { n: string; exclusions: IndustryExclusion[] }) {
  return (
    <Card n={n} title="Tested and excluded" badge={<Badge tone="neutral">{exclusions.length}</Badge>}>
      {exclusions.length === 0 ? (
        <p className="m-0 text-[12.5px] text-ink-45">
          Nothing has been recorded as excluded from this pack yet.
        </p>
      ) : (
        exclusions.map((x) => <ExclusionEntry key={x.name} exclusion={x} />)
      )}
    </Card>
  );
}

// Q4c1b — RETIRED ENTRIES ARE SHOWN, NOT HIDDEN. Collapsed by default:
// the pack's current claims come first; what was taken back out, by whom
// and why, is one click away and never gone. The retirement leads; the
// review the entry was first accepted on follows, muted.
function RetiredGroup({ n, retired }: { n: string; retired: IndustryRetiredMeasure[] }) {
  return (
    <Card n={n} title="Retired" badge={<Badge tone="neutral">{retired.length}</Badge>}>
      {retired.length === 0 ? (
        <p className="m-0 text-[12.5px] text-ink-45">Nothing has been retired from this pack.</p>
      ) : (
        <details data-testid="retired-details">
          <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-[.1em] text-ink-45">
            Show {retired.length} retired {retired.length === 1 ? 'entry' : 'entries'}
          </summary>
          {retired.map((r) => (
            <div key={r.name + r.retired_at} className="border-b border-rule-soft py-3 last:border-b-0">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h4 className="m-0 text-[13.5px] font-semibold text-ink">{r.name}</h4>
                <span className="flex items-center gap-1.5">
                  <span className="font-mono text-[11px] text-ink-45">
                    {r.unit} · {r.direction}
                  </span>
                  <Badge tone="critical">Retired</Badge>
                  {r.excluded && <Badge tone="neutral">Since excluded</Badge>}
                </span>
              </div>
              <p className="m-0 mt-1 text-[12.5px] text-ink">{r.retirement_reason ?? 'No reason on record.'}</p>
              <p className="m-0 mt-1 text-[11px] text-ink-45">
                Retired by {r.retired_by ?? 'no one on record'} on {r.retired_at.slice(0, 10)}
                {r.excluded
                  ? ' · since excluded from this pack, so it cannot return'
                  : ' · not excluded: a new accepted research result can bring it back'}
              </p>
              {r.reviewed_at && (
                <p className="m-0 mt-1.5 text-[11px] text-ink-45">
                  First accepted by {r.reviewed_by ?? 'an unnamed reviewer'} on {r.reviewed_at.slice(0, 10)}
                  {r.review_note ? `, with the note: "${r.review_note}"` : ''}
                </p>
              )}
              <p className="m-0 mt-1 font-mono text-[10.5px] text-ink-45">{r.citation}</p>
            </div>
          ))}
        </details>
      )}
    </Card>
  );
}

function PackBody({ pack, onRetired }: { pack: IndustryPack; onRetired: () => void }) {
  const claimable = pack.measures.filter((m) => m.addressable);
  const notClaimable = pack.measures.filter((m) => !m.addressable);

  // Exclusions can exist before any measure is proposed — an industry
  // where research has so far only ruled things out still shows them.
  if (pack.measures.length === 0) {
    return (
      <>
        <p className="m-0 mb-4 text-[12.5px] text-ink-45">
          No measures have been proposed for this industry yet.
        </p>
        {/* 00, not 02: with no measures there are no cards 00 and 01 above it. */}
        {pack.exclusions.length > 0 && <ExclusionGroup n="00" exclusions={pack.exclusions} />}
        {pack.retired.length > 0 && (
          <RetiredGroup n={pack.exclusions.length > 0 ? '01' : '00'} retired={pack.retired} />
        )}
      </>
    );
  }

  return (
    <>
      <MeasureGroup
        n="00"
        title="What you can claim against"
        measures={claimable}
        emptyText="Nothing in this pack has tested addressable yet."
        onRetired={onRetired}
        offerings={pack.offerings}
      />
      <MeasureGroup
        n="01"
        title="What you cannot — and why"
        measures={notClaimable}
        emptyText="Nothing in this pack has tested unaddressable yet."
        onRetired={onRetired}
        offerings={pack.offerings}
      />
      <ExclusionGroup n="02" exclusions={pack.exclusions} />
      <RetiredGroup n="03" retired={pack.retired} />
    </>
  );
}

export function IndustryPackPage() {
  const { slug } = useParams<{ slug: string }>();
  const { actor } = useActor();
  const [result, setResult] = useState<
    Awaited<ReturnType<typeof fetchIndustryPack>> | null
  >(null);

  useEffect(() => {
    if (!slug || !actor) return;
    let cancelled = false;
    setResult(null);
    fetchIndustryPack(slug).then((r) => {
      if (!cancelled) setResult(r);
    });
    return () => {
      cancelled = true;
    };
  }, [slug, actor]);

  // Q4c1: after a research write, the pack is refetched IN PLACE — never
  // back to "loading", which would unmount the Research section and lose
  // what is only on screen (the agent's exclusion list).
  const refreshPack = () => {
    if (!slug) return;
    fetchIndustryPack(slug).then((r) => {
      if (r.status === 'ok') setResult(r);
    });
  };

  if (!actor) {
    return (
      <p className="p-8 text-ink-45">
        Sign in to view this industry's pack — the list is scoped to the signed-in
        person's own tenant, and there is no default to fall back to.
      </p>
    );
  }
  if (!result) return <p className="p-8 text-ink-45">loading</p>;

  if (result.status === 'not_found') {
    return <p className="p-8 text-ink-45">{result.message}</p>;
  }
  if (result.status === 'error') {
    return <p className="p-8 text-critical">{result.message}</p>;
  }

  const { pack } = result;

  return (
    <div className="mx-auto max-w-5xl px-[30px] pb-14 pt-6">
      <header className="mb-[22px]">
        <span className="text-[10px] font-semibold uppercase tracking-[.16em] text-ink-45">
          LVRF · Industry pack
        </span>
        <h1 className="m-0 my-1.5 font-display text-[40px] leading-[.98] tracking-[.012em]">
          {pack.industry.name}
        </h1>
      </header>

      <p className="mb-6 max-w-[85ch] border-b border-rule pb-5 text-[12.5px] leading-relaxed text-ink-45">
        Every measure below is <strong className="text-ink-45">proposed</strong>, not ratified —
        a cited hypothesis about what carries money in this industry, not a proven claim. A
        measure is ratified only when it is sourced from a named institution's own system of
        record at two or more accounts. Nothing in this pack is ratified today.
      </p>

      <PackBody pack={pack} onRetired={refreshPack} />

      <PackResearch industry={pack.industry} onPackChanged={refreshPack} />
    </div>
  );
}
