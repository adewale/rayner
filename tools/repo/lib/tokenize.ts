// Syntax tokens for Code, computed at build time and checked in as data.
//
// tokenize(source, lang) returns ColorSpan[] ({ line, from, to, color }, the
// format `new Code(lines, { spans })` takes). With `shiki` installed (a
// devDependency of this checkout: npm install; pinned) it classifies with
// shiki's grammars; otherwise with the small lexer below (ts/js, python, bash,
// elixir: keywords, strings, comments, numbers, function names, punctuation).
// Both paths reduce to the same token kinds and the same palette, so the output
// is plain data that never needs shiki (or this file) at runtime: nothing here
// reaches src/ or the browser. Same input, same engine, same output.

import { createRequire } from 'node:module';
import type { ColorSpan } from '../../../src/text.ts';

export type Span = ColorSpan;
export type Lang = 'ts' | 'js' | 'python' | 'bash' | 'elixir';
export type TokenKind = 'keyword' | 'string' | 'comment' | 'number' | 'function' | 'punctuation';
/** A classified run of one line: [from, to) in JS string indices of that line. */
export interface Token { line: number; from: number; to: number; kind: TokenKind }
/** Colour per kind; null leaves that kind in the block's base colour (and emits no span). */
export type Palette = Readonly<Record<TokenKind, string | null>>;

// Punctuation stays in the base colour by default: GitHub's themes do the same,
// and every coloured run on a line costs the renderer an element (docs/CODE.md).
export const DARK: Palette = { keyword: '#f97583', string: '#9ecbff', comment: '#8b949e', number: '#79b8ff', function: '#b392f0', punctuation: null };
export const LIGHT: Palette = { keyword: '#cf222e', string: '#0a3069', comment: '#6e7781', number: '#0550ae', function: '#8250df', punctuation: null };

const ALIASES: Record<string, Lang> = {
  ts: 'ts', typescript: 'ts', mts: 'ts', cts: 'ts', tsx: 'ts',
  js: 'js', javascript: 'js', mjs: 'js', cjs: 'js', jsx: 'js',
  python: 'python', py: 'python',
  bash: 'bash', sh: 'bash', shell: 'bash', zsh: 'bash',
  elixir: 'elixir', ex: 'elixir', exs: 'elixir',
};
/** The language for a name or file extension (ts, typescript, py, sh, exs, ...). */
export function langOf(name: string): Lang {
  const l = ALIASES[name.toLowerCase().replace(/^\./, '')];
  if (!l) throw new Error(`Unknown language "${name}": use one of ts, js, python, bash, elixir`);
  return l;
}

export interface TokenizeOptions {
  /** 'auto' (default): shiki when installed, else the fallback lexer. */
  engine?: 'auto' | 'shiki' | 'fallback';
  palette?: Palette;
}

/** Colour spans for `source`, one line per '\n'. */
export function tokenize(source: string, lang: Lang | string, { engine = 'auto', palette = DARK }: TokenizeOptions = {}): Span[] {
  const l = langOf(lang);
  let tokens: Token[] | null = engine === 'fallback' ? null : shikiTokens(source, l);
  if (!tokens && engine === 'shiki') throw new Error('shiki is not installed (a devDependency of this checkout: npm install)');
  tokens ??= lex(source, l);
  const spans: Span[] = [];
  for (const t of tokens) {
    const color = palette[t.kind];
    if (!color) continue;
    const prev = spans[spans.length - 1];
    if (prev && prev.line === t.line && prev.to === t.from && prev.color === color) prev.to = t.to;
    else spans.push({ line: t.line, from: t.from, to: t.to, color });
  }
  return spans;
}

// ---- shiki ------------------------------------------------------------------

// The slice of shiki's API used here, typed locally: shiki is optional, so the
// typecheck must not depend on it being installed.
interface ShikiToken { content: string; color?: string }
interface Highlighter { codeToTokensBase(code: string, opts: { lang: string; theme: string; tokenizeTimeLimit: number }): ShikiToken[][] }

const SHIKI_LANG: Record<Lang, string> = { ts: 'typescript', js: 'javascript', python: 'python', bash: 'bash', elixir: 'elixir' };
// github-dark's colours, by what they mark. Anything else (plain text, variables,
// parameters, tags) stays in the base colour.
const SHIKI_KIND: Record<string, TokenKind> = {
  '#F97583': 'keyword', '#9ECBFF': 'string', '#DBEDFF': 'string', '#6A737D': 'comment', '#79B8FF': 'number', '#B392F0': 'function',
};

