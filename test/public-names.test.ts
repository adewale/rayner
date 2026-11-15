// The export rule (docs/ENGINE.md, "Public names" and "What stays in the public API") as a test. Every
// value each entry point exports needs a reason to be public: used (computed from the explainers, tutorial
// scenes, the tutorial's printed kit example and recipes that import it), tooling (it lives in rayner/output
// or rayner/testing, and test/public-names.json says who uses it outside a scene and for what) or kept
// (test/public-names.json says why it stays public, and names a guide section and a test, which must exist
// and mention it). The reference's engine features table, the skill's examples table, the engine map's
// table of kept names and the feature index (docs/FEATURE-TOUR.md) are rendered from the same file.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { ROOT, classOf, problems, publicNames, readLedger, rendered, usage } from '../tools/repo/lib/public-names.ts';
import type { Ledger } from '../tools/repo/lib/public-names.ts';
import { UNDOCUMENTED, docsProblems, docsReport, documented } from '../tools/repo/lib/public-docs.ts';

const u = usage();
const ledger = readLedger();
const copy = (): Ledger => structuredClone(ledger);

test('every public name of every entry point has a live reason to be public', async () => {
  assert.deepEqual(await problems(ledger, ROOT, u), []);
});

test('the engine features, examples, kept names and feature index tables are rendered from the ledger: run node tools/repo/public-names.ts --write', () => {
  for (const [file, text] of rendered(ledger, ROOT, u))
    assert.equal(readFileSync(file, 'utf8'), text, `${relative(ROOT, file)} differs from what the ledger renders`);
});

