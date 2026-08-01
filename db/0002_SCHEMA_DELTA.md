# 0002 — Schema Delta

**AMENDMENT-005** (governed research) + **`value_runs`** (the structural gap from
`CAPABILITY_MAP.md`).

This is a **patch, not a file replacement** — per non-negotiable 9, adopted today after a
full-file overwrite silently reverted the `heartbeats.superseded_by_id` fix. Apply each
edit in place and diff before accepting.

Validated against drizzle-kit 0.31.10 / drizzle-orm 0.45.2. Generates 3 new CHECKs on
`evidence`, a 25-column `value_runs` with 7 FKs, and one new link from `record_documents`.

---

## Edit 1 — hoist the heartbeat enums

`healthState` is currently declared in the Heartbeat Registry section, **below** where
`value_runs` needs it. Without this, generate fails with
`ReferenceError: Cannot access 'healthState' before initialization`.

**Cut** this block from the Heartbeat Registry section:

```ts
/** Seven constitutional categories. HEARTBEAT-REGISTER §6. */
export const heartbeatCategory = pgEnum('heartbeat_category', [
  'operational', 'governance', 'integrity', 'financial',
  'learning', 'security', 'constitutional',
]);

/** HEARTBEAT-REGISTER §8 / COMPASS-HEARTBEAT-STATUS §8. */
export const healthState = pgEnum('health_state', [
  'healthy', 'watch', 'warning', 'critical', 'constitutional_failure',
]);
```

**Paste** it in the main enum block, immediately above `auditOperation`. All enums then
live together, which is where they should have been.

---

## Edit 2 — AMENDMENT-005 columns on `evidence`

**Find** the tail of the `evidence` column list:

```ts
  capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
  ...governance(),
}, (t) => [
```

**Replace with:**

```ts
  capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),

  /* ── AMENDMENT-005 · governed research ─────────────────────────── */
  /** Located by a model rather than a person. */
  aiSourced: boolean('ai_sourced').notNull().default(false),
  /** The query that produced it. Required when aiSourced. */
  researchQuery: text('research_query'),
  /** Which system, and when. Required when aiSourced. */
  researchTool: text('research_tool'),
  /**
   * A named human OPENED the cited source and confirmed it says what the
   * summary claims. Not that the URL resolves — that the content matches.
   * This is the only control that catches a fabricated citation.
   */
  citationResolved: boolean('citation_resolved').notNull().default(false),
  citationResolvedByPersonId: uuid('citation_resolved_by_person_id')
    .references(() => persons.id, { onDelete: 'restrict' }),
  citationResolvedAt: timestamp('citation_resolved_at', { withTimezone: true }),
  ...governance(),
}, (t) => [
  check('evidence_ai_requires_query',
    sql`${t.aiSourced} = false
        OR (${t.researchQuery} IS NOT NULL AND ${t.researchTool} IS NOT NULL)`),
  check('evidence_resolution_requires_human',
    sql`${t.citationResolved} = false
        OR (${t.citationResolvedByPersonId} IS NOT NULL AND ${t.citationResolvedAt} IS NOT NULL)`),
  /** AI-sourced evidence cannot self-certify. AMD-005 Article III. */
  check('evidence_ai_verify_requires_resolution',
    sql`${t.sourceVerified} = false OR ${t.aiSourced} = false OR ${t.citationResolved} = true`),
```

Everything already inside that config array stays, following these three.

---

## Edit 3 — add `value_runs`

**Insert immediately above** the `Record Document` section banner:

```ts
/* ================================================================== */
/* Value Run — the immutable snapshot                                 */
/* ================================================================== */

/**
 * A walk of the value spine, captured whole.
 *
 * Live objects (`value_outcomes`, `evidence`) mutate. A run does not — it is a
 * payload plus a hash, fixed at the moment it was walked.
 *
 * LOCKING declares a run authoritative: the one the institution would defend.
 * Unlocked runs are exploratory. RELOCKING is not an edit — it is a new run
 * that supersedes the prior one via `supersedesRunId`, so the superseded
 * version survives. History accumulates; it is never rewritten.
 *
 * `record_documents.value_run_id` ties a document to the run it rendered from,
 * and a document may not be `customer_shared` unless that run is locked. That
 * is the connection between locking and the disclosure gate.
 *
 * Five capabilities depend on this object: Lock/Relock, Value Runs, Executive
 * Outputs, Roadmap, Close Plans.
 */
export const valueRuns = pgTable('value_runs', {
  id: id(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'restrict' }),
  engagementId: uuid('engagement_id').notNull().references(() => engagements.id, { onDelete: 'restrict' }),
  /** Sequential within an engagement. */
  runNumber: integer('run_number').notNull(),

  terminalValueStage: valueStage('terminal_value_stage').notNull(),

  /** Snapshotted at walk time. Zero is a legitimate confidence score. */
  confidenceScore: numeric('confidence_score', { precision: 5, scale: 1 }).notNull(),
  confidenceBand: confidenceLevel('confidence_band').notNull(),
  institutionalHealth: numeric('institutional_health', { precision: 5, scale: 1 }),
  healthBand: healthState('health_band'),
  /** Share of dimension weight actually measured. Published with the score. */
  healthCoveragePct: integer('health_coverage_pct'),

  /** Locking declares the run authoritative. Immutability is trigger-enforced. */
  lockedAt: timestamp('locked_at', { withTimezone: true }),
  lockedByPersonId: uuid('locked_by_person_id').references(() => persons.id, { onDelete: 'restrict' }),
  lockReason: text('lock_reason'),
  /** Relock: this run supersedes an earlier locked one. */
  supersedesRunId: uuid('supersedes_run_id'),

  /** SHA-256 over payload. Makes the snapshot tamper-evident. */
  payloadHash: text('payload_hash').notNull(),
  payload: jsonb('payload').notNull(),

  walkedByPersonId: uuid('walked_by_person_id').notNull().references(() => persons.id, { onDelete: 'restrict' }),
  walkedAt: timestamp('walked_at', { withTimezone: true }).notNull().defaultNow(),
  ...governance(),
}, (t) => [
  foreignKey({ columns: [t.supersededById], foreignColumns: [t.id],
    name: 'value_runs_superseded_by_fk' }).onDelete('restrict'),
  foreignKey({ columns: [t.supersedesRunId], foreignColumns: [t.id],
    name: 'value_runs_supersedes_fk' }).onDelete('restrict'),
  unique('value_runs_engagement_number_key').on(t.engagementId, t.runNumber),
  /** A lock requires a named human and a stated reason. */
  check('value_runs_lock_is_complete',
    sql`${t.lockedAt} IS NULL
        OR (${t.lockedByPersonId} IS NOT NULL AND ${t.lockReason} IS NOT NULL)`),
  check('value_runs_confidence_range',
    sql`${t.confidenceScore} >= 0 AND ${t.confidenceScore} <= 100`),
  index('value_runs_engagement_idx').on(t.engagementId),
  index('value_runs_locked_idx').on(t.lockedAt),
]);
```

