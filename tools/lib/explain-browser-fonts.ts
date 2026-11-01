// Ordinary pages use equivalent SFNT faces. Requested lettering keeps WOFF2 support.
import type { Plugin } from 'esbuild';
import { join, resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { sfntSource } from './glyph-sfnt.ts';
export function browserFonts(root: string): Plugin {
  return {
    name: 'embedded-sfnt-fonts',
    setup(b) {
      b.onResolve({ filter: /(?:font-data\.ts|glyph\.js)$/ }, (args) => {
        const file = resolve(args.resolveDir, args.path);
        if (file === join(root, 'src/font-data.ts')) return { path: join(root, 'vendor/font-data-sfnt.json') };
        if (file === join(root, 'vendor/glyph.js')) return { path: file, namespace: 'embedded-sfnt' };
        return undefined;
      });
      b.onLoad({ filter: /.*/, namespace: 'embedded-sfnt' }, async (args) => {
        const [source, pin] = await Promise.all([
          readFile(args.path, 'utf8'),
          readFile(join(root, 'vendor/glyph.pin.json'), 'utf8'),
        ]);
        return { contents: sfntSource(source, JSON.parse(pin).sha256), loader: 'js' };
      });
    },
  };
}
