#!/usr/bin/env node
// Blind pairs for the explainer benchmark (bench/explainers/README.md).
//
//   node tools/bench-explainers.ts pair manifest.json <out-dir>
//
// The manifest names, for each author, the Rayner page and the plain page, each with its
// html, a contact-sheet png and a transcript json:
//   { "seed": 20261101, "authors": { "opus": { "rayner": { "html": …, "png": …, "transcript": … }, "plain": { … } } } }
// The out directory gets pairN-X.* and pairN-Y.* for the reviewer, in an order and with sides
// drawn from the seed; key.json, written beside it (never inside), says which is which.
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export type Method = 'rayner' | 'plain';
export interface Page { html: string; png: string; transcript: string }
export interface Manifest { seed: number; authors: Record<string, Record<Method, Page>> }
export interface PairKey { pair: string; author: string; X: Method; Y: Method }

/** A small deterministic generator (mulberry32), so a seed reproduces a round's blinding. */
function random(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Which author is pair N, and which method is X: shuffled authors, a coin per pair. */
export function blind(authors: readonly string[], seed: number): PairKey[] {
  if (!Number.isInteger(seed)) throw new Error('seed must be an integer');
  if (!authors.length || new Set(authors).size !== authors.length) throw new Error('authors must be distinct and non-empty');
  const next = random(seed),
    order = [...authors];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  return order.map((author, i) => {
    const raynerX = next() < 0.5;
    return { pair: `pair${i + 1}`, author, X: raynerX ? 'rayner' : 'plain', Y: raynerX ? 'plain' : 'rayner' };
  });
}

async function pair(manifestPath: string, out: string) {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as Manifest,
    base = dirname(resolve(manifestPath)),
    keys = blind(Object.keys(manifest.authors), manifest.seed);
  await mkdir(out, { recursive: true });
  for (const k of keys)
    for (const side of ['X', 'Y'] as const) {
      const page = manifest.authors[k.author]![k[side]];
      if (!page) throw new Error(`${k.author} has no ${k[side]} page`);
      for (const [ext, from] of [['html', page.html], ['png', page.png], ['transcript.json', page.transcript]] as const)
        await copyFile(resolve(base, from), join(out, `${k.pair}-${side}.${ext}`));
    }
  const key = join(dirname(resolve(out)), `${basename(resolve(out))}.key.json`);
  await writeFile(key, JSON.stringify({ seed: manifest.seed, pairs: keys }, null, 2) + '\n');
  console.log(`Wrote ${keys.length} blind pairs to ${out}; the key is ${key} (keep it from the reviewer)`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [command, manifest, out] = process.argv.slice(2);
  if (command !== 'pair' || !manifest || !out) {
    console.error('Usage: node tools/bench-explainers.ts pair manifest.json <out-dir>');
    process.exitCode = 1;
  } else pair(manifest, out).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
