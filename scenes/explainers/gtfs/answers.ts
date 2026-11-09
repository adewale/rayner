// The answers to the script's reader questions, computed from the model: rayner check holds script.md's to these.
import { listed } from '../lib/format.ts';
import { SAMPLE_FEED } from './feed.ts';
import { readFeed, tripsOn } from './model.ts';

const FEED = readFeed(SAMPLE_FEED);
const plus = (row: string) => readFeed({ ...SAMPLE_FEED, 'calendar_dates.txt': SAMPLE_FEED['calendar_dates.txt'] + '\n' + row });
const ADD_WE = 'WE,20070604,1',
  CUT_WE = 'WE,20070609,2',
  ADDED = tripsOn(plus(ADD_WE), '20070604').map((trip) => trip.trip_id!),
  CUT_DAY = tripsOn(plus(CUT_WE), '20070609').length,
  CUT_NEXT = tripsOn(plus(CUT_WE), '20070616').length,
  TUESDAY = tripsOn(plus('FULLW,20070605,2'), '20070605').length;

export const questions = {
  1: () =>
    `calendar_dates.txt: ${ADD_WE}. exception_type 1 adds service WE on that date, so ${listed(ADDED)} run, ${ADDED.length} of the ${FEED.trips.length} trips; routes.txt, trips.txt and stop_times.txt stay as they are.`,
  2: () =>
    `Deleting the route would remove it from every date and leave four trips whose route_id names nothing. The row ${CUT_WE} in calendar_dates.txt removes WE on that one date: ${CUT_DAY} of the ${FEED.trips.length} trips still run, and the next Saturday keeps all ${CUT_NEXT}.`,
  3: () =>
    `Like Monday: FULLW would be removed for the day and WE does not run on Tuesdays, so ${TUESDAY ? `${TUESDAY} trips would run` : `none of the ${FEED.trips.length} trips would run`}, though all ${FEED.routes.length} routes stay in routes.txt.`,
};
