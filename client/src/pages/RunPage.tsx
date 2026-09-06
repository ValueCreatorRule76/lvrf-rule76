import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fetchRun, type FetchRunResult } from '../api/runs';
import { Workbench } from '../components/workbench/Workbench';

export function RunPage() {
  const { id } = useParams<{ id: string }>();
  const [result, setResult] = useState<FetchRunResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    setResult(null);
    if (id) {
      fetchRun(id).then((r) => {
        if (!cancelled) setResult(r);
      });
    }
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (!result) return <p className="p-8 text-ink-45">loading</p>;

  if (result.status === 'not_found') {
    return <p className="p-8 text-ink-45">run {id} not found</p>;
  }
  if (result.status === 'error') {
    return <p className="p-8 text-critical">{result.message}</p>;
  }

  const { run } = result;

  return (
    <>
      {/* The account back-link — the header naming whose engagement this
          is. Added here rather than in Topbar/Workbench, which this
          change doesn't touch. Rendered only when the owner join actually
          resolved; null means the owning engagement or institution was
          retired, and that absence is not papered over with a stand-in. */}
      {run.institution_id && run.institution_name && (
        <div className="border-b border-rule bg-white px-[30px] py-2">
          <Link
            to={`/accounts/${run.institution_id}`}
            className="text-xs text-ink-45 hover:text-gold-ink"
          >
            ← {run.institution_name}
          </Link>
        </div>
      )}
      <Workbench run={run} />
    </>
  );
}
