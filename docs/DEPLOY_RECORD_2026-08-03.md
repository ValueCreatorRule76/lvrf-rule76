# LVRF Production Deploy Record — srv1862778

**Document ID:** R76-LVRF-DEP-001 *(suggested; change to match register convention)*
**Status:** Deployment complete and fully verified. All checklist items closed.
**Sessions:** 2026-08-03 02:16–05:30 UTC, 12:55–13:06 UTC, 13:30–14:10 UTC
**Host:** `srv1862778` · Ubuntu 24.04 · `72.60.69.221`
**Deploy root:** `/srv/lvrf` (read-only GitHub deploy key, no write access)
**Repo commit at deploy:** `cfe7f7d`
**Domain:** `lvrf-rule76.com`, `www.lvrf-rule76.com`

Related proposal artifact filing: `R76-LVRF-PROP-001` in `docs/proposals/` (HTML + PDF, Proposed).

Every value below was measured, not inferred. Where a number differs from the
runbook, the runbook is wrong and the reason is recorded.

---

## 1. Verified deployed state

| Component | Version / value | How verified |
|---|---|---|
| PostgreSQL | 16.14 (Ubuntu 16.14-0ubuntu0.24.04.1) | `psql` banner on connect |
| Caddy | 2.11.4 | `caddy version` |
| Node | `/usr/bin/node` | `command -v node` |
| Migrations on disk | 10 | `ls db/drizzle/*.sql \| wc -l` |
| Migrations applied | 10 | `SELECT count(*) FROM drizzle.__drizzle_migrations` |
| Distinct triggers | **41** | `count(DISTINCT trigger_name)`, `information_schema.triggers` |
| Heartbeat register | **18**, all seven categories | `SELECT count(*) FROM heartbeats` |
| Deferred FK | `heartbeat_events_value_run_fk` → `t \| t` | `pg_constraint` |
| `audit_log` | **36** after customer zero | `SELECT count(*) FROM audit_log` |
| `value_runs` | **1** | run 1, `customer_zero` |
| Customer zero run | **30.0 / low / 88.3 / watch** | matches local exactly |

### Trigger count: 41, not 38

The completion checklist said 38. **38 is a stale acceptance value.** It was
measured on local at migration 0003, before the Skillsoft catalog migrations
(0005–0008) added `capabilities` and `offerings`, each carrying the full
governance triad.

41 derives cleanly: 13 tables × (`_audit`, `_no_delete`, `_touch`) = 39, plus
`value_runs_locked_immutable` and `value_outcome_evidence_no_ai_actual` = 41.

`information_schema.triggers` returns **55 rows** for these 41 triggers because
`_audit` fires on both INSERT and UPDATE. Count `DISTINCT trigger_name`, not rows.

### Apply order — load-bearing

```
npx drizzle-kit migrate
sudo -u postgres psql -d lvrf -v ON_ERROR_STOP=1 -f - < db/seed_heartbeat_register.sql
sudo -u postgres psql -d lvrf -v ON_ERROR_STOP=1 -f - < db/hardening.sql
```

The register seeds **before** hardening so the audit trigger does not record the
register's own founding as eighteen mutations. Verified: `audit_log` was `0`
immediately after the seed and before hardening.

Two mechanical notes:

- `-f - <` rather than `-f path`. The redirect is performed by the invoking shell
  as `brad`, so `postgres` only ever sees SQL on stdin. Removes file permissions
  from the equation entirely.
- `ON_ERROR_STOP=1` is not optional. Without it `psql` runs past a failed
  statement and exits `0`, producing a partially seeded register that reports
  success.

### Privilege model after hardening

`lvrf_app` holds `INSERT`, `SELECT`, `REFERENCES`, `TRIGGER` on `audit_log` and
`heartbeat_events`. No `UPDATE`, no `DELETE`. Append-only enforced at the
privilege layer, not only by trigger.

`hardening.sql` was applied as `postgres`, so the functions and triggers it
creates are owned by `postgres`. This is the desirable outcome: the application
role cannot drop its own audit triggers.

