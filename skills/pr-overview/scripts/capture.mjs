#!/usr/bin/env node
// Capture screenshots for a pr-overview spec.
//
// Reads a spec JSON, finds every image entry with a `route` (or a `src`
// that's already an http(s) URL with no local file), drives gstack's
// /browse binary (persistent headless Chromium daemon, ~100ms per command
// after a one-time ~3s start), navigates, waits, screenshots, and writes
// the resulting PNG paths back into the spec.
//
// Service lifecycle is intentionally NOT this script's job. Start your dev
// server first (`scripts/dev.sh`, `npm run dev`, `docker compose up`, etc.);
// this script just expects the URLs to respond.
//
// Auth: the browse daemon persists cookies across runs. If a route
// redirects to /login, the script emits a `capture_error` on that image
// and exits non-zero with one-time instructions on how to authenticate
// inside the same daemon (one `handoff` to a visible Chrome, log in
// manually, then re-run capture — subsequent captures reuse the cookies).
//
// Usage:
//   node scripts/capture.mjs <spec.json> [--base-url URL] [--out-dir DIR]
//                            [--in-place] [--no-install]
//
// Output:
//   - PNGs in <out-dir> (default screenshots/ next to the spec)
//   - <spec>.captured.json next to the input (or in-place with --in-place)
//
// Why /browse (not Playwright):
//   - One binary, no per-project node_modules write, no 250MB chromium
//     install per consumer.
//   - Cookie persistence by default — no `storage-state` ceremony.
//   - Auth handoff is one command (`browse handoff` → user logs in →
//     `browse resume`) — no `playwright codegen` recording.
//   - Already a dependency for most gstack workflows; pr-overview just
//     leans on the same install.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const DEFAULT_VIEWPORT = { width: 1440, height: 900 };
const DEFAULT_BASE_URL = 'http://localhost:3000';
const DEFAULT_TIMEOUT_MS = 20000;

const GSTACK_REPO = 'https://github.com/garrytan/gstack.git';
const GSTACK_HOME_DIR = join(homedir(), '.claude/skills/gstack');
const BUN_INSTALL_SHA = 'bab8acfb046aac8c72407bdcce903957665d655d7acaa3e11c7c4616beae68dd';
const BUN_VERSION = '1.3.10';

function parseArgs(argv) {
  const args = {
    spec: null,
    baseUrl: DEFAULT_BASE_URL,
    outDir: null,
    inPlace: false,
    noInstall: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--base-url')          args.baseUrl = argv[++i];
    else if (a === '--out-dir')      args.outDir = argv[++i];
    else if (a === '--in-place')     args.inPlace = true;
    else if (a === '--no-install')   args.noInstall = true;
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
    `  --base-url URL    base URL for entries with a "route" (default ${DEFAULT_BASE_URL})`,
    '  --out-dir DIR     directory to write PNGs (default screenshots/ next to spec)',
    '  --in-place        rewrite the input spec; otherwise writes <spec>.captured.json',
    '  --no-install      fail instead of auto-installing gstack if /browse missing',
    '  --help            show this help',
    '',
    'auth: if a route redirects to /login, the captured spec records the',
    'error per-image and exits 1. Authenticate inside the browse daemon once:',
    '  <browse-binary> handoff "log into <your-dev-url>"',
    '  # log in in the Chrome window that opened',
    '  <browse-binary> resume',
    '  # then rerun capture — cookies persist across calls',
  ].join('\n'));
}

// ─── gstack /browse resolution + (optional) auto-install ────────────────────

