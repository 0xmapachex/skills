---
name: ema-product-video
description: Build a code-driven (Remotion) product tutorial video from a presenter recording — recreate the on-screen UI flow with pixel fidelity, sync every screen to the narration, and render. Use when creating or iterating on an Ema/holaema onboarding or product video, or any "talking presenter + animated phone/app screens" tutorial.
---

# ema-product-video

Make a polished tutorial video where a **presenter speaks** (real footage, left) and an **animated phone/app UI** recreates the product flow (right), synced to the narration. Authored entirely as code with **Remotion** — no NLE timeline.

This skill is the playbook + the reusable scripts/templates. It is agent-agnostic (Codex, Claude, Cursor all read this file).

## The one rule that saves the most time

> **Map the narration → screens in an HTML board and get the human's sign-off BEFORE writing any Flow/animation code.** The narration is the source of truth for step order and content. We once built the whole flow, then discovered steps were swapped / missing — the largest rework of the project. The board is cheap; rebuilding the timeline is not.

## Workflow (8 phases, 2 human gates 🚦)

1. **Transcribe** — whisper `large-v3-turbo`, **force `language`** (auto-detect mis-fires, e.g. Spanish→en-US). Output JSON with word offsets. Model lives at `~/models/ggml-large-v3-turbo.bin` (shared across projects; override with `$WHISPER_MODEL`). Bias the prompt with brand/product vocab so proper nouns survive.
2. **Extract** —
   - Narration text + timestamps per segment: `scripts/extract-narration.py`
   - Real reference frames from the screen recording (if recreating real UI): `scripts/montage.sh` — montage them to **verify the true order** (extracted timestamps drift; never trust frame labels).
3. **🚦 MAP & sign-off** — build a `narration-check.html` board (template in `templates/`): per step, the **presenter clip (with audio)** + the **screen** + the **verbatim narration** + a ✓/✗ verdict. Cut the clips with `scripts/cut-clips.sh`. **Get the human to approve the structure before coding.** This board stays the master doc for the whole project.
4. **Build / reuse screens** — recreate each UI screen as a React component to **match the reference frames** (real owners follow it step-by-step → pixel fidelity matters). Reuse the screen kit; extend, don't fork.
5. **Wire the timeline** — map base-time → screens in the `Flow`-style driver. Sync state changes and taps to the **narration timestamps** (find cue words with `extract-narration.py --words`).
6. **🚦 Verify before full render** — render per-step **stills/clips** and montage them (`scripts/montage.sh`). Check each step lands on the right screen with the matching subtitle, and every tap ring sits **on** its button. Fix here — full renders are expensive.
7. **Preview render + music** — disk-safe preview, then duck music under voice.
8. **Broadcast export** — only at the end: PNG frames, freed disk, near-lossless. (Preview is fine for review/sharing.)

## Guardrails (each one cost real iterations — don't relearn them)

- **Verify the render is FRESH before mixing/opening.** A failed render leaves the *old* file in place. `stat -f %Sm out/final-full.mp4` must be *after* you started the render. A `RENDER_DONE` echo is unreliable (fires even when the render errored through a pipe). This bit us twice — wrong cut opened.
- **PNG frames ENOSPC the disk** (~18 GB temp for a full render). Previews = `--scale=0.5 --image-format=jpeg --jpeg-quality=92` (~3 GB). `df -h /` and clean `/var/folders/**/T/remotion-*` before any PNG export.
- **Headless-browser launch timeout** under load → `pkill -f "remotion render"; pkill -f Chromium`, add `--concurrency=4`, retry.
- **Build screens from real reference frames, not guesses.** A guessed screen = a rebuild.
- **Tap alignment is deterministic, not eyeballed** — render the exact tap frame, read it, measure the button's normalized y, set once. Don't nudge-and-re-render.
- **OffthreadVideo caches extracted frames by source filename.** After re-encoding a source (e.g. new audio EQ), **rename it** and update `staticFile(...)` or stale frames get reused.
- **Render with the Remotion CLI** (`npx remotion render <Comp> …`), not programmatic.
- **Make taste calls; show variants, don't assign homework.** Pick the music, pick the layout — present 3–4 variants (HTML mockups) when direction is unclear, never ask "which color" in prose.

## Reusable scripts (`scripts/`)

```bash
# Narration text + timestamps. Pairs of start/end → text per window; --words dumps every word w/ time.
python3 scripts/extract-narration.py <transcript.json> 9 22 23.5 36 36 54
python3 scripts/extract-narration.py <transcript.json> --words | grep -i "abrir"   # find a cue word's time

# Cut per-step clips (presenter w/ audio, or silent real-recording). name:start:end ...
scripts/cut-clips.sh <video.mp4> <outdir> 1-intro:9:22 2-step1:23.5:36   # add --mute for screen-rec

# Extract frames at timestamps and montage into a grid (verify order / verify a render).
scripts/montage.sh <video.mp4> /tmp/grid.jpg 12 21 31 45 64 88 120 135

# Audio. eq = voice clean-up (bake into the proxy); music = sidechain-duck a bed under the voice.
scripts/audio.sh eq  <in.mov> <out.mov>
scripts/audio.sh music <video.mp4> <music.mp3> <out.mp4>
```

## Saved commands

**Preview render (disk-safe):**
```bash
npx remotion render <Comp> out/final-full.mp4 --scale=0.5 --codec=h264 --image-format=jpeg --jpeg-quality=92 --concurrency=4
```
**Broadcast render (PNG, needs ~18 GB free):**
```bash
npx remotion render <Comp> out/final-full.mp4 --image-format=png --crf 14 --x264-preset slow
```

## HTML board templates (`templates/`)

- `board.template.html` — minimal per-step board (presenter clip + screen + narration + verdict). The **master mapping doc**; clone per project.
- `examples/` — real boards from the first Ema onboarding video (`narration-check`, `steps-compare`, `steps-map`, `steps-puzzle`) as worked references. The compare/map/puzzle variants are for fidelity QA and catching missing/mis-ordered steps.

## Remotion screen kit (carry forward)

The first project (`~/Desktop/video-edit-onboarding/remotion/`) holds reusable building blocks — copy/adapt rather than rebuild:
- `screens/SafariChrome.tsx` — minimal iOS Safari chrome (dynamic island in the status bar, compact URL pill, no bottom toolbar, auto bg by URL).
- `screens/Meta*.tsx`, `KapsoConfig.tsx`, `Holaema*.tsx` — the Meta Embedded-Signup / Kapso / holaema screens.
- `overlay2/` — boxed "Option A" layout, presenter **morph** (full-frame ↔ left box; intro AND outro), `phoneZoom` (fast top-center zoom on input-heavy steps), `IntroNeeds` motion graphics, `BrandMark`, `Subs`.
- Localization: Bolivian Spanish ("vos"), Bs currency, UTC-4. Brand amber `#F0AB1A`, Geist (presenter UI) / IBM Plex (holaema/Kapso) / Inter (Meta).
- Music bed "Bossa Antigua" (Kevin MacLeod, CC-BY 4.0) — **credit line required**.
