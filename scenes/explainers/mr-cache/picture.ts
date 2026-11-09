import { Group, Text, Rectangle, Arrow, keyed } from '../../../src/index.ts';
import type { Box, Code } from '../../../src/index.ts';
import type { Stage } from '../../../explain/index.ts';
import { flow, label } from '../../../explain/drawing.ts';
import type { StagedStepsOptions } from '../../../explain/index.ts';
import { counted } from '../lib/format.ts';


export function frames(stage: Stage, which: 'hit' | 'miss', answer: string, opts?: StagedStepsOptions): Promise<void> {
  return stage.steps([
    {
      id: 'reader-request',
      title: 'Does this request need the database?',
      line: `Predict: a saved copy sits in front of the database. What does a cache ${which} cost?`,
      caption:
        'The handler’s lookup function, getUser, answers each request with one database query, even when the same user was fetched a second ago. The change in this merge request puts a store of saved values, a cache, in front of that query. If the user’s value is already saved, the request is a hit; if not, a miss. Count the database reads for the selected request before and after the change.',
      state: { request: which, beforeReads: 1, afterReads: which === 'hit' ? 0 : 1 },
      draw: (st, s) =>
        new Group(
          flow(s, ['Request', 'Database', 'Response'], { key: 'reader-flow' }),
          label(s, `Before: ${counted(st.beforeReads, 'database read', { words: true })}`, { at: [0, -1.4], size: 0.8 }),
        ),
    },
    {
      id: 'reader-outcome',
      title: which === 'hit' ? 'Answer: the hit skips the database' : 'Answer: the miss still reads the database',
      line: which === 'hit' ? 'The key already has a stored value.' : 'The key has no stored value yet.',
      caption:
        which === 'hit'
          ? `${answer}. KV, the cache, already holds this user, so the request returns the saved value with zero database reads. Switch to the miss to see what the saving costs when the value is not there.`
          : `${answer}. KV, the cache, has no entry for this user, so the request reads the database once, as before, stores the result in KV and returns it. A later request can use the saved value; this one did more work than it would have without the cache.`,
      state: { request: which, reads: which === 'hit' ? 0 : 1 },
      draw: (st, s) =>
        new Group(
          flow(s, st.request === 'hit' ? ['Request', 'KV hit', 'Response'] : ['KV miss', 'Database', 'KV write', 'Response'], { key: 'reader-flow' }),
          label(s, `Database reads: ${st.reads}`, { at: [0, -1.4], size: 0.85 }),
          label(s, st.request === 'hit' ? 'Saved value returned' : 'Fetched value saved and returned', { at: [0, -3], color: s.look.soft, size: 0.7 }),
        ),
    },
  ], opts);
}

/**
 * A code panel in the stage's colours, laid out as the helpers' CodeBlock lays
 * one out, but with the native Code left on the scene by itself so
 * TransformDiff can morph it. Centred in `box`, never above its top; or with
 * `pin`, its top-left corner there.
 */
export function panel(s: Stage, code: Code, box: Box, title: string, pin?: readonly [left: number, top: number]) {
  const pad = 0.3,
    width = code.width() + 2 * pad + 0.1,
    height = code.height() + 2 * pad + 0.42;
  const cx = pin ? pin[0] + width / 2 : (box[0] + box[2]) / 2,
    cy = pin ? pin[1] - height / 2 : Math.min(box[3] - height / 2, (box[1] + box[3]) / 2);
  const rect = new Rectangle({
    width,
    height,
    cornerRadius: 0.1,
    fill: s.look.raised,
    stroke: s.look.rule,
    strokeWidth: 0.016,
  }).moveTo([cx, cy]);
  code.moveTo([cx, cy - 0.21]);
  const label = new Text(title, { fontSize: 0.2, color: s.look.soft, anchor: 'start' }).moveTo(
    [cx - width / 2 + pad, cy + height / 2 - 0.3],
    [-1, 0],
  );
  return { rect, label };
}

/** In words, a code panel as a reader sees it: its title and every line. */
export const inWords = (title: string, code: Code) =>
  `Code “${title}”, ${code.lines.length} lines: ${code.lines.map((l, i) => `${i + 1}: ${l.text.trim()}`).join(' · ')}`;

/** Lines a..b of a code block, the block's full width. */
export function linesBox(code: Code, a: number, b: number): Box {
  const all = code.box()!,
    top = code.lines[a]!.box()!,
    bottom = code.lines[b]!.box()!;
  return [all[0], bottom[1], all[2], top[3]];
}

/** A tinted bar behind line i of a code block, as wide as its panel. */
export function lineBar(code: Code, rect: Rectangle, i: number, color: string): Rectangle {
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

/**
 * The two request paths side by side, one row each, the followed one (`which`) outlined and bold: a hit
 * goes from KV to Reply with 0 D1 reads; a miss goes through D1 and caches the row for 300 seconds.
 */
export function drawRequestPaths(which: 'hit' | 'miss', { emphasis, ink, soft }: { emphasis: string; ink: string; soft: string }): Group {
  const result = new Group();
  for (const [kind, y] of [
    ['hit', 1.5],
    ['miss', -1.8],
  ] as const) {
    const selected = kind === which;
    const color = selected ? emphasis : ink;
    const row = new Group(
      new Rectangle({
        width: 14.4,
        height: 2.9,
        cornerRadius: 0.12,
        stroke: selected ? color : soft,
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
    keyed(row, `result:${kind}`);
    result.add(row);
  }
  return result;
}
