import { isRefusal } from '../../../explain/index.ts';
import { TABLE_EVENTS, next, start, STORY, bound } from './model.ts';
for (const desk of ['keeps looking', 'withdraws'] as const) {
  const seen = new Map<string, any>([[JSON.stringify(start(desk)), start(desk)]]);
  const q = [start(desk)];
  while (q.length) { const w = q.shift()!; for (const e of TABLE_EVENTS) { if (bound(w, e)) continue; const n = next(w, e); if (isRefusal(n)) continue; const k = JSON.stringify(n); if (!seen.has(k)) { seen.set(k, n); q.push(n); } } }
  const core = new Set([...seen.values()].map((w) => JSON.stringify({ ...w, said: null })));
  console.log(desk, seen.size, 'core', core.size);
}
let w: any = start();
for (const e of STORY) { const n = next(w, e); if (isRefusal(n)) { console.log('REFUSED', e, n.reason); break; } w = n; console.log(e, JSON.stringify(w)); }
{
  const seen = new Map<string, any>([[JSON.stringify(start()), start()]]);
  const q = [start()];
  while (q.length) { const w = q.shift()!; for (const e of TABLE_EVENTS) { if (bound(w, e)) continue; const n = next(w, e); if (isRefusal(n)) continue; const k = JSON.stringify(n); if (!seen.has(k)) { seen.set(k, n); q.push(n); } } }
  const by = new Map<string, number>();
  for (const w of seen.values()) { const k = `main:${w.main ? (w.main.closed ? 'closed' : 'open') : 'none'} direct:${w.direct ? (w.direct.closed ? 'closed' : 'open') : 'none'} inv:${w.invited}`; by.set(k, (by.get(k) ?? 0) + 1); }
  console.log([...by].sort().join('\n'));
  const said = new Map<string, number>(); for (const w of seen.values()) { const k = w.said ? w.said.speaker + ':' + w.said.line + '@' + w.said.at : 'null'; said.set(k, (said.get(k) ?? 0) + 1); }
  console.log([...said].sort().join('\n'));
}
