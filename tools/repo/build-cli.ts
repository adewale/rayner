// Builds the rayner-cli package into cli/ (or --out <dir>): the command bundled into dist/tools/,
// beside the files it reads at run time (the player in app/, the capture tools and their inputs).
// cli/package.json and cli/README.md are checked in; everything else there is generated.
// Published Node entrypoints are JavaScript: Node does not strip TS in node_modules.
import { build } from 'esbuild';
import type { Metafile } from 'esbuild';
import { chmod, copyFile, cp, mkdir, readFile, rm } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { realpathSync } from 'node:fs';

export const ROOT = fileURLToPath(new URL('../../', import.meta.url));
/** What rayner-cli ships beside its bundle, as paths in this repository and in the package. */
export const CLI_FILES = [
  'app',
  // Diagram capture is bundled; its sources are inputs of the natural-label metric policy.
  'integrations/agentic-mermaid/build',
  // Lettering capture: the shaper, its pinned requirements, the font fetcher and the maths typesetter.
  'tools/lettering.py',
  'tools/lettering-requirements.txt',
  'tools/lettering-outline-fonts.sh',
  'vendor/glyph-math.js',
  // The faces build-time lettering cuts, and the notices every page carries.
  'vendor/lettering',
  'vendor/licenses',
  'LICENSE',
];
/** The library's modules, which the command imports from the installed rayner package. */
export const libraryModule = (name: string) =>
  name.startsWith('src/') || name.startsWith('explain/') || /^integrations\/agentic-mermaid\/[^/]+\.ts$/.test(name);

export async function buildCli(out = join(ROOT, 'cli')): Promise<Metafile> {
  out = resolve(out);
  for (const generated of ['dist', 'app', 'integrations', 'tools', 'vendor', 'LICENSE']) await rm(join(out, generated), { recursive: true, force: true });
  await mkdir(out, { recursive: true });
  if (out !== join(ROOT, 'cli')) for (const file of ['package.json', 'README.md']) await copyFile(join(ROOT, 'cli', file), join(out, file));
  const policy = join(ROOT, 'integrations/agentic-mermaid/build/index.ts');
  const result = await build({
    entryPoints: [join(ROOT, 'tools/explain.ts')],
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
          // reached through rayner's internal entry: the same files `rayner` itself loads.
          b.onResolve({ filter: /^\.?\.?\// }, (args) => {
            const name = relative(ROOT, resolve(args.resolveDir, args.path)).replaceAll('\\', '/');
            if (libraryModule(name)) return { path: 'rayner/internal/' + name.replace(/\.ts$/, '.js'), external: true };
            return undefined;
          });
          // The metric policy hashes its inputs relative to one folder; installed, they are in two
          // packages. The shipped index.ts stays the hashed source; only the bundled copy reads
          // each input from the package that ships it (tools/lib/roots.ts, policyFile).
          b.onLoad({ filter: /[/\\]integrations[/\\]agentic-mermaid[/\\]build[/\\]index\.ts$/ }, async (args) => {
            if (resolve(args.path) !== policy) return undefined;
            const source = await readFile(args.path, 'utf8'), read = "await readFile(new URL(file, policyRoot), 'utf8')";
            if (source.split(read).length !== 2) throw new Error(`${relative(ROOT, policy)} no longer reads its metric inputs as ${read}; update tools/repo/build-cli.ts`);
            return {
              contents: `import { policyFile as rayner_policyFile } from ${JSON.stringify(join(ROOT, 'tools/lib/roots.ts'))};\n` + source.replace(read, "await readFile(rayner_policyFile(file), 'utf8')"),
              loader: 'ts',
              resolveDir: dirname(args.path),
            };
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
