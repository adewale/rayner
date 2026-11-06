import {gzipSync} from 'node:zlib';

export const PAGE_BUDGET = {htmlBytes: 1536 * 1024, gzipBytes: 450 * 1024} as const;

/** Measure the complete portable document, including poster, transcript and embedded data. */
export function pageSize(html: string) {
  const bytes = Buffer.byteLength(html);
  const gzipBytes = gzipSync(html).byteLength;
  if (bytes > PAGE_BUDGET.htmlBytes || gzipBytes > PAGE_BUDGET.gzipBytes)
    throw new Error(`Page exceeds its size budget: ${bytes} raw bytes (limit ${PAGE_BUDGET.htmlBytes}), ${gzipBytes} gzip bytes (limit ${PAGE_BUDGET.gzipBytes}). Reduce scenarios or split the explanation.`);
  return {bytes, gzipBytes};
}
