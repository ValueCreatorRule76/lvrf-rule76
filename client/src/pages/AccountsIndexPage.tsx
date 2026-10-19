import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchInstitutions, type FetchInstitutionsResult, type InstitutionListItem } from '../api/institutions';
import { CreateAccountCard } from '../components/CreateAccountCard';
import { CohortCard } from '../components/CohortCard';
import { FOCUS_RING } from '../components/GovernedForm';
import { ConfidenceBadge } from '../components/workbench/Workspace';
import { day, loadAccountRow, type AccountRow } from '../lib/workspaceStatus';

/**
 * UX-1 slice 2 — the Accounts home (DESIGN_SPEC §9, "UX-1 standards";
 * design/mockups/accounts.html as revised in review). One row per account,
 * each a real link (keyboard-reachable): its status in plain words, the
 * industry, where it stands ("n of 6 · next step", the workspace's own
 * derivation), each engagement's latest locked run, and the last thing
 * recorded. "New account…" opens the create form on demand. Book confidence
 * stays last, with its own wording. Presentation only: every figure comes from
 * reads the app already makes (lib/workspaceStatus.ts says which).
 */

const HEAD = 'text-[10.5px] font-semibold uppercase tracking-[.14em] text-ink-45';

function Row({ inst }: { inst: InstitutionListItem }) {
  const [row, setRow] = useState<AccountRow | { error: string } | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadAccountRow(inst.id).then((r) => { if (!cancelled) setRow(r); });
    return () => { cancelled = true; };
  }, [inst.id]);
  const r = row && !('error' in row) ? row : null;
  return (
    <li className="border-b border-rule-soft last:border-b-0">
      <Link to={`/accounts/${inst.id}`} data-testid="account-row"
        className={'grid grid-cols-1 gap-x-4 gap-y-1 px-5 py-3.5 text-ink no-underline hover:bg-offwhite sm:grid-cols-[1.5fr_1.1fr_2.2fr_1.3fr_16px] sm:items-center ' + FOCUS_RING}>
        <span>
          <span className="text-[15px] font-semibold">{inst.name}</span>
          {r?.status && <span className="text-[12.5px] text-ink-45"> · {r.status}</span>}
        </span>
        <span className="text-[12.5px] text-ink-45 sm:text-[13.5px] sm:text-ink">{r ? r.industry : (inst.industry_name ?? 'Not classified')}</span>
        <span className="flex flex-col gap-1.5" data-testid="row-engagements">
          {/* Loading or failed: words only, and nothing computed from part of the data. */}
          {!row ? <span className="text-[12.5px] text-ink-45" data-testid="row-loading">loading…</span>
            : 'error' in row ? <span className="text-[12.5px] text-ink-45" data-testid="row-unavailable">{row.error}</span>
            : row.engagements.length === 0 ? <span className="text-[12.5px] text-ink-45">No engagement yet.</span>
            : row.engagements.map((e, i) => (
              <span key={i} className="text-[12.5px] text-ink-70" data-testid="row-engagement">
                {e.name}{e.retired && <span className="text-ink-45"> (retired)</span>}
                <span className="block">
                  {e.run ? <>run {e.run.number} · <ConfidenceBadge score={e.run.score} band={e.run.band} /></> : <span className="text-ink-45">No locked run yet.</span>}
                </span>
              </span>
            ))}
        </span>
        <span className="text-[12.5px] text-ink-45 sm:text-[13px] sm:text-ink" data-testid="row-standing">
          {r?.standing}
          {r?.last && <span className="block text-[12px] text-ink-45">{r.last.what} · {day(r.last.at)}</span>}
        </span>
        <span className="hidden font-semibold text-gold-ink sm:block" aria-hidden="true">›</span>
      </Link>
    </li>
  );
}

export function AccountsIndexPage() {
  const [result, setResult] = useState<FetchInstitutionsResult | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchInstitutions().then((r) => {
      if (!cancelled) setResult(r);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!result) return <p className="p-8 text-ink-45">loading</p>;
  if (result.status === 'error') {
    return <p className="p-8 text-critical">{result.message}</p>;
  }

  const { institutions } = result;

  return (
    <div className="mx-auto max-w-[1120px] px-4 pb-14 pt-6 sm:px-6" data-testid="accounts-home">
      <header className="mb-3 flex flex-wrap items-end gap-3">
        <div className="flex-1">
          <span className={HEAD}>Your accounts</span>
          <h1 className="m-0 mt-1 font-display text-[34px] leading-none tracking-[.02em] sm:text-[44px]">Accounts</h1>
        </div>
        {!creating && (
          <button type="button" data-primary="true" onClick={() => setCreating(true)}
            className={"border border-ink bg-ink px-4 py-2 text-[12px] font-semibold tracking-[.04em] text-offwhite hover:bg-ink-70 after:ml-2 after:text-gold after:content-['→'] " + FOCUS_RING}>
            New account…
          </button>
        )}
      </header>
      <p className="m-0 mb-4 max-w-[640px] text-[12.5px] text-ink-45">
        Each account is worked as one path: research, the outside-in walk, the hypothesis, the summary, a locked run, then
        the point of view. Open an account to see its next step.
      </p>

      {creating && (
        <div data-testid="create-account">
          <CreateAccountCard primary />
          <button type="button" onClick={() => setCreating(false)}
            className={'-mt-3 mb-5 border border-silver bg-white px-3 py-1.5 text-[12px] font-semibold text-ink-70 hover:border-ink hover:text-ink ' + FOCUS_RING}>
            Close the form
          </button>
        </div>
      )}

      <section className="mb-6 border border-rule bg-white" aria-label="Accounts">
        <div className={'hidden grid-cols-[1.5fr_1.1fr_2.2fr_1.3fr_16px] gap-x-4 border-b border-rule px-5 py-2.5 sm:grid ' + HEAD}>
          <span>Account</span><span>Industry</span><span>Engagements · the latest locked run of each</span><span>Where it stands</span><span />
        </div>
        {institutions.length === 0
          ? <p className="m-0 px-5 py-4 text-[12.5px] text-ink-45">No accounts exist yet.</p>
          : <ul className="m-0 list-none p-0">{institutions.map((inst) => <Row key={inst.id} inst={inst} />)}</ul>}
      </section>

      <CohortCard n="" />
    </div>
  );
}
