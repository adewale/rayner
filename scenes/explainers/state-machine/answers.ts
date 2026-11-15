// The answers to the script's answer and reader questions, computed from the model: rayner check holds script.md's to these.
import { RESULT, socketReplay } from './model.ts';

const early = socketReplay(['send()']), late = socketReplay(['server accepts', 'close()', 'send()']);
const twice = socketReplay(['server accepts', 'close()', 'close()']);
const caught = socketReplay(['send()', 'server accepts']);

export const answer = () =>
  `send() sends only in ${socketReplay(['server accepts', 'send()']).ready}: before open it ${early.result}, and after close() it ${late.result === RESULT.quiet ? 'quietly sends nothing' : late.result}`;

export const questions = {
  1: () =>
    `${twice.result === RESULT.nothing ? 'Nothing' : twice.result}: the first close() made readyState ${twice.ready}, and close() does nothing in CLOSING or CLOSED. It does not throw, and the socket stays ${twice.ready}.`,
  2: () =>
    `${caught.delivered === 0 ? 'No' : 'Yes'}. The throw means send() did nothing: no message waits for later, so once open fires the server has received ${caught.delivered} messages until you call send() again.`,
};
