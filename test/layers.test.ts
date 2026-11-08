// The layers of the code and the direction of their imports (docs/ENGINE.md, "Layers"): each layer
// imports only the layers under it. This holds the rules the code keeps today. The one import the
// section records as a departure, the kit naming the stage's type, is allowed here as exactly that
// and no wider. Every module under explain/ is placed in a layer by the section's table, which this
// test reads, so a new one must be placed in the doc before the rules can judge it. Of a step's
// metadata the engine types and reads only its caption, as the section records; the explainer layer
// declares the rest. The command imports nothing repository-only. And the engine's @internal members
// that the explainer layer and the player use are listed, so a new use across the layers is seen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import ts from 'typescript';

const ROOT = resolve(import.meta.dirname, '..');

const ORDER = ['core', 'diagrams', 'kit', 'stage', 'tooling'] as const;
/** The rows of ENGINE.md's layer table that place explain/ modules, by layer. */
const ROWS: Record<(typeof ORDER)[number], string> = { core: 'Explain core', diagrams: 'Diagrams and panels', kit: 'Drawing kit', stage: 'Stage', tooling: 'Author tooling' };

/**
 * The layer table in ENGINE.md's "Layers" section: each row's layer and its modules, every
 * `explain/…` or bare `….ts` name in backticks in its Modules cell (a bare name is under explain/,
 * as the core row writes them after `explain/`:), in the table's order.
 */
