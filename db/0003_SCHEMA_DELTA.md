# 0003 — Run Attribution on Heartbeat Events

One nullable column, one deferred foreign key, one index. The point is not the column —
it is that **a walk becomes atomic.**

Patch document, not a replacement file.

---

## Step 0 — Verify the deferred constraint yourself. First.

I could not test this: no Postgres in the environment where the patch was written. The
behaviour below is asserted from knowledge, not observed, and this migration depends
entirely on it being true.

**Prove it before applying anything.** Both directions:

```sql
-- POSITIVE: child inserted before parent, same transaction, must SUCCEED
BEGIN;
CREATE TEMP TABLE t_parent (id uuid PRIMARY KEY);
CREATE TEMP TABLE t_child (
  id serial, parent_id uuid,
  CONSTRAINT t_fk FOREIGN KEY (parent_id) REFERENCES t_parent(id)
    DEFERRABLE INITIALLY DEFERRED);
INSERT INTO t_child (parent_id) VALUES ('11111111-1111-1111-1111-111111111111');
INSERT INTO t_parent (id)       VALUES ('11111111-1111-1111-1111-111111111111');
COMMIT;
```

```sql
-- NEGATIVE: parent never arrives, must FAIL at COMMIT
BEGIN;
CREATE TEMP TABLE t_parent2 (id uuid PRIMARY KEY);
CREATE TEMP TABLE t_child2 (
  id serial, parent_id uuid,
  CONSTRAINT t_fk2 FOREIGN KEY (parent_id) REFERENCES t_parent2(id)
    DEFERRABLE INITIALLY DEFERRED);
INSERT INTO t_child2 (parent_id) VALUES ('22222222-2222-2222-2222-222222222222');
COMMIT;
```

First must commit. Second must raise `insert or update on table "t_child2" violates
foreign key constraint` **at COMMIT, not at INSERT**.

If either behaves differently, stop and tell me — the design is wrong and the fallback is
a plain uuid with no constraint, which reopens the orphaned-relation class 0001 closed.

---

## Why this rather than back-filling

The apparent deadlock — events emitted *during* the walk, run created *after* — dissolves
once you separate the run's **identity** from the run's **row**. Generate the UUID at the
start of the walk, stamp every event with it, insert the row at the end using that id.
The row is still written last. Only the identifier is known earlier.

Decision 2 of the milestone spec is unchanged.

**The real gain is atomicity.** Today a walk that fails partway leaves heartbeat events
belonging to no run — orphans in an append-only table, therefore unremovable. One
transaction means the entire run persists with all its events, or none of it does.

That correctness improvement is the reason to do this. The column is how you get it.

---

## Step 1 — `db/schema.ts`

In `heartbeatEvents`, **immediately above** `eventType`:

```ts
  /**
   * The run this event belongs to. 0003.
   *
   * NO `.references()` here deliberately — the constraint is DEFERRABLE
   * INITIALLY DEFERRED, which Drizzle's column builder cannot express. It is
   * declared in `db/hardening.sql` as raw SQL. Do not "fix" this by adding a
   * reference; that would create a second, non-deferred constraint and break
   * the atomic walk.
   *
   * Nullable: events predating runs, and events outside a walk (HB-0001
   * system init, HB-0002 authentication), legitimately have none.
   */
  valueRunId: uuid('value_run_id'),

```

And in the config array, after `heartbeat_registered_idx`:

```ts
  index('heartbeat_run_idx').on(t.valueRunId),
```

Verified: generates a plain `uuid` column and the index, **no foreign key** — the table
stays at 5 FKs. That is correct; the sixth is added below.

---

## Step 2 — `db/hardening.sql`

Append, before the verification queries:

```sql
-- ------------------------------------------------------------------
-- 0003 · run attribution, deferred
-- ------------------------------------------------------------------
-- DEFERRABLE INITIALLY DEFERRED so a walk can emit events referencing a run
-- that is inserted at the end of the same transaction. Checked at COMMIT.
--
-- Drizzle cannot express DEFERRABLE, so `schema.ts` declares the column
-- without a reference and the constraint lives here. Adding `.references()`
-- there would create a second, non-deferred constraint and break atomicity.

ALTER TABLE heartbeat_events DROP CONSTRAINT IF EXISTS heartbeat_events_value_run_fk;
ALTER TABLE heartbeat_events
  ADD CONSTRAINT heartbeat_events_value_run_fk
  FOREIGN KEY (value_run_id) REFERENCES value_runs(id)
  ON DELETE RESTRICT
  DEFERRABLE INITIALLY DEFERRED;
```

Existing rows keep `NULL` — they predate runs, which is accurate rather than a gap.

---

## Step 3 — `server/spine/walkSpine.ts`

Three changes:

1. **Generate the run UUID before the walk begins.** `crypto.randomUUID()`.
2. **Wrap the entire walk in one transaction**, with `SET LOCAL lvrf.actor_person_id`
   set once at the top as `actorContext.ts` does.
3. **Stamp every `heartbeat_events` insert** with that `value_run_id`, and insert the
   `value_runs` row at the end using it as the primary key.

Nothing else about the walk changes.

**Do not `SET CONSTRAINTS ALL IMMEDIATE`** anywhere in the transaction. That would force
the check early and defeat the mechanism.

---

## Step 4 — Verify

```
pg_dump -Fc lvrf > ~/Backups/lvrf/pre-0003-$(date +%H%M).dump
npx drizzle-kit generate
cat db/drizzle/0003_*.sql        # expect: 1 ADD COLUMN, 1 CREATE INDEX, no FK
npx drizzle-kit migrate
psql -d lvrf -f db/hardening.sql
```

Then:

```sql
-- 39 distinct triggers unchanged; the new constraint is an FK, not a trigger
SELECT count(DISTINCT trigger_name) FROM information_schema.triggers
WHERE trigger_schema='public';                     -- expect 38

-- the constraint exists and is deferred
SELECT conname, condeferrable, condeferred FROM pg_constraint
WHERE conname = 'heartbeat_events_value_run_fk';   -- expect t | t

-- a bogus run id must be rejected AT COMMIT
BEGIN;
INSERT INTO heartbeat_events (heartbeat_id, tenant_id, value_run_id, event_type,
  producer, severity, health_state, constitutional_authority, content_hash,
  subject_table, subject_id)
SELECT 'HB-0004', t.id, gen_random_uuid(), 'x', 'x', 0, 'healthy', 'x', 'x', 'x', 'x'
FROM tenants t LIMIT 1;
COMMIT;   -- must FAIL here, not at the INSERT
```

That last test is the one that matters. If the INSERT fails instead of the COMMIT, the
constraint is not deferred and the walk will not be atomic.

---

## Definition of done

- [ ] Step 0 verified — deferred behaviour observed, both directions
- [ ] `heartbeat_events` has `value_run_id`, nullable, indexed
- [ ] `heartbeat_events_value_run_fk` exists, `condeferrable` and `condeferred` both true
- [ ] A bogus run id fails at COMMIT, not at INSERT
- [ ] A walk emits events and inserts its run in one transaction; all events carry the id
- [ ] **A deliberately failed walk leaves zero heartbeat events** — test by raising
      partway through and confirming the ledger is unchanged
- [ ] Historical events retain `NULL` and are untouched

The sixth is the point of the migration. Everything else is plumbing.
