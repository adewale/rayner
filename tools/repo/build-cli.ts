// Builds the rayner-cli package into cli/ (or --out <dir>): the command bundled into dist/tools/,
// beside the files it reads at run time (the player in app/, the capture tools and their inputs).
// cli/package.json and cli/README.md are checked in; everything else there is generated.
// Published Node entrypoints are JavaScript: Node does not strip TS in node_modules.
import { build } from 'esbuild';
import type { Metafile } from 'esbuild';
import { chmod, copyFile, cp, mkdir, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { realpathSync } from 'node:fs';

import { ROOT, LIBRARY } from '../lib/roots.ts';
import { relativePosix } from '../lib/hash.ts';
export { ROOT };
/** What rayner-cli ships beside its bundle, as paths in this repository and in the package. */
export const CLI_FILES = [
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
/** The library's modules, which the command imports from the installed rayner package: its sources and the shaper it ships. */
export const libraryModule = (name: string) =>
  name.startsWith('src/') || name.startsWith('explain/') || name === 'vendor/glyph.js';

export async function buildCli(out = join(ROOT, 'cli')): Promise<Metafile> {
  out = resolve(out);
  for (const generated of ['dist', 'app', 'tools', 'vendor', 'LICENSE']) await rm(join(out, generated), { recursive: true, force: true });
  await mkdir(out, { recursive: true });
  if (out !== join(ROOT, 'cli')) for (const file of ['package.json', 'README.md']) await copyFile(join(ROOT, 'cli', file), join(out, file));
  const result = await build({
    // tools/installed.ts registers the hook that resolves LIBRARY, then loads the command.
    entryPoints: [{ in: join(ROOT, 'tools/installed.ts'), out: 'explain' }],
    absWorkingDir: ROOT,
    outdir: join(out, 'dist/tools'),
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
          // The command and the scenes it loads share the library's compiled modules (one engine),
          // reached by the private specifier LIBRARY: the same files `rayner` itself loads.
          b.onResolve({ filter: /^\.?\.?\// }, (args) => {
            const name = relativePosix(ROOT, resolve(args.resolveDir, args.path));
            if (libraryModule(name)) return { path: LIBRARY + name.replace(/\.ts$/, '.js'), external: true };
            return undefined;
          });
        },
      },
    ],
  });
  await chmod(join(out, 'dist/tools/explain.js'), 0o755);
  for (const file of CLI_FILES) await cp(join(ROOT, file), join(out, file), { recursive: true });
  return result.metafile;
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(resolve(process.argv[1]))).href) {
  const { values } = parseArgs({ options: { out: { type: 'string' } } });
  await buildCli(values.out);
}
