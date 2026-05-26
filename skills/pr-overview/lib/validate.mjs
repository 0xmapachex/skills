// Hand-rolled validator for pr-overview spec. Mirrors schema/pr-overview.schema.json.
// Returns { valid: boolean, errors: string[] }. Errors are JSON-pointer-ish paths.

const STATUS = new Set(['added', 'changed', 'removed', 'context']);
const NODE_KINDS = new Set(['service', 'module', 'datastore', 'external', 'ui', 'job']);
const EDGE_KINDS = new Set(['sync', 'async', 'data']);
const ACTOR_KINDS = new Set(['user', 'service', 'module', 'datastore', 'external']);
const OBS_KINDS = new Set(['pattern', 'risky-spot', 'suggestion']);
const SEVERITY = new Set(['info', 'watch', 'careful']);

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const isStr = (v) => typeof v === 'string' && v.length > 0;
const isInt = (v) => Number.isInteger(v) && v >= 0;
const isBool = (v) => typeof v === 'boolean';

export function validate(spec) {
  const errors = [];
  const push = (path, msg) => errors.push(`${path}: ${msg}`);

  if (!isObj(spec)) {
    push('$', 'spec must be a JSON object');
    return { valid: false, errors };
  }

  // required top-level keys
  for (const k of ['meta', 'summary', 'architecture', 'open_questions']) {
    if (!(k in spec)) push('$', `required: ${k}`);
  }

  // allowed top-level keys only
  const ALLOWED = new Set([
    'meta', 'summary', 'architecture', 'flow', 'database',
    'code_observations', 'risk_rollout', 'open_questions',
  ]);
  for (const k of Object.keys(spec)) {
    if (!ALLOWED.has(k)) push('$', `unknown key: ${k}`);
  }

  if ('meta' in spec)              validateMeta(spec.meta, push);
  if ('summary' in spec)           validateSummary(spec.summary, push);
  if ('architecture' in spec)      validateArchitecture(spec.architecture, push);
  if ('flow' in spec)              validateFlow(spec.flow, push);
  if ('database' in spec)          validateDatabase(spec.database, push);
  if ('code_observations' in spec) validateCodeObservations(spec.code_observations, push);
  if ('risk_rollout' in spec)      validateRiskRollout(spec.risk_rollout, push);
  if ('open_questions' in spec)    validateOpenQuestions(spec.open_questions, push);

  return { valid: errors.length === 0, errors };
}

function validateMeta(m, push) {
  if (!isObj(m)) { push('meta', 'must be object'); return; }
  const required = {
    title: isStr, base: isStr, head: isStr,
    files_changed: isInt, additions: isInt, deletions: isInt,
  };
  for (const [k, check] of Object.entries(required)) {
    if (!(k in m)) push(`meta.${k}`, 'required');
    else if (!check(m[k])) push(`meta.${k}`, 'invalid type');
  }
  if ('pr_type_tags' in m) {
    if (!Array.isArray(m.pr_type_tags)) push('meta.pr_type_tags', 'must be array');
    else m.pr_type_tags.forEach((t, i) => {
      if (!isStr(t)) push(`meta.pr_type_tags[${i}]`, 'must be string');
    });
  }
}

function validateSummary(s, push) {
  if (!isObj(s)) { push('summary', 'must be object'); return; }
  if (!Array.isArray(s.bullets)) { push('summary.bullets', 'must be array'); return; }
  if (s.bullets.length < 1 || s.bullets.length > 7) push('summary.bullets', 'must have 1-7 items');
  s.bullets.forEach((b, i) => { if (!isStr(b)) push(`summary.bullets[${i}]`, 'must be string'); });
}

function validateArchitecture(a, push) {
  if (!isObj(a)) { push('architecture', 'must be object'); return; }
  if (!Array.isArray(a.nodes)) push('architecture.nodes', 'must be array');
  else a.nodes.forEach((n, i) => {
    const p = `architecture.nodes[${i}]`;
    if (!isStr(n.id)) push(`${p}.id`, 'required string');
    if (!isStr(n.label)) push(`${p}.label`, 'required string');
    if (!NODE_KINDS.has(n.kind)) push(`${p}.kind`, `must be one of ${[...NODE_KINDS].join('|')}`);
    if ('changed' in n && !isBool(n.changed)) push(`${p}.changed`, 'must be boolean');
  });
  if (!Array.isArray(a.edges)) push('architecture.edges', 'must be array');
  else a.edges.forEach((e, i) => {
    const p = `architecture.edges[${i}]`;
    if (!isStr(e.from)) push(`${p}.from`, 'required string');
    if (!isStr(e.to)) push(`${p}.to`, 'required string');
    if ('kind' in e && !EDGE_KINDS.has(e.kind)) push(`${p}.kind`, `must be one of ${[...EDGE_KINDS].join('|')}`);
  });
  if ('details' in a) {
    if (!isObj(a.details)) push('architecture.details', 'must be object');
    else for (const [id, d] of Object.entries(a.details)) {
      const p = `architecture.details.${id}`;
      if (!isObj(d)) { push(p, 'must be object'); continue; }
      if ('status' in d && !STATUS.has(d.status)) push(`${p}.status`, `must be one of ${[...STATUS].join('|')}`);
    }
  }
}

