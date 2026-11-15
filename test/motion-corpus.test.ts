// The keyed motion check's recall on real motion defects: the corpus (test/fixtures/motion-corpus/
// corpus.ts) brings back, one at a time, fixes that filming the Poppy series made after every check
// had passed (issue #101, item 14), as edits to the current Poppy scenes. Each variant is built in a
// copy of the Poppy folders under out/ and checked in a process of its own (tools/repo/motion-corpus.ts),
// playing the transitions of the entry's own events from every reachable state, with every play of
// the run. docs/TESTING.md, "Motion defect corpus", holds the recall table and how it was measured.
//
// By default a sample runs, one entry per rule that catches any; FULL=1 (npm run test:full, CI's
// check job) runs every entry and holds the check to the recall measured: an entry caught then must
// still be caught. Recall may rise; when it does, add the entry to CAUGHT.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CORPUS } from './fixtures/motion-corpus/corpus.ts';
import { applyEdits } from '../tools/repo/motion-corpus-lib.ts';
import { recall, runCorpus } from '../tools/repo/motion-corpus.ts';
import { ROOT } from '../tools/lib/roots.ts';

/** The entries the check catches, as measured (docs/TESTING.md, "Motion defect corpus"). */
const CAUGHT: readonly string[] = [];
/** One entry per rule that catches any, from the quicker chapters: the default run. */
const SAMPLE: readonly string[] = [];

test('every corpus entry still applies to the current Poppy scenes, and names its events', async () => {
  const files = new Map<string, string>();
  for (const e of CORPUS) {
    for (const edit of e.edits) {
      if (!files.has(edit.file)) files.set(edit.file, await readFile(join(ROOT, 'scenes/explainers', edit.file), 'utf8'));
    }
    const byFile = new Map<string, typeof e.edits[number][]>();
    for (const edit of e.edits) byFile.set(edit.file, [...(byFile.get(edit.file) ?? []), edit]);
    // Each edit's text is in the scene exactly once, and changes it.
    for (const [file, edits] of byFile) assert.notEqual(applyEdits(files.get(file)!, edits, `${e.id}, ${file}`), files.get(file), e.id);
  }
  assert.equal(new Set(CORPUS.map((e) => e.id)).size, CORPUS.length, 'corpus ids are unique');
  for (const id of [...CAUGHT, ...SAMPLE]) assert.ok(CORPUS.some((e) => e.id === id), `${id} is a corpus entry`);
});

test('a sample of the corpus: one defect per rule that catches any is caught', async () => {
  const entries = CORPUS.filter((e) => SAMPLE.includes(e.id));
  // The catalog's gate keeps the scenes as they are free of findings, so no baseline is run here.
  const { results } = await runCorpus(entries, { bases: false });
  for (const r of results) {
    assert.equal(r.error, undefined, `${r.id}: ${r.error}`);
    assert.ok(r.caught, `${r.id} is no longer caught`);
  }
});

test('the whole corpus: every defect caught when recall was measured is still caught', { skip: !process.env.FULL && 'set FULL=1 (npm run test:full): it checks every corpus entry, several minutes' }, async () => {
  const { results } = await runCorpus(CORPUS, { bases: false });
  for (const r of results) assert.equal(r.error, undefined, `${r.id}: ${r.error}`);
  const caught = results.filter((r) => r.caught).map((r) => r.id);
  assert.deepEqual(CAUGHT.filter((id) => !caught.includes(id)), [], 'entries no longer caught');
  const { caught: n, of } = recall(CORPUS, results);
  assert.ok(n >= CAUGHT.length, `recall fell: ${n} of ${of}, was ${CAUGHT.length}`);
});
