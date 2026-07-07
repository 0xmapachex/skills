---
name: thermonuclear-pr-review
description: Deep, adversarial, multi-angle production-readiness review of a SINGLE PR or branch in the Clawtsapp repo, run locally via the Workflow tool. Scout the diff first, fan out one skeptical reviewer per risk dimension — both correctness & safety (tenancy, owner-auth, money, Kapso coercion) AND durability (data model, architecture, tech debt, agent-context pollution) — each armed with the exact files + the PR's own claims to disprove + the load-bearing invariants from AGENTS.md and the CLAUDE.md philosophy, independently verify every significant finding against the committed code, then synthesize a ship / ship-with-fixes / block verdict with confirmed strengths and the coverage gaps a human must still eyeball. Use when the user wants to ATTACK a PR from every angle or stress-test it before merge — phrases like "thermonuclear review", "tear this PR apart", "attack it from different angles", "rip into this branch", "is this good for production", "find any weakness", "hammer this PR", "red-team this change", "is this the right architecture or a short-term hack", "will this rot / pile up tech debt", or any request for a heavyweight second opinion that distrusts the PR's own self-assessment. Reach for this over `code-review` when the user wants depth, breadth, and skepticism rather than a quick inline pass; it is the LOCAL self-run cousin of `code-review ultra` (cloud, billed, user-triggered) and is scoped to ONE branch/PR. It ends in a verdict you decide the action path from — fixing is a separate, explicit step.
user-invocable: true
---

# thermonuclear-pr-review

Attack one PR (or branch) from every angle that matters in **this** codebase,
then independently verify each finding so the verdict is trustworthy enough to
act on. The output is a production-readiness judgment — **ship / ship-with-fixes
/ block** — plus a confirmed-findings shortlist, what genuinely holds up, and the
gaps a human still has to check. Read-only on source: this skill produces a
verdict, not a fix.

**Scope boundary.** This is the single-PR, maximum-depth, local review.

- `code-review` is the everyday inline pass over the current diff — one skill
  across an effort spectrum: `low`/`medium` (a few high-confidence findings)
  through `high`/`max` (broader coverage, may surface uncertain ones). It edits
  nothing on its own; `--comment` posts findings to the PR, `--fix` applies them.
- `code-review ultra` is that same skill's heaviest setting: a multi-agent review
  that runs **in the cloud**, is **billed**, and is **user-triggered** (formerly
  the `/ultrareview` alias; you cannot launch it yourself). **This skill is the
  local, self-run cousin of `code-review ultra`** — the same heavyweight,
  multi-agent depth, but you orchestrate it yourself via the Workflow tool, scoped
  to ONE branch against its base, and deliberately more adversarial: it distrusts
  the PR's own claims instead of reading the diff fresh.
- For carrying a branch to merged → the `commit` / `pr-description` skills inform
  the next step; this one doesn't merge.

Run it when the user says "attack this PR", "is it production-ready", "find what
the reviewers missed", or hands you a polished PR and wants a brutal second
opinion. The more confident the PR body sounds, the more useful this is.

## Why it works (do not skip these — they are the whole point)

A naive "spawn N reviewers" fan-out produces generic slop. What turns this into
real findings:

1. **Scout before you fan out (Phase 0).** Generic reviewers find generic nits;
   reviewers _armed with exact file paths and the PR's specific claims_ find real
   bugs. The single highest-leverage step is reading the diff + PR body + the root
   `AGENTS.md`/`CLAUDE.md` + the sub-component `AGENTS.md` for every area the diff
   touches **yourself first**, so you can hand each reviewer a precise "read these
   files, hold the PR to these invariants, disprove these claims" brief.
2. **Distrust the PR's own narrative.** A polished "every mutation audited, all
   gated, shared from one source" PR body is a reason for _more_ skepticism, not
   less. Every claim it makes is a hypothesis to disprove against the code — false
   claims are exactly where the real bugs in well-reviewed PRs hide.
3. **Demand reproducible mechanisms, not vibes.** "A `scheduling-read` owner token
   reaches `/v1/caja/summary` because the route only checks `requireOwnerCaller`
   and never `denyScheduling`, so payroll totals leak to a receptionist" is a
   finding; "auth looks risky" is noise.
4. **Verify every significant finding independently, defaulting to refute.** A
   fresh skeptic re-reads the code at the pinned sha and must quote `file:line` to
   confirm a finding — most raw findings get killed here, and that filter is what
   makes the verdict trustworthy. Never skip it to save tokens; it is the cost
   that buys credibility.
