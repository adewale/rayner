# Native raster resource investigation

Investigation and minimal resource repair, 2026-11-21. Installed `@resvg/resvg-js` 2.6.2 publicly declares `renderAsync(svg, options): Promise<RenderedImage>`. The existing `rasterize` helper constructs a `Resvg` native tree and immediately calls `render` inside an async function.

A deterministic selection of 320 actual SVGs from `out/motion-all59-audit` used two timepoints per sorted baseline/variant folder. Both APIs received identical decoded SVG strings and `{font:{loadSystemFonts:false}}`. Across all 320 inputs, dimensions, every RGBA byte, and encoded PNG bytes matched exactly. The comparison preceded production edits; no forced GC or V8 flags were used.

The isolated memory workloads repeatedly rendered those same inputs sequentially, read the RGBA buffer, and released JS references. Each worker measured its own RSS/heap/external memory. A 1.5 GiB RSS safety ceiling stopped the synchronous worker proactively.

| Workload | Renders | RSS at 180 | RSS at 340 | RSS at 460 | Peak RSS | Final RSS | Elapsed |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `new Resvg(svg, opts).render()` | 460 (safety stop) | 669.7 MiB | 1174.3 MiB | 1552.3 MiB | at least 1552.3 MiB | 1552.3 MiB | 7.18 s |
| `await renderAsync(svg, opts)` | 1920 | 204.7 MiB | 251.9 MiB | 239.9 MiB | 306.8 MiB | 213.3 MiB | 15.88 s |

The async run materialized 2,764,800,000 RGBA bytes across six repetitions. Its RSS repeatedly fell and stayed below 307 MiB throughout. At the synchronous stop, JS heap usage was only 30.2 MiB and external memory 6.2 MiB while RSS exceeded 1.5 GiB. This supports native object lifetime/retention as the resource issue, rather than retained JavaScript scene data. It does not by itself distinguish delayed native finalizers from native trees' allocation accounting, or prove the separate SIGKILL's exact system-level cause. The parallel full suite/catalog load remains a separate aggregate-memory factor.

Applied after root authorization: keep the existing lazy import/error path and options, and return `resvg.renderAsync(svg, {font:{loadSystemFonts:false}})` from `rasterize`. Its existing Promise API already requires callers to await it. This uses the library's supported worker rendering lifecycle, preserves observed bytes, and avoids manual GC, custom pools or core rendering changes. `test/explain-raster.test.ts` retains a separate native pixel/PNG parity regression covering clipping, transparency, stroke and transform paint; all five raster/CLI tests pass.

Durable artifacts: `equality.json` contains all 320 input SVG and output pixel/PNG identities and exact parity; `equality-summary.json` records the first comparison; `memory-sync.json` and `memory-async.json` retain every RSS sample; `inputs.json` names and hashes the selected SVGs; `experiment.mjs` reruns each mode from the repository root. The SVGs themselves remain in the audit workspace and are not duplicated here. Timing is a workload observation, not a controlled throughput claim because the sync worker stopped early.
