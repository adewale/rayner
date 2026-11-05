// Property tests for the tools/lib surfaces the build and `check` stand on:
// resting-text collisions, the construct lint, the per-diagram
// snapshot store and inline-script escaping. The gates themselves, each with a
// seeded defect, are in explain-gates.test.ts. Counts: test/lib/pbt.ts (FULL=1 is 10x).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readdir, readFile, writeFile, mkdir, stat, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import { transformSync } from 'esbuild';
import { Text, Group, Rectangle } from '../src/index.ts';
import { loadFonts } from '../explain/testing.ts';
import type { Mobject } from '../src/index.ts';
import { restingTextProblems, lintConstruct } from '../tools/lib/explain-check.ts';
import { readSnapshots, writeSnapshots, snapshotFileName, scriptEscape, IMPORTER } from '../tools/lib/explain-project.ts';
import { diagramKey } from '../integrations/agentic-mermaid/snapshot.ts';
import type { SnapshotStore } from '../explain/index.ts';
import { fc, params } from './lib/pbt.ts';

await loadFonts();

// ---- restingTextProblems ---------------------------------------------------------

interface Placed {
  text: string;
  x: number;
  y: number;
  size: number;
  native: boolean;
  hide: 'none' | 'faded' | 'parent' | 'heading' | 'blank' | 'nested' | 'clear';
}
const placedText: fc.Arbitrary<Placed> = fc.record({
  text: fc.string({ unit: 'grapheme', minLength: 1, maxLength: 8 }),
  x: fc.double({ min: -9, max: 9, noNaN: true }),
  y: fc.double({ min: -5, max: 5, noNaN: true }),
  size: fc.double({ min: 0.1, max: 0.6, noNaN: true }),
  native: fc.boolean(),
  hide: fc.constantFrom('none', 'none', 'none', 'faded', 'parent', 'heading', 'blank', 'nested', 'clear'),
});
/** Mobjects for each placed text: a native Text, or a diagram-style labelled path. */
function build(items: Placed[]): Mobject[] {
  return items.map((p) => {
    const label = p.hide === 'blank' ? ' \t' : p.text;
    let m: Mobject = p.native
      ? new Text(label, { fontSize: p.size }).moveTo([p.x, p.y])
      : Object.assign(new Rectangle({ width: p.size * label.length, height: p.size, fill: '#ffffff' }).moveTo([p.x, p.y]), { text: label });
    if (p.hide === 'faded') m.setOpacity(0.3);
    if (p.hide === 'clear') m.setStyle({ fillOpacity: 0, stroke: 'none' });
    if (p.hide === 'heading') m.role = 'heading';
    if (p.hide === 'parent') m = new Group(m).setOpacity(0.2);
    // Inside a blank text-bearing group: the inner text is part of it, and the group shows nothing.
    if (p.hide === 'nested') m = Object.assign(new Group(m), { text: ' ' });
    return m;
  });
}
const sceneOf = (mobs: Mobject[]) => ({ familyMembers: () => mobs.flatMap((m) => m.family()) });
const asSet = (problems: string[]) =>
  new Set(problems.map((p) => (/^(".*") overlaps (".*")$/s.exec(p) ? [...(/^(".*") overlaps (".*")$/s.exec(p)!.slice(1))].sort().join(' overlaps ') : p)));

test('a text listed twice is still one text: duplicates add no problems', () => {
  fc.assert(
    fc.property(fc.array(placedText, { maxLength: 6 }), fc.nat(), (items, k) => {
      const mobs = build(items);
      fc.pre(mobs.length > 0);
      const once = restingTextProblems(sceneOf(mobs));
      const extra = mobs[k % mobs.length]!;
      assert.deepEqual(restingTextProblems({ familyMembers: () => [...sceneOf(mobs).familyMembers(), ...extra.family()] }), once);
    }),
    params(),
  );
});

test('collisions do not depend on the order texts are listed in', () => {
  fc.assert(
    fc.property(fc.array(placedText, { maxLength: 6 }), (items) => {
      const mobs = build(items);
      assert.deepEqual(asSet(restingTextProblems(sceneOf([...mobs].reverse()))), asSet(restingTextProblems(sceneOf(mobs))));
    }),
    params(),
  );
});

