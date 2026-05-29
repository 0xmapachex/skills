---
name: pr-overview
description: Generate a complete interactive HTML overview of a PR — executive summary, architecture/UML, optional user-flow, optional database ER (with green/blue/red change coloring), light code observations, rollout risks, open questions. Use when the user asks for a PR overview, PR walkthrough, PR presentation, change visualization, "explain this PR", or "show me what changed in this branch", especially when they want a sharable HTML artifact rather than text. For DB-only overviews prefer pr-db-review-overview.
---

# PR Overview

Generate an interactive, self-contained HTML walkthrough of a pull request.
Output goes to `tmp/pr-overview.html` and is fully offline (CSS, JS, and the
panzoom library are inlined into one file).

## Diff Scope Rule

Always classify changes relative to the PR review range, not the repository's
full history.

- "Added" = introduced by this PR's diff.
- "Changed" = modified by this PR's diff.
- "Removed" = dropped/deleted by this PR's diff.
- Tables/fields/components created by older work are **existing context**.
- Existing context appears in diagrams only when it explains relationships
  (e.g. an FK target of a changed table, or a service a changed component
  calls); never highlighted as added unless this PR actually changes it.
- Before tagging anything as added/changed/removed, verify against
  `git diff <base>...HEAD`, not historical migration/source files.

## Workflow

1. **Identify the review range.**
   - Prefer the PR base branch if known.
   - Otherwise inspect branches/remotes and compute `git merge-base` against
     the likely base.
   - If you cannot infer it, **ask the user**. Do not silently default to
     `main`.
   - **Never diff against a local branch without confirming it's current
     with its remote.** A stale local `main` (behind `origin/main` by N
     commits) silently inflates the diff: you get the whole backlog of
     already-merged work, not the PR. `git fetch` first, then diff against
     `origin/main` (or the real base), not the local ref. Tell-tale sign:
     `git log <base>..HEAD` shows release/merge commits that obviously
     predate this PR.
   - **Sanity-check the file count against expectation.** If the diff is far
     larger than the PR should be (hundreds of files for a small feature),
     stop — the base is wrong. Two usual causes: (a) a stale local base ref,
     or (b) the PR actually targets a different base branch than `main`
     (a stacked/feature base, or a fork). Confirm the base with the user
     before building the spec rather than describing the wrong range.

2. **Read the diff AND the commit history.**
   - `git diff --stat`, `git diff --name-only`, then focused
     `git diff <base>...HEAD -- <path>` for the files that matter.
   - Also `git log <base>..HEAD --oneline --no-merges` to see how the
     branch was assembled. If the conventional-commit `type(scope):`
     prefixes diverge from the PR title's scope, the branch bundles
     work that did not land on the base as separate PRs — pre-render
     check #9 will require you to attribute each bundled theme to its
     originating commit instead of folding everything under the title.

3. **Detect which optional sections apply.** See "Section triggers" below.

4. **Emit `tmp/pr-overview-spec.json`.** A single JSON document matching
   `skills/pr-overview/schema/pr-overview.schema.json`. The validator inside
   `render.mjs` will reject malformed specs with precise paths — fix the
   spec until it validates.

5. **Pre-render verification (HARD — DO NOT SKIP).** Before rendering,
   run the checklist in "Pre-render verification" below. Every number,
   named surface, and cross-reference in the spec must be traceable to
   the diff. Resolve mismatches by fixing the spec, not by ignoring the
   check.

6. **(UI-heavy PRs) Capture screenshots.** When the spec carries image
   entries with `route` set, run the capture script after the dev server
   is up:

   ```bash
   node skills/pr-overview/scripts/capture.mjs tmp/pr-overview-spec.json \
        --base-url http://localhost:3000
   ```

   Produces `tmp/pr-overview-spec.captured.json` with image `src` paths
   filled in. See "Screenshots" below for the full workflow + auth
   options. Skip this step only when the spec has no image entries with
   a `route` (i.e. the `screenshots` section was correctly omitted per
   the trigger rule, or every image already has a hand-supplied `src`).

7. **Render:**

   ```bash
   node skills/pr-overview/scripts/render.mjs \
        tmp/pr-overview-spec.captured.json \
        --out tmp/pr-overview.html
   ```

   (Use the original `tmp/pr-overview-spec.json` directly when no
   captures ran.)

