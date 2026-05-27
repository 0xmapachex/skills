// Hand-rolled validator for pr-overview spec. Mirrors schema/pr-overview.schema.json.
// Returns { valid: boolean, errors: string[] }. Errors are JSON-pointer-ish paths.

const STATUS = new Set(['added', 'changed', 'removed', 'context']);
const NODE_KINDS = new Set(['service', 'module', 'datastore', 'external', 'ui', 'job']);
const EDGE_KINDS = new Set(['sync', 'async', 'data']);
const ACTOR_KINDS = new Set(['user', 'service', 'module', 'datastore', 'external']);
const SEVERITY = new Set(['info', 'watch', 'careful']);
const ROUTE_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);
const ROUTE_STATUSES = new Set(['added', 'changed', 'removed']);
const ROUTE_PARAM_IN = new Set(['path', 'query', 'body', 'header']);

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
    'meta', 'summary', 'architecture', 'flow', 'flows', 'database',
    'routes', 'risk_rollout', 'open_questions',
  ]);
  for (const k of Object.keys(spec)) {
    if (!ALLOWED.has(k)) push('$', `unknown key: ${k}`);
  }
  if ('flow' in spec && 'flows' in spec) push('$', 'use either flow (single) or flows (array), not both');

  if ('meta' in spec)              validateMeta(spec.meta, push);
  if ('summary' in spec)           validateSummary(spec.summary, push);
  if ('architecture' in spec)      validateArchitecture(spec.architecture, push);
  if ('flow' in spec)              validateFlow(spec.flow, push, 'flow');
  if ('flows' in spec)             validateFlows(spec.flows, push);
  if ('database' in spec)          validateDatabase(spec.database, push);
  if ('routes' in spec)            validateRoutes(spec.routes, push);
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
  if (!isStr(s.tldr)) push('summary.tldr', 'required string (the 1–2 sentence lede)');
  if (!Array.isArray(s.ships)) {
    push('summary.ships', 'required array (1–6 items naming what this PR ships)');
  } else {
    if (s.ships.length < 1 || s.ships.length > 6) push('summary.ships', 'must have 1–6 items');
    s.ships.forEach((b, i) => { if (!isStr(b)) push(`summary.ships[${i}]`, 'must be string'); });
  }
  if ('why' in s && !isStr(s.why)) push('summary.why', 'must be string');
  if ('changes' in s) {
    if (!Array.isArray(s.changes)) push('summary.changes', 'must be array');
    else {
      if (s.changes.length > 6) push('summary.changes', 'max 6 items');
      s.changes.forEach((b, i) => { if (!isStr(b)) push(`summary.changes[${i}]`, 'must be string'); });
    }
  }
  if ('topics' in s) {
    if (!Array.isArray(s.topics)) { push('summary.topics', 'must be array'); return; }
    if (s.topics.length > 8) push('summary.topics', 'max 8 items');
    s.topics.forEach((t, i) => {
      const p = `summary.topics[${i}]`;
      if (!isObj(t)) { push(p, 'must be object'); return; }
      if (!isStr(t.title))   push(`${p}.title`, 'required string');
      if (!isStr(t.summary)) push(`${p}.summary`, 'required string');
      if ('body' in t && !isStr(t.body)) push(`${p}.body`, 'must be string');
      validateHighlights(t.highlights, push, `${p}.highlights`);
      if ('code' in t) {
        if (!Array.isArray(t.code)) push(`${p}.code`, 'must be array');
        else t.code.forEach((c, j) => {
          const cp = `${p}.code[${j}]`;
          if (!isObj(c)) { push(cp, 'must be object'); return; }
          if (!isStr(c.body)) push(`${cp}.body`, 'required string');
          if ('lang' in c && !isStr(c.lang)) push(`${cp}.lang`, 'must be string');
          if ('file' in c && !isStr(c.file)) push(`${cp}.file`, 'must be string');
        });
      }
    });
  }
}

