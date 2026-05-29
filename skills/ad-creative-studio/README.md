# ad-creative-studio

Produce polished, on-brand social media **image ads** for any company.

**Architecture (required):** Claude orchestrates (art direction, prompts, compositing, review); **Codex CLI with `gpt-5.5`** (or latest) executes the photo via its built-in `image_gen` tool. Two layers: a **text-free photograph** from Codex + a **brand layer** (headline, logo, offer, CTA) composited deterministically in HTML for pixel-perfect, correctly-accented type.

First run gathers a brand profile (recommend attaching a brand folder). See `SKILL.md`.

```
SKILL.md                      # workflow + rules (start here)
references/intake-checklist.md
references/design-rules.md     # composition, type, safe zones, CTA, copy, anti-AI
templates/photo-prompt.template.md
templates/composite.template.html
scripts/generate-image.sh      # Codex gpt-5.5 + image_gen
scripts/screenshot.sh          # HTML → PNG (headless Chrome / Playwright / browse)
```
