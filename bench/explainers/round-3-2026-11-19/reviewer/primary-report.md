# Blind review — pair 1

**Verdict: Y teaches better, slightly.** Its consistent, directional diagrams make the central structural change easier to learn. X is stronger in several interactions and in desktop economy, so this is a close decision.

I stepped through every step of both pages at 1280×800 and 390×844, examined their contact sheets and captured screenshots, exercised predictions and live events at both sizes, and checked keyboard navigation and reduced-motion rendering. Chromium blocked `file://` with `ERR_BLOCKED_BY_ADMINISTRATOR`; I used a localhost server exposing only the identical pair folder. I inspected no mapping, author report or builder workspace.

## Five reasons

1. **Y’s arrows teach the mechanism more reliably.** In Y1, Y4–5 and Y17, arrowheads, start dots and parent boundaries let me follow START, POWER_OFF and re-entry without reconstructing direction from prose. X1–4’s coffee connectors have no visible arrowheads at either size. In X4 the POWER_OFF connector also stops below the off box instead of reaching it. That is consequential in a lesson about which state owns an arrow. See `X-1280-04.png` and `Y-1280-05.png`.

2. **Y keeps the same diagram language when the ideas combine.** Y10 and Y12/17 retain actual state boxes, connected event arrows and start dots inside the larger on boundary. X9 replaces the player diagram with text such as “PLAY ⇄ PAUSE” between state names; X11/14 replaces the coffee cycle with pills and a textual event sequence. The latter shows which states are active, but does less to show which event connects which states. Y17’s live POWER_OFF → POWER_ON visibly returned both regions to idle/still, preserving the picture the learner had already learned.

3. **Y gives the definition earlier.** The sentence explaining what a statechart is appears in Y4, immediately alongside the first parent. X waits until X15. Neither answers the headline question on the opening step, but Y equips the reader to name the structure while learning it. Both explain the independent-choice test and the dependent brewing-steam exception correctly. The checked 9-, 10- and 6-state cases agree with the supplied script.

4. **Both ask for meaningful work; X often supports it better.** Y has actual count and placement choices, not merely rhetorical prompts, plus working event controls and Undo/Reset. Its chosen prediction is compared with the answer on a following step. X gives immediate choice feedback, a writing area for the six flat state names in X13, and an explicit parent-event rule in X4. X8 is particularly strong: PLAY/MUTE/PAUSE/UNMUTE changes highlighted states in both complete diagrams, with matching configuration text and an event trail. Y9 instead changes two configuration readouts. The readouts establish agreement but hide the corresponding transition paths. This is X’s strongest advantage.

5. **X is more economical; Y’s visual clarity carries a phone penalty.** X’s usual desktop steps fit comfortably inside 800 pixels; Y repeats the heading and explanatory line below its large picture, with prose and disclosures extending beyond the initial viewport. X has 15 steps, Y 17. At 390 pixels, neither had horizontal page overflow. X reflows the media comparison into legible stacked diagrams, though it becomes long. Y’s complete chart is compact but has smaller labels. More seriously, Y’s phone event controls follow the prose: after pressing POWER_OFF in Y17, the picture was entirely above the viewport, so I had to scroll back to see the consequence. X14’s scrolled viewport kept its frother display and controls together. See `X-phone-event-viewport.png` and `Y-phone-event-viewport.png`. Y’s zoom enlarges the chart but crops it, requiring further navigation.

## Understanding, correctness and accessibility

Both can prepare a reader to answer the three checks. Both preserve independent regions during local events and reset them after a power cycle; X’s incomplete flat coffee copy correctly remains brewing on POWER_OFF. I found no incorrect numerical count in the inspected explanations. X’s disconnected/directionless coffee drawing is the principal pictorial correctness problem.

There is a smaller instructional ambiguity in Y3: beneath a new question about one parent arrow, it retains the previous 1/4/5-arrow prediction choices and the feedback “the answer is 4 arrows.” A reader must distinguish the earlier flat-machine question from the new parent question.

Keyboard checks worked: X’s Tab/Enter operated START; radio-arrow navigation changed the answer without changing steps, and page-arrow navigation worked. Y’s right arrow advanced a step. Both expose text and status information; X’s coffee SVG label describes the transitions, while Y supplies a transcript and a “What the picture shows” disclosure. Y’s latter disclosure on the live final chart was only a configuration readout (“final: frother…grinding · frothing”), not a full alternative explanation of its arrows. Neither should be assumed fully screen-reader accessible from these checks. Both remained usable with reduced motion; I also exercised normal-motion phone interactions.

## Capabilities across pairs and style tradeoffs

There is only one pair, so no cross-pair consistency can be established. Here, the winning page’s distinctive capability is maintaining connected, directed diagrams through hierarchy, regions and their composition. X’s missing coffee arrowheads and later switch to text/pills weaken that continuity.

Within this pair, X’s green field-guide style consistently favors compact text beside an activity, immediate feedback and direct comparison. Y’s large monochrome diagram style consistently favors diagram legibility, repeated spatial structure and navigable presentation controls. I make no inference about either method’s identity.

## The change that would let X win

**Keep one fully connected, directional diagram system from the opening coffee cycle through the combined frother chart.** Repair the coffee arrowheads and off connection, and carry real event arrows/start dots into X9/11/14 instead of substituting text sequences. Together with X’s existing side-by-side equivalence test, better phone control placement and shorter desktop pacing, that would remove the main reason to prefer Y.