function findBrowseBinary() {
  // 1. Worktree-local (vendored) gstack — when a project ships its own copy.
  const gitTop = spawnSync('git', ['rev-parse', '--show-toplevel'], {
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  if (gitTop.status === 0) {
    const top = gitTop.stdout.toString().trim();
    const local = join(top, '.claude/skills/gstack/browse/dist/browse');
    if (existsSync(local)) return local;
  }
  // 2. Global install.
  const global = join(GSTACK_HOME_DIR, 'browse/dist/browse');
  if (existsSync(global)) return global;
  return null;
}

function hasCommand(cmd) {
  return spawnSync('command', ['-v', cmd], { shell: true, stdio: 'ignore' }).status === 0;
}

function installBun() {
  if (hasCommand('bun')) return true;
  console.error('[capture] bun not found — installing one-time (checksum-verified)...');
  // Match the install pattern documented in gstack's own setup script.
  const script = `
    set -e
    tmpfile=$(mktemp)
    curl -fsSL https://bun.sh/install -o "$tmpfile"
    actual=$(shasum -a 256 "$tmpfile" | awk '{print $1}')
    if [ "$actual" != "${BUN_INSTALL_SHA}" ]; then
      echo "ERROR: bun install script checksum mismatch" >&2
      echo "  expected: ${BUN_INSTALL_SHA}" >&2
      echo "  got:      $actual" >&2
      rm "$tmpfile"
      exit 1
    fi
    BUN_VERSION="${BUN_VERSION}" bash "$tmpfile"
    rm "$tmpfile"
  `;
  const r = spawnSync('bash', ['-c', script], { stdio: 'inherit' });
  if (r.status !== 0) return false;
  // Bun installs to ~/.bun/bin — surface it for this process.
  process.env.PATH = `${homedir()}/.bun/bin:${process.env.PATH ?? ''}`;
  return hasCommand('bun');
}

function installGstack() {
  if (!existsSync(GSTACK_HOME_DIR)) {
    console.error(`[capture] cloning gstack into ${GSTACK_HOME_DIR}...`);
    mkdirSync(dirname(GSTACK_HOME_DIR), { recursive: true });
    const r = spawnSync('git', ['clone', '--depth=1', GSTACK_REPO, GSTACK_HOME_DIR], {
      stdio: 'inherit',
    });
    if (r.status !== 0) throw new Error('gstack clone failed');
  }
  if (!installBun()) throw new Error('bun install failed');
  console.error('[capture] running gstack setup (builds browse binary, ~30s)...');
  const r = spawnSync('bash', ['./setup'], {
    cwd: GSTACK_HOME_DIR,
    stdio: 'inherit',
  });
  if (r.status !== 0) throw new Error('gstack setup failed');
  const bin = findBrowseBinary();
  if (!bin) throw new Error('browse binary still missing after gstack setup');
  return bin;
}

function ensureBrowse({ noInstall }) {
  let bin = findBrowseBinary();
  if (bin) return bin;
  if (noInstall) {
    console.error([
      'gstack /browse binary not found and --no-install was passed.',
      '',
      'Install gstack manually:',
      `  git clone ${GSTACK_REPO} ${GSTACK_HOME_DIR}`,
      `  cd ${GSTACK_HOME_DIR} && ./setup`,
      '',
      'Or rerun without --no-install to auto-install (one-time, ~30s).',
    ].join('\n'));
    process.exit(2);
  }
  console.error('[capture] gstack /browse not installed — bootstrapping (one-time)...');
  return installGstack();
}

// Thin wrapper around the browse binary. Each call is a separate process,
// but the daemon (started on first `goto`) lives across them — that's how
// cookies + tabs persist between captures.
function browse(bin, ...args) {
  const r = spawnSync(bin, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
  });
  return {
    code: r.status ?? -1,
    stdout: (r.stdout ?? '').trim(),
    stderr: (r.stderr ?? '').trim(),
  };
}

// ─── Spec walking + helpers (unchanged from the prior version) ──────────────

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
  if (typeof img.src === 'string' && /^https?:/i.test(img.src)) return img.src;
  return null;
}

function relativeFromSpec(specPath, file) {
  return relative(dirname(specPath), file).split(/\\/g).join('/');
}