5. **Report strengths and gaps, not just FUD.** The verdict must state what
   independent verification _confirmed holds_ (e.g. "every new route is `withTenant`
   + `requireOwnerCaller`; caller_phone is context-bound and out of `body_schema`")
   and name the angles the review could NOT cover (e.g. "nobody ran a real Kapso
   webhook end-to-end", "no cross-tenant request was actually fired against a live
   DB") so the human knows what's still on them.
6. **Hold the soft dimensions to a written standard, not taste.** Architecture,
   data-model, tech-debt, and agent-context findings are the easiest to degrade into
   slop ("consider extracting this", "this could be cleaner"). The bar that keeps
   them as real as a security finding: every one must cite a **written rule it
   breaks** — the CLAUDE.md _Code completeness_ / _Code reuse & hygiene_ sections, a
   sub-component `AGENTS.md` invariant, or a `validate:architecture` gate — **or** a
   **concrete, near-term failure** it creates: a migration-and-backfill it forces, a
   roadmap shape the data model can't represent, the next agent a prompt/`AGENTS.md`
   edit will mislead. A finding that is pure preference, with no rule and no
   mechanism, is precisely what the verifier refutes. This repo cares about
   durability on the record ("hacks compound", "refactor over patch", "completeness
   is cheap"), so an _anchored_ durability break is a first-class finding — not a
   nit to bury.

## What makes a finding _real_ in this repo

Clawtsapp's load-bearing invariants fall in two groups, and the review attacks
both. **Correctness & safety** — breaks here produce the bugs that hurt _now_:
cross-tenant data leaks, owner-auth bypass, silently-wrong money, Kapso coercion
mismatches that 500 a live tool. **Durability** — breaks here cost _later_: a data
model or architecture that can't hold the next feature, a short-term hack taken
over the clean refactor it should have been, or pollution of the agent's own
context with volatile, conflicting, or stale instructions. This repo writes the
durability rules down too — the CLAUDE.md _Code completeness_ and _Code reuse &
hygiene_ sections, the prompt-freshness invariant, and the `validate:architecture`
gate — so a durability finding is held to a cited standard exactly like a security
one, never to taste. Before fanning out, internalize the invariants from the
AGENTS.md files **and the CLAUDE.md philosophy sections** (root + every
sub-component the diff touches). The ones that bite most often:

- **Tenancy / RLS.** Every customer/owner tenant read+write runs through
  `withTenant(business_id, …)`; cross-tenant admin/cron/seed/onboarding uses
  `withAdminBypass`. A bare `db.select(...)` imported into a route works under the
  test superuser DSN and **silently returns zero rows under the prod login role** —
  the `check-api-rls-as-api-role` canary (`tests/rls-enforcement.test.ts`) is the
  only gate that catches it. New cross-tenant paths need an RLS test case.
- **Owner-caller auth.** Owner WhatsApp tool routes prove identity with
  `caller_phone: "{{context.contact.wa_id}}"` + a server-side
  `requireOwnerCaller` check (`caller_phone === businesses.owner_phone`). Reads
  included — these surfaces carry money + PII. `caller_phone` / `business_id` must
  be in the tool `body`, **never** in `body_schema` (else the LLM can spoof them).
  The ratchet is `tests/kapso-owner-caller-phone.test.ts`. Multi-action routes
  (`action` enum + `switch`) must gate **before** the switch so every branch is
  covered.
- **Owner role gates.** `requireOwnerRole`, `requireOwnerAccess`, `denyScheduling`
  in `src/middleware/owner-auth.ts`. Financial + admin surfaces (`caja`,
  `commissions`, `payouts`, `payments`, `users`, `followups`, `attention`) reject
  `scheduling-*` roles. A new admin/edit-only surface that forgets `denyScheduling`
  is an authz regression.
- **Kapso webhook coercion.** Kapso serializes arrays/objects/booleans/numbers as
  **strings** in webhook bodies. Routes called as tools must coerce via
  `coerceJsonArray` / `coerceJsonObject` / `coerceBoolean` / `coerceOptionalBoolean`
  / `coerceOptional*` / `optional*` from `src/lib/zod.ts`. Raw `z.array(...)` fails
  `tests/kapso-array-coercion.test.ts`. The tool `body` shape must match the route
  Zod schema (`tests/tool-schema-contract.test.ts`). `coerceBoolean` defaults
  empty→`false`; for "only change if the LLM filled it" toggles, the correct helper
  is `coerceOptionalBoolean` (empty→`undefined`) — using the wrong one silently
  flips a setting off.
- **Kapso prompt freshness.** Executions are long-lived: the agent system prompt
  is conversation-start state, not per-message. **No volatile facts** in
  `prompts/agents/*.md` or `vars.*` (current date/time, today's appointments,
  open-now, menu/staff snapshots, usage counters). Those go behind a tool the
  agent calls that turn (`/v1/context/turn`, `get_current_datetime`).
- **Money.** Integer cents end-to-end; customer/owner chat money strings format
  through `formatMoneyForChat` in `src/lib/formatting.ts` (`350bs` / `45.50bs`),
  never inline `${currency} ${amount}`. Per-service revenue splits may drift cents
  but the session-level headline stays exact. Promotions: percentage ⇒ percent∈
  [1,99]; fixed ⇒ exactly one item.
- **Single source of truth.** Business logic is hoisted to `src/lib/` and shared by
  the dashboard `/v1/owner/*` route and the agent tool route — never forked. The
  parity claim is "both compute from one source"; verify the dashboard route and
  the agent route actually call the same helper and don't diverge in filter,
  rounding, or status derivation.
- **Audit + logging.** Every owner mutation writes an `admin_audit_log` row. No
  new `console.*` in `services/api/src` (`tests/console-discipline.test.ts`
  ratchet); use `src/lib/log.ts`. Never log raw bodies, secrets, or PII.
- **Pagination.** List routes that can exceed ~50 rows use the offset-based,
  body-level contract (`src/lib/pagination.ts`); never a silent `slice(0, N)`.
- **Localization.** Owner/customer-facing text is Bolivian Spanish (`vos`),
  currency Bs, timezone UTC-4 (`src/lib/time.ts` / `timezone.ts`).

The durability invariants — softer to spot, just as load-bearing here:

- **Data model & architecture.** New schema/migrations must be RLS-compatible
  (tenant-scoped, no bare-`db` import in a route — `validate:architecture` gates the
  import rule), normalized enough to not need a "keep in sync" comment, and honest
  about integrity (the promo `catalog_item_ids` is a bare `uuid[]` with no FK, which
  is exactly why catalog rows are soft-archived, never hard-deleted). Business logic
  lives in `src/lib/` and is shared by the dashboard and agent routes, not forked. A
  wire/DB shape the next feature can't extend without a migration-and-backfill is a
  finding, not a detail.
- **Tech debt & maintainability.** The stated bar (CLAUDE.md _Code completeness_ /
  _Code reuse & hygiene_): no backwards-compat shim without a concrete caller; no
  parallel versions (`Foo` + `FooV2` + `*-old.ts`); refactor over a localized hack
  when in doubt; one source of truth per constant / regex / business rule (never a
  "keep in sync" comment); delete dead code on sight; hoist on the second use. A
  change that trades long-term maintainability for a short-term hack — or
  half-implements a lake it could have finished in the PR — breaks this even when it
  "works" today.
- **Agent context & harness.** The agent's context is production surface. No
  volatile facts in long-lived prompts (`prompts/agents/*.md` / `vars.*` —
  executions resume mid-conversation, so the system prompt is start-state, not
  per-turn). No conflicting, duplicated, or misguided instructions added to a prompt
  or tool description. `AGENTS.md` is production code: an edit that leaves a rule
  contradicting the new code (or omits a rule the new code now needs) misleads the
  next agent and is caught by the `validate:architecture` AGENTS.md-drift gate. Watch
  the 1024-char tool-description cap and prompt bloat that buries the real signal or
  gives the agent two ways to do one thing.

## Phase 0 — scout and arm the reviewers (you, inline, before the Workflow)

```bash
git fetch origin -q
REVIEW_SHA=$(git rev-parse HEAD)                      # PIN the review to one commit
BASE=$(git merge-base origin/main HEAD)               # the PR's base
git diff --stat $BASE..$REVIEW_SHA | tail -40
git log --oneline $BASE..$REVIEW_SHA
```

If reviewing a GitHub PR, `gh pr view <N> --json number,title,body,baseRefName,headRefOid`
— use its base as `$BASE` and `headRefOid` as `$REVIEW_SHA`.

**Pin every reviewer to `$REVIEW_SHA` and committed state, never the working
tree.** The review runs ~10-30 min; this is a heavily multi-worktree repo (each
branch has its own ports + postgres container), and a commit landing mid-run
makes working-tree reviewers report against a vanished state (it produces phantom
"uncommitted migration / schema-code split" findings). Hand reviewers
`git show $REVIEW_SHA:<path>` and `git diff $BASE..$REVIEW_SHA -- <paths>`, and
bake the actual sha into the preamble.

Then, before writing any workflow:

- **Read the diff and the full PR body / commit message.** Extract every _claim_
  ("every mutation audited", "all gated on `requireOwnerCaller` + `withTenant`",
  "computes from one source", "archived items no longer bookable", "deliberately
  kept dashboard-only"). These become the `claim_vs_reality` targets — the
  reviewers' job is to disprove them.
- **Read the root `AGENTS.md` AND the sub-component `AGENTS.md` for every area the
  diff touches** (`services/api/AGENTS.md` is the big one; also `workflows/`,
  `apps/owner/`, `services/cron/`). They encode the load-bearing invariants and the
  traps that have bitten before. Each invariant the diff touches is a thing a
  reviewer must hold the PR to.
- **Read the CLAUDE.md _Code completeness_ and _Code reuse & hygiene_ sections, and
  treat the PR's design CHOICES as claims too.** A new table or column, a new
  abstraction (or the conspicuous absence of one), an `AGENTS.md`/prompt edit, a
  "we'll clean it up later" — each is a design claim ("this is the long-term-right
  shape") to disprove just like the behavioral ones. If the diff adds schema,
  prompts, or `AGENTS.md` edits, the durability dimensions (`data-model-arch`,
  `tech-debt`, `agent-context`) earn their slot — arm them against the written rule
  (the cite-a-rule-or-a-concrete-failure bar in "Why it works" #6) so they find
  structure problems, not nits.
- **List the high-risk surfaces the diff actually touches** and pick your
  dimensions from the menu below — don't run a `localization` reviewer on a
  pure-migration PR, or skip `tenancy-rls` on one that adds routes. Tailoring the
  dimension set to the real diff is part of the work.
- **For each chosen dimension, write the precise brief:** the exact files to read
  (`git show $REVIEW_SHA:<path>`), and a "verify hard" checklist (the claims to
  disprove + the invariants to hold + the CI gate that's supposed to catch it). The
  precision of the file list + checklist is what finds bugs — the dimension _name_
  does not. See `references/example-owner-agent-parity.md` for a worked set of
  briefs from the run this skill was distilled from.

Spend real effort here. Ten minutes of scouting is worth more than a thousand
generic reviewer tokens.

## Phases 1-3 — the Workflow (Attack → Verify → Synthesize)

These run as one `Workflow` call (this skill instructing you to use Workflow is
your opt-in to the tool). The script below is the proven shape — adapt the
preamble, dimensions, and file lists to the PR you scouted. **Pipeline, don't
barrier:** verification of each dimension's findings starts the moment that
dimension's review lands.

- **Attack** — one reviewer per dimension, each carrying the shared adversarial
  preamble + its tailored brief, returning structured findings. Tell them to
  report EVERY substantiated finding with honest confidence and not to
  self-filter — the verify stage filters (self-filtering depresses recall).
- **Verify** — every blocker/high/medium finding gets a fresh agent prompted to
  REFUTE it, defaulting to `is_real=false` unless the code at `$REVIEW_SHA`
  substantiates it, required to quote `file:line`, and adjusting severity to what
  it would defend to a senior engineer. (Low/nit findings pass through unverified.)
- **Synthesize** — one judge dedups findings multiple dimensions surfaced, uses the
  _verifier's_ adjusted severity (not the reviewer's claim), and emits the verdict +
  strengths + coverage gaps.

### Scripting footgun — escape literal `${…}` and backticks in dimension prompts

The whole script is one JavaScript module; each dimension `prompt` is a template
literal. Any `${…}` you intend as **literal example text** (e.g. telling a reviewer
to grep for an inline `` `${cents/100}` `` or `` `${currency} ${amount}` ``
money interpolation) is evaluated by JS as a real interpolation and throws
`ReferenceError: cents is not defined` **at eval time, before a single agent
runs** — the whole workflow dies in milliseconds. Same for a literal backtick.
Escape them: write `\${cents/100}` and `` \` ``. Before launching, sanity-check:

```bash
node --check <the persisted script path>   # catches syntax errors, not ReferenceErrors
grep -nE '\$\{[a-z]' <script>               # eyeball every ${ — is it a real var or literal text?
```

`node --check` only catches *syntax* errors; an unescaped `${cents}` is valid
syntax that fails at runtime, so the grep eyeball is the real guard. (This skill's
own first run died exactly this way — the fix is cheap once you know to look.)

### The workflow script (adapt, then run)

```javascript
export const meta = {
  name: "thermonuclear-pr-review",
  description:
    "Adversarial multi-angle production-readiness review of one Clawtsapp PR/branch, every finding independently verified against the pinned commit",
  phases: [
    { title: "Attack", detail: "one skeptical reviewer per risk dimension" },
    { title: "Verify", detail: "independently confirm/refute each significant finding against code" },
    { title: "Synthesize", detail: "dedup, re-rank by verifier severity, produce the verdict" },
  ],
};

const FINDINGS = {
  type: "object",
  additionalProperties: false,
  required: ["dimension", "overall_assessment", "production_ready", "findings"],
  properties: {
    dimension: { type: "string" },
    overall_assessment: {
      type: "string",
      description: "2-4 sentences: is this area production-ready? The dominant risk?",
    },
    production_ready: { enum: ["yes", "with-fixes", "no"] },
    findings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "severity", "location", "introduced", "detail", "confidence"],
        properties: {
          title: { type: "string" },
          severity: { enum: ["blocker", "high", "medium", "low", "nit"] },
          location: { type: "string", description: "file:line — be precise" },
          introduced: {
            enum: ["this-pr", "pre-existing", "unclear"],
            description:
              "Did THIS PR introduce the bug, or was it pre-existing in a file the PR merely touched? Check `git diff $BASE..$REVIEW_SHA -- <file>` — if the buggy lines are unchanged by the diff, it's pre-existing. The user triages a regression differently from adjacent debt the boy-scout rule says to fix.",
          },
          claim_vs_reality: {
            type: "string",
            description:
              "If the PR body/commit claims something here, quote the claim and state what the code actually does.",
          },
          detail: {
            type: "string",
            description: "Concrete mechanism: how it breaks, what triggers it, why it matters. Cite code.",
          },
          suggested_fix: { type: "string" },
          confidence: { enum: ["high", "medium", "low"] },
        },
      },
    },
  },
};

const VERDICT = {
  type: "object",
  additionalProperties: false,
  required: ["finding_title", "is_real", "adjusted_severity", "reasoning", "recommended_action"],
  properties: {
    finding_title: { type: "string" },
    is_real: { type: "boolean", description: "After reading the actual code at the pinned sha: genuine issue, or reviewer misread?" },
    adjusted_severity: { enum: ["blocker", "high", "medium", "low", "nit", "not-a-bug"] },
    reasoning: { type: "string", description: "Quote the specific code (file:line) that confirms or refutes." },
    impact_if_real: { type: "string" },
    recommended_action: { type: "string" },
  },
};

const SYNTHESIS = {
  type: "object",
  additionalProperties: false,
  required: ["verdict", "summary", "blockers", "high_priority", "medium_priority", "strengths", "coverage_gaps"],
  properties: {
    verdict: { enum: ["ship", "ship-with-fixes", "block"] },
    summary: { type: "string", description: "The honest bottom line in 3-6 sentences." },
    blockers: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "dimension", "why", "fix"],
        properties: { title: { type: "string" }, dimension: { type: "string" }, why: { type: "string" }, fix: { type: "string" } },
      },
    },
    high_priority: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "dimension", "why", "fix"],
        properties: { title: { type: "string" }, dimension: { type: "string" }, why: { type: "string" }, fix: { type: "string" } },
      },
    },
    medium_priority: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "dimension", "note"],
        properties: { title: { type: "string" }, dimension: { type: "string" }, note: { type: "string" } },
      },
    },
    strengths: { type: "array", items: { type: "string" }, description: "What independent verification CONFIRMED holds up. Anti-FUD." },
    coverage_gaps: { type: "string", description: "What the dimension split could NOT fully cover and a human must still eyeball." },
  },
};

