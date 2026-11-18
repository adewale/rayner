// The export rule as data (docs/ENGINE.md, "Public names" and "What stays in the public API"). Every
// public name of every entry point needs a reason to be public, and the reason is computed where it can be:
//
//   used      an explainer, a tutorial scene, the tutorial's printed kit example or a recipe imports
//             it and uses it, found from their imports. Nothing is written down.
//   tooling   it lives in rayner/testing, and test/public-names.json says who outside a scene
//             uses it and for what (`tooling`): an author's tests and tools. Every name in that entry
//             point needs this written reason, and no other name may have one: living in the tooling
//             entry point is not by itself a reason to be public.
//   kept      nothing above uses it, and test/public-names.json
//             says why it stays public all the same (`reason`) and names a
//             guide section that teaches it and a test that runs it (`guide` and `test`), which must
//             exist and mention the name. docs/ENGINE.md renders these exceptions as a table.
//
// So the ledger lists only names that say something no import can: a `tooling` reason, a `reason`
// with its `guide` and `test` for an unused name, optional rationale for a used name, or a `check`, what
// `rayner check` verifies about the name, led by the check's name in the
// reference's Checks table ("Views: ..."). The same file holds the rows of the reference's engine
// features table, the skill's examples table and the feature index (docs/FEATURE-TOUR.md), which are
// rendered from it, with what their scenes use computed from the same usage, so none can go stale
// (test/public-names.test.ts).
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { entryPoints as libraryEntryPoints } from '../../lib/entry-points.ts';
import { EXPLAINERS } from '../../../scenes/explainers/catalog.ts';

import { ROOT } from '../../lib/roots.ts';
export { ROOT };
export const LEDGER = 'test/public-names.json';

/**
 * What the ledger says about a name: who uses it as tooling and for what (only in the tooling entry
 * point), its design rationale (`reason`, required when no example uses it), where it
 * is taught (a guide section and a test), and what check verifies it.
 */
export interface NameEntry { tooling?: string; reason?: string; guide?: string; test?: string; check?: string }
const KEYS = ['tooling', 'reason', 'guide', 'test', 'check'];

/** One thing a feature row lists: an exported name, or a member or option found by a pattern in the scene's code. */
export interface FeatureItem { name?: string; label?: string; pattern?: string }
export interface FeatureRow { feature: string; uses: string; guide: string; items: FeatureItem[] }
export interface ExampleRow {
  explaining: string;
  start: string;
  shows: string;
  /** The scenes the row points at: an explainer id, or tutorial/<id>. */
  scenes: string[];
  /** Exported names the row says its scenes show: each must be used by one of them. */
  names: string[];
  /** Members and options the row says they show, each found in one of them by its pattern. */
  patterns?: Record<string, string>;
}
/**
 * One row of the feature index (docs/FEATURE-TOUR.md): an authoring feature, the code an author writes
 * for it, and the catalogued explainers that show it, each of which must use one of its names or match
 * one of its patterns. A row with no scenes is a name no explainer uses yet, and fails once one does.
 */
export interface LookupRow {
  feature: string;
  uses: string;
  guide: string;
  scenes: string[];
  names: string[];
  patterns?: Record<string, string>;
}
export interface Ledger {
  names: Record<string, Record<string, NameEntry>>;
  features: FeatureRow[];
  examples: ExampleRow[];
  lookup: LookupRow[];
}

/** The tooling entry point: each name in it is public as tooling only with a written reason, and only there. */
export const TOOLING = new Set(['rayner/testing']);
/** The tutorial's printed examples that a test runs: the code block after each such marker counts as a user. */
export const TUTORIAL = 'docs/TUTORIAL.md';
const PRINTED = /<!-- [^>]*run by test\/[\w.-]+\.test\.ts -->\n```ts\n([\s\S]*?)```/g;

export function readLedger(root = ROOT): Ledger {
  return JSON.parse(readFileSync(join(root, LEDGER), 'utf8')) as Ledger;
}

