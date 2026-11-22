# Diagnosis of the four frozen v2 finding misses

This is a diagnostic/calibration addendum to the frozen `5bff60e0aa5660c2b944fb59fbfe0b59e703db93` run. It does not alter any target, ratification, historical credit, or the frozen **16/20** result. No production or detector code was edited. The native pictures were re-inspected after opening the now-frozen structured findings. The16/20 figure remains a strict match count against that frozen registry; its interpretation as physical detection quality is limited by the two binding mistakes identified below, so it must not be described as four proven checker failures.

| Frozen target | Structured output | Classification and action |
|---|---|---|
| Inbound key / Sign-in | Complete worker, **zero total findings**, not merely zero fresh findings | (a) Native partial collision lies below the documented heuristic's spatial and temporal thresholds. Coverage limit; no sampling loss or new regression established. Use a separately authored clearance contract/keeper for protected text. |
| Refreshed key / API | Complete worker, **zero total findings** | (a) Native partial collision lies below spatial thresholds despite sufficient duration. Same general clearance need. |
| Current poll / example.com | Seven fresh **covers** findings: actor `poll`, victim `card`, text `example.com`, masks `[poll]` | (b) Same independently witnessed actor/victim/phase, but the declared algorithm-kind/path orientation was wrong. Recommend a separately versioned semantic relation binding; no retrospective gain. |
| Forged slip / literal Session | 39 fresh covers findings name **page:sid / Yx2b7Q**, never page:session / Session | (c) Relative to the exact frozen target, the warning diagnoses a different literal victim. The reviewer/registry misnamed the Session row's value as the literal Session label. Preserve the miss; a new SID observation needs its own native-backed version and ratification. |

## 1. Inbound key and Sign-in

Frozen target: `covers`, actor/path `agent:key:flight`, victim `lane:sign-in:name`, subject `Sign-in`, inbound `sign-in`, scenario `{"approve":"read-write"}`. The measured worker contains no findings at all, so baseline subtraction and target spelling do not explain the miss.

The dense native witness is `current-audit-2026-11-22/review-first-witnesses/poppy-key-lane-clearance.png`, especially frames37–38 (+1.233/+1.267s). Removing only `agent:key:flight` from the saved immutable SVG restores 17 and1 fully lost Sign-in glyph pixels respectively, plus7 and4 partially lost pixels. The baseline restores zero. Exposed Sign-in support is1091 pixels under the documented contribution test. An additional isolated intersection at frame30 restores43 pixels; this does not create a sustained word-wide obstruction.

There is **no temporal aliasing** in those samples. An isolated replay fed the actual `CheckedMotionSink`/`KeyedMotionSink.frame` at30fps, and every frame30–42 was sampled. Each corresponding input SVG hash exactly equals the retained native frame. Read-only Node inspector snapshots of the sink's actual private sample records were taken while the scene was awaiting its frame callback; the engine, sampler and thresholds were unchanged. The collision frames' traveller, label and four key-fill leaves all have opacity1. This is a filled brass key, not a stroke-only mask skipped by the fill rule.

On those exact sample records, recomputing the unchanged conservative filled-area predicate yields at most **2.65%** of visible glyph-box area in the inspected window, versus the documented **30%** cover threshold. At the S collision itself, frames37/38 yield **2.14% /0.71%**. The rule requires at least three qualifying samples (`round(0.1s/(1/30))`); the S contact has only two hit samples and never meets the spatial threshold. The independent occluded-words predicate finds **zero** glyph boxes nearly covered at90% by a single key leaf; it requires two. Silence is therefore consistent with the stated conservative heuristic, although a real short partial collision remains visible.

## 2. Refreshed key and API

Frozen target: `covers`, actor `agent:key:flight`, victim `lane:api:name`, subject `API`, `answer`, scenario `{}`. Again, the complete worker contains zero total findings.

The whole-stage/upper-stage witness is `current-audit-2026-11-22/refusals-key-over-lane-name/contacts/upper-stage.png`, +1.267s (frame38). Native knockouts find loss through frames36–41: fully lost pixels52,101,142,100,45,27 out of549 exposed API glyph pixels; partial losses are21,39,65,48,39,16. Baseline loss is zero throughout the same dense window. This is actual glyph contribution loss, not an overlapping-box claim.

Every frame30–46 reaches the actual detector sampler at30fps with an exact retained-SVG hash match. During all six hit frames the label and key fills are fully opaque. The duration is long enough for the0.1s heuristic; temporal aliasing and opacity do not explain the result. The exact-sample conservative coverage calculation peaks at **7.18%** (frame37), below30%, and the90%-covered-glyph count remains zero. The native ink percentage and the checker glyph-box lower bound have different denominators and must not be substituted for one another. The narrow blade/teeth and hollow bow partially interrupt letter strokes without filling large glyph-box regions. The checker uses the maximum contribution of an individual foreground leaf, rather than a native composite knockout of the whole key. This is a documented spatial-coverage limit, not evidence of an execution/schema failure or a newly introduced regression.