// PREAMBLE: shared adversarial stance. Substitute the REAL base ref and review
// sha you captured in Phase 0, and the one-line PR description.
const REVIEW_SHA = "<paste the sha from Phase 0>";
const BASE = "<paste the base sha from Phase 0>";
const PREAMBLE = `You are reviewing [PR # / branch] of Clawtsapp — a multi-tenant WhatsApp business-automation product (Hono + Drizzle + Postgres API behind Kapso WhatsApp workflows; Next.js owner/admin dashboards; customer + owner text Ema, the agent, in Bolivian Spanish). The repo root is your cwd. The review is PINNED to commit ${REVIEW_SHA}; the base is ${BASE}.

This is a THERMONUCLEAR adversarial review. [If the PR body is polished / claims prior review waves, say so.] Your job is to find what was MISSED and to independently verify — not trust — the PR's self-assessment. A polished PR body ("every mutation audited", "all gated", "computes from one source") is a reason for MORE skepticism, not less. Assume nothing is correct until you read the code.

How to work:
- Review COMMITTED state at ${REVIEW_SHA} ONLY. Read via \`git show ${REVIEW_SHA}:<path>\` and \`git diff ${BASE}..${REVIEW_SHA} -- <paths>\`. Do NOT read the working tree — this is a multi-worktree repo and the tree can change under you mid-review, producing phantom "uncommitted" findings. Read the FULL files at that sha, not just the hunks.
- READ THE INVARIANTS FIRST: root AGENTS.md/CLAUDE.md and \`services/api/AGENTS.md\` (also \`workflows/AGENTS.md\`, \`apps/owner/AGENTS.md\` if relevant). They encode the load-bearing rules and the CI gate that enforces each. When the PR body makes a claim about your area, find the code behind it and confirm it actually does that. If it doesn't, that's a finding with claim_vs_reality filled in.
- Prefer concrete, reproducible mechanisms over vibes. "A scheduling-read token reaches X because the route checks only requireOwnerCaller, not denyScheduling" beats "auth looks risky".
- If your dimension is architecture / data-model / tech-debt / agent-context, hold it to the SAME rigor as a security finding: cite the WRITTEN rule it breaks (a CLAUDE.md _Code completeness_ / _Code reuse & hygiene_ rule, a sub-component AGENTS.md invariant, or the \`validate:architecture\` gate) OR a CONCRETE near-term failure it creates (a migration-and-backfill it forces, a roadmap shape the model can't represent, the next agent a prompt/AGENTS.md edit will mislead). Pure preference with no rule and no mechanism is NOT a finding — drop it.
- Severity: blocker = cross-tenant data leak / owner-auth bypass / silently-wrong money / data loss / a live Kapso tool that 500s on every call. high = wrong behavior in a realistic case, a strong correctness/robustness gap, OR an anchored durability break this repo flags loudly (a deliberate hack over an easy refactor, a data model that can't hold a known next feature, prompt/AGENTS.md pollution that will misguide the next agent). medium = real but bounded. low/nit = polish. Durability findings rarely warrant blocker (no live leak/money loss) but commonly warrant high — do not auto-demote them to nit because they "aren't a bug".
- For every finding set \`introduced\`: did THIS diff create the bug ('this-pr'), or is it pre-existing in a file the PR merely touched ('pre-existing')? Check \`git diff ${BASE}..${REVIEW_SHA} -- <file>\` — if the buggy lines are unchanged, it's pre-existing. Report both (boy-scout rule), but the user gates ship on regressions and schedules pre-existing debt.
- Report only what you can substantiate from code. Set confidence honestly; a high-severity / low-confidence finding is fine if you say so. Do NOT self-filter — a verifier filters next. Do NOT pad with generic advice; every finding points at real code.`;

