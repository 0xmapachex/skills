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
  const specPath = join(dir, 's.json');
  const outPath = join(dir, 'o.html');
  writeFileSync(specPath, JSON.stringify(spec));
  render(specPath, outPath);
  const html = readFileSync(outPath, 'utf8');
  rmSync(dir, { recursive: true, force: true });
  return html;
}

test('renders required section anchors', () => {
  const html = renderToString(FIXTURE);
  for (const anchor of ['section-summary', 'section-architecture', 'section-open-questions']) {
    assert.ok(html.includes(`'${anchor}'`), `missing anchor literal '${anchor}' in JS source`);
  }
});

test('does NOT render optional section anchors when absent', () => {
  const html = renderToString(FIXTURE);
  for (const anchor of ['section-flow', 'section-database', 'section-code-observations', 'section-risk-rollout']) {
    assert.ok(!html.includes(`id="${anchor}"`), `unexpected anchor #${anchor} when omitted`);
  }
});

test('renders the title from meta', () => {
  const html = renderToString(FIXTURE);
  assert.ok(html.includes(FIXTURE.meta.title), 'title not rendered');
});

test('renders theme toggle button', () => {
  const html = renderToString(FIXTURE);
  assert.ok(html.includes('data-theme-toggle'), 'theme toggle missing');
});
