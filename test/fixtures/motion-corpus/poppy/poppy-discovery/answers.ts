// The answers to the script's reader questions, computed from the model: rayner check holds script.md's to these.
import { COMPANY } from '../poppy/model.ts';
import { GATE_NAME, GATES, SERVERS, companyOf, discover, isStop, userIdAt } from './model.ts';
import type { Discovered, Gate, Server, Stop } from './model.ts';

const stopped = (server: Server, skip?: Gate): Stop => {
  const { start, web, known } = SERVERS[server], d = discover(start, web, { known, ...(skip ? { skip } : {}) });
  if (!isStop(d)) throw new Error(`${server} was accepted`);
  return d;
};
const accepted = (server: Server, skip?: Gate): Discovered => {
  const { start, web, known } = SERVERS[server], d = discover(start, web, { known, ...(skip ? { skip } : {}) });
  if (isStop(d)) throw new Error(`${server} was refused at ${d.stopped}: ${d.reason}`);
  return d;
};
const check = (gate: Gate) => `the ${GATE_NAME[gate]} check`;
const cap = (s: string) => s[0]!.toUpperCase() + s.slice(1);

export const questions = {
  1: () => {
    const s = stopped('copy');
    return `${cap(check(s.stopped))}: ${s.reason}. A poppy.json speaks only for the host that served it.`;
  },
  2: () => {
    const s = stopped('claim'), without = accepted('claim', s.stopped);
    return `${cap(check(s.stopped))}: ${s.reason}. Without it, evil.example would be the same Company as example.com, and the agent would use User ID ${userIdAt(without.company)} and example.com’s tokens there.`;
  },
  3: () => {
    const s = stopped('upload'), without = accepted('upload', s.stopped);
    const others = GATES.filter((g) => g !== s.stopped && stopped('upload', g).stopped === s.stopped).length;
    return `The last URL is on ${without.host}, the uploaded file names ${without.domain}, and ${without.issuer} lists https://${without.domain}, so the other ${['no', 'one', 'two', 'three'][others]} checks pass. Only ${check(s.stopped)} refuses it: ${s.reason}.`;
  },
  4: () => {
    const s = stopped('outage');
    return `No. The agent stops at ${check(s.stopped)}: ${s.reason}. Falling back would make the Company ${companyOf(COMPANY.domain, null)} instead of ${COMPANY.issuer}, with new User IDs.`;
  },
  5: () => {
    const uk = accepted('uk'), com = accepted('shop');
    if (uk.company !== com.company) throw new Error('example.co.uk is another Company');
    return `${userIdAt(uk.company)}, the same as at example.com: the two domains share the issuer ${uk.issuer}, so they are one Company.`;
  },
};
