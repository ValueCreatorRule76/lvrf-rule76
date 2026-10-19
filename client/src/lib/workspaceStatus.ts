/**
 * UX-1 — the account's six-step status, in ONE place (slice 2, 19 Oct 2026).
 * The account workspace (InstitutionPage) and the Accounts home both read it,
 * so "where an account stands" has one implementation. Everything here is
 * derived from reads the app already makes — /walk, /pov, /research — never
 * a new one, and never a second copy of a rule.
 */
import type { Pov, PovOutcome, ReferenceMarker } from '../api/pov';
import { apiFetch } from '../api/http';
import { fetchInstitutionView, type InstitutionView } from '../api/institution';
import { fetchPov, MARKER_KIND } from '../api/pov';
import { fetchAccountResearch } from '../api/accountResearch';
import type { AccountResearchState } from '../api/accountResearch';
import type { StepStatus } from '../components/workbench/Workspace';

export type StepState = 'done' | 'next' | 'waiting';

export interface WalkState {
  institution: { id: string; name: string; industry_slug: string | null; industry_name: string | null };
  persons: { id: string; full_name: string; email: string; title: string | null }[];
  /** W1 fix: existing staff named analyst of record on this account, with the title for it. */
  analysts: { link_id: string; id: string; full_name: string; email: string; title: string; linked_by: string; linked_at: string }[];
  /** The tenant's current staff, to choose the analyst of record from. */
  staff: { id: string; full_name: string; email: string }[];
  offerings: { offering_key: string; name: string; family: string }[];
  pack: { id: string; name: string; unit: string; direction: string; definition: string; confounders: string; addressable: boolean }[];
  capabilities: { id: string; name: string; claims: { industry_measure_id: string; measure_name: string; claim: string; claimed_by: string | null }[] }[];
  engagements: {
    id: string; name: string; status: string; retired: boolean;
    outcomes: {
      id: string; baseline_value: string; baseline_measured_at: string; target_value: string | null; realization: string; confidence: string;
      capability_name: string | null;
      metric: { id: string; name: string; unit: string; direction: string; source_system: string; industry_measure_id: string | null };
      evidence: {
        id: string; kind: string; supports: string; summary: string; basis: string | null;
        /** Q4k: the citation state, for "Open the citation…". */
        ai_sourced: boolean; source_verified: boolean; citation_resolved: boolean;
        citation_resolved_by: string | null; citation_resolved_at: string | null;
      }[];
    }[];
    runs: {
      id: string; run_number: number; locked_at: string | null; confidence_band: string; confidence_score: string | null;
      /** Q4l: what the run sealed, per evidence row, read from its payload. */
      sealed_evidence: { supports: string; kind: string; basis: string | null; ai_sourced: boolean | null; citation_resolved: boolean | null; source_verified: boolean | null; summary: string }[];
    }[];
  }[];
}


/**
 * UX-1 slice 1: what the walk knows, reported up to the account workspace so
 * it can say which of its six steps is done, open or waiting, from this one
 * read, never a second fetch. Derived by deriveWalk, the same function the
 * W-steps render from (one implementation of the rule).
 */
export interface WalkStatus {
  steps: Record<'w1' | 'w2' | 'w3' | 'w4' | 'w5' | 'w6' | 'w7' | 'w8' | 'w9', StepState>;
  engagement: { id: string; name: string; retired: boolean } | null;
  runs: { run_number: number; locked_at: string | null; confidence_score: string | null; confidence_band: string }[];
  baseline: { value: string; unit: string; measured_at: string; metric: string } | null;
  evidence: { opened_verified: number; total: number };
}

