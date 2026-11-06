// node tools/docs-code.ts [--write]
// Lists each code block in the README and the tutorial that prints a tutorial file, and whether it
// matches the file; --write rewrites the blocks from the files (test/explain-tutorial.test.ts fails when they differ).
import { DOCS, docBlocks, writeDocBlocks } from './lib/docs-code.ts';
import { ROOT } from './lib/explain-project.ts';

const write = process.argv.includes('--write');
let stale = 0;
for (const doc of DOCS) {
  if (write && writeDocBlocks(ROOT, doc)) console.log(`rewrote ${doc}`);
  for (const b of docBlocks(ROOT, doc)) {
    const same = b.shown === b.source;
    if (!same) stale++;
    console.log(`${same ? 'ok   ' : 'stale'} ${doc}: ${b.file}`);
  }
}
if (stale) { console.log(`${stale} stale; run node tools/docs-code.ts --write`); process.exitCode = 1; }
