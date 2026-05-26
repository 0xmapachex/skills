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

2. **Read the diff.**
   - `git diff --stat`, `git diff --name-only`, then focused
     `git diff <base>...HEAD -- <path>` for the files that matter.

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

6. **Render:**

   ```bash
   node skills/pr-overview/scripts/render.mjs tmp/pr-overview-spec.json \
        --out tmp/pr-overview.html
   ```

7. **Report.** Print the path to the user, and a short text recap
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

3. **New API routes / server actions.**

   ```bash
   git diff <base>...HEAD --name-status \
     -- 'apps/*/src/app/api/**/route.ts' 'apps/*/src/app/**/actions.ts' \
     | awk '$1=="A"{print $2}'
   ```

   Each new `route.ts` is either a `summary.ships` item, if it is a
   user-visible capability, or a `summary.changes` item, if it backs an
   existing surface. Server actions follow the surface they support.

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
