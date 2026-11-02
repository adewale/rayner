# Script: what does a guest's calendar keep when one meeting of a series changes?

Questions the reader brings: How does a calendar store a repeating meeting? If I cancel one meeting, what do the people invited to it see? Why do cancelled meetings linger in other people's calendars?

Alice's calendar app saves her weekly stand-up as one VEVENT: DTSTART is the first meeting, Monday 2 November 2026 at 09:00 UTC, and RRULE:FREQ=WEEKLY;COUNT=6 makes six. Her calendar computes the six Mondays from those two lines.

She invites Bob to the third meeting only. The app keeps the first VEVENT and adds a second with the same UID: an override, whose RECURRENCE-ID, 20261116T090000Z, is the start the rule gave that meeting. Bob is sent that override and nothing else.

Then Alice skips that meeting. Her app adds EXDATE:20261116T090000Z to the first VEVENT and deletes Bob's override; COUNT=6 still counts the excluded start, so five meetings remain. The reader is asked: what does Bob's calendar show now?

Bob's copy keeps the meeting, marked cancelled. The server, Baïkal running sabre/dav, sends him an iTIP CANCEL, and delivering it sets STATUS:CANCELLED on the one VEVENT he holds; it deletes nothing. That is the answer: a guest's calendar keeps only the meetings it was sent, and a cancellation marks one CANCELLED instead of deleting it. Alice's calendar has no third meeting; Bob's still lists Monday 16 November, cancelled.

As details: the storage as a schema (RFC 4791 puts every VEVENT with one UID in one object, at most one master and any number of overrides, which may be stored without their master, as Bob's is), and the server's own rule: sabre answers 415 to a second master or a second RRULE, stricter than RFC 5545's SHOULD NOT.

**The aha:** Alice's list says "skipped, EXDATE" for week 3 while Bob's list still shows Mon 16 Nov, cancelled: one change, two different stored objects.

**Sentence to remember:** a guest's calendar keeps only the meetings it was sent, and a cancellation marks one CANCELLED instead of deleting it.

**Check questions**, in `meta.checks`, asked after the last step:

1. Alice skips the meeting Bob was invited to. What does each calendar show for that week?
2. Alice moves the second meeting, which Bob does not attend. What changes in Bob's copy?
3. Bob's copy is an override with RECURRENCE-ID and no master. Does the server accept it, and what does it refuse?

**Cases:** Alice's change (skip Bob's meeting, the default; move the second meeting; no other change) and whose copy to inspect (Bob's, the default, or Alice's, which shows her object as a schema with each part counted). The model is held to RFC 5545's examples and to sabre/vobject 4.5.7 with sabre/dav 4.7.0.

| Step | Script | Reader predicts |
| --- | --- | --- |
| series | paragraph 1: Alice's lines and the meetings they make | |
| invite | paragraph 2: the override, and what Bob is sent | |
| change | paragraph 3: the EXDATE and the deleted override | what Bob's calendar shows now |
| copy | paragraph 4: the answer, Bob's cancelled meeting (or Alice's counted copy) | |
| schema (detail) | paragraph 5: the storage rules as a schema (before the copy step when the copy is Alice’s, since her copy is counted on it) | |
| server (detail) | paragraph 5: sabre's 415 | |