For both key cases, a principled follow-up is an explicit **actor/victim/phase text-clearance contract** for named context that must remain unobstructed during a flight. Check the actual composited glyph contribution against the traveller's knockout (including fills, strokes, holes, clips and paint order), with native positive/negative controls and genuine endpoint attachments. A partial-stroke crossing can then fail this authored contract while the generic30%/0.1s heuristic retains its conservative meaning. Do not globally lower thresholds just to catch these two examples: that needs separately calibrated near-miss, antialias, ring-hole, underlay, clip, handoff and endpoint controls.

## 3. Poll and the current domain

Frozen target `sign-in-poll-over-card@domain-2026-11-22.1` requested `kind:"occluded words"`, `path:"card"`, subjects `["example.com","poll"]`. The independent native victim choice was correct, but choosing that diagnostic representation before output was inaccurate.

Exact fresh observation0 (of7), retained in `frozen-observations.json`:

```json
{"scenario":"{\"flow\":\"device\"}","transition":"step \"ask\", play 1, event 2","kind":"covers","path":"poll","subjects":["example.com","card"],"victim":"card","masks":["poll"]}
```

Its detail says: `travels over “example.com” (part “card”), covering at least34% of its visible glyph boxes, for0.10s before it lands`, starting at0.733s. Other observations use admissible reader histories ending in collect. The native witness `review-first-witnesses/sign-in-poll-over-card-dense.png` shows exactly this outgoing poll across the bottom domain line. At frame22 (+0.733s), knockout restores433 of1359 domain glyph pixels; at frame24 it restores452. Baseline restores zero. Original **Example Company** remains a different, unconfirmed victim.

This is not a checker blind spot. `covers` reports the travelling actor as `path`; `occluded words` reports the victim as `path`. Their structure can describe the same physical relation. A future separately versioned observation should declare `actor=poll -> victim=card/text(example.com), outgoing collect` and normalize diagnostic orientation from explicit `victim` and `masks`. It must retain exact scenario, event/phase and literal text, and must not accept arbitrary card/poll warnings. No registry edits or gains are made here.

## 4. Forged slip and the Session row

The frozen target explicitly names `victim:"page:session"`, text `Session`, rather than the adjacent SID. The native witness `review-second-witness/browser-forge-across-stage--25-32-42.png` shows the literal **Session** word clear at frame32; the slip covers the right-hand **Yx2b7Q** value. The reviewer and registry ratification are too specific for what was actually seen and should be disclosed as a victim misattribution.

Exact fresh observation0 (39 total across the three sign-in scenarios;13 in signed-in), retained in `frozen-observations.json`:

```json
{"scenario":"{\"signin\":\"signed-in\"}","transition":"step \"forge\", play 3, event 1","kind":"covers","path":"forged","subjects":["Yx2b7Q","page:sid"],"victim":"page:sid","masks":["forged"]}
```

The detail reports at least72% visible glyph-box coverage for0.20s from1.067s. Native knockouts at frame32 restore **282** SID glyph pixels, rising to **624/799** at frame36; the baseline restores zero. Literal Session restores **zero** pixels at every inspected dense offset25,28,30,32,34,36,38,40,42,44 on either side. Across the complete85-frame inventory, the filled forged slip's authored bounds never intersect the Session label bounds (closest gap0.507 stage units), consistent with that native evidence. `picture.ts:249–250` also declares the literal label and value under separate `page:session`/`page:sid` keys.

Therefore the existing SID warning cannot satisfy the exact Session target. A separately versioned **SID obstruction** observation, with independent confirmation of the named value and key, is justified by the native evidence; it is a different literal victim and must never increase frozen16/20 or historical credit. Widening `page:session` to any browser content, or accepting any warning from `forged`, would conceal the error.

## Artifacts and follow-up boundary

`native-knockouts.json` records every input asset/hash, selection, frame and pixel count. `actual-sampler.json` records actual sampler calls, source-bundle equality, exact SVG equality, opacity, coverage predicates and thresholds for the two key cases. `frozen-observations.json` preserves the four frozen targets and all relevant structured outputs. Producers are `../v2-miss-native-knockouts.ts` and `../v2-key-sample-probe.ts`; all work is isolated under audit `out/`.

No real checker regression was established: two misses are conservative heuristic coverage limits, one is a kind/path binding mismatch, and one is a wrong literal victim. Recommended next work is a separately tested semantic actor/victim/event/phase contract and native text-clearance boundary, plus explicitly versioned calibration corrections. Keep the four frozen misses and their original observations intact.

Reproduce the bounded diagnostics from the retained frozen audit worktree with:

```sh
node --max-old-space-size=1024 out/v2-miss-native-knockouts.ts
node --max-old-space-size=1024 out/v2-key-sample-probe.ts
```

The two producers are approximately8KiB each. Native renders are asynchronous with one pixels getter read per result; the sampler probe performs read-only in-process inspector access without opening a network debugging port. Both producer processes use a1024MiB heap and run sequentially. They write only audit `out/` and temporary copied variants, which are removed afterward.
