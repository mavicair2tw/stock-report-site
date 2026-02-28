const fs = require("fs");

const cache = new Map();

function readJson(filePath) {
  const stat = fs.statSync(filePath);
  const key = `${filePath}:${stat.mtimeMs}:${stat.size}`;
  const hit = cache.get(filePath);
  if (hit && hit.key === key) return hit.data;
  const raw = fs.readFileSync(filePath, "utf-8");
  const data = JSON.parse(raw);
  cache.set(filePath, { key, data });
  return data;
}

const LEVEL_RANK = { L1: 4, L2: 3, L3: 2, L4: 1 }; // rank越高越緊急

function uniq(arr) {
  return [...new Set((arr || []).filter(Boolean))];
}

function getAgeComorbidityFlags(input) {
  const age = Number(input?.demographics?.age);
  const comorbidities = new Set(input?.comorbidities || []);
  if (!Number.isNaN(age)) {
    if (age >= 65) comorbidities.add("C_AGE65P");
    if (age <= 5) comorbidities.add("C_AGE5M");
  }
  return comorbidities;
}

function evalVitals(v, cond) {
  if (!cond || !cond.field || !cond.op) return false;
  const val = v?.[cond.field];
  if (val === undefined || val === null || Number.isNaN(Number(val))) return false;
  const n = Number(val);
  const t = Number(cond.value);
  switch (cond.op) {
    case "<": return n < t;
    case "<=": return n <= t;
    case ">": return n > t;
    case ">=": return n >= t;
    case "==": return n === t;
    case "!=": return n !== t;
    default: return false;
  }
}

function hasAny(setLike, arr) {
  for (const x of arr || []) if (setLike.has(x)) return true;
  return false;
}
function hasAll(setLike, arr) {
  for (const x of arr || []) if (!setLike.has(x)) return false;
  return true;
}
function hasNone(setLike, arr) {
  for (const x of arr || []) if (setLike.has(x)) return false;
  return true;
}

function symptomLevel(ctx, id) {
  const m = ctx.severity_map || {};
  const n = Number(m[id]);
  return Number.isNaN(n) ? Number(ctx.severity || 0) : n;
}

function symptomDuration(ctx, id) {
  const m = ctx.duration_map || {};
  const n = Number(m[id]);
  return Number.isNaN(n) ? Number(ctx.duration_hours || 0) : n;
}

function matchRule(rule, ctx) {
  const c = rule.conditions || {};
  const symptoms = ctx.symptoms;
  const comorbidities = ctx.comorbidities;
  const allSelected = new Set([...symptoms, ...comorbidities]);
  const hits = [];

  if (c.all_of) {
    if (!hasAll(allSelected, c.all_of)) return { ok: false, hits };
    hits.push(`all_of:${c.all_of.join(",")}`);
  }
  if (c.any_of) {
    if (!hasAny(allSelected, c.any_of)) return { ok: false, hits };
    hits.push(`any_of:${c.any_of.filter((x) => allSelected.has(x)).join(",")}`);
  }
  if (c.none_of) {
    if (!hasNone(allSelected, c.none_of)) return { ok: false, hits };
    hits.push(`none_of:ok`);
  }

  if (c.optional_any_of && c.optional_any_of.length > 0) {
    if (!hasAny(allSelected, c.optional_any_of)) return { ok: false, hits };
    hits.push(`optional_any_of:${c.optional_any_of.filter((x) => allSelected.has(x)).join(",")}`);
  }

  if (c.any_vitals && c.any_vitals.length > 0) {
    const matched = c.any_vitals.filter((vc) => evalVitals(ctx.vitals, vc));
    if (!matched.length) return { ok: false, hits };
    hits.push(`any_vitals:${matched.map((x) => `${x.field}${x.op}${x.value}`).join(",")}`);
  }

  if (c.all_vitals && c.all_vitals.length > 0) {
    const allHit = c.all_vitals.every((vc) => evalVitals(ctx.vitals, vc));
    if (!allHit) return { ok: false, hits };
    hits.push(`all_vitals:ok`);
  }

  if (c.optional_vitals && c.optional_vitals.length > 0) {
    for (const vc of c.optional_vitals) {
      const val = ctx.vitals?.[vc.field];
      if (val !== undefined && val !== null && !Number.isNaN(Number(val))) {
        if (!evalVitals(ctx.vitals, vc)) return { ok: false, hits };
        hits.push(`optional_vitals:${vc.field}${vc.op}${vc.value}`);
      }
    }
  }

  if (typeof c.duration_hours_min === "number") {
    const relevant = (c.all_of || c.any_of || []).filter((id) => symptoms.has(id));
    const maxDur = relevant.length ? Math.max(...relevant.map((id) => symptomDuration(ctx, id))) : Number(ctx.duration_hours || 0);
    if (Number.isNaN(maxDur) || maxDur < c.duration_hours_min) return { ok: false, hits };
    hits.push(`duration_hours_min:${c.duration_hours_min}`);
  }

  if (typeof c.severity_min === "number") {
    const relevant = (c.all_of || c.any_of || []).filter((id) => symptoms.has(id));
    const maxSev = relevant.length ? Math.max(...relevant.map((id) => symptomLevel(ctx, id))) : Number(ctx.severity || 0);
    if (Number.isNaN(maxSev) || maxSev < c.severity_min) return { ok: false, hits };
    hits.push(`severity_min:${c.severity_min}`);
  }

  return { ok: true, hits };
}

