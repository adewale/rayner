import {gzipSync} from 'node:zlib';

export const PAGE_BUDGET = {htmlBytes: 1536 * 1024, gzipBytes: 450 * 1024} as const;

/** Measure the complete portable document, including poster, transcript and embedded data. */
export function pageSize(html: string) {
  const bytes = Buffer.byteLength(html);
  const gzipBytes = gzipSync(html).byteLength;
  if (bytes > PAGE_BUDGET.htmlBytes || gzipBytes > PAGE_BUDGET.gzipBytes)
    throw new Error(`the page is over its size budget, ${bytes} raw bytes (limit ${PAGE_BUDGET.htmlBytes}) and ${gzipBytes} gzip bytes (limit ${PAGE_BUDGET.gzipBytes}); reduce the scenarios or split the explanation`);
  return {bytes, gzipBytes};
}