function validateArchitecture(a, push) {
  if (!isObj(a)) { push('architecture', 'must be object'); return; }
  if ('summary' in a && !isStr(a.summary)) push('architecture.summary', 'must be string');
  validateHighlights(a.highlights, push, 'architecture.highlights');
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

function validateFlow(f, push, path) {
  if (!isObj(f)) { push(path, 'must be object'); return; }
  if ('title'   in f && !isStr(f.title))   push(`${path}.title`, 'must be string');
  if ('summary' in f && !isStr(f.summary)) push(`${path}.summary`, 'must be string');
  validateHighlights(f.highlights, push, `${path}.highlights`);
  if (!Array.isArray(f.actors)) push(`${path}.actors`, 'must be array');
  else f.actors.forEach((a, i) => {
    const p = `${path}.actors[${i}]`;
    if (!isStr(a.id)) push(`${p}.id`, 'required string');
    if (!isStr(a.label)) push(`${p}.label`, 'required string');
    if ('kind' in a && !ACTOR_KINDS.has(a.kind)) push(`${p}.kind`, `must be one of ${[...ACTOR_KINDS].join('|')}`);
  });
  if (!Array.isArray(f.steps)) push(`${path}.steps`, 'must be array');
  else f.steps.forEach((s, i) => {
    const p = `${path}.steps[${i}]`;
    if (!isStr(s.from)) push(`${p}.from`, 'required string');
    if (!isStr(s.to)) push(`${p}.to`, 'required string');
    if (!isStr(s.label)) push(`${p}.label`, 'required string');
  });
}

function validateHighlights(h, push, path) {
  if (h === undefined) return;
  if (!Array.isArray(h)) { push(path, 'must be array of strings'); return; }
  if (h.length > 5) push(path, 'max 5 items');
  h.forEach((s, i) => { if (!isStr(s)) push(`${path}[${i}]`, 'must be string'); });
}

function validateFlows(flows, push) {
  if (!Array.isArray(flows)) { push('flows', 'must be array'); return; }
  if (flows.length < 1) push('flows', 'must have at least one flow');
  flows.forEach((f, i) => validateFlow(f, push, `flows[${i}]`));
}

function validateDatabase(d, push) {
  if (!isObj(d)) { push('database', 'must be object'); return; }
  if ('summary' in d && !isStr(d.summary)) push('database.summary', 'must be string');
  validateHighlights(d.highlights, push, 'database.highlights');
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

function validateRoutes(r, push) {
  if (!isObj(r)) { push('routes', 'must be object'); return; }
  if ('summary' in r && !isStr(r.summary)) push('routes.summary', 'must be string');
  if ('scope_note' in r && !isStr(r.scope_note)) push('routes.scope_note', 'must be string');
  if ('stats' in r) {
    if (!isObj(r.stats)) push('routes.stats', 'must be object');
    else for (const k of ['added', 'removed', 'changed', 'net']) {
      if (k in r.stats && !Number.isInteger(r.stats[k])) push(`routes.stats.${k}`, 'must be integer');
    }
  }
  if (!Array.isArray(r.groups)) { push('routes.groups', 'required array'); return; }
  if (r.groups.length < 1) push('routes.groups', 'must have at least one group');
  r.groups.forEach((g, i) => {
    const gp = `routes.groups[${i}]`;
    if (!isObj(g)) { push(gp, 'must be object'); return; }
    if (!isStr(g.title)) push(`${gp}.title`, 'required string');
    if (!Array.isArray(g.routes)) { push(`${gp}.routes`, 'required array'); return; }
    if (g.routes.length < 1) push(`${gp}.routes`, 'must have at least one route');
    g.routes.forEach((route, j) => validateRouteItem(route, push, `${gp}.routes[${j}]`));
  });
}

function validateRouteItem(route, push, path) {
  if (!isObj(route)) { push(path, 'must be object'); return; }
  if (!ROUTE_METHODS.has(route.method)) push(`${path}.method`, `must be one of ${[...ROUTE_METHODS].join('|')}`);
  if (!isStr(route.path)) push(`${path}.path`, 'required string');
  if (!ROUTE_STATUSES.has(route.status)) push(`${path}.status`, `must be one of ${[...ROUTE_STATUSES].join('|')}`);
  if (!isStr(route.summary)) push(`${path}.summary`, 'required string');
  for (const k of ['details', 'auth', 'data', 'replacement', 'review_focus']) {
    if (k in route && !isStr(route[k])) push(`${path}.${k}`, 'must be string');
  }
  for (const k of ['files', 'tests']) {
    if (k in route) {
      if (!Array.isArray(route[k])) push(`${path}.${k}`, 'must be array');
      else route[k].forEach((v, i) => { if (!isStr(v)) push(`${path}.${k}[${i}]`, 'must be string'); });
    }
  }
  if ('parameters' in route) {
    if (!Array.isArray(route.parameters)) push(`${path}.parameters`, 'must be array');
    else route.parameters.forEach((p, i) => validateRouteParam(p, push, `${path}.parameters[${i}]`));
  }
  if ('request_body' in route) validateRouteBody(route.request_body, push, `${path}.request_body`);
  if ('responses' in route) {
    if (!Array.isArray(route.responses)) push(`${path}.responses`, 'must be array');
    else route.responses.forEach((resp, i) => validateRouteResponse(resp, push, `${path}.responses[${i}]`));
  }
}

function validateRouteParam(p, push, path) {
  if (!isObj(p)) { push(path, 'must be object'); return; }
  if (!isStr(p.name)) push(`${path}.name`, 'required string');
  if (!ROUTE_PARAM_IN.has(p.in)) push(`${path}.in`, `must be one of ${[...ROUTE_PARAM_IN].join('|')}`);
  if ('required' in p && !isBool(p.required)) push(`${path}.required`, 'must be boolean');
  if ('type' in p && !isStr(p.type)) push(`${path}.type`, 'must be string');
  if (!isStr(p.description)) push(`${path}.description`, 'required string');
}

function validateRouteBody(b, push, path) {
  if (!isObj(b)) { push(path, 'must be object'); return; }
  if ('required' in b && !isBool(b.required)) push(`${path}.required`, 'must be boolean');
  if ('type' in b && !isStr(b.type)) push(`${path}.type`, 'must be string');
  if (!isStr(b.description)) push(`${path}.description`, 'required string');
  if ('content_type' in b && !isStr(b.content_type)) push(`${path}.content_type`, 'must be string');
}

function validateRouteResponse(r, push, path) {
  if (!isObj(r)) { push(path, 'must be object'); return; }
  if (!isStr(r.code)) push(`${path}.code`, 'required string');
  if (!isStr(r.description)) push(`${path}.description`, 'required string');
  if ('content_type' in r && !isStr(r.content_type)) push(`${path}.content_type`, 'must be string');
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
