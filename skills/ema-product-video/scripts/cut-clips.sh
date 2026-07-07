#!/usr/bin/env bash
# Cut per-step clips from a video. Each clip is name:start:end (seconds).
# Presenter clips keep audio (to check narration↔screen sync); pass --mute for silent
# screen-recording clips. Output scaled to 560px wide (small, board-friendly).
#
# Usage:
#   cut-clips.sh <video> <outdir> [--mute] <name:start:end> [<name:start:end> ...]
# Example:
#   cut-clips.sh base.mov narration-clips 0-intro:9:22 1-paso1:23.5:36 2-paso2:36:54
set -euo pipefail

VID="$1"; OUT="$2"; shift 2
MUTE=0
if [ "${1:-}" = "--mute" ]; then MUTE=1; shift; fi
mkdir -p "$OUT"

for spec in "$@"; do
  name="${spec%%:*}"; rest="${spec#*:}"; a="${rest%%:*}"; b="${rest##*:}"
  if [ "$MUTE" = "1" ]; then
    ffmpeg -nostdin -y -v error -ss "$a" -to "$b" -i "$VID" -vf "scale=560:-2" \
      -c:v libx264 -preset veryfast -crf 24 -an "$OUT/$name.mp4" </dev/null
  else
    ffmpeg -nostdin -y -v error -ss "$a" -to "$b" -i "$VID" -vf "scale=560:-2" \
      -c:v libx264 -preset veryfast -crf 24 -c:a aac -b:a 160k "$OUT/$name.mp4" </dev/null
  fi
  echo "  $name.mp4  ($a-$b s)"
done
echo "done → $OUT"
