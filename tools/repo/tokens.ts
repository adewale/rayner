// Syntax-token spans for a source file, as JSON for `new Code(lines, { spans })`.
//
//   node tools/repo/tokens.ts <file | -> [--lang ts|js|python|bash|elixir] [--theme dark|light] [--engine auto|shiki|fallback]
//
// Reads stdin when the file is `-` or missing; the language defaults to the
// file's extension. Uses shiki when installed, else the fallback lexer
// (tools/repo/lib/tokenize.ts); the engine used goes to stderr. Build time only: the
// output is data to check in, so nothing here runs in a scene.

import { readFileSync } from 'node:fs';
import { extname } from 'node:path';
import { tokenize, hasShiki, langOf, DARK, LIGHT } from './lib/tokenize.ts';

const USAGE = 'Usage: node tools/repo/tokens.ts <file | -> [--lang ts|js|python|bash|elixir] [--theme dark|light] [--engine auto|shiki|fallback]';

function main(args: string[]): void {
  if (args.includes('--help')) { console.log(USAGE); return; }
  const flag = (name: string): string | undefined => {
    const i = args.indexOf(name);
    if (i < 0) return undefined;
    const v = args[i + 1];
    if (!v || v.startsWith('--')) throw new Error(`Missing value for ${name}`);
    args.splice(i, 2);
    return v;
  };
  const lang = flag('--lang'), theme = flag('--theme') ?? 'dark', engine = flag('--engine') ?? 'auto';
  if (theme !== 'dark' && theme !== 'light') throw new Error(`Unknown theme "${theme}": use dark or light`);
  if (engine !== 'auto' && engine !== 'shiki' && engine !== 'fallback') throw new Error(`Unknown engine "${engine}": use auto, shiki or fallback`);
  const [file = '-', ...extra] = args;
  if (extra.length) throw new Error(`Unexpected arguments: ${extra.join(' ')}`);
  if (!lang && file === '-') throw new Error('Reading stdin: pass --lang');

  const source = readFileSync(file === '-' ? 0 : file, 'utf8');
  const spans = tokenize(source, langOf(lang ?? extname(file)), { engine, palette: theme === 'light' ? LIGHT : DARK });
  console.error(`tokens: ${spans.length} spans, engine ${engine === 'fallback' || !hasShiki() ? 'fallback' : 'shiki'}`);
  // One span per line, so a checked-in array diffs line by line
  console.log(spans.length ? `[\n${spans.map((s) => '  ' + JSON.stringify(s)).join(',\n')}\n]` : '[]');
}

try {
  main(process.argv.slice(2));
} catch (e) {
  console.error(`tokens: ${(e as Error).message}\n${USAGE}`);
  process.exit(1);
}
