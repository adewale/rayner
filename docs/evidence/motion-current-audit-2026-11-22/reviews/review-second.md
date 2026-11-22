# Independent current reconstruction review — indices 30–58

Frozen source: `5bff60e0aa5660c2b944fb59fbfe0b59e703db93`. All 29 assigned IDs receive a disposition. Primary inventory remains all 59 IDs; no frozen old verdict/evidence, production source, corpus, scorer or primary capture was edited by this reviewer.

**21 confirmed intended clauses; 2 secondary-only effects; 3 blocked before paint; 2 unreproduced mutations; 1 pacing judgment.** Confirmation is clause-specific, not blanket validation of compound historical descriptions.

## Independence and evidence scope

Read `test/AGENTS.md`, current corpus claims and implementation, and historical hunks in `0a887ad4`, `f3a705cf`, `d99c9195`, `cb20195a`, `58b06e8e`, `bf773626`, `ffc39ca0`, `3038108f`, `46cdb7e6`. No old visual verdicts, detector output or another reviewer’s conclusions were read before recording these verdicts. Current source comments already contain reconstruction assessments; these are a potential bias and were not treated as proof.

Inspected actual retained PNGs with `view_image`: full-scene sample contacts and readable native crops. Every crop is a selection from captured pixels; associated JSON identifies side, sequence, local frame, absolute frame, step, exact asset and crop. Tiny-word witnesses also show a clearly labelled 390-pixel scene-width equivalent. This is not an actual phone-browser capture.

Capture is native 800×450 at 30 fps with authored timing and caption holds preserved. Contact rows are matched native offsets, not normalized progress. Blank cells explicitly mean no native frame, including step-local zero when the origin still belongs to the previous step. A typed refusal has one pre-event picture; it is never filmed defect motion.

Full ledger integrity covers **7984 primary records in 58 receipts, 4707 unique per-side assets**. Every SVG content hash, decoded RGBA pixel hash, PNG dimensions and ledger sequence was checked successfully: [integrity ledger](/workspace/rayner-audit/out/current-audit-2026-11-22/review-second-witness/full-ledger-integrity.json). This is separate from visual coverage: I did not view every frame. Exact visual contact offsets, settings, history, native clock origins and full ledger counts are recorded per ID in [machine-readable review](/workspace/rayner-audit/out/current-audit-2026-11-22/review-second.json).

Published reader origins are retained rather than silently forced to historical start. Message-lingers uses an admissible actual published start route. Legend supplements requesting `load,load` and `load,authorize,submit,load` are both inadmissible; their pre-event pictures were inspected but refused as motion evidence. Historical-start admission records remain separately declared.

## Remaining production concerns and unavoidable judgment

The strongest baseline concern is **conversations-words-dissolve**: current baseline and variant both visibly shrink individually spaced glyphs into rows of dots at owner ~0.3–0.4 s and close ~0.2–0.3 s. The mutation has no differential effect over all 1,711 native frames. This is a current baseline visual symptom, not validation of the historical reconstruction and not an engine-cause diagnosis. [owner native closeups](/workspace/rayner-audit/out/current-audit-2026-11-22/review-second-witness/conversations-words-dissolve--0-6-9-12-15-18.png); [close native closeups](/workspace/rayner-audit/out/current-audit-2026-11-22/review-second-witness/conversations-words-dissolve--799-805-808-811-814-817.png).

The coverage report’s final whole-card crossfade briefly mixes “Use my gift card” with “Pay with a gift card” at 2.5–2.6 s, clearing by 2.7 s in a 2.75 s event. This transient mixed lettering merits editorial review; no durable false value or cause-order failure is established. [settle closeups](/workspace/rayner-audit/out/current-audit-2026-11-22/review-second-witness/coverage-report-too-long--72-75-78-81.png).

Whether a three-leg 4.0 s report is “too long” remains pacing judgment even though its extra leg and duration are proven. The tiny-word cases demonstrate substantially smaller travelling code at phone-equivalent scene width; a universal human-reading threshold is not claimed. Other inspected baselines did not show an independently confirmed production regression.

## Per-ID independent dispositions

### 30. `browser-read-across-page` — confirmed intended clause

**Claim coverage:** Window-content crossing confirmed; selected authorize route only.

Variant slip starts beside and partly over the page stub at native13, then climbs diagonally through the browser header at20..26. Baseline slip travels above/left of that window. Visible code/paper, not just boxes, crosses the window content.

Scope: `{"step": "authorize", "event": "authorize"}`; baseline: complete, 106 frames, absolute 1688–1793, 3.5 s; variant: complete, 106 frames, absolute 1688–1793, 3.5 s. Settings/history are in the linked receipts and JSON review.

Full-scene sampled native offsets: load:0/30, authorize:0/30, authorize:13/30, authorize:26/30, authorize:39/30, authorize:53/30, authorize:66/30, authorize:79/30, authorize:92/30, authorize:105/30 seconds; missing cells stay missing.

Witnesses: [browser-read-across-page/contacts/whole-stage.png](/workspace/rayner-audit/out/current-audit-2026-11-22/browser-read-across-page/contacts/whole-stage.png); [review-second-witness/browser-read-across-page--13-20-26.png](/workspace/rayner-audit/out/current-audit-2026-11-22/review-second-witness/browser-read-across-page--13-20-26.png).

Ledgers: [baseline receipt](/workspace/rayner-audit/out/current-audit-2026-11-22/browser-read-across-page/baseline/receipt.json); [variant receipt](/workspace/rayner-audit/out/current-audit-2026-11-22/browser-read-across-page/variant/receipt.json).

### 31. `browser-forge-across-stage` — confirmed intended clause

**Claim coverage:** Diagonal crossing of your browser confirmed; historical full-size-stub clause not reconstructed: carrier remains current code slip.

Variant K9wd paper visibly overlaps Session text at32 and account content at39..42 on the diagonal; baseline routes the slip to the right with its lettering clear. Historical stub shape/size differs.

Scope: `{"step": "forge", "event": "forge"}`; baseline: complete, 85 frames, absolute 4654–4738, 2.8 s; variant: complete, 85 frames, absolute 4654–4738, 2.8 s. Settings/history are in the linked receipts and JSON review.

Full-scene sampled native offsets: forge:0/30, forge:11/30, forge:21/30, forge:32/30, forge:42/30, forge:53/30, forge:63/30, forge:74/30, forge:84/30 seconds; missing cells stay missing.

