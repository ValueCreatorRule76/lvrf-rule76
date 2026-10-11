import { useState } from 'react';
import { useActor } from './ActorContext';
import { ChangePasswordDialog } from './ChangePassword';

// Always visible, above the routed content. Attribution is not something a
// visitor discovers in an audit log after the fact — this bar shows, before
// anything is written, the person every write will name.
//
// Sign-in P2a: the actor is the signed-in person. The picker that let any
// listed person be chosen is gone; acting as someone else now means signing
// in as them.
const FOCUS_RING =
  'outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold';

export function ActorBar() {
  const { actor, status, signOut } = useActor();
  const [changing, setChanging] = useState(false);

  if (status === 'loading') {
    return (
      <div className="border-b border-rule bg-white px-[30px] py-2.5">
        <span className="text-[10px] uppercase tracking-[.08em] text-ink-45">checking sign-in</span>
      </div>
    );
  }

  if (!actor) {
    return (
      <div className="border-b border-white/10 bg-ink px-[30px] py-2.5 text-offwhite">
        <span className="text-sm text-offwhite">Not signed in. Every write to this system names a person.</span>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule bg-white px-[30px] py-2.5">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-[10px] font-semibold uppercase tracking-[.16em] text-ink-45">Signed in as</span>
        <span className="font-display text-[15px] tracking-[.03em] text-ink">{actor.full_name}</span>
        <span className="text-xs text-ink-45">{actor.email}</span>
        {actor.is_steward && (
          <span className="border border-gold-ink px-1.5 py-px text-[9px] font-semibold uppercase tracking-[.14em] text-gold-ink">
            Steward
          </span>
        )}
      </div>
      <span className="flex items-center gap-2">
      {status === 'signed_in' && (
        <button
          type="button"
          onClick={() => setChanging(true)}
          className={
            'px-2 py-1 text-[9.5px] font-semibold uppercase tracking-[.1em] text-ink-45 hover:text-ink ' + FOCUS_RING
          }
        >
          Change password
        </button>
      )}
      <button
        type="button"
        onClick={() => void signOut()}
        className={
          'border border-silver px-2 py-1 text-[9.5px] font-semibold uppercase tracking-[.1em] text-ink-45 ' +
          'hover:border-ink hover:text-ink ' +
          FOCUS_RING
        }
      >
        Sign out
      </button>
      </span>
      {changing && <ChangePasswordDialog onClose={() => setChanging(false)} />}
    </div>
  );
}
