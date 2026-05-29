---
name: ad-creative-studio
description: |
  Use when creating polished marketing image ads / social creatives for a brand or
  company — Instagram Stories or Feed ads, Facebook ads, promo images, campaign
  visuals, "make an ad", "ad creative", "story ad", "generate ads for my business",
  "social ad", "promo creative" — and when iterating on an ad's photo, copy,
  highlight, layout, logo, offer or CTA. Produces real, on-brand raster ads (a
  photographed scene plus deterministically composited headline, logo, offer and
  CTA). Requires brand inputs (branding, website, audience, offer); on the first
  run, recommend attaching a brand folder.
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - AskUserQuestion
---

# Ad Creative Studio

Produce conversion-focused, on-brand **image ads** for any company.

## Core architecture — DO NOT DEVIATE

This only produces good results with a strict division of labor and a two-layer build. Weakening either one produces garbled, off-brand, amateur output.

1. **Claude is the ORCHESTRATOR** — art director, prompt writer, compositor, reviewer. Claude never "draws" the photo.
2. **Codex CLI (model `gpt-5.5`, or the latest available) is the EXECUTOR** — it generates the photograph using its **built-in `image_gen` tool**. Use the strongest available image model; a weaker model or one without a real image tool gives poor results.
3. **Two layers, always:**
   - **Layer A — the photo (Codex):** a **TEXT-FREE** photograph. No words, logos, prices or UI baked in.
   - **Layer B — the brand (Claude):** headline, logo, offer and CTA composited deterministically in HTML/CSS, then screenshotted to PNG.

**Why split it:** image models misspell text, drop accents/diacritics, and only approximate fonts. Compositing type in HTML gives pixel-perfect, correctly-accented, on-brand text — and lets you iterate copy in seconds without paying to regenerate the photo.

**Two failure modes that ruin everything (forbid them):**
- Letting Codex write SVG / HTML / Canvas / Playwright / renderer code or call an image API instead of the built-in `image_gen` tool → blank or fake output. Frame the task as image generation, require `image_gen`.
- Baking the headline/logo into the photo → garbled text you can't fix or iterate. Keep Layer A text-free; always composite Layer B.

## First run: get the brand inputs

Before generating anything, build a **brand profile**. On the first run, ask the user to **attach or point to a brand folder** and recommend its contents (see `references/intake-checklist.md`):