let highlighter: Highlighter | null | undefined;
/** shiki's highlighter, built once with the JavaScript regex engine (synchronous, no WASM); null when shiki isn't installed. */
function shiki(): Highlighter | null {
  if (highlighter !== undefined) return highlighter;
  const require = createRequire(import.meta.url);
  try {
    // require() of an ES module: synchronous on Node 22.12+, so tokenize stays a plain function
    const core = require('shiki/core') as { createHighlighterCoreSync(o: unknown): Highlighter };
    const { createJavaScriptRegexEngine } = require('shiki/engine/javascript') as { createJavaScriptRegexEngine(): unknown };
    const load = (path: string): unknown => (require(path) as { default: unknown }).default;
    highlighter = core.createHighlighterCoreSync({
      themes: [load('shiki/themes/github-dark.mjs')],
      langs: Object.values(SHIKI_LANG).map((l) => load(`shiki/langs/${l}.mjs`)),
      engine: createJavaScriptRegexEngine(),
    });
  } catch (e) {
    if ((e as { code?: string }).code !== 'MODULE_NOT_FOUND') throw e;
    highlighter = null;
  }
  return highlighter;
}

/** True when shiki is installed. */
export function hasShiki(): boolean { return shiki() !== null; }

/** Tokens classified by shiki, or null when it isn't installed. */
export function shikiTokens(source: string, lang: Lang): Token[] | null {
  const h = shiki();
  if (!h) return null;
  const out: Token[] = [];
  // No time limit: shiki's default (500 ms a line) leaves the rest of a slow line
  // uncoloured, so a busy build machine would change the page.
  h.codeToTokensBase(normalize(source), { lang: SHIKI_LANG[lang], theme: 'github-dark', tokenizeTimeLimit: 0 }).forEach((toks, line) => {
    let at = 0;
    for (const t of toks) {
      const kind = SHIKI_KIND[(t.color ?? '').toUpperCase()];
      if (kind) push(out, line, at, t.content, kind);
      at += t.content.length;
    }
  });
  return out;
}

// ---- fallback lexer -----------------------------------------------------------

interface Def {
  keywords: ReadonlySet<string>;
  /** Language constants and builtins (true, nil, None, echo): coloured as numbers, as GitHub does. */
  constants: ReadonlySet<string>;
  /** ALL_CAPS identifiers are constants too. */
  caps?: boolean;
  /** The identifier after one of these is a definition's name. */
  definers: ReadonlySet<string>;
  lineComment: string;
  /** A line comment only where a word could start (bash: `a#b` is a word). */
  commentAtWordStart?: boolean;
  block?: readonly [open: string, close: string];
  /** String openers, longest first; each closes with itself. */
  strings: readonly string[];
  multiline: ReadonlySet<string>;
  /** Openers whose strings have no backslash escapes. */
  raw?: ReadonlySet<string>;
  ident: RegExp;
  /** Python's r/b/f/u string prefixes. */
  prefixes?: RegExp;
  /** Elixir: `:atom` and `key:` are constants. */
  atoms?: boolean;
}

