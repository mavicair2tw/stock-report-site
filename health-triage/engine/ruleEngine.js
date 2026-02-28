const fs = require('fs');

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

function cmp(a, op, b) {
  if (a === undefined || a === null || Number.isNaN(Number(a))) return false;
  const x = Number(a);
  const y = Number(b);
  if (op === '<') return x < y;
  if (op === '<=') return x <= y;
  if (op === '>') return x > y;
  if (op === '>=') return x >= y;
  if (op === '==') return x === y;
  return false;
}

function matchRule(rule, allIds, vitals) {
  const c = rule.conditions || {};
  if (c.all_of && !c.all_of.every((id) => allIds.has(id))) return false;
  if (c.any_of && !c.any_of.some((id) => allIds.has(id))) return false;
  if (c.none_of && c.none_of.some((id) => allIds.has(id))) return false;
  if (c.any_vitals && !c.any_vitals.some((v) => cmp(vitals[v.field], v.op, v.value))) return false;
  if (c.optional_vitals && !c.optional_vitals.every((v) => cmp(vitals[v.field], v.op, v.value))) return false;
  return true;
}

function triage(input, { rulesPath, dietPath, deptPath }) {
  const rules = readJson(rulesPath);
  const dietTags = readJson(dietPath);
  const deptMapList = readJson(deptPath);

  const deptMap = Object.fromEntries(deptMapList.map((x) => [x.symptom, x.departments]));
  const dietById = Object.fromEntries(dietTags.map((x) => [x.id, x]));

  const symptoms = input?.symptoms || [];
  const comorbidities = input?.comorbidities || [];
  const allIds = new Set([...symptoms, ...comorbidities]);
  const vitals = input?.vitals || {};

  const matched = [...rules]
    .sort((a, b) => b.priority - a.priority)
    .filter((r) => matchRule(r, allIds, vitals));

  const defaultOut = {
    level_override: 'L4',
    reasons: ['可先自我照護並觀察'],
    departments: [],
    diet_tags: ['D_DEFAULT'],
    actions: []
  };

  const reasonsSet = new Set();
  const actionsSet = new Set();
  const deptSet = new Set();
  const dietSet = new Set();

  // priority 由高到低跑：先命中的 level_override 優先
  let level = 'L4';
  const chosenRuleIds = [];

  if (!matched.length) {
    defaultOut.reasons.forEach((x) => reasonsSet.add(x));
    defaultOut.actions.forEach((x) => actionsSet.add(x));
    defaultOut.departments.forEach((x) => deptSet.add(x));
    defaultOut.diet_tags.forEach((x) => dietSet.add(x));
  }

  for (const rule of matched) {
    const out = rule.outputs || {};
    chosenRuleIds.push(rule.id);

    if (out.level_override && level === 'L4') {
      level = out.level_override;
    }

    (out.reasons || []).forEach((x) => reasonsSet.add(x));
    (out.actions || []).forEach((x) => actionsSet.add(x));
    (out.departments || []).forEach((x) => deptSet.add(x));
    (out.diet_tags || []).forEach((x) => dietSet.add(x));
  }

  // 若沒有科別，使用 department_map.json 依勾選症狀兜底
  if (!deptSet.size) {
    symptoms.forEach((s) => (deptMap[s] || []).forEach((d) => deptSet.add(d)));
  }
  if (!deptSet.size) deptSet.add('家醫科');
  if (!dietSet.size) dietSet.add('D_DEFAULT');

  const dietIds = Array.from(dietSet);
  const diet = dietIds.map((id) => dietById[id]).filter(Boolean);

  return {
    matchedRules: chosenRuleIds,
    level,
    reasons: Array.from(reasonsSet),
    diet_tags: dietIds,
    diet,
    departments: Array.from(deptSet),
    actions: Array.from(actionsSet)
  };
}

module.exports = { triage };
