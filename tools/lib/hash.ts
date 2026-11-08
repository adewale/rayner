// Small file helpers the command and the repository's tools share: content hashes, package
// integrity, '/'-separated paths and recursive listing. (integrations/ keep their own: they ship
// in the library, which never imports tools/.)
import { createHash } from 'node:crypto';
import type { Dirent } from 'node:fs';
import { access, readdir, readFile } from 'node:fs/promises';
import { relative, sep } from 'node:path';

/** SHA-256 of a string (UTF-8) or bytes, as lowercase hex. */
export const sha256 = (value: string | Uint8Array): string => createHash('sha256').update(value).digest('hex');
/** An npm archive's integrity: 'sha512-' and the SHA-512 of its bytes in base64. */
export const integrity = (bytes: Uint8Array): string => 'sha512-' + createHash('sha512').update(bytes).digest('base64');
/** A path with '/' between its parts, whatever the platform's separator. */
/** Strings in UTF-16 code-unit order: the same on every machine, whatever its locale (localeCompare follows LANG). */
export const byCodeUnit = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

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
/** Whether `file` exists (and can be reached). */
export const exists = (file: string): Promise<boolean> => access(file).then(() => true, () => false);
/** A file's bytes, or its text in `encoding`; undefined when it does not exist. Other errors throw. */
export function readOptional(file: string): Promise<Buffer | undefined>;
export function readOptional(file: string, encoding: BufferEncoding): Promise<string | undefined>;
export function readOptional(file: string, encoding?: BufferEncoding): Promise<Buffer | string | undefined> {
  return (encoding ? readFile(file, encoding) : readFile(file)).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return undefined;
    throw error;
  });
}
