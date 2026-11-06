// Published Node entrypoints are JavaScript: Node does not strip TS in node_modules.
import { build } from 'esbuild';
import { chmod } from 'node:fs/promises';
import { resolve, relative, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));
await build({
  entryPoints: [join(root, 'tools/explain.ts')],
  outdir: join(root, 'dist/tools'),
  bundle: true,
  splitting: true,
  format: 'esm',
  platform: 'node',
  target: 'node24',
  packages: 'external',
  logLevel: 'silent',
  plugins: [
    {
      name: 'one-compiled-runtime',
      setup(b) {
        b.onResolve({ filter: /^\.?\.?\// }, (args) => {
          const file = resolve(args.resolveDir, args.path),
            name = relative(root, file).replaceAll('\\', '/');
          if (
            name.startsWith('src/') ||
            name.startsWith('explain/') ||
            /^integrations\/agentic-mermaid\/[^/]+\.ts$/.test(name)
          )
            return { path: '../' + name.replace(/\.ts$/, '.js'), external: true };
          return undefined;
        });
      },
    },
  ],
});
await chmod(join(root, 'dist/tools/explain.js'), 0o755);
