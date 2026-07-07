#!/usr/bin/env python3
"""Pull narration text (and timing) out of a whisper JSON transcript.

Usage:
  extract-narration.py <transcript.json> <start> <end> [<start> <end> ...]
      Print the spoken text inside each [start,end] window (seconds).
  extract-narration.py <transcript.json> --words
      Dump every word with its start time (one per line) — use to find a cue word's
      timestamp, e.g.  ... --words | grep -i "abrir".

Works with whisper.cpp-style JSON: {"transcription":[{"tokens":[{"text","offsets":{"from","to"}}]}]}
(offsets in milliseconds).
"""
import json, sys


def load_words(path):
    data = json.load(open(path))
    words = []
    for seg in data.get("transcription", []):
        for tk in seg.get("tokens", []):
            x = tk.get("text", "")
            if x.startswith("[") or not x.strip():
                continue
            off = tk.get("offsets", {})
            words.append((off.get("from", 0) / 1000.0, off.get("to", 0) / 1000.0, x))
    return words


def main():
    if len(sys.argv) < 2:
        print(__doc__); sys.exit(1)
    words = load_words(sys.argv[1])
    args = sys.argv[2:]

    if args and args[0] == "--words":
        for s, _e, w in words:
            t = w.strip()
            if t:
                print(f"{s:7.2f}  {t}")
        return

    if len(args) % 2 != 0:
        print("error: provide start/end pairs (even number of times)"); sys.exit(1)
    for i in range(0, len(args), 2):
        a, b = float(args[i]), float(args[i + 1])
        txt = "".join(w for (s, _e, w) in words if a - 0.2 <= s <= b)
        txt = " ".join(txt.split())
        print(f"=== {a}-{b}s ===\n{txt}\n")


if __name__ == "__main__":
    main()
