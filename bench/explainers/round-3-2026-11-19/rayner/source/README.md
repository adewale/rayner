# Benchmark statecharts explainer

`script.md` is the approved brief. Rayner adopts its title, answer, three questions and evidence grade into the scene's metadata; `scene.ts` explicitly fixes the benchmark ID. `answers.ts` computes the numerical check answers from the model. The scene uses public `rayner`, `rayner/explain` and `rayner/drawing` imports so this folder can be relocated intact.

`model.ts` is independent of XState. The recorded oracle uses XState 5.33.3 without importing the model. It explores five charts (flat coffee, hierarchical coffee, player, player inside on, coffee with frother). The intentionally incomplete power-off copy, three-to-five-feature count extension, and two transfer variants use internal tests. Counts refer to event transitions; start-dot arrows are not included. Boxes count named states, including a named parent; region/chart boundaries are not extra state boxes.

Run from the package workspace:

```sh
node scenes/explainers/bench-statecharts-round3/model.test.ts
CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run rayner -- review scenes/explainers/bench-statecharts-round3/scene.ts --out out/benchmark/review
npm run rayner -- build scenes/explainers/bench-statecharts-round3/scene.ts --out out/benchmark/scene.html
npm run rayner -- shots scenes/explainers/bench-statecharts-round3/scene.ts --out out/benchmark/contact
node tools/explain.ts describe scenes/explainers/bench-statecharts-round3/scene.ts --out out/benchmark/description.json
node scenes/explainers/bench-statecharts-round3/evidence.ts out/benchmark
```

To recapture the oracle, install `xstate@5.33.3` in a disposable directory and run `oracle/statecharts.ts` with `XSTATE_PACKAGE` pointing to that package directory. Otherwise it resolves `xstate` normally. `model.test.ts` uses the committed fixture, without XState installed. It checks the full graph, event handling, generated sequences, flattening equivalence, feature counts and transfer/reset answers. The separate evidence script validates all 17 described step states and scripted event sequences, and emits a transcript containing only visible title/line/caption prose.

The represented semantics omit guards, actions, history, finals and delays. Power cycles re-enter initial states. These cases do not need transition-priority conflicts; the intended convention is inner-first XState/SCXML behavior, rather than Statemate priorities. No external reader study was performed.
