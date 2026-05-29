#!/usr/bin/env node
// Render a pr-overview spec JSON into a self-contained HTML file.
// Usage: node scripts/render.mjs <spec.json> [--out <path>]

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve, extname, isAbsolute } from 'node:path';
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

const MIME_BY_EXT = {
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.webp': 'image/webp',
  '.svg':  'image/svg+xml',
};

function readIfExists(p) {
  return existsSync(p) ? readFileSync(p, 'utf8') : '';
}

// Inline a local image path as a data: URI so the rendered HTML stays fully
// offline. http(s) URLs are passed through unchanged — they'll resolve when
// the page is viewed online, but the HTML is no longer self-contained. Local
// paths are resolved relative to the spec file's directory (most common
// authoring shape: spec.json + screenshots/ sibling). The helper logs a
// warning and returns the original src on failure so the render still ships.
function inlineImageSrc(src, specDir, warn) {
  if (!src || typeof src !== 'string') return src;
  if (/^https?:/i.test(src) || /^data:/i.test(src)) return src;
  const abs = isAbsolute(src) ? src : resolve(specDir, src);
  if (!existsSync(abs)) {
    warn(`image not found: ${src} (looked at ${abs})`);
    return src;
  }
  const ext = extname(abs).toLowerCase();
  const mime = MIME_BY_EXT[ext];
  if (!mime) {
    warn(`unsupported image extension: ${src}`);
    return src;
  }
  const buf = readFileSync(abs);
  if (mime === 'image/svg+xml') {
    // SVG is text; embed as utf8-encoded data URI for smaller output than
    // base64 and so the inspector shows readable markup.
    return `data:${mime};utf8,${encodeURIComponent(buf.toString('utf8'))}`;
  }
  return `data:${mime};base64,${buf.toString('base64')}`;
}

// Walk the spec and rewrite every image item's `src` in place. Returns the
// number of images touched (for the CLI summary line). The spec is the JSON
// object the user authored — we don't mutate the file on disk, only the
// in-memory copy that gets stringified into the HTML.
function inlineSpecImages(spec, specDir, warn) {
  let count = 0;
  const visit = (img) => {
    if (!img || typeof img !== 'object') return;
    const before = img.src;
    img.src = inlineImageSrc(img.src, specDir, warn);
    if (img.src && img.src !== before) count += 1;
  };
  const visitList = (list) => Array.isArray(list) && list.forEach(visit);

  if (spec.screenshots?.items) visitList(spec.screenshots.items);
  if (Array.isArray(spec.summary?.topics)) spec.summary.topics.forEach((t) => visitList(t.images));
  if (spec.flow?.images) visitList(spec.flow.images);
  if (Array.isArray(spec.flows)) spec.flows.forEach((f) => visitList(f.images));
  if (spec.architecture?.details) {
    for (const d of Object.values(spec.architecture.details)) {
      visitList(d?.images);
    }
  }
  return count;
}

export function render(specPath, outPath) {
  const spec = JSON.parse(readFileSync(specPath, 'utf8'));
  const { valid, errors } = validate(spec);
  if (!valid) {
    throw new Error(`invalid spec:\n  - ${errors.join('\n  - ')}`);
  }

  const warnings = [];
  const inlined = inlineSpecImages(spec, dirname(resolve(specPath)), (m) => warnings.push(m));
  if (warnings.length) {
    for (const w of warnings) console.warn(`warn: ${w}`);
  }

  const template = readFileSync(TEMPLATE_PATH, 'utf8');
  const css      = readIfExists(CSS_PATH);
  const panzoom  = readIfExists(PANZOOM_PATH);
  const js       = readIfExists(JS_PATH);

  // Use function replacements so `$`-sequences in the injected payloads are
  // inserted literally. `String.prototype.replace` with a *string* second arg
  // interprets `$&`, `` $` ``, `$'`, `$$`, `$n` as special replacement
  // patterns — e.g. a spec containing the regex `^[A-Z]+$` wrapped in
  // backticks emits `` $` `` (dollar-backtick) in the JSON, which `replace`
  // expands to "everything before the match", splicing a duplicate copy of the
  // whole template (it duplicated the entire <body>). Function replacements are
  // not subject to `$` substitution, so the payload lands verbatim.
  const html = template
    .replace(CSS_MARK, () => css)
    .replace(DATA_MARK, () => JSON.stringify(spec))
    .replace(JS_MARK, () => `${panzoom}\n;${js}`);

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, html, 'utf8');
  if (inlined > 0) console.log(`inlined ${inlined} image${inlined === 1 ? '' : 's'}`);
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
