// The layers of the code and the direction of their imports (docs/ENGINE.md, "Layers"): each layer
// imports only the layers under it. This holds the rules the code keeps today. The one import the
// section records as a departure, the kit naming the stage's type, is allowed here as exactly that
// and no wider. Every module under explain/ is placed in a layer by the section's table, which this
// test reads, so a new one must be placed in the doc before the rules can judge it. Of a step's
// metadata the engine types and reads only its caption, as the section records; the explainer layer
// declares the rest. The command imports nothing repository-only. Every crossing into the library from
// above it is visible: the player, the command and diagram capture import the library through its entry
// points and its two internal barrels, which list exactly the names they use beyond the public API, and
// the @internal members used across the layers are listed here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import ts from 'typescript';

const ROOT = resolve(import.meta.dirname, '..');

const ORDER = ['core', 'diagrams', 'kit', 'stage', 'tooling', 'internal'] as const;
/** The rows of ENGINE.md's layer table that place explain/ modules, by layer. */
const ROWS: Record<(typeof ORDER)[number], string> = {
  core: 'Explain core', diagrams: 'Diagrams and panels', kit: 'Drawing kit', stage: 'Stage', tooling: 'Author tooling', internal: 'Internal interface',
};

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
/** The command's modules: tools/ but the repository-only tooling (tools/repo/) and the oracles (tools/oracle/). */
const isCommand = (path: string) => path.startsWith('tools/') && !/^tools\/(repo|oracle)\//.test(path);
/** What ships above the library and imports it: the player, the command and diagram capture, which the command runs. */
const isAbove = (path: string) => path.startsWith('app/') || isCommand(path) || path.startsWith('integrations/');
const ABOVE = [...sources('app'), ...sources('tools').filter(isCommand), ...sources('integrations')];
/** The library's entry points, from package.json "exports", as the sources they are built from. */
const ENTRIES = Object.values(JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).exports as Record<string, string | { types: string }>)
  .flatMap((t) => (typeof t === 'object' ? [t.types.replace(/^\.\/dist\//, '').replace(/\.d\.ts$/, '.ts')] : []));
/** The library's internal interface: one barrel per layer, re-exporting what the layers above use beyond the entry points. */
const BARRELS = ['src/internal.ts', 'explain/internal.ts'];
const layerOf = (path: string) => (path.startsWith('explain/') ? ORDER.find((l) => EXPLAIN[l]!.includes(path.slice('explain/'.length))) : undefined);

/** The rules, each true of an import that breaks it. */
const RULES: Record<string, (i: Import) => boolean> = {
  engine: (i) => i.from.startsWith('src/') && !i.to.startsWith('src/') && i.to !== 'vendor/glyph.js',
  explain: (i) => i.from.startsWith('explain/') && !i.to.startsWith('src/') && !i.to.startsWith('explain/'),
  layers: (i) => {
    const from = layerOf(i.from), to = layerOf(i.to);
    if (!from || !to || from === to) return false;
    // The departure ENGINE.md records: a kit function takes the stage, for its colours and shaping.
    if (from === 'kit' && i.to === 'explain/stage.ts' && i.type) return false;
    return ORDER.indexOf(to) > ORDER.indexOf(from);
  },
  player: (i) => i.from.startsWith('app/') && !/^(src|explain|app)\//.test(i.to),
  // The command (tools/ but the repository's own tooling and oracles) ships as rayner-cli: it imports the library,
  // the player, diagram capture, the vendored shapers, its own modules and packages, never what stays in the repository.
  command: (i) => isCommand(i.from) && i.local && !/^(src|explain|app|integrations|vendor)\//.test(i.to) && !(i.to.startsWith('tools/') && isCommand(i.to)),
  // What ships above the library reaches it as an outside project does, through its entry points, and
  // beyond them only through the internal barrels.
  through: (i) => isAbove(i.from) && /^(src|explain)\//.test(i.to) && !ENTRIES.includes(i.to) && !BARRELS.includes(i.to),
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
  assert.deepEqual(layerTable(doc).find((r) => r.layer === 'Author tooling')!.modules, ['describe.ts', 'project.ts', 'test-helpers.ts', 'testing.ts'], 'the engine\'s src/testing.ts is not an explain module');
});

test('the engine imports nothing outside src/ but its vendored shaper', () => {
  assert.deepEqual(broken('engine', importsIn('src')), []);
});

test('the explainer layer imports only the engine and itself', () => {
  assert.deepEqual(broken('explain', importsIn('explain')), [], 'no player, command, tests, scenes, capture or packages');
});

test('inside explain/, each layer imports only the layers under it; the kit names the stage as a type only', () => {
  assert.deepEqual(broken('layers', importsIn('explain')), []);
});

test('the player imports the library and nothing from the command, the tests, the scenes or capture', () => {
  assert.deepEqual(broken('player', importsIn('app')), []);
});

test('the command imports the library, the player, diagram capture and its own modules, never repository-only code', () => {
  assert.deepEqual(broken('command', importsIn('tools').filter((i) => isCommand(i.from))), []);
});

test('the player, the command and diagram capture import the library through its entry points and its internal barrels only', () => {
  assert.deepEqual(broken('through', ABOVE.flatMap(importsOf)), [], 'import a public name from its entry point, and any other through src/internal.ts or explain/internal.ts');
});

/**
 * The @internal members used across the layers, with the files that use each: the engine's (src/) that
 * the explainer layer, the player, the command or diagram capture use, and the explainer layer's that
 * the player, the command or diagram capture use. The published types leave them out, so they are an
 * interface between the layers that no barrel can list (a member is reached through its object): each
 * is listed here, and a new use, by another file or of another member, fails the test until it is
 * added, with its reason. A module-level name the layers above use is in an internal barrel instead.
 */
const INTERNAL_USES: Record<string, { files: string[]; why: string }> = {
  'Machine.after': { files: ['tools/lib/explain-check.ts'], why: 'check reads the state an event leads to' },
  'Machine.lastPlayedIn': { files: ['tools/lib/explain-check.ts'], why: 'check explores a machine on the step it last played in' },
  'Machine.identity': { files: ['tools/lib/explain-check.ts'], why: "check tells a scene's machines apart across runs" },
  'Machine.model': { files: ['tools/lib/explain-check.ts'], why: 'check asks the model alone whether an event beyond the story is refused' },
  'Machine.outcome': { files: ['app/embed-live.ts', 'tools/lib/explain-live-review.ts'], why: 'the live player and its review read what an event led to' },
  'Machine.playedUnder': { files: ['tools/lib/explain-check.ts'], why: 'check redraws under what the machine last played under' },
  'Machine.reachable': { files: ['tools/lib/explain-check.ts', 'tools/lib/explain-live-review.ts'], why: 'check and the live review explore every reachable state' },
  'Machine.transitionPlay': { files: ['tools/lib/explain-check.ts'], why: "check plays each transition to compare where it ends with the state's picture" },
  MadeAtTurn: { files: ['explain/action.ts', 'explain/machine.ts'], why: "an action's beat and a machine's transition are made at their turn" },
  'MotionSink.frames': { files: ['tools/lib/explain-check.ts'], why: 'check reports how many frames its motion check sampled' },
  'View.placed': { files: ['tools/lib/explain-check.ts'], why: 'check redraws a view where it was placed' },
  affine: { files: ['explain/diagram-text.ts'], why: "a captured label takes the SVG's transform" },
  curveCount: { files: ['explain/diagrams.ts'], why: 'a link is a route with curves' },
  interpolateData: { files: ['explain/labels.ts'], why: 'a label interpolates its own data' },
  matchingFrameFor: { files: ['explain/labels.ts'], why: "a captured label gives a matching transform a frame in its text's units" },
  mergeLeaves: { files: ['explain/diagrams.ts'], why: "a diagram's labels draw as one element" },
  replaceChild: { files: ['explain/annotate.ts'], why: 'an annotation swaps a drawn part inside its group' },
  adoptMembers: { files: ['explain/action.ts'], why: 'an action decided late takes its beats as its members then' },
  advanceBox: { files: ['explain/labels.ts'], why: "a label's size is its text's advance box" },
  beginAnimation: { files: ['explain/choreograph.ts', 'explain/diagrams.ts', 'explain/view.ts'], why: 'an animation that runs another begins it, and a diagram moves a hidden part at once' },
  buildText: { files: ['explain/diagram-text.ts'], why: 'a captured label lays out its replayed run as a Text does' },
  cleanUp: { files: ['explain/choreograph.ts', 'explain/state.ts'], why: "the explainer layer's animations say what the end of their play takes off the stage" },
  drawFrame: { files: ['explain/live.ts'], why: 'a live run draws its landing frames between plays, kept parts raised' },
  ended: { files: ['explain/action.ts'], why: "an action's end runs once its last beat has finished" },
  families: { files: ['explain/annotate.ts'], why: 'an annotation reads what an animation draws' },
  finishAnimation: { files: ['explain/choreograph.ts', 'explain/diagrams.ts', 'explain/view.ts'], why: 'an animation that runs another finishes it, and a diagram moves a hidden part at once' },
  interpolateAnimation: { files: ['explain/choreograph.ts', 'explain/view.ts'], why: 'an animation that runs another draws its frames' },
  isRemover: { files: ['explain/state.ts'], why: 'a Follow removes its targets when it is a remover' },
  keepOnTop: { files: ['explain/stage.ts'], why: 'the stage keeps its heading drawn last' },
  knownTransform: { files: ['explain/view.ts'], why: 'a view morphs a picture of the same structure without aligning it' },
  passesEasing: { files: ['explain/action.ts'], why: "a play's rateFunc and lagRatio reach what an action's beats make" },
  runTimeOf: { files: ['explain/action.ts'], why: "an action checks its beats' run times against its plan" },
  playsOn: { files: ['explain/action.ts', 'explain/state.ts'], why: 'an action and a state change belong to the scene they change' },
  setDrawn: { files: ['explain/stage.ts'], why: 'the checks and close-ups draw a step without its heading, then put the list back' },
  settle: { files: ['explain/action.ts'], why: 'an action is decided once what it reads is ready' },
  stopAt: { files: ['explain/live.ts'], why: 'the run to a live step stops as the step ends' },
  textRun: { files: ['explain/diagram-text.ts', 'explain/labels.ts'], why: "a label's words are its text's run, and a captured label sits on its text's baseline" },
  whenReady: { files: ['explain/action.ts'], why: 'an action waits for what it reads before it begins' },
};

/** Every file the type checker reads for the tests below: the library's users, its entry points and barrels, and a seeded user. */
const SEEDED = {
  file: 'app/seeded-defect.ts',
  text: "import type { Machine } from '../explain/machine.ts';\nexport const peek = (m: Machine<object, string>, other: Machine<object, string>) => { other.reachable(); return m.outcome; };\n",
};
let checked: { program: ts.Program; checker: ts.TypeChecker } | undefined;
function typeChecked() {
  if (checked) return checked;
  const options: ts.CompilerOptions = { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext, lib: ['lib.es2023.d.ts', 'lib.dom.d.ts'], types: [], allowImportingTsExtensions: true, noEmit: true, skipLibCheck: true, strict: true };
  const host = ts.createCompilerHost(options);
  const at = join(ROOT, SEEDED.file);
  const { getSourceFile, fileExists, readFile } = host;
  host.fileExists = (f) => f === at || fileExists(f);
  host.readFile = (f) => (f === at ? SEEDED.text : readFile(f));
  host.getSourceFile = (f, language, ...rest) => (f === at ? ts.createSourceFile(f, SEEDED.text, language) : getSourceFile(f, language, ...rest));
  const files = [...sources('explain'), ...ABOVE, ...ENTRIES, ...BARRELS, SEEDED.file];
  const program = ts.createProgram([...new Set(files)].map((f) => join(ROOT, f)), options, host);
  return (checked = { program, checker: program.getTypeChecker() });
}

/** The layer a file is in, for the crossings below: the engine, the explainer layer, or above the library. */
const sideOf = (file: string) => (file.startsWith('src/') ? 'engine' : file.startsWith('explain/') ? 'explain' : 'above');

/**
 * Each @internal member that `files` use across the layers, with the files that use it, read by the
 * type checker (so a member is told from another of the same name): an engine member used outside the
 * engine, or an explainer-layer member used above the library. An engine module-level name the
 * explainer layer uses counts too, since that layer reaches the engine's modules directly.
 */
function internalUses(files: string[]): Record<string, string[]> {
  const { program, checker } = typeChecked();
  const member = (d: ts.Declaration) => ts.isClassLike(d.parent) || ts.isInterfaceDeclaration(d.parent);
  // TypeScript attaches a statement's comment to its first declarator only: a later declarator of
  // `export const a = …, b = …` is read with the statement's tags too.
  const tagsOf = (d: ts.Declaration): readonly ts.JSDocTag[] =>
    ts.isVariableDeclaration(d) && ts.isVariableDeclarationList(d.parent) && ts.isVariableStatement(d.parent.parent)
      ? [...ts.getJSDocTags(d), ...ts.getJSDocTags(d.parent.parent)]
      : ts.getJSDocTags(d);
  const crosses = (d: ts.Declaration, user: string) => {
    const declared = sideOf(relative(ROOT, d.getSourceFile().fileName)), from = sideOf(user);
    if (declared === 'above' || declared === from || !tagsOf(d).some((t) => t.tagName.text === 'internal')) return false;
    return member(d) || (declared === 'engine' && from === 'explain');
  };
  const nameOf = (d: ts.Declaration) => {
    const own = (d as ts.NamedDeclaration).name?.getText() ?? '(anonymous)';
    return member(d) && (d.parent as ts.ClassLikeDeclaration).name ? `${(d.parent as ts.ClassLikeDeclaration).name!.text}.${own}` : own;
  };
  const uses: Record<string, string[]> = {};
  for (const file of files) {
    const found = new Set<string>();
    const visit = (n: ts.Node): void => {
      if (ts.isIdentifier(n)) {
        let symbol = checker.getSymbolAtLocation(n);
        if (symbol && symbol.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
        for (const d of symbol?.declarations ?? []) if (crosses(d, file)) found.add(nameOf(d));
      }
      ts.forEachChild(n, visit);
    };
    visit(program.getSourceFile(join(ROOT, file))!);
    for (const name of found) (uses[name] ??= []).push(file);
  }
  for (const list of Object.values(uses)) list.sort();
  return Object.fromEntries(Object.entries(uses).sort(([a], [b]) => (a < b ? -1 : 1)));
}

test('the @internal members used across the layers are exactly those listed, by the files listed', () => {
  // A seeded use of a machine's internal members, from a file the list does not name, is read as one.
  assert.deepEqual(internalUses([SEEDED.file]), { 'Machine.outcome': [SEEDED.file], 'Machine.reachable': [SEEDED.file] }, 'the seeded file\'s uses are found by member, through a type');
  const listed = Object.fromEntries(Object.entries(INTERNAL_USES).map(([member, { files }]) => [member, files]));
  assert.deepEqual(internalUses([...sources('explain'), ...ABOVE]), listed, 'list each new use of an @internal member across the layers in INTERNAL_USES, with its reason');
});

test('each internal barrel exports exactly the names the layers above use and no entry point exports', () => {
  const { program, checker } = typeChecked();
  const target = (s: ts.Symbol) => (s.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(s) : s);
  const exportsOf = (file: string) => checker.getExportsOfModule(checker.getSymbolAtLocation(program.getSourceFile(join(ROOT, file))!)!);
  const entry = new Set(ENTRIES.flatMap((e) => exportsOf(e).map(target)));
  for (const barrel of BARRELS) {
    const names = exportsOf(barrel);
    assert.deepEqual(names.filter((s) => entry.has(target(s))).map((s) => s.name), [], `${barrel}: import these from their entry point`);
    const used = new Set(ABOVE.flatMap((file) => {
      const source = program.getSourceFile(join(ROOT, file))!;
      return source.statements.flatMap((n) =>
        (ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) && n.moduleSpecifier && ts.isStringLiteral(n.moduleSpecifier) &&
        relative(ROOT, resolve(ROOT, dirname(file), n.moduleSpecifier.text)) === barrel
          ? [...((ts.isImportDeclaration(n) ? (n.importClause?.namedBindings as ts.NamedImports | undefined)?.elements : (n.exportClause as ts.NamedExports | undefined)?.elements) ?? [])].map((e) => (e.propertyName ?? e.name).text)
          : []);
    }));
    assert.deepEqual(names.map((s) => s.name).filter((name) => !used.has(name)), [], `${barrel}: no layer above the library uses these; remove them`);
  }
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
    explain: at('explain/stage.ts', 'app/embed.ts'),
    player: at('app/embed.ts', 'tools/lib/browser.ts'),
    command: at('tools/lib/explain-check.ts', 'tools/repo/lib/public-names.ts'),
    through: at('app/embed.ts', 'explain/look.ts'),
  };
  for (const [rule, i] of Object.entries(rejected)) assert.ok(RULES[rule]!(i), `${rule}: ${show(i)}`);
  for (const i of [at('explain/look.ts', 'explain/stage.ts', true), at('explain/panels.ts', 'explain/stage.ts'), at('explain/drawing.ts', 'explain/stage.ts'),
    at('explain/panels.ts', 'explain/drawing.ts'), at('explain/stage.ts', 'explain/testing.ts')])
    assert.ok(RULES.layers!(i), show(i));
  for (const i of [at('explain/drawing.ts', 'explain/stage.ts', true), at('explain/stage.ts', 'explain/drawing.ts'), at('explain/describe.ts', 'explain/stage.ts'),
    at('explain/diagrams.ts', 'explain/look.ts')])
    assert.ok(!RULES.layers!(i), show(i));
  assert.ok(RULES.explain!(at('explain/diagrams.ts', 'integrations/agentic-mermaid/index.ts')), 'diagram capture');
  assert.ok(RULES.player!(at('app/embed.ts', 'integrations/agentic-mermaid/index.ts')), 'diagram capture');
  for (const i of [at('tools/lib/explain-check.ts', 'src/scene.ts', true), at('integrations/agentic-mermaid/index.ts', 'explain/diagram-snapshot.ts')]) assert.ok(RULES.through!(i), show(i));
  for (const i of [at('app/embed.ts', 'explain/internal.ts'), at('tools/lib/explain-check.ts', 'src/index.ts'), at('tools/lib/x.ts', 'explain/testing.ts'), at('test/x.test.ts', 'explain/look.ts')])
    assert.ok(!RULES.through!(i), show(i));
  for (const i of [at('tools/explain.ts', 'test/lib/random-snapshot.ts'), at('tools/lib/explain-build.ts', 'tools/oracle/glyph-math.ts'), at('tools/lib/x.ts', 'scenes/explainers/catalog.ts'), at('tools/lib/x.ts', 'recipes/render.ts')])
    assert.ok(RULES.command!(i), show(i));
  for (const i of [at('tools/lib/explain-check.ts', 'app/embed-closeup.ts'), at('tools/lib/explain-check.ts', 'explain/live.ts'), at('tools/lib/x.ts', 'esbuild'), at('tools/lib/x.ts', 'node:fs'),
    at('tools/lib/x.ts', 'vendor/glyph.js'), at('tools/explain.ts', 'tools/lib/explain-check.ts'), at('tools/repo/build-cli.ts', 'test/lib/x.ts')])
    assert.ok(!RULES.command!(i), show(i));
});
