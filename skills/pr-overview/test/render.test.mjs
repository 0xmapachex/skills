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

function renderToString(spec) {
  const dir = mkdtempSync(join(tmpdir(), 'pr-overview-'));
  const specPath = join(dir, 'spec.json');
  const outPath = join(dir, 'out.html');
  writeFileSync(specPath, JSON.stringify(spec));
  render(specPath, outPath);
  const html = readFileSync(outPath, 'utf8');
  rmSync(dir, { recursive: true, force: true });
  return html;
}

test('embeds the spec verbatim as window.__PR_OVERVIEW_DATA__', () => {
  const html = renderToString(FIXTURE);
  assert.ok(html.includes(JSON.stringify(FIXTURE)), 'spec JSON not found in output');
});

test('inlines CSS and JS bundles (no external <link> or external <script src>)', () => {
  const html = renderToString(FIXTURE);
  assert.ok(!/<link\s+[^>]*href=/.test(html), 'unexpected external <link>');
  assert.ok(!/<script\s+[^>]*src=/.test(html), 'unexpected external <script src>');
});

test('throws on invalid spec', () => {
  const bad = { meta: {} };
  assert.throws(() => renderToString(bad), /required/);
});
