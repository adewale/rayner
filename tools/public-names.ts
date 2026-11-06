// node tools/public-names.ts [--write]
// Prints each public name with its reason to be public (used, tooling or taught) and the scenes and
// recipes that use it, then any problem with the ledger. --write renders the reference's engine features table and
// the skill's examples table from the ledger (test/public-names.test.ts fails when they differ).
import { writeFileSync, readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { ROOT, publicNames, problems, readLedger, reasonOf, rendered, usage, usersOf } from './lib/public-names.ts';

const ledger = readLedger();
const u = usage();
for (const [entry, names] of await publicNames()) {
  console.log(`\n${entry}`);
  for (const name of names) {
    const who = usersOf(u, name, entry);
    console.log(`  ${name.padEnd(26)} ${reasonOf(ledger, u, entry, name).padEnd(8)} ${who.length ? who.join(' ') : ''}`);
  }
}
if (process.argv.includes('--write'))
  for (const [file, text] of rendered(ledger, ROOT, u))
    if (readFileSync(file, 'utf8') !== text) { writeFileSync(file, text); console.log(`\nwrote ${relative(ROOT, file)}`); }
const found = await problems(ledger, ROOT, u);
if (found.length) {
  console.log(`\n${found.length} problem${found.length > 1 ? 's' : ''}:\n${found.map((p) => `  ${p}`).join('\n')}`);
  process.exitCode = 1;
}
