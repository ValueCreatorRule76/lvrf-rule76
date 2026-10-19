import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, Badge } from './workbench/Card';
import { FOCUS_RING } from './GovernedForm';
import { useActor } from '../actor/ActorContext';
import { fetchCohort, type Cohort, type CohortMember, type FetchCohortResult } from '../api/cohort';

// Same mapping as InstitutionPage.tsx's CONFIDENCE_TONE — not imported, for
// that file's own stated reason (a local table, not yet a convention).
const BAND_TONE: Record<string, 'healthy' | 'watch' | 'critical'> = {
  high: 'healthy',
  medium: 'watch',
  low: 'critical',
};

const STATUS_LABEL: Record<CohortMember['status'], string> = {
  run_of_record: 'Run of record',
  no_locked_run: 'No locked run',
  never_run: 'Never run',
  no_engagement: 'No engagement',
};

function memberLabel(m: CohortMember) {
  return m.engagement_name ? `${m.institution_name} · ${m.engagement_name}` : m.institution_name;
}

function scoreBadge(m: CohortMember) {
  if (m.status !== 'run_of_record') {
    // No number and no band: a member with no run of record has no score
    // (CLAUDE.md — a number that cannot be sourced stays empty), and the
    // model's thresholds are not restated here.
    return <Badge tone="watch">Unmeasured</Badge>;
  }
  return (
    <Badge tone={BAND_TONE[m.confidence_band ?? ''] ?? 'neutral'}>
      {m.confidence_score} · {m.confidence_band}
    </Badge>
  );
}

function Composite({ cohort, book = false }: { cohort: Cohort; book?: boolean }) {
  const { composite } = cohort;
  if (composite.floor === 'empty' || !composite.determined_by) {
    // Q4n: an empty BOOK is a state, said in words, never a number.
    return book
      ? <p className="m-0 text-[13px] text-ink" data-testid="book-empty"><strong>No live customer engagements.</strong></p>
      : <p className="m-0 text-[12.5px] text-ink-45">No customer accounts in this cohort.</p>;
  }
  const d = composite.determined_by;
  const lowest = composite.lowest_recorded;
  const unmeasuredCount = cohort.member_count - cohort.measured_count;
  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-3">
        {/* The stored string when the floor is a run; words, never a number,
            when it is not — an unmeasured floor has no score to show. */}
        <span className="font-display text-[34px] leading-none tracking-[.012em] text-ink">
          {composite.floor === 'run' ? composite.score : 'No score'}
        </span>
        {composite.floor === 'run' ? (
          <Badge tone={BAND_TONE[composite.band ?? ''] ?? 'neutral'}>{composite.band}</Badge>
        ) : (
          <Badge tone="watch">Unmeasured floor</Badge>
        )}
      </div>
      <p className="m-0 mt-1.5 text-[12px] text-ink-45">
        Set by the weakest member:{' '}
        <Link to={`/accounts/${d.institution_id}`} className={'text-ink hover:text-gold-ink ' + FOCUS_RING}>
          {memberLabel(d)}
        </Link>
        {d.status === 'run_of_record' ? ` (run ${d.run_number}, locked)` : ` — ${STATUS_LABEL[d.status].toLowerCase()}`}
        . {cohort.measured_count} of {cohort.member_count} engagements across {cohort.account_count}{' '}
        {cohort.account_count === 1 ? 'account' : 'accounts'} have a run of record.
      </p>
      {/* Context only, never the cohort's score — server/routes/cohort.ts. */}
      {composite.floor === 'unmeasured' && (
        <p className="m-0 mt-1 text-[11px] text-ink-45">
          {lowest ? (
            <>
              Lowest run of record: {lowest.confidence_score} · {lowest.confidence_band} (
              {memberLabel(lowest.member)}), excluding {unmeasuredCount} unmeasured.
            </>
          ) : (
            <>No member has a run of record.</>
          )}
        </p>
      )}
      {!cohort.model.comparable && (
        <p className="m-0 mt-1.5 text-[11.5px] text-ink-45">
          <Badge tone="warning">Mixed rulers</Badge> {cohort.model.note}
        </p>
      )}
    </div>
  );
}

/**
 * 2.0 item 3 — the book's confidence is its weakest engagement's, never an
 * average (server/routes/cohort.ts). An engagement with no locked run
 * counts as 0 and is listed first: unmeasured is not compliant.
 */
