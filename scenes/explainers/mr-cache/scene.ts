import { readerFirst } from '../lib/reader-drawing.ts';
import { frames as readerFrames } from '../lib/readers/mr-cache.ts';
import {
  Scene,
  Code,
  Text,
  Rectangle,
  Group,
  Arrow,
  Create,
  FadeIn,
  FadeOut,
  Transform,
  TransformDiff,
  SurroundingRectangle,
  Circumscribe,
} from '../../../src/index.ts';
import type { Box, Mobject } from '../../../src/index.ts';
import { stage, settingsOf } from '../../../explain/index.ts';
import type { Palette } from '../../../explain/index.ts';
import { soft, raised, rule } from '../../../explain/look.ts';
// The merge request: the two texts TransformDiff animates, which
// test/explain-fidelity.test.ts holds to the real git diff.
import { BEFORE_CODE, AFTER_CODE, BEFORE_SPANS, AFTER_SPANS } from './code.ts';

const STYLE = 'hand-drawn';
const BEFORE = 'graph LR\nRequest[Request] --> H[Handler]\nH --> D1[(D1)]';
const AFTER =
  'graph LR\nRequest[Request] --> H[Handler]\nH --> KV[KV cache]\nKV -->|miss| D1[(D1)]\nKV -->|hit| Reply[Reply]\nD1 --> Reply';
const OPS = [
  { kind: 'remove_edge', id: 'H->D1#0' },
  { kind: 'add_node', id: 'KV', label: 'KV cache' },
  { kind: 'add_node', id: 'Reply', label: 'Reply' },
  { kind: 'add_edge', from: 'H', to: 'KV' },
  { kind: 'add_edge', from: 'KV', to: 'D1', label: 'miss' },
  { kind: 'add_edge', from: 'KV', to: 'Reply', label: 'hit' },
  { kind: 'add_edge', from: 'D1', to: 'Reply' },
];
const PATH = {
  hit: [
    ['Request', 'H'],
    ['H', 'KV'],
    ['KV', 'Reply'],
  ],
  miss: [
    ['Request', 'H'],
    ['H', 'KV'],
    ['KV', 'D1'],
    ['D1', 'Reply'],
  ],
} as const;
const FONT = 0.21;
/** Where the code sits: the bottom region, with a column on the right for callouts on what the diff did. */
const CODE_BOX: Box = [-7.55, -4.25, 3.35, -0.65],
  NOTES_BOX: Box = [3.65, -4.25, 7.55, -0.65];
const ADDED = '#2ea043',
  CHANGED = '#bf8700';

/**
 * A code panel in the stage's colours, laid out as the helpers' CodeBlock lays
 * one out, but with the native Code left on the scene by itself so
 * TransformDiff can morph it. Centred in `box`, never above its top; or with
 * `pin`, its top-left corner there.
 */
function panel(colors: Palette, code: Code, box: Box, title: string, pin?: readonly [left: number, top: number]) {
  const pad = 0.3,
    width = code.width() + 2 * pad + 0.1,
    height = code.height() + 2 * pad + 0.42;
  const cx = pin ? pin[0] + width / 2 : (box[0] + box[2]) / 2,
    cy = pin ? pin[1] - height / 2 : Math.min(box[3] - height / 2, (box[1] + box[3]) / 2);
  const rect = new Rectangle({
    width,
    height,
    cornerRadius: 0.1,
    fill: raised(colors),
    stroke: rule(colors),
    strokeWidth: 0.016,
  }).moveTo([cx, cy]);
  code.moveTo([cx, cy - 0.21]);
  const label = new Text(title, { fontSize: 0.2, color: soft(colors), anchor: 'start' }).moveTo(
    [cx - width / 2 + pad, cy + height / 2 - 0.3],
    [-1, 0],
  );
  return { rect, label };
}

