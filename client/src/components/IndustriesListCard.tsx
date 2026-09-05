import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useActor } from '../actor/ActorContext';
import { fetchIndustries, type FetchIndustriesResult } from '../api/packs';
import { Card, Badge } from './workbench/Card';
import { FOCUS_RING } from './GovernedForm';

// A plain list, not a picker — nothing links to a pack today, so this only
// needs to exist, not to filter or search. Renumbered ("00", pushing
// CreateAccountCard to "01" and RunsTable to "02") rather than inserted
// before "00", since a card numbered lower than "00" has no precedent
// anywhere in this codebase and would read as a typo, not a position.
export function IndustriesListCard() {
  const { actor } = useActor();
  const [result, setResult] = useState<FetchIndustriesResult | null>(null);

  useEffect(() => {
    if (!actor) {
      setResult(null);
      return;
    }
    let cancelled = false;
    fetchIndustries(actor.id).then((r) => {
      if (!cancelled) setResult(r);
    });
    return () => {
      cancelled = true;
    };
  }, [actor]);

  if (!actor) {
    return (
      <Card n="00" title="Industries">
        <p className="m-0 text-[12.5px] text-ink-45">
          Select an actor above to see this tenant's industries.
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
    </Card>
  );
}
