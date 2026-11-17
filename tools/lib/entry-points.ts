// The library's entry points, read from the `rayner` package's own package.json "exports": this
// repository's in a checkout, the installed package's (ROOT) in the installed command, so the command
// always maps the entry points the library it runs actually has.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './roots.ts';

const read = new Map<string, ReadonlyMap<string, string>>();
/**
 * Each entry point's package name ('rayner', 'rayner/explain', ...) and the module it is built from,
 * without its extension ('src/index', 'explain/index', ...), in "exports" order.
 */
export function entryPoints(root = ROOT): ReadonlyMap<string, string> {
  let out = read.get(root);
  if (!out) {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { exports: Record<string, string | { types: string }> };
    const map = new Map<string, string>();
    for (const [subpath, target] of Object.entries(pkg.exports))
      if (typeof target === 'object')
        map.set(subpath === '.' ? 'rayner' : `rayner/${subpath.slice(2)}`, target.types.replace(/^\.\/dist\//, '').replace(/\.d\.ts$/, ''));
    read.set(root, (out = map));
  }
  return out;
}

/**
 * Source as an author's project holds it: the repository's engine imports ('../../../src/index.ts',
 * at any depth, in either quote) become the package's ('rayner'). Other relative imports are kept.
 */
export function packageImports(source: string, root = ROOT): string {
  const names = new Map([...entryPoints(root)].map(([name, module]) => [module, name]));
  return source.replace(/(['"])(?:\.\.\/)+([\w/-]+)\.ts\1/g, (whole, quote: string, module: string) =>
    names.has(module) ? quote + names.get(module)! + quote : whole);
}
