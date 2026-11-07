// The layers of the code and the direction of their imports (docs/ENGINE.md, "Layers"): each layer
// imports only the layers under it. This holds the rules the code keeps today. The one import the
// section records as a departure, the kit naming the stage's type, is allowed here as exactly that
// and no wider. Every module under explain/ is placed in a layer, so a new one must be placed
// before the rules can judge it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import ts from 'typescript';

const ROOT = resolve(import.meta.dirname, '..');

/** The explainer layer's modules, by layer, from the bottom. */
const EXPLAIN: Record<string, readonly string[]> = {
  core: [
    'audio.ts', 'caption-looks.ts', 'choreograph.ts', 'claims.ts', 'intent.ts', 'layout-direction.ts', 'look.ts', 'machine.ts',
    'mermaid.ts', 'palettes.ts', 'score.ts', 'script.ts', 'settings.ts', 'state.ts', 'trace.ts', 'view.ts', 'words.ts',
  ],
  diagrams: ['diagrams.ts', 'panels.ts'],
  kit: ['annotate.ts', 'drawing.ts', 'geo.ts', 'seen-from.ts'],
  stage: ['stage.ts', 'index.ts'],
  tooling: ['describe.ts', 'project.ts', 'testing.ts'],
};
const ORDER = ['core', 'diagrams', 'kit', 'stage', 'tooling'] as const;

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

test('every module under explain/ is placed in one layer', () => {
  const placed = Object.values(EXPLAIN).flat();
  assert.deepEqual(sources('explain').map((f) => f.slice('explain/'.length)).filter((f) => !placed.includes(f)), [], 'place the module in a layer above');
  assert.deepEqual(placed.filter((f, i) => placed.indexOf(f) !== i), [], 'a module is in one layer');
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
