# Why does a route have no departures today?

A route can be listed in a transit feed and still have no bus to catch today. In Google’s sample feed, all eleven trips run on Sunday 3 June 2007. The next day their bars turn grey. The five routes have not disappeared. What changed?

A route identifies a service such as the airport bus, but it does not supply a dated departure by itself. Its trips describe particular journeys. Trip AB1 belongs to route 10 and leaves the airport at 8:00; its service_id, FULLW, names the calendar that decides on which dates that journey runs.

The calendar has two layers. calendar.txt supplies a weekday pattern over a date range. calendar_dates.txt can add or remove one date from that pattern. FULLW’s weekly row includes Monday, but the exception FULLW,20070604,2 removes Monday 4 June. The other service, WE, does not run on Mondays. With neither service active, none of their trips runs.

The exception changes the calendar shared by several trips. It does not have to delete routes, remove stop records or edit each journey’s times. That is why one row can turn a full day’s chart grey while the route list remains intact.

An active trip still needs to serve the stop you are asking about. stop_times.txt links each trip to its ordered stops and their times. In this example the last stop is an arrival rather than another departure. Some trips also use frequencies.txt to describe repeated service at a headway, so the useful stop-level answer is an interval between vehicles rather than one isolated time.

Changing the date separates the two calendars: FULLW runs on Tuesday, while the weekend service returns on Saturday. Changing the stop changes which of those active trips can be boarded. A departure therefore requires both an active service date and a relevant stop on one of its trips; the existence of a route establishes neither on its own.
