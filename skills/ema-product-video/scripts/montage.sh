#!/usr/bin/env bash
# Extract frames from a video at given timestamps and tile them into one grid image.
# Great for (a) verifying the true order of a screen recording, (b) eyeballing a render
# across many moments at once without scrubbing.
#
# Usage:
#   montage.sh <video> <out.jpg> <t1> <t2> [t3 ...]
# Example:
#   montage.sh out/final-full.mp4 /tmp/grid.jpg 12 21 31 45 64 88 120 135
set -euo pipefail

VID="$1"; OUT="$2"; shift 2
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

inputs=(); filters=(); labels=""
i=0
for t in "$@"; do
  ffmpeg -nostdin -y -v error -ss "$t" -i "$VID" -frames:v 1 -q:v 3 "$TMP/$i.jpg" </dev/null
  inputs+=(-i "$TMP/$i.jpg")
  filters+=("[$i]scale=480:-1[v$i]")
  labels="$labels[v$i]"
  i=$((i+1))
done

# near-square grid
cols=$(python3 -c "import math;print(max(1,int(math.ceil(math.sqrt($i)))))")
rows=$(python3 -c "import math;print(int(math.ceil($i/float($cols))))")
# pad to cols*rows with copies of the last frame so xstack is rectangular
while [ "$i" -lt "$((cols*rows))" ]; do
  inputs+=(-i "$TMP/$(($i-1)).jpg"); filters+=("[$i]scale=480:-1[v$i]"); labels="$labels[v$i]"; i=$((i+1))
done

ffmpeg -nostdin -y -v error "${inputs[@]}" \
  -filter_complex "$(IFS=';'; echo "${filters[*]}");${labels}xstack=inputs=$i:layout=$(python3 -c "
c,r=$cols,$rows
cells=[]
for k in range(c*r):
    x='0' if k%c==0 else '+'.join(['w0']*(k%c))
    y='0' if k//c==0 else '+'.join(['h0']*(k//c))
    cells.append(f'{x}_{y}')
print('|'.join(cells))")[v]" \
  -map "[v]" "$OUT"
echo "montage → $OUT  (${cols}x${rows}, $# frames)"
