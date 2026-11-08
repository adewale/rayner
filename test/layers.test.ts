// The layers of the code and the direction of their imports (docs/ENGINE.md, "Layers"): each layer
// imports only the layers under it. This holds the rules the code keeps today. The one import the
// section records as a departure, the kit naming the stage's type, is allowed here as exactly that
// and no wider. Every module under explain/ is placed in a layer by the section's table, which this
// test reads, so a new one must be placed in the doc before the rules can judge it. Of a step's
// metadata the engine types and reads only its caption, as the section records; the explainer layer
// declares the rest.
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

interface Import { from: string; to: string; type: boolean }

/** Every import and re-export a file makes, static or dynamic, resolved to a repository path when relative. */
function importsOf(file: string): Import[] {
  const source = ts.createSourceFile(file, readFileSync(join(ROOT, file), 'utf8'), ts.ScriptTarget.Latest, true);
  const out: Import[] = [];
  const add = (spec: string, type: boolean) =>
    out.push({ from: file, to: spec.startsWith('.') ? relative(ROOT, resolve(ROOT, dirname(file), spec)) : spec, type });
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
  const at = (from: string, to: string, type = false): Import => ({ from, to, type });
  const rejected = {
    engine: at('src/scene.ts', 'explain/stage.ts', true),
    integration: at('integrations/agentic-mermaid/snapshot.ts', 'explain/look.ts'),
    explain: at('explain/stage.ts', 'app/embed.ts'),
    player: at('app/embed.ts', 'tools/lib/browser.ts'),
  };
  for (const [rule, i] of Object.entries(rejected)) assert.ok(RULES[rule]!(i), `${rule}: ${show(i)}`);
  for (const i of [at('explain/look.ts', 'explain/stage.ts', true), at('explain/panels.ts', 'explain/stage.ts'), at('explain/drawing.ts', 'explain/stage.ts'),
    at('explain/panels.ts', 'explain/drawing.ts'), at('explain/stage.ts', 'explain/testing.ts')])
    assert.ok(RULES.layers!(i), show(i));
  for (const i of [at('explain/drawing.ts', 'explain/stage.ts', true), at('explain/stage.ts', 'explain/drawing.ts'), at('explain/describe.ts', 'explain/stage.ts'),
    at('explain/diagrams.ts', 'explain/look.ts')])
    assert.ok(!RULES.layers!(i), show(i));
  assert.ok(RULES.explain!(at('explain/diagrams.ts', 'integrations/agentic-mermaid/build/index.ts')), 'the capture half');
});
