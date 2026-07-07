# Worked example — arming reviewers precisely (the run this skill was distilled from)

This is the reference run that produced this skill: an 8-dimension thermonuclear
review of the **owner-agent-parity** PR (4,114 insertions / 39 files / commit
`5d20bb6f`) — which adds owner-agent WhatsApp tools (`manage_business_profile`,
`manage_followups`, `manage_promotions`, `manage_attention`, `search_clients`,
`get_cash_summary`, plus `manage_catalog` `update`/`remove`) to reach
admin-dashboard parity over chat.

The PR body was confident and specific: "every tool gated on `requireOwnerCaller`
+ `withTenant`, every mutation audited", "computes from ONE source", "archived
items no longer bookable", "deliberately kept dashboard-only". The review's job
was to disprove each. **Verdict: ship-with-fixes.** 29 raw findings → **11
confirmed** after independent verification (tenancy-rls and kapso-coercion both
refuted to zero — which is what made the "isolation is airtight" strength
credible rather than reflexive praise).

The point of this file is the _shape_ of a precisely-armed dimension brief vs a
generic "review the auth". In each example below, notice: (a) an exact file list
read at the pinned sha, (b) the PR's specific claims quoted back as things to
disprove, (c) the load-bearing invariant from `services/api/AGENTS.md` the PR
must be held to, and (d) **the CI gate that's supposed to catch a break** —
naming the gate tells the reviewer what's already covered and where the real gap
would hide. Reproduce that shape; the files and claims will differ, the rigor
should not.

---

## Dimension: owner-caller-auth (holding the PR to documented invariants + the ratchet)

> YOUR DIMENSION: Owner-caller authorization & the "deliberately dashboard-only" safety boundary.
>
> Read: `src/lib/owner-caller.ts`; the seven new routes; `workflows/clawtsapp-onboarding/tools/owner-management.ts`; `workflows/clawtsapp-onboarding/definition.json` (the GENERATED truth — grep the new tool bodies); `tests/kapso-owner-caller-phone.test.ts`; `services/api/AGENTS.md` "Owner-initiated WhatsApp routes" + "Owner role gates".
>
> Verify hard:
> - `requireOwnerCaller` on EVERY action including reads. The multi-action routes use an `action` enum + `switch`. Quote the control flow and confirm the gate is called ONCE BEFORE the switch so every branch is covered — or find a branch that runs before/around the gate.
> - The tool body (TS source AND `definition.json`): `business_id`/`caller_phone` injected server-side and MUST NOT appear in `body_schema` (else the LLM spoofs tenant/identity). Confirm against the generated file, not just the TS.
> - The "deliberately dashboard-only" boundary: can the agent reach staff payouts, payment corrections, commission schedules, user/role mgmt, or the follow-up cadence MATRIX through the new tools?
> - Did the slimmed dashboard twins KEEP their `denyScheduling`/`requireOwnerRole` gates after the refactor, or did hoisting drop one?