---

## 2. Enforcement verification

All four run as `lvrf_app`, never as `postgres` — superuser fires triggers but
bypasses privilege checks, so testing as `postgres` proves less than it appears to.

| Attempt | Rejected by | Mechanism |
|---|---|---|
| `DELETE FROM heartbeats` | `lvrf_block_delete()` | trigger |
| `INSERT INTO persons` (unscoped) | `persons_scoped_to_exactly_one` | CHECK constraint |
| `INSERT heartbeat_events` (`HB-9999`) | `heartbeat_events_heartbeat_id_heartbeats_id_fk` | FK, immediate |
| Spine walk → verified outcome | `value_outcomes_verified_requires_human` | CHECK constraint |

Three observations worth carrying forward:

**The `heartbeats` DELETE was stopped by the trigger, not a missing grant.**
`lvrf_app` *has* DELETE privilege and the trigger refuses. The rule lives in the
database, not in a grant a later migration could widen unnoticed. Error text:
`LVRF: heartbeats is a governed object; hard DELETE is prohibited. Set deleted_at instead.`

**`persons_scoped_to_exactly_one` is declarative, not a trigger.** So
`SET session_replication_role = replica` will not get around it. Structurally
stronger than the other two.

**`value_outcomes_verified_requires_human` refused a real write.** The spine
walked itself to `MEASURED` and then hit the wall. An automated process cannot
mark an outcome verified — not as policy in a document, as a CHECK constraint in
a production database. This is the governing principle made structural.

Test `DELETE` inside an explicit transaction:

```sql
BEGIN; DELETE FROM heartbeats; ROLLBACK;
```

If the trigger fires, the rollback is a no-op. If it does not, the rollback is
the only thing between you and an empty register.

---

## 3. DEFECT-001 — closed in production

Original defect: audit rows written outside the transaction that produced them,
so a rejected write leaves a record claiming it happened.

Closed by two queries. Both generalize; keep them.

### Sequence-gap test

Sequences do not roll back. If the audit trigger fired before a CHECK rejected
the write, the audit row would vanish with the subtransaction but would have
consumed an id — leaving a hole.

```sql
SELECT count(*) AS rows, min(id) AS lo, max(id) AS hi,
       max(id)-min(id)+1 AS span
FROM audit_log;
```

Result: `36 | 1 | 36 | 36`. **`span = rows`** — no audit row was ever created for
the rejected verify. The CHECK fired first; the trigger never ran.

### Final-state agreement

```sql
SELECT (SELECT new_row FROM audit_log
        WHERE table_name='value_outcomes'
        ORDER BY id DESC LIMIT 1) = to_jsonb(vo) AS final_matches_live
FROM value_outcomes vo;
```

Result: `t`. The ledger's last word about that outcome is the truth about that
outcome. DEFECT-001 stated as a property rather than a count.

### Timestamp caveat

All six `value_outcomes` audit rows carry an identical `at`. `now()` returns
transaction start, so every row from a single spine walk shares a timestamp.
**`id` is the only intra-transaction ordering; `audit_at_idx` will not sequence a
run.** Defensible for an audit ledger, but the first person to reconstruct a walk
from `at` will get the order wrong.

---

## 4. DEFECT-003 — unaudited, undeletable-guarded tables

**Severity: high. Fix: additive, via `db/hardening.sql` — no migration number. Not urgent — no real data yet.**

Cross the spine walk's write counts against the `audit_log` breakdown:

| Table | Rows written | Audit rows | Defensible? |
|---|---|---|---|
| `heartbeat_events` | 10 | 0 | **Yes** — append-only by grant, self-evidencing |
| `value_runs` | 1 | 0 | **Conditionally** — see amendment below |
| `value_outcome_evidence` | 4 | 0 | **No** |
| `record_documents` | 1 | 0 | **No** |

### Amendment 2026-08-03 — `value_runs` is unaudited while unlocked

