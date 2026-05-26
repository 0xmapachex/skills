import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { validate } from '../lib/validate.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = JSON.parse(
  readFileSync(join(__dirname, '..', 'examples', 'feature-pr-spec.json'), 'utf8')
);

test('accepts a valid feature spec', () => {
  assert.deepEqual(validate(FIXTURE).errors, []);
});

test('rejects spec missing meta', () => {
  const bad = { ...FIXTURE };
  delete bad.meta;
  const { errors } = validate(bad);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /required: meta/);
});

test('rejects spec missing architecture.nodes', () => {
  const bad = JSON.parse(JSON.stringify(FIXTURE));
  delete bad.architecture.nodes;
  const { errors } = validate(bad);
  assert.ok(errors.some((e) => /architecture\.nodes/.test(e)), errors.join('\n'));
});

test('rejects unknown architecture node kind', () => {
  const bad = JSON.parse(JSON.stringify(FIXTURE));
  bad.architecture.nodes[0].kind = 'WIDGET';
  const { errors } = validate(bad);
  assert.ok(errors.some((e) => /architecture\.nodes\[0\]\.kind/.test(e)), errors.join('\n'));
});

test('rejects database table field with unknown status', () => {
  const bad = JSON.parse(JSON.stringify(FIXTURE));
  bad.database = {
    tables: [
      {
        id: 't', name: 't', status: 'added',
        fields: [{ name: 'f', type: 'text', status: 'NOPE' }]
      }
    ]
  };
  const { errors } = validate(bad);
  assert.ok(
    errors.some((e) => /database\.tables\[0\]\.fields\[0\]\.status/.test(e)),
    errors.join('\n')
  );
});

test('rejects more than 5 code_observations items', () => {
  const bad = JSON.parse(JSON.stringify(FIXTURE));
  bad.code_observations = {
    items: Array.from({ length: 6 }, (_, i) => ({ title: `o${i}`, kind: 'pattern' }))
  };
  const { errors } = validate(bad);
  assert.ok(errors.some((e) => /code_observations\.items/.test(e)), errors.join('\n'));
});

test('rejects required section with wrong type (summary as array)', () => {
  const bad = { ...FIXTURE, summary: [] };
  const { errors, valid } = validate(bad);
  assert.equal(valid, false);
  assert.ok(errors.some((e) => /^summary: must be object/.test(e)), errors.join('\n'));
});

test('rejects required section with wrong type (meta as string)', () => {
  const bad = { ...FIXTURE, meta: 'oops' };
  const { errors, valid } = validate(bad);
  assert.equal(valid, false);
  assert.ok(errors.some((e) => /^meta: must be object/.test(e)), errors.join('\n'));
});

test('rejects optional section with wrong type (code_observations as string)', () => {
  const bad = { ...FIXTURE, code_observations: 'bad' };
  const { errors, valid } = validate(bad);
  assert.equal(valid, false);
  assert.ok(errors.some((e) => /^code_observations: must be object/.test(e)), errors.join('\n'));
});

test('rejects architecture as null', () => {
  const bad = { ...FIXTURE, architecture: null };
  const { errors, valid } = validate(bad);
  assert.equal(valid, false);
  assert.ok(errors.some((e) => /^architecture: must be object/.test(e)), errors.join('\n'));
});
