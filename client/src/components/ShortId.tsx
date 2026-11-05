import { shortId } from '../lib/shortId';

/** B2 (Brad, 4 Nov 2026): an evidence row's short id beside its text, in every picker and list, so near-identical rows are told apart. */

export function ShortId({ id, className = '' }: { id: string | null | undefined; className?: string }) {
  if (!id) return null;
  return <span className={'font-mono text-[11px] text-ink-45 ' + className} data-testid="evidence-short-id">{shortId(id)}</span>;
}
