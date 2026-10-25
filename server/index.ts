import './env.js';

import express from 'express';
import { pool } from './db/pool.js';
import { actorContext } from './middleware/actorContext.js';
import { requireActor } from './middleware/requireActor.js';
import { actorHeaderMode } from './lib/actorHeader.js';
import { originCheck, originGuard } from './lib/origin.js';
import { requestLog } from './lib/requestLog.js';
import { authRouter } from './routes/auth.js';
import { healthRouter } from './routes/health.js';
import { personsRouter } from './routes/persons.js';
import { engagementsRouter } from './routes/engagements.js';
import { runsRouter } from './routes/runs.js';
import { lineageRouter } from './routes/lineage.js';
import { jsonBodies } from './lib/jsonBodies.js';
import { runsIndexRouter } from './routes/runsIndex.js';
import { accountInputsRouter } from './routes/accountInputs.js';
import { institutionFactsRouter } from './routes/institutionFacts.js';
import { cohortRouter } from './routes/cohort.js';
import { engagementRetireRouter } from './routes/engagementRetire.js';
import { industryMeasureRetireRouter } from './routes/industryMeasureRetire.js';
import { accountResearchRouter, accountResearchReviewRouter } from './routes/accountResearch.js';
import { outsideInWalkRouter } from './routes/outsideInWalk.js';
import { valueLeverRouter, leverOfferingRouter, leverOfferingRetireRouter } from './routes/valueLevers.js';
import { hypothesisInstitutionRouter, valueHypothesisRouter, referenceExampleRouter } from './routes/valueHypotheses.js';
import { analystOfRecordRouter, accountPersonLinkRouter } from './routes/accountPersonLinks.js';
import { evidenceCitationRouter } from './routes/evidenceCitation.js';
import { industryExclusionsRouter } from './routes/industryExclusions.js';
import { institutionsIndexRouter } from './routes/institutionsIndex.js';
import { offeringAttachmentRouter } from './routes/offeringAttachment.js';
import { institutionClassifyRouter } from './routes/institutionClassify.js';
import { institutionViewRouter } from './routes/institutionView.js';
import { institutionInputsRouter } from './routes/institutionInputs.js';
import { valueOutcomesRouter } from './routes/valueOutcomes.js';
import { outcomeWalkRouter } from './routes/outcomeWalk.js';
import { outcomeEvidenceRouter } from './routes/outcomeEvidence.js';
import { produceRunRouter } from './routes/produceRun.js';
import { validateMetricRouter } from './routes/validateMetric.js';
import { metricPackBasisRouter } from './routes/metricPackBasis.js';
import { lockRunRouter } from './routes/lockRun.js';
import { correctionsOutcomeRouter, erratumRouter } from './routes/corrections.js';
import { recordDocumentsWriteRouter, recordDocumentsReadRouter } from './routes/recordDocuments.js';
import { compareRunsRouter } from './routes/compareRuns.js';
import { gapRegisterRouter } from './routes/gapRegister.js';
import { researchPromptRouter } from './routes/researchPrompt.js';
import { industryResearchRouter, researchResultsReviewRouter } from './routes/industryResearch.js';
import { industryPackRouter } from './routes/industryPack.js';
import { capabilityClaimsRouter } from './routes/capabilityClaims.js';

const app = express();
// Caddy is the only client of this process and connects from 127.0.0.1.
// Trusting the loopback proxy makes req.ip the browser's address (from
// X-Forwarded-For) and req.secure true behind HTTPS — the sign-in rate
// limit and the Secure cookie flag both depend on it (routes/auth.ts).
app.set('trust proxy', 'loopback');

// Throws on a malformed LVRF_PUBLIC_ORIGIN: a bad value refuses to start
// rather than guess (lib/origin.ts).
const origins = originCheck();
if (origins.mode === 'fallback') {
  console.error(
    'LVRF: LVRF_PUBLIC_ORIGIN is not set in production. Writes are checked against the ' +
    "request's own origin (fallback) — cross-site writes are still refused. Set it in .env.",
  );
}

// Sign-in P2b. Throws — refusing to start — on LVRF_ALLOW_ACTOR_HEADER=1 in
// production, or on a value that is not 0 or 1 (lib/actorHeader.ts).
const actorHeader = actorHeaderMode();
if (actorHeader === 'on') {
  console.warn(
    'LVRF: LVRF_ALLOW_ACTOR_HEADER=1 — the X-Actor-Person-Id header is accepted as the actor ' +
    'when there is no session. For verify scripts only; never in production.',
  );
}

