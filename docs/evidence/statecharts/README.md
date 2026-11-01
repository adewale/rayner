# Statecharts: decisions

Based on David Khourshid's [Statecharts in 2 minutes](https://x.com/DavidKPiano/status/2116523008323981315). The explainer shows the approved script in [`script.md`](../../../scenes/explainers/statecharts/script.md); each step names the script sentences it shows.

- **Script first.** Two earlier versions were built from a model and a rubric and never said what a statechart is: an independent rubric read scored one 19/24 (on the rubric's retired 0–4 scale) while the maintainer could not tell what it taught. The script answers the reader's three questions in four paragraphs, and the steps follow it in order. The definition is the first caption.
- **Two examples, one idea each.** The coffee machine shows a parent state (one POWER_OFF instead of four); the media player shows regions (and the boolean bug they remove).
- **Prediction prompts.** Steps 2, 4 and 5 ask the script's check questions in their lines; the next step answers each.
- **Native drawing from the model.** Every box and arrow is a model state or transition; parts keep their keys across steps, so the grid's own words move into the regions. XState 5.33.3 is run on every drawn chart (`tools/oracle/statecharts.ts`).
- **Limits.** The model covers compound and parallel states with event transitions only. No reader has been tested: a newcomer's answers to the check questions are the evidence still missing. No subject expert has reviewed the scene.
