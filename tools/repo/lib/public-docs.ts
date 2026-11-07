// Every public name documented (docs/ENGINE.md, "Public names"). The public surface is every value
// and type each entry point exports, every public member of an exported class, and the stage's
// members; a name is documented when the guides in docs/ name it in code:
//
//   a value or a type   its name, as a word, in a code span or block;
//   a type              or in the signature of a documented function, constructor or member (a
//                       parameter's or the result's type), which an editor shows wherever it is called;
//   a member            `.name` (`s.card`, `view.sync`), or a span that starts with it (`name(` or `name`).
//
// A member is matched by name, so one documented on another class counts: the check is loose by
// design, and catches a name no guide mentions at all. UNDOCUMENTED lists the public names that
// have no author purpose and are left for a decision rather than documented.
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
 * Public names with no author purpose, kept out of the guides on purpose: each either should not be
 * public or waits for a decision (docs/ENGINE.md, "Public names"). A name here that the guides do
 * document, or that is no longer public, fails the test, so the list cannot go stale.
 */
export const UNDOCUMENTED: Record<string, string> = {
  'Mobject.pointArrays (rayner)': "The renderer's and the bounds' own data, which a scene never reads: should be @internal.",
  'Mobject.boundingPointArrays (rayner)': "The renderer's and the bounds' own data, which a scene never reads: should be @internal.",
  'VMobject.pointArrays (rayner)': "The renderer's and the bounds' own data, which a scene never reads: should be @internal.",
  'Text.pointArrays (rayner)': "The renderer's and the bounds' own data, which a scene never reads: should be @internal.",
  'Frame.pointArrays (rayner)': "The renderer's and the bounds' own data, which a scene never reads: should be @internal.",
  'Text.frameBox (rayner)': "The renderer's and the bounds' own data, which a scene never reads: should be @internal.",
  'VMobject.pathData (rayner)': "The renderer's and the bounds' own data, which a scene never reads: should be @internal.",
  'VMobject.toPathD (rayner)': "The renderer's and the bounds' own data, which a scene never reads: should be @internal.",
  'VMobject.roundedRelative (rayner)': "The renderer's and the bounds' own data, which a scene never reads: should be @internal.",
  'VMobject.splitCurve (rayner)': "How a morph aligns two families' points, which the transforms do for a scene: should be @internal.",
  'VMobject.insertNCurves (rayner)': "How a morph aligns two families' points, which the transforms do for a scene: should be @internal.",
  'Animation.zipFamilies (rayner)': "How a morph aligns two families' points, which the transforms do for a scene: should be @internal.",
  'Animation.starting (rayner)': "How a morph aligns two families' points, which the transforms do for a scene: should be @internal.",
  'Animation.slots (rayner)': "How a morph aligns two families' points, which the transforms do for a scene: should be @internal.",
  'Animation.allMobjects (rayner)': "How a morph aligns two families' points, which the transforms do for a scene: should be @internal.",
  'Animation.subAlpha (rayner)': "How a morph aligns two families' points, which the transforms do for a scene: should be @internal.",
  'Animation.paints (rayner)': "How a morph aligns two families' points, which the transforms do for a scene: should be @internal.",
  'Transform.ownsTarget (rayner)': "How a morph aligns two families' points, which the transforms do for a scene: should be @internal.",
  'Transform.sameStructure (rayner)': "How a morph aligns two families' points, which the transforms do for a scene: should be @internal.",
  'Transform.targetCopy (rayner)': "How a morph aligns two families' points, which the transforms do for a scene: should be @internal.",
  'Transform.paints (rayner)': "How a morph aligns two families' points, which the transforms do for a scene: should be @internal.",
  'Transform.allMobjects (rayner)': "How a morph aligns two families' points, which the transforms do for a scene: should be @internal.",
  'TransformMatching.paints (rayner)': "How a morph aligns two families' points, which the transforms do for a scene: should be @internal.",
  'Animation.interpolateSubmobject (rayner)': "A per-submobject hook of Manim's that the engine's own animations override and no recipe or explainer does: protected, or documented for custom animations, is a decision for later.",
  'Transform.interpolateSubmobject (rayner)': "A per-submobject hook of Manim's that the engine's own animations override and no recipe or explainer does: protected, or documented for custom animations, is a decision for later.",
  'Create.interpolateSubmobject (rayner)': "A per-submobject hook of Manim's that the engine's own animations override and no recipe or explainer does: protected, or documented for custom animations, is a decision for later.",
  'Animation.setOptions (rayner)': "play()'s machinery: it applies a play's options with setOptions and awaits ready before it begins; a scene passes options to play() instead. Should be @internal.",
  'Animation.ready (rayner)': "play()'s machinery: it applies a play's options with setOptions and awaits ready before it begins; a scene passes options to play() instead. Should be @internal.",
  'AnimationGroup.setOptions (rayner)': "play()'s machinery: it applies a play's options with setOptions and awaits ready before it begins; a scene passes options to play() instead. Should be @internal.",
  'AnimationGroup.ready (rayner)': "play()'s machinery: it applies a play's options with setOptions and awaits ready before it begins; a scene passes options to play() instead. Should be @internal.",
  'Succession.setOptions (rayner)': "play()'s machinery: it applies a play's options with setOptions and awaits ready before it begins; a scene passes options to play() instead. Should be @internal.",
  'Action.setOptions (rayner/explain)': "play()'s machinery: it applies a play's options with setOptions and awaits ready before it begins; a scene passes options to play() instead. Should be @internal.",
  'Action.ready (rayner/explain)': "play()'s machinery: it applies a play's options with setOptions and awaits ready before it begins; a scene passes options to play() instead. Should be @internal.",
  'AnimationGroup.animations (rayner)': "A group's schedule, which play() lays out from the members a scene gave it: should be @internal.",
  'AnimationGroup.timings (rayner)': "A group's schedule, which play() lays out from the members a scene gave it: should be @internal.",
  'AnimationGroup.maxEnd (rayner)': "A group's schedule, which play() lays out from the members a scene gave it: should be @internal.",
  'Arrow.opts (rayner)': "A constructor's option, or a value derived from one, kept for the object's own use; the option itself is documented: should be private or @internal.",
  'StringSink.opts (rayner/output)': "A constructor's option, or a value derived from one, kept for the object's own use; the option itself is documented: should be private or @internal.",
  'SnapshotSink.opts (rayner/output)': "A constructor's option, or a value derived from one, kept for the object's own use; the option itself is documented: should be private or @internal.",
  'FadeIn.shiftVec (rayner)': "A constructor's option, or a value derived from one, kept for the object's own use; the option itself is documented: should be private or @internal.",
  'FadeIn.scaleFrom (rayner)': "A constructor's option, or a value derived from one, kept for the object's own use; the option itself is documented: should be private or @internal.",
  'FadeIn.mobjectStart (rayner)': "A constructor's option, or a value derived from one, kept for the object's own use; the option itself is documented: should be private or @internal.",
  'FadeOut.shiftVec (rayner)': "A constructor's option, or a value derived from one, kept for the object's own use; the option itself is documented: should be private or @internal.",
  'FadeOut.scaleTo (rayner)': "A constructor's option, or a value derived from one, kept for the object's own use; the option itself is documented: should be private or @internal.",
  'Create.borderWidth (rayner)': "A constructor's option, or a value derived from one, kept for the object's own use; the option itself is documented: should be private or @internal.",
  'Create.BORDER (rayner)': "A constructor's option, or a value derived from one, kept for the object's own use; the option itself is documented: should be private or @internal.",
  'Circumscribe.baseOpacity (rayner)': "A constructor's option, or a value derived from one, kept for the object's own use; the option itself is documented: should be private or @internal.",
  'GrowFromEdge.axis (rayner)': "A constructor's option, or a value derived from one, kept for the object's own use; the option itself is documented: should be private or @internal.",
  'PulseAlongPath.sourcePath (rayner)': "A constructor's option, or a value derived from one, kept for the object's own use; the option itself is documented: should be private or @internal.",
  'TransformDiff.given (rayner)': "A constructor's option, or a value derived from one, kept for the object's own use; the option itself is documented: should be private or @internal.",
  'Transform.pathFunc (rayner)': "A constructor's option, or a value derived from one, kept for the object's own use; the option itself is documented: should be private or @internal.",
  'TransformMatching.pathFunc (rayner)': "A constructor's option, or a value derived from one, kept for the object's own use; the option itself is documented: should be private or @internal.",
  'NumberLine.tipIdx (rayner)': "A constructor's option, or a value derived from one, kept for the object's own use; the option itself is documented: should be private or @internal.",
  'Mobject.updaters (rayner)': 'The list addUpdater fills and clearUpdaters empties, which are its API: should be @internal.',
  'Text.clusterMatching (rayner)': "Matching's hook into requested lettering, which the matching transforms read: should be @internal.",
  'Text.clusterKey (rayner)': "Matching's hook into requested lettering, which the matching transforms read: should be @internal.",
  'TransformMatching.moves (rayner)': 'The plan begin() makes; summary(), pairs, removed and added report it to a scene: should be @internal.',
  'TransformMatching.fadesOut (rayner)': 'The plan begin() makes; summary(), pairs, removed and added report it to a scene: should be @internal.',
  'TransformMatching.touched (rayner)': 'The plan begin() makes; summary(), pairs, removed and added report it to a scene: should be @internal.',
  'TransformFromCopy.takeCopy (rayner/extras)': "TransformFromCopy's own copy, made when it begins: should be private.",
  'DomSink.doc (rayner/output)': "The live sink's DOM plumbing, which the player's sink (app/embed-zoom.ts) builds on: should be protected or @internal.",
  'DomSink.NS (rayner/output)': "The live sink's DOM plumbing, which the player's sink (app/embed-zoom.ts) builds on: should be protected or @internal.",
  'DomSink.lastPatch (rayner/output)': "The live sink's DOM plumbing, which the player's sink (app/embed-zoom.ts) builds on: should be protected or @internal.",
  'DomSink.apply (rayner/output)': "The live sink's DOM plumbing, which the player's sink (app/embed-zoom.ts) builds on: should be protected or @internal.",
  'LetteringSnapshot (rayner)': 'The wire format of scene.lettering.json, which only the build and the page read; a scene names only LetteringRequest. Should be internal.',
  'PackedLetteringSnapshot (rayner)': 'The wire format of scene.lettering.json, which only the build and the page read; a scene names only LetteringRequest. Should be internal.',
  'StoredLetteringSnapshot (rayner)': 'The wire format of scene.lettering.json, which only the build and the page read; a scene names only LetteringRequest. Should be internal.',
  'Outcome (rayner/explain)': 'The type of Machine.outcome, which is internal; no scene names it. Should be internal.',
};

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
            if (!m.name || ts.isConstructorDeclaration(m) || hidden(m) || internal(m)) continue;
            addMember(entry, exported.name, m.name.getText(), m);
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
function isTypeOnlyExport(symbol: ts.Symbol): boolean {
  return (symbol.declarations ?? []).some((d) => ts.isExportSpecifier(d) && (d.isTypeOnly || d.parent.parent.isTypeOnly));
}
const exportedAnywhere = new WeakMap<ts.Program, Set<ts.Symbol>>();
function allExported(checker: ts.TypeChecker, program: ts.Program, entries: readonly (readonly [string, string])[], symbol: ts.Symbol): boolean {
  let all = exportedAnywhere.get(program);
  if (!all) {
    all = new Set();
    for (const [, file] of entries)
      for (const e of checker.getExportsOfModule(checker.getSymbolAtLocation(program.getSourceFile(file)!)!))
        all.add(e.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(e) : e);
    exportedAnywhere.set(program, all);
  }
  return all.has(symbol);
}

