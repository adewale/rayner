import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import ts from 'typescript';

// Runtime assets are deliberately broad; Node tools follow the actual producer
// imports. A reviewer, benchmark or release-script edit does not change a page.
const producers = ['explain-build', 'explain-project', 'explain-shots', 'explain-gallery', 'explain-embed-size', 'explain-site-describe'];
export async function buildInputs(root: string) {
  root = resolve(root);
  const compiled = import.meta.url.endsWith('.js');
  const files = new Set<string>(['package.json', 'LICENSE']);
  const directories = ['src', 'explain', 'integrations', 'app', 'vendor'];
  if (compiled) directories.push('dist/src', 'dist/explain', 'dist/integrations', 'dist/app', 'dist/tools');
  for (const directory of directories) {
    const entries = await readdir(join(root, directory), { recursive: true, withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return [];
      throw error;
    });
    for (const entry of entries)
      if (entry.isFile()) files.add(relative(root, join(entry.parentPath, entry.name)).split(sep).join('/'));
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
    files.add(relative(root, file).split(sep).join('/'));
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
  if (!compiled) for (const name of producers) await visit(join(root, 'tools/lib', name + '.ts'));
  // Dynamic capture assets and catalog/export orchestration are not JS imports.
  for (const name of ['tools/lettering.py', 'tools/lettering-requirements.txt', 'tools/explain-demos.ts', 'tools/explain-site.ts', 'package-lock.json', 'scenes/explainers/catalog.ts']) {
    try { await readFile(join(root, name)); files.add(name); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
  const inputs = await Promise.all([...files].sort().map(async file => ({
    file, sha256: createHash('sha256').update(await readFile(join(root, file))).digest('hex'),
  })));
  return { version: 1, inputs, hash: createHash('sha256').update(JSON.stringify(inputs)).digest('hex') };
}