> Drop a folder with: logo (SVG preferred), brand colors (hex), fonts, brand/voice guidelines, website URL, target audience, the offer/pricing, a few example posts, and 2-3 reference ads you like (and ones you don't).

If there's no folder, ask the gaps directly with AskUserQuestion. Then **write `brand-profile.md`** into the brand folder (or working dir) so later runs skip intake. Re-read it on every subsequent run.

Minimum to proceed: brand name, logo, one accent color, voice/audience, the offer, and the target format.

## Workflow

1. **Intake** → load/derive the brand profile (above).
2. **Concept** → pick one angle, one scene, the proof objects, and ONE blunt idea for the copy. (See `references/design-rules.md` → Copy.)
3. **Generate the text-free photo (Codex)** → fill `templates/photo-prompt.template.md`, then run `scripts/generate-image.sh` (wraps `codex exec` with `gpt-5.5` + `image_gen`). Bake the composition rules into the prompt: subject offset to one side with clean negative space for text, face visible and prominent, safe zones, anti-AI realism. You cannot move a subject after rendering — compose it in the prompt.
4. **Composite the brand layer (Claude)** → copy `templates/composite.template.html`, fill brand tokens + copy + inline the logo SVG, render to PNG (`scripts/screenshot.sh`, full-res 1080×1920 or 1080×1350).
5. **Review** against the checklist in `references/design-rules.md` (focal hierarchy, readable at scroll speed, safe zones, one highlight, contrast, offer loud).
6. **Iterate** → copy/layout/logo are cheap HTML edits + re-screenshot (no regeneration). Regenerate the photo only when the scene, subject position, or face is wrong.

## Non-negotiable design rules (full detail in references/design-rules.md)

- **Face = #1 attention magnet.** Keep the human face visible and prominent. Hide secondary faces (the customer), not the hero.
- **Rule of thirds + balance.** Subject on one third, text column on the other; never a centered island with a dead empty void beside it. The clean text space must be generated INTO the photo.
- **Type:** bold and big enough to read mid-scroll; clear hierarchy (tag → headline → subhead → offer); ONE highlight device (e.g. an accent-color tape behind a single key word). Composite real fonts for correct glyphs and accents.
- **Offer is loud, never fine print.**
- **Platform safe zones (Stories/Reels 1080×1920):** keep all text/logo within the top ~250px and clear of the bottom ~420px — the platform's UI covers them.
- **CTA:** in Stories/Reels, **never draw a fake button** (it isn't tappable, competes with and is hidden by the platform's native CTA). Use the platform's native CTA (set in the ads manager) plus a small in-creative cue pointing to it. A drawn CTA is only OK on a static feed post.
- **Anti-AI realism:** real grain, natural light, correct anatomy, no plastic gloss.

## Codex command (concrete)

```bash
# scripts/generate-image.sh --prompt photo.md --out ./out --name hero-01 --size 1080x1920
codex exec --skip-git-repo-check --sandbox danger-full-access \
  -c 'model_reasoning_effort="low"' --model gpt-5.5 - <<'PROMPT'
Use the imagegen skill. This is an IMAGE GENERATION task, not a coding task.
You MUST use the built-in image_gen tool. Do NOT write SVG/HTML/Canvas/renderer
code, and do NOT call any image API. Save the final PNG to <OUT>/<NAME>.png at
<WIDTH>x<HEIGHT>.

<PASTE THE TEXT-FREE PHOTO PROMPT HERE>
PROMPT
```

## Compositing (concrete)

Author the ad at full resolution in HTML, then screenshot it:

```bash
# full-page screenshot at exact ad size — Chrome headless (portable)
"$CHROME" --headless=new --disable-gpu --hide-scrollbars \
  --window-size=1080,1920 --screenshot="out/ad.png" "file://$PWD/ad.html"
# alternatives: `npx playwright screenshot`, or the gstack `/browse` skill
```

Inline the logo SVG and color it via `currentColor` (a CSS `mask:url(...)` to a local file is silently blocked in many setups — inline it instead).

## Common mistakes

| Symptom | Cause → Fix |
|---|---|
| Blank / fake / drawn "photo" | Codex wrote renderer code → require the built-in `image_gen` tool, frame as image generation |
| Garbled / misspelled headline, dropped accents | Text baked into the photo → keep photo text-free, composite type in HTML |
| Logo shows as black box / invisible | CSS `mask:url(file)` blocked → inline the SVG, set `currentColor` |
| Ad feels unbalanced, text floats, empty void | Centered text + no planned negative space → thirds + offset the subject in the photo prompt |
| Low engagement, no human hook | Face hidden or tiny → make the hero's face visible and prominent |
| CTA button looks broken / cut off in Stories | Drawn a fake button → use the native CTA + a cue; respect bottom safe zone |
| Offer ignored | Offer set as fine print → make it a loud element |
| Mediocre image quality | Weak model / no real image tool → use `gpt-5.5` (or latest) with `image_gen` |

## Supporting files

- `references/intake-checklist.md` — what to collect for the brand profile
- `references/design-rules.md` — composition, type, formats/safe zones, CTA, copy, anti-AI (full checklist)
- `templates/photo-prompt.template.md` — the text-free photo prompt (fill the brackets)
- `templates/composite.template.html` — the brand-layer ad template (full-res, with safe-zone guides)
- `scripts/generate-image.sh` — Codex `gpt-5.5` + `image_gen` wrapper
- `scripts/screenshot.sh` — HTML → PNG via headless Chrome