test('the rule rejects a name with no reason, a broken guide or test, and an entry for a name no longer exported', async () => {
  const found = async (edit: (l: Ledger) => void) => {
    const l = copy();
    edit(l);
    return (await problems(l, ROOT, u)).join('\n');
  };
  assert.match(await found((l) => delete l.names['rayner']!['Frame']), /Frame \(rayner\) has no reason to be public: no explainer, tutorial scene or recipe uses it; .* or stop exporting it from src\/index\.ts/);
  assert.match(await found((l) => (l.names['rayner']!['Gone'] = { check: 'Views: x' })), /Gone \(rayner\) is in test\/public-names\.json but rayner does not export it/);
  assert.match(await found((l) => (l.names['rayner']!['Brace'] = { guide: 'docs/EMPHASIS.md#no-such-section', test: 'test/emphasis.test.ts' })), /docs\/EMPHASIS\.md has no section #no-such-section/);
  assert.match(await found((l) => (l.names['rayner']!['Brace'] = { guide: 'docs/EMPHASIS.md#circumscribe', test: 'test/emphasis.test.ts' })), /docs\/EMPHASIS\.md#circumscribe does not mention it/);
  assert.match(await found((l) => (l.names['rayner']!['Brace'] = { guide: 'docs/EMPHASIS.md#the-shapes', test: 'test/no-such.test.ts' })), /its test test\/no-such\.test\.ts does not exist/);
  assert.match(await found((l) => (l.names['rayner']!['Brace'] = { guide: 'docs/EMPHASIS.md#the-shapes', test: 'test/diff.test.ts' })), /test\/diff\.test\.ts does not mention it/);
  assert.match(await found((l) => (l.names['rayner']!['Brace'] = { guide: 'docs/EMPHASIS.md#the-shapes' })), /Brace \(rayner\): a name is taught by a guide section and a test, both/);
  assert.match(await found((l) => ((l.names['rayner']!['Scene'] = {} as Record<string, unknown>)['users'] = ['fork'])), /Scene \(rayner\): users is not part of a ledger entry/);
  // A guide and a test show that a name works, not why it is public: an unused name keeps a written reason.
  assert.match(await found((l) => delete l.names['rayner']!['Frame']!.reason), /Frame \(rayner\) has no reason to be public/);
  // Tooling is a written reason, not where a name lives.
  assert.match(await found((l) => delete l.names['rayner/testing']!['loadFonts']), /loadFonts \(rayner\/testing\) has no reason to be public: rayner\/testing is tooling, and test\/public-names\.json gives it no tooling reason/);
  assert.match(await found((l) => (l.names['rayner/output']!['renderFrame'] = { tooling: 'tools' })), /renderFrame \(rayner\/output\): its tooling reason must say who uses it outside a scene, and for what/);
  assert.match(await found((l) => (l.names['rayner']!['Brace'] = { tooling: 'a host page that draws braces around things' })), /Brace \(rayner\): only a name in rayner\/output or rayner\/testing is tooling/);
});

test('what stays in the public API: a user or a written reason', async () => {
  const exported = await publicNames();
  const found = async (edit: (l: Ledger) => void, uu = u, exports = exported) => {
    const l = copy();
    edit(l);
    return (await problems(l, ROOT, uu, exports)).join('\n');
  };
  // A new export with neither a user nor a reason fails, naming the ledger and the entry point's source to edit.
  const plus = (entry: string, name: string) => new Map([...exported].map(([e, n]) => [e, e === entry ? [...n, name] : n]));
  assert.match(await found(() => {}, u, plus('rayner/kit', 'newHelper')),
    /newHelper \(rayner\/kit\) has no reason to be public: no explainer, tutorial scene or recipe uses it; use it in one, give it a reason in test\/public-names\.json with the guide and test that teach it, or stop exporting it from explain\/kit\.ts/);
  assert.match(await found(() => {}, u, plus('rayner/testing', 'newTool')),
    /newTool \(rayner\/testing\) has no reason to be public: rayner\/testing is tooling, .* or stop exporting it from explain\/testing\.ts/);
  // The names nothing uses stay only with their reasons: palette (whose one user, the feature tour, is gone) and Frame.
  assert.equal(classOf(u, 'rayner/explain', 'palette'), 'unused');
  assert.equal(classOf(u, 'rayner', 'Frame'), 'unused');
  assert.match(await found((l) => delete l.names['rayner/explain']!['palette']!.reason), /palette \(rayner\/explain\) has no reason to be public: no explainer, tutorial scene or recipe uses it; /);
  // A used name meets the rule again when it loses its users (galton-board is smooth's one today).
  const without = (name: string, keep: (user: string) => boolean) => ({ ...u, names: new Map([...u.names].map(([e, m]) => [e, new Map([...m].map(([n, users]) => [n, n === name ? new Set([...users].filter(keep)) : users]))])) });
  assert.equal(classOf(u, 'rayner', 'smooth'), 'used');
  const lost = without('smooth', () => false);
  assert.equal(classOf(lost, 'rayner', 'smooth'), 'unused');
  assert.match(await found(() => {}, lost), /smooth \(rayner\) has no reason to be public: no explainer, tutorial scene or recipe uses it/);
  // The tutorial's printed kit example counts as a use, so tones needs no reason while it draws with it.
  assert.equal(classOf(u, 'rayner/kit', 'tones'), 'used');
  assert.match(await found(() => {}, without('tones', () => false)), /tones \(rayner\/kit\) has no reason to be public/);
  // A reason says who needs the name and for what, never Manim parity, and comes with its guide and test.
  const reason = (r: Record<string, string>) => (l: Ledger) => (l.names['rayner']!['Frame'] = r);
  const taught = { guide: 'docs/CAMERA.md#what-it-is', test: 'test/camera.test.ts' };
  assert.match(await found(reason({ reason: 'the camera', ...taught })), /Frame \(rayner\): its reason must say who needs it public/);
  assert.match(await found(reason({ reason: 'Manim has a camera frame class, so authors porting a scene expect one here', ...taught })), /Frame \(rayner\): its reason leans on Manim, and Manim parity is not a reason to be public/);
  assert.match(await found(reason({ reason: 'the class of every scene camera, which an author names as a type' })), /Frame \(rayner\): a name kept with a reason is taught by a guide section and run by a test/);
  // A reason goes stale when a subject explainer uses the name: delete it.
  assert.match(await found((l) => (l.names['rayner']!['Arc'] = { reason: 'arcs are drawn by scenes that show angles and orbits', guide: 'docs/REFERENCE.md#scene', test: 'test/core.test.ts' })), /Arc \(rayner\): seasons uses it, so it needs no written reason; delete its reason from test\/public-names\.json/);
  assert.match(await found((l) => (l.names['rayner/testing']!['loadFonts']!.reason = 'an author test that draws text needs the fonts loaded first')), /loadFonts \(rayner\/testing\): a tooling name says why it is public in its tooling reason, not a reason/);
  // this.frame.animate is a pattern, not a name: a scene on a stage moves the camera with s.focus.
  const zoomed = { ...u, code: new Map([...u.code].map(([k, c]) => [k, k === 'seasons' ? c + '\nawait this.play(this.frame.animate.fit(sun));' : c])) };
  assert.match(await found(() => {}, zoomed), /seasons moves the camera with frame\.animate on a stage; use s\.focus/);
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

test('the feature index points each feature at a catalogued explainer that uses it, and at the file where it does', async () => {
  const found = async (edit: (l: Ledger) => void, uu = u) => {
    const l = copy();
    edit(l);
    return (await problems(l, ROOT, uu)).join('\n');
  };
  const at = (feature: RegExp) => ledger.lookup.findIndex((r) => feature.test(r.feature));
  const restore = at(/put back/), maths = at(/formula/), palette = at(/named style/);
  assert.ok(restore >= 0 && maths >= 0 && palette >= 0);
  // The maths row points at float-sum, the explainer that sets formulas.
  assert.deepEqual(ledger.lookup[maths]!.scenes, ['float-sum']);
  assert.match(await found((l) => (l.lookup[restore]!.scenes = ['token-bucket'])), /lookup "An object put back where it was": none of token-bucket uses Restore/);
  assert.match(await found((l) => (l.lookup[restore]!.scenes = ['tutorial/door'])), /tutorial\/door is not a catalogued explainer/);
  assert.match(await found((l) => (l.lookup[restore]!.scenes = ['feature-tour'])), /feature-tour is not a scene/);
  assert.match(await found((l) => (l.lookup[restore]!.uses += ', `TransformFromCopy`')), /it names TransformFromCopy but does not list it in names/);
  assert.match(await found((l) => l.lookup[restore]!.scenes.push('glyph')), /lookup "An object put back where it was": glyph uses none of Restore, saveState/);
  // A feature no explainer uses says so, until one does.
  assert.deepEqual(ledger.lookup[palette]!.scenes, []);
  const paletteUsed = { ...u, names: new Map([...u.names].map(([e, m]) => [e, e === 'rayner/explain' ? new Map([...m, ['palette', new Set(['seasons'])]]) : m])) };
  assert.match(await found(() => {}, paletteUsed), /lookup "A named style's colours, one of them changed": seasons uses palette; name it in its scenes/);
  // The page links the file that uses the feature, in the repository, since the package does not ship the collection.
  const index = rendered(ledger, ROOT, u);
  const page = index.get([...index.keys()].find((f) => f.endsWith('FEATURE-TOUR.md'))!)!;
  assert.match(page, /\| An object put back where it was \| [^|]+ \| \[unified-diff\]\(https:\/\/github\.com\/adewale\/rayner\/tree\/main\/scenes\/explainers\/unified-diff\) \(\[scene\.ts\]\(https:\/\/github\.com\/adewale\/rayner\/blob\/main\/scenes\/explainers\/unified-diff\/scene\.ts\)\)/);
  assert.match(page, /\| A named style's colours, one of them changed \| [^|]+ \| no explainer yet \|/);
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
