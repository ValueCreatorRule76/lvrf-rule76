import { Link } from 'react-router-dom';
import { FOCUS_RING } from './GovernedForm';

/** P2 (LVRF_PLAN §10): "Where this came from" — a link to /lineage/:table/:id. Screen only. */
export function LineageLink({ table, id, figure, className = '' }: { table: string; id: string; figure?: 'baseline' | 'actual'; className?: string }) {
  return (
    <Link to={`/lineage/${table}/${id}${figure ? `?figure=${figure}` : ''}`} data-testid="lineage-link"
      className={'text-[11px] text-gold-ink underline-offset-2 hover:underline print:hidden ' + FOCUS_RING + ' ' + className}>
      Where this came from
    </Link>
  );
}