// L31: one line per /api request (method, route pattern, status, ms,
// session y/n; never a value). First, so a refusal before routing — a 401,
// a bad body, a foreign origin — is logged too (lib/requestLog.ts).
app.use(requestLog(app));
// P2 (P2-D5): a research import's body may be larger (lib/jsonBodies.ts).
app.use(jsonBodies());
// Every mutating /api request, sign-in included: JSON only, and no
// cross-site or foreign-origin write (lib/origin.ts).
app.use('/api', originGuard(origins));
// Before requireActor: signing in is how a person becomes an actor, and
// health must answer without one (routes/auth.ts, lvrf-deploy.sh).
app.use('/api/auth', authRouter(pool));
app.use('/api/health', healthRouter(pool, origins.mode, actorHeader));
// Every other /api route needs an actor, reads included (P2a). From P2b
// that is the session; the header only in actorHeader 'on'.
app.use('/api', requireActor(pool, actorHeader));
app.use(actorContext(pool));
app.use('/api/persons', personsRouter(pool));
app.use('/api/engagements', engagementsRouter(pool));
app.use('/api/runs', runsIndexRouter(pool));
app.use('/api/runs', runsRouter(pool));
// P2: where a figure came from (read-only).
app.use('/api/lineage', lineageRouter(pool));
app.use('/api/account-inputs', accountInputsRouter(pool));
app.use('/api/institutions', institutionsIndexRouter(pool));
app.use('/api/institutions', offeringAttachmentRouter(pool));
app.use('/api/institutions', institutionClassifyRouter(pool));
app.use('/api/institutions', institutionViewRouter(pool));
app.use('/api/institutions', institutionInputsRouter(pool));
app.use('/api/institutions', institutionFactsRouter(pool));
app.use('/api/institutions', valueOutcomesRouter(pool));
app.use('/api/value-outcomes', outcomeWalkRouter(pool));
app.use('/api/value-outcomes', outcomeEvidenceRouter(pool));
// C1: the steward's two correction acts (LVRF_PLAN §9).
app.use('/api/value-outcomes', correctionsOutcomeRouter(pool));
app.use('/api/engagements', produceRunRouter(pool));
app.use('/api/engagements', engagementRetireRouter(pool));
app.use('/api/industry-measures', industryMeasureRetireRouter(pool));
app.use('/api/institutions', accountResearchRouter(pool));
app.use('/api/account-research-results', accountResearchReviewRouter(pool));
app.use('/api/institutions', outsideInWalkRouter(pool));
app.use('/api/industry-measures', valueLeverRouter(pool));
app.use('/api/value-levers', leverOfferingRouter(pool));
app.use('/api/lever-offerings', leverOfferingRetireRouter(pool));
app.use('/api/institutions', hypothesisInstitutionRouter(pool));
app.use('/api/value-hypotheses', valueHypothesisRouter(pool));
app.use('/api/reference-examples', referenceExampleRouter(pool));
app.use('/api/institutions', analystOfRecordRouter(pool));
app.use('/api/account-person-links', accountPersonLinkRouter(pool));
app.use('/api/evidence', evidenceCitationRouter(pool));
app.use('/api/business-metrics', validateMetricRouter(pool));
app.use('/api/business-metrics', metricPackBasisRouter(pool));
app.use('/api/business-metrics', researchPromptRouter(pool));
app.use('/api/value-runs', lockRunRouter(pool));
app.use('/api/value-runs', erratumRouter(pool));
app.use('/api/value-runs', recordDocumentsWriteRouter(pool));
app.use('/api/value-runs', compareRunsRouter(pool));
app.use('/api/value-outcomes', recordDocumentsReadRouter(pool));
app.use('/api/value-outcomes', gapRegisterRouter(pool));
app.use('/api/industries', industryResearchRouter(pool));
app.use('/api/industries', industryPackRouter(pool));
app.use('/api/industries', industryExclusionsRouter(pool));
app.use('/api/research-results', researchResultsReviewRouter(pool));
app.use('/api/capabilities', capabilityClaimsRouter(pool));
app.use('/api/cohort', cohortRouter(pool));

const port = Number(process.env.PORT ?? 3001);

// Loopback only (sign-in P2a). Caddy proxies to 127.0.0.1:3001 (ops/Caddyfile
// and the live /etc/caddy/Caddyfile), and the Vite dev proxy targets
// 127.0.0.1:3001 — never 'localhost', which can resolve to ::1 first.
const HOST = '127.0.0.1';
app.listen(port, HOST, () => {
  console.log(`LVRF API listening on ${HOST}:${port} (origin check: ${origins.mode}, actor header: ${actorHeader})`);
});
