import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { packageImports } from '../../lib/explain-init.ts';

/**
 * The guides that print tutorial files. A block marked `<!-- dir/file -->` above a fenced code block
 * prints scenes/tutorial/<dir>/<file> exactly, with the package imports an npm author writes.
 */
export const DOCS = ['README.md', 'docs/TUTORIAL.md'] as const;
const MARKED = /(<!-- ([\w-]+\/[\w.-]+) -->\n```(?:ts|md)\n)([\s\S]*?)(```)/g;

/** Each marked block in `doc`: the file it prints, what it shows, and what it should show. */
export function docBlocks(root: string, doc: string): { file: string; shown: string; source: string }[] {
  return [...readFileSync(join(root, doc), 'utf8').matchAll(MARKED)].map((m) => ({
    file: m[2]!, shown: m[3]!, source: packageImports(readFileSync(join(root, 'scenes/tutorial', m[2]!), 'utf8')),
  }));
}

/** Rewrite every marked block in `doc` from its file; returns whether anything changed. */
export function writeDocBlocks(root: string, doc: string): boolean {
  const path = join(root, doc), text = readFileSync(path, 'utf8');
  const next = text.replace(MARKED, (_all, head: string, file: string, _shown: string, fence: string) =>
    head + packageImports(readFileSync(join(root, 'scenes/tutorial', file), 'utf8')) + fence);
  if (next !== text) writeFileSync(path, next);
  return next !== text;
}
