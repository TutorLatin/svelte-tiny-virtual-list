# Performance benchmarks

Run fixed-size list initialization, updates, lookups, visible-range queries, and retained heap checks:

```sh
npm run bench
```

The benchmark warms up each workload, reports median timings, and uses explicit garbage collection for
retained heap measurements. Options include `--rows`, `--queries`, `--rounds`, and `--output`.

To compare against the implementation before these optimizations, export its source to a temporary
directory. Keep the complete `src/lib` directory so relative imports resolve:

```sh
mkdir -p /tmp/virtual-list-baseline
git archive 388833e src/lib | tar -x -C /tmp/virtual-list-baseline
npm run bench -- --baseline /tmp/virtual-list-baseline/src/lib
npm run bench:scroll -- --baseline /tmp/virtual-list-baseline/src/lib
```

The scrolling benchmark requires a Playwright Chromium installation (`pnpm exec playwright install
chromium`). It builds production versions of both components and replays the same native scroll events
in one browser. It checks the final scroll position, rendered rows, and browser errors, and reports row
expression evaluations, bounding-rectangle reads, and browser scripting time. Temporary builds and the
local server are cleaned up automatically.

The two scroll scenarios exercise movement within a row and movement across row boundaries. Use
`--steps`, `--rounds`, and `--output` to change the sample size or save JSON results. Wall time includes
animation-frame pacing; scripting timings also include benchmark instrumentation. Compare operation
counts as well as timings, and treat very small CPU and heap measurements as subject to runtime noise.
