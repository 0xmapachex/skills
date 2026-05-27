#!/usr/bin/env node
// Capture screenshots for a pr-overview spec.
//
// Reads a spec JSON, finds every image entry with a `route` (or a `src`
// that's already an http(s) URL with no local file), launches a headless
// chromium via Playwright, navigates, waits, screenshots, and writes the
// resulting PNG paths back into the spec.
//
// Service lifecycle is intentionally NOT this script's job. Start your dev
// server first (`scripts/dev.sh`, `npm run dev`, `docker compose up`, etc.);
// this script just expects the URLs to respond. If you need authentication,
// pass --storage-state path/to/state.json — Playwright loads cookies +
// localStorage from it before navigating.
//
// Usage:
//   node scripts/capture.mjs <spec.json> [--base-url URL] [--out-dir DIR]
//                            [--storage-state PATH] [--in-place]
//
// Output:
//   - PNGs in <out-dir> (default tmp/screenshots/, next to the spec)
//   - <spec>.captured.json next to the input (or in-place with --in-place)
//
// Cookies / auth tip: log in once in a real browser session that Playwright
// drives via `npx playwright codegen`, save its storage state, then pass
// --storage-state to subsequent captures. Or seed a dev user that's
// auto-logged-in in your local environment.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve, join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';

const DEFAULT_VIEWPORT = { width: 1440, height: 900 };
const DEFAULT_BASE_URL = 'http://localhost:3000';
const DEFAULT_TIMEOUT_MS = 20000;

function parseArgs(argv) {
  const args = {
    spec: null,
    baseUrl: DEFAULT_BASE_URL,
    outDir: null,
    storageState: null,
    inPlace: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--base-url')          args.baseUrl = argv[++i];
    else if (a === '--out-dir')      args.outDir = argv[++i];
    else if (a === '--storage-state')args.storageState = argv[++i];
    else if (a === '--in-place')     args.inPlace = true;
    else if (a === '--help' || a === '-h') args.help = true;
    else if (!args.spec) args.spec = a;
  }
  return args;
}

function usage() {
  console.log([
    'usage: node scripts/capture.mjs <spec.json> [options]',
    '',
    'options:',
    `  --base-url URL          base URL for entries with a "route" (default ${DEFAULT_BASE_URL})`,
    '  --out-dir DIR           directory to write PNGs (default screenshots/ next to spec)',
    '  --storage-state PATH    Playwright storage state file (auth cookies + localStorage)',
    '  --in-place              rewrite the input spec; otherwise writes <spec>.captured.json',
    '  --help                  show this help',
  ].join('\n'));
}

// Walk the spec, collect every image entry that needs capture. Returns a
// flat array of { ref, item } where `ref` is a function that mutates the
// original spec when capture finishes. Keeping mutation behind a callback
// avoids hard-coding traversal paths everywhere.
function collectTargets(spec) {
  const targets = [];
  const consider = (img, location) => {
    if (!img || typeof img !== 'object') return;
    const hasLocalSrc = typeof img.src === 'string'
      && img.src.length > 0
      && !/^https?:/i.test(img.src);
    const needsCapture = !!img.route || (!img.src && !hasLocalSrc);
    if (needsCapture) targets.push({ img, location });
  };
  const visitList = (list, label) => {
    if (!Array.isArray(list)) return;
    list.forEach((img, i) => consider(img, `${label}[${i}]`));
  };
  visitList(spec.screenshots?.items, 'screenshots.items');
  if (Array.isArray(spec.summary?.topics)) {
    spec.summary.topics.forEach((t, i) => visitList(t.images, `summary.topics[${i}].images`));
  }
  visitList(spec.flow?.images, 'flow.images');
  if (Array.isArray(spec.flows)) {
    spec.flows.forEach((f, i) => visitList(f.images, `flows[${i}].images`));
  }
  if (spec.architecture?.details) {
    for (const [id, d] of Object.entries(spec.architecture.details)) {
      visitList(d?.images, `architecture.details.${id}.images`);
    }
  }
  return targets;
}

