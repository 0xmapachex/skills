# pr-overview

Generate an interactive HTML walkthrough of a pull request — executive
summary, architecture/UML, optional user-flow, optional database ER (with
green/blue/red change coloring), light code observations, rollout risks,
open questions.

Two runtimes ship: `SKILL.md` (Claude Code) and `agents/openai.yaml`
(Codex). Both invoke `scripts/render.mjs` against a JSON spec produced by
the agent. See `SKILL.md` for the contract.

For DB-only overviews, prefer the sibling skill `pr-db-review-overview`.
