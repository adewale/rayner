// How the font-metrics explainer draws each step's measurements: the two placed rows, the advance ruler,
// the two rulers under the opening's upper row, and the three cuts. Each picture is drawn from what its
// step records, so `rayner check` can redraw it.
//
// Visual decisions: every phrase is at size 0.9, so the advance ruler repeats the opening's 4.41, and the
// ruler's ticks and space cells come from the same shaped run the Text draws, not a separate estimate.
// The advance step's dimension is drawn here, with the stage, because a staged draw cannot add one later.
import { Group, Circle, Line, Rectangle } from '../../../src/index.ts';
import type { Text, TextOptions } from '../../../src/index.ts';
import type { Stage } from '../../../explain/index.ts';
import { dimension } from '../../../explain/drawing.ts';

export const SAMPLE = 'Ink on paper';
/** The gap each marker asks for after the phrase, in stage units. */
export const GAP = 0.5;
/** Where the phrase starts, and the upper row's height, in the opening and rulers pictures. */
const START = -5.3,
  TOP = 1.4;

/** What the pictures draw with: the stage, the scene's text (lettered), the phrase as drawn, and the ink colour. */
export interface Pen {
  stage: Stage;
  text: (value: string, opts?: TextOptions) => Text;
  phrase: () => Text;
  color: string;
}
/** The opening: what the layout measured, in each face. */
export interface LayoutState { layout: { wrong: number; actual: number } }
/** The advance step: the phrase's width, each glyph's start and each space's start and advance. */
export interface AdvanceState extends LayoutState { advance: number; pen: { starts: number[]; spaces: { x: number; advance: number }[] } }
/** The rulers step: each face's pen stops and where each marker went. */
export interface RulersState extends AdvanceState { rulers: { drawn: number[]; measured: number[]; markers: { drawn: number; measured: number } } }
/** The cuts step: each cut's advance, by its name. */
export interface CutsState extends RulersState { advances: Record<string, number> }

/** Two rows of the phrase in EB Garamond, each with a marker GAP past the width measured in one face. */
export function drawLayout(st: LayoutState, { stage, text, phrase, color }: Pen): Group {
  const emphasis = stage.look.emphasis;
  const comparison = new Group();
  comparison.key = 'font-layout';
  const rows = [
    [`Measured as Mono: ${st.layout.wrong.toFixed(2)}`, st.layout.wrong],
    [`Measured as Garamond: ${st.layout.actual.toFixed(2)}`, st.layout.actual],
  ] as const;
  for (const [i, [name, width]] of rows.entries()) {
    const y = 1.4 - i * 3.0;
    comparison.add(
      phrase().moveTo([START, y], [-1, 0]),
      new Circle({ radius: 0.22, fill: emphasis, stroke: 'none' }).moveTo([START + width + GAP, y]),
      text(name, { fontSize: 0.7, color }).moveTo([START, y + 1.1], [-1, 0]),
    );
  }
  return comparison;
}

/** The phrase with a tick at each pen stop, a dashed cell around each space, and the ruler's total under it. */
export function drawAdvance(st: AdvanceState, { stage, phrase }: Pen): Group {
  const emphasis = stage.look.emphasis;
  const ruled = phrase().moveTo([0, 1.0]);
  const [x0, y0, , y1] = ruled.box()!;
  const ticks = new Group();
  for (const x of st.pen.starts.slice(1))
    ticks.add(new Line([x0 + x, y0 - 0.08], [x0 + x, y0 - 0.3], { stroke: emphasis, strokeWidth: 0.02 }));
  for (const g of st.pen.spaces) {
    const cell = new Rectangle({ width: g.advance, height: y1 - y0, fill: 'none', stroke: emphasis, strokeWidth: 0.02 }).moveTo([
      x0 + g.x + g.advance / 2,
      (y0 + y1) / 2,
    ]);
    cell.style.dashArray = '0.08 0.06';
    ticks.add(cell);
  }
  // The ruler's total under the phrase, from the width the state records.
  const total = dimension(stage, [x0, y0 - 0.5], [x0 + st.advance, y0 - 0.5], `${st.advance.toFixed(2)} units`, { size: 0.7, offset: -0.4 });
  return new Group(ruled, ticks, total);
}