test('texts nobody can see and text inside text never collide', () => {
  fc.assert(
    fc.property(fc.array(placedText, { maxLength: 5 }), fc.array(placedText.filter((p) => p.hide !== 'none' && p.hide !== 'heading'), { maxLength: 4 }), (shown, hidden) => {
      const visible = build(shown.map((p) => ({ ...p, hide: 'none' as const })));
      assert.deepEqual(restingTextProblems(sceneOf([...visible, ...build(hidden)])), restingTextProblems(sceneOf(visible)));
    }),
    params(),
  );
});

test('the heading collides with no text, but a text runs into it exactly when their boxes overlap', () => {
  fc.assert(
    fc.property(placedText.map((p) => ({ ...p, hide: 'none' as const })), placedText.map((p) => ({ ...p, hide: 'heading' as const })), (shown, head) => {
      fc.pre(shown.text.trim() !== '' && head.text.trim() !== '');
      const [m] = build([shown]),
        [h] = build([head]);
      const without = restingTextProblems(sceneOf([m!]));
      const problems = restingTextProblems(sceneOf([m!, h!]));
      const a = m!.box()!,
        b = h!.box()!;
      const overlap = a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
      // Nothing about the heading itself is judged: only what runs into it.
      assert.deepEqual(problems.filter((x) => !x.includes('runs into the heading')), without);
      assert.equal(problems.some((x) => x.includes('runs into the heading')), overlap && !!m!.box() && !!h!.box());
    }),
    params(),
  );
});

test('native and imported text collisions obey the same independent intersection contract', () => {
  fc.assert(fc.property(
    fc.array(placedText.map((p) => ({ ...p, hide: 'none' as const })), { maxLength: 6 }),
    (items) => {
      const mobs = build(items);
      const expected: string[] = [];
      for (let i = 0; i < mobs.length; i++) for (let j = i + 1; j < mobs.length; j++) {
        if (!items[i]!.text.trim() || !items[j]!.text.trim()) continue;
        const a = mobs[i]!.box()!, b = mobs[j]!.box()!;
        const w = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0]));
        const h = Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
        const smaller = Math.min((a[2] - a[0]) * (a[3] - a[1]), (b[2] - b[0]) * (b[3] - b[1]));
        if (w * h > smaller * 0.12) expected.push(`"${items[i]!.text}" overlaps "${items[j]!.text}"`);
      }
      const actual = restingTextProblems(sceneOf(mobs)).filter((p) => p.includes('overlaps'));
      assert.equal(actual.length, expected.length, 'every colliding pair is reported');
      assert.deepEqual(asSet(actual), asSet(expected));
    }), params(1000, { examples: [[[
      { text: 'one', x: 0, y: 0, size: 0.4, native: false, hide: 'none' },
      { text: 'two', x: 0, y: 0, size: 0.4, native: false, hide: 'none' },
    ]]] }));
});

test('a native text is cut off exactly when its box leaves the frame', () => {
  fc.assert(
    fc.property(placedText.map((p) => ({ ...p, native: true, hide: 'none' as const })), (p) => {
      fc.pre(p.text.trim() !== '');
      const [m] = build([p]);
      const b = m!.box()!;
      const out = b[0] < -8 || b[1] < -4.5 || b[2] > 8 || b[3] > 4.5;
      assert.equal(restingTextProblems(sceneOf([m!])).some((x) => x.endsWith('crosses the stage edge')), out);
    }),
    params(),
  );
});

test('texts with disjoint boxes never collide, and a text over a copy of itself always does', () => {
  fc.assert(
    fc.property(placedText.map((p) => ({ ...p, native: true, hide: 'none' as const, x: Math.max(-6, Math.min(6, p.x)), y: Math.max(-3, Math.min(3, p.y)) })), fc.double({ min: 0, max: 1, noNaN: true }), (p, d) => {
      const [a] = build([p]),
        [b] = build([p]);
      const w = a!.width();
      fc.pre(p.text.trim() !== '' && w > 0 && a!.height() > 0);
      assert.equal(restingTextProblems(sceneOf([a!, b!])).filter((x) => x.includes('overlaps')).length, 1);
      b!.shift([w * (1 + d) + 1e-6, 0]);
      assert.deepEqual(restingTextProblems(sceneOf([a!, b!])).filter((x) => x.includes('overlaps')), []);
    }),
    params(),
  );
});

