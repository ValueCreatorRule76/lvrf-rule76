import './env.js';

import express from 'express';
import { pool } from './db/pool.js';
import { actorContext } from './middleware/actorContext.js';
import { healthRouter } from './routes/health.js';
import { personsRouter } from './routes/persons.js';
import { engagementsRouter } from './routes/engagements.js';
import { runsRouter } from './routes/runs.js';
import { runsIndexRouter } from './routes/runsIndex.js';
import { accountInputsRouter } from './routes/accountInputs.js';
import { offeringAttachmentRouter } from './routes/offeringAttachment.js';
import { institutionInputsRouter } from './routes/institutionInputs.js';
import { valueOutcomesRouter } from './routes/valueOutcomes.js';
import { outcomeWalkRouter } from './routes/outcomeWalk.js';
import { outcomeEvidenceRouter } from './routes/outcomeEvidence.js';
import { produceRunRouter } from './routes/produceRun.js';
import { validateMetricRouter } from './routes/validateMetric.js';
import { lockRunRouter } from './routes/lockRun.js';
import { recordDocumentsWriteRouter, recordDocumentsReadRouter } from './routes/recordDocuments.js';
import { compareRunsRouter } from './routes/compareRuns.js';
import { gapRegisterRouter } from './routes/gapRegister.js';
import { researchPromptRouter } from './routes/researchPrompt.js';
import { industryResearchRouter } from './routes/industryResearch.js';

const app = express();

app.use(express.json());
app.use(actorContext(pool));
app.use('/api/health', healthRouter(pool));
app.use('/api/persons', personsRouter(pool));
app.use('/api/engagements', engagementsRouter(pool));
app.use('/api/runs', runsIndexRouter(pool));
app.use('/api/runs', runsRouter(pool));
app.use('/api/account-inputs', accountInputsRouter(pool));
app.use('/api/institutions', offeringAttachmentRouter(pool));
app.use('/api/institutions', institutionInputsRouter(pool));
app.use('/api/institutions', valueOutcomesRouter(pool));
app.use('/api/value-outcomes', outcomeWalkRouter(pool));
app.use('/api/value-outcomes', outcomeEvidenceRouter(pool));
app.use('/api/engagements', produceRunRouter(pool));
app.use('/api/business-metrics', validateMetricRouter(pool));
app.use('/api/business-metrics', researchPromptRouter(pool));
app.use('/api/value-runs', lockRunRouter(pool));
app.use('/api/value-runs', recordDocumentsWriteRouter(pool));
app.use('/api/value-runs', compareRunsRouter(pool));
app.use('/api/value-outcomes', recordDocumentsReadRouter(pool));
app.use('/api/value-outcomes', gapRegisterRouter(pool));
app.use('/api/industries', industryResearchRouter(pool));

const port = Number(process.env.PORT ?? 3001);

app.listen(port, () => {
  console.log(`LVRF API listening on port ${port}`);
});
