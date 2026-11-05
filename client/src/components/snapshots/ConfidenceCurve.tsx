import { useEffect, useRef, useState } from 'react';

/** One sealed run on the curve. */
export interface CurvePoint {
  run_number: number; score: number; band: string; locked_at: string | null;
  model_fingerprint: string | null; model_version: string | null; value_outcome_id: string | null;
  erratum: boolean; recomputed: number | null; system_exercise: boolean;
}

/**
 * §16 (CS-D5, with Brad's addition): the confidence curve. Sealed scores only; it never recomputes. The line breaks
 * where the model fingerprint differs or is unknown, or where the outcome changes, because a slope across either
 * would be false. A point carrying a current erratum shows the erratum mark; a system exercise is a hollow point.
 * The list beside it holds every number, so a reader without the chart loses nothing.
 */
export function ConfidenceCurve({ points }: { points: CurvePoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  // Drawn at the width it has, so its text stays legible on a phone (no scaled-down SVG).
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  if (points.length === 0) return <p className="m-0 text-[12.5px] text-ink-45" data-testid="curve-none">No locked run yet, so there is no curve.</p>;
  const W = width, H = width < 480 ? 200 : 220, L = 34, R = 12, T = 14, B = 30;
  const xs = points.map((p) => p.run_number);
  const lo = Math.min(...xs), hi = Math.max(...xs);
  const x = (n: number) => (hi === lo ? L + (W - L - R) / 2 : L + ((n - lo) / (hi - lo)) * (W - L - R));
  const y = (s: number) => T + (1 - s / 100) * (H - T - B);
  // A segment runs while the model and the outcome hold; any change breaks it (CS-D5).
  const segments: CurvePoint[][] = [];
  points.forEach((p, i) => {
    const prev = points[i - 1];
    const joins = prev && p.model_fingerprint !== null && prev.model_fingerprint === p.model_fingerprint && prev.value_outcome_id === p.value_outcome_id;
    if (joins) segments[segments.length - 1].push(p); else segments.push([p]);
  });
  const breaks = points.slice(1).map((p, i) => {
    const prev = points[i];
    if (p.model_fingerprint === null || prev.model_fingerprint === null) return { at: p.run_number, why: 'model unknown' };
    if (prev.model_fingerprint !== p.model_fingerprint) return { at: p.run_number, why: 'model changed' };
    if (prev.value_outcome_id !== p.value_outcome_id) return { at: p.run_number, why: 'outcome changed' };
    return null;
  }).filter((b): b is { at: number; why: string } => b !== null);
  const h = hover === null ? null : points[hover];
  return (
    <figure className="m-0" data-testid="confidence-curve">
      <div ref={box} className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block h-auto max-w-full" role="img" aria-label={`Sealed confidence by run, ${points.length} locked runs`}
          onMouseLeave={() => setHover(null)}>
          {[0, 25, 55, 75, 100].map((g) => (
            <g key={g}>
              <line x1={L} x2={W - R} y1={y(g)} y2={y(g)} className={g === 55 ? 'stroke-ink-45' : 'stroke-rule'} strokeWidth={1} strokeDasharray={g === 55 ? '3 3' : undefined} />
              <text x={L - 6} y={y(g) + 3} textAnchor="end" className="fill-ink-45 text-[10px]">{g}</text>
            </g>))}
          <text x={L + 4} y={y(55) - 4} textAnchor="start" className="fill-ink-45 text-[10px]">CFO lens 55</text>
          {breaks.map((b) => <line key={b.at} x1={x(b.at) - (hi === lo ? 0 : (W - L - R) / (hi - lo) / 2)} x2={x(b.at) - (hi === lo ? 0 : (W - L - R) / (hi - lo) / 2)} y1={T} y2={H - B} className="stroke-ink-25" strokeWidth={1} strokeDasharray="2 3" data-testid="curve-break" />)}
          {segments.map((seg, i) => seg.length > 1 && (
            <polyline key={i} points={seg.map((p) => `${x(p.run_number)},${y(p.score)}`).join(' ')} fill="none" className="stroke-ink" strokeWidth={2} strokeLinejoin="round" data-testid="curve-segment" />))}
          {points.map((p, i) => (
            <g key={p.run_number} data-testid="curve-point" data-run={p.run_number} data-erratum={p.erratum ? 'true' : 'false'} data-hollow={p.system_exercise ? 'true' : 'false'}>
              <circle cx={x(p.run_number)} cy={y(p.score)} r={4.5} strokeWidth={2} className={p.system_exercise ? 'fill-white stroke-ink' : 'fill-ink stroke-white'} />
              {p.erratum && <rect x={x(p.run_number) - 5} y={y(p.score) - 15} width={10} height={10} transform={`rotate(45 ${x(p.run_number)} ${y(p.score) - 10})`} className="fill-warning stroke-white" strokeWidth={1.5} data-testid="curve-erratum-mark" />}
              <rect x={x(p.run_number) - 12} y={T} width={24} height={H - T - B} fill="transparent" onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={0} aria-label={`Run ${p.run_number}: ${p.score} / 100`} />
            </g>))}
          {xs.map((n) => (points.length <= (W < 480 ? 6 : 12) || n === lo || n === hi || (n % (W < 480 ? 10 : 5) === 0 && Math.abs(x(hi) - x(n)) >= 20 && Math.abs(x(n) - x(lo)) >= 20)) && <text key={n} x={x(n)} y={H - B + 14} textAnchor="middle" className="fill-ink-45 text-[10px]">{n}</text>)}
          <text x={(L + W - R) / 2} y={H - 4} textAnchor="middle" className="fill-ink-45 text-[10px]">run</text>
        </svg>
        {h && (
          <div className="mt-1 border border-rule bg-white px-3 py-2 text-[11.5px] text-ink" data-testid="curve-tooltip" role="status">
            <strong>Run {h.run_number}</strong>: {h.score} / 100, {h.band}{h.locked_at ? `, locked ${h.locked_at.slice(0, 10)}` : ''}
            <span className="block text-ink-45">model {h.model_version ?? 'unknown'}{h.system_exercise ? ' · system exercise' : ''}</span>
            {h.erratum && <span className="block text-warning">Erratum on record{h.recomputed !== null ? `; its recompute: ${h.recomputed} / 100` : ''}</span>}
          </div>)}
      </div>
      <figcaption className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-ink-45" data-testid="curve-legend">
        <span>● sealed score, a line while the model and outcome hold</span>
        <span>○ system exercise</span>
        <span><span className="text-warning">◆</span> erratum on record</span>
        <span>┆ a break: {breaks.length ? [...new Set(breaks.map((b) => b.why))].join(', ') : 'none here'}</span>
      </figcaption>
    </figure>
  );
}
