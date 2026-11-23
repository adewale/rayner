# Editorial motion review, 22 November 2026

Frozen source: `5bff60e0aa5660c2b944fb59fbfe0b59e703db93`, `/workspace/rayner-audit`. No production, renderer, detector or frozen audit artifacts were edited. Initial judgments used scripts, claims, model semantics, actual legal reader roots and fresh native pixels; no old audit verdict or detector-success count was consulted.

The clearest current defect is an advertised exercise the reader cannot start. The strongest additional teaching gap is the missing picture of a stale Session JWT. I did not establish a new protocol-motion regression in the sampled current baseline. Several journeys have a sound explanatory purpose; shortening them indiscriminately would remove causality.

## Prioritized findings

### E1 · P1 · Poppy cannot replay the advertised whole protocol

`poppy/script.md` promises “drive the whole protocol, from reading poppy.json to signing out.” The actual controls are inferred at `sign-out`. `liveBase` selects **rest**, because requests and signing in still work. In both approval settings the completed reachable graph has 12 states, and **neither `discover` nor `cart` is accepted at any reachable state**. The file is already discovered and the cart already contains the item; nothing clears those flags. Reloading or returning to the step reconstructs the same finished authored state.

This is an exercise/reachability defect, not a protocol rule. The current picture correctly says signed out and retains the Session/cart. Preserve that authored ending. Make the exercise explicitly begin from machine start, using the existing `liveStart: 'start'` mechanism, or provide an explicit starting offer. This retains all promised information and lets readers actually build it.

Evidence: [root states and complete enumeration](witnesses/roots.json), entries `poppy` with `approve=read-write` and `read-only`; [native signed-out picture](witnesses/poppy--read-write/sign-out.png). A keeper should derive the actual offered `liveBase`, then require a legal log `discover → cart → browse → chat → exchange → sign-in → exchange → thief → sign-out` in both settings. A negative keeper should remove the start policy and reject the resulting inaccessible `discover`/`cart`, while retaining the authored final cart and signed-out picture.

### E2 · P2 · The Session-JWT time check is told, never demonstrated

Sessions promises that every claim earns its place through a copy the reader watches fail. Its `clock` caption explicitly mentions an exact copy two minutes later rejected by `iat`. The story plays `replay` and then `expired`, however. `late` exists in the model but is excluded from both `TAMPERS` and `STORY`. The live `one-user` root offers no event producing that case.

Fresh `clock` pictures in **both** policies show **Pass expired**, with the delegation ending 06:00 and both the request signature and arrival at 07:00. That demonstrates delegation expiry; it does not demonstrate the Session-JWT time window. The `when / iat` row is never the failing row in the authored story or available reader events. The model's late-copy rule itself is present and is not the defect.

Preserve the eight-button interface and add an authored visual/detail for the two-minute copy, using the existing model's `late` case: signed 00:13:20, arrived 00:15:20, visibly torn at `when / iat`. This can follow the existing separate `first-use` detail pattern. Keep the delegation-expiry picture too; they explain different checks. Do not repair this by deleting the promise or the time-window fact.

Evidence: [remembers clock](witnesses/poppy-sessions--remembers/clock.png), [required-only clock](witnesses/poppy-sessions--required/clock.png), model `TAMPERS`, `attempt('late')` and `STORY`, scene `clock`, [legal roots](witnesses/roots.json). Positive keeper: both policies must paint the late request's two independently computed times and its time-check failure. Negative keeper: replacing the late state with `expired` must fail even though both answers are `400 invalid_session`.

### E3 · P3 · Sign-in grant uses a full composition change as part of the response

This is an editorial recommendation, not a protocol defect or proof that 4.5 seconds is universally too long. In the device-flow reader history `ask → approve-read → collect`, at +1.0 s the agent is below the phone. At +1.5 s the phone, person and agent have all disappeared; only the Company's rack remains. At +2.0 s the agent is redrawn at the upper left and the new key is still travelling. Direct flow also replaces the lower agent with the large upper keyring before the tag arrives. The fade avoids a misleading slide, but still spends attention and time explaining a layout change.

A smaller composition could keep the agent/ring at one stable position while the page opens and closes, then carry the new access key and refresh tag as the grant's paired handoff. The response still needs the outgoing code/poll, the Company as issuer, the scope-limited key and the new refresh token. Preserve the old key/tag until a replacement grant arrives. Existing `carry` handles a transferred physical original; `pass` is appropriate for an information copy. Neither a global displacement threshold nor a universal duration ceiling is necessary.

Evidence: [device +1.0 s](witnesses/signin-device-grant/0030.png), [device +1.5 s](witnesses/signin-device-grant/0045.png), [device +2.0 s](witnesses/signin-device-grant/0060.png), [direct +1.5 s](witnesses/signin-direct-grant/0045.png), [direct +2.0 s](witnesses/signin-direct-grant/0060.png). Native reader histories/times and sparse movies are in those directories. A keeper for a redesign should require the actual agent/ring reference during the response and a single physical password card in approval. Do not assert all motion is bad or force the phone and main chapter to share one arbitrary duration.