---

## Edit 4 — link `record_documents` to the run

**Find:**

```ts
  valueOutcomeId: uuid('value_outcome_id').notNull().references(() => valueOutcomes.id, { onDelete: 'restrict' }),

  documentVersion:
```

**Replace with:**

```ts
  valueOutcomeId: uuid('value_outcome_id').notNull().references(() => valueOutcomes.id, { onDelete: 'restrict' }),
  /**
   * The run this document rendered from. Nullable only for documents produced
   * before value_runs existed. The API must refuse `customer_shared` unless the
   * referenced run is locked — that rule spans tables and cannot be a CHECK.
   */
  valueRunId: uuid('value_run_id').references(() => valueRuns.id, { onDelete: 'restrict' }),

  documentVersion:
```

---

## Then generate

```
pg_dump -Fc lvrf > ~/Backups/lvrf/pre-0002.dump
npx drizzle-kit generate
cat db/drizzle/0002_*.sql
```

**Expect, and read before applying:**

- 6 `ADD COLUMN` on `evidence`, 3 `ADD CONSTRAINT ... CHECK`
- `CREATE TABLE "value_runs"` — 25 columns, 7 FKs, 2 self-referencing
- 1 `ADD COLUMN value_run_id` on `record_documents` plus its FK
- **No `DROP` of anything.** If a drop appears, stop.

---

## Two triggers, after the migration applies

Neither can be a CHECK — both span tables or need OLD/NEW. They belong in
`db/hardening.sql` alongside the delete guard, and take trigger count from **36 to 38**.

### 1. AI-sourced evidence may not support a measured actual

AMD-005 Article I, enforced.

```sql
CREATE OR REPLACE FUNCTION lvrf_block_ai_actual() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE ai boolean;
BEGIN
  IF NEW.supports <> 'actual' THEN RETURN NEW; END IF;
  SELECT e.ai_sourced INTO ai FROM evidence e WHERE e.id = NEW.evidence_id;
  IF ai THEN
    RAISE EXCEPTION
      'LVRF: AI-sourced evidence may not support a measured actual. '
      'AMENDMENT-005 Article I. The actual comes from the customer''s system of record.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS value_outcome_evidence_no_ai_actual ON value_outcome_evidence;
CREATE TRIGGER value_outcome_evidence_no_ai_actual
  BEFORE INSERT OR UPDATE ON value_outcome_evidence
  FOR EACH ROW EXECUTE FUNCTION lvrf_block_ai_actual();
```

### 2. A locked run is immutable

Locking has no meaning if the row can still be edited. Only `superseded_by_id` may change
after a lock — that is how a relock records that this run was replaced.

```sql
CREATE OR REPLACE FUNCTION lvrf_locked_run_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.locked_at IS NULL THEN RETURN NEW; END IF;
  IF to_jsonb(NEW) - 'superseded_by_id' - 'updated_at'
     IS DISTINCT FROM to_jsonb(OLD) - 'superseded_by_id' - 'updated_at' THEN
    RAISE EXCEPTION
      'LVRF: value_run % is locked and immutable. Relock by creating a new run '
      'that supersedes it — do not edit history.', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS value_runs_locked_immutable ON value_runs;
CREATE TRIGGER value_runs_locked_immutable
  BEFORE UPDATE ON value_runs
  FOR EACH ROW EXECUTE FUNCTION lvrf_locked_run_immutable();
```

---

## Rule the API must carry

`record_documents.disclosure = 'customer_shared'` requires the referenced `value_run` to be
locked. It spans tables, so it lives in the route — alongside the two already recorded:
separation of duties on `value_verifier`, and the actor-context transaction.

Three rules now live outside the schema. Each is in `BUILD_STATUS.md`; none may be removed
without an amendment.