The original justification for `value_runs` having no `_audit` was that
`value_runs_locked_immutable` protects it. **That trigger only bites once a run is
locked.** The live API response for run 1 returns:

```json
"locked_at": null, "locked_by_person_id": null, "lock_reason": null
```

So an unlocked run is currently **mutable and unaudited**. `confidence_score`,
`institutional_health`, `health_band`, and `terminal_value_stage` can all be
changed with no trace. The number a CFO is shown is alterable until lock, and
nothing records that it changed.

Reclassified from "defensible" to **conditionally defensible: unaudited while
unlocked**. Folded into the `hardening.sql` amendment scope (see §16).

Absence from the `GROUP BY table_name, operation` breakdown is the proof — no
inference from the trigger listing required.

`value_outcome_evidence` is the junction tying an outcome to its supporting
evidence. `record_documents` is the artifact a CFO reads. Neither has
`_no_delete` nor `_audit`. So `lvrf_app` can hard-delete the link between a value
outcome and its proof, the outcome survives looking exactly as verified as
before, and no audit row records it — because there is no trigger to write one.

That is the one guarantee LVRF exists to make.

### Closure 2026-08-03 (local only — not yet applied to production)

**Closed:** `value_runs` now carries the full triad (`_audit`, `_touch`,
`_no_delete`). `record_documents` now carries `_audit` and a delete guard with
its own remedy text (it has no `deleted_at`; its retirement mechanism is
`document_version`, not soft-delete). See §16 for the mechanism and verification.

**Still open:** `value_outcome_evidence`, plus three tables outside the
original DEFECT-003 scope — `offering_capabilities`, `person_roles`,
`reflection_evidence`. All four are composite-key junction tables with no
`id` column. `lvrf_audit()` writes `NEW.id::text` into `audit_log.record_id`,
which is `NOT NULL` — unlike the `deleted_at` dependency this work uncovered
(fixed via `jsonb_exists`, see §16), there is no safe degradation here:
something must go in `record_id` for a composite-key row, and what that
should be is an undecided design question, not a defect with an obvious fix.
Not closed by this change.

---

## 5. DEFECT-004 — backup script leaves indistinguishable partial dumps

`/usr/local/bin/lvrf-backup.sh` redirects with `>`, which creates the target file
before `pg_dump` writes to it. A dump that dies partway — disk full, connection
dropped — exits non-zero *and* leaves a truncated `.dump` with a perfectly normal
name. Fourteen days later it is indistinguishable from a good one.

Fix: dump to `.partial`, rename on success.

```bash
sudo -u postgres pg_dump -Fc lvrf > /var/backups/lvrf/lvrf-$STAMP.dump.partial
mv /var/backups/lvrf/lvrf-$STAMP.dump.partial /var/backups/lvrf/lvrf-$STAMP.dump
```

**What the script gets right** (better than assumed before reading it):
`set -euo pipefail` so failure exits non-zero; prunes at `-mtime +14`. And
because `set -e` aborts before the `find`, a failed dump leaves old backups
*unpruned* — failure degrades toward keeping too much rather than deleting the
last good copy. Correct direction.

`umask 077` was added after `set -euo pipefail` on 2026-08-03 so new dumps are
created `600` rather than inheriting root's `022`. Verified by a subsequent run.

---

## 6. DEFECT-002 — closed, confidence computes from the database

Original defect: confidence computed from the fixture rather than the database,
which would mean a matching `30.0` proved only that the fixture travelled intact.

**Closed by arithmetic visible in the rendered workbench.** The confidence panel
itemises six weighted factors with per-factor evidence counts:

| Factor | Score | Items cited |
|---|---|---|
| Baseline supported by source-verified evidence | 25/25 | 1 independent, 0 attested |
| Impact basis stated and evidenced | 5/10 | self-declared, half credit |
| Metric's calculation method known | 0/20 | not disclosed by source |
| Measured actual source-verified | 0/25 | 2 items, 0 independent |
| Named human sponsor of record | 0/10 | synthetic ([SIM]) |
| Named human verifier of record | 0/10 | synthetic ([SIM]) |

