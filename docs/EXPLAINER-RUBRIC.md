# Judging an explainer

Use this to judge whether a reader-paced explainer teaches, not how polished its animation is. It asks for a judgement with evidence rather than a score. Scores from earlier editions, such as the /24 totals in the assessments kept in [Git history at ce11e0a](https://github.com/adewale/rayner/tree/ce11e0ac611cc7b4babc24a573039ef96f179c3f/docs/evidence), measured adherence to a list and are not comparable with anything here.

The criteria are 3Blue1Brown's Summer of Math Exposition's, with Grant Sanderson's advice on the craft behind them; the skill's [Script first](../skills/rayner-explainers/SKILL.md#script-first) cites them and says how to write for them.

## How to read

Read `script.md` first: it states the explainer's intent. Note the question, the reader, the answer, the changed condition, the reader's own work, what the model is checked against and what it leaves out. Then identify, in the scene, the observation being explained, the rule or mechanism that accounts for it, and the changed condition whose result the reader could now predict, and point to the steps that connect those three. A numbered sequence and a correct answer are insufficient if the causal bridge is missing. Distinguish a rule being explained from an input the lesson assumes, and ask whether the reader has been told which is which. Judge the scene against the intent: an explainer that teaches well but not what its script says it is for has a script to fix, or a scene.

Then read the explanation as a newcomer: the gallery title, every resting step and caption of the declared default scenario (from `settings[].default` in `describe.json`, not the first scenario listed), at least one other scenario where there is one, the ending, and the source and test trail. Use the page itself at 1280 × 800 and on a phone, from the first step and from fresh links to later steps. Check that the page supports the script's reasoning: each new inference has visible evidence, a useful comparison or an explicit premise. Keep the guiding question in mind: how valuable is this compared with the typical explanation of the same thing a reader could find?

## Working documents

Keep each fact where it can be maintained:

| Where | What belongs there |
| --- | --- |
| `script.md` | The intent, for the author: the intent header (question, reader, answer, changed condition, reader's own work, what the model is checked against, what it leaves out, check questions with their answers), then the author's own reasons. Rayner reads the header; it is the one home of the title, answer, check questions and what the model is checked against. Not the explanation, no implementation directions, revision history or verification report. |
| `model.ts` | The system's constraints: what it allows, what each action does, why it refuses one, and the limits of the model beside the constraints they qualify. |
| `scene.ts` steps, and `picture.ts` | How the system is explained: the published titles, lines and captions, scenarios, which states and events each step shows, and the live step; the picture module says how one state looks. Read or describe the scene to inspect them; do not keep a step inventory in Markdown. |
| Tests and review receipts | Evidence for the model's correctness against what it is checked against, picture fidelity and served behaviour. They do not establish reader comprehension. |

Each fact has one home, so nothing has to be kept in step by hand: the scene's words are the explanation, the script's header is the intent the scene is held to, and the model's limits sit beside its constraints. An explainer has no `notes.md`; what one held belongs in the script's reasons, the model or the picture module. Source links belong in `meta.sources`. Revision history belongs in Git.

Use the script's check questions to challenge the scene: can its reasoning answer a changed condition, or does it only reveal the quiz answer? This can expose a weak explanation before reader testing, but only a newcomer study measures what readers understand.

## The criteria

For each, say how well it is met (strong, adequate or weak) and cite the steps that show it.

- **Motivation.** Is it clear early why the topic matters and why someone should want the answer? A problem the reader feels, or a surprising result, before the machinery.
- **Concrete before abstract.** Does it start from a specific case and let the general idea emerge, or open on a definition, a taxonomy or an inventory of parts and fill it in later?
- **Earned names and discovery.** Does each term arrive after the reader has seen why it is needed? Could the reader nearly see each next idea before it is shown, or are ideas handed down?
- **Story.** Do the steps solve a problem, each following from the last, or list facts in a sensible order? Does it end on the practical boundary or the strongest comparison, rather than on a list of what the model leaves out or a second topic? Those belong in notes or a detail step.
- **Economy.** Could any step be removed without losing an inference? The common cases are an opening that states the answer followed by a walkthrough that derives it again, and two steps that make the same point with different numbers.
- **Clarity.** Is jargon explained when it arrives, is the goal easy to follow, and does each resting picture teach on its own (opened from a direct link with the caption hidden, it still says what it shows and which values matter)? Does each step fit one screen, with its point in the caption's first sentence, on a phone too? A caption over about 80 words rarely does; move history and side facts to notes or a detail step.
- **Novelty.** Does the presentation feel fresh: a better example, an angle the usual explanations miss, an obscure idea brought into the light? Or is it the standard treatment, redrawn?
- **Memorability.** Is there a moment that would stick months later, an aha or shift in perspective, and does the explainer build up to it? Does motion earn its place there?
- **The reader's own work.** Does the reader commit to a prediction, choose a scenario that changes the outcome, or answer the check questions (`meta.checks`) afterwards? Does every setting change the conclusion? A setting whose other option only changes the numbers doubles the scenarios and teaches nothing. Where a check question is about events (press this, then that), can the reader answer it on the page with a live machine? Ask for reasoning or transfer, not recall of arbitrary details. An expert answering without the lesson does not invalidate a question; evaluate what newcomers learn.
- **Grounding.** Does every claimed value, path or comparison trace to a model tested against the real thing, with a scenario that could prove a tempting generalisation wrong? Is every sentence that reaches beyond the scenarios shown ("every", "never", "only") backed by a test or narrowed, does the script say what the model leaves out, and does a claim resting only on the explainer's own model say so? `rayner check` lists the sweeping sentences nothing backs and the code names reaching the reader's words.

## Fix first

These are failures, not shortcomings to weigh:

- **No answer.** The explainer never makes clear what it is answering, or names the answer only after the details: the reader should know what the explainer is about within the first third of the steps. `rayner check` fails a declared `meta.answer` that no step states and reports where it first appears.
- **Untrue.** A known false claim, a picture that misleads, a sentence that a setting makes false, or a claim beyond what the model and its sources support.
- **Broken.** A failing build or check, a step or scenario that restores wrongly from a fresh link, or a continuation a keyboard or screen-reader user cannot reach.

`rayner check` and `rayner review` give rendering and navigation evidence; they do not establish truth or learning. For a consequential claim, inspect the model's tests against its source.

## Verdict

End with one of these, and the one change that would help most:

- **Good.** It meets most of the criteria strongly and has no fix-first failure.
- **Improve.** The subject and the model are worth it, and a rewrite of the script, a reordering of steps or a few pictures would make it good. Say whether that is easy (the existing pictures can be reused) or a rebuild.
- **Keep for coverage.** As a lesson it is weak or redundant, but it is the only scene exercising an engine feature, diagram family, language or check, so it stays in the collection as a test, out of the gallery.
- **Delete.** Weak as a lesson, and anything it covers is covered elsewhere.

For an explainer about Rayner itself (its checks, its player, its lettering), the reader is someone writing explainers: judge motivation and novelty for that reader, or keep it for coverage.

When several explainers must be ordered, compare them in pairs, blind where possible, rather than adding up judgements.

## Choosing a hero

A clear niche lesson can be valuable without being a good front-door example. For a gallery hero, also write down the author's job (a reproducible failure, decision or surprising result, explained to a named audience), what Rayner adds (what the coordinated model, code and picture show that a still or diff would not, with an independent check behind it), and the other scenario that matters (one changed condition that changes the outcome, with both results inspectable). These are editorial reasons to select a lesson. The benchmark records reviewers' preferences between the pages it tested; it does not measure reader demand or newcomer learning.

The showcase tier selects subject examples to study, not a measured learning outcome. Prefer a small set of complementary mechanisms and consequential alternative scenarios over broad engine coverage. Keep authoring recipes in their own collection; a toolchain lesson joins the showcase only when it stands on its own as a lesson, as lantern's still-versus-playback comparison does. The catalog is the source of truth for the current selection. A lesson’s benchmark status must remain explicit; selection alone does not demonstrate that it beats another tool.