test('a label clipped out of sight collides with nothing; a clipped label still in sight does', () => {
  // A diagram framed on one part clips its other labels to the frame: a reader sees none of them,
  // so a card beside the frame cannot collide with them.
  fc.assert(
    fc.property(placedText.map((p) => ({ ...p, native: true, hide: 'none' as const, x: Math.max(-6, Math.min(6, p.x)), y: Math.max(-3, Math.min(3, p.y)) })), fc.double({ min: 0, max: 1, noNaN: true }), (p, cut) => {
      const [card] = build([p]),
        [label] = build([{ ...p, native: false }]);
      const b = label!.box()!;
      fc.pre(p.text.trim() !== '' && b[2] - b[0] > 0.01 && b[3] - b[1] > 0.01);
      const frame = new Group(label!);
      // A clip that ends before the label starts hides it.
      frame.clipBox = [b[0] - 5, b[1] - 5, b[0] - 0.01, b[3] + 5];
      assert.deepEqual(restingTextProblems(sceneOf([card!, frame])).filter((x) => x.includes('overlaps')), []);
      // A clip that leaves most of the label in sight keeps the collision.
      frame.clipBox = [b[0] + (b[2] - b[0]) * cut * 0.5, b[1] - 5, b[2] + 5, b[3] + 5];
      assert.equal(restingTextProblems(sceneOf([card!, frame])).filter((x) => x.includes('overlaps')).length, 1);
    }),
    params(),
  );
});

// ---- readSnapshots / writeSnapshots ----------------------------------------------

