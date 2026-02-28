import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildEngine } from './engine/ruleEngine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

const engine = buildEngine(__dirname);

app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'health-triage' });
});

app.post('/api/triage', (req, res) => {
  const input = req.body || {};
  const result = engine.run(input);
  res.json({ ok: true, input, result });
});

const PORT = process.env.PORT || 8788;
app.listen(PORT, () => {
  console.log(`health-triage server running on :${PORT}`);
});
