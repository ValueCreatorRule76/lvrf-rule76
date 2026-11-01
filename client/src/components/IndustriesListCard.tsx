import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useActor } from '../actor/ActorContext';
import { fetchIndustries, type FetchIndustriesResult } from '../api/packs';
import { Card, Badge } from './workbench/Card';
import { FOCUS_RING, GovernedForm } from './GovernedForm';

// A plain list, not a picker — each row links to /packs/:slug, but nothing
// here filters or searches. Lives on PacksIndexPage now, as that page's
// only card, still n="00" — it used to sit on RunsIndexPage, pushing
// CreateAccountCard and RunsTable down a number each; both have since
// moved or renumbered on their own pages, and this card left with neither
// behind it.
export function IndustriesListCard() {
  const { actor } = useActor();
  const [result, setResult] = useState<FetchIndustriesResult | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!actor) {
      setResult(null);
      return;
    }
    let cancelled = false;
    fetchIndustries().then((r) => {
      if (!cancelled) setResult(r);
    });
    return () => {
      cancelled = true;
    };
  }, [actor, reload]);

  if (!actor) {
    return (
      <Card n="00" title="Industries">
        <p className="m-0 text-[12.5px] text-ink-45">
          Sign in to see this tenant's industries.
        </p>
      </Card>
    );
  }

  if (!result) {
    return (
      <Card n="00" title="Industries">
        <p className="m-0 text-[12.5px] text-ink-45">loading</p>
      </Card>
    );
  }

  if (result.status === 'error') {
    return (
      <Card n="00" title="Industries">
        <p className="m-0 text-[12.5px] text-critical">{result.message}</p>
      </Card>
    );
  }

  const { industries } = result;

  return (
    <Card n="00" title="Industries" badge={<Badge tone="neutral">{industries.length}</Badge>}>
      {industries.length === 0 ? (
        <p className="m-0 text-[12.5px] text-ink-45">No industries recorded for this tenant.</p>
      ) : (
        <ul className="m-0 list-none p-0">
          {industries.map((ind) => (
            <li
              key={ind.id}
              className="flex items-center justify-between gap-3 border-b border-rule-soft py-2 last:border-b-0"
            >
              <Link
                to={`/packs/${ind.slug}`}
                className={'text-[13px] font-semibold text-ink hover:text-gold-ink ' + FOCUS_RING}
              >
                {ind.name}
              </Link>
              <Badge tone={ind.measure_count === 0 ? 'neutral' : 'watch'}>
                {ind.measure_count} {ind.measure_count === 1 ? 'measure' : 'measures'}
              </Badge>
            </li>
          ))}
        </ul>
      )}
      <AddIndustry stewardName={actor.steward_name ?? null} isSteward={Boolean(actor.is_steward)} onAdded={() => setReload((n) => n + 1)} />
    </Card>
  );
}

const LABEL = 'mb-1 block text-[10px] font-semibold uppercase tracking-[.16em] text-ink-45';
const INPUT = 'w-full border border-rule bg-white px-2.5 py-1.5 text-[13px] text-ink ' + FOCUS_RING;

/** B1 (Brad, 1 Nov 2026): the steward adds an industry, a name and a slug, with a reason. */
function AddIndustry({ stewardName, isSteward, onAdded }: { stewardName: string | null; isSteward: boolean; onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ name: '', slug: '', reason: '' });
  const notSteward = isSteward ? undefined : `Adding an industry is the steward's act — ${stewardName ?? "the tenant's steward"}'s alone.`;
  if (!open) {
    return (
      <div className="mt-3">
        <button type="button" disabled={Boolean(notSteward)} title={notSteward} onClick={() => setOpen(true)} data-testid="add-industry-open"
          className={'border border-ink px-3 py-1.5 text-[12px] font-semibold text-ink hover:bg-ink hover:text-offwhite disabled:cursor-not-allowed disabled:opacity-50 ' + FOCUS_RING}>Add an industry…</button>
        {notSteward && <p className="m-0 mt-1 text-[11.5px] text-ink-45" data-testid="add-industry-reason">{notSteward}</p>}
      </div>
    );
  }
  const unmet = [...(v.name.trim().length < 2 ? ['name the industry'] : []),
    ...(!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(v.slug.trim()) ? ['give the slug: lower-case letters and digits, joined by single hyphens'] : []),
    ...(v.reason.trim().length < 12 ? ['say why it is added, in at least 12 characters'] : [])];
  return (
    <div className="mt-3 border-t border-rule-soft pt-3" data-testid="add-industry">
      <GovernedForm<{ industry_id: string }>
        path="/api/industries" provenanceLabel="What this records" disabledReason={notSteward}
        provenance={<p className="m-0 text-[12.5px] text-ink">An industry of this tenant, by you, with your reason. It has no measures until research adds them. It cannot be deleted.</p>}
        fields={<div className="flex flex-col gap-3">
          <label className="block"><span className={LABEL}>Name</span><input className={INPUT} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></label>
          <label className="block"><span className={LABEL}>Slug</span><input className={INPUT} value={v.slug} onChange={(e) => setV({ ...v, slug: e.target.value })} /></label>
          <label className="block"><span className={LABEL}>Why it is added</span><textarea rows={2} className={INPUT} value={v.reason} onChange={(e) => setV({ ...v, reason: e.target.value })} /></label>
        </div>}
        canSubmit={unmet.length === 0} unmet={unmet}
        buildBody={() => ({ name: v.name.trim(), slug: v.slug.trim(), reason: v.reason.trim() })}
        submitLabel="Add the industry"
        onSuccess={() => { setV({ name: '', slug: '', reason: '' }); setOpen(false); onAdded(); }}
        renderSuccess={() => <>Added.</>} />
      <button type="button" onClick={() => setOpen(false)} className="mt-2 text-[11px] text-ink-45 underline">Cancel</button>
    </div>
  );
}
