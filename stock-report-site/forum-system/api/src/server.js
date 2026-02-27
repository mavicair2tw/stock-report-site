import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import { config } from './config.js';
import { apiRateLimit } from './middleware/rateLimit.js';
import authRoutes from './routes/auth.js';
import forumRoutes from './routes/forum.js';
import modRoutes from './routes/mod.js';
import adminRoutes from './routes/admin.js';

const app = express();
app.use(helmet());
app.use(cors({ origin: config.corsOrigin }));
app.use(express.json({ limit: '1mb' }));
app.use(morgan('combined'));
app.use(apiRateLimit);

app.get('/health', (_req, res) => res.json({ ok: true }));
app.use('/api/auth', authRoutes);
app.use('/api', forumRoutes);
app.use('/api/mod', modRoutes);
app.use('/api/admin', adminRoutes);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'internal_error' });
});

app.listen(config.port, () => {
  console.log(`forum api running on :${config.port}`);
});
