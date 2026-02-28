const fs = require("fs");

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(raw);
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
  // cond: { field, op, value }
  if (!cond || !cond.field || !cond.op) return false;
  const val = v?.[cond.field];
  if (val === undefined || val === null || Number.isNaN(Number(val))) return false;
  const n = Number(val);
  const t = Number(cond.value);

  switch (cond.op) {
    case "<":
      return n < t;
    case "<=":
      return n <= t;
    case ">":
      return n > t;
    case ">=":
      return n >= t;
    case "==":
      return n === t;
    case "!=":
      return n !== t;
    default:
      return false;
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

function matchRule(rule, ctx) {
  const c = rule.conditions || {};
  const symptoms = ctx.symptoms;
  const comorbidities = ctx.comorbidities;
  const allSelected = new Set([...symptoms, ...comorbidities]);

  // Required: all_of / any_of / none_of
  if (c.all_of && !hasAll(allSelected, c.all_of)) return false;
  if (c.any_of && !hasAny(allSelected, c.any_of)) return false;
  if (c.none_of && !hasNone(allSelected, c.none_of)) return false;

  // Optional: optional_any_of（若存在，至少命中一個才算 match）
  if (c.optional_any_of && c.optional_any_of.length > 0) {
    if (!hasAny(allSelected, c.optional_any_of)) return false;
  }

  // Vitals rules
  if (c.any_vitals && c.any_vitals.length > 0) {
    const anyHit = c.any_vitals.some((vc) => evalVitals(ctx.vitals, vc));
    if (!anyHit) return false;
  }

  if (c.all_vitals && c.all_vitals.length > 0) {
    const allHit = c.all_vitals.every((vc) => evalVitals(ctx.vitals, vc));
    if (!allHit) return false;
  }

  // optional_vitals：若使用者有填該欄位，才檢查；沒填則跳過
  if (c.optional_vitals && c.optional_vitals.length > 0) {
    for (const vc of c.optional_vitals) {
      const val = ctx.vitals?.[vc.field];
      if (val !== undefined && val !== null && !Number.isNaN(Number(val))) {
        if (!evalVitals(ctx.vitals, vc)) return false;
      }
    }
  }

  // Duration / severity（可擴充）
  if (typeof c.duration_hours_min === "number") {
    const d = Number(ctx.duration_hours);
    if (Number.isNaN(d) || d < c.duration_hours_min) return false;
  }

  if (typeof c.severity_min === "number") {
    const s = Number(ctx.severity);
    if (Number.isNaN(s) || s < c.severity_min) return false;
  }

  return true;
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

  const ctx = { symptoms, comorbidities, vitals, duration_hours, severity };

  // Sort rules by priority desc
  const sorted = [...rules].sort((a, b) => (b.priority || 0) - (a.priority || 0));

  let finalLevel = null;
  const matchedRules = [];
  let reasons = [];
  let actions = [];
  let departments = [];
  let diet_tag_ids = [];

  for (const r of sorted) {
    if (!matchRule(r, ctx)) continue;

    matchedRules.push(r.id);
    const out = r.outputs || {};

    finalLevel = levelMax(finalLevel, out.level_override);
    reasons = reasons.concat(out.reasons || []);
    actions = actions.concat(out.actions || []);
    departments = departments.concat(out.departments || []);
    diet_tag_ids = diet_tag_ids.concat(out.diet_tags || []);

    // 若已命中 L1，通常可以提早停止（你也可以改成繼續累積資訊）
    if (finalLevel === "L1") break;
  }

  // Default level if nothing matched
  if (!finalLevel) finalLevel = "L4";

  // Fallback departments if none
  departments = uniq(departments);
  if (departments.length === 0) {
    departments = resolveFallbackDepartments([...symptoms], deptMap);
    if (departments.length === 0) departments = ["家醫科"];
  }

  diet_tag_ids = uniq(diet_tag_ids);
  const diet_tags_resolved = diet_tag_ids
    .map((id) => dietTags.find((x) => x.id === id))
    .filter(Boolean);

  // Always include a red-flag reminder for safety (frontend can show collapsible)
  const redFlags = [
    "胸痛/胸悶持續或加重、冒冷汗、放射痛",
    "呼吸困難、喘到無法說完整句子、血氧偏低",
    "意識改變、昏厥、抽搐",
    "口齒不清、單側無力、視力突然改變",
    "大量出血、黑便/吐血",
    "高燒合併頸部僵硬、紫斑或精神混亂",
    "嚴重過敏：喘、喉頭緊、嘴唇腫"
  ];

  return {
    level: finalLevel,
    matched_rules: matchedRules,
    reasons: uniq(reasons),
    departments,
    diet_tags: diet_tags_resolved,
    actions: uniq(actions),
    red_flags: redFlags
  };
}

module.exports = { triage };
