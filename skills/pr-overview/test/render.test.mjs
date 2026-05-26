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

test('only well-known external resources are referenced (fonts + mermaid)', () => {
  const html = renderToString(FIXTURE);
  // Allowed externals: Google Fonts <link>, jsDelivr Mermaid <script>.
  // Anything else is a regression.
  const ALLOWED = /fonts\.googleapis\.com|fonts\.gstatic\.com|cdn\.jsdelivr\.net\/npm\/mermaid/;
  const linkMatches = html.match(/<link\s+[^>]*href="([^"]+)"/g) || [];
  const scriptMatches = html.match(/<script\s+[^>]*src="([^"]+)"/g) || [];
  const bad = [...linkMatches, ...scriptMatches].filter((m) => !ALLOWED.test(m));
  assert.deepEqual(bad, [], 'unexpected external resource(s): ' + bad.join(', '));
});

test('throws on invalid spec', () => {
  const bad = { meta: {} };
  assert.throws(() => renderToString(bad), /required/);
});