/** The entry points, from package.json "exports": the package name of each, and the source it is built from. */
export function entryPoints(root = ROOT): Map<string, string> {
  return new Map([...libraryEntryPoints(root)].map(([name, module]) => [name, module + '.ts']));
}

/** Every value each entry point exports, by package name. */
export async function publicNames(root = ROOT): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  for (const [name, source] of entryPoints(root)) out.set(name, Object.keys(await import(pathToFileURL(join(root, source)).href)).sort());
  return out;
}

/**
 * The scenes, examples and recipes whose imports count as use, with their files: each explainer, each
 * tutorial scene, the tutorial's printed examples a test runs (one user, `docs/TUTORIAL.md`) and each recipe.
 */
export function users(root = ROOT): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const [dir, prefix] of [['scenes/explainers', ''], ['scenes/tutorial', 'tutorial/']] as const)
    for (const id of readdirSync(join(root, dir)).sort())
      if (existsSync(join(root, dir, id, 'scene.ts'))) out.set(prefix + id, closure(join(root, dir, id, 'scene.ts'), join(root, 'scenes')));
  const printed = [...readFileSync(join(root, TUTORIAL), 'utf8').matchAll(PRINTED)].map(([, code], i) => {
    const file = join(root, `${TUTORIAL}#example-${i + 1}.ts`);
    parsed.set(file, ts.createSourceFile(file, code!, ts.ScriptTarget.Latest, true));
    return file;
  });
  if (printed.length) out.set(TUTORIAL, printed);
  for (const file of readdirSync(join(root, 'recipes')).sort())
    if (file.endsWith('.ts')) out.set(`recipes/${file}`, closure(join(root, 'recipes', file), join(root, 'recipes')));
  return out;
}

const parsed = new Map<string, ts.SourceFile>();
function parse(file: string): ts.SourceFile {
  let sf = parsed.get(file);
  if (!sf) parsed.set(file, (sf = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)));
  return sf;
}
const specifierOf = (s: ts.Statement): string | undefined =>
  (ts.isImportDeclaration(s) || ts.isExportDeclaration(s)) && s.moduleSpecifier && ts.isStringLiteral(s.moduleSpecifier) ? s.moduleSpecifier.text : undefined;

/** A file and the local files it imports or re-exports, transitively, inside `within`. */
function closure(file: string, within: string, seen = new Set<string>()): string[] {
  if (seen.has(file) || !existsSync(file)) return [...seen];
  seen.add(file);
  for (const s of parse(file).statements) {
    const spec = specifierOf(s);
    if (!spec?.startsWith('.')) continue;
    const target = resolve(dirname(file), spec);
    if (target.startsWith(within + '/')) closure(target, within, seen);
  }
  return [...seen];
}

/** Which entry point a specifier in `file` names: a package name, or a relative path to an entry's source. */
function entryOf(file: string, spec: string, entries: Map<string, string>, root: string): string | undefined {
  if (entries.has(spec)) return spec;
  if (!spec.startsWith('.')) return undefined;
  const target = relative(root, resolve(dirname(file), spec));
  for (const [name, source] of entries) if (source === target) return name;
  return undefined;
}

/** What `name`, exported by local `file`, is: an entry point's name it passes on, or nothing from the library. */
function reexported(file: string, name: string, entries: Map<string, string>, root: string, depth = 0): [string, string] | undefined {
  if (depth > 8 || !existsSync(file)) return undefined;
  for (const s of parse(file).statements) {
    if (!ts.isExportDeclaration(s) || !s.exportClause || !ts.isNamedExports(s.exportClause)) continue;
    for (const el of s.exportClause.elements) {
      if (el.name.text !== name) continue;
      const original = el.propertyName?.text ?? el.name.text, spec = specifierOf(s);
      if (!spec) return imported(file, original, entries, root, depth + 1);
      const entry = entryOf(file, spec, entries, root);
      if (entry) return [entry, original];
      if (spec.startsWith('.')) return reexported(resolve(dirname(file), spec), original, entries, root, depth + 1);
    }
  }
  return undefined;
}
/** Where a binding `local` that `file` imports comes from, followed through local re-exports. */
function imported(file: string, local: string, entries: Map<string, string>, root: string, depth = 0): [string, string] | undefined {
  for (const s of parse(file).statements) {
    if (!ts.isImportDeclaration(s) || !s.importClause?.namedBindings || !ts.isNamedImports(s.importClause.namedBindings)) continue;
    for (const el of s.importClause.namedBindings.elements) {
      if (el.name.text !== local) continue;
      const name = el.propertyName?.text ?? el.name.text, spec = specifierOf(s)!;
      const entry = entryOf(file, spec, entries, root);
      if (entry) return [entry, name];
      if (spec.startsWith('.')) return reexported(resolve(dirname(file), spec), name, entries, root, depth + 1);
    }
  }
  return undefined;
}

