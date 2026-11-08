// Every public name documented (docs/ENGINE.md, "Public names"). The public surface is every value
// and type each entry point exports, every public member of an exported class, and the stage's
// members; a name is documented when the guides in docs/ name it in code:
//
//   a value or a type   its name, as a word, in a code span or block;
//   an options bag      or, for a type named `...Opts` or `...Options`, the signature of a documented
//                       function, constructor or member that takes or returns it, which an editor shows
//                       wherever it is called;
//   a member            `.name` or a span that starts with it (`name(` or `name`), in a section (the text
//                       under one heading) that also names its owner class in code, or `r.name` for one
//                       of the receivers the guides write for its owner (RECEIVERS: `s.card`, `d.walk`).
//
// A member that overrides an exported ancestor's is the ancestor's name, not one of its own
// (`FadeOut.begin` is `Animation.begin`), and one that implements an exported interface's is the
// interface's (`NullSink.frame` is `Sink.frame`).
// UNDOCUMENTED lists the public names that have no author purpose and are left for a decision rather
// than documented.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { entryPoints } from '../../lib/entry-points.ts';
import { ROOT } from '../../lib/roots.ts';

export interface PublicName {
  entry: string;
  /** The value's or type's name, or `Owner.member` for a member. */
  name: string;
  kind: 'value' | 'type' | 'member';
}

/**
 * Public names with no author purpose, kept out of the guides while a decision on them waits
 * (docs/ENGINE.md, "Public names"). It is empty: such a name is made `@internal`, `protected` or
 * private instead. A name here that the guides do document, or that is no longer public, fails the
 * test, so the list cannot go stale.
 */
export const UNDOCUMENTED: Record<string, string> = {};

/**
 * The receivers the guides write for an owner's members, as the error-message prefixes do
 * (docs/ENGINE.md, "Error messages"): `s.card` is the stage's `card` wherever it is shown.
 */
export const RECEIVERS: Record<string, readonly string[]> = {
  Stage: ['s'], Diagram: ['d'], View: ['view'], Machine: ['machine'], Mobject: ['m'], Code: ['code'],
};
/** A type that may be documented by a documented signature alone: an options bag. */
export const optionsBag = (name: string): boolean => /(Opts|Options)$/.test(name);

const internal = (d: ts.Node): boolean => ts.getJSDocTags(d).some((t) => t.tagName.text === 'internal');
const hidden = (d: ts.Declaration): boolean => {
  const flags = ts.getCombinedModifierFlags(d);
  if (flags & (ts.ModifierFlags.Private | ts.ModifierFlags.Protected)) return true;
  const name = (d as { name?: ts.Node }).name;
  return !!name && (ts.isPrivateIdentifier(name) || ts.isComputedPropertyName(name));
};
const memberish = (d: ts.Declaration): boolean =>
  ts.isPropertyDeclaration(d) || ts.isMethodDeclaration(d) || ts.isGetAccessorDeclaration(d) || ts.isSetAccessorDeclaration(d) ||
  ts.isPropertySignature(d) || ts.isMethodSignature(d) || ts.isPropertyAssignment(d) || ts.isShorthandPropertyAssignment(d);

export interface Surface {
  names: PublicName[];
  /** For each documented-by-signature check: the type names each value's or member's signatures mention. */
  signatures: Map<string, Set<string>>;
}

/** Type names a type node mentions, through unions, arrays, generics, functions and object literals. */
function typeNames(node: ts.Node | undefined, out: Set<string>): void {
  if (!node) return;
  const visit = (n: ts.Node): void => {
    if (ts.isTypeReferenceNode(n)) out.add(ts.isIdentifier(n.typeName) ? n.typeName.text : n.typeName.right.text);
    if (ts.isExpressionWithTypeArguments(n) && ts.isIdentifier(n.expression)) out.add(n.expression.text);
    n.forEachChild(visit);
  };
  visit(node);
}
/** The type names a declaration's signature shows: its parameters' types and its result's. */
function signatureNames(d: ts.Declaration): Set<string> {
  const out = new Set<string>();
  const of = (s: ts.SignatureDeclaration) => {
    for (const p of s.parameters) typeNames(p.type, out);
    typeNames(s.type, out);
  };
  if (ts.isFunctionDeclaration(d) || ts.isMethodDeclaration(d) || ts.isMethodSignature(d) || ts.isConstructorDeclaration(d) || ts.isGetAccessorDeclaration(d)) of(d);
  else if (ts.isClassDeclaration(d)) for (const m of d.members) { if (ts.isConstructorDeclaration(m)) of(m); }
  else if (ts.isPropertyDeclaration(d) || ts.isPropertySignature(d)) typeNames(d.type, out);
  else if (ts.isVariableDeclaration(d)) {
    typeNames(d.type, out);
    if (d.initializer && (ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer))) of(d.initializer);
  } else if (ts.isPropertyAssignment(d) && (ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer))) of(d.initializer);
  return out;
}

