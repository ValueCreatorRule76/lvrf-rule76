import { useState, type FormEvent } from 'react';
import { useActor } from './ActorContext';

const FOCUS_RING =
  'outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold';
const LABEL_CLASS = 'mb-1 block text-[10px] font-semibold uppercase tracking-[.16em] text-ink-45';
const INPUT_CLASS = 'w-full border border-rule bg-white px-2.5 py-1.5 text-[13px] text-ink ' + FOCUS_RING;

/**
 * Sign-in P2a. Vendor staff only — the server decides; this form only
 * asks. The error is the server's own sentence, unchanged: one message for
 * every failed sign-in, so this page cannot say which emails exist. There
 * is no "forgot password": a password is set on the box with
 * scripts/set_password.ts.
 */
function SignInForm({ intro }: { intro: string }) {
  const { signIn } = useActor();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting || email.trim() === '' || password === '') return;
    setSubmitting(true);
    setError(null);
    const r = await signIn(email.trim(), password);
    setSubmitting(false);
    if (!r.ok) setError(r.message);
    // Never keep the password in state longer than the attempt.
    setPassword('');
  };

  return (
    <form onSubmit={onSubmit} className="w-full max-w-[360px]" noValidate>
      <p className="m-0 mb-4 text-[12.5px] text-ink-45">{intro}</p>
      <label className="mb-3 block">
        <span className={LABEL_CLASS}>Email</span>
        <input
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={INPUT_CLASS}
        />
      </label>
      <label className="mb-4 block">
        <span className={LABEL_CLASS}>Password</span>
        <input
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={INPUT_CLASS}
        />
      </label>
      {error && (
        <p role="alert" className="m-0 mb-3 text-[12.5px] text-critical">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={submitting || email.trim() === '' || password === ''}
        className={
          'border border-ink bg-ink px-4 py-2 text-[10px] font-semibold uppercase tracking-[.12em] text-offwhite ' +
          'disabled:cursor-not-allowed disabled:border-silver disabled:bg-white disabled:text-ink-45 ' +
          FOCUS_RING
        }
      >
        {submitting ? 'Signing in' : 'Sign in'}
      </button>
    </form>
  );
}

/** Shown in place of the app when nobody is signed in. The URL is kept, so the page asked for opens after sign-in. */
export function SignInPage() {
  return (
    <main className="mx-auto max-w-[1100px] px-[30px] py-12">
      <span className="block text-[10px] font-semibold uppercase tracking-[.16em] text-ink-45">LVRF</span>
      <h1 className="m-0 mb-6 font-display text-[40px] leading-none tracking-[.012em] text-ink">Sign in</h1>
      <SignInForm intro="Every write to this system names the person who made it. Sign in to continue." />
    </main>
  );
}

/**
 * Over the current page when a session ends mid-task. The page underneath
 * stays mounted — a half-filled form keeps its fields. Nothing is resent:
 * submit again after signing in.
 */
export function SignInOverlay() {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="lvrf-signin-expired"
      className="fixed inset-0 z-50 flex items-start justify-center bg-ink/60 px-4 pt-[12vh]"
    >
      <div className="w-full max-w-[420px] border border-rule bg-white p-6">
        <h2 id="lvrf-signin-expired" className="m-0 mb-2 font-display text-[24px] leading-none tracking-[.012em] text-ink">
          Your sign-in has ended
        </h2>
        <SignInForm intro="Sign in again to carry on. Anything you were writing is still on the page; nothing was saved, so submit it again." />
      </div>
    </div>
  );
}
