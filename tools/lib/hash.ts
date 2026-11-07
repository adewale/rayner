// Small file helpers the command and the repository's tools share: content hashes, package
// integrity, '/'-separated paths and recursive listing. (integrations/ keep their own: they ship
// in the library, which never imports tools/.)
import { createHash } from 'node:crypto';
import type { Dirent } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { relative, sep } from 'node:path';

/** SHA-256 of a string (UTF-8) or bytes, as lowercase hex. */
export const sha256 = (value: string | Uint8Array): string => createHash('sha256').update(value).digest('hex');
/** An npm archive's integrity: 'sha512-' and the SHA-512 of its bytes in base64. */
export const integrity = (bytes: Uint8Array): string => 'sha512-' + createHash('sha512').update(bytes).digest('base64');
/** A path with '/' between its parts, whatever the platform's separator. */
export const posixPath = (path: string): string => path.split(sep).join('/');
/** `to` relative to `from`, with '/' between its parts. */
export const relativePosix = (from: string, to: string): string => posixPath(relative(from, to));
/**
 * Everything under `directory`, at any depth (each entry's `parentPath` and `name` locate it).
 * With `optional`, a directory that does not exist holds nothing; otherwise that throws.
 */
export async function listTree(directory: string, { optional = false }: { optional?: boolean } = {}): Promise<Dirent[]> {
  return readdir(directory, { recursive: true, withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
    if (optional && error.code === 'ENOENT') return [];
    throw error;
  });
}