Witnesses: [browser-forge-across-stage/contacts/whole-stage.png](/workspace/rayner-audit/out/current-audit-2026-11-22/browser-forge-across-stage/contacts/whole-stage.png); [review-second-witness/browser-forge-across-stage--25-32-42.png](/workspace/rayner-audit/out/current-audit-2026-11-22/review-second-witness/browser-forge-across-stage--25-32-42.png); [review-second-witness/browser-forge-across-stage--39-45-50.png](/workspace/rayner-audit/out/current-audit-2026-11-22/review-second-witness/browser-forge-across-stage--39-45-50.png).

Ledgers: [baseline receipt](/workspace/rayner-audit/out/current-audit-2026-11-22/browser-forge-across-stage/baseline/receipt.json); [variant receipt](/workspace/rayner-audit/out/current-audit-2026-11-22/browser-forge-across-stage/variant/receipt.json).

### 32. `browser-message-across-stage` — blocked before defect paints

**Claim coverage:** No diagonal variant motion can be judged.

Variant receipt has one pre-event picture only. RangeError refuses phish: authored3.450s exceeds allowed3.350s. Contact blank cells are missing native frames; baseline phish footage cannot diagnose variant motion.

Scope: `{"step": "phish", "event": "phish"}`; baseline: complete, 102 frames, absolute 5459–5560, 3.35 s; variant: typed-refusal, 1 frames, absolute 5459–5459, 0 s. Settings/history are in the linked receipts and JSON review.

Full-scene sampled native offsets: forge:0/30, phish:0/30, phish:13/30, phish:25/30, phish:38/30, phish:51/30, phish:63/30, phish:76/30, phish:88/30, phish:101/30 seconds; missing cells stay missing.

Witnesses: [browser-message-across-stage/contacts/whole-stage.png](/workspace/rayner-audit/out/current-audit-2026-11-22/browser-message-across-stage/contacts/whole-stage.png).

Ledgers: [baseline receipt](/workspace/rayner-audit/out/current-audit-2026-11-22/browser-message-across-stage/baseline/receipt.json); [variant receipt](/workspace/rayner-audit/out/current-audit-2026-11-22/browser-message-across-stage/variant/receipt.json).

### 33. `browser-message-lingers` — confirmed intended clause

**Claim coverage:** Declined message persistence confirmed. Rack no-codes-yet clause not reconstructed: no such notice exists in the pre-event rack, and current mutation changes only message retirement.

Actual published reader route accepts load,authorize,submit,phish,forge from recorded start origin. R5ty and declined remain visible in variant throughout forge at21/43, while baseline removes them before forged paper travels. All three rack rows are already present.

Scope: `{"step": "phish", "event": "forge", "log": ["load", "authorize", "submit", "phish", "forge"]}`; baseline: complete, 87 frames, absolute 6694–6779, 2.8333 s; variant: complete, 87 frames, absolute 6694–6779, 2.8333 s. Settings/history are in the linked receipts and JSON review.

Full-scene sampled native offsets: phish:0/30, phish:11/30, phish:21/30, phish:32/30, phish:43/30, phish:53/30, phish:64/30, phish:74/30, phish:85/30 seconds; missing cells stay missing.

Witnesses: [browser-message-lingers/contacts/whole-stage.png](/workspace/rayner-audit/out/current-audit-2026-11-22/browser-message-lingers/contacts/whole-stage.png); [review-second-witness/browser-message-lingers--0-21-43.png](/workspace/rayner-audit/out/current-audit-2026-11-22/review-second-witness/browser-message-lingers--0-21-43.png).

Ledgers: [baseline receipt](/workspace/rayner-audit/out/current-audit-2026-11-22/browser-message-lingers/baseline/receipt.json); [variant receipt](/workspace/rayner-audit/out/current-audit-2026-11-22/browser-message-lingers/variant/receipt.json).

### 34. `browser-submit-meet-on-top` — confirmed intended clause

**Claim coverage:** Both carriers meeting on stop confirmed. Return-cookie origin at stop supported by native full-scene samples, while baseline starts return beside it.

At34 the stub approaches stop; at38 variant cookie and stub occupy the stop together and cookie covers code ink. Baseline remains side by side. At42 fading paper/code still visibly coincide; later Session cookie leaves that counter region.

Scope: `{"step": "submit", "event": "submit"}`; baseline: complete, 102 frames, absolute 2296–2397, 3.35 s; variant: complete, 102 frames, absolute 2296–2397, 3.35 s. Settings/history are in the linked receipts and JSON review.

Full-scene sampled native offsets: authorize:0/30, submit:0/30, submit:13/30, submit:25/30, submit:38/30, submit:51/30, submit:63/30, submit:76/30, submit:88/30, submit:101/30 seconds; missing cells stay missing.

Witnesses: [browser-submit-meet-on-top/contacts/whole-stage.png](/workspace/rayner-audit/out/current-audit-2026-11-22/browser-submit-meet-on-top/contacts/whole-stage.png); [review-second-witness/browser-submit-meet-on-top--34-38-42.png](/workspace/rayner-audit/out/current-audit-2026-11-22/review-second-witness/browser-submit-meet-on-top--34-38-42.png).

Ledgers: [baseline receipt](/workspace/rayner-audit/out/current-audit-2026-11-22/browser-submit-meet-on-top/baseline/receipt.json); [variant receipt](/workspace/rayner-audit/out/current-audit-2026-11-22/browser-submit-meet-on-top/variant/receipt.json).

### 35. `browser-forge-ends-on-stop` — confirmed intended clause

**Claim coverage:** Endpoint on counter stop confirmed. A barrier dropping over that travelling stub is not reproduced: later barrier is on rack row after slip leaves.

Variant paper ends directly across white counter stop at55; baseline ends short with stop visibly free. Native65 has no travelling stub, then row gap/barrier develops elsewhere. Do not extend this into a simultaneous barrier/stub collision.

Scope: `{"step": "forge", "event": "forge"}`; baseline: complete, 85 frames, absolute 4654–4738, 2.8 s; variant: complete, 85 frames, absolute 4654–4738, 2.8 s. Settings/history are in the linked receipts and JSON review.

Full-scene sampled native offsets: forge:0/30, forge:11/30, forge:21/30, forge:32/30, forge:42/30, forge:53/30, forge:63/30, forge:74/30, forge:84/30 seconds; missing cells stay missing.

Witnesses: [browser-forge-ends-on-stop/contacts/whole-stage.png](/workspace/rayner-audit/out/current-audit-2026-11-22/browser-forge-ends-on-stop/contacts/whole-stage.png); [review-second-witness/browser-forge-ends-on-stop--49-55-65.png](/workspace/rayner-audit/out/current-audit-2026-11-22/review-second-witness/browser-forge-ends-on-stop--49-55-65.png).

