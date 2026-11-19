/**
 * S5 (LVRF_PLAN §24): the account frame's facts, for the account in focus.
 *
 * D4 as approved: no new route. The frame reads what the workspace and the Accounts home already read (/view, /walk,
 * /pov, /research), through the SAME derivations (deriveWalk, deriveSteps), so the frame and the workspace can never
 * state two different things about one account. One more existing read, GET /api/runs, gives "Runs (n)": /view's run
 * count leaves out a retired engagement's runs, which the Runs page lists (Curia on the prod copy: 1 against 22), so
 * the count is taken from the very list the Runs page filters, and the two always agree.
 *
 * ALL-OR-NOTHING, as the Accounts home's row: if any read fails, nothing is computed from the rest.
 * NO MONEY in the frame (the War Room's rule, design §4.3): nothing here reads or carries a figure in money.
 */
import { fetchInstitutionView } from '../api/institution';
import { fetchPov, type Pov } from '../api/pov';
import { fetchAccountResearch, type AccountResearchState } from '../api/accountResearch';
import { fetchRuns } from '../api/runsIndex';
import type { RunListItem } from '../types/runsIndex';
import { deriveSteps, deriveWalk, fetchWalk, povStatus, researchStatus, walkStatus, type WalkState } from './workspaceStatus';

/** The words a reference example carries in the frame, beside its name (approved mock-up, screen 7). */
export const FRAME_REFERENCE_LABEL = 'Reference example, not a customer engagement';

/** What the open step is, in the reader's words: "Step 4 of 6 next: the summary". */
const FRAME_NEXT = ['research', 'the outside-in walk', 'a hypothesis', 'the summary', 'a run, produced and locked', 'the point of view'] as const;

export interface FrameData {
  id: string;
  name: string;
  /** The tenant's own account (D5): not worked as the six-step path. */
  self: boolean;
  pack: { name: string; slug: string } | null;
  /** D6: "Classify as…" is offered only on an unclassified customer account that is not a reference example. */
  classifiable: boolean;
  reference: boolean;
  /**
   * The confidence the frame shows NAMES ITS RUN (Brad, 19 Nov 2026), so a page of an older run can never silently
   * disagree with the frame. It is the workspace's own headline: the latest locked run that is not a system exercise,
   * of the engagement the walk works (deriveWalk).
   */
  confidence: { run_id: string; run_number: number; score: string; band: string; erratum_line: string | null } | null;
  /** When there is no headline run, why, in words; never a 0. */
  no_confidence: string;
  standing: string;
  /** This account's runs, as the Runs page lists them. */
  runs: number;
}

export type FrameResult = { status: 'ok'; data: FrameData } | { status: 'not_found' } | { status: 'error' };

/** The tenant's own account (D5): where it stands, read from the walk as TenantChain reads it. */
export function tenantStanding(w: WalkState): string {
  const classified = Boolean(w.institution.industry_slug);
  const claims = w.capabilities.flatMap((c) => c.claims);
  const live = w.engagements.filter((e) => !e.retired);
  const outcomes = live.flatMap((e) => e.outcomes);
  const runs = live.flatMap((e) => e.runs);
  const open = runs.find((r) => !r.locked_at);
  const locked = [...runs].reverse().find((r) => r.locked_at);
  if (!classified) return 'Your own account · next: classify it to carry its own value case';
  if (claims.length === 0) return "Your own account · next: the capability's claim on a pack entry";
  if (outcomes.some((o) => !o.metric.industry_measure_id)) return "Your own account · next: the metric's pack basis";
  if (!outcomes.some((o) => o.current_hypotheses > 0)) return 'Your own account · next: a hypothesis';
  if (open) return `Your own account · next: lock run ${open.run_number}`;
  if (!locked) return 'Your own account · next: a run, produced and locked';
  return `Your own account · run ${locked.run_number} locked`;
}

export function frameFrom(view: { id: string; name: string; self: boolean; industry_id: string | null; industry_name: string | null; industry_slug: string | null },
  walk: WalkState, pov: Pov | null, research: AccountResearchState | null, allRuns: RunListItem[]): FrameData {
  const d = deriveWalk(walk);
  const runs = d.eng?.runs ?? [];
  // The workspace's headline, exactly (InstitutionPage's Workspace: the latest locked run with no system-exercise mark).
  const head = [...runs].reverse().find((r) => r.locked_at && !r.system_exercise) ?? null;
  const mine = allRuns.filter((r) => r.institution_id === view.id);
  const no_confidence = head ? ''
    : mine.length === 0 ? 'No run yet: no computed confidence'
    : runs.some((r) => r.locked_at) ? 'No headline run: every locked run is marked a system exercise'
    : 'No locked run yet: no computed confidence';
  let standing: string;
  if (view.self) standing = tenantStanding(walk);
  else {
    const steps = deriveSteps(research ? researchStatus(research) : null, walkStatus(walk), pov ? povStatus(pov) : null);
    const n = steps.findIndex((s) => s.status === 'now') + 1;
    standing = `Step ${n} of 6 next: ${FRAME_NEXT[n - 1]}`;
  }
  const reference = Boolean(pov?.reference_example);
  const pack = view.industry_name && view.industry_slug ? { name: view.industry_name, slug: view.industry_slug } : null;
  return {
    id: view.id, name: view.name, self: view.self, pack, reference,
    classifiable: !view.self && !reference && view.industry_id === null,
    confidence: head ? { run_id: head.id, run_number: head.run_number, score: head.confidence_score ?? '', band: head.confidence_band, erratum_line: head.erratum_line } : null,
    no_confidence, standing, runs: mine.length,
  };
}

export async function loadAccountFrame(id: string): Promise<FrameResult> {
  const v = await fetchInstitutionView(id).catch(() => null);
  if (v && v.status === 'not_found') return { status: 'not_found' };
  if (!v || v.status !== 'ok') return { status: 'error' };
  const inst = v.view.institution;
  const self = inst.is_tenant_self;
  const [walk, pov, research, runs] = await Promise.all([
    fetchWalk(id).catch(() => null),
    self ? Promise.resolve(null) : fetchPov(id).then((x) => (x.status === 'ok' ? x.pov : undefined), () => undefined),
    self ? Promise.resolve(null) : fetchAccountResearch(id).then((x) => (x.status === 'ok' ? x.research : undefined), () => undefined),
    fetchRuns().then((x) => (x.status === 'ok' ? x.runs : null), () => null),
  ]);
  if (!walk || pov === undefined || research === undefined || !runs) return { status: 'error' };
  return {
    status: 'ok',
    data: frameFrom({ id: inst.id, name: inst.name, self, industry_id: inst.industry_id, industry_name: inst.industry_name, industry_slug: inst.industry_slug },
      walk, pov, research, runs),
  };
}
