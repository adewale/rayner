# Why does a GTFS route have no departures today?

- **Reader:** someone who uses or builds trip planners and has seen a transit feed's CSV files, or can read a table; knows a route is "the airport bus" but not how a feed says when it runs.
- **Answer:** A route has departures only on dates its trips’ service runs
- **Changed condition:** the date. On Monday 4 June 2007 an exception row removes FULLW and nothing runs; on Tuesday 5 June FULLW runs; on Saturday 9 June both services run and route 50's weekend trips join. The stop changes which running trips a rider can board: the airport has timed departures, while at Stagecoach the trips that start there run on headways, so the page gives gaps rather than times.
- **Reader's own work:** predict which bars still run the next day, what decides which trips run, and which rows decide the date; choose the date and the stop; the check questions ask the reader to edit the feed with one calendar_dates.txt row.
- **Checked against:** the GTFS Schedule reference at google/transit commit 3c9e7b9 (each rule cited by line in `model.ts`) and Google's sample feed, vendored byte for byte in `sample-feed-1/` (compared in `model.test.ts`); the services, trip counts and stop timetables for each day of the week of 4 June agree with gtfs-kit 13.0.1, run once on the vendored files and recorded in that test. `answers.ts` computes the check answers from the model.
- **Grounding:** recorded: the GTFS reference at commit 3c9e7b9, Google’s sample feed and gtfs-kit 13.0.1
- **Leaves out:** realtime delays and cancellations, transfers and journey planning. It covers these sample calendars, trips, stop times and frequencies only. The June 2007 dates belong to the sample feed, not a current timetable. Whether a frequency trip's vehicle leaves at end_time, which the reference does not say, so the page gives headways, not a vehicle count.

## Check yourself

1. Route 50’s four trips run only at weekends. Which one row, in which file, would make them run on Monday 4 June 2007 as well?
   calendar_dates.txt: WE,20070604,1. exception_type 1 adds service WE on that date, so AAMV1, AAMV2, AAMV3 and AAMV4 run, 4 of the 11 trips; routes.txt, trips.txt and stop_times.txt stay as they are.
2. To cancel route 50 on Saturday 9 June 2007 only, why not delete its row from routes.txt, and what row would do it instead?
   Deleting the route would remove it from every date and leave four trips whose route_id names nothing. The row WE,20070609,2 in calendar_dates.txt removes WE on that one date: 7 of the 11 trips still run, and the next Saturday keeps all 11.
3. If calendar_dates.txt also had the row FULLW,20070605,2, what would Tuesday 5 June look like?
   Like Monday: FULLW would be removed for the day and WE does not run on Tuesdays, so none of the 11 trips would run, though all 5 routes stay in routes.txt.

## Why this explainer

A route can be listed in a feed and still have no bus to catch today, and nothing in routes.txt explains why. The sample feed makes that concrete for free: on Sunday 3 June 2007 all eleven trips run, and on Monday 4 June none does, because one calendar_dates.txt row, FULLW,20070604,2, removes the service seven trips share and WE runs only at weekends. The reader should leave knowing that a route holds no times, trips do, and a trip's service_id names the calendar that decides its dates; one exception row edits that calendar for one date without deleting a route, a stop or a time.

The opening compares the selected date with the day before, so the Sunday-to-Monday contrast belongs to the default scenario; the other dates show the two calendar layers separately. The week grid is the aha: Monday's column is the only empty one, between 11 on Sunday and 7 on Tuesday, while routes.txt and trips.txt are the same in every column.

The two stops are chosen to expose different results: fixed departures at the airport, frequency-based service at Stagecoach. A departure is a stop_times row at the stop that is not the trip's last, because nobody boards where a bus ends.

The check answers were computed by the model on the sample feed with one more calendar_dates.txt row (`readFeed` and `tripsOn` in `model.ts`); if the feed or the model changes, recompute them.
