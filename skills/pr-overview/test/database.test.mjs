import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render } from '../scripts/render.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_FIXTURE = JSON.parse(
  readFileSync(join(__dirname, '..', 'examples', 'db-migration-pr-spec.json'), 'utf8')
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

test('db fixture is valid', () => {
  // render() throws on invalid spec; reaching this line means valid.
  assert.doesNotThrow(() => renderHTML(DB_FIXTURE));
});

test('db renderer ships field-row class wiring', () => {
  const html = renderHTML(DB_FIXTURE);
  assert.ok(html.includes("'field-row'"), 'field-row class wiring missing');
  assert.ok(html.includes("'field-row is-added'"), 'added row class missing');
});

test('db renderer draws relations on canvas', () => {
  const html = renderHTML(DB_FIXTURE);
  assert.ok(html.includes('drawRelations'), 'drawRelations helper missing');
});
