# Independent chapter construction review

Reviewed the working chapter repairs independently of their production assertions. This supplements [workflow.md](./workflow.md), whose construction matrix covers the full Rayner surface. Scope here is the actual Coverage/Conversations reader origins and the Browser, Refusals and Coverage route repairs. SignIn and Sessions were still being revised and are not judged here.

## Result

Every script-advertised action is reachable from an actual published reader origin. The three route repairs preserve all text checked in the independent native screen. The review found and supplied a real square-cap footprint counterexample, which the root repaired, and replaced an unnecessarily long Browser read route with a short, readable copy at a meaningful source port. Remaining helper limitations are conservative refusals and editorial choices, described below; this is not a general proof of every chapter frame.

## Published reader actions

[fixed-reader-actions.mjs](./fixed-reader-actions.mjs) obtains each offered step through `liveSteps`, obtains its actual `liveBase`, exhausts the durable graph independently, and admits every witness with `acceptedLog(machine, base.state, log)`. It does not substitute `machine.start` for an offered resting origin. All traversals completed below the independent 20,000-state cap.

| Chapter / offered step | Actual origin | Durable states | Accepted actions |
| --- | --- | ---: | --- |
| Coverage / `search`, both company settings | `rest` | 32 each | All six |
| Coverage / `skill`, both company settings | `rest` | 2 each | `close account` |
| Conversations / `read` | `rest` | 62 | All eight |
| Conversations / `close` | `rest` | 5 | `ask`, `you`, `read`, `close` |

Coverage witnesses include `read tasks → gift card → report → use alternative` and `read tasks → use skill`. Conversations witnesses include `person → joins` and `ask → read`; the remaining six actions each admit an immediate witness at `read`. Full per-action paths and never-accepted inventories are in [fixed-reader-actions.json](./fixed-reader-actions.json).

The script headers now correctly direct the complete exercise to Coverage's “The agent looks everywhere” and Conversations' “Replies are read, not returned”. Coverage's final step explicitly asks for the account-close exercise. The final Conversations offer intentionally has less reach; root accepted a follow-up pointer from its close caption to the earlier complete exercise. This review does not claim all eight actions can succeed from the close root.

## Native route evidence and Browser improvement

[fixed-chapter-native.mjs](./fixed-chapter-native.mjs) screens every coexisting `Text` occurrence against the named traveller, rather than checking only the route planner's protected list. For nearby pairs it renders the complete scene, victim removed, traveller removed and both removed at 800 px, using native Resvg. A victim pixel has an exposed RGB contribution above 16; loss means its composited contribution falls to at most 15% of that exposed contribution. Box pruning includes a 0.15-unit margin. These are sampled-frame and resolution-specific measurements, not a continuous-time theorem or a test of every nontext object.

| Final geometry checked | Authored + actual-reader visits | Distinct text/traveller rows | Damaged rows / maximum lost pixels |
| --- | ---: | ---: | --- |
| Browser `read`, all three sign-in settings | 6 | 51 | 0 / 0 |
| Refusals `document` | 2 | 35 | 0 / 0 |
| Coverage `report:sent` and `report:reply`, both companies | 4 | 80 | 0 / 0 |

Reader logs were Browser `load → authorize` at `phish` from `start`, Refusals `old-copy → answer` at `pace` from `rest`, and Coverage `read tasks → gift card → report` at `search` from `rest`. Each was checked by `acceptedLog` before replay. Receipts: [Browser final](./fixed-final-native/browser.json), [Refusals](./fixed-native/refusals.json), [Coverage](./fixed-native/coverage.json). The native scripts completed all 12 rows without captured errors. Repeated trips in one authored step are separate trips: their concatenated center samples must not be interpreted as one continuous route.

The first Browser repair kept the code inside a pocket between the host, page code and agent name. All three labels were legitimate obstacles, but their expanded boxes forced a 17.432600-unit detour in a 0.75-second movement. Its generic motion check was clean, illustrating that collision freedom alone does not establish good motion. Removing a needed label shortened that route but would abandon the requirement.

With root authorization, changed only Browser `picture.ts` and the read's source selection in `scene.ts`: `readingPort` places the full-size copy beside the browser, left of the host and above the agent name, using measured text and carrier bounds. The copy retains its literal code at size 0.56; the original page code remains. The dotted connection ends at the same source port and follows the external part of the read corridor to the station boundary.

