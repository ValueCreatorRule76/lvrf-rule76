import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useActor } from '../actor/ActorContext';
import { fetchIndustryPack, type IndustryExclusion, type IndustryMeasure, type IndustryPack } from '../api/packs';
import { Card, Badge } from '../components/workbench/Card';

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

// THIS IS WHAT AN ACCOUNT MANAGER SEES WHEN THEY OPEN AN ACCOUNT'S
// INDUSTRY — not an admin table. why_it_pays (or, for an unaddressable
// measure, addressable_reasoning) gets the prominent slot because it is
// the sentence read aloud; confounders gets its own labeled, bordered
// block because it is the sentence that stops an overclaim, and burying
// it beside the definition is how an overclaim happens.
function MeasureEntry({ measure }: { measure: IndustryMeasure }) {
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
    </div>
  );
}

function MeasureGroup({
  n,
  title,
  measures,
  emptyText,
}: {
  n: string;
  title: string;
  measures: IndustryMeasure[];
  emptyText: string;
}) {
  return (
    <Card n={n} title={title} badge={<Badge tone="neutral">{measures.length}</Badge>}>
      {measures.length === 0 ? (
        <p className="m-0 text-[12.5px] text-ink-45">{emptyText}</p>
      ) : (
        measures.map((m) => <MeasureEntry key={m.name} measure={m} />)
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

function PackBody({ pack }: { pack: IndustryPack }) {
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
      />
      <MeasureGroup
        n="01"
        title="What you cannot — and why"
        measures={notClaimable}
        emptyText="Nothing in this pack has tested unaddressable yet."
      />
      <ExclusionGroup n="02" exclusions={pack.exclusions} />
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
    fetchIndustryPack(slug, actor.id).then((r) => {
      if (!cancelled) setResult(r);
    });
    return () => {
      cancelled = true;
    };
  }, [slug, actor]);

  if (!actor) {
    return (
      <p className="p-8 text-ink-45">
        Select an actor above to view this industry's pack — the list is scoped to the
        actor's own tenant, and there is no default to fall back to.
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

      <PackBody pack={pack} />
    </div>
  );
}
