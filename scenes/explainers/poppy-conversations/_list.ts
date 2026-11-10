import { isRefusal } from '../../../explain/index.ts';
import { TABLE_EVENTS, next, start, bound } from './model.ts';
const c = (x: any) => x === null ? '-' : x === 'closed' ? 'X' : `${x.working ? 'W' : '.'}${x.handoff === 'pending' ? 'P' : '.'}${x.responder === 'human' ? 'H' : 'A'}${x.closed ? 'X' : ''}`;
const seen = new Map<string, any>([[JSON.stringify(start()), start()]]); const q = [start()];
while (q.length) { const w = q.shift()!; for (const e of TABLE_EVENTS) { if (bound(w, e)) continue; const n = next(w, e); if (isRefusal(n)) continue; const k = JSON.stringify(n); if (!seen.has(k)) { seen.set(k, n); q.push(n); } } }
const rows = [...seen.values()].map((w) => `${c(w.main)} ${c(w.direct)} ${w.invited ? 'I' : ' '} ${w.said ? w.said.speaker + ':' + w.said.line + '@' + w.said.at : ''}`).sort();
console.log(rows.join('\n'));
