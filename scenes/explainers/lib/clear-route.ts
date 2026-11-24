import {VMobject} from '../../../src/index.ts';
import type {Box, Mobject, Vec} from '../../../src/index.ts';

/** A carrier's orthogonal path, reserving its complete footprint.
 * The chapter chooses the protected subjects and meaningful ports. An impossible
 * port is refused rather than silently moving it or crossing its lettering. */
export function clearRoute(from: Vec, to: Vec, carrier: Mobject, subjects: readonly Mobject[], frame: Box): Vec[] {
  if (![...from, ...to, ...frame].every(Number.isFinite) || frame[0] >= frame[2] || frame[1] >= frame[3])
    throw new RangeError('Route ports and frame must be finite, with a nonempty frame');
  const stroke = (part: Mobject) => Math.max(0, ...part.family().filter(m => m instanceof VMobject && m.hasPoints()).map(m =>
    m.style.stroke === 'none' || (m.style.strokeOpacity ?? 1) <= 0 ? 0 : m.style.strokeWidth * Math.max(
      m.style.lineJoin === 'miter' || m.style.lineJoin === undefined ? Math.max(1, m.style.miterLimit ?? 4) : 1,
      m.style.lineCap === 'square' ? Math.SQRT2 : 1) / 2));
  const padding = 0.06, hw = carrier.width() / 2 + stroke(carrier), hh = carrier.height() / 2 + stroke(carrier);
  if (![hw,hh].every(Number.isFinite) || hw <= 0 || hh <= 0)
    throw new RangeError('A route requires a finite carrier footprint');
  const area: Box = [frame[0] + hw + padding, frame[1] + hh + padding, frame[2] - hw - padding, frame[3] - hh - padding];
  const obstacles = subjects.flatMap(subject => {
    const b = subject.box();
    if (!b) return [];
    if (!b.every(Number.isFinite)) throw new RangeError('Protected route ink must have finite bounds');
    const extra = stroke(subject) + padding;
    return [[b[0] - hw - extra, b[1] - hh - extra, b[2] + hw + extra, b[3] + hh + extra] as Box];
  });
  const inside = ([x, y]: Vec) => x >= area[0] && x <= area[2] && y >= area[1] && y <= area[3] &&
    !obstacles.some(b => x > b[0] && x < b[2] && y > b[1] && y < b[3]);
  if (!inside(from) || !inside(to)) throw new RangeError('The declared route port cannot contain this carrier without crossing protected ink');
  const xs = [...new Set([from[0], to[0], area[0], area[2], ...obstacles.flatMap(b => [b[0], b[2]])])].filter(x => x >= area[0] && x <= area[2]).sort((a,b) => a-b);
  const ys = [...new Set([from[1], to[1], area[1], area[3], ...obstacles.flatMap(b => [b[1], b[3]])])].filter(y => y >= area[1] && y <= area[3]).sort((a,b) => a-b);
  const points = ys.flatMap(y => xs.map(x => [x,y] as Vec));
  const clear = (a: Vec, b: Vec) => !obstacles.some(o => a[0] === b[0]
    ? a[0] > o[0] && a[0] < o[2] && Math.max(a[1], b[1]) > o[1] && Math.min(a[1], b[1]) < o[3]
    : a[1] > o[1] && a[1] < o[3] && Math.max(a[0], b[0]) > o[0] && Math.min(a[0], b[0]) < o[2]);
  const start = ys.indexOf(from[1]) * xs.length + xs.indexOf(from[0]), end = ys.indexOf(to[1]) * xs.length + xs.indexOf(to[0]);
  const distances = points.map(() => Infinity), previous = points.map(() => -1);
  const queue: {index:number; distance:number}[] = [{index:start, distance:0}];
  distances[start] = 0;
  while (queue.length) {
    const item = queue.shift()!, at = item.index;
    if (item.distance !== distances[at]) continue;
    if (at === end) {
      const path: Vec[] = [];
      for (let n = end; n >= 0; n = previous[n]!) path.push(points[n]!);
      path.reverse();
      return path.filter((p, i) => !i || i === path.length-1 ||
        (path[i-1]![0] !== p[0] || p[0] !== path[i+1]![0]) && (path[i-1]![1] !== p[1] || p[1] !== path[i+1]![1]));
    }
    const column = at % xs.length, row = Math.floor(at / xs.length);
    const neighbours = [column > 0 ? at-1 : -1, column+1 < xs.length ? at+1 : -1, row > 0 ? at-xs.length : -1, row+1 < ys.length ? at+xs.length : -1];
    for (const next of neighbours) {
      if (next < 0 || !inside(points[next]!) || !clear(points[at]!, points[next]!)) continue;
      const distance = item.distance + Math.abs(points[at]![0]-points[next]![0]) + Math.abs(points[at]![1]-points[next]![1]);
      if (distance >= distances[next]!) continue;
      distances[next] = distance; previous[next] = at;
      let low = 0, high = queue.length;
      while (low < high) {const mid = (low+high) >>> 1; if (queue[mid]!.distance < distance) low = mid+1; else high = mid;}
      queue.splice(low, 0, {index:next, distance});
    }
  }
  throw new RangeError('No route reserves the full carrier footprint between the declared ports');
}
