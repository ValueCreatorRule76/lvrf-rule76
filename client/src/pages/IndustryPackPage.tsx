import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useActor } from '../actor/ActorContext';
import { fetchIndustryPack, type IndustryMeasure, type IndustryPack } from '../api/packs';
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
          <Badge tone={STATUS_TONE[m.status] ?? 'neutral'}>{m.status}</Badge>
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

function PackBody({ pack }: { pack: IndustryPack }) {
  const claimable = pack.measures.filter((m) => m.addressable);
  const notClaimable = pack.measures.filter((m) => !m.addressable);

  if (pack.measures.length === 0) {
    return (
      <p className="m-0 text-[12.5px] text-ink-45">
        No measures have been proposed for this industry yet.
      </p>
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
