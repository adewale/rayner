// The export rule as data (docs/ENGINE.md, "Public names"). Every public name of every entry point
// needs a reason to be public, and the reason is computed where it can be:
//
//   used      an explainer, a tutorial scene or a recipe imports it and uses it, found from their
//             imports. Nothing is written down.
//   tooling   it lives in rayner/output, rayner/testing or rayner/lettering, for an author's tests and
//             tools, a host page, or the build and the page (a scene imports only lettering's types).
//   taught    a guide section teaches it and a test runs it. test/public-names.json names both, and
//             both must exist and mention the name: the one reason that has to be written down.
//
// So the ledger lists only names that say something no import can: a `guide` and `test`, or a `check`,
// what `rayner check` verifies about the name, led by the check's name in the
// reference's Checks table ("Views: ..."). The same file holds the rows of the reference's engine
// features table and the skill's examples table, which are rendered from it, with their "used by"
// computed from the same usage, so neither can go stale (test/public-names.test.ts).
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { entryPoints as libraryEntryPoints } from '../../lib/entry-points.ts';

export const ROOT = resolve(import.meta.dirname, '../../..');
export const LEDGER = 'test/public-names.json';

/** What the ledger says about a name: where it is taught (a guide section and a test), and what check verifies it. */
export interface NameEntry { guide?: string; test?: string; check?: string }

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
export interface Ledger {
  names: Record<string, Record<string, NameEntry>>;
  features: FeatureRow[];
  examples: ExampleRow[];
}

/** The tooling entry points: a name in one of them is public as author tooling, and only there. */
export const TOOLING = new Set(['rayner/output', 'rayner/testing', 'rayner/lettering']);

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

/** The scenes and recipes whose imports count as use: each explainer, each tutorial scene and each recipe, with its files. */
export function users(root = ROOT): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const [dir, prefix] of [['scenes/explainers', ''], ['scenes/tutorial', 'tutorial/']] as const)
    for (const id of readdirSync(join(root, dir)).sort())
      if (existsSync(join(root, dir, id, 'scene.ts'))) out.set(prefix + id, closure(join(root, dir, id, 'scene.ts'), join(root, 'scenes')));
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
    code.set(user, files.map((f) => readFileSync(f, 'utf8')).join('\n'));
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

/** Why `name` in `entry` is public: tooling, used (by whom), taught, or nothing. */
export function reasonOf(ledger: Ledger, u: Usage, entry: string, name: string): string {
  if (TOOLING.has(entry)) return 'tooling';
  if (usersOf(u, name, entry).length) return 'used';
  return ledger.names[entry]?.[name]?.guide ? 'taught' : 'NONE';
}

/** Everything wrong with the ledger, as sentences: an empty list when every public name has a live reason. */
export async function problems(ledger: Ledger, root = ROOT, u: Usage = usage(root)): Promise<string[]> {
  const out: string[] = [];
  const exported = await publicNames(root);
  const checks = checkNames(root);
  for (const [entry, names] of exported)
    for (const name of names)
      if (reasonOf(ledger, u, entry, name) === 'NONE')
        out.push(`${name} (${entry}) has no reason to be public: no explainer, tutorial scene or recipe uses it, and ${LEDGER} names no guide and test that teach it`);
  for (const [entry, names] of Object.entries(ledger.names)) {
    if (!exported.has(entry)) { out.push(`${LEDGER} lists ${entry}, which is not an entry point`); continue; }
    for (const [name, r] of Object.entries(names)) {
      const at = `${name} (${entry})`;
      if (!exported.get(entry)!.includes(name)) { out.push(`${at} is in ${LEDGER} but ${entry} does not export it`); continue; }
      // Who uses a name is computed, never written down: an entry says where it is taught and what checks it.
      for (const key of Object.keys(r)) if (!['guide', 'test', 'check'].includes(key)) out.push(`${at}: ${key} is not part of a ledger entry (guide, test, check)`);
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
  const scenes = new Set(u.code.keys());
  for (const row of ledger.examples) {
    for (const s of row.scenes) if (!scenes.has(s)) out.push(`examples "${row.explaining}": ${s} is not a scene`);
    for (const name of row.names) {
      if (![...exported.values()].some((n) => n.includes(name))) out.push(`examples "${row.explaining}": ${name} is not exported`);
      else if (!row.scenes.some((s) => usersOf(u, name).includes(s))) out.push(`examples "${row.explaining}": none of ${row.scenes.join(', ')} uses ${name}`);
    }
    for (const [label, pattern] of Object.entries(row.patterns ?? {}))
      if (!row.scenes.some((s) => matching(u, pattern).includes(s))) out.push(`examples "${row.explaining}": none of ${row.scenes.join(', ')} shows ${label}`);
    // Every exported name the row's words claim is checked: in `names`, or the row cannot say it.
    for (const [, token] of `${row.start} ${row.shows}`.matchAll(/`([A-Za-z_$][\w$]*)/g))
      if ([...exported.values()].some((n) => n.includes(token!)) && !row.names.includes(token!) && !Object.keys(row.patterns ?? {}).some((l) => l.startsWith(token!)))
        out.push(`examples "${row.explaining}": it names ${token} but does not list it in names, so nothing checks it`);
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
  const scenesOnly = (xs: string[]) => xs.filter((x) => !x.startsWith('recipes/'));
  const used: string[] = [], unused: string[] = [];
  for (const item of row.items) {
    const label = item.label ?? item.name!;
    const who = scenesOnly(item.name ? usersOf(u, item.name) : matching(u, item.pattern!));
    if (who.length) used.push(`${tick(label)}: ${who.map(tick).join(', ')}`);
    else unused.push(tick(label));
  }
  return [used.join('; '), unused.length ? `no explainer yet: ${unused.join(', ')}` : ''].filter(Boolean).join('; ');
}

export const MARK = {
  features: ['<!-- generated from test/public-names.json by `node tools/repo/public-names.ts --write`: engine features -->', '<!-- end of generated engine features -->'],
  examples: ['<!-- generated from test/public-names.json by `node tools/repo/public-names.ts --write`: examples -->', '<!-- end of generated examples -->'],
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

/** `markdown` with the region between `marks` replaced by `body`; throws when the marks are missing. */
export function replaceRegion(markdown: string, marks: readonly [string, string], body: string): string {
  const a = markdown.indexOf(marks[0]), b = markdown.indexOf(marks[1]);
  if (a < 0 || b < a) throw new Error(`missing generated-region markers: ${marks[0]}`);
  return markdown.slice(0, a + marks[0].length) + '\n' + body + '\n' + markdown.slice(b);
}

/** The documents the ledger renders into, as they should read. */
export function rendered(ledger: Ledger, root = ROOT, u: Usage = usage(root)): Map<string, string> {
  const out = new Map<string, string>();
  const reference = join(root, 'docs/REFERENCE.md'), skill = join(root, 'skills/rayner-explainers/SKILL.md');
  out.set(reference, replaceRegion(readFileSync(reference, 'utf8'), MARK.features, featuresTable(ledger, u)));
  out.set(skill, replaceRegion(readFileSync(skill, 'utf8'), MARK.examples, examplesTable(ledger)));
  return out;
}