// DIMENSIONS: tailor to the diff. Each prompt = PREAMBLE + "YOUR DIMENSION" +
// exact files to read + a "verify hard" checklist of claims/invariants/gates.
// See references/example-owner-agent-parity.md for fully-armed example briefs.
const DIMENSIONS = [
  {
    key: "tenancy-rls",
    prompt: `${PREAMBLE}\n\nYOUR DIMENSION: ...\nRead: ...\nVerify hard:\n- ...\n\nReport findings via the schema.`,
  },
  // ... add the dimensions you scouted (see the menu and the worked example).
];

phase("Attack");
log(`Launching ${DIMENSIONS.length} adversarial reviewers`);

const dimensionResults = await pipeline(
  DIMENSIONS,
  (dim) => agent(dim.prompt, { label: `review:${dim.key}`, phase: "Attack", schema: FINDINGS }),
  (review, dim) => {
    if (!review || !Array.isArray(review.findings)) {
      return { dimension: dim.key, overall: review?.overall_assessment || "no result", production_ready: review?.production_ready || "unknown", findings: [], verified: [], passthrough: [] };
    }
    const sig = (f) => ["blocker", "high", "medium"].includes(f.severity);
    const significant = review.findings.filter(sig);
    const passthrough = review.findings.filter((f) => !sig(f));
    return parallel(
      significant.map(
        (f) => () =>
          agent(
            `${PREAMBLE}\n\nYou are the VERIFIER. A "${dim.key}" reviewer reported the finding below. Independently confirm or REFUTE it by reading the actual code at ${REVIEW_SHA}. Default to skepticism: if you cannot find code that substantiates it, mark is_real=false. For a DURABILITY finding (architecture / data-model / tech-debt / agent-context), "substantiates" means the code violates a CITED written rule (CLAUDE.md _Code completeness_ / _Code reuse & hygiene_, a sub-component AGENTS.md invariant, or a \`validate:architecture\` gate) OR creates a concrete near-term failure — confirm THAT; refute it only when it is pure preference with no rule and no mechanism (do NOT refute a real, rule-anchored durability break just because nothing crashes). If real, set the severity you'd defend to a senior engineer.\n\nTITLE: ${f.title}\nCLAIMED SEVERITY: ${f.severity}\nLOCATION: ${f.location}\nCLAIM vs REALITY: ${f.claim_vs_reality || "(n/a)"}\nDETAIL: ${f.detail}\nSUGGESTED FIX: ${f.suggested_fix || "(none)"}\n\nGo read ${f.location} and the surrounding code now (git show ${REVIEW_SHA}:<path>). Quote the exact lines that confirm or refute.`,
            { label: `verify:${dim.key}`, phase: "Verify", schema: VERDICT },
          ).then((v) => ({ ...f, verdict: v })),
      ),
    ).then((verified) => ({
      dimension: dim.key,
      overall: review.overall_assessment,
      production_ready: review.production_ready,
      findings: review.findings,
      verified: verified.filter(Boolean),
      passthrough,
    }));
  },
);

