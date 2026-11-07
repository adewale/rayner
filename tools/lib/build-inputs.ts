import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import ts from 'typescript';
import { COMPILED, LIB_ROOT, ROOT } from './roots.ts';

// Runtime assets are deliberately broad; Node tools follow the actual producer
// imports. A reviewer, benchmark or release-script edit does not change a page.
const producers = ['tools/lib/explain-build.ts', 'tools/lib/explain-project.ts', 'tools/lib/explain-shots.ts', 'tools/repo/lib/explain-gallery.ts', 'tools/repo/lib/explain-embed-size.ts', 'tools/repo/lib/explain-site-describe.ts'];
export async function buildInputs(root: string, library = resolve(root) === resolve(ROOT) ? LIB_ROOT : root) {
  root = resolve(root);
  library = resolve(library);
  const compiled = COMPILED;
  // Each input by its name: the command's files by their path in it, the library's (when it is
  // another package, as for the installed command) under rayner/.
  const files = new Map<string, string>();
  const add = (base: string, prefix: string, file: string) => files.set(prefix + relative(base, file).split(sep).join('/'), file);
  const scan = async (base: string, prefix: string, entries: string[], directories: string[]) => {
    for (const name of entries) add(base, prefix, join(base, name));
    for (const directory of directories) {
      const found = await readdir(join(base, directory), { recursive: true, withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') return [];
        throw error;
      });
      for (const entry of found) if (entry.isFile()) add(base, prefix, join(entry.parentPath, entry.name));
    }
  };
  const runtime = ['src', 'explain', 'integrations', 'vendor'], built = ['dist/src', 'dist/explain', 'dist/integrations', 'dist/vendor'];
  if (library === root) await scan(root, '', ['package.json', 'LICENSE'], [...runtime, 'app', ...(compiled ? [...built, 'dist/app', 'dist/tools'] : [])]);
  else {
    await scan(root, '', ['package.json', 'LICENSE'], ['app', 'integrations', 'vendor', ...(compiled ? ['dist/tools'] : [])]);
    await scan(library, 'rayner/', ['package.json', 'LICENSE'], [...runtime, ...built]);
  }
  const visited = new Set<string>();
  const visit = async (file: string): Promise<void> => {
    if (visited.has(file)) return;
    visited.add(file);
    const text = await readFile(file, 'utf8').catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return undefined;
      throw error;
    });
    if (text === undefined) return;
    add(root, '', file);
    const imports: string[] = [];
    const ast = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
    const walk = (node: ts.Node) => {
      if (ts.isImportDeclaration(node) && !node.importClause?.isTypeOnly && ts.isStringLiteral(node.moduleSpecifier)) {
        const clause = node.importClause;
        const bindings = clause?.namedBindings;
        if (!bindings || !ts.isNamedImports(bindings) || clause?.name || bindings.elements.some(e => !e.isTypeOnly)) imports.push(node.moduleSpecifier.text);
      } else if (ts.isExportDeclaration(node) && !node.isTypeOnly && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) imports.push(node.moduleSpecifier.text);
      else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) imports.push(node.arguments[0].text);
      ts.forEachChild(node, walk);
    };
    walk(ast);
    for (const name of imports) {
      if (!name.startsWith('.')) continue;
      const dependency = resolve(dirname(file), name);
      if (!dependency.startsWith(root + sep)) continue;
      await visit(dependency);
    }
  };
  // Installed tools are bundled chunks, so their bundle bytes are the producer inputs.
  if (!compiled) for (const name of producers) await visit(join(root, name));
  // Dynamic capture assets and catalog/export orchestration are not JS imports.
  for (const name of ['tools/lettering.py', 'tools/lettering-requirements.txt', 'tools/repo/explain-demos.ts', 'tools/repo/explain-site.ts', 'package-lock.json', 'cli/package.json', 'scenes/explainers/catalog.ts']) {
    try { await readFile(join(root, name)); add(root, '', join(root, name)); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
  const inputs = await Promise.all([...files].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(async ([file, path]) => ({
    file, sha256: createHash('sha256').update(await readFile(path)).digest('hex'),
  })));
  return { version: 1, inputs, hash: createHash('sha256').update(JSON.stringify(inputs)).digest('hex') };
}
