import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render } from '../scripts/render.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = JSON.parse(
  readFileSync(join(__dirname, '..', 'examples', 'feature-pr-spec.json'), 'utf8')
);

function renderHTML(spec) {
  const dir = mkdtempSync(join(tmpdir(), 'pr-overview-'));
  const sp = join(dir, 's.json'); const op = join(dir, 'o.html');
  writeFileSync(sp, JSON.stringify(spec));
  render(sp, op);
  const html = readFileSync(op, 'utf8');
  rmSync(dir, { recursive: true, force: true });
  return html;
}

test('arch renderer emits Mermaid flowchart syntax with status classDefs', () => {
  const html = renderHTML(FIXTURE);
  assert.ok(html.includes('flowchart LR'),  'mermaid flowchart syntax missing');
  assert.ok(html.includes('classDef added'),   'added classDef missing');
  assert.ok(html.includes('classDef changed'), 'changed classDef missing');
  assert.ok(html.includes('classDef removed'), 'removed classDef missing');
});

test('arch renderer groups nodes by kind in subgraphs', () => {
  const html = renderHTML(FIXTURE);
  // The JS source builds the subgraph identifiers via template literals at
  // runtime — check for the literal template that produces them.
  assert.ok(html.includes('subgraph g_${kind}'), 'subgraph builder template missing');
  assert.ok(html.includes("KIND_ORDER = ['ui', 'service', 'module', 'job', 'datastore', 'external']"), 'kind ordering missing');
});

test('arch renderer wires click handlers to the detail panel', () => {
  const html = renderHTML(FIXTURE);
  assert.ok(html.includes('__archDetailFor'),       'arch detail click handler missing');
  assert.ok(html.includes('click ${sid(n.id)}'),    'mermaid click directive template missing');
});