Ledgers: [baseline receipt](/workspace/rayner-audit/out/current-audit-2026-11-22/browser-forge-ends-on-stop/baseline/receipt.json); [variant receipt](/workspace/rayner-audit/out/current-audit-2026-11-22/browser-forge-ends-on-stop/variant/receipt.json).

### 36. `browser-record-after-halves` — confirmed intended clause

**Claim coverage:** Record arriving after both halves are handed out confirmed on load.

At47 variant readable Vn3q travels into page while corresponding rack slot is empty; baseline rack record is already readable. At78 variant cookie half travels with empty rack slot; at109 record starts fading into rack only once halves are settled.

Scope: `{"step": "load", "event": "load"}`; baseline: complete, 126 frames, absolute 855–980, 4.15 s; variant: complete, 126 frames, absolute 855–980, 4.15 s. Settings/history are in the linked receipts and JSON review.

Full-scene sampled native offsets: fetch:0/30, load:0/30, load:16/30, load:31/30, load:47/30, load:63/30, load:78/30, load:94/30, load:109/30, load:125/30 seconds; missing cells stay missing.

Witnesses: [browser-record-after-halves/contacts/whole-stage.png](/workspace/rayner-audit/out/current-audit-2026-11-22/browser-record-after-halves/contacts/whole-stage.png); [review-second-witness/browser-record-after-halves--47-78-109.png](/workspace/rayner-audit/out/current-audit-2026-11-22/review-second-witness/browser-record-after-halves--47-78-109.png).

Ledgers: [baseline receipt](/workspace/rayner-audit/out/current-audit-2026-11-22/browser-record-after-halves/baseline/receipt.json); [variant receipt](/workspace/rayner-audit/out/current-audit-2026-11-22/browser-record-after-halves/variant/receipt.json).

### 37. `browser-read-over-its-copy` — confirmed intended clause

**Claim coverage:** Duplicated overlapping code confirmed. Literal Vn3q3q concatenation not observed; sampled current ghosted overlapping glyphs differ.

Native11..13 show offset grey/dark Vn3q letter copies on the same page slip in variant during appearance, while baseline page ink remains one crisp code. At16 onward copies separate. The intended double-code problem is visibly reconstructed without claiming the exact historical spelling artifact.

Scope: `{"step": "authorize", "event": "authorize"}`; baseline: complete, 106 frames, absolute 1688–1793, 3.5 s; variant: complete, 106 frames, absolute 1688–1793, 3.5 s. Settings/history are in the linked receipts and JSON review.

Full-scene sampled native offsets: load:0/30, authorize:0/30, authorize:13/30, authorize:26/30, authorize:39/30, authorize:53/30, authorize:66/30, authorize:79/30, authorize:92/30, authorize:105/30 seconds; missing cells stay missing.

Witnesses: [browser-read-over-its-copy/contacts/whole-stage.png](/workspace/rayner-audit/out/current-audit-2026-11-22/browser-read-over-its-copy/contacts/whole-stage.png); [review-second-witness/browser-read-over-its-copy--11-12-13-14-15-16.png](/workspace/rayner-audit/out/current-audit-2026-11-22/review-second-witness/browser-read-over-its-copy--11-12-13-14-15-16.png); [review-second-witness/browser-read-over-its-copy--4-7-10.png](/workspace/rayner-audit/out/current-audit-2026-11-22/review-second-witness/browser-read-over-its-copy--4-7-10.png).

Ledgers: [baseline receipt](/workspace/rayner-audit/out/current-audit-2026-11-22/browser-read-over-its-copy/baseline/receipt.json); [variant receipt](/workspace/rayner-audit/out/current-audit-2026-11-22/browser-read-over-its-copy/variant/receipt.json).

### 38. `browser-legend-moves` — unreproduced

**Claim coverage:** Valid first-load route has no differential legend motion. Two requested added-row published histories are inadmissible and refused as motion evidence.

Valid story load has at most one displayed row and max(1,row count) stays1, so legend remains unchanged. Additional reader load,load is refused with an unused code; load,authorize,submit,load is refused because story joins browser once. Their pre-event pictures cannot prove legend motion. No forced-start or fabricated added-row footage is substituted.

Scope: `{"step": "load", "event": "load"}`; baseline: complete, 126 frames, absolute 855–980, 4.15 s; variant: complete, 126 frames, absolute 855–980, 4.15 s. Settings/history are in the linked receipts and JSON review.

Full-scene sampled native offsets: fetch:0/30, load:0/30, load:16/30, load:31/30, load:47/30, load:63/30, load:78/30, load:94/30, load:109/30, load:125/30 seconds; missing cells stay missing.

Witnesses: [browser-legend-moves/contacts/whole-stage.png](/workspace/rayner-audit/out/current-audit-2026-11-22/browser-legend-moves/contacts/whole-stage.png).

Additional refused histories: [supplemental/browser-legend-moves--second-load-published/variant/receipt.json](/workspace/rayner-audit/out/current-audit-2026-11-22/supplemental/browser-legend-moves--second-load-published/variant/receipt.json) — {"event": "load", "kind": "refused", "reason": "the browser’s page already shows bc_Vn3q, which the agent has not used yet"}; [supplemental/browser-legend-moves--next-load-after-submit/variant/receipt.json](/workspace/rayner-audit/out/current-audit-2026-11-22/supplemental/browser-legend-moves--next-load-after-submit/variant/receipt.json) — {"event": "load", "kind": "beyond", "reason": "the story joins the browser once"}.

Ledgers: [baseline receipt](/workspace/rayner-audit/out/current-audit-2026-11-22/browser-legend-moves/baseline/receipt.json); [variant receipt](/workspace/rayner-audit/out/current-audit-2026-11-22/browser-legend-moves/variant/receipt.json).

### 39. `browser-attacker-over-shelf` — confirmed intended clause

**Claim coverage:** Forge and phish both confirmed right-side exit across attacker browser host/name. Shelf geography changes; cookies label ink stays clear on sampled paths, so no cookies-word occlusion is claimed.

Variant K9wd slip appears at right of attacker browser and visibly covers end of evil.example host ink around17..21. Baseline exits left with name clear. Cookies lettering is left of forge trajectory, so shelf-name crossing cannot be credited from this event. Supplemental native53/57/63 shows cookie copy rises from right shelf through evil.example host lettering; baseline cookie exits left clear of host. Cookies lettering remains readable on both sides.

Scope: `{"step": "forge", "event": "forge"}`; baseline: complete, 85 frames, absolute 4654–4738, 2.8 s; variant: complete, 85 frames, absolute 4654–4738, 2.8 s. Settings/history are in the linked receipts and JSON review.

