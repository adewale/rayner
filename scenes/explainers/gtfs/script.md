# Script: why does a GTFS route have no departures today?

Questions the reader brings: My trip planner shows a route but no departures today. Is the feed broken? Which file decides whether a bus runs on a date?

Start from a day that works. Google's sample GTFS feed, for an invented Demo Transit Authority with five bus routes, runs all 11 of its trips on Sunday 3 June 2007: one bar per trip on a chart of the day, grouped under its service_id, the feed's name for the timetable a trip follows (FULLW or WE). Ask the reader what the next day will look like.

Monday 4 June: every bar goes grey. All five routes are still in routes.txt, yet none of the 11 trips runs, so a rider gets no departures. Why?

Follow one trip. AB1 is route 10's 8:00 trip from the airport to Bullfrog. routes.txt says nothing about when route 10 runs; the times belong to its trips, and AB1's row in trips.txt names, besides its route, its service_id, FULLW. That ID points into two tables: calendar.txt sets weekdays between two dates, and calendar_dates.txt adds or removes single dates. So a route has departures only on dates its trips' service runs.

Now evaluate 4 June. FULLW's calendar row has 1 under every weekday, but calendar_dates.txt has FULLW,20070604,2: exception_type 2 removes the service for that date, overriding the weekly pattern. WE has 0 under monday. No service runs, so no trip runs.

Last, what that means at a stop. stop_times.txt joins trips to stops, one row per stop a trip makes, and frequencies.txt repeats some trips on a headway. A departure is a stop_times row at the stop that is not its trip's last. On 4 June nothing leaves Nye County Airport; the card shows what calendar.txt alone would have sent, AB1 at 8:00, marked removed. The settings move the date (Tue 5 June: FULLW only; Sat 9 June: both, and route 50 appears) and the stop (Stagecoach: two trips on headways, so gaps rather than times).

**The aha:** the morph from the Sunday chart to the Monday chart, where every bar turns grey at once, answered by the one highlighted row of calendar_dates.txt.

**Sentence to remember:** a route has departures only on dates its trips' service runs, and one row of calendar_dates.txt can switch a whole service off for a day.

**Check questions**, in `meta.checks`, asked after the last step:

1. calendar.txt says FULLW runs every day of the week. Why does no trip run on Monday 4 June 2007?
2. Why do the four route 50 trips run on Saturday 9 June but not on Tuesday 5 June?
3. If calendar_dates.txt also had the row FULLW,20070605,2, what would Tuesday 5 June look like? (A transfer: no case shows it.)

| Step | Script | Reader predicts |
| --- | --- | --- |
| day-before | paragraph 1: the chart of a day that works | which bars run the next day |
| day | paragraph 2: every bar grey, routes still listed | why none runs |
| route-trip | paragraph 3: AB1's route and trip, on the ER diagram | |
| service | paragraph 3: service_id's two tables, and the answer | what could remove one date |
| evaluate | paragraph 4: the rows that decide 4 June | |
| trip-stops | paragraph 5: stop_times and frequencies | |
| departures | paragraph 5: what leaves the chosen stop | |