export function deriveWalk(w: WalkState) {
  const claims = w.capabilities.flatMap((c) => c.claims.map((cl) => ({ ...cl, capability_id: c.id, capability_name: c.name })));
  // The engagement walked here: the latest one with an outcome.
  const eng = [...w.engagements].reverse().find((e) => e.outcomes.length > 0) ?? null;
  const outcome = eng?.outcomes[eng.outcomes.length - 1] ?? null;
  // The LATEST locked run (a later lock is named, not the first one).
  const lockedRun = eng ? [...eng.runs].reverse().find((r) => r.locked_at) ?? null : null;
  const openRun = eng ? [...eng.runs].reverse().find((r) => !r.locked_at) ?? null : null;
  const hasBaselineEvidence = Boolean(outcome?.evidence.some((e) => e.supports === 'baseline'));
  const s1: StepState = w.persons.length > 0 || w.analysts.length > 0 ? 'done' : 'next';
  const s2: StepState = w.capabilities.length > 0 ? 'done' : s1 === 'done' ? 'next' : 'waiting';
  const s3: StepState = claims.length > 0 ? 'done' : s2 === 'done' ? (w.pack.length ? 'next' : 'waiting') : 'waiting';
  const s4: StepState = outcome ? 'done' : s3 === 'done' ? 'next' : 'waiting';
  const s5: StepState = outcome?.metric.industry_measure_id ? 'done' : s4 === 'done' ? 'next' : 'waiting';
  const s6: StepState = hasBaselineEvidence ? 'done' : s5 === 'done' ? 'next' : 'waiting';
  const s7: StepState = eng && eng.runs.length > 0 ? 'done' : s6 === 'done' ? 'next' : 'waiting';
  const s8: StepState = lockedRun ? 'done' : s7 === 'done' ? 'next' : 'waiting';
  const s9: StepState = eng?.retired ? 'done' : s8 === 'done' ? 'next' : 'waiting';
  return { claims, eng, outcome, lockedRun, openRun, hasBaselineEvidence, s1, s2, s3, s4, s5, s6, s7, s8, s9 };
}

export function walkStatus(w: WalkState): WalkStatus {
  const d = deriveWalk(w);
  return {
    steps: { w1: d.s1, w2: d.s2, w3: d.s3, w4: d.s4, w5: d.s5, w6: d.s6, w7: d.s7, w8: d.s8, w9: d.s9 },
    engagement: d.eng ? { id: d.eng.id, name: d.eng.name, retired: d.eng.retired } : null,
    runs: (d.eng?.runs ?? []).map((r) => ({ run_number: r.run_number, locked_at: r.locked_at, confidence_score: r.confidence_score, confidence_band: r.confidence_band })),
    baseline: d.outcome ? { value: d.outcome.baseline_value, unit: d.outcome.metric.unit, measured_at: d.outcome.baseline_measured_at, metric: d.outcome.metric.name } : null,
    evidence: { opened_verified: d.outcome?.evidence.filter((e) => e.citation_resolved && e.source_verified).length ?? 0, total: d.outcome?.evidence.length ?? 0 },
  };
}


/**
 * UX-1 slice 1: what the authoring cards know, reported up to the account
 * workspace (steps 3 and 4, and the marker in "Account detail"), from this
 * one read of the POV, never a second fetch.
 */
export interface PovStatus {
  hypotheses: { statement: string; due: string; lever: string; created_at: string; verdict: string }[];
  /** Pack entries this account's outcomes rest on that have no lever yet (Q4l). */
  leverless: string[];
  basedOutcomes: number;
  summaries: { lens: string; versions: number; drafted_with_ai: boolean; drafting_tool: string | null; author: string; created_at: string }[];
  marker: { kind: ReferenceMarker['kind']; source_citation: string } | null;
}

export function povStatus(pov: Pov): PovStatus {
  const based = pov.outcomes.filter((o) => o.pack_entry);
  const hasLever = (o: PovOutcome) => pov.levers.some((l) => l.industry_measure_id === o.industry_measure_id);
  return {
    hypotheses: pov.hypotheses.filter((h) => !h.withdrawn_at && !h.superseded_by_id)
      .map((h) => ({ statement: h.statement, due: h.falsifier_due, lever: h.lever.name, created_at: h.created_at, verdict: h.verdict })),
    leverless: [...new Set(based.filter((o) => !hasLever(o)).map((o) => o.pack_entry!.name))],
    basedOutcomes: based.length,
    summaries: pov.executive_summaries.filter((x) => x.current).map((x) => ({
      lens: x.lens, versions: pov.executive_summaries.filter((y) => y.lens === x.lens).length,
      drafted_with_ai: x.drafted_with_ai, drafting_tool: x.drafting_tool, author: x.author, created_at: x.created_at,
    })),
    marker: pov.reference_example ? { kind: pov.reference_example.kind, source_citation: pov.reference_example.source_citation } : null,
  };
}


/** What research knows (step 1): the pinned entity. */
export interface ResearchStatus {
  entity: { legal_name: string; identifier_type: string } | null;
}
export function researchStatus(research: AccountResearchState): ResearchStatus {
  const e = research.entity as Record<string, unknown> | null;
  return { entity: e ? { legal_name: String(e['legal_name']), identifier_type: String(e['identifier_type']) } : null };
}