/** Every public name of every entry point: exported values and types, classes' public members, and the stage's. */
export function publicSurface(root = ROOT): Surface {
  const entries = [...entryPoints(root)].map(([name, module]) => [name, join(root, module + '.ts')] as const);
  const program = ts.createProgram(entries.map(([, f]) => f), {
    allowImportingTsExtensions: true, noEmit: true, target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext, strict: true, skipLibCheck: true,
  });
  const checker = program.getTypeChecker();
  const names: PublicName[] = [];
  const signatures = new Map<string, Set<string>>();
  const seenClass = new Set<ts.Symbol>();
  const addMember = (entry: string, owner: string, member: string, d: ts.Declaration) => {
    const name = `${owner}.${member}`;
    if (names.some((n) => n.kind === 'member' && n.name === name)) return;
    names.push({ entry, name, kind: 'member' });
    const s = signatures.get(name) ?? new Set<string>();
    for (const t of signatureNames(d)) s.add(t);
    signatures.set(name, s);
  };
  const implementedBy = (decl: ts.ClassDeclaration, name: string) => {
    for (const t of decl.heritageClauses?.find((h) => h.token === ts.SyntaxKind.ImplementsKeyword)?.types ?? []) {
      const symbol = checker.getSymbolAtLocation(t.expression);
      const resolved = symbol && (symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol);
      const entry = resolved && exportedBy(checker, program, entries, resolved);
      const member = entry && resolved.members?.get(ts.escapeLeadingUnderscores(name))?.declarations?.[0];
      if (member) return { entry, owner: resolved.name, member };
    }
    return undefined;
  };
  for (const [entry, file] of entries) {
    const module = checker.getSymbolAtLocation(program.getSourceFile(file)!)!;
    for (const exported of checker.getExportsOfModule(module)) {
      const target = exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported;
      const isValue = !!(target.flags & ts.SymbolFlags.Value) && !isTypeOnlyExport(exported);
      names.push({ entry, name: exported.name, kind: isValue ? 'value' : 'type' });
      const s = signatures.get(exported.name) ?? new Set<string>();
      for (const d of target.declarations ?? []) for (const t of signatureNames(d)) s.add(t);
      signatures.set(exported.name, s);
      // A class's public members, its own and those of ancestors no entry point exports.
      if (target.flags & ts.SymbolFlags.Class && !seenClass.has(target)) {
        seenClass.add(target);
        let decl = target.declarations?.find(ts.isClassDeclaration);
        const exportedClasses = new Set(checker.getExportsOfModule(module).map((e) => (e.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(e) : e)));
        while (decl) {
          for (const m of decl.members) {
            if (!m.name || ts.isConstructorDeclaration(m) || hidden(m) || internal(m) || overridesPublic(checker, decl, m)) continue;
            // A member that implements an exported interface's is the interface's: NullSink's frame is Sink.frame.
            const implemented = implementedBy(decl, m.name.getText());
            if (implemented) addMember(implemented.entry, implemented.owner, m.name.getText(), implemented.member);
            else addMember(entry, exported.name, m.name.getText(), m);
          }
          const base = decl.heritageClauses?.find((h) => h.token === ts.SyntaxKind.ExtendsKeyword)?.types[0];
          const baseSymbol = base && checker.getSymbolAtLocation(base.expression);
          const resolved = baseSymbol && (baseSymbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(baseSymbol) : baseSymbol);
          if (!resolved || exportedClasses.has(resolved) || allExported(checker, program, entries, resolved)) break;
          decl = resolved.declarations?.find(ts.isClassDeclaration);
        }
      }
      // The stage: the object stage() returns, which the Stage type names.
      if (exported.name === 'Stage' && entry === 'rayner/explain') {
        const type = checker.getDeclaredTypeOfSymbol(target);
        for (const p of checker.getPropertiesOfType(type)) {
          const d = p.declarations?.[0];
          if (!d || !memberish(d) || internal(d) || (ts.isPropertyAssignment(d) || ts.isShorthandPropertyAssignment(d) ? internal(d) : false)) continue;
          addMember(entry, 'Stage', p.name, d);
        }
      }
    }
  }
  return { names, signatures };
}
/** Whether `m` overrides a public member of an ancestor: then it is the ancestor's name, not its own. */
function overridesPublic(checker: ts.TypeChecker, decl: ts.ClassDeclaration, m: ts.ClassElement): boolean {
  if (!(ts.getCombinedModifierFlags(m as ts.Declaration) & ts.ModifierFlags.Override)) return false;
  const base = decl.heritageClauses?.find((h) => h.token === ts.SyntaxKind.ExtendsKeyword)?.types[0];
  if (!base) return false;
  const inherited = checker.getTypeAtLocation(base).getProperty(m.name!.getText());
  return !!inherited?.declarations?.some((d) => !hidden(d) && !internal(d));
}
function isTypeOnlyExport(symbol: ts.Symbol): boolean {
  return (symbol.declarations ?? []).some((d) => ts.isExportSpecifier(d) && (d.isTypeOnly || d.parent.parent.isTypeOnly));
}
const exportedAnywhere = new WeakMap<ts.Program, Map<ts.Symbol, string>>();
/** The entry point that exports `symbol` first, or undefined when none does. */
function exportedBy(checker: ts.TypeChecker, program: ts.Program, entries: readonly (readonly [string, string])[], symbol: ts.Symbol): string | undefined {
  let all = exportedAnywhere.get(program);
  if (!all) {
    all = new Map();
    for (const [entry, file] of entries)
      for (const e of checker.getExportsOfModule(checker.getSymbolAtLocation(program.getSourceFile(file)!)!)) {
        const target = e.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(e) : e;
        if (!all.has(target)) all.set(target, entry);
      }
    exportedAnywhere.set(program, all);
  }
  return all.get(symbol);
}
const allExported = (checker: ts.TypeChecker, program: ts.Program, entries: readonly (readonly [string, string])[], symbol: ts.Symbol): boolean =>
  exportedBy(checker, program, entries, symbol) !== undefined;