8. **Report.** Print the path to the user, and a short text recap
   mirroring the spec's `summary.tldr` + `summary.ships`. Offer to open
   in browser if the environment supports it.

## Required vs optional sections

**Always include:** `meta`, `summary`, `architecture`, `open_questions`.

**Optional sections — include only when triggered.** Omit the key entirely
(don't include empty objects).

| Section            | Trigger (any of)                                                                                                                                                                            |
|--------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `database`         | Diff touches `*.sql`, `**/migrations/**`, `drizzle/schema.ts`, `prisma/schema.prisma`, ORM model files, seed scripts, or columns referenced in new query projections.                       |
| `flow` / `flows`   | Diff adds/changes a route handler, webhook, queue consumer, cron, RPC method, state machine, or multi-step async dance (≥3 calls across files). Threshold: "would a reviewer benefit from seeing actor↔step ordering?" Use `flows: []` (one entry per major flow) whenever the PR ships more than one independent flow — never combine them into a single tangled diagram. Reserve singular `flow: {}` for the single-flow case. |
| `risk_rollout`     | `database` is present OR diff touches `infra/`, `Dockerfile`, `vercel.ts`/`vercel.json`, GitHub workflows, IAM, or env-var defaults.                                                        |
| `screenshots`      | **REQUIRED when pre-render check #2 returns ≥1 new `page.tsx` (or framework equivalent).** Also when the diff redesigns existing pages (≥1 `page.tsx` modified with ≥30% line change). Skip only for pure refactors, backend-only diffs, or one-line copy edits — and when skipping despite a check #2 hit, `open_questions` MUST record why (e.g. "dev stack unreachable in CI agent"). See check #8. |
| `routes`           | Diff adds, removes, or materially changes API route handlers, RPC endpoints, app route handlers, server actions that are treated as endpoints, or route-mounted sub-apps. Include only PR-delta routes; do not list unchanged existing routes unless they are replacements for a removed route. |

## Screenshots

UI-heavy PRs benefit from showing the rendered result alongside the
diagram-first overview. The skill supports two image surfaces:

- **Top-level `screenshots` section** — gallery rendered right after the
  executive briefing. Reads as "here's what shipped" at a glance.
- **Inline images** — optional `images: []` arrays on
  `summary.topics[]`, each flow, and `architecture.details[*]`. Use these
  when a screenshot belongs with the prose, not in the gallery.

### Image item shape

Every image, in either surface, follows the same shape:

```jsonc
{
  "src":      "screenshots/analytics-overview.png", // local path or http(s) URL
  "alt":      "Analytics overview with period pill and four KPI cards",  // REQUIRED
  "caption":  "Period-aware KPIs with comparison deltas.",  // optional, ≤ 120 chars
  "route":    "/analytics?periodo=14d",  // optional — capture script reads this
  "viewport": { "width": 1440, "height": 900 },  // capture-only override
  "wait_for": "[data-loaded]",  // capture-only CSS selector or "networkidle"
  "full_page": false  // capture-only — false captures the viewport only
}
```

The minimum is `{ alt }` plus either `src` (you supply the image) OR
`route` (capture script fills `src` in). `alt` is non-negotiable: it
drives both screen-reader access and the placeholder shown when the
capture hasn't run yet.

### Capture workflow

Capture drives gstack's `/browse` binary (persistent headless Chromium
daemon, ~3s cold start, ~100ms per command after that). If `/browse`
isn't installed yet, the capture script bootstraps it once
(clone + `bash setup`, ~30s) — no `npm i playwright` step, no chromium
download per consumer, no per-project `node_modules` write.

For routes that need screenshots from a live dev server:

1. **Get the target page responding — with the least infra that works.**
   The capture script only needs the route to return HTML; it does not need
   the app's full backing stack. Before standing anything up, check whether a
   dev server is already running, then prefer the lightest path:
   - **Reuse a running server** if one is already up (check the project's
     dev launcher / known ports). Don't relaunch.
   - **Prefer the app's dev/mock modes** over real dependencies. Most apps
     expose env flags to stub external calls (Slack, Stripe, KMS, third-party
     APIs) — e.g. a `*_MOCK_*=1` flag returning fixed fixtures. Use those so
     the page renders without wiring live credentials or extra services.
   - **Only stand up what the target page actually reads from.** A page that
     renders from one datastore does not need the whole `docker compose up`
     world. Don't boot a database / queue / worker the screenshot never
     touches. (You usually do **not** need to spin up Docker just to
     screenshot a single page — reach for it only if the page genuinely can't
     render without it.)
   - **Tear down anything you started** once captures are done; leave the
     environment as you found it.