Sums to **30/100** — earned 30, outstanding 70 — matching `confidence_score` in
both the database and the API response.

The item counts (1 + 1 + 2) total **4**, which is exactly the `evidence 4` the
spine walk wrote. Confidence is derived from the evidence ledger in the database,
not from the fixture. DEFECT-002 closed.

---

## 7. DEFECT-005 — no index route, blank front door

**Severity: low. Client-side.**

The production bundle contains exactly one network call:

```
fetch(`/api/runs/${e}`)
```

There is no listing call — no `/api/engagements`, no `/api/runs` without an
argument. So `/` has nothing to fetch and the router renders null. React mounts
correctly; there is simply no index route.

Presents as a blank white page at the domain root, which is the first thing any
visitor sees. The server already exposes `/api/engagements` and it returns
Customer Zero correctly, so the endpoint exists and the client does not consume
it.

Diagnostic worth keeping — enumerate every API path the bundle actually calls:

```
grep -oE '.{0,25}/api.{0,45}' /srv/lvrf/client/dist/assets/index-*.js | sort -u
```

## 8. DEFECT-006 — `try_files` masks missing assets as 200 text/html

**Severity: medium. Diagnostic hazard rather than a functional fault.**

```
try_files {path} /index.html
```

A request for an asset that does not exist on disk falls back to `index.html` and
returns **`200` with `content-type: text/html`**. Verified directly: a request for
a deliberately fake filename returned 200 and HTML.

Consequences: no 404 ever surfaces for a static path, and a broken asset reference
presents as a blank page with a clean HTTP transcript. Chrome refuses to execute
HTML as a module and logs only a MIME type error in the console.

**Diagnostic rule.** When the page is blank, check `content-type` on the asset,
not the status code:

```
curl -u brad -sI https://lvrf-rule76.com/assets/index-HASH.js | grep content-type
```

`text/javascript` is correct. `text/html` means the file is missing or unreadable.

Fix if wanted: scope the fallback so `/assets/*` 404s honestly, e.g. a
`handle /assets/*` block with `file_server` and no `try_files`.

---

## 9. Open hardening items

**`User=brad` in `lvrf-api.service`.** The API runs as the account that owns
`/srv/lvrf` and holds the deploy key. A compromised Node process can rewrite the
code it is running from. Correct shape is a dedicated `lvrf` service user with
read-only access to the tree — an ownership change across the whole deploy.

**Rotate the Caddy bcrypt hash.** The hash was pasted into a chat transcript
during troubleshooting. Cost 14, so offline cracking is expensive and this is not
urgent — but that gate is what will stand in front of Skillsoft data. One
`caddy hash-password` and a one-line edit.

**No offsite backup.** `/var/backups` is on `/dev/sda1`, the same volume as the
database. This covers a bad migration or a wrong `DELETE`. It does not cover
losing the VPS. Hostinger snapshots or an `rclone` push. Decide before Skillsoft
data exists, not after.

**Northgate — condition satisfied, decision open.** The gating condition was
whether the workbench renders `run.payload.note` as a composite disclosure banner.
**It does.** Verified in Chrome at
`/runs/88f6a6e1-d99b-4cee-a4a6-ea954361de71`: a full-bleed banner above the record
frame reading *SIMULATION — MECHANISM DEMONSTRATION*, naming which stages are
sourced from Skillsoft public filings and which are simulated, and closing on
*"No real person is represented as having committed to or verified anything."*

So `customer_b` may ship if multi-tenancy is worth demonstrating. The disclosure
path is proven, not assumed. Remains a judgement call, no longer a blocker.

---

## 10. Verified properties

Things now known to be true, each with the query that established it.

**Restore does not double the audit ledger.** `pg_dump` places triggers in the
post-data section, so a full restore loads rows before the audit triggers exist —
structurally the same ordering that let the register seed precede hardening.
Verified: restored copy returned `audit_log = 36`, not 72.

