// The classes the public entry points export, read as a package consumer sees them, and how a test
// builds and uses an instance of each: what the tests that hold every exported class to a rule
// (test/scene-lifecycle.test.ts, test/core.test.ts) enumerate, so a class added or renamed fails them
// until it is built here, instead of dropping out unseen.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { Scene, Circle, Rectangle, FadeIn, Create, AnimationGroup, Transform, Text, Group, Mobject, Animation, Code, Line, Dot, keyed, matchByKey, shaperFor } from '../../src/index.ts';
import type { ScheduledAnimation, VMobject, Sink, Labeled, Arrow, NumberLine, Axes, MathTex, ItalicText, DecimalNumber } from '../../src/index.ts';
import { StringSink } from '../../src/output.ts';
import type { DomSink } from '../../src/output.ts';
import type { TraceSink, InvariantSink } from '../../explain/testing.ts';
import type { TextShaping } from '../../src/text-context.ts';

/** The public entry points, by specifier, as package.json exports them, each mapped to its source file. */
export const ENTRY_POINTS: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries((JSON.parse(readFileSync(join(import.meta.dirname, '../../package.json'), 'utf8')) as { exports: Record<string, { default: string }> }).exports)
    .map(([key, { default: built }]) => [key === '.' ? 'rayner' : `rayner/${key.slice(2)}`, built.replace(/^\.\/dist\//, '').replace(/\.js$/, '.ts')]),
);

/**
 * The classes the entry points export as values (a type-only class such as `Card` cannot be extended),
 * by name, with the members an author sees on each: every member of its instance type, inherited
 * ones included, that is neither private nor @internal, as the published declarations show them
 * (their public and protected members, the documented contract of a subclass). Read by the type
 * checker, so a class added, renamed or moved is found wherever it is declared.
 */
export function exportedClasses(): Map<string, Set<string>> {
  const options: ts.CompilerOptions = { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext, lib: ['lib.es2023.d.ts', 'lib.dom.d.ts'], types: [], allowImportingTsExtensions: true, noEmit: true, skipLibCheck: true, strict: true };
  const root = join(import.meta.dirname, '../..');
  const program = ts.createProgram(Object.values(ENTRY_POINTS).map((f) => join(root, f)), options);
  const checker = program.getTypeChecker();
  const hidden = (d: ts.Declaration) => ts.getCombinedModifierFlags(d) & ts.ModifierFlags.Private || ts.getJSDocTags(d).some((t) => t.tagName.text === 'internal');
  const classes = new Map<string, Set<string>>();
  for (const file of Object.values(ENTRY_POINTS)) {
    for (const exported of checker.getExportsOfModule(checker.getSymbolAtLocation(program.getSourceFile(join(root, file))!)!)) {
      // A class exported as a type only (`export type { Card }`) cannot be extended.
      if (exported.declarations?.some((d) => ts.isExportSpecifier(d) && (d.isTypeOnly || d.parent.parent.isTypeOnly))) continue;
      const symbol = exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported;
      if (!(symbol.flags & ts.SymbolFlags.Class) || !(symbol.flags & ts.SymbolFlags.Value)) continue;
      const surface = new Set<string>();
      for (const p of checker.getPropertiesOfType(checker.getDeclaredTypeOfSymbol(symbol))) {
        // An ES private member or a symbol-keyed one has no name an author can write.
        if (p.name.startsWith('__#') || p.name.startsWith('__@')) continue;
        if (!(p.declarations ?? []).every(hidden)) surface.add(p.name);
      }
      classes.set(exported.name, surface);
    }
  }
  return classes;
}

/** A shaping service from the embedded fonts, for the texts that need one (MathTex, ItalicText). */
const embedded: TextShaping = { shape: (owner, text, size) => shaperFor(owner.font)(text, size) };

/** How a test builds an instance of each exported mobject class, given the class (or a subclass of it). */
export const MOBJECTS: Record<string, (C: any) => Mobject> = {
  Mobject: (C) => new C().add(new Circle()),
  Group: (C) => new C(new Circle(), new Rectangle({ width: 1 }).shift([2, 0])),
  VMobject: (C) => (new C({ stroke: '#336699' }) as VMobject).startNewPath([0, 0]).addLineTo([1, 1]).addLineTo([2, 0]),
  Polygon: (C) => new C([[0, 0], [1, 1], [2, 0]]),
  Rectangle: (C) => new C({ width: 2, height: 1 }),
  Circle: (C) => new C({ radius: 0.8 }),
  Dot: (C) => new C(),
  Line: (C) => new C([-1, 0], [1, 1]),
  Labeled: (C) => new C(new Rectangle({ width: 2 }), new Text('box')),
  Arrow: (C) => new C([-2, 0], [2, 1]),
  Arc: (C) => new C({ radius: 1, angle: 2 }),
  ArcBetweenPoints: (C) => new C([-1, 0], [1, 0]),
  CurvedArrow: (C) => new C([-1, 0], [1, 0]),
  SurroundingRectangle: (C) => new C(new Circle()),
  Cross: (C) => new C(new Rectangle()),
  Brace: (C) => new C(new Rectangle({ width: 2 })),
  BraceLabel: (C) => new C(new Rectangle({ width: 2 }), 'width'),
  Text: (C) => new C('a word'),
  DecimalNumber: (C) => new C(3.25, { decimals: 2 }),
  Code: (C) => new C(['let x = 1;', '\treturn x;']),
  NumberLine: (C) => new C({ range: [0, 4, 1], includeTip: true, includeNumbers: true }),
  Axes: (C) => new C({ xRange: [0, 4, 1], yRange: [0, 2, 1], width: 4, height: 2, xLabel: 'x', yLabel: 'y', tips: true }),
  Frame: (C) => new C(),
  MathTex: (C) => new C('x+1', { shaping: embedded }),
  ItalicText: (C) => new C('slanted', { shaping: embedded }),
};

/**
 * What a run does with a mobject of a class that keeps state of its own, through its public members,
 * after it is built and again on its copy: what reads that state.
 */
export const USES: Partial<Record<string, (m: any) => void>> = {
  Labeled: (m: Labeled) => { m.shape.setFill('#cc3300'); m.label?.setFill('#3366cc'); },
  Arrow: (m: Arrow) => m.putStartAndEndOn([-1, -1], [2, 1.5]),
  Text: (m: Text) => m.rotate(0.3).setText('another word'),
  DecimalNumber: (m: DecimalNumber) => m.setValue(7.5),
  Code: (m: Code) => m.span(1, 1, 7).setFill('#cc3300'),
  NumberLine: (m: NumberLine) => { m.tip?.setFill('#cc3300'); m.numbers.setFill('#3366cc'); },
  Axes: (m: Axes) => { m.add(m.plot((x) => x * x / 8)); m.xLabel?.setFill('#cc3300'); },
  MathTex: (m: MathTex) => m.setText('y+2'),
  ItalicText: (m: ItalicText) => m.scale(1.5).setText('leaning'),
};

/** How a test builds an instance of each exported animation class, given the class (or a subclass of it), over fresh mobjects. */
export const ANIMATIONS: Record<string, (C: any) => ScheduledAnimation> = {
  Animation: (C) => new C(new Circle()),
  Transform: (C) => new C(new Group(new Rectangle(), new Rectangle().shift([1.5, 0])), new Group(new Circle(), new Circle().shift([2, -1])), { lagRatio: 0.5 }),
  FadeIn: (C) => new C(new Circle(), { shift: [1, 0] }),
  FadeOut: (C) => new C(new Circle()),
  GrowFromEdge: (C) => new C(new Rectangle(), [0, -1]),
  Create: (C) => new C(new Group(new Circle(), new Rectangle().shift([2, 0]))),
  AnimationGroup: (C) => new C([new FadeIn(new Circle()), new Create(new Rectangle().shift([2, 0]))], { lagRatio: 0.5 }),
  LaggedStart: (C) => new C([new FadeIn(new Circle()), new FadeIn(new Rectangle().shift([2, 0]))]),
  Succession: (C) => { const d = new Rectangle(); return new C([new FadeIn(d), d.animate.shift([-1, -1]), new Transform(d, new Circle().shift([0, -2]))]); },
  Restore: (C) => { const r = new Rectangle(); r.saveState(); r.shift([2, 1]).scale(0.5); return new C(r); },
  TransformFromCopy: (C) => new C(new Circle(), new Rectangle().shift([2, 0])),
  MoveAlongPath: (C) => new C(new Dot(), new Line([-2, 0], [2, 1])),
  PulseAlongPath: (C) => new C(new Dot(), new Line([-2, 0], [2, 1])),
  Circumscribe: (C) => new C(new Rectangle()),
  TransformMatching: (C) => new C(new Group(keyed(new Circle(), 'a'), keyed(new Rectangle(), 'b')), new Group(keyed(new Circle().shift([1, 0]), 'a')), { key: matchByKey() }),
  TransformMatchingShapes: (C) => new C(new Group(new Circle(), new Rectangle()), new Group(new Rectangle().shift([1, 0]), new Circle())),
  TransformMatchingText: (C) => new C(new Text('one two'), new Text('two one')),
  TransformDiff: (C) => new C(new Code(['let x = 1;', 'return x;']), new Code(['let x = 2;', 'return x;'])),
};

/** A fake DOM, enough for a DomSink: what it draws, written out. */
function fakeDom(): { container: Element; drawn: () => string } {
  type Node = { tagName: string; attrs: Map<string, string>; kids: Node[]; parent: Node | null; textContent: string; style: Record<string, string> };
  const make = (tagName: string): Node => {
    const n: Node = { tagName, attrs: new Map(), kids: [], parent: null, textContent: '', style: {} };
    const detach = () => { if (n.parent) n.parent.kids.splice(n.parent.kids.indexOf(n), 1); n.parent = null; };
    Object.assign(n, {
      setAttribute: (k: string, v: string) => n.attrs.set(k, v), removeAttribute: (k: string) => n.attrs.delete(k), getAttribute: (k: string) => n.attrs.get(k) ?? null,
      appendChild: (c: Node & { remove(): void }) => { c.remove(); c.parent = n; n.kids.push(c); return c; },
      insertBefore: (c: Node & { remove(): void }, ref: Node | null) => { c.remove(); c.parent = n; n.kids.splice(ref ? n.kids.indexOf(ref) : n.kids.length, 0, c); return c; },
      replaceChildren: (...cs: Array<Node & { remove(): void }>) => { for (const c of [...n.kids]) (c as Node & { remove(): void }).remove(); for (const c of cs) (n as unknown as { appendChild(c: Node): void }).appendChild(c); },
      remove: detach,
    });
    Object.defineProperties(n, {
      firstChild: { get: () => n.kids[0] ?? null },
      nextSibling: { get: () => (n.parent ? n.parent.kids[n.parent.kids.indexOf(n) + 1] ?? null : null) },
    });
    return n;
  };
  const host = make('main');
  (host as unknown as { ownerDocument: object }).ownerDocument = { createElementNS: (_ns: string, tag: string) => make(tag) };
  const write = (n: Node): string => `<${n.tagName}${[...n.attrs].map(([k, v]) => ` ${k}="${v}"`).join('')}>${n.textContent}${n.kids.map(write).join('')}</${n.tagName}>`;
  return { container: host as unknown as Element, drawn: () => write(host) };
}

/** How a test builds each exported sink class, given the class (or a subclass of it), and reads what it made of a run. */
export const SINKS: Record<string, { make: (C: any) => Sink; read: (sink: any) => unknown }> = {
  NullSink: { make: (C) => new C(), read: () => null },
  StringSink: { make: (C) => new C(), read: (sink: StringSink) => sink.frames },
  DomSink: {
    make: (C) => { const dom = fakeDom(); const sink = new C(dom.container, { realtime: false }); drawnBy.set(sink, dom.drawn); return sink; },
    read: (sink: DomSink) => drawnBy.get(sink)!(),
  },
  TraceSink: { make: (C) => new C({ skipUntil: 0 }), read: (sink: TraceSink) => sink.steps() },
  InvariantSink: { make: (C) => new C(new StringSink()), read: (sink: InvariantSink) => [sink.failures, [...sink.checked], [...sink.held], sink.vacuous()] },
};
const drawnBy = new WeakMap<Sink, () => string>();

/** The classes the entry points export that an author constructs and does not extend: they hold no claim. */
export const MADE_NOT_EXTENDED = ['Diagram', 'Machine', 'StopScene'];


/** What a class is to the rule a subclass's names are held to: what an author extends, by kind. */
export type ClassKind = 'scene' | 'mobject' | 'animation' | 'sink';

/**
 * Every class an entry point exports as a value, with its kind (undefined for one made, not extended),
 * the class itself and the members an author sees on it (see exportedClasses).
 */
export async function publicClasses(): Promise<Array<{ name: string; kind: ClassKind | undefined; C: abstract new (...args: any[]) => object; surface: ReadonlySet<string> }>> {
  const entry: Record<string, unknown> = {};
  for (const file of Object.values(ENTRY_POINTS)) Object.assign(entry, await import(join('../..', file)));
  return [...exportedClasses()].map(([name, surface]) => {
    const C = entry[name] as abstract new (...args: any[]) => object;
    const kind: ClassKind | undefined = C === Scene || C.prototype instanceof Scene ? 'scene'
      : C === Mobject || C.prototype instanceof Mobject ? 'mobject'
        : C === Animation || C.prototype instanceof Animation || C === AnimationGroup || C.prototype instanceof AnimationGroup ? 'animation'
          : typeof (C.prototype as Partial<Sink>).frame === 'function' ? 'sink' : undefined;
    return { name, kind, C, surface };
  });
}
