import { useRef, useState, type ReactNode } from 'react';
import { postGoverned, type PostResult } from '../api/post';
import { useActor } from '../actor/ActorContext';
import { ResultBlock, FOCUS_RING } from './GovernedForm';

export interface GovernedActionProps<T> {
  /** UX-1 standard 1: the open step's next action is the one filled button (see GovernedForm). */
  primary?: boolean;
  label: string;
  path: string;
  /** Shown when no actor is set — same rule GovernedForm enforces on every field: never a silently dead button. */
  actorRequiredNote: string;
  /** A local precondition the caller already knows has failed. Set, the button is disabled with this as its title and no request is ever attempted — a round trip to hear a refusal the caller could already see coming. */
  disabledReason?: string;
  renderSuccess: (data: T) => ReactNode;
  /** Defaults to {} — a governed action with no input to collect usually posts an empty body. */
  body?: unknown;
  /** Called once with the response data after a write is recorded — for a caller that must refetch. */
  onSuccess?: (data: T) => void;
}

/**
 * GovernedForm's counterpart for a write with nothing to collect: everything
 * the request needs is already in the caller's own context (a run, an
 * outcome, whatever it's acting on). Same actor gate, same four PostResult
 * treatments via the shared ResultBlock — nothing here reimplements them.
 */
export function GovernedAction<T>({
  label,
  path,
  actorRequiredNote,
  disabledReason,
  renderSuccess,
  body = {},
  onSuccess,
  primary = false,
}: GovernedActionProps<T>) {
  const { actor } = useActor();
  const [result, setResult] = useState<PostResult<T> | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // C2c: one request per click — set synchronously, as GovernedForm's.
  const inFlight = useRef(false);

  const blockedLocally = Boolean(disabledReason);
  const disabled = blockedLocally || !actor || submitting || result?.status === 'ok';

  async function handleClick() {
    if (inFlight.current || blockedLocally || !actor || submitting) return;
    inFlight.current = true;
    setSubmitting(true);
    const r = await postGoverned<T>(path, body);
    setSubmitting(false);
    setResult(r);
    if (r.status === 'ok') onSuccess?.(r.data);
    else inFlight.current = false;
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled}
        title={blockedLocally ? disabledReason : undefined}
        data-primary={primary && !disabled ? 'true' : undefined}
        className={
          (primary && !disabled
            ? "border border-ink bg-ink px-4 py-2 text-[12px] font-semibold tracking-[.04em] text-offwhite hover:bg-ink-70 after:ml-2 after:text-gold after:content-['→'] "
            : 'border border-silver px-[15px] py-[7px] text-xs font-semibold tracking-[.04em] ' +
              (disabled
                ? 'cursor-not-allowed text-ink-25'
                : 'text-ink hover:bg-ink hover:text-offwhite')) +
          ' ' +
          FOCUS_RING
        }
      >
        {label}
      </button>

      {/* UX-1 standard 1: a disabled action carries its reason directly under it, never only as a tooltip. */}
      {blockedLocally && <p className="m-0 mt-1.5 max-w-xs text-[11px] text-ink-45" data-testid="action-reason">{disabledReason}</p>}

      {!blockedLocally && !actor && (
        <p className="m-0 mt-1.5 max-w-xs text-[11px] text-ink-45">{actorRequiredNote}</p>
      )}

      {/*
        Below the button, not above it — the opposite of GovernedForm's rule.
        GovernedForm puts the result above its submit button because a long
        form can scroll a refusal off-screen before a visitor scrolls down to
        it. This component lives in the Topbar, at the very top of the page:
        there is nothing above it to scroll past, so the off-screen case
        GovernedForm guards against does not exist here.
      */}
      {result && <ResultBlock result={result} renderSuccess={renderSuccess} />}
    </div>
  );
}
