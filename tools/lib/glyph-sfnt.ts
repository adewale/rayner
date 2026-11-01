import { createHash } from 'node:crypto';
/** Remove only the pinned WOFF2 decoder; glyph parsing and shaping stay unchanged. */
export function sfntSource(source: string, sha256: string): string {
  if (createHash('sha256').update(source).digest('hex') !== sha256)
    throw new Error('Review the full glyph bundle pin before deriving its SFNT loader');
  for (const part of ['brotli: jsBrotli, ...ports', 'brotli: autoBrotli, ...ports']) {
    if (source.split(part).length !== 2) throw new Error(`The pinned glyph loader changed: ${part}`);
    source = source.replace(part, '...ports');
  }
  const begin = source.indexOf('// glyph/glyph/woff2/src/brotli-data.js');
  const end = source.indexOf('// glyph/glyph/sfnt/src/containers.js');
  if (begin < 0 || end <= begin) throw new Error('The pinned Brotli section changed');
  return source.slice(0, begin) + source.slice(end);
}
