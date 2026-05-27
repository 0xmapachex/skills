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

test('rejects unknown top-level key (code_observations is no longer supported)', () => {
  const bad = { ...FIXTURE, code_observations: { items: [] } };
  const { errors, valid } = validate(bad);
  assert.equal(valid, false);
  assert.ok(errors.some((e) => /unknown key: code_observations/.test(e)), errors.join('\n'));
});

test('rejects architecture as null', () => {
  const bad = { ...FIXTURE, architecture: null };
  const { errors, valid } = validate(bad);
  assert.equal(valid, false);
  assert.ok(errors.some((e) => /^architecture: must be object/.test(e)), errors.join('\n'));
});

test('accepts screenshots section with src + alt', () => {
  const ok = JSON.parse(JSON.stringify(FIXTURE));
  ok.screenshots = {
    items: [{ src: 'shot.png', alt: 'a homepage' }],
  };
  assert.deepEqual(validate(ok).errors, []);
});

test('accepts screenshots section with route only (capture-pending)', () => {
  const ok = JSON.parse(JSON.stringify(FIXTURE));
  ok.screenshots = {
    items: [{ route: '/welcome', alt: 'welcome page' }],
  };
  assert.deepEqual(validate(ok).errors, []);
});

test('rejects screenshots item missing alt', () => {
  const bad = JSON.parse(JSON.stringify(FIXTURE));
  bad.screenshots = { items: [{ src: 'shot.png' }] };
  const { errors } = validate(bad);
  assert.ok(errors.some((e) => /screenshots\.items\[0\]\.alt/.test(e)), errors.join('\n'));
});

test('rejects screenshots item with neither src nor route', () => {
  const bad = JSON.parse(JSON.stringify(FIXTURE));
  bad.screenshots = { items: [{ alt: 'no source' }] };
  const { errors } = validate(bad);
  assert.ok(
    errors.some((e) => /must have either `src` .* or `route`/.test(e)),
    errors.join('\n')
  );
});

test('accepts inline images on summary.topics', () => {
  const ok = JSON.parse(JSON.stringify(FIXTURE));
  ok.summary.topics = [
    {
      title: 'A',
      summary: 'a',
      images: [{ src: 'a.png', alt: 'a' }],
    },
  ];
  assert.deepEqual(validate(ok).errors, []);
});

test('accepts routes section with query params, body, responses, and stats', () => {
  const ok = JSON.parse(JSON.stringify(FIXTURE));
  ok.routes = {
    summary: 'This PR adds one endpoint and changes another.',
    scope_note: '`/v1/old` already exists on the base branch.',
    stats: { added: 1, removed: 0, changed: 1, net: 1 },
    groups: [
      {
        title: 'Added · API',
        routes: [
          {
            method: 'GET',
            path: '/v1/things',
            status: 'added',
            summary: 'Lists things.',
            parameters: [
              { name: 'q', in: 'query', required: false, type: 'string', description: 'Search query.' },
            ],
            responses: [
              { code: '200', description: 'successful operation', content_type: 'application/json', example: { items: [] } },
            ],
          },
          {
            method: 'POST',
            path: '/v1/things',
            status: 'changed',
            summary: 'Creates a thing.',
            request_body: {
              required: true,
              type: 'object',
              description: 'Thing create body.',
              content_type: 'application/json',
              example: { name: 'thing' },
            },
            responses: [
              { code: '200', description: 'successful operation', example: { ok: true } },
              { code: '400', description: 'validation error', example: { error: 'validation_failed' } },
            ],
          },
        ],
      },
    ],
  };
  assert.deepEqual(validate(ok).errors, []);
});

test('rejects routes item with invalid method', () => {
  const bad = JSON.parse(JSON.stringify(FIXTURE));
  bad.routes = {
    groups: [
      {
        title: 'Bad',
        routes: [{ method: 'FETCH', path: '/v1/nope', status: 'added', summary: 'Nope.' }],
      },
    ],
  };
  const { errors } = validate(bad);
  assert.ok(errors.some((e) => /routes\.groups\[0\]\.routes\[0\]\.method/.test(e)), errors.join('\n'));
});

test('rejects more than 12 images in a single list', () => {
  const bad = JSON.parse(JSON.stringify(FIXTURE));
  bad.screenshots = {
    items: Array.from({ length: 13 }, (_, i) => ({ src: `s${i}.png`, alt: `s${i}` })),
  };
  const { errors } = validate(bad);
  assert.ok(errors.some((e) => /screenshots\.items: max 12/.test(e)), errors.join('\n'));
});