Full-scene sampled native offsets: forge:0/30, forge:11/30, forge:21/30, forge:32/30, forge:42/30, forge:53/30, forge:63/30, forge:74/30, forge:84/30 seconds; missing cells stay missing.

Witnesses: [browser-attacker-over-shelf/contacts/whole-stage.png](/workspace/rayner-audit/out/current-audit-2026-11-22/browser-attacker-over-shelf/contacts/whole-stage.png); [review-second-witness/browser-attacker-over-shelf--11-17-21.png](/workspace/rayner-audit/out/current-audit-2026-11-22/review-second-witness/browser-attacker-over-shelf--11-17-21.png); [supplemental/browser-attacker-over-shelf--phish-story/contacts/whole-stage.png](/workspace/rayner-audit/out/current-audit-2026-11-22/supplemental/browser-attacker-over-shelf--phish-story/contacts/whole-stage.png); [review-second-witness/supplemental--browser-attacker-over-shelf--phish-story--53-57-63.png](/workspace/rayner-audit/out/current-audit-2026-11-22/review-second-witness/supplemental--browser-attacker-over-shelf--phish-story--53-57-63.png).

Supplemental phish route: {"route": {"step": "phish", "event": "phish"}, "settings": {"signin": "signed-in"}, "origin": 5459, "end": 5560, "history": ["fetch", "load", "authorize", "submit", "browse", "forge"], "framesPerSide": 102, "visuallyViewedContactSamples": [{"step": "forge", "frame": 0}, {"step": "phish", "frame": 0}, {"step": "phish", "frame": 13}, {"step": "phish", "frame": 25}, {"step": "phish", "frame": 38}, {"step": "phish", "frame": 51}, {"step": "phish", "frame": 63}, {"step": "phish", "frame": 76}, {"step": "phish", "frame": 88}, {"step": "phish", "frame": 101}]}.

Ledgers: [baseline receipt](/workspace/rayner-audit/out/current-audit-2026-11-22/browser-attacker-over-shelf/baseline/receipt.json); [variant receipt](/workspace/rayner-audit/out/current-audit-2026-11-22/browser-attacker-over-shelf/variant/receipt.json).

### 40. `browser-read-tiny-words` — confirmed intended clause

**Claim coverage:** Scaled stub and much smaller in-flight code confirmed; phone legibility is visual accessibility judgment, not a pixel-exact threshold proof.

Native13/20/26 variant carries stub with notably smaller Vn3q lettering than baseline code slip. At390 CSS-pixel equivalent whole-scene size, travelling code is tiny and materially harder to read. Native remains legible in closeup; enlargement cannot establish phone readability.

Scope: `{"step": "authorize", "event": "authorize"}`; baseline: complete, 106 frames, absolute 1688–1793, 3.5 s; variant: complete, 106 frames, absolute 1688–1793, 3.5 s. Settings/history are in the linked receipts and JSON review.

Full-scene sampled native offsets: load:0/30, authorize:0/30, authorize:13/30, authorize:26/30, authorize:39/30, authorize:53/30, authorize:66/30, authorize:79/30, authorize:92/30, authorize:105/30 seconds; missing cells stay missing.

Witnesses: [browser-read-tiny-words/contacts/whole-stage.png](/workspace/rayner-audit/out/current-audit-2026-11-22/browser-read-tiny-words/contacts/whole-stage.png); [review-second-witness/browser-read-tiny-words--13-20-26.png](/workspace/rayner-audit/out/current-audit-2026-11-22/review-second-witness/browser-read-tiny-words--13-20-26.png); [review-second-witness/browser-read-tiny-words--phone390.png](/workspace/rayner-audit/out/current-audit-2026-11-22/review-second-witness/browser-read-tiny-words--phone390.png).

Ledgers: [baseline receipt](/workspace/rayner-audit/out/current-audit-2026-11-22/browser-read-tiny-words/baseline/receipt.json); [variant receipt](/workspace/rayner-audit/out/current-audit-2026-11-22/browser-read-tiny-words/variant/receipt.json).

### 41. `browser-forge-tiny-words` — confirmed intended clause

**Claim coverage:** Scaled stub and much smaller in-flight code confirmed; phone legibility is visual accessibility judgment.

Native21/32 show smaller K9wd on variant stub than baseline code slip. The390 CSS-pixel equivalent scene makes the variant travelling word difficult to read while baseline code is substantially larger. This confirms the small-word mechanism without pretending a universal human-reading threshold.

Scope: `{"step": "forge", "event": "forge"}`; baseline: complete, 85 frames, absolute 4654–4738, 2.8 s; variant: complete, 85 frames, absolute 4654–4738, 2.8 s. Settings/history are in the linked receipts and JSON review.

Full-scene sampled native offsets: forge:0/30, forge:11/30, forge:21/30, forge:32/30, forge:42/30, forge:53/30, forge:63/30, forge:74/30, forge:84/30 seconds; missing cells stay missing.

Witnesses: [browser-forge-tiny-words/contacts/whole-stage.png](/workspace/rayner-audit/out/current-audit-2026-11-22/browser-forge-tiny-words/contacts/whole-stage.png); [review-second-witness/browser-forge-tiny-words--21-32-49.png](/workspace/rayner-audit/out/current-audit-2026-11-22/review-second-witness/browser-forge-tiny-words--21-32-49.png); [review-second-witness/browser-forge-tiny-words--phone390.png](/workspace/rayner-audit/out/current-audit-2026-11-22/review-second-witness/browser-forge-tiny-words--phone390.png).

Ledgers: [baseline receipt](/workspace/rayner-audit/out/current-audit-2026-11-22/browser-forge-tiny-words/baseline/receipt.json); [variant receipt](/workspace/rayner-audit/out/current-audit-2026-11-22/browser-forge-tiny-words/variant/receipt.json).

### 42. `conversations-layout-slides` — confirmed intended clause

**Claim coverage:** Opening direct: agent/you captions move for composition; blanket every-part wording is not established, and close event is not sampled.

Variant your agent, you and person lettering remains readable while translating from original seat labels down toward direct layout at14/20/34. Baseline fades these captions out while participant marks travel. Other unchanged ledger context stays visible on both sides.

Scope: `{"step": "direct", "event": "direct"}`; baseline: complete, 55 frames, absolute 3253–3307, 1.8 s; variant: complete, 55 frames, absolute 3253–3307, 1.8 s. Settings/history are in the linked receipts and JSON review.

Full-scene sampled native offsets: invite:0/30, direct:0/30, direct:7/30, direct:14/30, direct:20/30, direct:27/30, direct:34/30, direct:41/30, direct:47/30, direct:54/30 seconds; missing cells stay missing.

