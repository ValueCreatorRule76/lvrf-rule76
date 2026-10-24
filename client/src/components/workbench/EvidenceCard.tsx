import type { Run } from '../../types/run';
import { Badge } from './Card';
import { label, EVIDENCE_KIND, SUPPORTS } from '../../lib/labels';

// payload.evidence is a snapshot taken at walk time, not a live join —
// walkSpine.ts's comment explains why: evidence mutates after a walk
// (verification flips, citations resolve), so a live join would show
// current evidence beside a confidence score computed from evidence as it
// stood at walk time. Coherent-looking and wrong. If evidence changes,
// the answer is a new run, not a fresher read of this one.
//
// UX-1 slice 4: one row per sealed item, stacked (no table), every value in
// words; the provenance as recorded.
export function EvidenceCard({ run }: { run: Run }) {
  const evidence = run.payload.evidence;

  if (!evidence) {
    // Runs walked before this field existed carry none — not back-filled,
    // since giving a historical run data it never had would be a falsified
    // snapshot. Degrade honestly rather than assume the field exists.
    return (
      <p className="m-0 border border-dashed border-ink-45 bg-white px-4 py-3 text-[12.5px] text-ink-70" data-testid="sealed-unavailable">
        This run was produced before evidence was sealed into a run. It is not filled in afterwards: a run given evidence it never sealed would be a falsified record.
      </p>
    );
  }
  if (evidence.length === 0) {
    return <p className="m-0 border border-dashed border-ink-45 bg-white px-4 py-3 text-[12.5px] text-ink-70" data-testid="sealed-none">This run sealed no evidence.</p>;
  }

  const verified = evidence.filter((e) => e.source_verified).length;
  return (
    <div className="border border-rule bg-white" data-testid="sealed-evidence">
      <p className="m-0 border-b border-rule px-4 py-2 text-[11.5px] text-ink-45">{verified} of {evidence.length} source-verified when this run was sealed</p>
      <ul className="m-0 list-none p-0">
        {evidence.map((e, i) => (
          <li key={i} className="border-b border-rule-soft px-4 py-3 last:border-b-0" data-testid="sealed-item">
            <div className="flex flex-wrap items-baseline gap-2">
              <Badge tone={e.source_verified ? 'healthy' : 'warning'}>{e.source_verified ? 'Source-verified' : 'Not source-verified'}</Badge>
              <span className="text-[13px] text-ink" data-record>{e.summary}</span>
            </div>
            <p className="m-0 mt-1 text-[11.5px] text-ink-45">
              {label(EVIDENCE_KIND, e.kind)} · supports {label(SUPPORTS, e.supports)}
              {e.ai_sourced ? ` · AI-sourced, citation ${e.citation_resolved ? 'opened' : 'not opened'}` : ''}
            </p>
            <p className="m-0 mt-0.5 text-[11.5px] text-ink-45 [overflow-wrap:anywhere]" data-record>Source: {e.provenance}</p>
            {/*
              Same tone as an unopened AI citation, same reason: both are facts
              lvrf_block_ai_actual refuses an actual on (AMENDMENT-005 Article I).
              Disclosing them is the point.
            */}
            {(e.vendor_published || e.simulated || (e.ai_sourced && !e.citation_resolved)) && (
              <p className="m-0 mt-1 flex flex-wrap gap-1.5">
                {e.ai_sourced && !e.citation_resolved && <Badge tone="warning">AI-sourced, citation not opened</Badge>}
                {e.vendor_published && <Badge tone="warning">Vendor-published</Badge>}
                {e.simulated && <Badge tone="warning">Simulated</Badge>}
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
