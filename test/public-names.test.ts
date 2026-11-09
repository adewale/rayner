// The export rule (docs/ENGINE.md, "Public names") as a test. Every value each entry point exports
// needs a reason to be public: used (computed from the explainers, tutorial scenes and recipes that
// import it), tooling (it lives in rayner/output or rayner/testing, and test/public-names.json says
// who uses it outside a scene and for what) or taught (a guide section and a test, named in
// test/public-names.json, which must exist and mention it). The
// reference's engine features table and the skill's examples table are rendered from the same file.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { ROOT, problems, readLedger, rendered, usage } from '../tools/repo/lib/public-names.ts';
import type { Ledger } from '../tools/repo/lib/public-names.ts';
import { UNDOCUMENTED, docsProblems, docsReport, documented } from '../tools/repo/lib/public-docs.ts';

const u = usage();
const ledger = readLedger();
const copy = (): Ledger => structuredClone(ledger);

test('every public name of every entry point has a live reason to be public', async () => {
  assert.deepEqual(await problems(ledger, ROOT, u), []);
});

test('the engine features and examples tables are rendered from the ledger: run node tools/repo/public-names.ts --write', () => {
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
  // Tooling is a written reason, not where a name lives.
  assert.match(await found((l) => delete l.names['rayner/testing']!['loadFonts']), /loadFonts \(rayner\/testing\) has no reason to be public: rayner\/testing is tooling, and test\/public-names\.json gives it no tooling reason/);
  assert.match(await found((l) => (l.names['rayner/output']!['renderFrame'] = { tooling: 'tools' })), /renderFrame \(rayner\/output\): its tooling reason must say who uses it outside a scene, and for what/);
  assert.match(await found((l) => (l.names['rayner']!['Brace'] = { tooling: 'a host page that draws braces around things' })), /Brace \(rayner\): only a name in rayner\/output or rayner\/testing is tooling/);
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

// Every public name documented (docs/ENGINE.md, "Public names"): every exported value and type, every
// public member of an exported class and the stage's members, each named in docs/ or listed, with why,
// among the names that have no author purpose (tools/repo/lib/public-docs.ts).
const docs = docsReport();

test('every public value, type and member is documented in docs/, or listed as having no author purpose', () => {
  assert.ok(docs.rows.filter((r) => r.kind === 'member' && r.name.startsWith('Stage.')).length > 15, 'the stage’s members are part of the surface');
  assert.ok(docs.rows.some((r) => r.name === 'View.sync') && docs.rows.some((r) => r.name === 'Card.describe'), 'class members, type-only classes included');
  assert.ok(!docs.rows.some((r) => r.name === 'View.placed' || r.name === 'Mobject.id'), '@internal and hidden members are not public');
  assert.ok(docs.rows.some((r) => r.name === 'Sink.frame') && !docs.rows.some((r) => r.name === 'NullSink.frame'), 'a member that implements an exported interface’s is the interface’s');
  assert.ok(docs.rows.some((r) => r.name === 'Animation.evidence') && !docs.rows.some((r) => r.name === 'TransformMatching.evidence'), 'an override is its ancestor’s name, not its own');
  assert.deepEqual(docsProblems(docs), []);
});

test('the docs check rejects a public name no guide names, and a stale entry among the undocumented', () => {
  const missing = { ...docs, rows: docs.rows.map((r) => (r.name === 'having' ? { ...r, documented: false } : r)) };
  assert.match(docsProblems(missing).join('\n'), /having \(rayner\/explain\) is public but no guide in docs\/ names it/);
  assert.match(docsProblems(docs, { ...UNDOCUMENTED, 'having (rayner/explain)': 'x' }).join('\n'), /having \(rayner\/explain\) is listed as undocumented but a guide documents it/);
  assert.match(docsProblems(docs, { ...UNDOCUMENTED, 'Gone (rayner)': 'x' }).join('\n'), /Gone \(rayner\) is listed as undocumented but is not public/);
  // The rules: a value or type by its name in code, an options bag by a documented signature, a member by `.name` or a
  // span it leads in a section that names its owner, or by `r.name` for one of its owner's receivers.
  const n = (kind: 'value' | 'type' | 'member', name: string) => ({ entry: 'rayner', kind, name });
  assert.ok(documented(n('value', 'card'), 'card(s, rows)', new Set()));
  assert.ok(!documented(n('value', 'card'), 'cards and a scorecard', new Set()));
  assert.ok(documented(n('type', 'CardOptions'), 'card(s, rows)', new Set(['CardOptions'])));
  assert.ok(!documented(n('type', 'Having'), 'having(st, k)', new Set(['Having'])), 'only an options bag is documented by a signature');
  assert.ok(documented(n('member', 'View.sync'), 'view.sync({ match })', new Set()));
  assert.ok(documented(n('member', 'InvariantSink.held'), 'InvariantSink\nfailures\nheld', new Set()));
  assert.ok(!documented(n('member', 'View.sync'), 'synced', new Set()));
  // A member of the same name on another class is a coincidence: Line.start is not machine.spec.start, and
  // InvariantSink.inner is not a sync's inner where another section names InvariantSink.
  assert.ok(!documented(n('member', 'Line.start'), 'machine.spec.start', new Set()));
  assert.ok(!documented(n('member', 'InvariantSink.inner'), ['InvariantSink\nfailures', 'sync.inner'], new Set()));
  assert.ok(documented(n('member', 'Line.start'), ['Line\nline.start()'], new Set()));
  // So is another class's receiver, or a file of the same name, in a section that names the owner.
  assert.ok(!documented(n('member', 'Card.labels'), ['Card\nd.labels(id)'], new Set()));
  assert.ok(!documented(n('member', 'Diagram.scene'), ['Diagram\ns.scene'], new Set()));
  assert.ok(!documented(n('member', 'Machine.scene'), ['Machine\nscene.ts'], new Set()));
  assert.ok(documented(n('member', 'Card.labels'), ['Card\ncard.labels'], new Set()));
});
