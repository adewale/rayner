import { isRefusal } from '../../../explain/index.ts';
import { TABLE_EVENTS, next, start, bound, activeOf } from './model.ts';
const working = (w: any) => { const a = activeOf(w); if (!a) return false; const c = a === 'main' ? w.main : w.direct; return c.working; };
const variants: Record<string, (w: any, e: string) => boolean> = {
  all: () => true,
  waitReply: (w, e) => !((e === 'ask' || e === 'you') && working(w)),
  waitReplyNoNobody: (w, e) => e !== 'nobody' && !((e === 'ask' || e === 'you') && working(w)),
};
for (const [name, ok] of Object.entries(variants)) {
  const seen = new Map<string, any>([[JSON.stringify(start()), start()]]); const q = [start()];
  while (q.length) { const w = q.shift()!; for (const e of TABLE_EVENTS) { if (!ok(w, e) || bound(w, e)) continue; const n = next(w, e); if (isRefusal(n)) continue; const k = JSON.stringify(n); if (!seen.has(k)) { seen.set(k, n); q.push(n); } } }
  console.log(name, seen.size);
}