2. **Run the capture script:**

   ```bash
   node skills/pr-overview/scripts/capture.mjs tmp/pr-overview-spec.json \
        --base-url http://localhost:3000
   ```

   On first run with no gstack present, the script auto-installs gstack
   into `~/.claude/skills/gstack/` and builds the `/browse` binary.
   Pass `--no-install` to fail-fast instead.

   PNGs land in `screenshots/` next to the spec; the script writes
   `tmp/pr-overview-spec.captured.json` with `src` filled in for every
   captured image. Pass `--in-place` to rewrite the input spec instead.

3. **Render the captured spec:**

   ```bash
   node skills/pr-overview/scripts/render.mjs \
        tmp/pr-overview-spec.captured.json \
        --out tmp/pr-overview.html
   ```

4. **Auth.** Most dashboards need login. The capture script detects when a
   route redirects to a login page, records `capture_error` on that image,
   and exits 1. Whatever you do, authenticate **inside the same browse
   daemon** the capture script uses (`~/.claude/skills/gstack/browse/dist/browse`)
   — its cookies persist across runs, so once you have a session, the next
   capture reuses it. No `storage-state` files, no `codegen`, no
   fingerprint-fragile state to ship between machines.

   **Preferred for local dev: drive the login form yourself, headless.** Most
   dev apps expose a dev/credentials login (e.g. a seeded admin email behind
   `ADMIN_DEV_AUTH=1`). Log in directly in the daemon — no human in the loop:

   ```bash
   B=~/.claude/skills/gstack/browse/dist/browse
   $B goto  http://localhost:3000/login
   $B click '#dev-email'           # focus the field first
   $B type  'admin@example.com'    # real keystrokes — see gotcha below
   $B click 'button[type=submit]'
   $B url                          # confirm you landed past /login
   ```

   - **Controlled-input gotcha:** for React/Vue/Svelte controlled inputs,
     `fill`/setting `.value` updates the DOM but does **not** fire the
     framework's `onChange`, so the component's state stays empty and the form
     submits blank. Use `click` + `type` (real keystrokes) instead, then
     assert the field value before submitting.
   - If the target page only renders with config present (e.g. a settings
     page whose UI is gated on saved state), set that state through the UI
     **and save it** before capturing — the capture script re-navigates fresh,
     so unsaved client-side toggles are lost on reload.

   **Fallback: interactive handoff** — for real OAuth/SSO you can't script,
   open a window, log in by hand, then resume:

   ```bash
   ~/.claude/skills/gstack/browse/dist/browse handoff "log in to your dev app"
   # log in in the Chrome window that opened
   ~/.claude/skills/gstack/browse/dist/browse resume
   ```

   Then rerun the capture command — subsequent navigations reuse the session.

The rendered HTML inlines every local image as base64 so the file stays
self-contained. http(s) `src` values pass through and resolve when the
page is viewed online.

### When to use which surface

- **Top-level gallery (`screenshots`)** — "What ships" view. 3–8
  hero shots of the new surfaces. Captions one line each.
- **`summary.topics[].images`** — when a topic explains a specific UI
  invariant (e.g. "OAuth consent screen", "Empty-state copy"); embed the
  image alongside the prose so the reviewer sees what it describes.
- **`flows[].images`** — when a flow has a key visual moment (the page
  the user lands on, the modal that appears). One or two per flow at
  most; the sequence diagram is still the load-bearing artifact.
- **`architecture.details[*].images`** — surfaces specific to a single
  arch node; shown when the reviewer clicks the node and opens the
  detail panel.

## Pre-render verification

After emitting the draft spec, BEFORE rendering, run the checklist below
and resolve every mismatch in the spec. The overview is a condensed map
of the diff; it must not silently drop shipped surfaces or invent
numbers.

