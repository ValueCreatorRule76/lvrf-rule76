import type { Run } from '../../types/run';
import { Card, Badge } from './Card';

// payload.evidence is a snapshot taken at walk time, not a live join —
// walkSpine.ts's comment explains why: evidence mutates after a walk
// (verification flips, citations resolve), so a live join would show
// current evidence beside a confidence score computed from evidence as it
// stood at walk time. Coherent-looking and wrong. If evidence changes,
// the answer is a new run, not a fresher read of this one.
export function EvidenceCard({ run }: { run: Run }) {
  const evidence = run.payload.evidence;

  if (!evidence) {
    // Runs walked before this field existed carry neither — not back-filled,
    // since giving a historical run data it never had would be a falsified
    // snapshot. Degrade honestly rather than assume the field exists.
    return (
      <Card n="01" title="Evidence ledger" badge={<Badge tone="neutral">Unavailable on this run</Badge>}>
        <p className="m-0 text-[12.5px] text-ink-70">
          This run was walked before evidence was captured into the payload. Not back-filled: a
          historical run given data it never had would be a falsified snapshot.
        </p>
      </Card>
    );
  }

  return (
    <Card
      n="01"
      title="Evidence ledger"
      badge={
        <Badge tone="neutral">
          {evidence.filter((e) => e.source_verified).length} of {evidence.length} verified
        </Badge>
      }
    >
      <table className="w-full border-collapse text-[12.5px]">
        <thead>
          <tr>
            {['Supports', 'Summary', 'Provenance', 'State'].map((h) => (
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
          {evidence.map((e, i) => (
            <tr key={i}>
              <td className="border-b border-rule-soft px-3 py-[9px] text-[11.5px] text-ink-45">
                {e.supports}
              </td>
              <td className="border-b border-rule-soft px-3 py-[9px]">{e.summary}</td>
              <td className="border-b border-rule-soft px-3 py-[9px] text-[11.5px] text-ink-45">
                {e.provenance}
                {e.ai_sourced && !e.citation_resolved && (
                  <>
                    {' '}
                    <Badge tone="warning">AI-sourced, unresolved</Badge>
                  </>
                )}
                {/*
                  Same tone as "AI-sourced, unresolved" above, same reason:
                  both are facts lvrf_block_ai_actual refuses an actual on
                  (AMENDMENT-005 Article I). Disclosing them here is the
                  point — a vendor-published case study rendering with no
                  marker is the one fact the gate refused on, invisible.
                */}
                {e.vendor_published && (
                  <>
                    {' '}
                    <Badge tone="warning">Vendor-published</Badge>
                  </>
                )}
                {e.simulated && (
                  <>
                    {' '}
                    <Badge tone="warning">Simulated</Badge>
                  </>
                )}
              </td>
              <td className="border-b border-rule-soft px-3 py-[9px]">
                <Badge tone={e.source_verified ? 'healthy' : 'warning'}>
                  {e.source_verified ? 'Verified' : 'Unverified'}
                </Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
