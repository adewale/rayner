// The script's check answers, computed from the model: rayner check holds script.md's to these.
import { sessionAttempt } from './model.ts';

const SECOND_CONNECT = sessionAttempt('open', 'CONNECT');

export const checks = {
  1: () =>
    `It ${SECOND_CONNECT.error ? `throws ${SECOND_CONNECT.error} and the session stays open` : `returns ${SECOND_CONNECT.state}`}, because the table has no open:CONNECT row. An event name the machine knows is still refused in a state with no row for it.`,
};