/** In words, a code panel as a reader sees it: its title and every line. */
const inWords = (title: string, code: Code) =>
  `Code “${title}”, ${code.lines.length} lines: ${code.lines.map((l, i) => `${i + 1}: ${l.text.trim()}`).join(' · ')}`;

/** Lines a..b of a code block, the block's full width. */
function linesBox(code: Code, a: number, b: number): Box {
  const all = code.box()!,
    top = code.lines[a]!.box()!,
    bottom = code.lines[b]!.box()!;
  return [all[0], bottom[1], all[2], top[3]];
}

/** A tinted bar behind line i of a code block, as wide as its panel. */
function lineBar(code: Code, rect: Rectangle, i: number, color: string): Rectangle {
  const lines = code.lines,
    pitch = Math.abs(lines[1]!.anchorPoint()[1] - lines[0]!.anchorPoint()[1]);
  return new Rectangle({
    width: rect.width() - 0.14,
    height: pitch,
    cornerRadius: 0.05,
    fill: color,
    fillOpacity: 0.2,
    stroke: 'none',
  }).moveTo([rect.center()[0], lines[i]!.anchorPoint()[1]]);
}

export default class CacheMRExplainer extends Scene {
  static meta = {
    id: 'mr-cache',
    title: 'What does a cache hit save?',
    sources: ['https://github.com/ivarvong/lantern/blob/2c7bad5/scenes/mr-cache.ts'],
    watch: { databaseReads: 'Database reads', request: 'Request', reads: 'D1 reads' },
  };
  static settings = [
    {
      id: 'request',
      label: 'Follow a request',
      default: 'hit',
      options: [
        { value: 'hit', label: 'Cache hit' },
        { value: 'miss', label: 'Cache miss' },
      ],
    },
  ];
  override async construct() {
    const which = settingsOf(this).request as 'hit' | 'miss',
      s = stage(this, { headingSize: 0.6, style: STYLE });

    await readerFirst(this, s, readerFrames(which));
    await this.step('before', {
      detail: true,
      title: 'Before: every request reads D1',
      line: 'getUser is one D1 query, the outlined line 2.',
      caption:
        'getUser is a single D1 query, the outlined line, so the walked request goes from the handler straight to D1, and every lookup is a database read.',
    });
    await s.clear();
    const flow = await s.show({ source: BEFORE }, { box: 'top' });
    const colors = s.palette,
      hot = s.emphasis;
    const before = new Code(BEFORE_CODE, { fontSize: FONT, color: colors.ink, spans: BEFORE_SPANS }),
      after = new Code(AFTER_CODE, { fontSize: FONT, color: colors.ink, spans: AFTER_SPANS });
    // The merged file's panel decides where the code sits, and the old file
    // starts at its top-left corner: in the diff, the header line stays put and
    // the other lines move only down, to where the hunks put them.
    const merged = panel(colors, after, CODE_BOX, 'users.ts');
    const [left, , , top] = merged.rect.box()!;
    const shown = panel(colors, before, CODE_BOX, 'users.ts', [left, top]);
    // One description for the panel, whichever code it holds: its title stays through the diff.
    let held = before;
    const panelWords = () => inWords('users.ts', held);
    s.keep(shown.rect, shown.label, before, { describe: panelWords });
    // Three objects on the scene, not a group: TransformDiff replaces the Code by itself.
    await this.play(...[shown.rect, shown.label, before].map((m) => new FadeIn(m, { runTime: 0.4 })));
    await flow.walk(
      [
        ['Request', 'H'],
        ['H', 'D1'],
      ],
      { trail: true },
    );
    const outline = { buff: 0.06, cornerRadius: 0.06, stroke: hot, strokeWidth: 0.03 };
    const query = s.keep(new SurroundingRectangle(linesBox(before, 1, 1), outline), {
      describe: 'Line 2, the D1 query, outlined',
    });
    await this.play(new Create(query, { runTime: 0.5 }));
    this.state.databaseReads = 'every request';

    await this.step('diff', {
      detail: true,
      title: 'Four added lines and one rewritten',
      line: 'The old return keeps its D1 call; green lines check KV first.',
      caption:
        'The first line stays and the closing brace moves down to make room. The old return keeps its D1 call inside const row = await, and the green lines grow in. The outlined lines check KV first, so only a miss reaches D1, and the row is then written to KV for 300 seconds.',
    });
    await flow.clearNotes();
    await flow.unmark();
    await this.play(new FadeOut(query, { runTime: 0.3 }));
    s.keep(merged.rect, after, { describe: panelWords });
    // The diff drives the morph: unchanged lines travel whole, the rewritten
    // return keeps its shared tokens, added lines grow in. The hunks are
    // recorded in the trace, where test/explain-fidelity.test.ts holds them to
    // the real git CLI.
    const diff = new TransformDiff(before, after, { runTime: 1.6 });
    await this.play(diff, new Transform(shown.rect, merged.rect, { replace: true, runTime: 1.6 }));
    held = after;
    // What each line did, from the transform's own plan.
    const { same, changed, removed, added } = diff.plan;
    const bars = new Group(
      ...changed.map(([, j]) => lineBar(after, merged.rect, j, CHANGED)),
      ...added.map((j) => lineBar(after, merged.rect, j, ADDED)),
    );
    const numbers = (js: number[]) => js.map((j) => j + 1).join(', ');
    s.keep(bars, {
      describe: `Bars behind the lines the diff touched: line ${numbers(changed.map(([, j]) => j))} rewritten, lines ${numbers(added)} added`,
    });
    this.add(bars);
    this.add(after); // the code stays in front of its bars
    await this.play(new FadeIn(bars, { runTime: 0.5 }));
    // What the diff did, said beside the bars it put there: each run of rewritten or added lines
    // gets a callout in the column right of the code. Unchanged lines have no bar and no callout.
    const lines = (n: number) => `${n} line${n === 1 ? '' : 's'}`;
    const runs: { from: number; to: number; what: string; color: string }[] = [];
    for (const [js, what, color] of [
      [changed.map(([, j]) => j), 'rewritten', CHANGED],
      [added, 'added', ADDED],
    ] as const)
      for (const j of [...js].sort((a, b) => a - b)) {
        const last = runs.at(-1);
        if (last && last.what === what && last.to === j - 1) last.to = j;
        else runs.push({ from: j, to: j, what, color });
      }
    if (removed.length) throw new Error('The merge request removes no line; a removed line would need its own callout');
    const right = merged.rect.box()![2],
      said: Mobject[] = [];
    for (const r of runs.sort((a, b) => a.from - b.from)) {
      const box = linesBox(after, r.from, r.to);
      said.push(
        await s.callout([right - 0.1, box[1], right - 0.1, box[3]], `${lines(r.to - r.from + 1)} ${r.what}`, {
          side: 'right',
          gap: NOTES_BOX[0] - right + 0.15,
          color: r.color,
          size: 0.24,
        }),
      );
    }
    const lookup = new Circumscribe(linesBox(after, 1, 2), {
      keep: true,
      color: hot,
      buff: 0.06,
      cornerRadius: 0.06,
      strokeWidth: 0.03,
    });
    s.keep(lookup.outline, { describe: 'Lines 2 and 3, the KV lookup, outlined' });
    await this.play(lookup);

    await this.step('after', {
      detail: true,
      title: 'Replayed on the diagram, the diff adds KV and a hit path',
      line: 'A hit goes from KV to Reply; a miss falls through to D1.',
      caption:
        'The same edit, replayed as diagram operations, removes the handler’s edge to D1 and puts a KV cache between them. A hit goes from KV straight to Reply, while a miss falls through to D1 before replying.',
    });
    // The diff's bars and what they said go; the diagram takes the same edit.
    await this.play(...[bars, lookup.outline, ...said].map((m) => new FadeOut(m, { runTime: 0.4 })));
    await flow.morph({ source: AFTER }, { ops: OPS });
    await flow.note('KV', 'TTL 300 s', { side: 'above' });
    this.state.databaseReads = 'misses only';

    await this.step('request', {
      detail: true,
      title:
        which === 'hit'
          ? 'A cache hit returns from KV with no D1 read'
          : 'A cache miss reads D1 once, then caches the row',
      line:
        which === 'hit'
          ? 'The hit row bypasses D1: 0 reads.'
          : 'The miss row reads D1 once and caches the row for 300 s.',
      caption:
        which === 'hit'
          ? 'The user is already in KV, so getUser returns without reading D1. The highlighted hit row goes straight from KV to Reply; the miss row shows the database work this request avoids.'
          : 'KV has no entry, so the highlighted miss row goes through D1: one read, then the row is cached for 300 seconds. Lookups for the same user in that window follow the hit row; D1 still serves every miss.',
    });
    const path = PATH[which];
    await flow.clearNotes();
    await flow.dim([...new Set(path.flat())]);
    await flow.walk(path, { trail: true });
    // A hit runs the lookup and returns; a miss runs the lookup too, then the lines outlined here.
    const [a, b] = which === 'hit' ? [1, 2] : [3, 5];
    const ran = s.keep(new SurroundingRectangle(linesBox(after, a, b), outline), {
      describe: `Lines ${a + 1} to ${b + 1}, ${which === 'hit' ? 'the ones this request runs' : 'the ones only a miss runs'}, outlined`,
    });
    await this.play(new Create(ran, { runTime: 0.5 }));
    await flow.note('D1', which === 'hit' ? '0 reads' : '1 read', {
      side: 'below',
    });
    this.state.request = which;
    this.state.reads = which === 'hit' ? 0 : 1;
    // Keep the comparison together. The preceding walk follows the captured
    // program path; its result now replaces the detailed diagram/code view.
    await s.clear();
    const result = new Group();
    for (const [kind, y] of [
      ['hit', 1.5],
      ['miss', -1.8],
    ] as const) {
      const selected = kind === which;
      const color = selected ? s.emphasis : s.palette.ink;
      const row = new Group(
        new Rectangle({
          width: 14.4,
          height: 2.9,
          cornerRadius: 0.12,
          stroke: selected ? color : s.soft,
          strokeWidth: selected ? 0.05 : 0.015,
        }).moveTo([0, y]),
      );
      row.add(new Text(kind, { fontSize: 0.75, color, weight: selected ? 'bold' : 'normal' }).moveTo([-6.0, y]));
      const node = (name: string, x: number, width: number) => {
        row.add(
          new Rectangle({ width, height: 1.0, cornerRadius: 0.1, stroke: color, strokeWidth: 0.025 }).moveTo([x, y]),
          new Text(name, { fontSize: 0.7, color }).moveTo([x, y]),
        );
      };
      node('KV', -3.3, 2.0);
      node('Reply', 4.6, 2.6);
      if (kind === 'miss') node('D1', 0.4, 1.8);
      const arrow = (from: number, to: number) =>
        row.add(new Arrow([from, y], [to, y], { stroke: color, strokeWidth: 0.04, tipLength: 0.16, tipWidth: 0.16 }));
      if (kind === 'hit') arrow(-2.3, 3.3);
      else {
        arrow(-2.3, -0.5);
        arrow(1.3, 3.3);
      }
      row.add(new Text(kind === 'hit' ? '0 D1 reads' : '1 D1 read', { fontSize: 0.7, color }).moveTo([0.4, y - 0.95]));
      if (kind === 'miss') row.add(new Text('300 s', { fontSize: 0.7, color }).moveTo([-3.3, y - 0.95]));
      row.key = `result:${kind}`;
      result.add(row);
    }
    await s.enter(result, {
      describe: `Two request paths, ${which} highlighted: hit goes from KV to Reply with 0 D1 reads; miss goes from KV through D1 to Reply with 1 D1 read and caches the row for 300 seconds.`,
    });
  }
}
