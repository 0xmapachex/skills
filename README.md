# Mapache Skills

Claude and Codex compatible skills published by `0xmapachex`.

## Skills

- `ad-creative-studio` - produce polished, on-brand social media image ads for any company. Claude orchestrates; Codex `gpt-5.5` generates a text-free photo via its built-in `image_gen` tool; the brand layer (headline, logo, offer, CTA) is composited deterministically in HTML.
- `ngrok-tunnel` - expose a local port to the internet on a stable free ngrok static domain.
- `pr-db-review-overview` - create complete PR overviews with special handling for database, migration, schema, ORM, seed, and data-model changes.

## Install In Claude Code

As a Claude Code marketplace plugin:

```text
/plugin marketplace add 0xmapachex/ngrok-tunnel-skill
/plugin install mapache-skills@0xmapachex
```

The plugin source is the repository root. Claude loads the skills from `skills/`.

## Install In Codex

The repo includes `.codex-plugin/plugin.json` with `skills` pointing at `./skills/`.
You can also install one or both skills directly from this repo:

```bash
python3 ~/.codex/skills/.system/skill-installer/scripts/install-skill-from-github.py \
  --repo 0xmapachex/ngrok-tunnel-skill \
  --path skills/ngrok-tunnel skills/pr-db-review-overview
```

Manual install also works:

```bash
git clone https://github.com/0xmapachex/ngrok-tunnel-skill.git /tmp/mapache-skills
cp -R /tmp/mapache-skills/skills/ngrok-tunnel ~/.codex/skills/
cp -R /tmp/mapache-skills/skills/pr-db-review-overview ~/.codex/skills/
```

Restart Codex after installing new skills.

## Standalone Skill Install

For any markdown-skill loader, copy a folder from `skills/` into that tool's skill directory.

```bash
git clone https://github.com/0xmapachex/ngrok-tunnel-skill.git /tmp/mapache-skills
cp -R /tmp/mapache-skills/skills/ngrok-tunnel ~/.claude/skills/
cp -R /tmp/mapache-skills/skills/pr-db-review-overview ~/.claude/skills/
```

## Repo Layout

```text
.
├── .claude-plugin/
│   ├── marketplace.json
│   └── plugin.json
├── .codex-plugin/
│   └── plugin.json
├── skills/
│   ├── ad-creative-studio/
│   │   ├── SKILL.md
│   │   ├── references/
│   │   ├── templates/
│   │   └── scripts/
│   ├── ngrok-tunnel/
│   │   ├── SKILL.md
│   │   ├── agents/openai.yaml
│   │   └── setup.sh
│   └── pr-db-review-overview/
│       ├── SKILL.md
│       └── agents/openai.yaml
├── README.md
└── LICENSE
```

## Notes

- `skills/` is the canonical folder for both Claude and Codex.
- `ngrok-tunnel/setup.sh` remains executable and handles the one-time ngrok install/auth/domain setup.
- `pr-db-review-overview` includes the DB-diff classification rules and visual overview conventions.

## License

MIT - see `LICENSE`.
