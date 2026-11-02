# Why can a cancelled meeting remain in a guest's calendar?

Alice's calendar shows six weekly stand-ups, but it need not store six separate meeting records. One VEVENT describes the series. DTSTART supplies the first start, Monday 2 November 2026 at 09:00 UTC. RRULE:FREQ=WEEKLY;COUNT=6 tells the calendar to generate six starts, counting that first one.

Alice invites Bob to the third meeting only. The app needs to describe something special about that occurrence without replacing the weekly rule. It adds another VEVENT with the same UID, the series identifier. This record is an override. Its RECURRENCE-ID is 20261116T090000Z, the start the rule originally assigned to the third meeting. That identifier continues to name the occurrence even if its actual start changes.

Bob receives that override, not Alice's whole series. His calendar therefore holds a different object: one occurrence with a recurrence identifier, but no master rule from which to generate the other five meetings.

Now Alice skips the third meeting. Her app excludes its start by adding EXDATE:20261116T090000Z to the master and removes the override from her stored object. COUNT remains six; the excluded occurrence is one of those six, so Alice's calendar now generates five meetings. Does Bob's copy simply disappear as well?

On the server shown, it does not. The server sends Bob an iTIP CANCEL, a scheduling message about the occurrence he was invited to. Delivering that message sets STATUS:CANCELLED on his existing VEVENT rather than deleting it. Alice's generated list has no meeting that week; Bob still has the third meeting's record, marked cancelled. The two calendars differ because they received different records and applied different changes to them.

Move the second meeting instead. Alice's object gains an override for that occurrence, but Bob was not invited to it. The update sent to Bob contains the meeting he attends, so his copy does not acquire the moved second meeting. A guest's calendar is not a complete replica of the organizer's stored series.

The storage rules allow this distinction. Related VEVENTs share one UID, with at most one master and overrides identified by RECURRENCE-ID. An override may be stored without its master, as in Bob's copy. The server also validates what it accepts: this implementation refuses a second master or a second RRULE with status 415. Generating occurrences, storing overrides and delivering scheduling messages are separate operations; understanding one does not by itself predict the other two.
