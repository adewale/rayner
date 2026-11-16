// Builds the rayner command into dist/tools/ (or --out <dir>): tools/explain.ts and the modules it
// loads, bundled beside the library's compiled modules in dist/. `npm run build` runs it after
// build:lib, and npm pack runs that build, so the archive holds the command as well as the library.
// Published Node entrypoints are JavaScript: Node does not strip TS in node_modules.
import { build } from 'esbuild';
import type { Metafile } from 'esbuild';
import { chmod, mkdir, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { realpathSync } from 'node:fs';

import { ROOT } from '../lib/roots.ts';
import { relativePosix } from '../lib/hash.ts';
export { ROOT };
/** What the command reads at run time beside its bundle, as paths in this repository and in the package. */
export const COMMAND_FILES = [
  // The player, which every page bundles from source.
  'app',
  // Lettering capture: the shaper, its pinned requirements, the font fetcher and the maths typesetter.
  'tools/lettering.py',
  'tools/lettering-requirements.txt',
  'tools/lettering-outline-fonts.sh',
  'vendor/glyph-math.js',
  // The page build's inputs: the embedded faces as SFNT, and the pin of the library's shaper it strips the Brotli decoder from.
  'vendor/font-data-sfnt.json',
  'vendor/glyph.pin.json',
  // The faces build-time lettering cuts, and the notices every page carries.
  'vendor/lettering',
  'vendor/licenses',
  'LICENSE',
];
/** The library's modules: its sources and the shaper it ships, which the command imports from dist/ rather than bundling. */
export const libraryModule = (name: string) =>
  name.startsWith('src/') || name.startsWith('explain/') || name.startsWith('extras/') || name === 'vendor/glyph.js';

export async function buildCommand(out = join(ROOT, 'dist/tools')): Promise<Metafile> {
  out = resolve(out);
  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });
  const result = await build({
    entryPoints: [{ in: join(ROOT, 'tools/explain.ts'), out: 'explain' }],
    absWorkingDir: ROOT,
    outdir: out,
    bundle: true,
    splitting: true,
    format: 'esm',
    platform: 'node',
    target: 'node24',
    packages: 'external',
    metafile: true,
    logLevel: 'silent',
    plugins: [
      {
        name: 'one-compiled-runtime',
        setup(b) {
          // The command and the scenes it loads share the library's compiled modules (one engine). A scene
          // imports `rayner`, which is dist/src/index.js; the command's chunks sit in dist/tools/ and import
          // the same files by relative path, so Node loads each module once.
          b.onResolve({ filter: /^\.?\.?\// }, (args) => {
            const name = relativePosix(ROOT, resolve(args.resolveDir, args.path));
            if (libraryModule(name)) return { path: '../' + name.replace(/\.ts$/, '.js'), external: true };
            return undefined;
          });
        },
      },
    ],
  });
  // Every chunk sits directly in dist/tools/, so '../src/…' from any of them is dist/src/.
  for (const output of Object.keys(result.metafile.outputs))
    if (realpathSync(resolve(ROOT, dirname(output))) !== realpathSync(out)) throw new Error(`the command's chunk ${output} is not directly in ${out}`);
  await chmod(join(out, 'explain.js'), 0o755);
  return result.metafile;
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(resolve(process.argv[1]))).href) {
  const { values } = parseArgs({ options: { out: { type: 'string' } } });
  await buildCommand(values.out);
}
