import { useEffect, useState } from 'react';
import { fetchRuns, type FetchRunsResult } from '../api/runsIndex';
import { RunsTable } from '../components/RunsTable';

export function RunsIndexPage() {
  const [result, setResult] = useState<FetchRunsResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchRuns().then((r) => {
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

  return (
    <div className="px-[30px] pb-14 pt-6">
      <header className="mb-[22px]">
        <span className="text-[10px] font-semibold uppercase tracking-[.16em] text-ink-45">
          LVRF
        </span>
        <h1 className="m-0 my-1.5 font-display text-[40px] leading-[.98] tracking-[.012em]">
          Value runs
        </h1>
      </header>
      <RunsTable runs={result.runs} />
    </div>
  );
}
