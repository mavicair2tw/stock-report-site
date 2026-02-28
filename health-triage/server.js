const express = require('express');
const { buildEngine } = require('./engine/ruleEngine');

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
