#!/usr/bin/env bash
# Generate ONE text-free ad photo with Codex CLI's built-in image_gen tool.
# Claude orchestrates; Codex (gpt-5.5 or latest) executes. Do not substitute a
# weaker model and do not let Codex write renderer code — it must call image_gen.
#
# Usage:
#   scripts/generate-image.sh --prompt photo.md --out ./out --name hero-01 \
#     [--size 1080x1920] [--model gpt-5.5]
set -euo pipefail

PROMPT_FILE="" OUT="./out" NAME="ad" SIZE="1080x1920" MODEL="${CODEX_IMAGE_MODEL:-gpt-5.5}"
while [ $# -gt 0 ]; do
  case "$1" in
    --prompt) PROMPT_FILE="$2"; shift 2;;
    --out)    OUT="$2";         shift 2;;
    --name)   NAME="$2";        shift 2;;
    --size)   SIZE="$2";        shift 2;;
    --model)  MODEL="$2";       shift 2;;
    *) echo "unknown arg: $1" >&2; exit 1;;
  esac
done
[ -n "$PROMPT_FILE" ] || { echo "need --prompt <file>" >&2; exit 1; }
command -v codex >/dev/null || { echo "codex CLI not found on PATH" >&2; exit 1; }

mkdir -p "$OUT"
OUT_ABS="$(cd "$OUT" && pwd)"
WIDTH="${SIZE%x*}"; HEIGHT="${SIZE#*x}"
BODY="$(cat "$PROMPT_FILE")"

PROMPT=$(cat <<EOF
Use the imagegen skill. This is an IMAGE GENERATION task, not a coding task.
You MUST use the built-in image_gen tool. Do NOT write SVG, HTML, Canvas,
Playwright or renderer code, and do NOT call any image API or CLI fallback.
Save the final PNG to: ${OUT_ABS}/${NAME}.png  at exactly ${WIDTH}x${HEIGHT}.
If the tool saves elsewhere first, copy the final PNG to that exact path.

${BODY}
EOF
)

echo "→ codex (${MODEL}) generating ${NAME}.png (${SIZE}) into ${OUT_ABS}"
printf '%s' "$PROMPT" | codex exec \
  --skip-git-repo-check \
  --sandbox danger-full-access \
  -c 'model_reasoning_effort="low"' \
  --model "$MODEL" -

if [ -f "${OUT_ABS}/${NAME}.png" ]; then
  echo "✓ ${OUT_ABS}/${NAME}.png"
else
  echo "⚠ expected ${OUT_ABS}/${NAME}.png not found — check Codex output above" >&2
  exit 2
fi
