import { useEffect, useState } from 'react';
import { fetchPersons, type FetchPersonsResult } from '../api/persons';
import { useActor } from './ActorContext';

// Always visible, above the routed content. Attribution is not something a
// visitor discovers in an audit log after the fact — this bar makes sure
// they see, before anything is written, that the write will name someone.
const FOCUS_RING =
  'outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold';

export function ActorBar() {
  const { actor, setActor, clearActor } = useActor();
  const [result, setResult] = useState<FetchPersonsResult | null>(null);

  useEffect(() => {
    if (actor) return;
    let cancelled = false;
    setResult(null);
    fetchPersons().then((r) => {
      if (!cancelled) setResult(r);
    });
    return () => {
      cancelled = true;
    };
  }, [actor]);

  if (actor) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule bg-white px-[30px] py-2.5">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="text-[10px] font-semibold uppercase tracking-[.16em] text-ink-45">
            Acting as
          </span>
          <span className="font-display text-[15px] tracking-[.03em] text-ink">
            {actor.full_name}
          </span>
          <span className="text-xs text-ink-45">
            {actor.institution_name ?? 'no institution'}
          </span>
        </div>
        <button
          type="button"
          onClick={clearActor}
          className={
            'border border-silver px-2 py-1 text-[9.5px] font-semibold uppercase tracking-[.1em] text-ink-45 ' +
            'hover:border-ink hover:text-ink ' +
            FOCUS_RING
          }
        >
          Change
        </button>
      </div>
    );
  }

  return (
    <div className="border-b border-white/10 bg-ink px-[30px] py-3.5 text-offwhite">
      <p className="m-0 mb-3 text-sm text-offwhite">
        No actor selected. Every write to this system names a person.
      </p>

      {!result && (
        <p className="m-0 text-[10px] uppercase tracking-[.08em] text-offwhite/40">
          loading persons
        </p>
      )}

      {result?.status === 'error' && (
        <p className="m-0 text-sm text-offwhite">Could not load people: {result.message}</p>
      )}

      {result?.status === 'ok' && result.persons.length === 0 && (
        <p className="m-0 text-sm text-offwhite">No eligible people found.</p>
      )}

      {result?.status === 'ok' && result.persons.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {result.persons.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() =>
                setActor({ id: p.id, full_name: p.full_name, institution_name: p.institution_name })
              }
              className={
                'border border-offwhite/30 px-3 py-2 text-left hover:border-gold hover:bg-white/[.04] ' +
                FOCUS_RING
              }
            >
              <span className="block text-sm font-semibold text-offwhite">{p.full_name}</span>
              <span className="block text-[10px] uppercase tracking-[.08em] text-offwhite/40">
                {p.institution_name ?? 'no institution'}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
