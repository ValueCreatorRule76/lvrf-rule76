import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { fetchRun, type FetchRunResult } from '../api/runs';
import { fetchPov } from '../api/pov';
import { Workbench, type AccountRead } from '../components/workbench/Workbench';

export function RunPage() {
  const { id } = useParams<{ id: string }>();
  const [result, setResult] = useState<FetchRunResult | null>(null);
  const [account, setAccount] = useState<AccountRead>({ status: 'loading' });
  // C1: bumped after an erratum is recorded, to read the run (and its errata) again.
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setResult(null);
    setAccount({ status: 'loading' });
    if (id) {
      fetchRun(id).then((r) => {
        if (cancelled) return;
        setResult(r);
        // The account's reference marker and its engagements' locked runs come
        // from the POV read the app already makes; no new read (UX-1 slice 4).
        // A null owner join means the account is retired: nothing to read.
        if (r.status !== 'ok') return;
        if (!r.run.institution_id) { setAccount({ status: 'none' }); return; }
        fetchPov(r.run.institution_id).then((a) => {
          if (!cancelled) setAccount(a.status === 'ok' ? { status: 'ok', pov: a.pov } : { status: 'error' });
        });
      });
    }
    return () => {
      cancelled = true;
    };
  }, [id, reload]);

  if (!result) return <p className="p-8 text-ink-45">loading</p>;
  if (result.status === 'not_found') return <p className="p-8 text-ink-45">This run was not found.</p>;
  if (result.status === 'error') return <p className="p-8 text-ink-70">Couldn&apos;t load this run. Reload the page to try again.</p>;
  return <Workbench run={result.run} account={account} onChanged={() => setReload((n) => n + 1)} />;
}