// Login-redirect heuristic: route doesn't mention /login but the final URL
// does. Catches the silent-success-on-login-page failure mode that lets
// every captured screenshot become the same login screen.
function looksLikeLoginRedirect(routePath, finalUrl) {
  try {
    const u = new URL(finalUrl);
    const finalPath = u.pathname.toLowerCase();
    const reqPath = (routePath || '').split('?')[0].toLowerCase();
    const loginRe = /\/(login|signin|sign-in|signup|sign-up|auth)\b/;
    return loginRe.test(finalPath) && !loginRe.test(reqPath);
  } catch {
    return false;
  }
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

  const $B = ensureBrowse({ noInstall: args.noInstall });
  console.log(`capturing ${targets.length} screenshot${targets.length === 1 ? '' : 's'} → ${outDir}`);
  console.log(`  via ${$B}`);

  // Track current viewport so we only call `viewport WxH` when it changes.
  let currentVp = null;

  let ok = 0;
  let fail = 0;
  let authNeeded = 0;

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
    const vpKey = `${vp.width}x${vp.height}`;
    if (vpKey !== currentVp) {
      const r = browse($B, 'viewport', vpKey);
      if (r.code !== 0) {
        console.error(`  ✗ ${slug}: viewport set failed: ${r.stderr || r.stdout}`);
        fail += 1;
        continue;
      }
      currentVp = vpKey;
    }

    const goto = browse($B, 'goto', url);
    if (goto.code !== 0) {
      console.error(`  ✗ ${slug}: goto failed: ${goto.stderr || goto.stdout}`);
      img.capture_error = `goto_failed: ${goto.stderr || goto.stdout}`.slice(0, 240);
      fail += 1;
      continue;
    }

    // Settle the page — networkidle has a 15s timeout in browse, which is
    // fine for any reasonable dev server.
    browse($B, 'wait', '--networkidle');

    const requestedPath = new URL(url).pathname + (new URL(url).search || '');
    const finalUrl = browse($B, 'url').stdout || url;
    if (looksLikeLoginRedirect(requestedPath, finalUrl)) {
      console.error(`  ✗ ${slug}: redirected to ${finalUrl} (auth required)`);
      img.capture_error = `auth_redirected_to:${finalUrl}`;
      authNeeded += 1;
      continue;
    }

    if (img.wait_for && img.wait_for !== 'networkidle') {
      browse($B, 'wait', img.wait_for);
    }

    const shot = browse($B, 'screenshot', file);
    if (shot.code !== 0) {
      console.error(`  ✗ ${slug}: screenshot failed: ${shot.stderr || shot.stdout}`);
      img.capture_error = `screenshot_failed: ${shot.stderr || shot.stdout}`.slice(0, 240);
      fail += 1;
      continue;
    }

    img.src = relativeFromSpec(specPath, file);
    delete img.capture_error;
    console.log(`  ✓ ${slug}.png  ${location}`);
    ok += 1;
  }

  const outSpec = args.inPlace
    ? specPath
    : specPath.replace(/\.json$/i, '.captured.json');
  writeFileSync(outSpec, JSON.stringify(spec, null, 2) + '\n', 'utf8');
  console.log(`wrote ${outSpec}`);
  console.log(`${ok} captured · ${fail} failed${authNeeded ? ` · ${authNeeded} need auth` : ''}`);

  if (authNeeded > 0) {
    console.error([
      '',
      `${authNeeded} route(s) redirected to a login page.`,
      'Authenticate once inside the same browse daemon (cookies persist):',
      '',
      `  ${$B} handoff "log in to your dev app"`,
      '  # log in in the Chrome window that opened',
      `  ${$B} resume`,
      '',
      'Then rerun this capture command — the subsequent navigations will',
      'reuse the session cookies.',
    ].join('\n'));
  }

  if (fail > 0 || authNeeded > 0) process.exitCode = 1;
}

// capture.mjs is only ever invoked directly (never imported). Always run
// main(). The previous "if (import.meta.url === pathToFileURL(...))" guard
// silently no-op'd on macOS, where /tmp resolves to /private/tmp and the
// two paths never agreed.
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