Witnesses: [conversations-layout-slides/contacts/whole-stage.png](/workspace/rayner-audit/out/current-audit-2026-11-22/conversations-layout-slides/contacts/whole-stage.png); [review-second-witness/conversations-layout-slides--14-20-34.png](/workspace/rayner-audit/out/current-audit-2026-11-22/review-second-witness/conversations-layout-slides--14-20-34.png).

Ledgers: [baseline receipt](/workspace/rayner-audit/out/current-audit-2026-11-22/conversations-layout-slides/baseline/receipt.json); [variant receipt](/workspace/rayner-audit/out/current-audit-2026-11-22/conversations-layout-slides/variant/receipt.json).

### 43. `conversations-turn-over-seat-name` — secondary-only effect

**Claim coverage:** Ask route: travelling speech covers participant mark, while your agent and AI name ink stays clear. Seat-name historical clause unconfirmed; other speaking routes not filmed for this mutation.

Variant native10..20 bubble is visibly over agent mark/ring at launch. The name and AI are above bubble tail with clear separation; baseline launches inside table clear of mark. A mark collision cannot earn an unchanged exact-name target.

Scope: `{"step": "open", "event": "ask"}`; baseline: complete, 55 frames, absolute 30–84, 1.8 s; variant: complete, 55 frames, absolute 30–84, 1.8 s. Settings/history are in the linked receipts and JSON review.

Full-scene sampled native offsets: open:0/30, open:7/30, open:14/30, open:20/30, open:27/30, open:34/30, open:41/30, open:47/30, open:54/30 seconds; missing cells stay missing.

Witnesses: [conversations-turn-over-seat-name/contacts/whole-stage.png](/workspace/rayner-audit/out/current-audit-2026-11-22/conversations-turn-over-seat-name/contacts/whole-stage.png); [review-second-witness/conversations-turn-over-seat-name--10-14-20.png](/workspace/rayner-audit/out/current-audit-2026-11-22/review-second-witness/conversations-turn-over-seat-name--10-14-20.png).

Ledgers: [baseline receipt](/workspace/rayner-audit/out/current-audit-2026-11-22/conversations-turn-over-seat-name/baseline/receipt.json); [variant receipt](/workspace/rayner-audit/out/current-audit-2026-11-22/conversations-turn-over-seat-name/variant/receipt.json).

### 44. `conversations-words-dissolve` — unreproduced

**Claim coverage:** Mutation differential absent for BOTH edited steps over all1711 native ledger frames. Baseline itself visibly has glyph-shrink/dot symptom during replacement, recorded separately as remaining production defect.

All owner799+close912 frames align by absolute clock, step and local frame and have equal SVG and pixel hashes. Sampled owner0/6/9/12/15/18 and close0/6/9/12/15/18 show individual letters shrink with spacing retained, becoming dots, identically on both sides. This does not validate the reconstruction mutation; it flags a baseline visual defect.

Scope: `{"step": "owner", "event": "view.sync"}`; baseline: complete, 1711 frames, absolute 4908–6618, 57 s; variant: complete, 1711 frames, absolute 4908–6618, 57 s. Settings/history are in the linked receipts and JSON review.

Visually inspected full scenes at owner and close offsets 0, 0.4, 0.8 s; readable ledger crops at each step’s offsets 0, 0.2, 0.3, 0.4, 0.5, 0.6 s. Full 799+912 equality is a ledger assertion, not a claim to viewing all frames.

Witnesses: [review-second-witness/conversations-words-dissolve--0-12-24.png](/workspace/rayner-audit/out/current-audit-2026-11-22/review-second-witness/conversations-words-dissolve--0-12-24.png); [review-second-witness/conversations-words-dissolve--799-811-823.png](/workspace/rayner-audit/out/current-audit-2026-11-22/review-second-witness/conversations-words-dissolve--799-811-823.png); [review-second-witness/conversations-words-dissolve--0-6-9-12-15-18.png](/workspace/rayner-audit/out/current-audit-2026-11-22/review-second-witness/conversations-words-dissolve--0-6-9-12-15-18.png); [review-second-witness/conversations-words-dissolve--799-805-808-811-814-817.png](/workspace/rayner-audit/out/current-audit-2026-11-22/review-second-witness/conversations-words-dissolve--799-805-808-811-814-817.png).

Ledgers: [baseline receipt](/workspace/rayner-audit/out/current-audit-2026-11-22/conversations-words-dissolve/baseline/receipt.json); [variant receipt](/workspace/rayner-audit/out/current-audit-2026-11-22/conversations-words-dissolve/variant/receipt.json).

### 45. `conversations-person-over-ledger` — confirmed intended clause

**Claim coverage:** Person joining main table route crosses ledger rows. Direct specialist route is not sampled.

Variant person icon passes over author.type at23 then role at30, visibly interrupting label strokes. Baseline person takes lower stage route below ledger and rises beside the seat. Heading alone is not used to excuse missing row lettering.

Scope: `{"step": "person", "event": "joins"}`; baseline: complete, 61 frames, absolute 1856–1916, 2 s; variant: complete, 61 frames, absolute 1856–1916, 2 s. Settings/history are in the linked receipts and JSON review.

Full-scene sampled native offsets: person:0/30, person:8/30, person:15/30, person:23/30, person:30/30, person:38/30, person:45/30, person:53/30, person:60/30 seconds; missing cells stay missing.

Witnesses: [conversations-person-over-ledger/contacts/whole-stage.png](/workspace/rayner-audit/out/current-audit-2026-11-22/conversations-person-over-ledger/contacts/whole-stage.png); [review-second-witness/conversations-person-over-ledger--20-23-30.png](/workspace/rayner-audit/out/current-audit-2026-11-22/review-second-witness/conversations-person-over-ledger--20-23-30.png).

Ledgers: [baseline receipt](/workspace/rayner-audit/out/current-audit-2026-11-22/conversations-person-over-ledger/baseline/receipt.json); [variant receipt](/workspace/rayner-audit/out/current-audit-2026-11-22/conversations-person-over-ledger/variant/receipt.json).

### 46. `conversations-table-block-blinks` — confirmed intended clause

**Claim coverage:** Read event makes unchanged On the table heading, rules, labels disappear; about0.47..1.13s sampled absence confirmed. Universal every-message wording not assessed.

Variant read native14/27/34 has blank space for whole block while baseline heading/rules/author.type/role remain painted. Values also differ but do not explain loss of unchanged block context.

Scope: `{"step": "read", "event": "read"}`; baseline: complete, 55 frames, absolute 743–797, 1.8 s; variant: complete, 55 frames, absolute 743–797, 1.8 s. Settings/history are in the linked receipts and JSON review.