**Restored triggers are enabled, not merely present.**

```sql
SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgenabled <> 'O';
```

Result `0` in the restored copy. Counting 41 triggers proves they exist;
`tgenabled` proves they fire. `pg_restore` can leave triggers disabled under some
paths, and a restored database that looks governed while silently accepting hard
deletes is the worst version of this failure.

**Restore verified end to end.** `pg_restore` into `lvrf_restore_test`, then
**18 · 36 · 1 · 41** against heartbeats, audit_log, value_runs, and distinct
triggers. Scratch database dropped after.

**Cron is real and firing.** `/etc/cron.d/lvrf-backup` — `0 3 * * * root` — with
the user field present, which is what `cron.d` entries get wrong. `journalctl`
confirms execution 03:00:01 on Aug 1, 2, 3.

**Backup permissions.** Directory `700`, all dumps `600`. The directory mode is
the durable layer; `umask 077` in the script covers new files.

---

## 11. Incident — unauthenticated proxy window

**2026-08-03, approx. 04:59:55 → 05:15 UTC (~15 minutes).**

The Caddyfile carried over from the original provisioning reverse-proxied **root**
to `127.0.0.1:3001` with no `basic_auth`:

```
lvrf-rule76.com, www.lvrf-rule76.com {
    encode gzip
    reverse_proxy 127.0.0.1:3001
}
```

Nothing listened on 3001, so it returned 502 and was harmless. When
`systemctl enable --now lvrf-api` brought the API up at 04:59:55,
`https://lvrf-rule76.com` became a public unauthenticated proxy to every LVRF API
route.

**Blast radius:** UFW allowed only 22, 80, 443 — port 3001 was never directly
reachable, so exposure was solely through Caddy. All data was simulated and
labelled `skillsoft.example`. **Not a disclosure incident.**

**Root cause:** the deploy runbook wrote the Caddyfile in Phase 7 and verified
auth in Phase 8, but brought the API up in Phase 6. The window is structural to
that ordering, not an execution error.

**Runbook correction:** the API must start *after* Caddy has auth in place.
Reload Caddy, then start `lvrf-api`. Never the reverse.

**Also:** back up the existing Caddyfile before `sudo tee` overwrites it. The
original config was read before replacement in this deploy, which is how the
exposure was found.

---

## 12. Reusable verification queries

The two worth keeping above all others are the sequence-gap test (§3) and the
`tgenabled` check (§10). Neither is obvious enough to re-derive under pressure.

**The sequence-gap test is one-shot per database, not general-purpose.**
`audit_log`'s id sequence is not transactional — a successful write that is
later rolled back still permanently consumes its id (`CACHE 1`, confirmed
2026-08-03). The first time any session does a write-then-rollback against an
audited table, `span` and `rows` diverge permanently on that database, and the
test can never pass there again. It remains valid on production **today**,
because production has no history of rolled-back audited writes yet — but the
production hardening apply must run this query **before** any audit-fires
test, not after, or the apply's own verification burns it. It is already
unavailable on the local development database, burned during this session's
own Phase 3 testing.

```sql
-- Audit ledger integrity: span must equal rows
-- ONE-SHOT PER DATABASE — ceases to hold after the first rolled-back write to
-- an audited table. Do not treat a failure here as a defect without first
-- checking for prior rolled-back audited writes on this database.
SELECT count(*) AS rows, min(id) AS lo, max(id) AS hi,
       max(id)-min(id)+1 AS span FROM audit_log;

-- Restored/live triggers actually fire (expect 0)
SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgenabled <> 'O';

-- Ledger's last word matches live state (expect t)
SELECT (SELECT new_row FROM audit_log WHERE table_name='value_outcomes'
        ORDER BY id DESC LIMIT 1) = to_jsonb(vo) AS final_matches_live
FROM value_outcomes vo;

-- Which tables are actually audited
SELECT table_name, operation, count(*) FROM audit_log
GROUP BY 1,2 ORDER BY 1,2;

-- Distinct trigger count (not row count)
SELECT count(DISTINCT trigger_name) FROM information_schema.triggers
WHERE trigger_schema='public';

-- Migrations on disk vs applied
-- shell: ls db/drizzle/*.sql | wc -l
SELECT count(*) FROM drizzle.__drizzle_migrations;
```