/** The identifiers a file uses outside its import and re-export statements. */
function referenced(file: string): Set<string> {
  const out = new Set<string>();
  const walk = (n: ts.Node): void => {
    if (ts.isImportDeclaration(n) || (ts.isExportDeclaration(n) && n.moduleSpecifier)) return;
    if (ts.isIdentifier(n)) out.add(n.text);
    n.forEachChild(walk);
  };
  parse(file).forEachChild(walk);
  return out;
}

export interface Usage {
  /** For each entry point and name, the users that import it and use it. */
  names: Map<string, Map<string, Set<string>>>;
  /** Each user's code, for the patterns the tables look for. */
  code: Map<string, string>;
}

/** Which users use each public name: a file in the user that imports it (directly or through a local re-export) and refers to it. */
export function usage(root = ROOT): Usage {
  const entries = entryPoints(root);
  const names = new Map<string, Map<string, Set<string>>>();
  const code = new Map<string, string>();
  for (const [user, files] of users(root)) {
    code.set(user, files.map((f) => parse(f).text).join('\n'));
    for (const file of files) {
      const uses = referenced(file);
      for (const s of parse(file).statements) {
        if (!ts.isImportDeclaration(s) || !s.importClause?.namedBindings || !ts.isNamedImports(s.importClause.namedBindings)) continue;
        for (const el of s.importClause.namedBindings.elements) {
          if (!uses.has(el.name.text)) continue;
          const from = imported(file, el.name.text, entries, root);
          if (!from) continue;
          const [entry, name] = from;
          if (!names.has(entry)) names.set(entry, new Map());
          const m = names.get(entry)!;
          if (!m.has(name)) m.set(name, new Set());
          m.get(name)!.add(user);
        }
      }
    }
  }
  return { names, code };
}

/** Users of an exported name, in any entry point that exports it. */
export function usersOf(u: Usage, name: string, entry?: string): string[] {
  const out = new Set<string>();
  for (const [e, m] of u.names) if (!entry || e === entry) for (const x of m.get(name) ?? []) out.add(x);
  return [...out].sort();
}
/** Users whose code matches `pattern`. */
export function matching(u: Usage, pattern: string): string[] {
  const re = new RegExp(pattern);
  return [...u.code].filter(([, c]) => re.test(c)).map(([user]) => user).sort();
}

