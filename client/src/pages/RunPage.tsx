import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
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

  return <Workbench run={result.run} />;
}