function slugFor(img, idx) {
  const seed = img.caption || img.alt || img.route || `screenshot-${idx + 1}`;
  return seed
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || `screenshot-${idx + 1}`;
}

function urlFor(img, baseUrl) {
  if (img.route) {
    const base = baseUrl.replace(/\/$/, '');
    const route = img.route.startsWith('/') ? img.route : `/${img.route}`;
    return base + route;
  }
  // Fallback: spec author put an http(s) URL directly in src.
  if (typeof img.src === 'string' && /^https?:/i.test(img.src)) return img.src;
  return null;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.spec) { usage(); process.exit(args.help ? 0 : 2); }

  const specPath = resolve(args.spec);
  const specDir = dirname(specPath);
  const spec = JSON.parse(readFileSync(specPath, 'utf8'));

  const targets = collectTargets(spec);
  if (!targets.length) {
    console.log('no images need capture (every entry already has a local src or no route).');
    return;
  }

  const outDir = args.outDir
    ? resolve(args.outDir)
    : join(specDir, 'screenshots');
  mkdirSync(outDir, { recursive: true });

  // Lazy-import Playwright so users who don't capture don't need it installed.
  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch (_) {
    console.error(`playwright is not installed.

Install with one of:
  npm i -D playwright && npx playwright install chromium
  pnpm add -D playwright && pnpm exec playwright install chromium
  yarn add -D playwright && yarn playwright install chromium

Or skip capture and provide screenshot paths directly via the spec's
image.src field (any PNG/JPG/SVG path relative to the spec file works).`);
    process.exit(1);
  }

  const browser = await chromium.launch();
  const contextOpts = {};
  if (args.storageState) contextOpts.storageState = resolve(args.storageState);
  const context = await browser.newContext(contextOpts);

  console.log(`capturing ${targets.length} screenshot${targets.length === 1 ? '' : 's'} → ${outDir}`);

  let ok = 0; let fail = 0;
  for (let i = 0; i < targets.length; i++) {
    const { img, location } = targets[i];
    const url = urlFor(img, args.baseUrl);
    if (!url) {
      console.warn(`  skip ${location}: no route or http src`);
      fail += 1;
      continue;
    }
    const slug = slugFor(img, i);
    const file = join(outDir, `${slug}.png`);
    const vp = { ...DEFAULT_VIEWPORT, ...(img.viewport || {}) };
    const page = await context.newPage();
    await page.setViewportSize(vp);
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: DEFAULT_TIMEOUT_MS });
      if (img.wait_for && img.wait_for !== 'networkidle') {
        await page.waitForSelector(img.wait_for, { timeout: DEFAULT_TIMEOUT_MS });
      }
      await page.screenshot({ path: file, fullPage: !!img.full_page });
      // Rewrite src to a path relative to the spec file so the rendered
      // HTML can resolve + inline it.
      img.src = relativeFromSpec(specPath, file);
      console.log(`  ✓ ${slug}.png  ${location}`);
      ok += 1;
    } catch (err) {
      console.error(`  ✗ ${slug}: ${err.message}`);
      fail += 1;
    } finally {
      await page.close();
    }
  }

  await context.close();
  await browser.close();

  const outSpec = args.inPlace
    ? specPath
    : specPath.replace(/\.json$/i, '.captured.json');
  writeFileSync(outSpec, JSON.stringify(spec, null, 2) + '\n', 'utf8');
  console.log(`wrote ${outSpec}`);
  console.log(`${ok} captured · ${fail} failed`);
  if (fail > 0) process.exitCode = 1;
}

// Path of `file` relative to the directory containing `specPath`, normalised
// to forward slashes so it's portable when the spec moves machines.
function relativeFromSpec(specPath, file) {
  return relative(dirname(specPath), file).split(/\\/g).join('/');
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
