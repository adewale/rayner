import { readFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { COMPILED } from './roots.ts';
import { listTree, relativePosix, sha256 } from './hash.ts';

// Runtime assets are deliberately broad; Node tools follow the actual producer
// imports. A reviewer, benchmark or release-script edit does not change a page.
const producers = ['tools/lib/explain-build.ts', 'tools/lib/explain-project.ts', 'tools/lib/explain-shots.ts', 'tools/repo/lib/explain-gallery.ts', 'tools/lib/explain-embed-size.ts', 'tools/repo/lib/explain-site-describe.ts'];
/** Existing local runtime imports, including re-exports and literal dynamic imports. */
export async function importClosure(root: string, entries: readonly string[]): Promise<string[]> {
  root = resolve(root);
  const { default: ts } = await import('typescript');
  const visited = new Set<string>(), files: string[] = [];
  const visit = async (file: string): Promise<void> => {
    if (visited.has(file)) return;
    visited.add(file);
    const text = await readFile(file, 'utf8').catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return undefined;
      throw error;
    });
    if (text === undefined) return;
    files.push(relativePosix(root, file));
    const imports: string[] = [];
    const ast = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
    const walk = (node: import('typescript').Node) => {
      if (ts.isImportDeclaration(node) && !node.importClause?.isTypeOnly && ts.isStringLiteral(node.moduleSpecifier)) {
        const clause = node.importClause, bindings = clause?.namedBindings;
        if (!bindings || !ts.isNamedImports(bindings) || clause?.name || bindings.elements.some(e => !e.isTypeOnly)) imports.push(node.moduleSpecifier.text);
      } else if (ts.isExportDeclaration(node) && !node.isTypeOnly && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) imports.push(node.moduleSpecifier.text);
      else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) imports.push(node.arguments[0].text);
      ts.forEachChild(node, walk);
    };
    walk(ast);
    for (const name of imports) {
      if (!name.startsWith('.')) continue;
      const dependency = resolve(dirname(file), name);
      if (dependency.startsWith(root + sep)) await visit(dependency);
    }
  };
  for (const name of entries) await visit(join(root, name));
  return files.sort();
}
export async function buildInputs(root: string) {
  root = resolve(root);
  const compiled = COMPILED;
  // Each input by its path in the package (or the checkout).
  const files = new Map<string, string>();
  const add = (base: string, file: string) => files.set(relativePosix(base, file), file);
  const scan = async (base: string, entries: string[], directories: string[]) => {
    for (const name of entries) add(base, join(base, name));
    for (const directory of directories) {
      const found = await listTree(join(base, directory), { optional: true });
      for (const entry of found) if (entry.isFile()) add(base, join(entry.parentPath, entry.name));
    }
  };
  const runtime = ['src', 'explain', 'extras', 'vendor'], built = ['dist/src', 'dist/explain', 'dist/extras', 'dist/vendor'];
  await scan(root, ['package.json', 'LICENSE'], [...runtime, 'app', 'integrations', ...(compiled ? [...built, 'dist/tools'] : [])]);
  // Installed tools are bundled chunks, so their bundle bytes are the producer inputs.
  if (!compiled) for (const name of await importClosure(root, producers)) add(root, join(root, name));
  // Dynamic capture assets and catalog/export orchestration are not JS imports.
  for (const name of ['tools/lettering.py', 'tools/lettering-requirements.txt', 'tools/repo/explain-demos.ts', 'tools/repo/explain-site.ts', 'package-lock.json', 'scenes/explainers/catalog.ts']) {
    try { await readFile(join(root, name)); add(root, join(root, name)); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
  const inputs = await Promise.all([...files].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(async ([file, path]) => ({
    file, sha256: sha256(await readFile(path)),
  })));
  return { version: 1, inputs, hash: sha256(JSON.stringify(inputs)) };
}