const words = (s: string): ReadonlySet<string> => new Set(s.split(/\s+/).filter(Boolean));
const JS_KEYWORDS = 'break case catch class const continue debugger default delete do else export extends finally for function if import in instanceof let new return switch throw try typeof var void while with yield async await of from as static';
const JS: Def = {
  keywords: words(JS_KEYWORDS),
  constants: words('true false null undefined this super NaN Infinity'),
  definers: words('function class'),
  lineComment: '//', block: ['/*', '*/'],
  strings: ['`', '"', "'"], multiline: words('`'),
  ident: /[A-Za-z_$][\w$]*/y,
  caps: true,
};
const DEFS: Record<Lang, Def> = {
  js: JS,
  ts: {
    ...JS,
    keywords: words(JS_KEYWORDS + ' interface type enum implements private protected public readonly abstract declare namespace keyof satisfies is infer'),
    constants: words('true false null undefined this super NaN Infinity string number boolean any unknown never object symbol bigint'),
    definers: words('function class interface type enum namespace'),
  },
  python: {
    keywords: words('and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield match case'),
    constants: words('True False None'),
    caps: true,
    definers: words('def class'),
    lineComment: '#',
    strings: ['"""', "'''", '"', "'"], multiline: words(`""" '''`),
    ident: /[A-Za-z_]\w*/y,
    prefixes: /^(?:[rRbBuUfF]|[rR][bBfF]|[bBfF][rR])$/,
  },
  bash: {
    keywords: words('if then else elif fi case esac for select while until do done in function time return local export declare readonly unset shift break continue exit source'),
    constants: words('true false echo printf cd pwd read test eval exec set trap wait kill'),
    definers: words('function'),
    lineComment: '#', commentAtWordStart: true,
    strings: ['"', "'"], multiline: words(`" '`), raw: words("'"),
    ident: /[A-Za-z_]\w*/y,
  },
  elixir: {
    keywords: words('def defp defmodule defmacro defmacrop defstruct defprotocol defimpl defguard defdelegate defexception do end fn case cond with if unless else receive after try catch rescue raise when in not and or import alias require use quote unquote for'),
    constants: words('true false nil'),
    definers: words('def defp defmodule defmacro defmacrop defprotocol defimpl defguard'),
    lineComment: '#',
    strings: ['"""', '"', "'"], multiline: words('"""'),
    ident: /[A-Za-z_]\w*[?!]?/y,
    atoms: true,
  },
};
const NUMBER = /0[xX][\da-fA-F_]+n?|0[bB][01_]+n?|0[oO][0-7_]+n?|\d[\d_]*(?:\.\d[\d_]*)?(?:[eE][+-]?\d+)?n?/y;
const PUNCT = /[!-/:-@[-`{-~]/;
const WORD = /[\w$]/;
const CAPS = /^[A-Z][A-Z\d_]+$/;

/** The fallback lexer: deterministic, single pass, good enough to read code by. */
export function lex(source: string, lang: Lang | string): Token[] {
  const src = normalize(source), d = DEFS[langOf(lang)], n = src.length;
  const starts = [0];
  for (let i = 0; i < n; i++) if (src[i] === '\n') starts.push(i + 1);
  const out: Token[] = [];
  let line = 0;
  // An absolute range, cut at line breaks into per-line tokens
  const emit = (s: number, e: number, kind: TokenKind): void => {
    while (line + 1 < starts.length && starts[line + 1]! <= s) line++;
    for (let l = line, a = s; a < e; l++) {
      const end = l + 1 < starts.length ? Math.min(e, starts[l + 1]! - 1) : e;
      push(out, l, a - starts[l]!, src.slice(a, end), kind);
      a = starts[l + 1] ?? e;
    }
  };
  const stringEnd = (i: number, q: string): number => {
    const raw = d.raw?.has(q), multi = d.multiline.has(q);
    while (i < n) {
      if (src.startsWith(q, i)) return i + q.length;
      if (src[i] === '\\' && !raw) { i += 2; continue; }
      if (src[i] === '\n' && !multi) return i;
      i++;
    }
    return n;
  };
  let i = 0, expectName = false;
  while (i < n) {
    const ch = src[i]!;
    if (ch === ' ' || ch === '\t' || ch === '\n') { i++; continue; }
    if (src.startsWith(d.lineComment, i) && (!d.commentAtWordStart || i === 0 || /\s/.test(src[i - 1]!))) {
      const j = src.indexOf('\n', i);
      emit(i, j < 0 ? n : j, 'comment'); i = j < 0 ? n : j; expectName = false; continue;
    }
    if (d.block && src.startsWith(d.block[0], i)) {
      const j = src.indexOf(d.block[1], i + d.block[0].length), end = j < 0 ? n : j + d.block[1].length;
      emit(i, end, 'comment'); i = end; continue;
    }
    const q = d.strings.find((s) => src.startsWith(s, i));
    if (q) { const j = stringEnd(i + q.length, q); emit(i, j, 'string'); i = j; expectName = false; continue; }
    if (d.atoms && ch === ':' && src[i + 1] !== ':' && src[i - 1] !== ':') {
      d.ident.lastIndex = i + 1;
      const m = d.ident.exec(src);
      if (m) { emit(i, i + 1 + m[0].length, 'number'); i += 1 + m[0].length; continue; }
    }
    if (ch >= '0' && ch <= '9' && !(i > 0 && WORD.test(src[i - 1]!))) {
      NUMBER.lastIndex = i;
      const len = NUMBER.exec(src)![0].length;
      emit(i, i + len, 'number'); i += len; expectName = false; continue;
    }
    d.ident.lastIndex = i;
    const m = d.ident.exec(src);
    if (m) {
      const w = m[0];
      let j = i + w.length, kind: TokenKind | null = null;
      const pq = d.prefixes?.test(w) ? d.strings.find((s) => src.startsWith(s, j)) : undefined;
      if (pq) { const k = stringEnd(j + pq.length, pq); emit(i, k, 'string'); i = k; expectName = false; continue; }
      if (d.atoms && src[j] === ':' && src[j + 1] !== ':' && (j + 1 >= n || /\s/.test(src[j + 1]!))) { kind = 'number'; j++; }
      // After a dot it is a property (env.default), not a keyword
      else if (src[i - 1] !== '.' && d.keywords.has(w)) kind = 'keyword';
      else if (src[i - 1] !== '.' && d.constants.has(w)) kind = 'number';
      else if (d.caps && CAPS.test(w)) kind = 'number';
      else if (expectName || src[j] === '(') kind = 'function';
      if (kind) emit(i, j, kind);
      expectName = d.definers.has(w);
      i = j; continue;
    }
    if (PUNCT.test(ch)) emit(i, i + 1, 'punctuation');
    i++; expectName = false;
  }
  return out;
}

// ---- shared -----------------------------------------------------------------

function normalize(source: string): string { return source.replace(/\r\n?/g, '\n'); }

/**
 * Append a token, trimmed of surrounding whitespace (a span is the ink it
 * colours), merged into the previous one when they touch and share a kind.
 */
function push(out: Token[], line: number, at: number, text: string, kind: TokenKind): void {
  const lead = text.length - text.trimStart().length;
  if (lead === text.length) return;
  const from = at + lead, to = at + text.trimEnd().length;
  const prev = out[out.length - 1];
  if (prev && prev.line === line && prev.to === from && prev.kind === kind) prev.to = to;
  else out.push({ line, from, to, kind });
}