---

## 13. Runbook corrections

| Runbook said | Actual | Note |
|---|---|---|
| 38 triggers | **41** | 38 predates catalog migrations 0005–0008 |
| `psql -d lvrf -f db/…` | `sudo -u postgres psql … -f - < db/…` | file perms and role |
| Phase 6 API, Phase 7 Caddy | **Caddy first, then API** | see §11 |
| "nightly already covers this database" | **False at the time** | see below |
| `-f` without `ON_ERROR_STOP` | always `-v ON_ERROR_STOP=1` | silent partial apply |

**On the backup reassurance.** During the first session the nightly `pg_dump` was
described as already covering this database, making the manual post-deploy dump a
convenience rather than missing protection. That was wrong. The cron was running,
but on an empty database — dumps were 3.7K on Jul 28 through Aug 2, jumping to
251K only at 03:00 on Aug 3 when the schema landed. The register seeded at ~04:37
and customer zero at 04:41:31, both **after** the most recent dump. The deploy
went overnight with no backup containing it. Nothing was lost; the reassurance
was unearned. Take the manual dump before sleeping, not after.

---

## 14. Workbench verification — closed

Verified in Chrome at
`https://lvrf-rule76.com/runs/88f6a6e1-d99b-4cee-a4a6-ea954361de71`.

**`try_files` proven by the stronger test.** A cold address-bar GET for a path with
no file on disk. Caddy fell back to `index.html`, React booted, the router read the
path and fetched `/api/runs/:id`. That is the same mechanism a refresh uses, so
deep links into a run resolve — including one sent to a customer.

**The workbench reads production, not a fixture.** Rendered values cross-check the
API response and the database exactly:

| Field | Workbench | API / DB |
|---|---|---|
| Computed confidence | 30 /100, LOW | `"30.0"` / `low` |
| Institutional health | — | `"88.3"` / `watch` |
| Run | RUN 1 | `run_number: 1` |
| Terminal stage | VERIFY — refused, gate held | `"return"` |
| Evidence ledger | 2 of 4 verified | `evidence` = 4 rows |
| Baseline / target / measured | 98% / 100% / 100.4% (+2.4) | — |

**The constraint is cited in the UI, not merely enforced.** The refusal panel reads
*VERIFICATION REFUSED — RECORD IS INTERNAL* and names
`value_outcomes_verified_requires_human` explicitly, stating it will reject any
attempt to force the outcome. `Share with customer` is disabled. The same gate that
stopped the spine walk holds at three layers: database CHECK constraint, API, and
button state.

That is the difference between a governed platform and a platform that claims
governance. The mechanism is visible to the person using it.

## 15. Completion checklist — final

- [x] Cloned to `/srv/lvrf` with a read-only deploy key
- [x] `.env` at `600`, real credentials, never committed
- [x] 18 heartbeats · **41** triggers · deferred FK `t|t`
- [x] Customer zero seeded — run 1, **30.0 / low / 88.3 / watch**
- [x] Northgate condition satisfied — disclosure banner renders; ship decision open
- [x] `lvrf-api` enabled, survives `systemctl restart`
- [x] **401 without credentials on `/` and `/api/*`**, 200 with
- [x] Workbench loads a real run; deep link on `/runs/:id` resolves
- [x] Post-deploy backup taken **and restore-verified**

**Deployment closed.** Open items are DEFECT-003 through DEFECT-006 plus the four
hardening items in §9 — none blocking.

---

## 16. hardening.sql amendment — value_runs and record_documents governance

