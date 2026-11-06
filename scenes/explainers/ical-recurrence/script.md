# Why can a cancelled meeting remain in a guest's calendar?

Alice cancels one meeting of her weekly stand-up. Her calendar shows a gap that week. Bob, who was invited to that one meeting, can still find it in his calendar, marked cancelled. Both calendars talk to the same server. Why do they disagree?

Start with how Alice's calendar stores the series. It shows six stand-ups but keeps one VEVENT, the iCalendar record for an event. DTSTART supplies the first start, Monday 2 November 2026 at 09:00 UTC. RRULE:FREQ=WEEKLY;COUNT=6 tells the calendar to generate six starts, counting that first one.

Alice invites Bob to the third meeting only. The app needs to record something special about that occurrence without replacing the weekly rule, so it adds another VEVENT with the same UID, the series identifier. This record is an override. Its RECURRENCE-ID is 20261116T090000Z, the start the rule originally gave the third meeting, and it keeps naming that occurrence even if the meeting moves.

Bob receives that override, not Alice's whole series. His calendar therefore holds a different object: one occurrence with a recurrence identifier, and no rule from which to generate the other five meetings.

Now Alice skips the third meeting. Her app excludes its start by adding EXDATE:20261116T090000Z to the master and removes the override from her stored object. COUNT stays at six, and the excluded start is one of those six, so Alice's calendar now shows five meetings, still ending on 7 December. What should happen to Bob's copy?

On the server shown, Baïkal, it stays. The server sends Bob an iTIP CANCEL, the scheduling message that calls a meeting off, and delivering it sets STATUS:CANCELLED on his VEVENT rather than deleting it. Alice could remove the meeting by excluding its start from her rule. Bob has no rule; he has only the occurrence he was sent, and the cancellation is applied to that.

Lay the two stored objects side by side and line their calendars up against the six weeks of Alice's rule. Alice's row has five meetings and a gap in the third week, where her own EXDATE takes the start out. Bob's row has one meeting, 16 November, marked cancelled, and five empty weeks. Nothing excluded those five: his copy holds no master and no RRULE, so nothing ever generated them.

Move the second meeting instead. Alice's object gains an override for that occurrence, but Bob was not invited to it. The update sent to Bob contains only the meeting he attends, so his copy never learns of the move. A guest's calendar is not a replica of the organiser's series: it holds the occurrences it was sent, changed by the messages that follow.

The storage rules allow this. Related VEVENTs share one UID, with at most one master and any number of overrides named by RECURRENCE-ID, and an override may be stored without its master, as Bob's is. Baïkal also refuses some objects the standard only discourages: a second master, or a second RRULE in one VEVENT, gets status 415.

This account is one server's behaviour, sabre/dav 4.7.0 inside Baïkal, for a six-week series in UTC. Time zones, daylight-saving changes and other calendar apps are outside it, and an app may choose to hide cancelled meetings even though the stored copy keeps them.
