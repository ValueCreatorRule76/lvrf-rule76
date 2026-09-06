// Shape of GET /api/runs — one row per value_run, snake_case, exactly the
// columns that route selects. Not the same shape as Run (GET /api/runs/:id,
// SELECT *, payload included) — this is the join-projected list row.

export interface RunListItem {
  id: string;
  /** null if the owning engagement or institution has since been retired — the run itself still shows. */
  institution_id: string | null;
  institution_name: string | null;
  run_number: number;
  terminal_value_stage: string;
  confidence_score: string;
  confidence_band: string;
  institutional_health: string | null;
  health_band: string | null;
  health_coverage_pct: number | null;
  source_fixture: string | null;
  locked_at: string | null;
  walked_at: string;
}
