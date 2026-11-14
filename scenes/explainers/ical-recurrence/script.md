# Why can a cancelled meeting remain in a guest’s calendar?

- **Reader:** someone who uses a shared calendar, perhaps builds on CalDAV, and has seen a cancelled meeting linger for a guest; no knowledge of iCalendar's VEVENT, RRULE or iTIP is assumed.
- **Answer:** a guest’s calendar keeps only the meetings it was sent, and on this server a cancellation marks the guest’s copy CANCELLED instead of deleting it
- **Changed condition:** Alice's change (no other change, move the second meeting, skip Bob's meeting) and whose copy is inspected (Alice's or Bob's). Skipping Bob's meeting takes a week out of Alice's rule with EXDATE but leaves Bob's one meeting, marked CANCELLED; moving the second meeting changes Alice's object and leaves Bob's copy exactly as it was; Alice's copy holds a rule that Bob's never has.
- **Reader's own work:** predict what Bob's calendar shows after Alice's change; switch the change and the copy; answer the check questions.
- **Checked against:** sabre/vobject 4.5.7 and a Baïkal 0.10.1 server (sabre/dav 4.7.0). `model.test.ts` compares the model's validation, meeting starts and the guest's iTIP messages and copy with sabre/vobject's validate(), expand() and iTIP Broker (answers frozen in `fixtures/sabre.json` by `oracle/sabre.ts`, rerun in Docker when `SABRE_DOCKER=1`), compares each stored copy and the server's 415 refusals with what a Baïkal run stored and refused, and checks the weekly rules against RFC 5545's own example dates; `answers.ts` computes the check answers from the model.
- **Grounding:** recorded: sabre/vobject 4.5.7 and a Baïkal 0.10.1 server
- **Leaves out:** time zones and daylight-saving changes, general recurrence expansion beyond a six-week UTC series, other servers and other calendar apps (an app may hide a cancelled meeting even though the stored copy keeps it). The stored-copy view is not sabre/vobject's expand() result, which drops a master-less override whose RECURRENCE-ID equals its DTSTART; that quirk is tested separately and does not delete the stored VEVENT.

## Check yourself

1. Alice skips the fifth meeting, Monday 30 November, instead of Bob’s, by adding EXDATE:20261130T090000Z. How many meetings does her calendar show, and when is the last? What does Bob’s calendar show?
   Alice’s shows five, the last still on Monday 7 December: COUNT=6 counts the excluded start, so the series does not run a week longer. Bob is still in the third meeting’s override, so any update the server sends him carries that override again, and his calendar keeps Monday 16 November, not cancelled.
2. Alice moves the second meeting, which Bob does not attend. Before trying that setting: does Bob’s copy change, and why?
   No. The iTIP REQUEST the server sends him holds only the VEVENTs he attends, the third meeting’s override, so his copy keeps that one VEVENT and never learns of the move.
3. Bob’s calendar app wants to show him the rest of the stand-up series. Which lines would it need that his stored copy lacks?
   The master’s DTSTART and RRULE. His copy holds one override and no masters, so it has no rule to generate the other weeks from; only the organiser’s object has one.

## Why this explainer

The puzzle is a real one: two calendars on the same server disagree about a cancelled meeting. The tempting explanation is a sync bug. The real one is that a guest's calendar is not a replica of the organiser's series: it holds the occurrences it was sent, changed by the messages that follow. Alice can remove a meeting by excluding its start from her rule; Bob has no rule, only the occurrence, so the cancellation is applied to that.

The steps build Alice's stored object line by line (DTSTART, RRULE with COUNT, then an override named by RECURRENCE-ID when she invites Bob to one meeting) so the reader has the vocabulary before the two copies diverge. The default follows Bob's copy after Alice skips his meeting, which is the surprise. The copy setting exposes the organiser's different object; the change setting contrasts cancellation with moving a meeting Bob does not attend, which shows the same principle without any cancellation at all. The side-by-side copies, lined up against the six weeks of Alice's rule, are the picture to remember: Alice's gap is an exclusion; Bob's empty weeks were never generated.

The schema and server-validation steps are details, not prerequisites for the cancellation result. They show that the storage rules allow a master-less copy, and that this server refuses a second master or second RRULE, stricter than RFC 5545's SHOULD NOT. The check answers state model results, and a guard in `scene.ts` fails the scene if the model stops giving them.