function resolveFallbackDepartments(symptoms, deptMap) {
  const out = [];
  const map = new Map(deptMap.map((x) => [x.symptom, x.departments]));
  for (const s of symptoms) {
    const depts = map.get(s);
    if (Array.isArray(depts)) out.push(...depts);
  }
  return uniq(out);
}

function levelMax(current, incoming) {
  if (!incoming) return current;
  if (!current) return incoming;
  return LEVEL_RANK[incoming] > LEVEL_RANK[current] ? incoming : current;
}

function triage(input, paths) {
  if (!input || typeof input !== "object") throw new Error("Input must be a JSON object.");

  const rules = readJson(paths.rulesPath);
  const dietTags = readJson(paths.dietPath);
  const deptMap = readJson(paths.deptPath);

  const symptoms = new Set(input.symptoms || []);
  const comorbidities = getAgeComorbidityFlags(input);
  const vitals = input.vitals || {};
  const duration_hours = input.duration_hours;
  const severity = input.severity;

  // 支援兩種格式：severity_map/duration_map 或 symptom_details
  const severity_map = { ...(input.severity_map || {}) };
  const duration_map = { ...(input.duration_map || {}) };
  const symptomDetails = input.symptom_details || {};
  for (const [sid, detail] of Object.entries(symptomDetails)) {
    if (detail && detail.severity !== undefined) severity_map[sid] = detail.severity;
    if (detail && detail.duration_hours !== undefined) duration_map[sid] = detail.duration_hours;
  }

  const ctx = { symptoms, comorbidities, vitals, duration_hours, severity, severity_map, duration_map };

  const sorted = [...rules].sort((a, b) => (b.priority || 0) - (a.priority || 0));

  let finalLevel = null;
  const matchedRules = [];
  const explain = [];
  let reasons = [];
  let actions = [];
  let departments = [];
  let diet_tag_ids = [];

  for (const r of sorted) {
    const mr = matchRule(r, ctx);
    if (!mr.ok) continue;

    matchedRules.push(r.id);
    explain.push({ rule_id: r.id, priority: r.priority || 0, hit_fields: mr.hits });
    const out = r.outputs || {};

    finalLevel = levelMax(finalLevel, out.level_override);
    reasons = reasons.concat(out.reasons || []);
    actions = actions.concat(out.actions || []);
    departments = departments.concat(out.departments || []);
    diet_tag_ids = diet_tag_ids.concat(out.diet_tags || []);

    if (finalLevel === "L1") break;
  }

  if (!finalLevel) finalLevel = "L4";

  departments = uniq(departments);
  if (departments.length === 0) {
    departments = resolveFallbackDepartments([...symptoms], deptMap);
    if (departments.length === 0) departments = ["家醫科"];
  }

  diet_tag_ids = uniq(diet_tag_ids);
  const diet_tags_resolved = diet_tag_ids
    .map((id) => dietTags.find((x) => x.id === id))
    .filter(Boolean);

  const redFlags = [
    "胸痛/胸悶持續或加重、冒冷汗、放射痛",
    "呼吸困難、喘到無法說完整句子、血氧偏低",
    "意識改變、昏厥、抽搐",
    "口齒不清、單側無力、視力突然改變",
    "大量出血、黑便/吐血",
    "高燒合併頸部僵硬、紫斑或精神混亂",
    "嚴重過敏：喘、喉頭緊、嘴唇腫"
  ];

  const i18n = {
    zh: { label: "繁中" },
    en: { label: "English" }
  };

  const finalReasons = uniq(reasons);
  if (!finalReasons.length) {
    finalReasons.push(finalLevel === 'L4' ? '目前可先自我照護並觀察' : '符合就醫評估條件');
  }

  return {
    level: finalLevel,
    matched_rules: matchedRules,
    explain,
    reasons: finalReasons,
    departments,
    diet_tags: diet_tags_resolved,
    actions: uniq(actions),
    red_flags: redFlags,
    disclaimer: "本系統提供健康資訊與就醫建議，不取代醫師診斷。若症狀惡化請立即就醫。",
    emergency_tw: ["119（緊急救護）", "1925（安心專線）"],
    i18n_available: i18n
  };
}

module.exports = { triage };
