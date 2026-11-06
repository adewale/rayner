// The export rule (docs/ENGINE.md, "Public names") as a test. Every value each entry point exports
// needs a reason to be public: used (computed from the explainers, tutorial scenes and recipes that
// import it), tooling (it lives in rayner/output, rayner/testing or rayner/lettering) or taught (a
// guide section and a test, named in test/public-names.json, which must exist and mention it). The
// reference's engine features table and the skill's examples table are rendered from the same file.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { ROOT, problems, readLedger, rendered, usage } from '../tools/lib/public-names.ts';
import type { Ledger } from '../tools/lib/public-names.ts';

const u = usage();
const ledger = readLedger();
const copy = (): Ledger => structuredClone(ledger);

test('every public name of every entry point has a live reason to be public', async () => {
  assert.deepEqual(await problems(ledger, ROOT, u), []);
});

test('the engine features and examples tables are rendered from the ledger: run node tools/public-names.ts --write', () => {
  for (const [file, text] of rendered(ledger, ROOT, u))
    assert.equal(readFileSync(file, 'utf8'), text, `${relative(ROOT, file)} differs from what the ledger renders`);
});

test('the rule rejects a name with no reason, a broken guide or test, and an entry for a name no longer exported', async () => {
  const found = async (edit: (l: Ledger) => void) => {
    const l = copy();
    edit(l);
    return (await problems(l, ROOT, u)).join('\n');
  };
  assert.match(await found((l) => delete l.names['rayner']!['Frame']), /Frame \(rayner\) has no reason to be public: no explainer, tutorial scene or recipe uses it/);
  assert.match(await found((l) => (l.names['rayner']!['Gone'] = { check: 'Views: x' })), /Gone \(rayner\) is in test\/public-names\.json but rayner does not export it/);
  assert.match(await found((l) => (l.names['rayner']!['Brace'] = { guide: 'docs/EMPHASIS.md#no-such-section', test: 'test/emphasis.test.ts' })), /docs\/EMPHASIS\.md has no section #no-such-section/);
  assert.match(await found((l) => (l.names['rayner']!['Brace'] = { guide: 'docs/EMPHASIS.md#circumscribe', test: 'test/emphasis.test.ts' })), /docs\/EMPHASIS\.md#circumscribe does not mention it/);
  assert.match(await found((l) => (l.names['rayner']!['Brace'] = { guide: 'docs/EMPHASIS.md#the-shapes', test: 'test/no-such.test.ts' })), /its test test\/no-such\.test\.ts does not exist/);
  assert.match(await found((l) => (l.names['rayner']!['Brace'] = { guide: 'docs/EMPHASIS.md#the-shapes', test: 'test/diff.test.ts' })), /test\/diff\.test\.ts does not mention it/);
  assert.match(await found((l) => (l.names['rayner']!['Brace'] = { guide: 'docs/EMPHASIS.md#the-shapes' })), /Brace \(rayner\): a name is taught by a guide section and a test, both/);
  assert.match(await found((l) => ((l.names['rayner']!['Scene'] = {} as Record<string, unknown>)['users'] = ['fork'])), /Scene \(rayner\): users is not part of a ledger entry/);
});

test('the tables cannot claim what their scenes do not do', async () => {
  const found = async (edit: (l: Ledger) => void) => {
    const l = copy();
    edit(l);
    return (await problems(l, ROOT, u)).join('\n');
  };
  const row = ledger.examples.findIndex((r) => r.scenes.includes('mr-cache'));
  assert.ok(row >= 0);
  assert.match(await found((l) => l.examples[row]!.names.push('Brace')), /none of mr-cache uses Brace/);
  assert.match(await found((l) => (l.examples[row]!.shows += ', `NumberLine`')), /it names NumberLine but does not list it in names/);
  assert.match(await found((l) => l.examples[row]!.scenes.push('no-such-scene')), /no-such-scene is not a scene/);
  assert.match(await found((l) => (l.examples[row]!.patterns = { 's.sketch': '\\bs\\.sketch\\(' })), /none of mr-cache shows s\.sketch/);
  // A feature row's "used by" is computed, so a scene that stops using a name drops out of it.
  const before = rendered(ledger, ROOT, u), after = rendered(ledger, ROOT, { ...u, names: new Map([...u.names].map(([e, m]) => [e, new Map([...m].map(([n, s]) => [n, new Set([...s].filter((x) => x !== 'mr-cache'))]))])), code: new Map([...u.code].filter(([k]) => k !== 'mr-cache')) });
  const reference = [...before.keys()].find((f) => f.endsWith('REFERENCE.md'))!;
  const usersOfDiff = /`TransformDiff`: [^;|]*`mr-cache`/;
  assert.match(before.get(reference)!, usersOfDiff);
  assert.doesNotMatch(after.get(reference)!, usersOfDiff);
});