function layerTable(markdown: string): { layer: string; modules: string[] }[] {
  const section = markdown.split(/^## /m).find((s) => s.startsWith('Layers\n'));
  if (!section) throw new Error('ENGINE.md has no "## Layers" section');
  return section.split('\n').filter((line) => /^\| [^-|]/.test(line)).slice(1).map((line) => {
    const [layer = '', modules = ''] = line.split(/(?<!\\)\|/).slice(1).map((cell) => cell.trim());
    const names = [...modules.matchAll(/`([^`]+\.ts)`/g)].map((m) => m[1]!);
    return { layer, modules: names.filter((n) => !n.includes('/') || n.startsWith('explain/')).map((n) => n.replace(/^explain\//, '')) };
  });
}
const TABLE = layerTable(readFileSync(join(ROOT, 'docs/ENGINE.md'), 'utf8'));
/** The explainer layer's modules, by layer, from the bottom, as ENGINE.md's table places them. */
const EXPLAIN = Object.fromEntries(ORDER.map((l) => [l, TABLE.find((r) => r.layer === ROWS[l])?.modules ?? []])) as Record<string, readonly string[]>;

/** An import: who imports what, whether only its types, and whether it names a file in the repository (a relative path) rather than a package. */
interface Import { from: string; to: string; type: boolean; local: boolean }

/** Every import and re-export a file makes, static or dynamic, resolved to a repository path when relative. */
function importsOf(file: string): Import[] {
  const source = ts.createSourceFile(file, readFileSync(join(ROOT, file), 'utf8'), ts.ScriptTarget.Latest, true);
  const out: Import[] = [];
  const add = (spec: string, type: boolean) =>
    out.push({ from: file, to: spec.startsWith('.') ? relative(ROOT, resolve(ROOT, dirname(file), spec)) : spec, type, local: spec.startsWith('.') });
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const clause = node.importClause;
      const named = clause?.namedBindings && ts.isNamedImports(clause.namedBindings) ? clause.namedBindings.elements : undefined;
      add(node.moduleSpecifier.text, !!clause && (clause.isTypeOnly || (!clause.name && !!named?.length && named.every((e) => e.isTypeOnly))));
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      add(node.moduleSpecifier.text, node.isTypeOnly);
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) {
      add(node.arguments[0].text, false);
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) {
      add(node.argument.literal.text, true);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return out;
}

const sources = (dir: string): string[] =>
  readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? sources(join(dir, e.name)) : e.name.endsWith('.ts') ? [join(dir, e.name)] : [],
  );
const importsIn = (...dirs: string[]) => dirs.flatMap(sources).flatMap(importsOf);
const show = (i: Import) => `${i.from} imports ${i.to}${i.type ? ' (type)' : ''}`;
/** The library half of the diagram integration: what the page replays snapshots with. Its build/ half is capture, which the command runs. */
const INTEGRATION = sources('integrations/agentic-mermaid').filter((f) => !f.includes('/build/'));
/** The command's modules: tools/ but the repository-only tooling (tools/repo/) and the oracles (tools/oracle/). */
const isCommand = (path: string) => path.startsWith('tools/') && !/^tools\/(repo|oracle)\//.test(path);
const layerOf = (path: string) => (path.startsWith('explain/') ? ORDER.find((l) => EXPLAIN[l]!.includes(path.slice('explain/'.length))) : undefined);

/** The rules, each true of an import that breaks it. */
const RULES: Record<string, (i: Import) => boolean> = {
  engine: (i) => i.from.startsWith('src/') && !i.to.startsWith('src/') && i.to !== 'vendor/glyph.js',
  integration: (i) => INTEGRATION.includes(i.from) && (!/^(src|integrations\/agentic-mermaid)\//.test(i.to) || i.to.includes('/build/')),
  explain: (i) => i.from.startsWith('explain/') && !i.to.startsWith('src/') && !i.to.startsWith('explain/') && !INTEGRATION.includes(i.to),
  layers: (i) => {
    const from = layerOf(i.from), to = layerOf(i.to);
    if (!from || !to || from === to) return false;
    // The departure ENGINE.md records: a kit function takes the stage, for its colours and shaping.
    if (from === 'kit' && i.to === 'explain/stage.ts' && i.type) return false;
    return ORDER.indexOf(to) > ORDER.indexOf(from);
  },
  player: (i) => i.from.startsWith('app/') && (!/^(src|explain|app|integrations\/agentic-mermaid)\//.test(i.to) || i.to.includes('/build/')),
  // The command (tools/ but the repository's own tooling and oracles) ships as rayner-cli: it imports the library,
  // the player, the diagram integration, the vendored shapers, its own modules and packages, never what stays in the repository.
  command: (i) => isCommand(i.from) && i.local && !/^(src|explain|app|integrations\/agentic-mermaid|vendor)\//.test(i.to) && !(i.to.startsWith('tools/') && isCommand(i.to)),
};
const broken = (rule: string, imports: Import[]) => imports.filter(RULES[rule]!).map(show);

test('ENGINE.md\'s layer table places every module under explain/ in one layer, and names only modules that exist', () => {
  // The rows this test reads are the table's, in its order from the bottom.
  const rows = TABLE.map((r) => r.layer);
  assert.deepEqual(ORDER.map((l) => rows.indexOf(ROWS[l])), [...ORDER.map((l) => rows.indexOf(ROWS[l]))].sort((a, b) => a - b), 'the explain rows in the order of the layers');
  for (const l of ORDER) assert.ok(rows.includes(ROWS[l]), `the table has a row "${ROWS[l]}"`);
  const placed = Object.values(EXPLAIN).flat(), present = sources('explain').map((f) => f.slice('explain/'.length));
  assert.deepEqual(present.filter((f) => !placed.includes(f)), [], 'place the module in a row of the table in docs/ENGINE.md');
  assert.deepEqual(placed.filter((f) => !present.includes(f)), [], 'the table names only modules that exist');
  assert.deepEqual(placed.filter((f, i) => placed.indexOf(f) !== i), [], 'a module is in one layer');
});

test('the table is read as written: a module left out of it, or placed twice, is caught', () => {
  const doc = readFileSync(join(ROOT, 'docs/ENGINE.md'), 'utf8');
  const core = (md: string) => layerTable(md).find((r) => r.layer === 'Explain core')!.modules;
  assert.ok(core(doc).includes('machine.ts') && core(doc).includes('view.ts'));
  assert.ok(!core(doc.replace('`machine.ts`, ', '')).includes('machine.ts'), 'a module dropped from the doc is no longer placed');
  const twice = layerTable(doc.replace('`explain/panels.ts` |', '`explain/panels.ts`, `view.ts` |')).flatMap((r) => r.modules);
  assert.ok(twice.filter((m) => m === 'view.ts').length === 2, 'a module written in two rows is read twice');
  assert.deepEqual(layerTable(doc).find((r) => r.layer === 'Author tooling')!.modules, ['describe.ts', 'project.ts', 'testing.ts'], 'the engine\'s src/testing.ts is not an explain module');
});

test('the engine imports nothing outside src/ but its vendored shaper', () => {
  assert.deepEqual(broken('engine', importsIn('src')), []);
});

test('the diagram integration the page replays imports only the engine, not the capture half', () => {
  assert.deepEqual(broken('integration', INTEGRATION.flatMap(importsOf)), []);
});

test('the explainer layer imports only the engine, the integration it replays and itself', () => {
  assert.deepEqual(broken('explain', importsIn('explain')), [], 'no player, command, tests, scenes, capture or packages');
});

test('inside explain/, each layer imports only the layers under it; the kit names the stage as a type only', () => {
  assert.deepEqual(broken('layers', importsIn('explain')), []);
});

test('the player imports the library and nothing from the command, the tests, the scenes or capture', () => {
  assert.deepEqual(broken('player', importsIn('app')), []);
});

test('the command imports the library, the player, the diagram integration and its own modules, never repository-only code', () => {
  assert.deepEqual(broken('command', importsIn('tools').filter((i) => isCommand(i.from))), []);
});

/**
 * The engine's @internal members (src/) that the explainer layer and the player use, by member, with
 * the files that use each. They are an interface between the layers that the published types leave
 * out, so each is listed here: a new use, by another file or of another member, fails the test until
 * it is added, with its reason.
 */
const INTERNAL_USES: Record<string, { files: string[]; why: string }> = {
  'Animation.cleanUpFromScene': { files: ['explain/choreograph.ts'], why: 'a joined animation cleans up as the play would' },
  'Animation.families': { files: ['explain/annotate.ts'], why: 'an annotation reads what an animation draws' },
  'AnimationGroup.animations': { files: ['explain/action.ts'], why: "an action's beats are a Succession's members" },
  'AnimationGroup.cleanUpFromScene': { files: ['explain/action.ts'], why: "an action's beats are a Succession's members" },
  'AnimationGroup.doLand': { files: ['explain/action.ts'], why: 'what is made at its turn lands its begun members after a failed play' },
  'AnimationGroup.maxEnd': { files: ['explain/action.ts'], why: "an action's beats are a Succession's members" },
  'AnimationGroup.settle': { files: ['explain/action.ts'], why: "an action's beats are a Succession's members" },
  'AnimationGroup.timings': { files: ['explain/action.ts'], why: "an action's beats are a Succession's members" },
  'AnimationGroup.waiting': { files: ['explain/action.ts'], why: 'what is made at its turn holds its Succession while it waits' },
  'AnimationTiming.settle': { files: ['explain/action.ts'], why: "an action's beats are a Succession's members" },
  'DomSink.apply': { files: ['app/embed-zoom.ts'], why: 'the close-up draws records without a frame' },
  'Mobject.boundingPointArrays': { files: ['explain/view.ts'], why: 'a view measures what it draws' },
  'Mobject.interpolateData': { files: ['explain/labels.ts'], why: 'a label interpolates its own data' },
  'Mobject.invalidateBox': { files: ['explain/annotate.ts', 'explain/labels.ts', 'explain/machine.ts', 'explain/panels.ts', 'explain/state.ts'], why: 'what changes points in place clears the cached box' },
  'Mobject.mergeLeaves': { files: ['explain/diagrams.ts'], why: "a diagram's labels draw as one element" },
  'Mobject.pointArrays': { files: ['app/embed-closeup.ts', 'explain/view.ts'], why: 'a view and the close-ups measure points' },
  'Scene.beginAnimations': { files: ['explain/action.ts'], why: 'what is made at its turn begins as a play begins it' },
  'Scene.keepOnTop': { files: ['explain/stage.ts'], why: 'the stage keeps its heading drawn last' },
  'Scene.skipUntil': { files: ['app/embed.ts'], why: "the player sends its runner on to a later step's frames" },
  'Scene.stopAt': { files: ['explain/live.ts'], why: 'the run to a live step stops as the step ends' },
  'Scene.whenReady': { files: ['explain/action.ts'], why: 'what is made at its turn waits for what it reads' },
  'Succession.doLand': { files: ['explain/action.ts'], why: 'an action is abandoned after a failed play' },
  'Text.frameBox': { files: ['explain/labels.ts'], why: "a label's size is its text's box" },
  'Text.run': { files: ['explain/labels.ts'], why: "a label's words are its text's runs" },
  'Transform.sameStructure': { files: ['explain/view.ts'], why: 'a view morphs a picture of the same structure' },
};

/**
 * Each @internal member declared in src/ that `files` use, with the files that use it, read by the
 * type checker (so a member is told from another of the same name). `seeded` adds a file that is not
 * on disk, whose uses are returned on their own.
 */
function internalUses(files: string[], seeded?: { file: string; text: string }): { uses: Record<string, string[]>; seededUses: string[] } {
  const options: ts.CompilerOptions = { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext, lib: ['lib.es2023.d.ts', 'lib.dom.d.ts'], types: [], allowImportingTsExtensions: true, noEmit: true, skipLibCheck: true, strict: true };
  const host = ts.createCompilerHost(options);
  const at = seeded && join(ROOT, seeded.file);
  if (seeded) {
    const { getSourceFile, fileExists, readFile } = host;
    host.fileExists = (f) => f === at || fileExists(f);
    host.readFile = (f) => (f === at ? seeded.text : readFile(f));
    host.getSourceFile = (f, language, ...rest) => (f === at ? ts.createSourceFile(f, seeded.text, language) : getSourceFile(f, language, ...rest));
  }
  const program = ts.createProgram([...files.map((f) => join(ROOT, f)), ...(at ? [at] : [])], options, host);
  const checker = program.getTypeChecker();
  const internal = (d: ts.Declaration) => relative(ROOT, d.getSourceFile().fileName).startsWith('src/') && ts.getJSDocTags(d).some((t) => t.tagName.text === 'internal');
  const nameOf = (d: ts.Declaration) => {
    const own = (d as ts.NamedDeclaration).name?.getText() ?? '(anonymous)';
    return (ts.isClassLike(d.parent) || ts.isInterfaceDeclaration(d.parent)) && d.parent.name ? `${d.parent.name.text}.${own}` : own;
  };
  const usedIn = (file: string): Set<string> => {
    const out = new Set<string>();
    const visit = (n: ts.Node): void => {
      if (ts.isIdentifier(n)) {
        let symbol = checker.getSymbolAtLocation(n);
        if (symbol && symbol.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
        for (const d of symbol?.declarations ?? []) if (internal(d)) out.add(nameOf(d));
      }
      ts.forEachChild(n, visit);
    };
    visit(program.getSourceFile(file)!);
    return out;
  };
  const uses: Record<string, string[]> = {};
  for (const f of files) for (const member of usedIn(join(ROOT, f))) (uses[member] ??= []).push(f);
  for (const list of Object.values(uses)) list.sort();
  return { uses: Object.fromEntries(Object.entries(uses).sort(([a], [b]) => (a < b ? -1 : 1))), seededUses: at ? [...usedIn(at)].sort() : [] };
}

test('the engine\'s @internal members the explainer layer and the player use are exactly those listed, by the files listed', () => {
  // A seeded use of the scene's internal sink, from a file the list does not name, is read as one.
  const { uses, seededUses } = internalUses([...sources('explain'), ...sources('app')], {
    file: 'app/seeded-defect.ts',
    text: "import type { Scene } from '../src/scene.ts';\nexport const swap = (scene: Scene, other: Scene) => { scene.sink = other.sink; return scene.stopAt; };\n",
  });
  assert.deepEqual(seededUses, ['Scene.sink', 'Scene.stopAt'], 'the seeded file\'s uses are found by member, through a type');
  const listed = Object.fromEntries(Object.entries(INTERNAL_USES).map(([member, { files }]) => [member, files]));
  assert.deepEqual(uses, listed, 'list each new use of an engine @internal member in INTERNAL_USES, with its reason');
  assert.ok(!('Scene.sink' in uses), 'no layer above the engine writes or reads the scene\'s sink');
});

test('the engine types and reads a step\'s caption only: its title, line and kind are declared by the explainer layer', () => {
  const fieldsOf = (file: string, declared: (n: ts.Node) => boolean) => {
    const source = ts.createSourceFile(file, readFileSync(join(ROOT, file), 'utf8'), ts.ScriptTarget.Latest, true);
    const names: string[] = [];
    const visit = (n: ts.Node): void => {
      if (ts.isInterfaceDeclaration(n) && n.name.text === 'StepMeta' && declared(n))
        for (const m of n.members) names.push(m.name ? m.name.getText(source) : '[key]');
      ts.forEachChild(n, visit);
    };
    visit(source);
    return names;
  };
  const inModule = (n: ts.Node) => ts.isModuleBlock(n.parent) && ts.isStringLiteral(n.parent.parent.name) && n.parent.parent.name.text === '../src/scene.ts';
  assert.deepEqual(fieldsOf('src/scene.ts', (n) => ts.isSourceFile(n.parent)), ['caption', '[key]'], 'the engine\'s StepMeta: a caption and anything else');
  assert.deepEqual(fieldsOf('explain/script.ts', inModule), ['title', 'line', 'kind'], 'explain/script.ts declares the rest on it');
  const reads = sources('src').filter((f) => /\bStepKind\b|meta\??\.(title|line|kind)\b|'(short|detail)'/.test(readFileSync(join(ROOT, f), 'utf8')));
  assert.deepEqual(reads, [], 'no engine module names a step\'s kind or reads its title, line or kind');
});

test('each rule rejects a seeded break and allows what the layers allow', () => {
  const at = (from: string, to: string, type = false): Import => ({ from, to, type, local: !/^(node:|esbuild$)/.test(to) });
  const rejected = {
    engine: at('src/scene.ts', 'explain/stage.ts', true),
    integration: at('integrations/agentic-mermaid/snapshot.ts', 'explain/look.ts'),
    explain: at('explain/stage.ts', 'app/embed.ts'),
    player: at('app/embed.ts', 'tools/lib/browser.ts'),
    command: at('tools/lib/explain-check.ts', 'tools/repo/lib/public-names.ts'),
  };
  for (const [rule, i] of Object.entries(rejected)) assert.ok(RULES[rule]!(i), `${rule}: ${show(i)}`);
  for (const i of [at('explain/look.ts', 'explain/stage.ts', true), at('explain/panels.ts', 'explain/stage.ts'), at('explain/drawing.ts', 'explain/stage.ts'),
    at('explain/panels.ts', 'explain/drawing.ts'), at('explain/stage.ts', 'explain/testing.ts')])
    assert.ok(RULES.layers!(i), show(i));
  for (const i of [at('explain/drawing.ts', 'explain/stage.ts', true), at('explain/stage.ts', 'explain/drawing.ts'), at('explain/describe.ts', 'explain/stage.ts'),
    at('explain/diagrams.ts', 'explain/look.ts')])
    assert.ok(!RULES.layers!(i), show(i));
  assert.ok(RULES.explain!(at('explain/diagrams.ts', 'integrations/agentic-mermaid/build/index.ts')), 'the capture half');
  for (const i of [at('tools/explain.ts', 'test/lib/random-snapshot.ts'), at('tools/lib/explain-build.ts', 'tools/oracle/glyph-math.ts'), at('tools/lib/x.ts', 'scenes/explainers/catalog.ts'), at('tools/lib/x.ts', 'recipes/render.ts')])
    assert.ok(RULES.command!(i), show(i));
  for (const i of [at('tools/lib/explain-check.ts', 'app/embed-closeup.ts'), at('tools/lib/explain-check.ts', 'explain/live.ts'), at('tools/lib/x.ts', 'esbuild'), at('tools/lib/x.ts', 'node:fs'),
    at('tools/lib/x.ts', 'vendor/glyph.js'), at('tools/explain.ts', 'tools/lib/explain-check.ts'), at('tools/repo/build-cli.ts', 'test/lib/x.ts')])
    assert.ok(!RULES.command!(i), show(i));
});
