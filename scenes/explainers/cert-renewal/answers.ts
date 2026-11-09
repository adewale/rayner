// The answers to the script's reader questions, computed from the model: rayner check holds script.md's to these.
import { DAY, LIFETIMES, RUN_EVERY, YEAR, dueAt, dueByInterval, issue, simulate, summarize } from './model.ts';

const days = (hours: number) => +(hours / DAY).toFixed(1);
const twenty = 20 * DAY,
  year = (r: Parameters<typeof simulate>[0]) => simulate(r, twenty, YEAR),
  c20 = issue(0, twenty),
  shortLived = summarize('fixed30', '160h');
const c45 = issue(0, LIFETIMES['45d'].hours),
  interval = 10 * DAY;
let tenDay = RUN_EVERY;
while (!dueByInterval(c45.notAfter, tenDay, interval)) tenDay += RUN_EVERY;
let tenDayRetries = 0;
for (let at = tenDay; at < c45.notAfter; at += RUN_EVERY) tenDayRetries++;
const CHECK = {
  twenty: {
    fixed: { renewals: year('fixed30').issued.length - 1, refused: year('fixed30').refused.length, first: year('fixed30').refused[0] },
    share: { due: dueAt('fraction', c20) - c20.notBefore, renewals: year('fraction').issued.length - 1 },
    sameAsShort: year('fixed30').issued.length - 1 === shortLived.renewalsPerYear && year('fixed30').refused.length === shortLived.refusedPerYear,
  },
  tenDay: { at: tenDay, retries: tenDayRetries, fraction: summarize('fraction', '45d') },
};

export const questions = {
  1: () =>
    `With the 30-day setting, ${CHECK.twenty.fixed.renewals} renewed and ${CHECK.twenty.fixed.refused} runs refused, the first at hour ${CHECK.twenty.fixed.first}${CHECK.twenty.sameAsShort ? ', exactly as for 160-hour certificates' : ''}: any certificate shorter than 30 days is due from issue, so every run asks until the limit refuses. The default renews two thirds of the way through, since 20 days is not under ten: at day ${days(CHECK.twenty.share.due)}, ${CHECK.twenty.share.renewals} times a year.`,
  2: () =>
    `At day ${days(CHECK.tenDay.at)}, the first twice-daily run within 10 days of expiry, leaving ${CHECK.tenDay.retries} runs to retry. The setting replaces the default rather than adding to it: without it Certbot would renew at day ${days(CHECK.tenDay.fraction.due)} with ${CHECK.tenDay.fraction.retries} runs to spare.`,
};
