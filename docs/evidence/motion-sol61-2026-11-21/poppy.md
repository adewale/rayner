# Poppy: three historical motion cases

Owned changes: `scenes/explainers/poppy/{picture,scene,fidelity}.ts`. No model, framework, frozen audit verdict or historical faulty replacement changed. Root must rebase one fixed-side corpus context as recorded below.

## Cause chains, fixes and prevention

- **poppy-ticket-over-lane-names**: the original name sat on the road and the full resting ticket became the travelling paper. The baseline already used above-line names and a 0.28 token, but native knockout found a remaining approach defect: the API-bound ticket suppressed one painted Website pixel while fanning upwards. Names now start after the furthest fan endpoint plus the actual authored ticket's travel half-width and a 0.08 clearance. A single `REQUEST_TOKEN_SCALE` supplies travel and that layout calculation. The resting tickets still dock/refuse at their original model-determined locations. The owned native invariant protects API, Website, Chat, Sign-in and the station name throughout all three traveller drawings, including approach and handoff. Independent visible-traveller overlap controls reject. The preserved historical on-line/full-size variant loses **1,330 Website ink pixels** in both approvals (`poppy-ticket.json`).
- **poppy-key-over-station-name**: centreline-only reasoning overlooks the key's ring and teeth. Both baseline legs retain their authored half-size representation and the sign-in lane route. New native four-paint knockout measures their actual SVG effect on all lane/station lettering rather than treating the hollow ring as a filled rectangle. Both legs pass for both approvals. Temporarily restoring the exact full-size historical travelling key on each real route rejects for actual lettering loss; a separate deliberate overlap with Sign-in also rejects and restores production geometry before playback resumes. This proves the filmed lane-contact clause, not a station-name contact that the frozen audit did not observe.
- **poppy-last-object-lingers**: event-scoped exhibits and closed-door context had been left as durable scene context until `rest`. `FRESH` already retires them. The declaration now protects the complete event exhibit (asked/mark/name/gloss), answer phrase/meaning, both closed-door subjects on discovery, and both key journeys. Station/counter identity must remain painted, and lane names must remain painted while requests move. This makes the lifetime distinction explicit for checker exploration and reader sends, not dependent on one incidental preceding exhibit. The **unchanged historical FRESH reversal** rejects native exhibit ink on all six story requests and both door subjects during discovery, in both approvals (`poppy-phase.json`).

## Owned evidence

`fidelity.ts` retains independent model/story assertions and adds native raster checks at 800px with the existing `routeInkCheck`. It streams frames, retains no raster buffers between calls and requires both protected word ink and distinct painted traveller positions. It covers the complete authored story and seven reader-last-event histories per approval: reissue, revocation, API/cart, Website, Chat, authenticated exchange and thief, each after independently selected prior context. Intended resting docking is preserved; neither model acceptance/refusals nor authored timings change.

Executed checks (all successful after final implementation):

- `node --test --test-name-pattern='^poppy: every' test/explain-fidelity.test.ts`: 1 scoped test, both approval settings, final run 36.3s.
- `node --test scenes/explainers/poppy/model.test.ts`: 21/21.
- `node out/sol61/poppy-phase-control.ts`: exact historical FRESH reversal, both settings; exhibit and closed-door native contract failures confirmed.
- `node out/sol61/poppy-ticket-control.ts`: preserved historical ticket faulty replacements, both settings; actual native text-loss failures confirmed.
- `git diff --check -- scenes/explainers/poppy`: clean.

No full suite, tsc, pack or whole corpus run was performed. Native owned evidence is Resvg scene SVG evidence, not an additional Chromium capture. The new reader checks exercise seven named reachable histories, not exhaustive every-state native replay; the scene motion declarations apply during core machine exploration. The frozen 37/59 score is not recomputed or guaranteed here.

## Root-owned corpus context

For `poppy-ticket-over-lane-names`, change only:

`find: 'const TOKEN = { scale: 0.28 };'`

to:

`find: 'const TOKEN = { scale: REQUEST_TOKEN_SCALE };'`

Keep the faulty replacement **exactly** `const TOKEN = { scale: 1 };`. All other Poppy reconstruction contexts remain unchanged.
