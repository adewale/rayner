# Motion repairs from the 59-case causal review

Two independent Astra 6.2 Max reviews preceded implementation. The [visual audit](../motion-all59-2026-11-21/audit.md) covers all 59 IDs, 59 paired 30 fps videos, 59 native Chromium comparisons and 23 supplemental routes. Its frozen verdicts are 37 confirmed intended effects, seven editorial judgments, six secondary effects, five blocked before the claimed effect paints, three unreproduced and one inconclusive comparison. These are observations at `1522b504`, not verdicts silently refreshed to fit the new implementation.

The second review's [59-row root-cause matrix](../motion-all59-2026-11-21/root-causes.md) groups the historical repairs by mechanism. Every row distinguishes historical intent, what the reconstruction now does, its existing rejection and a principled prevention or check.

| Shared cause | Implemented response |
| --- | --- |
| Routes ignore full travelling footprints and occupied lettering | Derive password, poll, key and list corridors from actual drawing extents. Eight complete native trajectories now preserve the protected lettering. [Pinned Chromium comparisons and full-event native measurements](clearance/README.md). |
| Context lifetimes and causal order are implicit | Optional `MachineSpec.motion` declares exact view-scoped subjects present or absent during a named travel's actual movement beat. `rayner check` observes the authored run and reachable reader events independently of the transition builder. Poppy, Sessions, Browser and Conversations declare their relationships. |
| Unique objects are animated as copies | `carry` retires the source with departure and optionally hands off to a different destination. Borrowed sources can return on a later authored beat. Ordinary information copies continue to use `pass`. Browser submission and Poppy sign-out use the helper. |
| Identity matching implicitly transports layout or incompatible text | Preserve the existing correct replacements. Discovery's scene-owned invariant requires the URL's host and path to appear together and remain joined throughout redirects. The historical path mutation fails it. Whole-word defaults remain; the historical glyph mutation remains a documented no-op. |
| Independent beat sums and editorial pace | Retain the strict event-duration guard. Coverage's authored report check requires its approved two journeys, in order; the historical extra leg fails in both settings. No new universal pacing threshold. |
| Miniaturized travel representations carry unreadable words | Retain the existing small-words gate and readable/wordless representations. The visual audit independently checks all three tiny-word mutations at a real 358-pixel viewport. |

The shared inspection fixes also preserve logical keyed ownership when a matched transform temporarily omits point-free containers, retain those containers' actual paint clips on admitted children, and keep independent occlusion victims distinct. No public keys are fabricated and the render tree is not reparented for inspection. Occlusion deduplication now uses the victim, mask and interval, and the generic ancestor folding no longer discards distinct nested text victims.

## Adversarial verification

The first Max reviewer returned after implementation and found two additional real bugs: nested occlusion warnings suppressed one another, and admitted matching frames dropped omitted ancestor clips. Both are repaired and have native regressions that fail when the old behavior is restored. [Independent controls and poisoned-failure excerpts](controls/README.md).

The clip test compares playback and reverse-order seeks with a separately authored explicit intersection of parent and child clips. It includes keyed and unkeyed omitted containers, drawable backing paths, new text frames, disjoint clips and zero-area clips. The occlusion tests distinguish independent masks, nested and sibling owners, repeated words and a clipped mask that leaves its word visible.

The authored-event tests cover a wordless source surviving its transfer, early arrival, missing context, clipped-away context, typoed and ambiguous subjects, missing or invisible travel, concurrent and repeated travel keys, two views, legal information copies, borrowed-object restoration, reader sends and identical seeks. Each trip needs two distinct positions where removing its actual travelling drawing changes the final composited pixels. This rejects a wordless carrier entirely hidden by another view and a genuinely single-position flash. Required context is checked throughout the movement, including offstage portions. Subject presence itself checks isolated ink, alpha and actual camera/descendant clips; full composited subject readability belongs to the separate occlusion and native clearance checks.

The independent reviewer reran the same twelve adversarial scenes and recorded 579 identical native frame observations before and after the fixes. It corrected an initial aperture classification after counting antialiased pixels, then independently confirmed that a narrower, truly single-position aperture passed the original checker and rejects on the repaired one. The source-survival poison also establishes visible source ink before departure, visible transit and visible receipt, so a missing or clipped source cannot satisfy that test vacuously.

Additional independent deliberate-defect records: [lost diagnostic ownership](controls/ownership-poison.log), [tutorial label in the flight corridor](controls/tutorial-poison.json), [detached URL path](controls/url-poison.json), and [extra report journey](controls/report-legs-poison.json).

## Measurement boundaries

The historical 59 IDs and faulty behaviors are retained. Six mutation contexts were mechanically rebased around the baseline route repairs. The sliding-lane reconstruction also renames the new clearance lookup so it can still paint its intended layout change; the initial unrelated lookup exception is not credited as a detection. Three previously direct hunk reversals are now explicitly marked adapted, so the current edit inventory has 38 adapted entries and 21 reversals; the frozen visual audit's 35/24 inventory remains unchanged. New diagnostic and clipping poisons are outside the 59.

The installed-package test found a Node-only native helper in the portable scene-source set. It now lives in the existing fidelity-support convention, and Discovery's public scene test owns its URL assertion directly. The same eighteen affected assertions passed after that test-support correction, as did the complete installed-package smoke test, including every authored scene, scene test and recipe against the packed declarations. The measured scene and detector runtime bytes are unchanged by this correction. Completed measurements are retained by runtime identity and per-case mutation identity; the one changed reconstruction is rerun independently.

Raw baseline-subtracted rejection, guard-only refusal, an attributed historical diagnosis, a secondary effect and a visually valid reconstruction remain separate claims. The three unreproduced entries are not repaired by inventing a new historical case. The seven editorial entries do not acquire an automatic quality verdict from a displacement or time threshold.

Fresh full-corpus and catalog measurements are recorded separately after the source is frozen. A failed or interrupted measurement is not a result.