/** The opening's upper row with both faces' rulers under it, matching pen stops joined, and both markers. */
export function drawRulers(st: RulersState, { stage, text, phrase, color }: Pen): Group {
  const { emphasis, soft } = stage.look;
  const { drawn, measured, markers } = st.rulers;
  const upper = phrase().moveTo([START, TOP], [-1, 0]);
  const yDrawn = upper.box()![1] - 0.12,
    yMeasured = yDrawn - 2.2;
  const tick = (x: number, y: number) => new Line([START + x, y], [START + x, y - 0.3], { stroke: emphasis, strokeWidth: 0.025 });
  const drawnRuler = new Group(
    new Line([START, yDrawn], [START + drawn.at(-1)!, yDrawn], { stroke: emphasis, strokeWidth: 0.025 }),
    ...drawn.map((x) => tick(x, yDrawn)),
  );
  const measuredRuler = new Group(
    new Line([START, yMeasured], [START + measured.at(-1)!, yMeasured], { stroke: emphasis, strokeWidth: 0.025 }),
    ...measured.map((x) => tick(x, yMeasured + 0.3)),
  );
  const links = new Group(
    ...drawn.map(
      (x, i) => new Line([START + x, yDrawn - 0.34], [START + measured[i]!, yMeasured + 0.34], { stroke: soft, strokeWidth: 0.015 }),
    ),
  );
  drawnRuler.key = 'font-rulers-drawn';
  measuredRuler.key = 'font-rulers-measured';
  // Each marker sits its gap past its ruler's end, where the state records it.
  const marker = new Circle({ radius: 0.22, fill: emphasis, stroke: 'none' }).moveTo([START + markers.measured, TOP]);
  const ring = new Circle({ radius: 0.22, fill: 'none', stroke: emphasis, strokeWidth: 0.04 }).moveTo([START + markers.drawn, TOP]);
  // Each ruler's name and total to the right of the fan, level with its ruler.
  const nameX = START + measured.at(-1)! + 0.4;
  const names = new Group(
    text(`Garamond: ${drawn.at(-1)!.toFixed(2)}`, { fontSize: 0.6, color }).moveTo([nameX, yDrawn - 0.15], [-1, 0]),
    text(`JetBrains Mono: ${measured.at(-1)!.toFixed(2)}`, { fontSize: 0.6, color }).moveTo([nameX, yMeasured - 0.15], [-1, 0]),
  );
  // A dashed guide up from the Mono ruler's end to the words' row, the gap to the left of the filled marker.
  // The Garamond ruler ends under the last letter, so the ring needs none.
  const guides = new Line([START + measured.at(-1)!, yMeasured], [START + measured.at(-1)!, TOP], { stroke: soft, strokeWidth: 0.015 });
  guides.style.dashArray = '0.08 0.06';
  return new Group(upper, marker, drawnRuler, measuredRuler, links, guides, ring, names);
}

/** The three cuts in rows: each cut's name, the phrase in it, and its advance as the state records it. */
export function drawCuts<C extends string>(st: CutsState, cuts: readonly C[], word: (cut: C) => Text, { text, color }: Pen): Group {
  const g = new Group();
  for (const [index, cut] of cuts.entries()) {
    const y = 2.0 - index * 2.0;
    g.add(
      text(cut, { fontSize: 0.7, color }).moveTo([-5.6, y]),
      word(cut).moveTo([0, y]),
      text(st.advances[cut]!.toFixed(2), { fontSize: 0.7, color }).moveTo([5.2, y]),
    );
  }
  return g;
}
