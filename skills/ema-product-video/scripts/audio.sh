#!/usr/bin/env bash
# Audio for the video. Two subcommands:
#
#   audio.sh eq <in> <out>
#     "Broadcast clean" voice chain — highpass, denoise, gentle de-mud + presence lift,
#     compression, loudness normalize. Bake this into the proxy the presenter video uses.
#     NOTE: OffthreadVideo caches by filename — give <out> a NEW name and update staticFile().
#
#   audio.sh music <video> <music> <out> [music_seek]
#     Lay a music bed UNDER the voice with sidechain ducking (music drops when he talks).
#     music_seek = seconds into the track to start (default 12, skips a soft intro).
set -euo pipefail

cmd="${1:-}"; shift || true

case "$cmd" in
  eq)
    IN="$1"; OUT="$2"
    ffmpeg -nostdin -y -v error -i "$IN" \
      -af "highpass=f=80, afftdn=nf=-25, equalizer=f=300:t=q:w=1.0:g=-2.5, equalizer=f=3000:t=q:w=1.4:g=2.5, treble=g=1.5:f=9000, acompressor=threshold=-18dB:ratio=3:attack=8:release=120, loudnorm=I=-16:TP=-1.5:LRA=11" \
      -c:v copy -c:a aac -b:a 256k "$OUT"
    echo "EQ'd voice → $OUT"
    ;;
  music)
    VID="$1"; MUS="$2"; OUT="$3"; SEEK="${4:-12}"
    ffmpeg -nostdin -y -v error -i "$VID" -ss "$SEEK" -i "$MUS" -filter_complex \
      "[1:a]aformat=channel_layouts=stereo,atrim=0:150,asetpts=N/SR/TB,loudnorm=I=-21:TP=-2[m];[m][0:a]sidechaincompress=threshold=0.12:ratio=2.5:attack=30:release=500[d];[0:a][d]amix=inputs=2:normalize=0,alimiter=limit=0.97[a]" \
      -map 0:v -map "[a]" -c:v copy -c:a aac -b:a 192k -shortest "$OUT"
    echo "music laid under voice → $OUT"
    ;;
  *)
    echo "usage: audio.sh eq <in> <out>   |   audio.sh music <video> <music> <out> [seek]"; exit 1
    ;;
esac
