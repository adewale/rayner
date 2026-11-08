import type {SnapshotStore, DiagramSnapshot, SnapshotPart, SnapshotShape} from '../integrations/agentic-mermaid/snapshot.ts';

export type PackedShape = Omit<SnapshotShape, 'subpaths'> & {subpaths: (number[] | number)[]};
type PackedPart = Omit<SnapshotPart, 'shapes'> & {shapes: PackedShape[]};
type PackedSnapshot = Omit<DiagramSnapshot, 'parts'> & {parts: PackedPart[]};
export interface PathSnapshotPayload {
  format: 'rayner-paths-v1';
  paths: number[][];
  store: Record<string, PackedSnapshot>;
}

const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const path = (v: unknown): v is number[] => Array.isArray(v) && Array.from(v).every(n => typeof n === 'number' && Number.isFinite(n));
const invalid = () => new Error('decodeSnapshotPayload(): the packed diagram snapshots do not match the rayner-paths-v1 format; build the page again');

/** Expand only shape.subpaths references. Other numbers and metadata are untouched. */
export function decodeSnapshotPayload(value: unknown): SnapshotStore {
  if (!record(value) || !Object.hasOwn(value, 'format') || typeof value.format !== 'string') return value as SnapshotStore;
  if (value.format !== 'rayner-paths-v1' || !Object.hasOwn(value, 'paths') || !Object.hasOwn(value, 'store') || !Array.isArray(value.paths) || !Array.from(value.paths).every(path) || !record(value.store)) throw invalid();
  const table = value.paths as number[][];
  const store = structuredClone(value.store);
  for (const snapshot of Object.values(store)) {
    if (!record(snapshot) || !Array.isArray(snapshot.parts)) throw invalid();
    for (const part of snapshot.parts) {
      if (!record(part) || !Array.isArray(part.shapes)) throw invalid();
      for (const shape of part.shapes) {
        if (!record(shape) || !Array.isArray(shape.subpaths)) throw invalid();
        shape.subpaths = Array.from(shape.subpaths, (entry: unknown) => {
          if (typeof entry === 'number') {
            if (!Number.isSafeInteger(entry) || entry < 0 || entry >= table.length) throw invalid();
            return table[entry]!.slice();
          }
          if (!path(entry)) throw invalid();
          return entry.slice();
        });
      }
    }
  }
  return store as SnapshotStore;
}
