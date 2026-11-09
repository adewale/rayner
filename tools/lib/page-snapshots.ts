import type {SnapshotStore} from '../../explain/diagram-snapshot.ts';
import type {PathSnapshotPayload} from '../../app/embed-snapshot-codec.ts';

/** The renderer admits path coordinates through Float32Array. Keep a short
 * decimal that reproduces that exact value, without rounding layout/text metadata.
 * Checked-in snapshots and their hashes remain untouched.
 */
export function pageSnapshots(store: SnapshotStore): SnapshotStore {
  const copy = structuredClone(store);
  const cache = new Map<number, number>();
  const point = (value: number) => {
    const cached = cache.get(value);
    if (cached !== undefined) return cached;
    // JSON normalizes literal -0 to +0. Negative nonzero doubles can underflow
    // to float32 -0; retain a nonzero negative decimal for that distinct case.
    const target = Math.fround(value === 0 ? 0 : value);
    if (Object.is(target, -0)) { cache.set(value, -1e-46); return -1e-46; }
    for (let digits = 1; digits <= 9; digits++) {
      const candidate = Number(target.toPrecision(digits));
      if (Object.is(Math.fround(candidate), target)) { cache.set(value, candidate); return candidate; }
    }
    return target;
  };
  for (const snapshot of Object.values(copy)) for (const part of snapshot.parts) for (const shape of part.shapes)
    shape.subpaths = shape.subpaths.map(path => path.map(point));
  return copy;
}

/** Intern only sufficiently long, repeated path arrays; retain all other data. */
export function packPageSnapshots(store: SnapshotStore): PathSnapshotPayload {
  const counts = new Map<string, {count: number; path: number[]; index?: number}>();
  for (const snapshot of Object.values(store)) for (const part of snapshot.parts) for (const shape of part.shapes) for (const path of shape.subpaths) {
    const key = JSON.stringify(path);
    if (key.length <= 32) continue;
    const found = counts.get(key);
    if (found) found.count++;
    else counts.set(key, {count: 1, path});
  }
  const paths: number[][] = [];
  for (const entry of counts.values()) if (entry.count >= 2) {
    entry.index = paths.length;
    paths.push(entry.path.slice());
  }
  const packed: PathSnapshotPayload['store'] = structuredClone(store);
  for (const snapshot of Object.values(packed)) for (const part of snapshot.parts) for (const shape of part.shapes)
    shape.subpaths = shape.subpaths.map(path => counts.get(JSON.stringify(path))?.index ?? path);
  return {format: 'rayner-paths-v1', paths, store: packed};
}
