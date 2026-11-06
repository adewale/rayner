// node test/lib/capture-lettering.ts <scene.lettering.json>
// Captures the scene beside it as `rayner snapshots --refresh` would (diagrams too, since a natural
// diagram's labels are lettering runs), writes nothing, and prints which top-level fields and runs
// differ from the committed file as JSON. A process per snapshot, as the CLI runs: the capture
// caches of several scenes in one process outgrow a CI runner's memory.
import { readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { collectProject } from '../../tools/lib/explain-project.ts';
import { unpackLettering } from '../../src/lettering-outlines.ts';

const file = process.argv[2]!;
const fresh = JSON.parse(JSON.stringify((await collectProject(dirname(file), { refresh: true, write: false })).outlineLettering ?? null));
const stored = JSON.parse(JSON.stringify(unpackLettering(JSON.parse(await readFile(file, 'utf8')))));
const differs: string[] = [];
const keys = (a: unknown, b: unknown) => [...new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})])];
for (const field of keys(fresh, stored))
  if (JSON.stringify(fresh?.[field]) !== JSON.stringify(stored[field])) {
    if (field !== 'runs') differs.push(field);
    else for (const run of keys(fresh?.runs, stored.runs))
      if (JSON.stringify(fresh?.runs?.[run]) !== JSON.stringify(stored.runs[run])) differs.push(`run ${run}${fresh?.runs?.[run] ? '' : ' (no longer drawn)'}${stored.runs[run] ? '' : ' (not stored)'}`);
  }
console.log(JSON.stringify(differs));