The resulting port is approximately `[-4.8, 2.093789]`, with the seal at `[-6.3, 2.735]`. Its exact route is 2.141211 units, equal to endpoint Manhattan distance, an 87.7% reduction from the intermediate repair. Omitting any of the three protected labels no longer shortens it. The code slip remains approximately 1.904 × 0.95 units. See [exact final route](./fixed-final-browser-route.json), [retained intermediate route](./fixed-browser-route.json), [retained intermediate native receipt](./fixed-browser-long-route-native.json), and [native source-port frame](./fixed-browser-port.png).

Refusals reserves the document against the station and the currently present API/MCP labels; its detour crosses above the lane lettering before entering the station. Coverage reserves both small wordless carriers against stable lettering while removing the prior search readout before the reply. The sampled paths show no Browser-style loop or return excursion in those two repairs. Their shared planner minimizes rectilinear distance under the supplied conservative footprints; no separate aesthetic or minimum-bend guarantee is claimed.

## Route-helper attacks and limits

The initial helper padded square-capped diagonal strokes by only half their width when the join was round. A 0.2-unit diagonal with a 1-unit square-capped stroke routed past a 0.4 × 0.4 protected blue square still hid 66 of its 400 native blue pixels. The old receipt and image remain under `fixed-route-adversarial` / `fixed-route-square-cap`. Root added the square-cap diagonal bound and default stroke-opacity handling, plus a native keeper.

The same independently retained control now loses **0 of 400** protected pixels; its safe bend moves from 0.86 to approximately 1.067107 units. Nonfinite ports and frames now refuse explicitly; previously an infinite frame was accepted. See [before](./fixed-route-adversarial.json), [after](./fixed-final-route-adversarial.json), and [reproduction](./fixed-final-route-adversarial.mjs). Six small explicit/omitted miter-limit controls also showed no native overlap in the tested triangle; that is a control, not an exhaustive SVG-style proof.

The helper is a shortest-path search over an orthogonal visibility grid of expanded axis-aligned boxes. It reserves the whole translated carrier, including conservative stroke bounds, against each declared subject, and leaves 0.06 units of clearance. Endpoints are checked rather than silently relocated. This is a useful local construction boundary for the current static lettering and translated carriers.

Limits and simple tradeoffs:

- Clipped-away and invisible subjects still obstruct the search. A fully clipped wall demonstrably refuses a visually clear route. This is safe overreservation; chapters must select meaningful stable subjects. Incorporating effective clip/alpha would add complexity and is unnecessary for the current selected labels.
- An omitted line join is treated as miter/4 here while the renderer defaults to round. This overreserves the stroke; it is not an underbound. Browser's final shortest route is unaffected.
- The grid minimizes distance, not bends, acceleration, diagonal travel, semantic proximity or pacing. A chapter still owns its ports and duration. The Browser detour is the concrete reason that responsibility cannot be delegated to the router.
- Identical ports return a one-point path. The downstream travel helper rejects a non-route; callers should request a transition only when they intend travel.
- Bounds are for a fixed translated footprint. Rotation, resizing during travel, moving obstacles, arbitrary clips and font/raster effects require additional ownership or native checks.
- Cost grows with the visibility grid: roughly quadratic candidate points in the number of obstacle coordinates, with array-queue insertion. The present few-label chapter routes are a reasonable use; this is not a general high-density router.

## Verification and provenance

The Browser owner passed **3/3, zero skips**, after the source-port change:

```sh
NODE_OPTIONS=--max-old-space-size=2048 node --test --test-concurrency=1 scenes/explainers/poppy-browser/scene.test.ts
```

Output is [fixed-browser-owner.log](./fixed-browser-owner.log). The independent action-graph, all-text native, exact-route, square-cap and source-port capture scripts are retained beside this report. Native/Node checks used bounded heaps and escalated execution as requested. No all-59 corpus, full suite, package smoke or concurrent type check was run during this independent review.

Root's earlier `route-refusals-final` run passed the three helper tests and the first Refusals test, then failed at file level. Root confirmed native-memory exhaustion. The runtime agent subsequently changed the route-ink helper to awaited native rendering and reported the complete Refusals owner passing **2/2**, with 5,418 renders, peak one in flight and maximum RSS 406 MiB. That is the runtime owner's result, not a relabeling of the failed earlier run. The two independent Refusals native visits above also completed cleanly.

All new evidence uses `fixed-*`; the original `bad4209` review evidence was preserved. Production edits are now frozen on this agent's side. Root owns final integrated measurements, the close-caption pointer, and source/fixture inventory rebasing. The earlier workflow implementation and its 70 Node plus two Chromium regressions remain documented separately in [workflow.md](./workflow.md).
