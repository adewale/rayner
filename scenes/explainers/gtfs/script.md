# Why does a route have no departures today?

A route can be listed in a transit feed and still have no bus to catch today. Google's sample GTFS feed, the CSV files a transit agency hands to trip planners, describes an invented Demo Transit Authority with five bus routes and eleven trips. On Sunday 3 June 2007 all eleven trips run. On Monday 4 June none does. Nothing in routes.txt changed overnight. What did?

A route names a service, such as the airport bus, but holds no times. Its trips do: each row of trips.txt is one journey, names its route, and names a service_id. Trip AB1 belongs to route 10 and leaves the airport at 8:00; its service_id, FULLW, names the calendar that decides on which dates it runs. So a route has departures only on dates its trips' service runs.

The calendar has two layers. calendar.txt gives each service a weekday pattern over a date range; calendar_dates.txt adds or removes one date. FULLW's weekly row includes Monday, but the row FULLW,20070604,2 removes it on 4 June. The other service, WE, runs only on Saturdays and Sundays. With neither service running, none of the eleven trips runs, and all five routes are still listed.

Lay the week out as a grid, one row per service and one column per date from Sunday 3 to Saturday 9 June. FULLW fills every cell of its row except Monday's, which the exception row empties. WE fills Sunday and Saturday. Monday's column is the one with nothing in it, and the count under it is 0, between 11 on Sunday and 7 on Tuesday. routes.txt and trips.txt do not change from one column to the next; the empty column comes from the service cells.

The exception edits a calendar that seven trips share. It does not delete a route, a stop or a time. One row stops every journey under FULLW for that date, and for no other.

A running trip still has to serve the stop a rider asks about. stop_times.txt gives each trip its stops in order, with times. A departure is a row at the stop that is not the trip's last, because nobody boards a bus at the stop where it ends. Some trips are also listed in frequencies.txt, which says they repeat at a fixed gap between two times; for those the useful answer is the gap between vehicles, not a list of times.

Changing the date separates the two calendars. On Tuesday 5 June FULLW runs and the airport has one departure, AB1 at 8:00. On Saturday 9 June both services run and route 50's weekend trips join it. Changing the stop changes which of those trips a rider can board: at Stagecoach, the trips that start there run on headways, so the page gives gaps rather than times.

The page reads the sample feed and the GTFS Schedule reference; its counts agree with gtfs-kit's for the same files. It does not cover realtime delays or cancellations, transfers or journey planning. A route's existence promises nothing about a date: the answer is in the service calendar and in the stop times of the trips that run.