Full-scene sampled native offsets: open:0/30, read:0/30, read:7/30, read:14/30, read:20/30, read:27/30, read:34/30, read:41/30, read:47/30, read:54/30 seconds; missing cells stay missing.

Witnesses: [conversations-table-block-blinks/contacts/whole-stage.png](/workspace/rayner-audit/out/current-audit-2026-11-22/conversations-table-block-blinks/contacts/whole-stage.png); [review-second-witness/conversations-table-block-blinks--14-27-34.png](/workspace/rayner-audit/out/current-audit-2026-11-22/review-second-witness/conversations-table-block-blinks--14-27-34.png).

Ledgers: [baseline receipt](/workspace/rayner-audit/out/current-audit-2026-11-22/conversations-table-block-blinks/baseline/receipt.json); [variant receipt](/workspace/rayner-audit/out/current-audit-2026-11-22/conversations-table-block-blinks/variant/receipt.json).

### 47. `conversations-block-crossfades` — confirmed intended clause

**Claim coverage:** Direct open: heading and row-label disappearance confirmed; row-rule ink remains, so literal entire-block disappearance is only partial. Close event not sampled.

Variant native14/27/34 drops On the table, author.type and role lettering during composition change; baseline retains them. Thin blue row rules remain visible in variant, preventing a claim that every block component vanishes.

Scope: `{"step": "direct", "event": "direct"}`; baseline: complete, 55 frames, absolute 3253–3307, 1.8 s; variant: complete, 55 frames, absolute 3253–3307, 1.8 s. Settings/history are in the linked receipts and JSON review.

Full-scene sampled native offsets: invite:0/30, direct:0/30, direct:7/30, direct:14/30, direct:20/30, direct:27/30, direct:34/30, direct:41/30, direct:47/30, direct:54/30 seconds; missing cells stay missing.

Witnesses: [conversations-block-crossfades/contacts/whole-stage.png](/workspace/rayner-audit/out/current-audit-2026-11-22/conversations-block-crossfades/contacts/whole-stage.png); [review-second-witness/conversations-block-crossfades--14-27-34.png](/workspace/rayner-audit/out/current-audit-2026-11-22/review-second-witness/conversations-block-crossfades--14-27-34.png).

Ledgers: [baseline receipt](/workspace/rayner-audit/out/current-audit-2026-11-22/conversations-block-crossfades/baseline/receipt.json); [variant receipt](/workspace/rayner-audit/out/current-audit-2026-11-22/conversations-block-crossfades/variant/receipt.json).

### 48. `coverage-strips-cross` — confirmed intended clause

**Claim coverage:** Hostile company use alternative: followed and aside strips travel concurrently and visibly cross. Skill event not sampled for this mutation.

Variant at18 has send-address-book paper covering checkout-page lettering; at21 it crosses between followed strips. Baseline moves followed strips alone and aside strips later. This checks visible paper and lettering, not simultaneous boxes alone.

Scope: `{"step": "sort", "event": "use alternative"}`; baseline: complete, 72 frames, absolute 3072–3143, 2.35 s; variant: complete, 72 frames, absolute 3072–3143, 2.35 s. Settings/history are in the linked receipts and JSON review.

Full-scene sampled native offsets: report:0/30, sort:0/30, sort:9/30, sort:18/30, sort:27/30, sort:36/30, sort:44/30, sort:53/30, sort:62/30, sort:71/30 seconds; missing cells stay missing.

Witnesses: [coverage-strips-cross/contacts/whole-stage.png](/workspace/rayner-audit/out/current-audit-2026-11-22/coverage-strips-cross/contacts/whole-stage.png); [review-second-witness/coverage-strips-cross--15-18-21.png](/workspace/rayner-audit/out/current-audit-2026-11-22/review-second-witness/coverage-strips-cross--15-18-21.png).

Ledgers: [baseline receipt](/workspace/rayner-audit/out/current-audit-2026-11-22/coverage-strips-cross/baseline/receipt.json); [variant receipt](/workspace/rayner-audit/out/current-audit-2026-11-22/coverage-strips-cross/variant/receipt.json).

### 49. `coverage-report-too-long` — editorial/timing judgment

**Claim coverage:** Three legs and4.0s variant versus two legs2.75s baseline confirmed; whether extra1.25s is too long requires pacing judgment.

Native15/30 show extra tray-to-station leg before outbound ticket;75 shows reply just starting while baseline result already arrives. Native120 variant endpoint versus baseline83 ledger frames verifies duration without normalization. Extra leg also crosses User wording; that secondary effect does not prove too-long claim.

Scope: `{"step": "report", "event": "report"}`; baseline: complete, 84 frames, absolute 2307–2390, 2.75 s; variant: complete, 121 frames, absolute 2307–2427, 4 s. Settings/history are in the linked receipts and JSON review.

Full-scene sampled native offsets: stuck:0/30, report:0/30, report:15/30, report:30/30, report:45/30, report:60/30, report:75/30, report:90/30, report:105/30, report:120/30 seconds; missing cells stay missing.

Witnesses: [coverage-report-too-long/contacts/whole-stage.png](/workspace/rayner-audit/out/current-audit-2026-11-22/coverage-report-too-long/contacts/whole-stage.png); [review-second-witness/coverage-report-too-long--15-30-75.png](/workspace/rayner-audit/out/current-audit-2026-11-22/review-second-witness/coverage-report-too-long--15-30-75.png); [review-second-witness/coverage-report-too-long--72-75-78-81.png](/workspace/rayner-audit/out/current-audit-2026-11-22/review-second-witness/coverage-report-too-long--72-75-78-81.png).

Ledgers: [baseline receipt](/workspace/rayner-audit/out/current-audit-2026-11-22/coverage-report-too-long/baseline/receipt.json); [variant receipt](/workspace/rayner-audit/out/current-audit-2026-11-22/coverage-report-too-long/variant/receipt.json).

### 50. `coverage-skill-card-twice` — confirmed intended clause

**Claim coverage:** Skill card on hook plus travelling copy confirmed at18/21. Return-to-hook timing supported by later whole-scene samples; not every frame visually inspected.

Variant native18 visibly shows two complete skill cards simultaneously, hook and deskward traveller. Baseline native18 has only traveller, and hook stays empty during its reading interval before restoration.

Scope: `{"step": "skill", "event": "use skill"}`; baseline: complete, 148 frames, absolute 3871–4018, 4.9 s; variant: complete, 148 frames, absolute 3871–4018, 4.9 s. Settings/history are in the linked receipts and JSON review.