function validateFlow(f, push) {
  if (!isObj(f)) { push('flow', 'must be object'); return; }
  if (!Array.isArray(f.actors)) push('flow.actors', 'must be array');
  else f.actors.forEach((a, i) => {
    const p = `flow.actors[${i}]`;
    if (!isStr(a.id)) push(`${p}.id`, 'required string');
    if (!isStr(a.label)) push(`${p}.label`, 'required string');
    if ('kind' in a && !ACTOR_KINDS.has(a.kind)) push(`${p}.kind`, `must be one of ${[...ACTOR_KINDS].join('|')}`);
  });
  if (!Array.isArray(f.steps)) push('flow.steps', 'must be array');
  else f.steps.forEach((s, i) => {
    const p = `flow.steps[${i}]`;
    if (!isStr(s.from)) push(`${p}.from`, 'required string');
    if (!isStr(s.to)) push(`${p}.to`, 'required string');
    if (!isStr(s.label)) push(`${p}.label`, 'required string');
  });
}

function validateDatabase(d, push) {
  if (!isObj(d)) { push('database', 'must be object'); return; }
  if (!Array.isArray(d.tables)) { push('database.tables', 'must be array'); return; }
  d.tables.forEach((t, i) => {
    const p = `database.tables[${i}]`;
    if (!isStr(t.id)) push(`${p}.id`, 'required string');
    if (!isStr(t.name)) push(`${p}.name`, 'required string');
    if (!STATUS.has(t.status)) push(`${p}.status`, `must be one of ${[...STATUS].join('|')}`);
    if (!Array.isArray(t.fields)) push(`${p}.fields`, 'must be array');
    else t.fields.forEach((f, j) => {
      const fp = `${p}.fields[${j}]`;
      if (!isStr(f.name)) push(`${fp}.name`, 'required string');
      if (!isStr(f.type)) push(`${fp}.type`, 'required string');
      if (!STATUS.has(f.status)) push(`${fp}.status`, `must be one of ${[...STATUS].join('|')}`);
    });
  });
  if ('relations' in d) {
    if (!Array.isArray(d.relations)) push('database.relations', 'must be array');
    else d.relations.forEach((r, i) => {
      const p = `database.relations[${i}]`;
      if (!isStr(r.from)) push(`${p}.from`, 'required string');
      if (!isStr(r.to)) push(`${p}.to`, 'required string');
      if ('status' in r && !STATUS.has(r.status)) push(`${p}.status`, `must be one of ${[...STATUS].join('|')}`);
    });
  }
}

function validateCodeObservations(c, push) {
  if (!isObj(c)) { push('code_observations', 'must be object'); return; }
  if (!Array.isArray(c.items)) { push('code_observations.items', 'must be array'); return; }
  if (c.items.length > 5) push('code_observations.items', 'max 5 items');
  c.items.forEach((it, i) => {
    const p = `code_observations.items[${i}]`;
    if (!isStr(it.title)) push(`${p}.title`, 'required string');
    if (!OBS_KINDS.has(it.kind)) push(`${p}.kind`, `must be one of ${[...OBS_KINDS].join('|')}`);
  });
}

function validateRiskRollout(r, push) {
  if (!isObj(r)) { push('risk_rollout', 'must be object'); return; }
  if (!Array.isArray(r.items)) { push('risk_rollout.items', 'must be array'); return; }
  r.items.forEach((it, i) => {
    const p = `risk_rollout.items[${i}]`;
    if (!isStr(it.title)) push(`${p}.title`, 'required string');
    if (!SEVERITY.has(it.severity)) push(`${p}.severity`, `must be one of ${[...SEVERITY].join('|')}`);
    if (!isStr(it.notes)) push(`${p}.notes`, 'required string');
  });
}

function validateOpenQuestions(o, push) {
  if (!isObj(o)) { push('open_questions', 'must be object'); return; }
  if (!Array.isArray(o.items)) { push('open_questions.items', 'must be array'); return; }
  o.items.forEach((q, i) => {
    if (!isStr(q)) push(`open_questions.items[${i}]`, 'must be string');
  });
}