/** A heading's anchor as GitHub writes it. */
export function slug(heading: string): string {
  return heading.trim().toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, '').replace(/\s/g, '-');
}
/** The text of a Markdown file's section under the heading whose anchor is `anchor`, to the next heading as high or higher. */
export function section(markdown: string, anchor: string): string | undefined {
  const lines = markdown.replace(/```[\s\S]*?```/g, (block) => block.replace(/^#/gm, ' #')).split('\n');
  const start = lines.findIndex((l) => /^#{1,6} /.test(l) && slug(l.replace(/^#+ /, '')) === anchor);
  if (start < 0) return undefined;
  const level = lines[start]!.match(/^#+/)![0].length;
  const end = lines.findIndex((l, i) => i > start && /^#{1,6} /.test(l) && l.match(/^#+/)![0].length <= level);
  return lines.slice(start, end < 0 ? undefined : end).join('\n');
}

/** The names of the reference's checks: the first column of its Checks table. */
export function checkNames(root = ROOT): Set<string> {
  const text = section(readFileSync(join(root, 'docs/REFERENCE.md'), 'utf8'), 'checks') ?? '';
  const out = new Set<string>();
  for (const [, name] of text.matchAll(/^\| ([^|]+?) \| [^|]+ \|$/gm)) if (name !== 'Check' && !/^-+$/.test(name!)) out.add(name!.trim());
  return out;
}

const word = (name: string) => new RegExp(`(?<![\\w$])${name.replace(/[$]/g, '\\$')}(?![\\w$])`);

/** The audit's class of a name: tooling (by its entry point), used (by an explainer, the tutorial or a recipe), or unused. */
export type NameClass = 'tooling' | 'used' | 'unused';
export function classOf(u: Usage, entry: string, name: string): NameClass {
  if (TOOLING.has(entry)) return 'tooling';
  return usersOf(u, name, entry).length ? 'used' : 'unused';
}

/** Why `name` in `entry` is public: tooling (with its written reason), used (by whom), kept (with a written reason), or nothing. */
export function reasonOf(ledger: Ledger, u: Usage, entry: string, name: string): 'tooling' | 'used' | 'kept' | 'NONE' {
  const r = ledger.names[entry]?.[name];
  if (TOOLING.has(entry)) return r?.tooling?.trim() ? 'tooling' : 'NONE';
  if (usersOf(u, name, entry).length) return 'used';
  return r?.reason?.trim() ? 'kept' : 'NONE';
}

/**
 * Everything wrong with the ledger, as sentences: an empty list when every public name has a live reason.
 * `exports` stands in for what the entry points export, as a test of a new export does.
 */
export async function problems(ledger: Ledger, root = ROOT, u: Usage = usage(root), exports?: Map<string, string[]>): Promise<string[]> {
  const out: string[] = [];
  const exported = exports ?? await publicNames(root);
  const sources = entryPoints(root);
  const checks = checkNames(root);
  for (const [entry, names] of exported)
    for (const name of names) {
      if (reasonOf(ledger, u, entry, name) !== 'NONE') continue;
      const stop = `or stop exporting it from ${sources.get(entry)}`;
      out.push(TOOLING.has(entry)
        ? `${name} (${entry}) has no reason to be public: ${entry} is tooling, and ${LEDGER} gives it no tooling reason (who uses it outside a scene, and for what); add one there, ${stop}`
        : `${name} (${entry}) has no reason to be public: no explainer, tutorial scene or recipe uses it; use it in one, give it a reason in ${LEDGER} with the guide and test that teach it, ${stop}`);
    }
  for (const [entry, names] of Object.entries(ledger.names)) {
    if (!exported.has(entry)) { out.push(`${LEDGER} lists ${entry}, which is not an entry point`); continue; }
    for (const [name, r] of Object.entries(names)) {
      const at = `${name} (${entry})`;
      if (!exported.get(entry)!.includes(name)) { out.push(`${at} is in ${LEDGER} but ${entry} does not export it`); continue; }
      // Users are computed; a written rationale may remain after a name gains users.
      for (const key of Object.keys(r)) if (!KEYS.includes(key)) out.push(`${at}: ${key} is not part of a ledger entry (${KEYS.join(', ')})`);
      if (r.tooling !== undefined && !TOOLING.has(entry))
        out.push(`${at}: only a name in ${[...TOOLING].join(' or ')} is tooling; a name in ${entry} is used by a scene or kept with a reason`);
      else if (r.tooling !== undefined && !r.tooling.trim())
        out.push(`${at}: its tooling reason must not be empty`);
      if (r.reason !== undefined) {
        const who = usersOf(u, name, entry);
        if (TOOLING.has(entry)) out.push(`${at}: a tooling name says why it is public in its tooling reason, not a reason`);
        else if (!r.reason.trim()) out.push(`${at}: its reason must not be empty`);
        if (!TOOLING.has(entry) && !who.length && (r.guide === undefined || r.test === undefined)) out.push(`${at}: a name kept with a reason is taught by a guide section and run by a test; name both`);
      }
      if ((r.guide === undefined) !== (r.test === undefined)) out.push(`${at}: a name is taught by a guide section and a test, both`);
      if (r.guide !== undefined && r.test !== undefined) {
        const [doc, anchor] = r.guide.split('#') as [string, string | undefined];
        const path = join(root, doc);
        if (!anchor || !existsSync(path)) out.push(`${at}: its guide ${r.guide} does not exist`);
        else {
          const text = section(readFileSync(path, 'utf8'), anchor);
          if (text === undefined) out.push(`${at}: ${doc} has no section #${anchor}`);
          else if (!word(name).test(text)) out.push(`${at}: ${r.guide} does not mention it`);
        }
        const test = join(root, r.test);
        if (!/\.test\.ts$/.test(r.test) || !existsSync(test)) out.push(`${at}: its test ${r.test} does not exist`);
        else if (!word(name).test(readFileSync(test, 'utf8'))) out.push(`${at}: ${r.test} does not mention it`);
      }
      if (r.check !== undefined) {
        const lead = r.check.match(/^([^:]+):\s+\S/);
        const named = lead ? lead[1]!.split(/,\s*/) : [];
        if (!named.length || named.some((n) => !checks.has(n)))
          out.push(`${at}: its check "${r.check}" must lead with a check from docs/REFERENCE.md#checks (${[...checks].join(', ')})`);
      }
    }
  }
  // The camera on a stage moves by s.focus, which keeps the heading on screen; frame.animate moves the picture and leaves the heading behind.
  for (const who of usersOf(u, 'stage', 'rayner/explain'))
    if (/\bframe\.animate\b/.test(u.code.get(who) ?? '')) out.push(`${who} moves the camera with frame.animate on a stage; use s.focus, which keeps the heading on screen (docs/CAMERA.md)`);
  const scenes = new Set(u.code.keys());
  /** What a row of the examples or the feature index claims its scenes show, checked against what they use. */
  const claims = (at: string, row: { scenes: string[]; names: string[]; patterns?: Record<string, string> }, words: string) => {
    for (const s of row.scenes) if (!scenes.has(s)) out.push(`${at}: ${s} is not a scene`);
    for (const name of row.names) {
      if (![...exported.values()].some((n) => n.includes(name))) out.push(`${at}: ${name} is not exported`);
      else if (row.scenes.length && !row.scenes.some((s) => usersOf(u, name).includes(s))) out.push(`${at}: none of ${row.scenes.join(', ')} uses ${name}`);
    }
    for (const [label, pattern] of Object.entries(row.patterns ?? {}))
      if (row.scenes.length && !row.scenes.some((s) => matching(u, pattern).includes(s))) out.push(`${at}: none of ${row.scenes.join(', ')} shows ${label}`);
    // Every exported name the row's words claim is checked: in `names`, or the row cannot say it.
    for (const [, token] of words.matchAll(/`([A-Za-z_$][\w$]*)/g))
      if ([...exported.values()].some((n) => n.includes(token!)) && !row.names.includes(token!) && !Object.keys(row.patterns ?? {}).some((l) => l.startsWith(token!)))
        out.push(`${at}: it names ${token} but does not list it in names, so nothing checks it`);
  };
  for (const row of ledger.examples) claims(`examples "${row.explaining}"`, row, `${row.start} ${row.shows}`);
  const catalogued = new Set(EXPLAINERS.map((e) => e.id));
  for (const row of ledger.lookup) {
    const at = `lookup "${row.feature}"`;
    claims(at, row, row.uses);
    for (const s of row.scenes) {
      if (!catalogued.has(s)) out.push(`${at}: ${s} is not a catalogued explainer (scenes/explainers/catalog.ts)`);
      // Each scene shows the feature: it uses one of the row's names or matches one of its patterns.
      else if (!showing(u, row, s).length) out.push(`${at}: ${s} uses none of ${[...row.names, ...Object.keys(row.patterns ?? {})].join(', ')}`);
    }
    // A row that names no explainer is a feature none uses yet; once one does, the index must point at it.
    if (!row.scenes.length)
      for (const name of row.names) {
        const who = usersOf(u, name).filter((x) => catalogued.has(x));
        if (who.length) out.push(`${at}: ${who.join(', ')} use${who.length > 1 ? '' : 's'} ${name}; name ${who.length > 1 ? 'one' : 'it'} in its scenes`);
      }
  }
  for (const row of ledger.features)
    for (const item of row.items) {
      if (item.name && ![...exported.values()].some((n) => n.includes(item.name!))) out.push(`features "${row.feature}": ${item.name} is not exported`);
      if (!item.name && !(item.label && item.pattern)) out.push(`features "${row.feature}": an item needs a name, or a label and a pattern`);
    }
  return out;
}

const tick = (s: string) => `\`${s}\``;
/** A feature row's "used by": each item with the explainers that use it, then the items none uses yet. */
export function usedBy(row: FeatureRow, u: Usage): string {
  const scenesOnly = (xs: string[]) => xs.filter((x) => !x.startsWith('recipes/') && x !== TUTORIAL);
  const used: string[] = [], unused: string[] = [];
  for (const item of row.items) {
    const label = item.label ?? item.name!;
    const who = scenesOnly(item.name ? usersOf(u, item.name) : matching(u, item.pattern!));
    if (who.length) used.push(`${tick(label)}: ${who.map(tick).join(', ')}`);
    else unused.push(tick(label));
  }
  return [used.join('; '), unused.length ? `no explainer yet: ${unused.join(', ')}` : ''].filter(Boolean).join('; ');
}

/** The names and patterns of a feature-index row that `scene` uses, in the row's order. */
function showing(u: Usage, row: LookupRow, scene: string): { name?: string; pattern?: string }[] {
  return [
    ...row.names.filter((name) => usersOf(u, name).includes(scene)).map((name) => ({ name })),
    ...Object.values(row.patterns ?? {}).filter((pattern) => matching(u, pattern).includes(scene)).map((pattern) => ({ pattern })),
  ];
}

export const MARK = {
  features: ['<!-- generated from test/public-names.json by `node tools/repo/public-names.ts --write`: engine features -->', '<!-- end of generated engine features -->'],
  examples: ['<!-- generated from test/public-names.json by `node tools/repo/public-names.ts --write`: examples -->', '<!-- end of generated examples -->'],
  exceptions: ['<!-- generated from test/public-names.json by `node tools/repo/public-names.ts --write`: kept with a reason -->', '<!-- end of generated kept names -->'],
  lookup: ['<!-- generated from test/public-names.json by `node tools/repo/public-names.ts --write`: feature index -->', '<!-- end of generated feature index -->'],
} as const;

export function featuresTable(ledger: Ledger, u: Usage): string {
  return [
    '| Feature | What a scene uses | Guide | Used by |',
    '| --- | --- | --- | --- |',
    ...ledger.features.map((r) => `| ${r.feature} | ${r.uses} | ${r.guide} | ${usedBy(r, u)} |`),
  ].join('\n');
}
export function examplesTable(ledger: Ledger): string {
  return [
    '| You are explaining | Start from | It shows |',
    '| --- | --- | --- |',
    ...ledger.examples.map((r) => `| ${r.explaining} | ${r.start} | ${r.shows} |`),
  ].join('\n');
}

const REPOSITORY = 'https://github.com/adewale/rayner';
/**
 * The feature index: each feature, the code an author writes, and the files of each explainer that
 * show it, found by the row's names and patterns, linked in the repository. A row with no explainer says so.
 */
export function lookupTable(ledger: Ledger, u: Usage, root = ROOT): string {
  const filesOf = users(root);
  /** A file's code without its import and re-export statements, so an import alone does not count as showing a name. */
  const code = (file: string) => {
    const sf = parse(file);
    return sf.statements.filter((s) => !specifierOf(s)).map((s) => s.getText(sf)).join('\n');
  };
  const explainers = join(root, 'scenes/explainers');
  const seen = (row: LookupRow, scene: string): string => {
    const files: string[] = [];
    for (const item of showing(u, row, scene)) {
      const re = item.name ? word(item.name) : new RegExp(item.pattern!);
      const file = (filesOf.get(scene) ?? []).find((f) => re.test(code(f)));
      if (file && !files.includes(file)) files.push(file);
    }
    // The package ships docs/ but not the collection, so the links name the repository.
    const folder = join(explainers, scene);
    const links = files.map((f) => `[${relative(f.startsWith(folder + '/') ? folder : explainers, f)}](${REPOSITORY}/blob/main/${relative(root, f)})`);
    return `[${scene}](${REPOSITORY}/tree/main/scenes/explainers/${scene})${links.length ? ` (${links.join(', ')})` : ''}`;
  };
  return [
    '| Feature | What you write | See it in | Guide |',
    '| --- | --- | --- | --- |',
    ...ledger.lookup.map((r) => `| ${r.feature} | ${r.uses} | ${r.scenes.length ? r.scenes.map((s) => seen(r, s)).join('; ') : 'no explainer yet'} | ${r.guide} |`),
  ].join('\n');
}

/** The names kept public with a written reason, each with why it stays and where it is taught. */
export function exceptionsTable(ledger: Ledger, u: Usage): string {
  const rows: string[] = [];
  for (const [entry, names] of Object.entries(ledger.names))
    for (const [name, r] of Object.entries(names))
      if (r.reason !== undefined && reasonOf(ledger, u, entry, name) === 'kept') {
        const [doc, anchor] = r.guide?.split('#') ?? [];
        const guide = doc ? `[${doc.replace(/^docs\//, '')}${anchor ? `#${anchor}` : ''}](${doc.startsWith('docs/') ? doc.slice(5) : `../${doc}`}${anchor ? `#${anchor}` : ''})` : '';
        rows.push(`| ${tick(name)} | ${tick(entry)} | ${r.reason.trim()} | ${guide}, ${tick(r.test ?? '')} |`);
      }
  if (!rows.length) return 'None: every public name outside `rayner/testing` has a user.';
  return ['| Name | Entry point | Why it stays public | Taught and run by |', '| --- | --- | --- | --- |', ...rows].join('\n');
}

/** `markdown` with the region between `marks` replaced by `body`; throws when the marks are missing. */
export function replaceRegion(markdown: string, marks: readonly [string, string], body: string): string {
  const a = markdown.indexOf(marks[0]), b = markdown.indexOf(marks[1]);
  if (a < 0 || b < a) throw new Error(`missing generated-region markers: ${marks[0]}`);
  return markdown.slice(0, a + marks[0].length) + '\n' + body + '\n' + markdown.slice(b);
}

/** The documents the ledger renders into, as they should read. */
export function rendered(ledger: Ledger, root = ROOT, u: Usage = usage(root)): Map<string, string> {
  const out = new Map<string, string>();
  const reference = join(root, 'docs/REFERENCE.md'), skill = join(root, 'skills/rayner-explainers/SKILL.md'), engine = join(root, 'docs/ENGINE.md'), index = join(root, 'docs/FEATURE-TOUR.md');
  out.set(reference, replaceRegion(readFileSync(reference, 'utf8'), MARK.features, featuresTable(ledger, u)));
  out.set(skill, replaceRegion(readFileSync(skill, 'utf8'), MARK.examples, examplesTable(ledger)));
  out.set(engine, replaceRegion(readFileSync(engine, 'utf8'), MARK.exceptions, exceptionsTable(ledger, u)));
  out.set(index, replaceRegion(readFileSync(index, 'utf8'), MARK.lookup, lookupTable(ledger, u, root)));
  return out;
}
