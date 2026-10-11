import { useState, type FormEvent } from 'react';
import { useActor } from './ActorContext';

const FOCUS_RING =
  'outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold';
const LABEL_CLASS = 'mb-1 block text-[10px] font-semibold uppercase tracking-[.16em] text-ink-45';
const INPUT_CLASS = 'w-full border border-rule bg-white px-2.5 py-1.5 text-[13px] text-ink ' + FOCUS_RING;
const HELP_CLASS = 'm-0 mt-1 text-[11px] text-ink-45';

/**
 * Band A item 1. The signed-in person replaces their own password. The
 * server checks the current one, refuses fewer than 12 characters or the
 * same password, and ends every OTHER session of theirs — this one stays.
 * The error shown is the server's own sentence. Passwords are cleared from
 * state after every attempt.
 */
function ChangePasswordForm({ intro, onDone }: { intro: string; onDone?: () => void }) {
  const { changePassword } = useActor();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const mismatch = again !== '' && next !== again;
  const canSubmit = !submitting && current !== '' && next.length >= 12 && next === again;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    const r = await changePassword(current, next);
    setSubmitting(false);
    setCurrent('');
    setNext('');
    setAgain('');
    if (!r.ok) {
      setError(r.message);
      return;
    }
    setDone(true);
    onDone?.();
  };

  if (done) {
    return <p className="m-0 text-[12.5px] text-ink">Password changed. Your other sessions were signed out.</p>;
  }

  return (
    <form onSubmit={onSubmit} className="w-full max-w-[360px]" noValidate>
      <p className="m-0 mb-4 text-[12.5px] text-ink-45">{intro}</p>
      <label className="mb-3 block">
        <span className={LABEL_CLASS}>Current password</span>
        <input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} className={INPUT_CLASS} />
      </label>
      <label className="mb-3 block">
        <span className={LABEL_CLASS}>New password</span>
        <input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} className={INPUT_CLASS} />
        <p className={HELP_CLASS}>At least 12 characters.</p>
      </label>
      <label className="mb-4 block">
        <span className={LABEL_CLASS}>New password, again</span>
        <input type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} className={INPUT_CLASS} />
        {mismatch && <p className="m-0 mt-1 text-[11px] text-critical">The two entries do not match.</p>}
      </label>
      {error && (
        <p role="alert" className="m-0 mb-3 text-[12.5px] text-critical">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={!canSubmit}
        className={
          'border border-ink bg-ink px-4 py-2 text-[10px] font-semibold uppercase tracking-[.12em] text-offwhite ' +
          'disabled:cursor-not-allowed disabled:border-silver disabled:bg-white disabled:text-ink-45 ' +
          FOCUS_RING
        }
      >
        {submitting ? 'Changing' : 'Change password'}
      </button>
    </form>
  );
}

/**
 * In place of the app while the signed-in person holds a starting password
 * (must_change). Nothing else is reachable until it is replaced — the
 * server refuses every other route with 403 password_change_required.
 */
export function ChangePasswordPage({ forced }: { forced?: boolean }) {
  const { signOut } = useActor();
  return (
    <main className="mx-auto max-w-[1100px] px-[30px] py-12">
      <span className="block text-[10px] font-semibold uppercase tracking-[.16em] text-ink-45">LVRF</span>
      <h1 className="m-0 mb-6 font-display text-[40px] leading-none tracking-[.012em] text-ink">Choose a new password</h1>
      <ChangePasswordForm
        intro={
          forced
            ? 'The password you were given is a starting password. Choose your own before continuing; the starting one stops working.'
            : 'Choose a new password.'
        }
      />
      <button type="button" onClick={() => void signOut()} className={'mt-6 text-[11px] text-ink-45 hover:text-ink ' + FOCUS_RING}>
        Sign out instead
      </button>
    </main>
  );
}

/** Opened from the bar, any time. */
export function ChangePasswordDialog({ onClose }: { onClose: () => void }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="lvrf-change-password"
      className="fixed inset-0 z-50 flex items-start justify-center bg-ink/60 px-4 pt-[12vh]"
    >
      <div className="w-full max-w-[420px] border border-rule bg-white p-6">
        <h2 id="lvrf-change-password" className="m-0 mb-2 font-display text-[24px] leading-none tracking-[.012em] text-ink">
          Change password
        </h2>
        <ChangePasswordForm intro="Your other sessions will be signed out; this one stays signed in." />
        <button type="button" onClick={onClose} className={'mt-4 text-[11px] text-ink-45 hover:text-ink ' + FOCUS_RING}>
          Close
        </button>
      </div>
    </div>
  );
}
