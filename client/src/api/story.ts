/** S7b (3.1; LVRF_PLAN §27): the story of record, as server/lib/story.ts composes it. Types only. */
export type StoryStage = 'reference' | 'decision' | 'realization' | 'compounding';
export type StoryAudience = 'internal' | 'client';

export interface StoryErratum { id: string; kind: string; line: string; recorded_on: string; group: string }
export interface StoryRun {
  id: string; run_number: number; locked_on: string; score: number; band: string; payload_hash: string;
  realization: string | null; errata: StoryErratum[];
}
export interface StoryEngagement {
  id: string; name: string; retired: boolean; runs: StoryRun[]; latest_run_id: string;
  metric: { name: string; unit: string | null; baseline: number | null };
  commitment: { target: number; committer: string | null; committer_customer_side: boolean | null; measured_by: string | null;
                attribution: { method: string | null; class: string | null } | null } | null;
  result: { run_id: string; actual: number; realization: string } | null;
  asks: { code: string; need: string; question: string }[];
}
export interface StoryFinding { id: string; outcome_id: string; field: string; value: string; line: string; recorded_on: string }
export interface StoryPublished {
  id: string; kind: string; class: string; class_label: string; can: string; cannot: string; basis: string;
  form: string; quote: string | null; locator: unknown; how_read: string | null; summary: string; source_reference: string | null;
  open_state: 'verified' | 'not_supported' | 'unopened';
}
export interface LedgerEntry { n: number; figure: string; source: string; ids: string[]; full_hash?: string }
export interface StoryPayload {
  storyVersion: number; audience: StoryAudience; stage: StoryStage;
  account: { id: string; name: string }; prepared_by: string;
  marker: { kind: string; note: string | null } | null;
  title: string; subtitle: string | null;
  banners: { outside_in: boolean; unverified: boolean };
  engagements: StoryEngagement[];
  headline: { engagement_id: string; run_id: string }[];
  findings: StoryFinding[];
  published: StoryPublished[];
  evidence_heads: string[];
  ledger: LedgerEntry[];
  refs: Record<string, number>;
}
export interface IssuedStory {
  id: string; institution_id: string; audience: StoryAudience; stage: StoryStage; payload_hash: string;
  issued_at: string; issued_by: string;
  withdrawn: { at: string; by: string | null; reason: string | null } | null;
  newer_evidence: { ids: string[]; note: string } | null;
  payload: StoryPayload;
}
export interface StoryListItem {
  id: string; audience: StoryAudience; stage: StoryStage; payload_hash: string; issued_at: string; issued_by: string;
  withdrawn_at: string | null; withdrawn_by: string | null; withdrawal_reason: string | null;
}
