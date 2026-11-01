# Judging an explainer

Use this to judge whether a reader-paced explainer teaches, not how polished its animation is. It asks for a judgement with evidence, not a score. Earlier editions scored six, then seven, dimensions from 0 to 4; those totals measured adherence to a list, and explainers that scored well could still fail to say what they taught. Totals from those editions, such as the /24 scores in the dated assessments preserved in [Git history at ce11e0a](https://github.com/adewale/rayner/tree/ce11e0ac611cc7b4babc24a573039ef96f179c3f/docs/evidence), are on a retired scale and are not comparable with anything here.

## The question

Read the explanation as a newcomer: the gallery title, every resting step and caption of the declared default case (from `settings[].default` in `describe.json`, not the first case listed), at least one other case where there is one, the ending, and the source and test trail. Use the page itself at 1280 × 800 and on a phone, from the first step and from fresh links to later steps.

Then answer, citing steps:

1. **Would a newcomer learn the answer?** Could they answer the scene's check questions (`meta.checks`) afterwards, and apply them to a new case? Questions a reader who knows the topic would answer anyway do not count.
2. **Is it better than the alternative?** A still, a short code diff, or a page the same author would write without Rayner. Say which and why. For changes to Rayner itself, the [benchmark](../bench/explainers/README.md) makes this comparison blind.
3. **What is the one change that would help most?**

## Fix first

These are failures, not shortcomings to weigh:

- **No answer.** The transcript (titles, lines and captions) does not state the answer to the title's question before it starts elaborating: before the mechanism, the cases or the taxonomy. `rayner check` fails a declared `meta.answer` that no step states and reports where it first appears; whether that is early enough is your judgement. Write the script first (the skill's [Script first](../skills/rayner-explainers/SKILL.md#script-first)) and rebuild. Clarity ratings do not show learning ([Muller 2008](https://thejournal.com/articles/2015/05/05/watching-videos-does-not-necessarily-lead-to-learning.aspx)).
- **Untrue.** A known false claim, a picture that misleads, a sentence that a setting makes false, or a claim beyond what the model and its sources support.
- **Broken.** A failing build or check, a step or case that restores wrongly from a fresh link, or a continuation a keyboard or screen-reader user cannot reach.

Mark each separately, repair and judge again. `rayner check` and `rayner review` give rendering and navigation evidence; they do not establish truth or learning. For a consequential claim, inspect the model's tests against its source, and commission domain review where an error would be costly.

## What to look at

These are where good and poor explainers differ in practice. They are prompts for the report, not a checklist to satisfy.

- **The reader's own work.** Does the reader commit to a prediction, choose a case that changes the outcome, or answer the check questions, or do they only read and press Next? Watching a clear sequence teaches less than doing.
- **Pictures that teach on their own.** Opened from a direct link with the caption hidden, does the resting picture say which step it is, what it shows and which values matter? Is the decisive before and after visible, rather than jumped?
- **Evidence and grounding.** Does every claimed value, path or comparison appear in the picture or an identified source, and trace to a model tested against the real thing, not a box labelled "verified"?
- **A case that could prove it wrong.** Is there a case or comparison that tests a plausible wrong generalisation, with the changed input and the result visible?
- **The reader's time.** Does the opening give a reason to continue? Does each step fit one screen, with its point in the caption's first lines? Does the phone show the whole picture or a fragment?
- **No answer before its question.** Does a prediction step already give away its answer in its words or picture?

## Reporting

Give the three answers, the fix-first findings, the assessed commit or export, and the limits of the review. When several explainers must be ordered, compare them in pairs, blind where possible, rather than adding up scores. If you try a prediction on an unfamiliar reader, record what they actually said.

## Choosing a hero

A clear niche lesson can be valuable without being a good front-door example. For a gallery hero, also write down the author's job (a reproducible failure, decision or surprising result, explained to a named audience), the Rayner leverage (what the coordinated model, code and picture reveal that a still or diff would not, with an independent check behind it), and the consequential other case (one changed condition that changes the outcome, with both results inspectable). None of this measures reader demand or shows that Rayner beats another tool; only the benchmark speaks to that.
