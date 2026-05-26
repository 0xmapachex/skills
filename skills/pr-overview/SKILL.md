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

5. **Render:**

   ```bash
   node skills/pr-overview/scripts/render.mjs tmp/pr-overview-spec.json \
        --out tmp/pr-overview.html
   ```

6. **Report.** Print the path to the user, and a short text summary
   mirroring the spec's `summary.bullets`. Offer to open in browser
   if the environment supports it.

## Required vs optional sections

**Always include:** `meta`, `summary`, `architecture`, `open_questions`.

**Optional sections — include only when triggered.** Omit the key entirely
(don't include empty objects).

| Section            | Trigger (any of)                                                                                                                                                                            |
|--------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `database`         | Diff touches `*.sql`, `**/migrations/**`, `drizzle/schema.ts`, `prisma/schema.prisma`, ORM model files, seed scripts, or columns referenced in new query projections.                       |
| `flow`             | Diff adds/changes a route handler, webhook, queue consumer, cron, RPC method, state machine, or multi-step async dance (≥3 calls across files). Threshold: "would a reviewer benefit from seeing actor↔step ordering?" |
| `risk_rollout`     | `database` is present OR diff touches `infra/`, `Dockerfile`, `vercel.ts`/`vercel.json`, GitHub workflows, IAM, or env-var defaults.                                                        |
| `code_observations`| Agent spots: (a) ≥3 near-duplicate blocks across the diff, (b) a TODO/FIXME added, (c) a silently-swallowed error, (d) a comment that contradicts the code, or (e) a hardcoded value that looks env-specific. **Cap at 5 items.** If more, surface a closing item: `"more observations available — run /review for a full audit"`. |

## Hard rules

1. **Diff scope rule** (above) — verify against `git diff <base>...HEAD`
   before tagging anything.
2. **Code observations are NEVER findings.** No "must fix", no severity
   labels in observations, no "this is a bug." Use neutral verbs
   ("notice", "duplicated", "could be extracted"). Real-bug suspicions go
   in `open_questions` instead.
3. **Architecture never invents components.** Every node corresponds to a
   file/directory in the diff or directly imported by one.
4. **DB diagram never invents tables.** Existing tables appear only when
   they are FK targets of changed tables or queried by changed code.
5. **`open_questions` is reviewer-facing** — clarifications the reviewer
   should resolve before approving. Not agent uncertainty.

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
- Flow actor `kind` ∈ `user | service | module | datastore | external` —
  intentionally narrower than architecture node kinds (no `ui` or `job`
  here; use `service` for those actors when their architectural kind is
  `ui` or `job`).

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