Full-scene sampled native offsets: sort:0/30, skill:0/30, skill:18/30, skill:37/30, skill:55/30, skill:74/30, skill:92/30, skill:110/30, skill:129/30, skill:147/30 seconds; missing cells stay missing.

Witnesses: [coverage-skill-card-twice/contacts/whole-stage.png](/workspace/rayner-audit/out/current-audit-2026-11-22/coverage-skill-card-twice/contacts/whole-stage.png); [review-second-witness/coverage-skill-card-twice--15-18-21.png](/workspace/rayner-audit/out/current-audit-2026-11-22/review-second-witness/coverage-skill-card-twice--15-18-21.png).

Ledgers: [baseline receipt](/workspace/rayner-audit/out/current-audit-2026-11-22/coverage-skill-card-twice/baseline/receipt.json); [variant receipt](/workspace/rayner-audit/out/current-audit-2026-11-22/coverage-skill-card-twice/variant/receipt.json).

### 51. `coverage-reach-over-strips` — confirmed intended clause

**Claim coverage:** Hostile use skill: secret strip crosses settled GET the order; alternative event not sampled for this mutation.

Variant your access token paper visibly obscures end of GET the order at93 and covers most of it at96. Baseline secret travels in upper corridor above followed strips. Variant already has other aside strips settled and reaches diagonally later.

Scope: `{"step": "skill", "event": "use skill"}`; baseline: complete, 148 frames, absolute 3871–4018, 4.9 s; variant: complete, 154 frames, absolute 3871–4024, 5.1 s. Settings/history are in the linked receipts and JSON review.

Full-scene sampled native offsets: sort:0/30, skill:0/30, skill:19/30, skill:38/30, skill:57/30, skill:77/30, skill:96/30, skill:115/30, skill:134/30, skill:153/30 seconds; missing cells stay missing.

Witnesses: [coverage-reach-over-strips/contacts/whole-stage.png](/workspace/rayner-audit/out/current-audit-2026-11-22/coverage-reach-over-strips/contacts/whole-stage.png); [review-second-witness/coverage-reach-over-strips--88-93-96.png](/workspace/rayner-audit/out/current-audit-2026-11-22/review-second-witness/coverage-reach-over-strips--88-93-96.png).

Ledgers: [baseline receipt](/workspace/rayner-audit/out/current-audit-2026-11-22/coverage-reach-over-strips/baseline/receipt.json); [variant receipt](/workspace/rayner-audit/out/current-audit-2026-11-22/coverage-reach-over-strips/variant/receipt.json).

### 52. `coverage-desk-blinks` — confirmed intended clause

**Claim coverage:** Read tasks removes unchanged desk words; every-event statement not assessed.

At8/25/41 variant has no the shop sees, a visitor left or and never learns why ink while baseline retains all three during list trip. Desk rule remains; unchanged words are the protected clause.

Scope: `{"step": "board", "event": "read tasks"}`; baseline: complete, 67 frames, absolute 777–843, 2.2 s; variant: complete, 67 frames, absolute 777–843, 2.2 s. Settings/history are in the linked receipts and JSON review.

Full-scene sampled native offsets: search:0/30, board:0/30, board:8/30, board:17/30, board:25/30, board:33/30, board:41/30, board:50/30, board:58/30, board:66/30 seconds; missing cells stay missing.

Witnesses: [coverage-desk-blinks/contacts/whole-stage.png](/workspace/rayner-audit/out/current-audit-2026-11-22/coverage-desk-blinks/contacts/whole-stage.png); [review-second-witness/coverage-desk-blinks--8-25-41.png](/workspace/rayner-audit/out/current-audit-2026-11-22/review-second-witness/coverage-desk-blinks--8-25-41.png).

Ledgers: [baseline receipt](/workspace/rayner-audit/out/current-audit-2026-11-22/coverage-desk-blinks/baseline/receipt.json); [variant receipt](/workspace/rayner-audit/out/current-audit-2026-11-22/coverage-desk-blinks/variant/receipt.json).

### 53. `coverage-user-line-blinks` — confirmed intended clause

**Claim coverage:** Read tasks removes unchanged Close my account speech; every-event statement not assessed.

Variant native8/25/41 has no User person mark, speech card or Close my account lettering. Baseline keeps all visible during list flight. Variant later fades back unchanged wording.

Scope: `{"step": "board", "event": "read tasks"}`; baseline: complete, 67 frames, absolute 777–843, 2.2 s; variant: complete, 67 frames, absolute 777–843, 2.2 s. Settings/history are in the linked receipts and JSON review.

Full-scene sampled native offsets: search:0/30, board:0/30, board:8/30, board:17/30, board:25/30, board:33/30, board:41/30, board:50/30, board:58/30, board:66/30 seconds; missing cells stay missing.

Witnesses: [coverage-user-line-blinks/contacts/whole-stage.png](/workspace/rayner-audit/out/current-audit-2026-11-22/coverage-user-line-blinks/contacts/whole-stage.png); [review-second-witness/coverage-user-line-blinks--8-25-41.png](/workspace/rayner-audit/out/current-audit-2026-11-22/review-second-witness/coverage-user-line-blinks--8-25-41.png).

Ledgers: [baseline receipt](/workspace/rayner-audit/out/current-audit-2026-11-22/coverage-user-line-blinks/baseline/receipt.json); [variant receipt](/workspace/rayner-audit/out/current-audit-2026-11-22/coverage-user-line-blinks/variant/receipt.json).

### 54. `coverage-list-over-labels` — confirmed intended clause

**Claim coverage:** Counter feedback label crossing confirmed; additional User speech collision is secondary.

Variant native23/26 paper visibly covers feedback lettering; baseline paper passes below that heading. At41 variant later covers Close my account speech, but this different victim is separately noted and is not used to earn counter-label claim.

Scope: `{"step": "board", "event": "read tasks"}`; baseline: complete, 67 frames, absolute 777–843, 2.2 s; variant: complete, 67 frames, absolute 777–843, 2.2 s. Settings/history are in the linked receipts and JSON review.

Full-scene sampled native offsets: search:0/30, board:0/30, board:8/30, board:17/30, board:25/30, board:33/30, board:41/30, board:50/30, board:58/30, board:66/30 seconds; missing cells stay missing.

Witnesses: [coverage-list-over-labels/contacts/whole-stage.png](/workspace/rayner-audit/out/current-audit-2026-11-22/coverage-list-over-labels/contacts/whole-stage.png); [review-second-witness/coverage-list-over-labels--20-23-26.png](/workspace/rayner-audit/out/current-audit-2026-11-22/review-second-witness/coverage-list-over-labels--20-23-26.png); [review-second-witness/coverage-list-over-labels--18-25-41.png](/workspace/rayner-audit/out/current-audit-2026-11-22/review-second-witness/coverage-list-over-labels--18-25-41.png).

