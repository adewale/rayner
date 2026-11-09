// Ordinary pages use equivalent SFNT faces. Requested lettering keeps WOFF2 support.
// The SFNT faces and the shaper's pin are the command's own files (rayner-cli ships them); the
// shaper is the library's, which ships it once (GLYPH).
import type { Plugin } from 'esbuild';
import { join, resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { sfntSource } from './glyph-sfnt.ts';
import { GLYPH, LIB_ROOT, ROOT } from './roots.ts';
export function browserFonts(): Plugin {
  return {
    name: 'embedded-sfnt-fonts',
    setup(b) {
      b.onResolve({ filter: /(?:font-data\.ts|glyph\.js)$/ }, (args) => {
        const file = resolve(args.resolveDir, args.path);
        if (file === join(LIB_ROOT, 'src/font-data.ts')) return { path: join(ROOT, 'vendor/font-data-sfnt.json') };
        if (file === join(LIB_ROOT, 'vendor/glyph.js')) return { path: GLYPH, namespace: 'embedded-sfnt' };
        return undefined;
      });
      b.onLoad({ filter: /.*/, namespace: 'embedded-sfnt' }, async (args) => {
        const [source, pin] = await Promise.all([
          readFile(args.path, 'utf8'),
          readFile(join(ROOT, 'vendor/glyph.pin.json'), 'utf8'),
        ]);
        return { contents: sfntSource(source, JSON.parse(pin).sha256), loader: 'js' };
      });
    },
  };
}