export function CohortCard({ n }: { n: string }) {
  const { actor } = useActor();
  const [result, setResult] = useState<FetchCohortResult | null>(null);

  useEffect(() => {
    if (!actor) return;
    let cancelled = false;
    setResult(null);
    fetchCohort().then((r) => {
      if (!cancelled) setResult(r);
    });
    return () => {
      cancelled = true;
    };
  }, [actor]);

  return (
    <Card n={n} title="Book confidence — weakest link">
      {!actor ? (
        <p className="m-0 text-[12.5px] text-ink-45">
          Sign in — the roll-up is scoped to the signed-in person's tenant.
        </p>
      ) : !result ? (
        <p className="m-0 text-[12.5px] text-ink-45">loading</p>
      ) : result.status === 'error' ? (
        <p className="m-0 text-[12.5px] text-ink-45">{result.message}</p>
      ) : (
        <>
          <Composite cohort={result.view.book} book />
          <p className="m-0 mt-3 text-[11px] text-ink-45" data-testid="book-scope">
            The minimum across every customer engagement's latest locked run. Never averaged: an
            average of one weak account and several strong ones describes none of them. Your own
            company's account is not included, and neither is a reference example
            {result.view.reference_example_count > 0
              ? ` (${result.view.reference_example_count} ${result.view.reference_example_count === 1 ? 'account is' : 'accounts are'} marked one)`
              : ''}.
          </p>
          <p className="m-0 mt-1 text-[11px] text-ink-45">
            Only locked runs count here; an account page shows its latest run, locked or not.
          </p>

          {result.view.book.members.length > 0 && (
            <table className="mt-4 w-full border-collapse text-[12.5px]">
              <thead>
                <tr>
                  {['Engagement', 'Status', 'Confidence'].map((h) => (
                    <th
                      key={h}
                      className="whitespace-nowrap border-b border-silver px-3 py-[9px] text-left text-[9.5px] font-semibold uppercase tracking-[.13em] text-ink-45"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.view.book.members.map((m) => (
                  <tr key={`${m.institution_id}:${m.engagement_id ?? 'none'}`}>
                    <td className="border-b border-rule-soft px-3 py-[9px] text-ink">{memberLabel(m)}</td>
                    <td className="border-b border-rule-soft px-3 py-[9px] text-ink-45">
                      {STATUS_LABEL[m.status]}
                      {m.status === 'no_locked_run' ? ` (${m.run_count} unlocked)` : ''}
                    </td>
                    <td className="border-b border-rule-soft px-3 py-[9px]">{scoreBadge(m)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {result.view.by_industry.length > 0 && (
            <div className="mt-5">
              <span className="block text-[9.5px] font-semibold uppercase tracking-[.13em] text-ink-45">
                By industry
              </span>
              <ul className="m-0 mt-1.5 list-none p-0">
                {result.view.by_industry.map(({ industry, cohort }) => (
                  <li
                    key={industry.slug}
                    className="flex flex-wrap items-center justify-between gap-2 border-b border-rule-soft py-2 last:border-b-0"
                  >
                    <span className="text-[13px] text-ink">
                      <Link to={`/packs/${industry.slug}`} className={'hover:text-gold-ink ' + FOCUS_RING}>
                        {industry.name}
                      </Link>
                      <span className="ml-2 text-[11.5px] text-ink-45">
                        {cohort.account_count} {cohort.account_count === 1 ? 'account' : 'accounts'}
                        {cohort.composite.determined_by ? ` · set by ${memberLabel(cohort.composite.determined_by)}` : ''}
                      </span>
                    </span>
                    {cohort.composite.determined_by && scoreBadge(cohort.composite.determined_by)}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {/* Outside the by-industry block on purpose: when every account is
              unclassified, by_industry is empty and this note is the only
              sign of why. */}
          {result.view.unclassified_account_count > 0 && (
            <p
              className={
                'm-0 text-[11px] text-ink-45 ' + (result.view.by_industry.length > 0 ? 'mt-1.5' : 'mt-4')
              }
            >
              {result.view.unclassified_account_count} unclassified{' '}
              {result.view.unclassified_account_count === 1 ? 'account is' : 'accounts are'} in the
              book but in no industry cohort.
            </p>
          )}
        </>
      )}
    </Card>
  );
}
