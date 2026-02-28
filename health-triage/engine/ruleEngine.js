const fs = require('fs');
const path = require('path');

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

function buildEngine(baseDir) {
  const rulesPath = path.join(baseDir, 'rules', 'rules.json');
  const dietPath = path.join(baseDir, 'rules', 'diet_tags.json');
  const deptPath = path.join(baseDir, 'rules', 'department_map.json');

  const rules = readJson(rulesPath);
  const dietTags = readJson(dietPath);
  const deptMapList = readJson(deptPath);
  const deptMap = Object.fromEntries(deptMapList.map((x) => [x.symptom, x.departments]));
  const dietById = Object.fromEntries(dietTags.map((x) => [x.id, x]));

  function run(input) {
    const symptoms = input.symptoms || [];
    const comorbidities = input.comorbidities || [];
    const allIds = new Set([...symptoms, ...comorbidities]);
    const vitals = input.vitals || {};

    const matched = [...rules]
      .sort((a, b) => b.priority - a.priority)
      .filter((r) => matchRule(r, allIds, vitals));

    const chosen = matched[0] || {
      id: 'DEFAULT',
      outputs: {
        level_override: 'L4',
        reasons: ['可先自我照護並觀察'],
        departments: ['家醫科'],
        diet_tags: ['D_DEFAULT'],
        actions: []
      }
    };

    const out = chosen.outputs || {};
    const deptSet = new Set(out.departments || ['家醫科']);
    symptoms.forEach((s) => (deptMap[s] || []).forEach((d) => deptSet.add(d)));

    const dietIds = out.diet_tags && out.diet_tags.length ? out.diet_tags : ['D_DEFAULT'];
    const diet = dietIds.map((id) => dietById[id]).filter(Boolean);

    return {
      ruleId: chosen.id,
      level: out.level_override || 'L4',
      reasons: out.reasons || [],
      diet_tags: dietIds,
      diet,
      departments: Array.from(deptSet),
      actions: out.actions || []
    };
  }

  return { run };
}

module.exports = { buildEngine };
