const express = require("express");
const path = require("path");
const fs = require("fs");
const { triage } = require("./engine/ruleEngine");

const app = express();
app.use(express.json({ limit: "1mb" }));

function sendConfig(res, file) {
  const p = path.join(__dirname, "rules", file);
  const raw = fs.readFileSync(p, "utf-8");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.send(raw);
}

// Health check
app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "health-triage", ts: new Date().toISOString() });
});

app.get("/config/symptoms", (_req, res) => sendConfig(res, "symptom_options.json"));
app.get("/config/comorbidities", (_req, res) => sendConfig(res, "comorbidity_options.json"));
app.get("/config/vitals", (_req, res) => sendConfig(res, "vitals_options.json"));

// Main triage endpoint
app.post("/api/triage", (req, res) => {
  try {
    const input = req.body;

    const rulesPath = path.join(__dirname, "rules", "rules.json");
    const dietPath = path.join(__dirname, "rules", "diet_tags.json");
    const deptPath = path.join(__dirname, "rules", "department_map.json");

    const result = triage(input, { rulesPath, dietPath, deptPath });
    res.json({ ok: true, result });
  } catch (err) {
    res.status(400).json({ ok: false, error: "BAD_REQUEST", message: err?.message || "Unknown error" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`health-triage listening on :${PORT}`));
