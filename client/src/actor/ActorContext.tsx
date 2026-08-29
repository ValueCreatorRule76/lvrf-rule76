import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

/**
 * The selected actor lives in React state ONLY — no localStorage, no
 * sessionStorage, no cookie, no module-level variable. It clears on every
 * refresh, and that is deliberate: a persisted actor becomes a default, and
 * a default becomes an assumption nobody actually stated. Re-selecting
 * costs one click; that cost is what keeps naming an actor a deliberate act
 * instead of something a page loads in for you.
 *
 * (Browser storage APIs do not work in this environment regardless — but
 * the choice above would hold even where they did.)
 */

export interface Actor {
  id: string;
  full_name: string;
  institution_name: string | null;
}

interface ActorContextValue {
  actor: Actor | null;
  setActor: (actor: Actor) => void;
  clearActor: () => void;
}

const ActorContext = createContext<ActorContextValue | null>(null);

export function ActorProvider({ children }: { children: ReactNode }) {
  const [actor, setActorState] = useState<Actor | null>(null);

  const value = useMemo<ActorContextValue>(
    () => ({
      actor,
      setActor: (next: Actor) => setActorState(next),
      clearActor: () => setActorState(null),
    }),
    [actor],
  );

  return <ActorContext.Provider value={value}>{children}</ActorContext.Provider>;
}

export function useActor(): ActorContextValue {
  const ctx = useContext(ActorContext);
  if (!ctx) {
    throw new Error('useActor must be used within an ActorProvider');
  }
  return ctx;
}