The first rule is: **every numeric claim and named surface in the spec
is grep-verifiable against the diff.** If the spec says "four
migrations", list four exact filenames. If it says "two new pages", list
two route files. If a number cannot be checked, replace it with an
explicit list or remove the count.

These commands assume a Next.js app and Drizzle migrations. If the repo
uses another framework or ORM, adapt the path selectors but keep the
intent: every new user-visible surface is accounted for, and every
additive schema change has a migration story.

1. **Migration count.** New SQL files only; Drizzle `meta/*.json`
   snapshots do not count.

   ```bash
   git diff <base>...HEAD --name-status \
     -- 'drizzle/migrations/*.sql' \
     | awk '$1=="A"{print $2}'
   ```

   The count in `summary.changes` and `database.summary` MUST equal the
   number of lines. If the spec names migration ids or a range, verify
   the exact filenames.

2. **New page routes.** Every new `page.tsx` is a new user-visible
   surface and MUST appear in `summary.ships`, unless the spec text
   explicitly folds it into another shipped surface.

   ```bash
   git diff <base>...HEAD --name-status \
     -- 'apps/*/src/app/**/page.tsx' 'apps/*/src/pages/**/*.tsx' \
     | awk '$1=="A"{print $2}'
   ```

   Different route prefixes are different ships even if they share
   components. Nested pages under one route family may be folded into one
   ship only when the spec says so plainly.

3. **New/removed/changed API routes / server actions.**

   ```bash
   git diff <base>...HEAD --name-status \
     -- 'apps/*/src/app/api/**/route.ts' 'apps/*/src/app/**/actions.ts' \
     | awk '$1=="A"{print $2}'
   ```

   Each new `route.ts` is either a `summary.ships` item, if it is a
   user-visible capability, or a `summary.changes` item, if it backs an
   existing surface. Server actions follow the surface they support.

   If the PR adds/removes/changes route handlers, include the optional
   `routes` section. Build it from the diff range, not from route files that
   already exist on the base branch. The section should be compact by
   default and put detail inside each expandable route:
   - method + path + status (`added`, `changed`, `removed`)
   - 1-line purpose/summary
   - auth/tenancy notes when meaningful
   - files/tests touched
   - parameters for query/path/header inputs
   - request body as a Swagger-like body object with example JSON for
     body-bearing routes
   - response codes with example JSON, especially success and validation/error
   - replacement route for removed endpoints

4. **New or removed agent tools.**

   ```bash
   git diff <base>...HEAD -- agent-config.ts prompts/tools/
   ```

   Every new tool MUST be in `summary.ships`. Every removed tool MUST be
   in `summary.changes` with a deprecation or replacement note.

5. **Schema vs migrations consistency.**

   ```bash
   git diff <base>...HEAD -- drizzle/schema.ts \
     | grep -E '^\+.*(pgTable|integer|text|uuid|timestamp|boolean|jsonb)'
   ```

   Cross-reference every new column/table against the migrations from
   check #1. Any new schema surface without a backing migration belongs
   in `open_questions`, unless the diff clearly shows the repo uses a
   migrationless schema flow.

6. **Internal-reference consistency.** Every identifier named in
   `risk_rollout` or `open_questions` — table, route, env var, tool,
   function, migration id, workflow, or service — MUST also appear
   somewhere in `summary`, `architecture`, `flow`/`flows`, or
   `database`. Dangling references usually mean the overview is missing
   context for the risk/question.