const clean = dimensionResults.filter(Boolean);
const confirmed = [];
for (const d of clean) {
  for (const vf of d.verified || []) {
    if (vf.verdict && vf.verdict.is_real && vf.verdict.adjusted_severity !== "not-a-bug") {
      confirmed.push({
        dimension: d.dimension,
        title: vf.title,
        severity: vf.verdict.adjusted_severity,
        location: vf.location,
        introduced: vf.introduced,
        why: vf.verdict.reasoning,
        impact: vf.verdict.impact_if_real,
        action: vf.verdict.recommended_action,
      });
    }
  }
}
log(`${confirmed.length} findings survived verification across ${clean.length} dimensions`);

phase("Synthesize");
// Feed the synthesizer a COMPACT input, NOT the full `clean` blob — passing every
// raw finding + verdict collapses it into empty arrays + a garbled summary.
const compactDimensions = clean.map((d) => ({ dimension: d.dimension, production_ready: d.production_ready, overall: d.overall }));
const synthesis = await agent(
  `${PREAMBLE}\n\nYou are the SYNTHESIZER and final judge. Adversarial reviewers attacked the PR; every significant finding was then independently verified against the code at ${REVIEW_SHA}. Produce the production-readiness verdict.\nRules:\n- Every finding in the CONFIRMED SHORTLIST already passed independent verification — treat them as real and use their (already-adjusted) severity.\n- Dedup findings multiple dimensions surfaced into ONE entry (e.g. the same cross-tenant leak caught by tenancy-rls and owner-caller-auth).\n- A confirmed DURABILITY finding (architecture, data-model, tech-debt, agent-context) counts at its verified severity exactly like a correctness one — this repo gates on "hacks compound / refactor over patch", so a verified high-severity hack-over-refactor or context-pollution finding belongs in high_priority, NOT demoted to a passing note because it "isn't a bug".\n- 'block' requires at least one genuine blocker. 'ship-with-fixes' if only high/medium remain. 'ship' only if nothing above medium and the mediums are clearly optional.\n- In strengths, state what verification CONFIRMED holds, drawing on the per-dimension assessments (anti-FUD). In coverage_gaps, name what the dimension split might have let slip and what a human should still eyeball (the repo bar is "done means you ran it live end-to-end" — a static review never clears that).\n- Populate the arrays; do NOT cram everything into summary. The reader is a senior engineer who decides the action path. No hedging, no padding.\n\nPER-DIMENSION ASSESSMENTS (JSON):\n${JSON.stringify(compactDimensions, null, 1)}\n\nCONFIRMED SHORTLIST (post-verification — these are the real findings):\n${JSON.stringify(confirmed, null, 1)}`,
  { label: "synthesize", phase: "Synthesize", schema: SYNTHESIS },
);

