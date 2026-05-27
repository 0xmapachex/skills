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

// 1×1 transparent PNG, base64-encoded.
const TINY_PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';

function withImageFixture(spec, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'pr-overview-img-'));
  const imgPath = join(dir, 'tiny.png');
  writeFileSync(imgPath, Buffer.from(TINY_PNG_B64, 'base64'));
  const specPath = join(dir, 'spec.json');
  const outPath = join(dir, 'out.html');
  writeFileSync(specPath, JSON.stringify(spec));
  render(specPath, outPath);
  const html = readFileSync(outPath, 'utf8');
  rmSync(dir, { recursive: true, force: true });
  return fn(html);
}

test('inlines local image src as base64 data URI', () => {
  const spec = JSON.parse(JSON.stringify(FIXTURE));
  spec.screenshots = {
    items: [{ src: 'tiny.png', alt: 'tiny' }],
  };
  withImageFixture(spec, (html) => {
    assert.ok(
      html.includes(`data:image/png;base64,${TINY_PNG_B64}`),
      'base64 data URI not found in output'
    );
    // Original relative path should NOT appear inside the spec payload —
    // the inliner rewrote it.
    assert.ok(
      !html.includes('"src":"tiny.png"'),
      'unrewritten src leaked into output'
    );
  });
});

test('http(s) image src passes through unchanged', () => {
  const spec = JSON.parse(JSON.stringify(FIXTURE));
  spec.screenshots = {
    items: [{ src: 'https://example.com/x.png', alt: 'remote' }],
  };
  const html = renderToString(spec);
  assert.ok(html.includes('https://example.com/x.png'), 'remote URL not preserved');
});

test('renders a stub when src is missing (capture pending)', () => {
  const spec = JSON.parse(JSON.stringify(FIXTURE));
  spec.screenshots = {
    items: [{ route: '/welcome', alt: 'welcome' }],
  };
  const html = renderToString(spec);
  assert.ok(html.includes('screenshot pending'), 'no placeholder rendered for src-less image');
});

test('JS source registers screenshots section + lightbox', () => {
  const html = renderToString(FIXTURE);
  // Both anchors should be present in the inlined JS even when the section
  // isn't used in this spec — the dispatch table is static.
  assert.ok(html.includes('section-screenshots'), 'screenshots anchor missing');
  assert.ok(html.includes('data-image-zoom'), 'lightbox hook missing');
});