/** The code in the guides: every inline code span and fenced block of docs/*.md, one per line. */
export function docsCode(root = ROOT): string {
  const dir = join(root, 'docs');
  const out: string[] = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.md')).sort()) {
    // A code span may run across the lines of one paragraph, so spans are read a paragraph at a time.
    let fenced = false, paragraph: string[] = [];
    const spans = () => {
      for (const [, , span] of paragraph.join(' ').matchAll(/(`+)(.+?)\1(?!`)/g)) out.push(span!.trim());
      paragraph = [];
    };
    for (const line of readFileSync(join(dir, file), 'utf8').split('\n')) {
      if (/^\s*```/.test(line)) { spans(); fenced = !fenced; continue; }
      if (fenced) out.push(line);
      else if (!line.trim() || /^\s*([-*|#]|\d+\.)/.test(line)) { spans(); paragraph.push(line); }
      else paragraph.push(line);
    }
    spans();
  }
  return out.join('\n');
}

const escape = (s: string) => s.replace(/[$]/g, '\\$');
/** Whether the guides document `n`, by the rules at the top of this file. */
export function documented(n: PublicName, code: string, documentedTypes: ReadonlySet<string>): boolean {
  if (n.kind === 'member') {
    const member = escape(n.name.slice(n.name.indexOf('.') + 1));
    return new RegExp(`\\.${member}(?![\\w$])|(^|\\n)${member}(?![\\w$])`).test(code);
  }
  if (new RegExp(`(?<![\\w$])${escape(n.name)}(?![\\w$])`).test(code)) return true;
  return n.kind === 'type' && documentedTypes.has(n.name);
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
  // A documented value's or member's signature documents the types it shows.
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
