# Vendored bundles

| file | version | source | license |
|------|---------|--------|---------|
| `panzoom.min.js` | 9.4.3 | https://unpkg.com/panzoom@9.4.3/dist/panzoom.min.js | MIT (Andrei Kashcha) |
| `mermaid.min.js` | 11.4.1 | https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.min.js | MIT (Mermaid contributors) |

Both are inlined into the rendered HTML by `scripts/render.mjs` so the output is
fully self-contained and renders offline. Mermaid is ~2.5 MB; that weight is
intentional — it is the cost of diagrams that work with no network.

Re-vendor with:

```bash
curl -fsSL https://unpkg.com/panzoom@9.4.3/dist/panzoom.min.js -o panzoom.min.js
curl -fsSL https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.min.js -o mermaid.min.js
```

If you bump the Mermaid version, keep it in sync with the version note in
`templates/overview.html` and re-run the test suite.
