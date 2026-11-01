# Explainer editorial rubric

Use this to assess a reader-paced *lesson*, not its animation polish, topic popularity or suitability as a product hero. Read the gallery title, the declared default case, every resting step and caption, at least one countercase where available, the ending, and the source/test trail. Resolve the default from `settings[].default` in `describe.json`, **not** from the first case in the array. Inspect the pictures and the pivotal before → operation → after bridge; motion earns nothing merely by existing. For a one-case scene, assess an internal contrast or an explicit limit rather than deducting points for having no setting.

Score six dimensions from 0 to 4 (24 total). Apply the same anchors to each: **0** missing/contradicted; **1** asserted but not demonstrated; **2** partly shown, with a substantial inference left to the reader; **3** shown with a small gap or avoidable detour; **4** directly earned and easy to inspect. Record a specific reason for any score below 4. Equal-weight totals are a *triage order*, not calibrated measurements of comprehension; equal totals tie. Do not break ties by subjective decimal points.

| Dimension | What earns 4 |
| --- | --- |
| **Q — Question and promise** | The opening gives a specific puzzle or decision, and the declared default case answers the gallery title. A topic label or a puzzle delayed behind a tool inventory is not enough. |
| **P — Progression and payoff** | Each step answers a needed question; the decisive before → operation → after correspondence is shown rather than jumped; the ending resolves the opening. A smooth morph without a causal bridge does not qualify. |
| **V — Visible evidence** | Resting pictures retain the decisive values, paths and comparisons; a stable label, reference or identity lets the reader follow the same thing across representations. The evidence can be inspected at phone width and on direct entry to its step, without replaying motion or remembering another view. |
| **B — Boundaries and countercases** | A materially different case or internal comparison tests a plausible wrong generalization; the changed input, fixed assumptions and resulting difference or invariant are visible. Conditional prose keeps the conclusion true for its scope. One-case scenes can score 4. |
| **G — Grounding and calibration** | The top claim traces to an appropriate source, version, observed run or independently checked model, with an actual result or an identified comparison—not merely a box labelled “verified.” Distinguish a model from its external oracle, a reproducibility check from factual truth, and approximation from exactness. |
| **E — Reader economy** | The opening gives the reader a reason to continue before a long detour; terms arrive when needed, labels sit by their referents and prose interprets rather than duplicates the image. A still can earn 4 when motion adds nothing. This is not a reward for fewer steps. |

**Before scoring:** a failing build, incorrect case or step restoration, known false claim, inaccessible continuation, or materially misleading picture is a fix-first issue, not a small score deduction. Mark it separately, repair and regrade. For a pivotal claim, record its case, step, pictured witness and source/test. Inspect both forward arrival and a fresh direct link at phone width; an automatically advanced screenshot is not evidence of a resting picture until its caption and state are checked. The 0–4 scores cannot certify factual truth: inspect source and model tests for the top claim, and commission domain review where the cost of error merits it. `rayner check` and `rayner review` provide rendering/navigation evidence, not independent fact-checking or comprehension testing.

**How to report:** give Q/P/V/B/G/E, total, one observable strength or improvement, the assessed commit/export, and the limits of the review. Sort by total descending, ties together (alphabetical display within a tie is only for finding rows). Regrade after substantive changes; do not compare totals from different editions as if they were controlled reader-study results. As an *unscored* diagnostic, show the countercase's input before its answer and ask an unfamiliar reader to predict the outcome and why; record their actual answer, not a presumed retention or comprehension score. See the dated [29-scene assessment](https://github.com/adewale/rayner/blob/ce11e0ac611cc7b4babc24a573039ef96f179c3f/docs/evidence/explainer-stack-rank-2026-10-30.md).

**Checks from the player redesign** (unscored, but cite them in V and E):

- *Crop test* (V). Open each step from a direct link at phone width and cover the caption. The resting picture should still say which step it is, what it is about and which values matter. A picture that needs its caption to be read at all loses V.
- *Step length* (E). Captions use their natural height. Keep the reasoning needed to connect the visible evidence to its consequence; cut repetition and split a step when it introduces a new idea or decision.
- *Roles* (E). The title states what the picture proves, the line says what to notice, the caption gives the reasoning. A line that reads as a second caption, or a caption that repeats the title, is duplication.
- *Layout* (V, E). The step's change is the strongest mark; a mark means the same thing in every step; regions share edges; labels sit by their referents.

## Choose a hero separately

A clear niche lesson can be valuable without being a good front-door example. For a gallery hero, write down the prospective **author's job**, a reproducible reader puzzle, the **Rayner leverage** (what coordinated model, code, state and picture reveal that a still or code diff would not), a **consequential counterfactual**, the source/test trail, and the claim's limit. Score these editorial prompts **J/R/C, 0–4 each**, alongside—not added to—the lesson score:

| Hero prompt | 0 | 2 | 4 |
| --- | --- | --- | --- |
| **J — Author job** | No identifiable task or observed puzzle. | A task is named but its example result or intended reader is vague. | A particular author can explain a reproducible failure, decision or surprising result to a named audience. |
| **R — Rayner leverage** | A generic animation or API inventory. | One tool feature appears, but code, model and picture need not agree. | A model-driven change visibly coordinates the relevant code, state, picture and caption; an independent check or bounded source supports the example. |
| **C — Counterfactual value** | Another input merely recolours the picture. | An alternate input changes a number but not the inference. | One changed condition changes the outcome or exposes an invariant, and a reader can inspect both results and their limit. |

These are **selection prompts**, not measured demand or evidence that Rayner is better than another tool. Do not punish a lesson for needing only a still or one case. Reassess hero fit independently of the historical /24 ranks; see the [portfolio review](https://github.com/adewale/rayner/blob/ce11e0ac611cc7b4babc24a573039ef96f179c3f/docs/evidence/explainer-portfolio-review-2026-10-30.md).