This closed via `db/hardening.sql`, not a Drizzle migration. No migration
number, no `_journal.json` entry — every trigger in this database has always
come from `hardening.sql` applied by hand (confirmed: no migration file
contains `CREATE TRIGGER`). `0009` is the evidence-attestation migration
(`attested_by_person_id`/`attested_at` on `evidence`) and is unrelated to this
work. `0010` was never created — this scope needed no Drizzle migration at
all. The section title below was "Migration 0009 scope"; that framing was
wrong on both counts — wrong migration number and the wrong kind of change.

Derived from §4 and its amendment. Additive only; no data migration.

| Table | Got | Reason |
|---|---|---|
| `value_runs` | `_audit`, `_touch`, `_no_delete` (full triad) | mutable and unaudited until `locked_at` is set; has `id`/`updated_at`/`deleted_at` |
| `record_documents` | `_audit`, `_no_delete` (table-specific remedy) | the artifact a CFO reads, unguarded; has `id` but no `updated_at`/`deleted_at` — retires by `document_version`, not soft-delete |

`value_outcome_evidence` — proposed for the same triad in the original scope —
is deferred, not closed. See §4.

Trigger arithmetic:

```text
value_runs:       _audit (2 rows: INSERT, UPDATE) + _touch (1: UPDATE)
                  + _no_delete (1: DELETE)                = 3 distinct, 4 rows
record_documents: _audit (2 rows: INSERT, UPDATE)
                  + _no_delete (1: DELETE)                 = 2 distinct, 3 rows
                                                    Total:   5 distinct, 7 rows

41 -> 46 distinct triggers
55 -> 62 rows in information_schema.triggers
```

Verified locally (**not yet applied to production**):

- Distinct trigger count moved from **41** to **46** (5 new), exactly
- `information_schema.triggers` row count moved from **55** to **62** (7 new), exactly
- `hardening.sql` applied twice with identical results — empirically
  idempotent, not idempotent by inspection alone. Its header no longer claims
  "Run ONCE."
- `lvrf_block_delete()` now takes an optional `TG_ARGV[0]` remedy string.
  Every trigger created before this change passes zero arguments and is
  provably unaffected — `TG_NARGS > 0` is unreachable for them, confirmed by
  a byte-identical error message on `heartbeats` before and after.
- `record_documents` DELETE now shows a table-specific remedy ("...supersede
  by rendering a new document_version") instead of the generic "Set
  deleted_at instead," which would have been false — this table has no
  `deleted_at` and, per its own versioning scheme, never will.
- A `DELETE` attempt on `value_runs` and `record_documents` as `lvrf_app` is refused
- `audit_log` breakdown shows both tables on write
- Locking checked directly, not assumed safe by trigger-name ordering:
  locking a `value_runs` row still succeeds; a second edit to the now-locked
  row is still rejected by `locked_immutable`; the rejected edit adds nothing
  to `audit_log`
- Sequence-gap test (§12) **not** re-run as part of this verification — see
  §12's correction. It had already been burned by this same verification
  process's own rolled-back writes before this change was even applied.

### Lesson — a column check on the trigger's NAME isn't a column check on its BODY

Phase 0 checked whether `value_runs`, `value_outcome_evidence`, and
`record_documents` had `id`/`updated_at`/`deleted_at` — the columns `_audit`,
`_touch`, and `_no_delete` sound like they need, going by name. That check
missed that `lvrf_audit()`'s UPDATE branch also hard-referenced
`OLD.deleted_at`/`NEW.deleted_at` directly, independent of what the trigger's
name implies. Attaching it to `record_documents` (no `deleted_at`) compiled
cleanly and then failed every UPDATE at runtime — caught only because Phase 3
actually ran an UPDATE against it, not by the Phase 0 column audit.

Fixed by rewriting the classification with `jsonb_exists()` so it degrades to
`'update'` when `deleted_at` is absent, instead of erroring.

**General rule for next time:** before attaching a trigger function to a new
table, enumerate every `OLD.`/`NEW.` field reference in the function body —
not just the columns implied by the trigger's name or by convention. A column
check scoped to "what the pattern usually needs" is not the same as a column
check scoped to "what this specific function body reads."
