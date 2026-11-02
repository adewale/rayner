# Judging an explainer

Use this to judge whether a reader-paced explainer teaches, not how polished its animation is. It asks for a judgement with evidence, not a score. Earlier editions scored six, then seven, dimensions from 0 to 4; those totals measured adherence to a list, and explainers that scored well could still fail to say what they taught. Totals from those editions, such as the /24 scores in the dated assessments preserved in [Git history at ce11e0a](https://github.com/adewale/rayner/tree/ce11e0ac611cc7b4babc24a573039ef96f179c3f/docs/evidence), are on a retired scale and are not comparable with anything here.

The criteria come from the communities that make the best explainers. 3Blue1Brown's Summer of Math Exposition judged thousands of entries on motivation, clarity, novelty and memorability ([rules](https://some.3b1b.co/rules)), and Grant Sanderson's advice adds the craft behind them: concrete before abstract, names the reader has seen the need for, a story of a problem being solved, and the feeling of having invented the idea ([announcement](https://rosetta.to/u/3blue1brown/make-math-videos-summer-of-math-exposition-announcement), [SoME4 prizes](https://3blue1brown.substack.com/p/some4-prizes)). The skill's [Script first](../skills/rayner-explainers/SKILL.md#script-first) says how to write for them.

## How to read

Read the explanation as a newcomer: the gallery title, every resting step and caption of the declared default case (from `settings[].default` in `describe.json`, not the first case listed), at least one other case where there is one, the ending, and the source and test trail. Use the page itself at 1280 × 800 and on a phone, from the first step and from fresh links to later steps. Keep the guiding question in mind: how valuable is this compared with the typical explanation of the same thing a reader could find?

## The criteria

For each, say how well it is met (strong, adequate or weak) and cite the steps that show it.

- **Motivation.** Is it clear early why the topic matters and why someone should want the answer? A problem the reader feels, or a surprising result, before the machinery.
- **Concrete before abstract.** Does it start from a specific case and let the general idea emerge, or open on a definition, a taxonomy or an inventory of parts and fill it in later?
- **Earned names and discovery.** Does each term arrive after the reader has seen why it is needed? Could the reader nearly see each next idea before it is shown, or are ideas handed down?
- **Story.** Do the steps solve a problem, each following from the last, or list facts in a sensible order?
- **Clarity.** Is jargon explained when it arrives, is the goal easy to follow, and does each resting picture teach on its own (opened from a direct link with the caption hidden, it still says what it shows and which values matter)? Does each step fit one screen, with its point in the caption's first lines, on a phone too?
- **Novelty.** Does the presentation feel fresh: a better example, an angle the usual explanations miss, an obscure idea brought into the light? Or is it the standard treatment, redrawn?
- **Memorability.** Is there a moment that would stick months later, an aha or shift in perspective, and does the explainer build up to it? Does motion earn its place there?
- **The reader's own work.** Does the reader commit to a prediction, choose a case that changes the outcome, or answer the check questions (`meta.checks`) afterwards? Questions a reader who knows the topic would answer anyway do not count.
- **Grounding.** Does every claimed value, path or comparison trace to a model tested against the real thing, with a case that could prove a tempting generalisation wrong?

## Fix first

These are failures, not shortcomings to weigh:

- **No answer.** The explainer never makes clear what it is answering, or names the answer only after the details: the reader should know what the explainer is about within the first few steps. `rayner check` fails a declared `meta.answer` that no step states and reports where it first appears.
- **Untrue.** A known false claim, a picture that misleads, a sentence that a setting makes false, or a claim beyond what the model and its sources support.
- **Broken.** A failing build or check, a step or case that restores wrongly from a fresh link, or a continuation a keyboard or screen-reader user cannot reach.

`rayner check` and `rayner review` give rendering and navigation evidence; they do not establish truth or learning. For a consequential claim, inspect the model's tests against its source.

## Verdict

End with one of these, and the one change that would help most:

- **Good.** It meets most of the criteria strongly and has no fix-first failure.
- **Improve.** The subject and the model are worth it, and a rewrite of the script, a reordering of steps or a few pictures would make it good. Say whether that is easy (the existing pictures can be reused) or a rebuild.
- **Keep for coverage.** As a lesson it is weak or redundant, but it is the only scene exercising an engine feature, diagram family, language or check, so it stays in the collection as a test, out of the gallery.
- **Delete.** Weak as a lesson, and anything it covers is covered elsewhere.

When several explainers must be ordered, compare them in pairs, blind where possible, rather than adding up judgements.

## Choosing a hero

A clear niche lesson can be valuable without being a good front-door example. For a gallery hero, also write down the author's job (a reproducible failure, decision or surprising result, explained to a named audience), the Rayner leverage (what the coordinated model, code and picture reveal that a still or diff would not, with an independent check behind it), and the consequential other case (one changed condition that changes the outcome, with both results inspectable). None of this measures reader demand or shows that Rayner beats another tool; only the benchmark speaks to that.