export const STEP_TITLES = ['Research', 'Outside-in walk', 'Hypothesis', 'Summary', 'Run and lock', 'Point of view'] as const;
// The walk's sub-steps in the reader's words (standard 6: no step codes on screen).
const WALK_NEXT: Record<string, string> = {
  w1: 'name the analyst of record', w2: 'attach the offering and its capability', w3: "record the capability's claim on a pack entry",
  w4: 'record the value outcome with its published baseline', w5: "set the metric's pack basis", w6: 'record evidence for the baseline',
};
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// "5 Sep 2026", in UTC (the record's dates), the same on every browser.
export const day = (iso: string) => { const d = new Date(iso); return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
export const unitText = (u: string) => u.replace(/[.\s]+$/, '');
export const band = (b: string) => b.charAt(0).toUpperCase() + b.slice(1);

export interface Derived { status: StepStatus; summary: string }

export function deriveSteps(r: ResearchStatus | null, w: WalkStatus | null, p: PovStatus | null): Derived[] {
  const done: boolean[] = [];
  const summaries: string[] = [];
  // 1. Research: the entity pinned.
  done.push(Boolean(r?.entity));
  const lockedRun = w ? [...w.runs].reverse().find((x) => x.locked_at) : undefined;
  summaries.push(r?.entity ? `Entity pinned: ${r.entity.legal_name}`
    : lockedRun ? `The entity is not pinned yet. Run ${lockedRun.run_number} stays as sealed; research adds facts for the next run.`
    : 'No researched fact is accepted until the entity is pinned.');
  // 2. The walk, to the baseline's evidence.
  const walkDone = Boolean(w && (['w1', 'w2', 'w3', 'w4', 'w5', 'w6'] as const).every((k) => w.steps[k] === 'done'));
  done.push(walkDone);
  const nextWalk = w ? (['w1', 'w2', 'w3', 'w4', 'w5', 'w6'] as const).find((k) => w.steps[k] !== 'done') : undefined;
  summaries.push(w?.baseline && walkDone
    ? `${w.baseline.metric} baseline ${Number(w.baseline.value)} ${unitText(w.baseline.unit)}, recorded ${day(w.baseline.measured_at)} · ${w.evidence.opened_verified} of ${w.evidence.total} citations opened and verified`
    : nextWalk ? `Next: ${WALK_NEXT[nextWalk]}.` : '');
  // 3. A current hypothesis. Its real precondition (a lever) is said, not hidden (Q4l).
  const hyp = p?.hypotheses[p.hypotheses.length - 1];
  done.push(Boolean(p && p.hypotheses.length > 0));
  summaries.push(hyp ? `${hyp.verdict === 'open' ? 'Open' : band(hyp.verdict.replace(/_/g, ' '))} · due ${day(hyp.due)} · via "${hyp.lever}"`
    : p && p.basedOutcomes === 0 ? 'Waits for step 2: an outcome on a pack entry.'
    : p && p.leverless.length > 0 && p.leverless.length === p.basedOutcomes ? `Waits for a lever on the pack entry ${p.leverless.map((e) => `"${e}"`).join(' and ')}.`
    : 'State what the capability changes, and what would show it wrong.');
  // 4. A current summary.
  const sum = p?.summaries[p.summaries.length - 1];
  done.push(Boolean(p && p.summaries.length > 0));
  summaries.push(sum ? `Version ${sum.versions}, ${sum.lens} reader · ${sum.drafted_with_ai ? `drafted with AI (${sum.drafting_tool})` : 'not AI-drafted'} · ${sum.author}, ${day(sum.created_at)}`
    : 'Written by a named person; LVRF writes no prose.');
  // 5. A locked run, and none open.
  const locked = w ? [...w.runs].reverse().find((x) => x.locked_at) : undefined;
  const open = w ? w.runs.find((x) => !x.locked_at) : undefined;
  done.push(Boolean(w && (w.engagement?.retired || (locked && !open))));
  summaries.push(open ? `Run ${open.run_number} produced, not locked yet: lock it.`
    : locked ? `Run ${locked.run_number} locked ${day(locked.locked_at!)} · ${Number(locked.confidence_score)} / 100 · ${band(locked.confidence_band)}${w!.runs.length > 1 ? ` (${w!.runs.length} runs)` : ''}`
    : 'A run seals what is on record when it is produced.');
  // 6. The point of view: a view, never "done".
  done.push(false);
  summaries.push('Renders from the record at any time, marked unverified until it is.');
  const current = done.findIndex((d) => !d);
  return done.map((d, i) => ({ status: d ? 'done' : i === current ? 'now' : 'wait', summary: summaries[i] }));
}


// ---------------------------------------------------------------------------
// UX-1 slice 2: the Accounts home's row for one account, from the SAME reads
// the workspace makes (/view, /walk, /pov, /research), through the same
// derivations above. No new read: four GETs per account (two for the tenant's
// own), fine at today's handful of accounts; a list of hundreds would want one
// read-only summary route instead (recorded as a loose end, not built).
// ---------------------------------------------------------------------------

/** What the open step asks for, in the reader's words ("where it stands"). */
export const NOW_LABEL = ['Research the entity', 'Walk the outside-in steps', 'State a hypothesis', 'Write the summary', 'Produce and lock a run', 'Point of view ready'] as const;

export interface AccountRow {
  status: string | null;
  industry: string;
  standing: string;
  engagements: { name: string; retired: boolean; run: { number: number; score: string | null; band: string } | null }[];
  last: { what: string; at: string } | null;
}

async function fetchWalk(id: string): Promise<WalkState | null> {
  const r = await apiFetch(`/api/institutions/${encodeURIComponent(id)}/walk`).catch(() => null);
  return r && r.ok ? ((await r.json().catch(() => null)) as WalkState | null) : null;
}

/**
 * The row's one failure sentence. ALL-OR-NOTHING: if any read the row needs
 * fails, nothing is computed from the rest (a status from partial data would
 * misstate where the account stands). In words; never an id or a raw message.
 */
export const ROW_UNAVAILABLE = "Couldn't load this account's status.";

export async function loadAccountRow(id: string): Promise<AccountRow | { error: string }> {
  const v = await fetchInstitutionView(id).catch(() => null);
  if (!v || v.status !== 'ok') return { error: ROW_UNAVAILABLE };
  const view: InstitutionView = v.view;
  const self = view.institution.is_tenant_self;
  type Got<T> = { ok: true; v: T } | { ok: false };
  const [w, p, r] = await Promise.all([
    fetchWalk(id).then((x): Got<WalkState> => (x ? { ok: true, v: x } : { ok: false })),
    self ? ({ ok: true, v: null } as Got<null>) : fetchPov(id).then((x): Got<Pov> => (x.status === 'ok' ? { ok: true, v: x.pov } : { ok: false }), (): Got<Pov> => ({ ok: false })),
    self ? ({ ok: true, v: null } as Got<null>) : fetchAccountResearch(id).then((x): Got<AccountResearchState> => (x.status === 'ok' ? { ok: true, v: x.research } : { ok: false }), (): Got<AccountResearchState> => ({ ok: false })),
  ]);
  if (!w.ok || !p.ok || !r.ok) return { error: ROW_UNAVAILABLE };
  const walk = w.v; const pov = p.v; const research = r.v;
  const engagements = (walk?.engagements ?? []).map((e) => {
    const locked = [...e.runs].reverse().find((r) => r.locked_at);
    return { name: e.name, retired: e.retired, run: locked ? { number: locked.run_number, score: locked.confidence_score, band: locked.confidence_band } : null };
  });
  const marker = pov?.reference_example ? MARKER_KIND[pov.reference_example.kind].label.toLowerCase() : null;
  const allRetired = engagements.length > 0 && engagements.every((e) => e.retired);
  const status = self ? "your own company's account"
    : marker ? `reference example (${marker})${allRetired ? ', retired' : ''}`
    : allRetired ? 'retired' : null;
  let standing = 'Not worked as a path: your own account';
  if (!self) {
    const steps = deriveSteps(research ? researchStatus(research) : null, walk ? walkStatus(walk) : null, pov ? povStatus(pov) : null);
    const n = steps.findIndex((s) => s.status === 'now') + 1;
    standing = `${n} of 6 · ${NOW_LABEL[n - 1]}`;
  }
  // The last thing recorded: the latest dated act these reads carry.
  const acts: { what: string; at: string }[] = [];
  for (const e of walk?.engagements ?? []) {
    for (const r of e.runs) if (r.locked_at) acts.push({ what: `Run ${r.run_number} locked`, at: r.locked_at });
    for (const o of e.outcomes) for (const ev of o.evidence) if (ev.citation_resolved_at) acts.push({ what: 'Citation opened', at: ev.citation_resolved_at });
  }
  for (const h of pov?.hypotheses ?? []) acts.push({ what: 'Hypothesis stated', at: h.created_at });
  for (const s of pov?.executive_summaries ?? []) acts.push({ what: 'Summary written', at: s.created_at });
  for (const m of pov?.reference_markers ?? []) acts.push({ what: 'Marked a reference example', at: m.marked_at });
  const last = acts.sort((a, b) => b.at.localeCompare(a.at))[0] ?? null;
  return { status, industry: view.institution.industry_name ?? (self ? 'Not classified: your own account' : 'Not classified'), standing, engagements, last };
}
