import { useEffect, useState } from 'react';
import { apiFetch } from '../api/http';
import { Card, Badge } from './workbench/Card';
import { ClassifyAccount } from './CreateAccountCard';
import { ClaimForm, PackBasisForm } from './OutsideInWalk';
import type { WalkState } from '../lib/workspaceStatus';

/**
 * S1 (3.1; LVRF_PLAN §20 D1; Brad's ruling 2, 15 Nov 2026): the tenant's own account has no walk (L33), so the three acts
 * a hypothesis's chain needs before it can be stated sit here, each the existing form and route, unchanged:
 *   "Classify as…"                      POST /api/institutions/:id/industry          (the create form's fields)
 *   the capability's claim (W3)        POST /api/capabilities/:id/industry-measures (the walk's form)
 *   the metric's pack basis (W5)       POST /api/business-metrics/:id/pack-basis    (the walk's form)
 * Read from the walk's own read, GET /api/institutions/:id/walk. The account is classified only to carry its own value
 * case. Then card 05: "State a hypothesis…", and the runs.
 */
export function TenantChain({ institutionId, onChanged }: { institutionId: string; onChanged: () => void }) {
  const [w, setW] = useState<WalkState | { error: string } | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let cancelled = false;
    apiFetch(`/api/institutions/${encodeURIComponent(institutionId)}/walk`)
      .then(async (r) => { const b = await r.json().catch(() => null); return r.ok ? (b as WalkState) : { error: b?.message ?? `HTTP ${r.status}` }; })
      .catch((e) => ({ error: e instanceof Error ? e.message : 'network error' }))
      .then((v) => { if (!cancelled) setW(v); });
    return () => { cancelled = true; };
  }, [institutionId, tick]);
  const reload = () => { setTick((t) => t + 1); onChanged(); };
  const title = 'What its value case rests on';
  if (!w) return <Card n="04b" title={title}><p className="m-0 text-[12.5px] text-ink-45">loading</p></Card>;
  if ('error' in w) return <Card n="04b" title={title}><p className="m-0 text-[12.5px] text-critical">{w.error}</p></Card>;
  const classified = Boolean(w.institution.industry_slug);
  const claims = w.capabilities.flatMap((c) => c.claims.map((x) => ({ ...x, capability_name: c.name })));
  const outcomes = w.engagements.filter((e) => !e.retired).flatMap((e) => e.outcomes);
  const H = 'mb-1 mt-3 text-[10px] font-semibold uppercase tracking-[.16em] text-ink-45';
  return (
    <Card n="04b" title={title} badge={<Badge tone="neutral">{w.institution.industry_name ?? 'Unclassified'}</Badge>}>
      <p className="m-0 max-w-[85ch] text-[12.5px] text-ink-45">
        A run seals the hypothesis it tests, and a hypothesis names a lever on a pack entry its outcome rests on. This account
        is classified only to carry its own value case; these are the same acts a customer account&apos;s walk records.
      </p>
      <div data-testid="tenant-chain">
        <h4 className={H}>Classification</h4>
        {classified
          ? <p className="m-0 text-[12.5px] text-ink" data-testid="tenant-classified">Classified as {w.institution.industry_name} <span className="text-ink-45">(final: corrected only by superseding the account)</span></p>
          : <div data-testid="tenant-classify"><ClassifyAccount institutionId={institutionId} onDone={reload} /></div>}
        <h4 className={H}>The capability&apos;s claim on a pack entry</h4>
        {claims.length > 0 && <p className="m-0 mb-2 text-[12.5px] text-ink" data-testid="tenant-claims">{claims.map((c) => `${c.capability_name} → ${c.measure_name}`).join('; ')} <span className="text-ink-45">(a claim is not amended)</span></p>}
        {!classified
          ? <p className="m-0 text-[12px] text-ink-45">Waits for the classification: a claim is made against the account&apos;s pack.</p>
          : w.pack.length === 0
            ? <p className="m-0 text-[12px] text-ink-45">The {w.institution.industry_name} pack has no entry yet: accept one on its pack page first.</p>
            : <div data-testid="tenant-claim"><ClaimForm capabilities={w.capabilities} pack={w.pack} onDone={reload} /></div>}
        <h4 className={H}>The metric&apos;s pack basis</h4>
        {outcomes.map((o) => {
          const claimed = claims.filter((c) => c.capability_name === o.capability_name);
          return (
            <div key={o.id} className="mb-2" data-testid="tenant-basis" data-outcome={o.id}>
              {o.metric.industry_measure_id
                ? <p className="m-0 text-[12.5px] text-ink">{o.metric.name} → {w.pack.find((m) => m.id === o.metric.industry_measure_id)?.name ?? o.metric.industry_measure_id} <span className="text-ink-45">(a basis is not amended)</span></p>
                : claimed.length === 0
                  ? <p className="m-0 text-[12px] text-ink-45">{o.metric.name}: waits for its capability ({o.capability_name}) to claim a pack entry.</p>
                  : <><p className="m-0 text-[12.5px] text-ink">{o.metric.name}</p><PackBasisForm metric={o.metric} claimed={claimed} onDone={reload} /></>}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