return {
  verdict: synthesis.verdict,
  synthesis,
  dimensionSummaries: clean.map((d) => ({
    dimension: d.dimension,
    production_ready: d.production_ready,
    overall: d.overall,
    findingCount: (d.findings || []).length,
    confirmedCount: (d.verified || []).filter((v) => v.verdict && v.verdict.is_real).length,
  })),
  confirmed,
};
```

## Dimension menu (Clawtsapp-tailored)

Pick the ones the diff touches; rename/merge freely. The dimension _name_ is not
what finds bugs — the **tailored file list + claims-to-disprove + the CI gate that
should have caught it** is. Always do that tailoring in Phase 0.

| key                   | what this reviewer attacks |
| --------------------- | -------------------------- |
| `tenancy-rls`         | `withTenant` / `withAdminBypass` on every new path; bare-`db` imports that pass under the superuser DSN and return zero rows under the prod login role (the `check-api-rls-as-api-role` canary); cross-tenant leaks in lookups/joins (clients search by name/phone, attention feed, caja, promotions `catalog_item_ids uuid[]`); a missing `tests/rls-enforcement.test.ts` case for a new cross-tenant path. |
| `owner-caller-auth`   | `requireOwnerCaller` on EVERY action including reads (multi-action routes must gate **before** the `switch`); `denyScheduling` / `requireOwnerRole` on financial + admin surfaces; the workflow tool body keeps `caller_phone`/`business_id` context-bound and OUT of `body_schema`; the "deliberately dashboard-only" boundary (staff payouts, payment corrections, commissions, user/role mgmt) not reachable via the new tools; `tests/kapso-owner-caller-phone.test.ts` ratchet complete. |
| `kapso-coercion`      | New tool routes coerce Kapso's stringified bodies (`coerceJsonArray`/`coerceJsonObject`/`coerceBoolean`/`coerceOptionalBoolean`/`coerceOptional*`); `coerceBoolean` empty→false used where `coerceOptionalBoolean` was needed (silent setting flip); tool `body` shape matches the route Zod schema (`tests/tool-schema-contract.test.ts`); 1024-char tool-description cap; raw `z.array` (`tests/kapso-array-coercion.test.ts`). |
| `shared-lib-parity`   | The central PR claim: agent tool + dashboard `/v1/owner/*` twin compute from ONE hoisted `src/lib/` helper. Did the slimmed dashboard route actually delegate, or did a path diverge (different filter, rounding, status derivation, wire shape)? Dead/forked logic left behind. |
| `money-correctness`   | Integer-cents discipline; caja ledger math (gross net of refunds, proportional tip-refund rounding with `NULLIF` div-guard, deferred "a cuenta", per-staff owed/commission); promotion math (percentage clamp [1,99], fixed single-item); all chat money via `formatMoneyForChat`, never inline `${currency}`. |
| `correctness-regress` | The PR's claimed fixes: archived catalog items not bookable by name OR id across `book`/`availability`/`reschedule` (paused stays bookable); the follow-up "already replied" suppression matching the dashboard and not breaking the documented already-booked guards; soft-archive (never hard-delete — the promo `uuid[]` integrity depends on it). |
| `prompt-pagination`   | `prompts/agents/owner.md` adds NO volatile facts (long-lived-execution invariant); list actions (clients/attention/promotions/followups) follow the offset pagination contract, not a silent `slice(0,N)`; the agent prompt routes natural language to the right tool without leaking remembered data. |
| `tests-audit-i18n`    | Do the new tests actually RUN under Postgres in CI and assert behavior (gate rejection, cross-tenant 404, coercion, parity) not implementation? Any "Verified" claim with no running test? Every mutation writes `admin_audit_log` with the right action/actor; no new `console.*`; owner-facing strings Bolivian Spanish (`vos`), Bs, UTC-4. |
| `data-model-arch`     | **Durability.** Schema/migration soundness (tenant-scoped & RLS-compatible; no bare-`db` import in a route — `validate:architecture` gates it); honest integrity (soft-archive vs hard-delete given the FK-less promo `uuid[]`); business logic shared from `src/lib/`, not forked dashboard↔agent; a wire/DB shape the next feature can't extend without a migration-and-backfill. Anchor every finding to the layering rules + the single-source-of-truth invariant, not taste. |
| `tech-debt`           | **Durability.** The CLAUDE.md _Code completeness_ / _Code reuse & hygiene_ bar: a backwards-compat shim with no concrete caller; parallel versions (`Foo`+`FooV2`, `*-old.ts`); a localized hack where a small refactor was the right call; a duplicated constant/regex/business-rule instead of one shared export; dead code left behind; a half-finished lake. Each finding QUOTES the rule it breaks — a maintainability opinion with no rule and no concrete future failure is not a finding. |
| `agent-context`       | **Durability.** Context pollution: volatile facts in long-lived prompts (`prompts/agents/*.md`, `vars.*`); conflicting / duplicated / misguided instructions added to a prompt or tool; an `AGENTS.md` edit that now contradicts the code or omits a rule the new code needs (`validate:architecture` drift gate); tool-description 1024-char overflow; prompt bloat that buries the signal or hands the agent two ways to do one thing. |

## Phase 4 — report the verdict (to the user)

**You write the human-facing verdict — from `confirmed[]`, not by copying the
workflow's `synthesis`.** The in-workflow synthesis agent is advisory and can come
back sparse (when overloaded it once returned empty arrays + a garbled telegraphic
summary). The trustworthy payload is the returned `confirmed[]` shortlist (each
already passed independent verification) plus the per-dimension `overall`
assessments in `dimensionSummaries`. Read those and write the verdict yourself. If
`synthesis` is well-formed, use it as a starting draft; if sparse or garbled,
ignore it and synthesize from `confirmed[]`.

Structure the report in this order:

1. **Verdict: ship / ship-with-fixes / block**, with the one-line why. A verified
   blocker (cross-tenant leak, owner-auth bypass, silently-wrong money) = block.
   Decide this from `confirmed[]` severities, not the synthesis agent's `verdict`
   field if that field looks untrustworthy.
2. **What held up** — the confirmed strengths, so the user knows the review wasn't
   just hunting for fault (this is what makes the verdict credible).
3. **Confirmed findings** by severity (blocker → high → medium), each with
   `file:line`, the mechanism, and the fix. Cite the PR-body claim it falsifies
   where relevant. Two reconciliations to do here, both seen in real runs:
   - **Dedup across dimensions.** The same defect often surfaces from two
     dimensions (e.g. a catalog fork caught by both `shared-lib-parity` and
     `correctness-regress`) and may arrive with two different severities. Collapse
     to one entry at the **highest defensible** severity — don't list it twice.
   - **Split regression vs pre-existing.** Group `introduced: "this-pr"` findings
     (these gate the verdict) separately from `introduced: "pre-existing"` ones
     (adjacent debt in touched files — real, worth a fast-follow, but they don't
     by themselves block a PR whose own diff is sound). The user triages these
     very differently; don't bury a real regression under pre-existing noise.
4. **Coverage gaps** a human must still eyeball — the repo bar is "done means you
   ran it live end-to-end"; a static review never clears that. Name what was not
   exercised (no real Kapso webhook fired, no cross-tenant request against a live
   DB, no browser pass on the owner dashboard twin, no money figure reconciled
   against the dashboard).
5. **Action path options** — surgical fixes now vs fast-follow vs ship-as-is — and
   ask how aggressive the user wants to be. Do NOT start fixing in this skill;
   fixing is a separate, explicit step (the established pattern is parallel
   fix-agents per finding + one gate/critic agent, on a branch, ending in a PR via
   `pr-description`).

## Calibration & cost

Measured run on the owner-agent-parity PR (4,114 insertions / 39 files, 8
dimensions, single verifier per significant finding): **20 agents (8 reviewers +
11 verifiers + 1 synthesizer), ~1.45M tokens, 482 tool calls, ~13.6 min**. The
verifier refuted hard — **29 raw findings → 11 confirmed** (tenancy-rls 2→0,
kapso-coercion 2→0: both fully cleared, which is what made the "isolation is
airtight" strength credible). That filter is the cost that buys a trustworthy
verdict; do not skip it. Budget **~1.5-2.5M tokens / 10-20 min** for a large PR.
See `references/example-owner-agent-parity.md` for the exact briefs and how the
output read back.

Size to the diff:

- **Small PR (< ~10 commits, focused):** 3-4 dimensions, single verifier per finding.
- **Large / "be thorough" / "thermonuclear":** 6-8 dimensions; for the 2-3 riskiest
  findings (cross-tenant leak, money, owner-auth), run 3 verifiers and treat
  majority-confirm as real.

The concurrency cap is `min(16, cores − 2)`, so dimensions and verifiers queue and
drain automatically — pass them all at once. Run reviewers at the session's model;
don't downgrade to a cheaper tier for this work.

**Two failure modes designed against above — keep them in mind if you adapt the script:**

1. _Moving working tree._ The review runs for tens of minutes; if reviewers read
   the working tree and a commit lands mid-run (common in this multi-worktree
   repo), they report against a vanished state. Pinning every reviewer to
   `$REVIEW_SHA` and committed state prevents this.
2. _Synthesizer overload._ Feeding the final synthesis agent every raw finding
   collapses it into empty arrays + a garbled summary. Feed it only the confirmed
   shortlist + per-dimension assessments, and write the real verdict yourself in
   Phase 4.