Ledgers: [baseline receipt](/workspace/rayner-audit/out/current-audit-2026-11-22/coverage-list-over-labels/baseline/receipt.json); [variant receipt](/workspace/rayner-audit/out/current-audit-2026-11-22/coverage-list-over-labels/variant/receipt.json).

### 55. `discovery-arm-over-register` — blocked before defect paints

**Claim coverage:** No variant arm-draw motion exists to judge.

Variant has only pre-event picture. Authored check1.850s exceeds allowed1.550s and is refused before motion paints. Baseline arm growth cannot serve as variant evidence.

Scope: `{"step": "handshake", "event": "check"}`; baseline: complete, 48 frames, absolute 1452–1499, 1.55 s; variant: typed-refusal, 1 frames, absolute 1452–1452, 0 s. Settings/history are in the linked receipts and JSON review.

Full-scene sampled native offsets: read:0/30, handshake:0/30, handshake:6/30, handshake:12/30, handshake:18/30, handshake:24/30, handshake:29/30, handshake:35/30, handshake:41/30, handshake:47/30 seconds; missing cells stay missing.

Witnesses: [discovery-arm-over-register/contacts/whole-stage.png](/workspace/rayner-audit/out/current-audit-2026-11-22/discovery-arm-over-register/contacts/whole-stage.png).

Ledgers: [baseline receipt](/workspace/rayner-audit/out/current-audit-2026-11-22/discovery-arm-over-register/baseline/receipt.json); [variant receipt](/workspace/rayner-audit/out/current-audit-2026-11-22/discovery-arm-over-register/variant/receipt.json).

### 56. `discovery-sheet-over-shop` — secondary-only effect

**Claim coverage:** Sheet changes to direct diagonal and intersects lower doorway; fascia/name crossing is not reproduced on this read route. Address-while-changing clause is absent: address completes before token launches.

Variant native24/30 passes to right of fascia with example.com fully readable. Native38 paper crosses lower door/threshold, unlike baseline right-side descent. Full-scene0.5s has completed new address before token visible0.73s. A doorway collision cannot earn the exact fascia claim.

Scope: `{"step": "read", "event": "check"}`; baseline: complete, 60 frames, absolute 743–802, 1.95 s; variant: complete, 60 frames, absolute 743–802, 1.95 s. Settings/history are in the linked receipts and JSON review.

Full-scene sampled native offsets: stranger:0/30, read:0/30, read:7/30, read:15/30, read:22/30, read:30/30, read:37/30, read:44/30, read:52/30, read:59/30 seconds; missing cells stay missing.

Witnesses: [discovery-sheet-over-shop/contacts/whole-stage.png](/workspace/rayner-audit/out/current-audit-2026-11-22/discovery-sheet-over-shop/contacts/whole-stage.png); [review-second-witness/discovery-sheet-over-shop--24-30-36.png](/workspace/rayner-audit/out/current-audit-2026-11-22/review-second-witness/discovery-sheet-over-shop--24-30-36.png); [review-second-witness/discovery-sheet-over-shop--36-38-40.png](/workspace/rayner-audit/out/current-audit-2026-11-22/review-second-witness/discovery-sheet-over-shop--36-38-40.png).

Ledgers: [baseline receipt](/workspace/rayner-audit/out/current-audit-2026-11-22/discovery-sheet-over-shop/baseline/receipt.json); [variant receipt](/workspace/rayner-audit/out/current-audit-2026-11-22/discovery-sheet-over-shop/variant/receipt.json).

### 57. `discovery-fetch-squeezed` — blocked before defect paints

**Claim coverage:** No variant squeezed fades or barrier beat can be observed.

Variant only has pre-event native picture. Check authored1.750s exceeds allowed1.300s; RangeError refuses compression before defect paints. No claim that a typed refusal films historical popping.

Scope: `{"step": "read", "event": "check"}`; baseline: complete, 60 frames, absolute 743–802, 1.95 s; variant: typed-refusal, 1 frames, absolute 743–743, 0 s. Settings/history are in the linked receipts and JSON review.

Full-scene sampled native offsets: stranger:0/30, read:0/30, read:7/30, read:15/30, read:22/30, read:30/30, read:37/30, read:44/30, read:52/30, read:59/30 seconds; missing cells stay missing.

Witnesses: [discovery-fetch-squeezed/contacts/whole-stage.png](/workspace/rayner-audit/out/current-audit-2026-11-22/discovery-fetch-squeezed/contacts/whole-stage.png).

Ledgers: [baseline receipt](/workspace/rayner-audit/out/current-audit-2026-11-22/discovery-fetch-squeezed/baseline/receipt.json); [variant receipt](/workspace/rayner-audit/out/current-audit-2026-11-22/discovery-fetch-squeezed/variant/receipt.json).

### 58. `discovery-path-slides` — confirmed intended clause

**Claim coverage:** Redirect shortened-host path slide confirmed late in fetch settle.

Variant preserves old right-aligned path while host changes, leaving a large gap; native45→51→57 path shifts left into place, while baseline replaces complete URL in its final position before document flight. Visible whole path movement matches layout-motion clause.

Scope: `{"step": "read", "event": "check"}`; baseline: complete, 60 frames, absolute 743–802, 1.95 s; variant: complete, 60 frames, absolute 743–802, 1.95 s. Settings/history are in the linked receipts and JSON review.

Full-scene sampled native offsets: stranger:0/30, read:0/30, read:7/30, read:15/30, read:22/30, read:30/30, read:37/30, read:44/30, read:52/30, read:59/30 seconds; missing cells stay missing.

Witnesses: [discovery-path-slides/contacts/whole-stage.png](/workspace/rayner-audit/out/current-audit-2026-11-22/discovery-path-slides/contacts/whole-stage.png); [review-second-witness/discovery-path-slides--0-6-12-18.png](/workspace/rayner-audit/out/current-audit-2026-11-22/review-second-witness/discovery-path-slides--0-6-12-18.png); [review-second-witness/discovery-path-slides--45-51-57-59.png](/workspace/rayner-audit/out/current-audit-2026-11-22/review-second-witness/discovery-path-slides--45-51-57-59.png).

Ledgers: [baseline receipt](/workspace/rayner-audit/out/current-audit-2026-11-22/discovery-path-slides/baseline/receipt.json); [variant receipt](/workspace/rayner-audit/out/current-audit-2026-11-22/discovery-path-slides/variant/receipt.json).
