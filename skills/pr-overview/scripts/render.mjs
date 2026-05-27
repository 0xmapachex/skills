#!/usr/bin/env node
// Render a pr-overview spec JSON into a self-contained HTML file.
// Usage: node scripts/render.mjs <spec.json> [--out <path>]

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validate } from '../lib/validate.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILL_ROOT = resolve(__dirname, '..');

const TEMPLATE_PATH = join(SKILL_ROOT, 'templates', 'overview.html');
const CSS_PATH      = join(SKILL_ROOT, 'lib', 'pr-overview.css');
const JS_PATH       = join(SKILL_ROOT, 'lib', 'pr-overview.js');
const PANZOOM_PATH  = join(SKILL_ROOT, 'lib', 'vendor', 'panzoom.min.js');

const CSS_MARK  = '/* __INLINE_CSS__ */';
const JS_MARK   = '/* __INLINE_JS__ */';
const DATA_MARK = '/* __INLINE_DATA__ */ null';

function readIfExists(p) {
  return existsSync(p) ? readFileSync(p, 'utf8') : '';
}

export function render(specPath, outPath) {
  const spec = JSON.parse(readFileSync(specPath, 'utf8'));
  const { valid, errors } = validate(spec);
  if (!valid) {
    throw new Error(`invalid spec:\n  - ${errors.join('\n  - ')}`);
  }

  const template = readFileSync(TEMPLATE_PATH, 'utf8');
  const css      = readIfExists(CSS_PATH);
  const panzoom  = readIfExists(PANZOOM_PATH);
  const js       = readIfExists(JS_PATH);

  const html = template
    .replace(CSS_MARK, css)
    .replace(DATA_MARK, JSON.stringify(spec))
    .replace(JS_MARK, `${panzoom}\n;${js}`);

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, html, 'utf8');
  return outPath;
}

function parseArgs(argv) {
  const args = { spec: null, out: 'tmp/pr-overview.html' };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out') args.out = argv[++i];
    else if (!args.spec) args.spec = argv[i];
  }
  if (!args.spec) {
    console.error('usage: node scripts/render.mjs <spec.json> [--out <path>]');
    process.exit(2);
  }
  return args;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv.slice(2));
  try {
    const out = render(args.spec, resolve(process.cwd(), args.out));
    console.log(`wrote ${out}`);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
