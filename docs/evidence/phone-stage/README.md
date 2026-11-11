# Phone stage height

Review pictures for the change that sizes a phone stage to its scenario's close-ups (`narrowAspect` in `app/embed-closeup.ts`). Delete this folder once the change has landed; the commit that added it keeps it.

- `bloom-filter-390-before.png` and `bloom-filter-390-after.png`: `scenes/explainers/bloom-filter`, default scenario, first step, as a standalone page in a 390 × 844 viewport at 2× with reduced motion. Before is built at d5ab8bac (main); after is built with the change. No step of this scenario needs a close-up, so its stage goes from 358 × 332 px to 358 × 201 px and the picture is the same size in both.
- `poppy-390-stages.png`: the stage of each Poppy chapter at the step its catalog entry names, at the same viewport. These explainers are new, so there is no earlier picture to compare with.

To make the pair again, build the page at each revision and screenshot it:

```sh
npm run rayner -- build scenes/explainers/bloom-filter/scene.ts --out /tmp/bloom-filter.html
```

`test/browser/explain-narrow-stage.test.ts` holds the heights these pictures show. The pictures cover one scenario at one width; they do not show the explainers whose close-ups keep a taller stage.
