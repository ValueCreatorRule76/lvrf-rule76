import { Link } from 'react-router-dom';
import { FOCUS_RING } from '../GovernedForm';

/**
 * S1 (3.1; LVRF_PLAN §20 item 3, R5-3.1e): a run's value case under both lenses, the Workbench's own markup (its
 * "The value case · under the CFO lens" line), reused wherever a run is listed: the run page's header, each row of
 * the Runs list, and the tenant's own account's run list. `testid` prefixes the two links' test ids, so each
 * placement is found on its own; a click does not also reach a clickable row underneath.
 */
export function CaseLinks({ runId, testid, label = 'Value case' }: { runId: string; testid: string; label?: string }) {
  const cls = 'font-semibold text-gold-ink underline ' + FOCUS_RING;
  const stop = (e: React.MouseEvent) => e.stopPropagation();
  return (
    <>
      <Link to={`/runs/${runId}/case`} onClick={stop} className={cls} data-testid={testid}>{label}</Link>
      {' · '}<Link to={`/runs/${runId}/case?lens=cfo`} onClick={stop} className={cls} data-testid={`${testid}-cfo`}>under the CFO lens</Link>
    </>
  );
}