## Things worth keeping

* **Sessions' published-key journey has a causal job.** In both policy settings the key leaves its published position before the new ticket is checked and stands on the wax in place of the delegated stamp. The empty published-key and delegation slots make the missing delegation understandable. Retain that sequence and single physical identity. The fresh paired capture independently shows that starting the ticket check while the old delegated chain remains would teach the wrong signer. [Native live sample](witnesses/sessions-remembers-published/receipt.json); [fresh story comparison](../current-audit-2026-11-22/sessions-key-to-wax-after-check/contacts/whole-stage.png).
* **Conversations has two legitimate reader roots.** `read` can repeat handoff/invitation/direct conversation; `close` can send/read/close but cannot repeat those one-shot choices. Its final caption explicitly sends the reader back to “Replies are read, not returned,” where the machine is offered. That is sufficient guidance. The moving participants and separate paused/direct tables have semantic meaning. Keep whole-text replacement for ownership captions, and keep unchanged ledger context readable rather than banning every layout adjustment.
* **Coverage explicitly offers the broad exercise at `search`.** Both company settings can drive the task list, report, alternative and skill there. The final `skill` root can only close the account, exactly as its caption asks. Do not demand the final root repeat everything or reset away the evidence that the list answers immediately.
* **Browser actually restarts at start.** Its finished `phish` state cannot progress, so `liveBase` chooses `start`; the offered history can submit before authorization and browse before joining, with refusals. Attacks only become accepted events after joining, and the script states that boundary. All three sign-in settings were included in the root inventory; the no-scope path requires authorization twice. Preserve the browser's information-copy behavior: reading code does not consume the page; submitting consumes its stub; the attacker's cookie can remain as evidence.
* **Discovery's handshake earns its two arms.** Fresh resting pictures show the shop naming the issuer and the issuer listing the shop back, and the claim forgery has a missing listing. The source/target relationships are information, not decorative movement. Retain the register as context and reveal a result after the fetch/check it describes.
* **Refusals' remedy rail carries the why-next story.** The final 429 picture retains the returned slip, Retry-After value, selected Wait remedy and crossed-out New Session temptation. Preserve those distinct facts; a shorter journey that removes them is not an improvement.

## Timing judgment and keeper boundaries

Measured native reader intervals below include emitted frame bookkeeping. They are observations from the stated histories, not proposed limits:

| Reader route | Setting | First-to-last native sample |
|---|---|---:|
| Sign-in `ask, approve-read, collect` | direct / device | 4.500 s each |
| Sessions `published` | remembers / required | 3.933 s each |
| Conversations `direct` from `read` root | default | 1.833 s |
| Coverage `read tasks, gift card, report` | hostile / honest | 2.800 s each |

Sign-in's production allowance is **4.45 s**; its independent editorial response policy is **4.5 s plus two frames**. Sessions' production allowances are **2.85 s**, or **3.9 s** when the published key changes position. Those policies are reviewable editorial choices, not evidence of good teaching. The useful keeper is an actual-clock chapter check coupled to the required handoffs and context—not the sum of the production constants alone. A slowdown poison should alter timing without dropping events; a speed-up poison should retain endpoints while starting a dependent check before its input arrives. These should fail for different reasons.

Do not add a global duration/displacement cutoff. Retain separate owners for semantic state, actual reader reachability, native motion context, rendered glyph evidence and chapter pacing. Exact historical mutations are useful negative controls, but source-pattern matching or “all 59 found” is not a substitute for these assertions.

## Evidence and limits

* [roots.ts](roots.ts) ran public `liveSteps`, `liveBase` and machine exploration on all **14 scenarios / 17 offered roots**, preserving full root state, outcomes, graph-completeness status and shortest enabling histories in [roots.json](witnesses/roots.json). This was a semantic inventory, not a detector evaluation.
* [pictures.ts](pictures.ts) captured **115 final authored-step pictures** across all 14 scenarios at native 800×450. Each final SVG was rasterized once with `renderAsync`, its native pixels read once, and SHA-256/time/frame/state metadata retained in [pictures.json](witnesses/pictures.json). Capturing 115 does not mean I visually reviewed every one; inspected files are explicitly listed in [viewed.json](witnesses/viewed.json).
* [moves.ts](moves.ts) captured seven legal live histories from their actual offered roots, using one worker. It saved native samples every 15 frames plus the ending at 30 fps; each directory has PNG/SVG, exact offset/absolute frame/time, history, root and hashes. `sampled.mp4` files replay those sparse samples at their recorded intervals. These are **not full 30 fps movies** and cannot exclude short-lived defects between samples. The fresh all-59 owner's full-frame artifacts supplement the one cited Sessions comparison.
* This review inspected native pixels, not a fresh served-reader DOM or phone-width browser session. It does not certify browser interaction latency, every glyph at every transit frame, every possible live history, or universal visual clarity. It does establish the named unavailable exercises from complete graphs and the named absent story case from model/story inventory plus matching native pictures.
