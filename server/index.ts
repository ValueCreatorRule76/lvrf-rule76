import './env.js';

import express from 'express';
import { pool } from './db/pool.js';
import { actorContext } from './middleware/actorContext.js';
import { healthRouter } from './routes/health.js';
import { engagementsRouter } from './routes/engagements.js';
import { runsRouter } from './routes/runs.js';

const app = express();

app.use(express.json());
app.use(actorContext(pool));
app.use('/api/health', healthRouter(pool));
app.use('/api/engagements', engagementsRouter(pool));
app.use('/api/runs', runsRouter(pool));

const port = Number(process.env.PORT ?? 3001);

app.listen(port, () => {
  console.log(`LVRF API listening on port ${port}`);
});