/**
 * The code in the guides, a section at a time: every inline code span and fenced block of docs/*.md,
 * one per line, for the text under each heading down to the next heading of any level.
 */
export function docsCode(root = ROOT): string[] {
  const dir = join(root, 'docs');
  const out: string[] = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.md')).sort()) {
    // A code span may run across the lines of one paragraph, so spans are read a paragraph at a time.
    let fenced = false, paragraph: string[] = [], section: string[] = [];
    const spans = () => {
      for (const [, , span] of paragraph.join(' ').matchAll(/(`+)(.+?)\1(?!`)/g)) section.push(span!.trim());
      paragraph = [];
    };
    const end = () => { spans(); out.push(section.join('\n')); section = []; };
    for (const line of readFileSync(join(dir, file), 'utf8').split('\n')) {
      if (/^\s*```/.test(line)) { spans(); fenced = !fenced; continue; }
      if (fenced) section.push(line);
      else if (/^#{1,6} /.test(line)) { end(); paragraph.push(line); }
      else if (!line.trim() || /^\s*([-*|#]|\d+\.)/.test(line)) { spans(); paragraph.push(line); }
      else paragraph.push(line);
    }
    end();
  }
  return out;
}

const escape = (s: string) => s.replace(/[$]/g, '\\$');
const word = (name: string) => new RegExp(`(?<![\\w$])${escape(name)}(?![\\w$])`);
/**
 * Whether the guides document `n`, by the rules at the top of this file. `code` is the guides' code a
 * section at a time (one string is one section); `shown` holds the options bags documented signatures show.
 */
export function documented(n: PublicName, code: string | readonly string[], shown: ReadonlySet<string>): boolean {
  const sections = typeof code === 'string' ? [code] : code;
  if (n.kind === 'member') {
    const owner = n.name.slice(0, n.name.indexOf('.')), member = escape(n.name.slice(n.name.indexOf('.') + 1));
    const shows = new RegExp(`\\.${member}(?![\\w$])|(^|\\n)${member}(?![\\w$])`), names = word(owner);
    const receivers = RECEIVERS[owner] && new RegExp(`(?<![\\w$])(${RECEIVERS[owner]!.join('|')})\\.${member}(?![\\w$])`);
    return sections.some((c) => (shows.test(c) && names.test(c)) || !!receivers?.test(c));
  }
  if (sections.some((c) => word(n.name).test(c))) return true;
  return n.kind === 'type' && optionsBag(n.name) && shown.has(n.name);
}

export interface DocsReport {
  surface: Surface;
  /** Each public name and whether the guides document it. */
  rows: (PublicName & { documented: boolean })[];
}
/** Each public name of the surface, with whether it is documented. */
export function docsReport(root = ROOT): DocsReport {
  const surface = publicSurface(root);
  const code = docsCode(root);
  // A documented value's or member's signature documents the options bags it shows.
  const direct = surface.names.filter((n) => documented(n, code, new Set()));
  const shown = new Set<string>();
  for (const n of direct) if (n.kind !== 'type') for (const t of surface.signatures.get(n.name) ?? []) shown.add(t);
  return { surface, rows: surface.names.map((n) => ({ ...n, documented: documented(n, code, shown) })) };
}

/** What is wrong: a public name with no documentation that UNDOCUMENTED does not list, or an UNDOCUMENTED entry that no longer applies. */
export function docsProblems(report: DocsReport, undocumented: Readonly<Record<string, string>> = UNDOCUMENTED): string[] {
  const out: string[] = [];
  const key = (r: PublicName) => `${r.name} (${r.entry})`;
  for (const r of report.rows)
    if (!r.documented && !undocumented[key(r)])
      out.push(`${key(r)} is public but no guide in docs/ names it: document it where it belongs, or make it internal`);
  for (const [k] of Object.entries(undocumented)) {
    const r = report.rows.find((x) => key(x) === k);
    if (!r) out.push(`${k} is listed as undocumented but is not public`);
    else if (r.documented) out.push(`${k} is listed as undocumented but a guide documents it: take it off the list`);
  }
  return out;
}
