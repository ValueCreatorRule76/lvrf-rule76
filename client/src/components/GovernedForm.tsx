import { useState, type FormEvent, type ReactNode } from 'react';
import { postGoverned, type PostResult } from '../api/post';
import { useActor } from '../actor/ActorContext';

// Same value as the constant of this name in client/src/actor/ActorBar.tsx —
// matched, not imported from there, since that file owns the actor picker,
// not form chrome. Exported so every field this form renders (and every
// future GovernedForm caller) shares one focus treatment rather than each
// inventing its own.
export const FOCUS_RING =
  'outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold';

/**
 * The primitive every governed write in this client is built on. It owns
 * three things a field-level component should not have to reimplement:
 * that provenance renders first, that a write is impossible with no actor
 * selected, and that the four PostResult states never share a treatment.
 *
 * A GOVERNANCE REFUSAL IS NOT AN ERROR. A 422 (`refused`) carries a message
 * naming an amendment and the reason a write was refused — the system
 * working, not failing. A 409 (`conflict`) is state saying no, not
 * governance, but it is still the system working, so it gets the identical
 * ink treatment. A network failure or 500 (`error`) is the system failing,
 * and is rendered deliberately quieter than a refusal, never louder — a
 * dropped connection must never look as significant as a constitutional
 * refusal. `ok` renders whatever the caller supplies, because a governed
 * write's consequence (a snapshot that will not change, a gate that still
 * won't clear) is often more important than the bare fact it succeeded.
 */
export interface GovernedFormProps<T> {
  path: string;
  /** Rendered first, in its own labeled block, above `fields`. */
  provenance: ReactNode;
  /** Label for the provenance block. Defaults to AddEvidenceCard's original wording. */
  provenanceLabel?: string;
  fields: ReactNode;
  /** Called only once the actor is known and the caller has already confirmed canSubmit. */
  buildBody: () => unknown;
  /** The caller's own field-level readiness (required fields filled, nothing left unset). */
  canSubmit: boolean;
  renderSuccess: (data: T) => ReactNode;
  submitLabel?: string;
}

export function GovernedForm<T>({
  path,
  provenance,
  provenanceLabel = 'Provenance — where this evidence came from',
  fields,
  buildBody,
  canSubmit,
  renderSuccess,
  submitLabel = 'Submit',
}: GovernedFormProps<T>) {
  const { actor } = useActor();
  const [result, setResult] = useState<PostResult<T> | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const disabled = !actor || !canSubmit || submitting || result?.status === 'ok';

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!actor || !canSubmit || submitting) return;
    setSubmitting(true);
    const r = await postGoverned<T>(path, buildBody(), actor.id);
    setSubmitting(false);
    setResult(r);
  }

  return (
    <form onSubmit={handleSubmit}>
      {/*
        The same rule as the line by the button below, stated first: a
        visitor who fills in every field before noticing they cannot submit
        has already been let down once. This occupies the position the
        provenance block otherwise would — the first thing read — and the
        fieldset below disables every field it wraps, not only the button,
        so the form cannot be filled out before the requirement is met.
      */}
      {!actor && (
        <div className="mb-4 border-l-[3px] border-gold bg-offwhite px-3.5 py-3">
          <span className="block text-[10px] font-semibold uppercase tracking-[.16em] text-ink-45">
            Actor required
          </span>
          <p className="m-0 mt-1 text-[12.5px] text-ink">Select who is acting before writing.</p>
        </div>
      )}

      <fieldset disabled={!actor} className="m-0 min-w-0 border-0 p-0">
        <div className="mb-4 border border-rule bg-rule-soft px-3 py-3">
          <span className="mb-2 block text-[10px] font-semibold uppercase tracking-[.16em] text-gold-ink">
            {provenanceLabel}
          </span>
          {provenance}
        </div>

        <div className="mb-4">{fields}</div>
      </fieldset>

      {/*
        Above the button, not below it: on a long form the result is the
        most important thing on the page when it exists and must not
        require scrolling past a button that has already been pressed.
      */}
      {result && <ResultBlock result={result} renderSuccess={renderSuccess} />}

      {!actor && (
        <p className="m-0 mb-2 mt-4 text-[11px] text-ink-45">
          Select who is acting before writing.
        </p>
      )}

      <button
        type="submit"
        disabled={disabled}
        className={
          'border border-silver px-3 py-1.5 text-[9.5px] font-semibold uppercase tracking-[.1em] ' +
          (disabled
            ? 'cursor-not-allowed text-ink-25'
            : 'text-ink-45 hover:border-ink hover:text-ink') +
          ' ' +
          FOCUS_RING
        }
      >
        {submitLabel}
      </button>
    </form>
  );
}

function ResultBlock<T>({
  result,
  renderSuccess,
}: {
  result: PostResult<T>;
  renderSuccess: (data: T) => ReactNode;
}) {
  if (result.status === 'ok') {
    return (
      <div className="mt-4 border border-rule bg-white px-4 py-3">
        <span className="inline-block whitespace-nowrap border border-healthy px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-[.1em] text-healthy">
          Recorded
        </span>
        <div className="mt-2 text-[12.5px] text-ink-70">{renderSuccess(result.data)}</div>
      </div>
    );
  }

  // refused (422) and conflict (409) share this treatment on purpose — both
  // are the system working, not failing, and neither may look like the
  // muted 'error' case below. Only the label differs, never the message:
  // result.message is the server's sentence, unwrapped and unprefixed.
  if (result.status === 'refused' || result.status === 'conflict') {
    return (
      <div className="mt-4 border border-ink bg-ink px-4 py-3 text-offwhite">
        <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[.16em] text-offwhite/70">
          {result.status === 'refused' ? 'Write refused' : 'Write conflict'}
        </span>
        <p className="m-0 text-[12.5px] text-offwhite/[.82]">{result.message}</p>
      </div>
    );
  }

  // error — quieter than a refusal, not louder. The system failed; that is
  // a smaller claim than a named governance rule refusing the write.
  return <p className="mt-4 text-[12.5px] text-ink-45">{result.message}</p>;
}
