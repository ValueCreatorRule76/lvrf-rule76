import { Router } from 'express';
import type { Pool } from 'pg';
import { isUuid } from './params.js';
import { sha256Hex } from '../spine/hash.js';

/**
 * All writes here go through req.dbClient, never the pool. actorContext has
 * already opened the transaction and set lvrf.actor_person_id on this
 * client before next() was called — pool.query() would run on a different
 * connection, outside that transaction: no actor attribution, no atomicity
 * with the rest of this request. This handler never issues BEGIN, COMMIT,
 * or ROLLBACK; the middleware owns the transaction boundary and decides on
 * commit vs rollback from the response status once this handler returns.
 *
 * Creates a record_documents row from a locked run. This is the artifact a
 * finance function would be handed — the ROW is the document of record; a
 * rendered PDF is a rendering of it, not the thing itself.
 *
 * WHY NO FILE IS WRITTEN: records/render_record.py is a fixture-driven CLI.
 * It reads out/spine_run_{stem}.json from disk, writes HTML and PDF to
 * out/, and takes a fixture filename as argv[1] — it is not
 * database-aware and has no notion of a value_runs row. WeasyPrint is not
 * installed on the production box, and that script has never run there.
 * Making this Node service depend on a Python environment to answer one
 * endpoint is a real operational commitment, and it is not taken here.
 * file_path is nullable on this table precisely because the schema
 * anticipated this separation between recording and rendering.
 *
 * NOTE: record_documents has no deleted_at. lvrf_block_delete carries a
 * custom message on this table — "supersede by rendering a new
 * document_version" — because document_version, not deletion, is the
 * retirement mechanism (see the unique (value_outcome_id, document_version)
 * constraint). This endpoint therefore never issues an UPDATE; it only
 * ever inserts a new version.
 */

function isCheckViolation(err: unknown): err is { code: '23514'; message: string } {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: unknown }).code === '23514'
  );
}

function isUniqueViolation(err: unknown): err is { code: '23505'; message: string } {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: unknown }).code === '23505'
  );
}

// POST /api/value-runs/:runId/record-document — creates a record_documents
// row from a locked run, in the same transaction, in one insert.
export function recordDocumentsRouter(pool: Pool): Router {
  void pool;
  const router = Router();

  router.post('/:runId/record-document', async (req, res) => {
    // actorContext (mounted ahead of every router) always sets this before
    // calling next() on a mutating request, and never calls next() otherwise.
    const client = req.dbClient!;

    const runId = req.params.runId;
    if (!isUuid(runId)) {
      res.status(400).json({ message: `invalid value run id: ${runId}` });
      return;
    }

    try {
      const actorPersonId = req.get('x-actor-person-id');
      if (!actorPersonId) {
        // actorContext already refused any mutating request without this
        // header before this handler could run. Reaching here without it
        // means that guarantee broke, not that this caller did anything wrong.
        throw new Error('x-actor-person-id missing on a request past actorContext');
      }

      const { rows: [run] } = await client.query<{
        id: string;
        tenant_id: string;
        engagement_id: string;
        locked_at: Date | null;
        payload: Record<string, unknown>;
      }>(
        `SELECT id, tenant_id, engagement_id, locked_at, payload
           FROM value_runs
          WHERE id = $1 AND deleted_at IS NULL AND superseded_by_id IS NULL`,
        [runId],
      );
      if (!run) {
        res.status(404).json({ message: `value run ${runId} not found` });
        return;
      }

      // A document rendered from a mutable run could disagree with the run
      // it claims to represent the moment that run changes again.
      if (run.locked_at === null) {
        res.status(409).json({
          message: `value run ${runId} is not locked; a record document cannot be produced from a mutable run`,
        });
        return;
      }

      // Added to the payload after some runs were already produced — see
      // client/src/types/run.ts. A run from before that point cannot name
      // the outcome it belongs to, so no record document can be produced
      // from it. Seven runs are currently in this state.
      const valueOutcomeId = run.payload.valueOutcomeId;
      if (typeof valueOutcomeId !== 'string') {
        res.status(422).json({
          message: `value run ${runId} predates valueOutcomeId in its payload; a record document cannot be produced from it`,
        });
        return;
      }

      // Already computed by produceRun.ts/walkSpine.ts as the disclosure
      // this run's realization warrants — 'internal' or 'customer_shared',
      // never 'draft'. Passed through unchanged, not recomputed here: this
      // endpoint records what the run already asserted about itself, it
      // does not re-derive it.
      const disclosure = run.payload.disclosure as 'internal' | 'customer_shared';

      // content_hash is computed the same way produceRun.ts computes
      // payloadHash: sha256Hex over the payload MINUS its own payloadHash
      // key (a hash cannot include itself). run.payload as read back from
      // the database already has that key appended — payloadHash is not
      // trusted directly here, in case a differently-computed value ever
      // found its way into a payload column; recomputing from the same
      // function, the same way, is what "match it exactly" means.
      const { payloadHash: _payloadHash, ...payloadWithoutHash } = run.payload;
      const contentHash = sha256Hex(payloadWithoutHash);

      // Same idiom as produceRun.ts's next_run_number: the retirement
      // mechanism for this table is a new version, not an update, so the
      // next version is read fresh inside this transaction rather than
      // assumed. The unique (value_outcome_id, document_version)
      // constraint is the actual race guard — a concurrent request landing
      // between this SELECT and the INSERT below surfaces as 23505, caught
      // and returned as 409 further down.
      const { rows: [{ next_version: documentVersion }] } = await client.query<{ next_version: number }>(
        'SELECT COALESCE(MAX(document_version), 0) + 1 AS next_version FROM record_documents WHERE value_outcome_id = $1',
        [valueOutcomeId],
      );

      const { rows: [recordDocument] } = await client.query<{
        id: string;
        document_version: number;
        disclosure: string;
        content_hash: string;
      }>(
        `INSERT INTO record_documents (
           tenant_id, engagement_id, value_outcome_id, value_run_id,
           document_version, disclosure, content_hash, payload,
           file_path, rendered_by_person_id
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NULL, $9)
         RETURNING id, document_version, disclosure, content_hash`,
        [
          run.tenant_id, run.engagement_id, valueOutcomeId, run.id,
          documentVersion, disclosure, contentHash, run.payload,
          actorPersonId,
        ],
      );

      res.status(201).json({
        record_document_id: recordDocument.id,
        document_version: recordDocument.document_version,
        disclosure: recordDocument.disclosure,
        content_hash: recordDocument.content_hash,
      });
    } catch (err) {
      // A CHECK-constraint refusal (ERRCODE check_violation, SQLSTATE 23514)
      // is the governance gate doing its job, not a server fault. Its
      // message names the amendment and the reason — that message IS the
      // product here, so it goes to the caller unchanged, not swallowed
      // into a generic 500.
      if (isCheckViolation(err)) {
        res.status(422).json({ message: err.message });
        return;
      }
      // A unique-constraint collision (ERRCODE unique_violation, SQLSTATE
      // 23505) — record_documents_outcome_version_key, most likely a
      // concurrent request that computed the same next document_version —
      // is a conflict with existing state, not a server fault. 409, not
      // 500; message unchanged, same as the check_violation branch above.
      if (isUniqueViolation(err)) {
        res.status(409).json({ message: err.message });
        return;
      }
      res.status(500).json({ message: err instanceof Error ? err.message : 'unknown error' });
    }
  });

  return router;
}
