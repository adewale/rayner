Scene: `scenes/explainers/bench-statecharts-round3/scene.ts`. Built page: `out/benchmark/scene.html`; reviewed identical-content page: `out/benchmark/review/scene.html`.

Steps:
1. The coffee machine has one active state — learn to follow event arrows.
2. Give the power button one destination — predict the copied-arrow count.
3. Four copies leave room for one mistake — a missing arrow strands brewing.
4. Put the shared rule on a parent — containment earns the definition.
5. Try the parent’s power button — drive the brewing machine.
6. A different problem: repeated combinations — inspect the flat player.
7. Split independent choices into regions — predict a third feature’s cost.
8. Flat combinations multiply; regions add — compare counts.
9. A statechart changes the drawing, not the behavior — drive both representations.
10. The two ideas fit inside each other — box the player inside on.
11. Your turn: add the milk frother — commit to placement and count.
12. A second region inside on — reveal nine configurations.
13. Change the condition: the frother gets its own power — reconsider the boundary.
14. Move it beside the whole machine — count ten configurations.
15. Change it again: the frother uses brewing steam — predict dependent names.
16. Two words do not always mean two regions — distinguish containment from independence.
17. Use the two signs, then test the boundary — drive the frother and power-cycle it.

Beyond Next, readers commit six predictions, drive three event-controlled machines, compare the flat and structured player after identical events, and answer three transfer questions with hidden answers. Event buttons explain refusals; power cycling the last machine demonstrates resetting both regions.

Strongest: the two separate motivating problems lead to usable diagnostic signs, and the player comparison makes equivalent behavior testable. Weakest: the transfer variants are explained with counts and state names rather than fully drawn charts; the diagram transition into regions replaces repeated labels rather than showing an explicit merge of all copies.

Rayner helped with typed model-driven views, predictive choices, reusable event controls, exhaustive reachable-state layout checks, and served phone/desktop verification. Its fixed landscape stage required careful label spacing and routing; separate command checks were necessary to catch a misplaced Dot constructor and visual crowding.

Validation: five model tests pass against recorded XState 5.33.3 graphs plus internal transfer/count tests. A deliberately broken brewing power-off rule fails three tests. All 17 described states and three scripted runs match model runs. Normal check and review pass: 34 step/width checks, 32 live-state/width checks, 17 framed phone steps, 16 framed live states, 12.5 px whole-phone minimum, no partial labels or console errors. Build, contact sheet and prose-only transcript are retained under `out/benchmark/`. No deployment or outside reader test was performed.
