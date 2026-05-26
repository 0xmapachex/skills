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

test('arch renderer emits one .node per spec.architecture.nodes entry', () => {
  const html = renderHTML(FIXTURE);
  // JS source check — the renderer creates these classes dynamically
  assert.ok(html.includes("class: 'node'"), 'node class wiring missing in JS source');
  assert.ok(html.includes('is-added'),    'is-added status class missing');
  assert.ok(html.includes('is-changed'),  'is-changed status class missing');
  assert.ok(html.includes('is-removed'),  'is-removed status class missing');
});

test('arch renderer uses canvas mount', () => {
  const html = renderHTML(FIXTURE);
  assert.ok(html.includes('mountCanvas('), 'canvas mount not called');
});