7. **Numbers are grep, not guess.** For every count phrase in the spec
   ("four migrations", "two new tables", "three new tools", "88 files
   changed"), produce the actual list or command output. If the number
   cannot be reproduced, remove or rewrite the claim.

8. **Screenshots presence (forcing).** This check has no flexibility —
   it exists because skipping screenshots is the easiest section to
   silently rationalize past. If check #2 returned ≥1 new `page.tsx`,
   the spec MUST satisfy one of:

   a. A top-level `screenshots` section with ≥1 item covering the new
      pages (3–8 hero shots is the recommended cap), OR
   b. Inline `images: []` on the `summary.topics[]` /
      `architecture.details[*]` entries that own those pages, with at
      least one image per shipped surface, OR
   c. An explicit entry in `open_questions` of the form:
      `"Screenshots skipped — <concrete reason>"`. Acceptable reasons:
      "dev stack unreachable", "auth credentials unavailable",
      "non-interactive environment". Unacceptable reasons: "would take
      time", "judgment call", "PR is large".

   "I'll skip captures and add them in a follow-up" is not acceptable —
   either add the section with `route` placeholders (the renderer shows
   alt-text placeholders until captures run) or record the skip-reason
   in `open_questions`. The reviewer needs to know whether the gallery
   is absent by intent or by omission.

9. **PR scope vs commit history (forcing).** `git diff <base>...HEAD`
   tells you what lands when the PR merges, but it cannot distinguish
   the PR's *titled feature* from older commits that hitched a ride on
   a long-running integration branch. The overview must not silently
   attribute the entire diff to the PR's title. Run:

   ```bash
   git log <base>..HEAD --oneline --no-merges
   ```

   Group commits by conventional-commit `type(scope):` prefix (or by
   subject if the repo doesn't use conventional commits). If the PR
   title's scope is only one of several materially different scopes in
   the list — e.g. PR titled `feat(agent): …` but the branch also has
   `feat(product): …`, `feat(admin): …`, `refactor(api): …` — then for
   every large surface in the spec (new tables, new pages, new
   modules), the originating commit MUST be either the PR's titled
   commit OR explicitly attributed to a bundled commit.

   The spec MUST satisfy one of:

   a. A `summary.topics[]` entry titled "PR scope" (or similar) that
      names each bundled theme and the commit SHA(s) that introduced
      it, so the reviewer can see at a glance what the PR title covers
      vs what was layered in earlier. The TL;DR must then frame the
      shipped work as "the named feature, plus bundled work A and B",
      not as a single deliverable. OR
   b. An explicit `open_questions` entry of the form:
      `` "PR title (`<title>`) covers a subset of the diff. Other major
      work bundled in: <theme-a> (<sha>), <theme-b> (<sha>). Consider
      splitting before review." ``

   When the commit history is homogeneous — all commits share one
   `type(scope):` prefix, or are clearly the same feature stack
   (`feat`, then `fix(...)` / `test(...)` / `refactor(...)` for the
   same area) — this check passes with nothing to do.

   Reverse direction also matters: if a `summary.ships` item names a
   surface (table, module, page) that does NOT appear in any commit's
   diff range between `<base>..HEAD`, remove the claim. Use
   `git log <base>..HEAD -- <path>` to verify which commit introduced
   each load-bearing surface before claiming the PR ships it.

Run these checks in one pass and keep a private `STATUS / MISMATCH / FIX`
log while editing the spec. Do not render until the mismatches are gone.

## Hard rules

1. **Diff scope rule** (above) — verify against `git diff <base>...HEAD`
   before tagging anything.
2. **Architecture never invents components.** Every node corresponds to a
   file/directory in the diff or directly imported by one.
3. **DB diagram never invents tables.** Existing tables appear only when
   they are FK targets of changed tables or queried by changed code.
4. **`open_questions` is reviewer-facing** — clarifications the reviewer
   should resolve before approving. Not agent uncertainty. Code-quality
   nits and "interesting patterns" do NOT go here either — those belong
   in the actual code review, not the overview.
5. **Every numeric claim is grep-verifiable.** No "four" without four
   filenames; no "two new pages" without two route paths.
6. **Risk/question identifiers are anchored.** If `risk_rollout` or
   `open_questions` names an identifier, the main explanatory sections
   must contain enough context for that identifier.
7. **Screenshots are not silently optional.** Any PR that adds a new
   `page.tsx` (or framework equivalent) MUST either ship the
   `screenshots` section or record an explicit skip-reason in
   `open_questions`. See pre-render check #8 — there is no third
   option.
8. **PR scope vs commit history is reconciled.** A branch that has
   bundled multiple unrelated features (e.g. earlier `feat(product)`
   commits living alongside the titled `feat(agent)` commit) MUST be
   surfaced to the reviewer rather than silently flattened into the
   title. The TL;DR and `summary.ships` describe the named feature; a
   `summary.topics[]` entry (or an explicit `open_questions` line)
   attributes every large bundled surface to its originating commit
   SHA. See pre-render check #9. A surface that appears in NO commit's
   diff between `<base>..HEAD` cannot be claimed as shipped.

## Edge cases

- **Huge PRs (>500 files):** summarize by directory cluster; architecture
  diagram caps at 30 nodes; group extras into a single `… +N more` node and
  enumerate them inside its detail panel.
- **Renames:** single node with `status: changed` plus
  `details.<id>.rename: { from, to }`. Never an `added` + `removed` pair.
- **Generated files / lockfiles:** excluded from `meta.files_changed` count
  and from observations; called out in `summary` as a one-liner.
- **Binary files:** noted in summary; never tagged in observations or
  diagrams.
- **No git remote / detached HEAD:** render still works against local
  `HEAD~N`; ask the user for the base if it cannot be inferred.

## Spec shape

See `examples/feature-pr-spec.json` for the simplest possible spec, and
`examples/mixed-pr-spec.json` for the full schema in use. The hard contract
lives in `schema/pr-overview.schema.json`.

Key invariants:

- Optional sections are omitted entirely when absent — never present-but-empty.
- `routes` is the compact endpoint review surface. Use it when route diffs
  exist, and keep the top-level route list short. Put verbose request/response
  information inside each route's expandable row.
  - `routes.stats` is optional but recommended: `{ "added": 3, "removed": 5, "changed": 3, "net": -2 }`.
  - `routes.scope_note` should call out route families that look related but
    are unchanged on the base branch, so reviewers do not confuse existing
    context with PR additions.
  - `routes.groups[]` groups by product surface, e.g. "Added · Analytics",
    "Removed · Duplicate endpoints", "Changed · Existing routes".
  - `parameters[]` is for query/path/header fields. For POST/PATCH body
    payloads, prefer `request_body` with an `example` object instead of listing
    every body field as table rows.
  - `responses[]` should include at least a representative `2xx` response
    and one important `4xx`/`5xx` when the route has notable validation or
    authorization behavior.
- Status enum (`added | changed | removed | context`) is shared across
  architecture details and database tables/fields and drives the visual
  coloring uniformly.
- Architecture node `kind` ∈ `service | module | datastore | external | ui | job`.
- **Framing fields are structured, never wall-of-text.** Wherever a
  diagram section opens (`architecture`, each entry in `flows`/`flow`,
  `database`), the spec MUST supply a **one-sentence lede** (`summary`)
  + **2–4 short bullets** (`highlights`). The lede is the orientation;
  the bullets are the load-bearing facts. The list sections
  (`risk_rollout`, `open_questions`) carry no
  framing prose — the items ARE the content.
- **Plain-English bar for ALL ledes.** Every lede field —
  `summary.tldr`, `architecture.summary`, each `flow.summary`,
  `database.summary`, and every `summary.topics[].summary` — must orient
  a reviewer who has not read the diff.
  - **Forbidden in ledes:** file paths, function names, table/column
    names, route paths, env var names, and backticks.
  - Put technical identifiers in `ships`, `changes`, `highlights`,
    `body`, `code`, diagram labels, or detail panels instead.
  - If the sentence needs backticks to make sense, it belongs outside
    the lede.
- **`summary` is the executive briefing.** Three lenses, every one
  answers a real reviewer question:
  - `tldr` (REQUIRED, ≤ 360 chars) — 1–2 plain-English sentences a PM,
    designer, or non-engineer could read and understand. Frame it as
    **who benefits + what they can now do** (or what gets fixed). Skip
    file paths, function names, table/column names, route paths — those
    belong in `ships` and `changes`. Skip backticks here too; the TL;DR
    is the elevator pitch, not the spec.
    - **Good:** "New teammates can finish setting up their dashboard
      access themselves — a short guided flow links their chat account
      and saves their signing wallet. Admins get a place to review and
      adjust those wallets."
    - **Bad (too technical):** "Editors/viewers can self-onboard via a
      4-step flow that binds them to a Slack identity and a canonical
      wallet. Admins curate the resulting `signer_identities` rows from
      a new `/signers` page; the agent reads them via two new tools."
    - **Bad (too vague):** "Adds onboarding and signer management."
  - `ships` (REQUIRED, 1–6 items) — the user-visible / agent-visible
    things this PR delivers. One per line, ≤ 100 chars. Format each as
    `` `identifier` — short description ``. Example:
    `` `/welcome` — 4-step first-run flow gated by `requireOnboardedOrRedirect`. ``
  - `why` (OPTIONAL, ≤ 260 chars) — one sentence on the motivation:
    what was missing before, what was painful, what the prior workaround
    looked like. Skip when the PR is purely additive cleanup.
  - `changes` (OPTIONAL, 1–6 items) — the system-level diff: which
    tables widen, which env vars are required, which old paths get
    deprecated. One concern per bullet. Backticks for identifiers.
  - `topics` (OPTIONAL, ≤ 8 items) — expandable accordions for deep
    context that doesn't fit elsewhere (see below).
  - **Example.**
    ```jsonc
    "summary": {
      "tldr": "New teammates can finish setup themselves, while admins get a dedicated place to review the resulting owner mappings.",
      "ships": [
        "`/welcome` — 4-step first-run flow gated by `requireOnboardedOrRedirect`.",
        "`/signers` — admin owner-mapping grid per managed Safe.",
        "`map_signer` + `resolve_signers` — canonical lookup tools for the agent.",
        "Slack OAuth v2 callback path with HMAC-signed state tokens."
      ],
      "why": "Editors/viewers couldn't self-onboard before — they joined a tenant but had no canonical wallet, and signer mapping was inferred fuzzily from Slack display names.",
      "changes": [
        "`dashboard_users` gains `onboarded_at`, `slack_user_id`, `slack_verification`.",
        "`signer_identities.created_via` accepts new `dashboard_self` value.",
        "Old fuzzy `slack_user_lookup` stays for free-text; no longer canonical."
      ]
    }
    ```
- **`summary.topics` — expandable cards for things that aren't a flow.**
  When the PR has cross-cutting concerns that don't belong in any single
  diagram (security invariants, OAuth state design, env-var contracts,
  one piece of code worth showing inline, a key trade-off), add them as
  `summary.topics[]`. Each topic is a collapsed accordion below the gap
  cards in "Why this exists"; the reviewer expands the ones they care
  about. Shape:
    ```jsonc
    "summary": {
      "bullets": [...],
      "topics": [
        {
          "title":   "OAuth state security",
          "summary": "Each callback is tied to the person and workspace that started it, with a short expiry window.",
          "body":    "Optional prose paragraph. Backticks become <code>.",
          "highlights": [
            "State signed with `SLACK_STATE_SECRET`, never the session cookie.",
            "Callback trusts the state token as the source of identity — survives multi-session browsers."
          ],
          "code": [
            {
              "file": "lib/oauth/state.ts:24-42",
              "lang": "ts",
              "body": "export function mintHmacState(...) { ... }"
            }
          ]
        }
      ]
    }
    ```
  - `title` — 2–5 words naming the concern. Not "this PR changes…", not
    "topic 1".
  - `summary` — one sentence (≤ 160 chars), shown when collapsed.
  - `body` — optional paragraph, expand-only.
  - `highlights` — optional 2–4 bullet facts.
  - `code` — optional array of `{ file, lang, body }` snippets. `file`
    points at the source (path + line range); `body` is the verbatim
    snippet — keep it ≤ 20 lines, just the load-bearing piece.
  - Cap at 4–5 topics — it is not the place for the entire PR breakdown,
    only the things that don't fit elsewhere.
- **Architecture MUST carry both `summary` and `highlights`.**
  - `summary` — ONE sentence, ≤ 160 chars, naming what this PR changes at
    the system level (the new surfaces, the new wiring, the deprecated
    path). Not "this is an architecture diagram", not "the boxes are
    grouped by kind". The legend below already explains the color coding;
    the in-canvas hint already explains zoom/pan — do not repeat either.
  - `highlights` — 2–4 items. Each item is one fact, ≤ 100 chars, leading
    with a noun phrase. One concern per bullet: a new component, a new
    wiring, a deprecated path, a key invariant. Do not run a second
    thought into the same bullet.
  - **Inline-code convention:** wrap code-like tokens (file paths,
    function names, table/column names, env vars, route paths) in
    backticks: `` `dashboard_users.slack_user_id` ``,
    `` `requireOnboardedOrRedirect` ``, `` `/welcome` ``. The renderer
    turns those into `<code>` spans with mono font; reviewers can scan
    the structural facts from the prose.
  - **Example.**
    ```jsonc
    "architecture": {
      "summary": "Two new admin surfaces wire into existing memory and agent tools, with a callback path for identity proof.",
      "highlights": [
        "`/welcome` — 4-step first-run gate driven by `requireOnboardedOrRedirect`.",
        "Slack OAuth v2 callback writes `dashboard_users.slack_user_id` + `slack_verification`.",
        "`/signers` curates `signer_identities` rows for the new `map_signer` / `resolve_signers` tools.",
        "Deprecates the fuzzy `slack_user_lookup` path for canonical signer lookups."
      ]
    }
    ```
- **Database MUST carry both `summary` and `highlights`** (when the
  section is present). Same shape as architecture: ONE-sentence lede,
  2–4 short bullets, `` `backtick` `` inline-code for table/column
  names + migration ids. Do not describe the diagram ("tables are
  color-coded", "drag any table"); describe the change: which tables
  are new, which columns are added, which constraint is introduced,
  which migration backfills what.
- **Never ship a lone table with no relationships.** A single
  `status: changed`/`added` table floating by itself reads as "what is
  this connected to?" — the reviewer gets no context. When a table has a
  foreign key, include its FK-parent as a `status: context` table and add
  the `relations[]` entry (`{ from: "child.fk", to: "parent.id", status }`)
  so the diagram shows the edge. This is the DB-section corollary of hard
  rule #3: context tables earn their place by explaining a relationship.
- Flow actor `kind` ∈ `user | service | module | datastore | external` —
  intentionally narrower than architecture node kinds (no `ui` or `job`
  here; use `service` for those actors when their architectural kind is
  `ui` or `job`).
- Flows render as **Mermaid `sequenceDiagram`s — one per major flow.** Use
  the plural `flows: [ { title, summary, actors, steps }, ... ]` whenever
  the PR ships more than one independent flow. Split criteria: distinct
  entry point (different route / webhook / cron / user action), distinct
  set of actors, or distinct outcome. Don't merge unrelated flows just to
  reuse actors.
- **Every flow MUST have `title`, `summary`, and `highlights`** —
  single-flow case included. They are the framing the reviewer reads
  before the diagram; without them the section opens with no context.
  Same structured shape as architecture: ONE-sentence lede + 2–4 short
  bullets. Same `` `backtick` `` inline-code convention.
  - `title` — a verb phrase that names what the flow accomplishes:
    "Editor/Viewer first-run onboarding", "Nightly invoice rollup",
    "Slack OAuth callback → workspace bind". Not "How it flows", not
    "The flow", not "Sequence diagram".
  - `summary` — ONE sentence (≤ 160 chars). What triggers the flow, in
    one breath. Example: "First-run gate that walks invited users from
    incomplete setup to a fully connected account."
  - `highlights` — 2–4 items, each one fact ≤ 100 chars. What this PR
    actually changes about this flow: a new step, a new write, a new
    invariant, a deprecated branch. Example items: "Adds the
    `requireOnboardedOrRedirect` gate on every authenticated admin
    page.", "New Slack OAuth v2 callback writes
    `dashboard_users.slack_user_id`.", "Wallet step inserts
    `signer_identities` with `created_via='dashboard_self'`."
- Keep step labels ≤ 80 characters — they don't wrap in the diagram (the
  renderer truncates with an ellipsis past that). Avoid `;` in step labels
  — Mermaid treats it as a statement separator; the renderer substitutes
  it with `,` to keep parsing safe, but it's clearer to phrase around it.

## Output

- `tmp/pr-overview.html` — self-contained file, openable in any browser.
- `tmp/pr-overview-spec.json` — the spec the renderer consumed (keep around for
  troubleshooting / re-runs).

Both files are gitignored by the skill's `.gitignore`.

## Quality bar

- Cite concrete files and line numbers where possible.
- Don't overstate runtime behavior that is not visible from the diff.
- Treat private/PII data paths as first-class — set `field.privacy: true`
  to surface the amber accent.
- Check for destructive DDL, lock-heavy operations, generated columns,
  migration order problems, nullable/backfill issues, and unique
  constraints on dirty data. Surface these in `risk_rollout`.
- Keep the JSON spec lean — long prose belongs in `details[id].summary`
  inside the detail panel, not in the diagram label.