This brief is what let the reviewer _confirm a strength with evidence_ ("gate is
called once before each action switch in all seven routes; `caller_phone`/`business_id`
absent from every `body_schema`; all six tools in the ratchet, lines 39-44")
rather than hand-wave — and it's also what surfaced the audit gap next door.

## Dimension: correctness-regress (disprove the claimed fixes)

> YOUR DIMENSION: The two claimed correctness fixes + catalog soft-archive integrity. Disprove each claim.
>
> Read: `routes/sessions/{book,availability,reschedule}.ts`; `routes/catalog.ts` (manage update/remove); `src/lib/{follow-up-jobs-db,customer-activity}.ts`; the three new test files; `services/api/AGENTS.md` "Follow-up cadence & cooldown" + "Promotions" (the `uuid[]` integrity note).
>
> Verify hard:
> - CLAIM: "archived items no longer bookable by name OR id in book/availability/reschedule; paused stays bookable." Read the status filter in ALL THREE files. Is "paused" still bookable in all three? A filter that excludes BOTH archived and paused is a regression; one that excludes neither leaves the bug.
> - catalog remove = SOFT archive (`status='archived'`), never hard DELETE — because `promotions.catalog_item_ids` is a bare `uuid[]` with no FK. Find any `DELETE FROM catalog_items`.
> - CLAIM: "the agent follow-up list hides customers who already replied after the inquiry anchor, matching the dashboard exactly." Find the predicate; confirm it applies to the SAME job set the dashboard shows and ADDS to (doesn't remove) the documented already-booked guards.

This is the brief that found the headline bug — by reading the booking-path
status filters AND the dashboard's own delete path, not just the diff hunks.

---

## How the output read back

The synthesis was decision-ready. The two confirmed clusters that gate ship:

1. **HIGH — catalog removal is forked (the headline).** The agent's `remove`
   writes `status='archived'` (`catalog.ts:533`), and all three booking paths
   refuse only archived while keeping paused bookable (`book.ts:236`,
   `availability.ts:94`, `reschedule.ts:375`). But the **dashboard's own delete
   and hide both write `status='paused'`** (`owner/catalog.ts:550`, `:25`) — still
   fully bookable by Ema, by name and id. So "archived items no longer bookable"
   and "compute from ONE source" are both _false for the more common path_: delete
   a service on the web, customers keep booking it over WhatsApp. The dashboard
   can't even produce or label `archived`, and a one-click "Mostrar" silently
   un-archives. `git diff` confirmed `owner/catalog.ts` was untouched (+0) — no
   shared `removeCatalogItem` helper. Correctly rated **high, not blocker** (soft
   state, no leak/auth/money), and `introduced: this-pr` (the PR created the
   `archived`/`paused` divergence).
2. **MEDIUM — catalog audit gap.** The PR's new `auditCatalogMutation` helper
   (`catalog.ts:128`) is wired to only `update` and `remove`; the four pre-existing
   mutations (`add`, `update_price`, `set_unavailable`, `set_available`) write no
   audit row — violating the verbatim AGENTS.md invariant "Every owner mutation
   writes an admin_audit_log row" in the exact section the PR edited. Mostly
   `introduced: pre-existing` (the four branches predate the PR) but sharpened by
   the PR adding selective auditing — a textbook boy-scout fix.

Plus standalone mediums/lows: `get_cash_summary` hands the LLM an already-net
"revenue" + a negative "refunds" with no prompt guidance (double-subtract risk in
the Spanish answer); `manage_promotions` `list` is unbounded (no LIMIT/has_more);
by-name booking of an archived service still creates a 0-price ad-hoc line.

The **strengths** section is what made the verdict credible — independent
verification _confirmed_: every new route is `withTenant` + every new lib takes a
tenant-scoped `tx` (no RLS bypass; the promo `catalog_item_ids` cross-tenant
vector is closed by `verifyPromotionServices`); `requireOwnerCaller` before every
action switch; `caller_phone`/`business_id` out of every `body_schema`; the caja
ledger SQL hoisted verbatim (integer-cents, `NULLIF`/`GREATEST` tip guards, UTC-4
windows); prompt freshness clean (no volatile facts; `prompts.generated.ts` in
sync); 9 test files run under real Postgres, every tool has a non-owner-403 test,
attention/promotions have cross-tenant-404 tests.

**Coverage gaps** named what a static review couldn't clear: nobody sent
"¿cuánto hice hoy?" over a live WhatsApp turn with a refund in the window to read
how Ema narrates the net-revenue/negative-refund pair; nobody clicked
delete-in-dashboard → book-via-Ema end-to-end; the dashboard promotions GET is
also uncapped (the "low cardinality" assumption is an estimate, not measured).

## Two lessons baked back into the skill from this run

- **Label `introduced`.** A large fraction of confirmed findings were
  _pre-existing_ behavior in PR-touched files (the four un-audited catalog
  mutations, the by-name 0-price line), not regressions. The schema now forces
  every finding to declare `this-pr` vs `pre-existing` so the user gates ship on
  regressions and schedules the rest — instead of a real regression drowning in
  adjacent debt.
- **Escape literal `${…}` in dimension prompts.** The first launch died in
  milliseconds with `ReferenceError: cents is not defined` because a
  money-correctness brief contained a literal `` `${cents/100}` `` example that JS
  evaluated as interpolation. `node --check` passes it (valid syntax, runtime
  failure); the guard is a `grep -nE '\$\{[a-z]'` eyeball before launch.

---

## Arming a durability dimension (illustrative — not part of the run above)

The run above was eight correctness & safety dimensions. The `data-model-arch` /
`tech-debt` / `agent-context` dimensions added later are softer and the easiest to
degrade into slop, so they need the SAME shape — exact files, claims to disprove —
except the standard they're held to is a **CLAUDE.md philosophy rule** rather than
only a CI gate, and every finding must **quote that rule or a concrete future
failure**. Illustrative brief for `agent-context` on a PR that edits an owner agent
prompt plus a tool:

> YOUR DIMENSION: Agent-context & harness pollution. Disprove "this prompt/tool change is clean".
>
> Read: the diffed `prompts/agents/*.md` and `vars.*`; the new/edited tool description in `workflows/.../definition.json` (the GENERATED truth, not just the TS); any `AGENTS.md` the PR edits; root CLAUDE.md "Kapso agent executions are long-lived" + "Single source of truth"; the prompt-freshness rules in `services/api/AGENTS.md`.
>
> Verify hard (cite the rule or the concrete failure — taste is not a finding):
> - Volatile facts in a long-lived prompt? Grep the prompt diff for today's date, open-now, today's appointments, menu/staff snapshots, usage counters — executions resume mid-conversation, so any of these is stale by turn two. Rule: "No volatile facts in agent prompts"; the fix is a per-turn tool, not a prompt line.
> - A tool description over the 1024-char cap, or duplicating instructions the prompt already gives (two sources of truth for one behavior)?
> - An `AGENTS.md` line this PR now contradicts, or a rule the new code needs that the PR omitted? That misleads the next agent and trips `validate:architecture`.
> - Does the change hand the agent two ways to do one thing (a new tool overlapping an existing one with no disambiguation)?

The deliverable from such a brief is "the prompt embeds `Hoy es {{date}}` at
`owner.md:NN` against the long-lived-execution rule" — quotable and refutable — not
"the prompt could be cleaner". That single difference is what keeps the durability
dimensions from becoming the generic slop the skill exists to avoid.