const snapshotValue = fc.jsonValue({ maxDepth: 2 }).map((v) => ({ version: 1, body: v }));
const storeKey = fc.oneof(
  fc.record({ source: fc.string({ maxLength: 10 }), style: fc.constantFrom('nord', 'default', 'blueprint') }).map((s) => diagramKey(s)),
  fc.constantFrom('__proto__', 'constructor', 'index.json', '', '../x', 'toString'),
  fc.string({ unit: 'binary', maxLength: 8 }),
);
const store = fc.dictionary(storeKey, snapshotValue, { maxKeys: 5 }).map((d) => {
  // fc.dictionary sets '__proto__' as an own key already; keep it that way through a copy.
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(d)) Object.defineProperty(out, k, { value: v, enumerable: true, writable: true, configurable: true });
  return out as unknown as SnapshotStore;
});
async function folder<T>(run: (base: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), 'rayner-pbt-snapshots-'));
  try {
    return await run(join(dir, 'scene'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
const ownEntries = (s: object) => Object.keys(s).sort().map((k) => [k, JSON.stringify((s as Record<string, unknown>)[k])]);
// Filesystem cases each create, write and read a directory: 200 by default (2000 under FULL=1).
const FS = 200;

test('writeSnapshots then readSnapshots gives back the store, any keys included', async () => {
  await fc.assert(
    fc.asyncProperty(store, async (s) =>
      folder(async (base) => {
        await writeSnapshots(base, s, 'h');
        assert.deepEqual(ownEntries(await readSnapshots(base)), ownEntries(s));
      }),
    ),
    params(FS),
  );
});

test('the written folder is index.json plus one file per diagram, whatever was there before', async () => {
  await fc.assert(
    fc.asyncProperty(store, store, fc.array(fc.stringMatching(/^[a-z0-9]{1,8}\.json$/), { maxLength: 3 }), async (first, s, stray) =>
      folder(async (base) => {
        await writeSnapshots(base, first, 'h');
        for (const name of stray) await writeFile(join(base + '.snapshots', name), '{}');
        await mkdir(join(base + '.snapshots', 'kept-folder'), { recursive: true });
        await writeSnapshots(base, s, 'h');
        assert.deepEqual((await readdir(base + '.snapshots')).sort(), ['index.json', 'kept-folder', ...Object.keys(s).map(snapshotFileName)].sort());
      }),
    ),
    params(FS),
  );
});

test('the same store writes the same bytes, in whatever order its keys were added', async () => {
  const written = (st: SnapshotStore) =>
    folder(async (b) => {
      await writeSnapshots(b, st, 'h');
      const names = (await readdir(b + '.snapshots')).sort();
      return Promise.all(names.map(async (n) => [n, await readFile(join(b + '.snapshots', n), 'utf8')]));
    });
  await fc.assert(
    fc.asyncProperty(store, async (s) => {
      const reversed: Record<string, unknown> = {};
      for (const k of Object.keys(s).reverse()) Object.defineProperty(reversed, k, { value: s[k], enumerable: true, writable: true, configurable: true });
      assert.deepEqual(await written(reversed as SnapshotStore), await written(s));
    }),
    params(FS),
  );
});

test('changing one diagram rewrites one file; rewriting the same store rewrites nothing', async () => {
  await fc.assert(
    fc.asyncProperty(store.filter((s) => Object.keys(s).length > 0), fc.nat(), snapshotValue, fc.boolean(), async (s, k, value, same) =>
      folder(async (base) => {
        await writeSnapshots(base, s, 'h');
        const dir = base + '.snapshots';
        const old = new Date(1_000_000);
        for (const n of await readdir(dir)) await utimes(join(dir, n), old, old);
        const key = Object.keys(s)[k % Object.keys(s).length]!;
        const next: Record<string, unknown> = { ...s };
        Object.defineProperty(next, key, { value: same ? s[key] : value, enumerable: true, writable: true, configurable: true });
        const changed = JSON.stringify(s[key]) !== JSON.stringify(next[key]);
        await writeSnapshots(base, next as SnapshotStore, 'h');
        const touched = [];
        for (const n of await readdir(dir)) if ((await stat(join(dir, n))).mtimeMs !== old.getTime()) touched.push(n);
        assert.deepEqual(touched, changed ? [snapshotFileName(key)] : []);
      }),
    ),
    params(FS),
  );
});

test('a damaged or hostile cache index reads as an object holding only what it may', async () => {
  await fc.assert(
    fc.asyncProperty(fc.jsonValue(), fc.string(), async (diagrams, name) =>
      folder(async (base) => {
        await writeFile(join(base, '..', 'outside.json'), JSON.stringify({ secret: true }));
        await mkdir(base + '.snapshots', { recursive: true });
        const index = { version: 2, importer: IMPORTER, diagrams: diagrams && typeof diagrams === 'object' && !Array.isArray(diagrams) ? { ...diagrams, [name]: '../outside.json' } : diagrams };
        await writeFile(join(base + '.snapshots', 'index.json'), JSON.stringify(index));
        const read = await readSnapshots(base);
        assert.ok(read && typeof read === 'object' && !Array.isArray(read));
        assert.ok(!JSON.stringify(read).includes('secret'), 'an index entry cannot reach outside the folder');
      }),
    ),
    params(FS),
  );
});

test('a corrupt diagram file fails the read loudly rather than vanishing from the store', async () => {
  await fc.assert(
    fc.asyncProperty(store.filter((s) => Object.keys(s).length > 0), fc.nat(), fc.string().filter((t) => { try { JSON.parse(t); return false; } catch { return true; } }), async (s, k, junk) =>
      folder(async (base) => {
        await writeSnapshots(base, s, 'h');
        const key = Object.keys(s)[k % Object.keys(s).length]!;
        await writeFile(join(base + '.snapshots', snapshotFileName(key)), junk);
        await assert.rejects(readSnapshots(base), SyntaxError);
      }),
    ),
    params(FS),
  );
});

test('snapshotFileName is the first 16 hex digits of the key\'s SHA-256, so never index.json', () => {
  fc.assert(
    fc.property(fc.string({ unit: 'binary' }), (key) => {
      assert.match(snapshotFileName(key), /^[0-9a-f]{16}\.json$/);
      assert.equal(snapshotFileName(key), createHash('sha256').update(key, 'utf8').digest('hex').slice(0, 16) + '.json');
    }),
    params(),
  );
});

// The exact SHA-256-prefix property above owns filename derivation. A 64-bit prefix
// cannot promise injectivity; random distinct-key checks cannot prove absence of collisions.
// Real-disk store properties above retain key preservation and file-isolation behavior.

// ---- lintConstruct ---------------------------------------------------------------

type Stmt =
  | { k: 'await' | 'forAwait' | 'sync' | 'catchCall' }
  | { k: 'fn'; body: Stmt[] }
  | { k: 'try'; body: Stmt[]; handler: 'catch' | 'finally' | 'both'; recover: Stmt[] };
const stmts: fc.Arbitrary<Stmt[]> = fc.letrec<{ list: Stmt[]; stmt: Stmt }>((tie) => ({
  stmt: fc.oneof(
    { depthSize: 'small', withCrossShrink: true },
    fc.record({ k: fc.constantFrom('await' as const, 'forAwait' as const, 'sync' as const, 'catchCall' as const) }),
    fc.record({ k: fc.constant('fn' as const), body: tie('list') }),
    fc.record({ k: fc.constant('try' as const), body: tie('list'), handler: fc.constantFrom('catch' as const, 'finally' as const, 'both' as const), recover: tie('list') }),
  ),
  list: fc.array(tie('stmt'), { maxLength: 3 }),
})).list;
const render = (list: Stmt[]): string =>
  list
    .map((s) => {
      if (s.k === 'await') return "await this.step('s');";
      if (s.k === 'forAwait') return 'for await (const x of this.items()) { model.push(x); }';
      if (s.k === 'sync') return 'model.push(1);';
      if (s.k === 'catchCall') return 'await this.play(x).catch(() => {});';
      if (s.k === 'fn') return `const f = async () => { ${render(s.body)} };`;
      if (s.k !== 'try') return '';
      const catchPart = s.handler === 'finally' ? '' : `catch (e) { ${render(s.recover)} }`;
      const finallyPart = s.handler === 'catch' ? '' : `finally { ${s.handler === 'finally' ? render(s.recover) : ''} }`;
      return `try { ${render(s.body)} } ${catchPart} ${finallyPart}`;
    })
    .join('\n');
/** Awaited by this function body (a nested function is not awaited by the code around it). */
const awaits = (list: Stmt[]): boolean =>
  list.some((s) => s.k === 'await' || s.k === 'forAwait' || s.k === 'catchCall' || (s.k === 'try' && (awaits(s.body) || awaits(s.recover))));
const expectedErrors = (list: Stmt[]): number =>
  list.reduce(
    (n, s) =>
      n +
      (s.k === 'catchCall' ? 1 : 0) +
      (s.k === 'fn' ? expectedErrors(s.body) : 0) +
      (s.k === 'try' ? (s.handler !== 'finally' && awaits(s.body) ? 1 : 0) + expectedErrors(s.body) + expectedErrors(s.recover) : 0),
    0,
  );
const constructForm = fc.constantFrom(
  (b: string) => `async construct() { ${b} }`,
  (b: string) => `async 'construct'() { ${b} }`,
  (b: string) => `async ['construct']() { ${b} }`,
  (b: string) => `construct = async () => { ${b} };`,
);

test('lintConstruct flags each catch around awaited construct code, however construct is spelled', () => {
  fc.assert(
    fc.property(stmts, constructForm, stmts, (body, form, other) => {
      const source = `class S extends Scene { ${form(render(body))}\n async helper() { ${render(other)} } }`;
      const errors = lintConstruct(source);
      assert.equal(errors.length, expectedErrors(body), source);
      for (const e of errors) assert.match(e, /StopScene/);
    }),
    params(),
  );
});

test('scale probe: the lint counts 300 nested catches in a 20,000-statement construct', () => {
  let nested = "await this.step('x');";
  for (let i = 0; i < 300; i++) nested = `try { ${nested} } catch (e) {}`;
  assert.equal(lintConstruct(`class S { async construct() { ${nested} ${'model.push(1);'.repeat(20_000)} } }`).length, 300);
});

// ---- scriptEscape ----------------------------------------------------------------

/** Strings rich in the tokens the HTML parser reacts to, overlapping in every way. */
const hostile = fc.string({ unit: fc.constantFrom('<', '/', '!', '-', 's', 'c', 'r', 'i', 'p', 't', 'S', 'C', 'R', 'I', 'P', 'T', '>', ' ', '\u2028', '\u2029', 'x', '\\', '`', '"'), maxLength: 40 });

test('scriptEscape leaves no </script (any case) and no <!--', () => {
  fc.assert(
    fc.property(fc.oneof(hostile, fc.string({ unit: 'binary' })), (code) => {
      const out = scriptEscape(code);
      assert.doesNotMatch(out, /<\/script/i);
      assert.doesNotMatch(out, /<!--/);
    }),
    params(),
  );
});

test('scriptEscape changes nothing in code without those tokens', () => {
  fc.assert(
    fc.property(fc.oneof(hostile, fc.string({ unit: 'binary' })), (code) => {
      fc.pre(!/<\/script|<!--|\u2028|\u2029/i.test(code));
      assert.equal(scriptEscape(code), code);
    }),
    params(),
  );
});

/**
 * A raw template of `t`, or null when its body holds what no escape can keep (`<!--`, U+2028/9).
 * The body is checked after the backticks and `$` come out: `<!\`--` holds no `<!--` until then.
 */
const rawTemplate = (t: string): string | null => {
  const body = t.replace(/[`$]/g, '').replace(/\\+$/, '');
  return /<!--|\u2028|\u2029/.test(body) ? null : 'String.raw`' + body + '`';
};

test('raw-template fragments never hold <!--, even once a backtick between its characters is removed', () => {
  // test:full drew String.raw`<!--` from "<!`--": the old filter ran before the backtick came out.
  assert.equal(rawTemplate('<!`--'), null);
  assert.equal(rawTemplate('<!$--'), null);
  assert.equal(rawTemplate('a<!-x'), 'String.raw`a<!-x`');
});

/** Expression fragments as bundled code contains them: strings, templates, regexes (with u/v), raw templates. */
const regexToken = fc.constantFrom('<', '!', '-', 'a', '<!--', '<\\/script', '\\/', 's', '>', 'x*');
const fragment = fc.oneof(
  hostile.map((t) => JSON.stringify(t)),
  hostile.map((t) => '`' + t.replace(/[\\`$]/g, '\\$&') + '`'),
  hostile.map((t) => '`' + t.replace(/[\\`$]/g, '\\$&') + '${1}`'),
  fc.tuple(fc.array(regexToken, { minLength: 1, maxLength: 5 }), fc.constantFrom('', 'u', 'v', 'i', 'gu'), hostile).map(
    // What a regex matches, not its .source text: escaping `<!--` changes the text of a regex
    // (and of a raw template) that holds it, never what it matches (ledger: scriptEscape).
    ([tokens, flags, sample]) =>
      `(r => [r.flags, r.test(${JSON.stringify(sample)}), r.test(${JSON.stringify(tokens.join('').replace(/\\/g, ''))}), '<!--'.replace(r, '#')])(/${tokens.join('')}/${flags})`,
  ),
  // Raw templates keep their backslashes, so no textual escape of `<!--` or U+2028/9 can preserve them
  // (ledger: scriptEscape, String.raw). esbuild itself rewrites raw templates holding </script.
  hostile.map(rawTemplate).filter((t): t is string => t !== null),
);
const runOut = (code: string) => {
  const context = vm.createContext({});
  vm.runInContext(code, context);
  return JSON.stringify((context as { out: unknown }).out);
};

test('scriptEscape keeps what bundled code does', () => {
  fc.assert(
    fc.property(fc.array(fragment, { minLength: 1, maxLength: 6 }), (fragments) => {
      const program = `globalThis.out = [${fragments.join(', ')}];`;
      let bundled: string;
      try {
        bundled = transformSync(program, { minify: true, format: 'iife', target: 'es2022' }).code;
      } catch {
        fc.pre(false);
        return;
      }
      assert.equal(runOut(scriptEscape(bundled)), runOut(bundled), bundled);
    }),
    {
      ...params(),
      // The regex that broke the built Lantern page (escaping every `</` made /</g into /<\/g),
      // beside the cases the HTML parser cares about.
      examples: [[['"a<b</c".replace(/</g, "&lt;")', '"</script>".length', '/<\\/SCRIPT>/i.test("</script>")', '"x\\u2028y".length']]],
    },
  );
});

test('scale probe: scriptEscape on 5.6 MB of </script and <!-- leaves neither', () => {
  assert.doesNotMatch(scriptEscape('</script><!-- '.repeat(400_000)), /<\/script|<!--/i);
});
