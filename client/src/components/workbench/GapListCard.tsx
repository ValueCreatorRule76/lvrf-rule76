import { useEffect, useState } from 'react';
import { businessMetricName, type Run } from '../../types/run';
import { Card, Badge } from './Card';
import { fetchGaps, type AskType, type FetchGapsResult, type GapEntry } from '../../api/gaps';
import { FOCUS_RING } from '../GovernedForm';

/**
 * A SHOPPING LIST, not a brief. Every word on this card comes from the
 * /gaps response (requirement, earns, refusal_message, persons_on_record) or
 * is fixed template text (the three headings below, the empty-state line,
 * the today's-list caveat, the unavailable-run notice). NOTHING IS
 * GENERATED: no model call, no inference, no rephrasing of a requirement, no
 * estimate of effort or cost. If a word appears here that gapRegister.ts did
 * not compute and this file did not hard-code, that is a defect.
 */

const ASK_TYPE_ORDER: AskType[] = ['definition', 'document', 'person'];

const ASK_TYPE_VERB: Record<AskType, string> = {
  definition: 'Agree',
  document: 'Obtain',
  person: 'Confirm',
};

const ASK_TYPE_SUBHEAD: Record<AskType, string> = {
  definition: 'what a measure means, before anything is gathered',
  document: 'a thing someone produces',
  person: 'someone accepts accountability for a figure',
};

const TODAYS_LIST_CAVEAT =
  "This is today's register, computed from the outcome as it stands now — not from this run's " +
  'payload. On a locked run the confidence score above is a photograph; this list is not.';

export function GapListCard({ run }: { run: Run }) {
  const outcomeId = run.payload.valueOutcomeId;

  if (!outcomeId) {
    // Same pattern as AddEvidenceCard.tsx: degrade honestly rather than
    // assume a field a historical run's payload never had.
    return (
      <Card
        n="01B"
        title="Gap register"
        badge={<Badge tone="neutral">Unavailable on this run</Badge>}
      >
        <p className="m-0 text-[12.5px] text-ink-70">
          This run was produced before valueOutcomeId was added to the payload. The gap register
          cannot be computed for an outcome this run does not name.
        </p>
      </Card>
    );
  }

  return <GapListBody run={run} outcomeId={outcomeId} />;
}

function GapListBody({ run, outcomeId }: { run: Run; outcomeId: string }) {
  const [result, setResult] = useState<FetchGapsResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    setResult(null);
    fetchGaps(outcomeId).then((r) => {
      if (!cancelled) setResult(r);
    });
    return () => {
      cancelled = true;
    };
  }, [outcomeId]);

  if (!result) {
    return (
      <Card n="01B" title="Gap register">
        <p className="m-0 text-[12.5px] text-ink-45">loading</p>
      </Card>
    );
  }

  if (result.status === 'error') {
    return (
      <Card n="01B" title="Gap register">
        <p className="m-0 text-[12.5px] text-critical">{result.message}</p>
      </Card>
    );
  }

  return <GapList run={run} gaps={result.gaps} />;
}

function buildPlainText(run: Run, gaps: GapEntry[]): string {
  const lines: string[] = [];
  lines.push(`${run.payload.engagement} — ${businessMetricName(run.payload.businessMetric)}`);
  lines.push('Gap register');
  lines.push(TODAYS_LIST_CAVEAT);
  lines.push('');

  if (gaps.length === 0) {
    lines.push('Every factor is fully earned. Nothing is outstanding.');
    return lines.join('\n');
  }

  for (const askType of ASK_TYPE_ORDER) {
    const items = gaps.filter((g) => g.ask_type === askType);
    if (items.length === 0) continue;

    lines.push(`${ASK_TYPE_VERB[askType].toUpperCase()} — ${ASK_TYPE_SUBHEAD[askType]}`);
    for (const g of items) {
      lines.push(`  ${g.requirement} (+${g.earns} of ${g.weight})`);
      if (g.state === 'refused' && g.refusal_message) {
        lines.push(`    Already refused: ${g.refusal_message}`);
      }
      if (g.ask_type === 'person') {
        lines.push(
          g.persons_on_record && g.persons_on_record.length > 0
            ? `    On record: ${g.persons_on_record.map((p) => p.full_name).join(', ')}`
            : '    Nobody from the account is on record yet.',
        );
      }
    }
    lines.push('');
  }

  return lines.join('\n').trimEnd();
}

function CopyAsTextButton({ text }: { text: string }) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle');

  const onClick = () => {
    navigator.clipboard.writeText(text).then(
      () => setStatus('copied'),
      () => setStatus('failed'),
    );
  };

  return (
    <div className="flex items-center gap-2">
      {status === 'copied' && <span className="text-[10px] text-ink-45">Copied</span>}
      {status === 'failed' && <span className="text-[10px] text-critical">Copy failed</span>}
      <button
        type="button"
        onClick={onClick}
        className={
          'border border-silver px-2 py-1 text-[9.5px] font-semibold uppercase tracking-[.1em] text-ink-45 ' +
          'hover:border-ink hover:text-ink ' +
          FOCUS_RING
        }
      >
        Copy as text
      </button>
    </div>
  );
}

function GapList({ run, gaps }: { run: Run; gaps: GapEntry[] }) {
  return (
    <Card n="01B" title="Gap register" badge={<CopyAsTextButton text={buildPlainText(run, gaps)} />}>
      <p className="m-0 mb-3.5 text-[11.5px] text-ink-45">{TODAYS_LIST_CAVEAT}</p>

      {gaps.length === 0 ? (
        <p className="m-0 text-[12.5px] text-ink-70">
          Every factor is fully earned. Nothing is outstanding.
        </p>
      ) : (
        ASK_TYPE_ORDER.map((askType) => {
          const items = gaps.filter((g) => g.ask_type === askType);
          if (items.length === 0) return null;

          return (
            <section key={askType} className="mb-4 last:mb-0">
              <h4 className="m-0 mb-2 text-[10px] font-semibold uppercase tracking-[.16em] text-ink-45">
                {ASK_TYPE_VERB[askType]} <span className="normal-case">— {ASK_TYPE_SUBHEAD[askType]}</span>
              </h4>
              <ul className="m-0 flex list-none flex-col gap-3 p-0">
                {items.map((g, i) => (
                  <li key={`${g.factor}-${i}`} className="border-l-[3px] border-rule pl-3">
                    <p className="m-0 text-[12.5px] text-ink">
                      {g.requirement}{' '}
                      <span className="whitespace-nowrap text-[11px] text-ink-45">
                        (+{g.earns} of {g.weight})
                      </span>
                    </p>
                    {g.state === 'refused' && g.refusal_message && (
                      <p className="m-0 mt-1 text-[11.5px] text-ink-45">
                        Already refused: “{g.refusal_message}”
                      </p>
                    )}
                    {g.ask_type === 'person' && (
                      <p className="m-0 mt-1 text-[11.5px] text-ink-45">
                        {g.persons_on_record && g.persons_on_record.length > 0
                          ? `On record: ${g.persons_on_record.map((p) => p.full_name).join(', ')}`
                          : 'Nobody from the account is on record yet.'}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          );
        })
      )}
    </Card>
  );
}
