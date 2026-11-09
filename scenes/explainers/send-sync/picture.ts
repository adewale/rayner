import { Text, Rectangle, Group } from '../../../src/index.ts';
import type { Box } from '../../../src/index.ts';
import type { Quadrant } from './model.ts';

// Phone legibility sets every size here. On a 390 px page the stage is 358 px wide, so a label needs
// 0.536 units (43 px on a 1280 px stage) to be 12 px there; native text is 0.54 units, so it reads
// at 12 px without a close-up.
// The camera frames one quadrant at 0.975 of the chart's box, and the plot is square (569 px), so a
// quadrant is 284.5 px across and the box's shorter side sets the scale. The box is 7.7 units tall,
// from the stage's foot to just under the heading's line (whose foot is near y = 3.3, so a taller box
// draws a framed quadrant's top edge through it), so a quadrant is 7.51 units and a point label of
// 20.4 px is 0.538 units. That size still fits the longest name, "x is Arc<Mutex<Cell<i32>>>", inside
// its quadrant, to the right of its point.
// The axis labels are 48 px of a 696 px chart, so they read in the whole chart, and stand 16 px further
// off the plot than usual so that none of them shows at the edge of a framed quadrant.
// The code block runs from -7.8 to 7.8: its longest line at 0.54 units needs a box 15.6 units wide,
// and a narrower box shrinks every line below 0.536.
export const SIZE = 0.54;
export const HEAD =
  '---\nconfig:\n  quadrantChart:\n    chartWidth: 696\n    chartHeight: 680\n    pointLabelFontSize: 20.4\n    quadrantLabelFontSize: 32\n    xAxisLabelFontSize: 48\n    yAxisLabelFontSize: 48\n    yAxisLabelPadding: 12\n---\n';
// Every point sits at one fixed spot per quadrant: at the left edge, so its name fits to its right, and
// below the quadrant's own name, which Mermaid centres in it.
// Mermaid's quadrant numbers, with x = Send and y = Sync: 1 both, 2 Sync only, 3 neither, 4 Send only.
export const SPOT: Record<Quadrant, [number, number]> = {
  1: [0.52, 0.625],
  2: [0.02, 0.625],
  3: [0.02, 0.125],
  4: [0.52, 0.125],
};
export const QUADRANT: Record<Quadrant, string> = { 1: 'Send and Sync', 2: 'Sync only', 3: 'Neither', 4: 'Send only' };
export const chart = (points: readonly { name: string; q: Quadrant }[]) =>
  HEAD +
  'quadrantChart\n  x-axis Not Send --> Send\n  y-axis Not Sync --> Sync\n' +
  ([1, 2, 3, 4] as const).map((n) => `  quadrant-${n} ${QUADRANT[n]}\n`).join('') +
  points.map((p) => `  ${p.name}: [${SPOT[p.q][0]}, ${SPOT[p.q][1]}]\n`).join('');

// The chart takes the left half; words take the right.
export const LEFT: Box = [-7.85, -4.5, -0.05, 3.2];
export const RIGHT: Box = [0.45, -4.25, 7.55, 3.05];
export const ZOOM = 1.25;

// The Agentic Mermaid verifier strips anything between < and > from a label before it compares it
// with the drawing, so a name that starts with a nested generic fails capture, and its edit operations
// refuse a point name with a colon. A name for a value, "x is ...", starts with a plain word. The
// scene's last step is about a value x of the built type.
export const valueName = (type: string) => `x is ${type}`;
/** Where each quadrant's cell sits in the small map under the right column, in Mermaid's numbering. */
export const MAP: Record<Quadrant, [number, number]> = { 1: [6.35, -1.95], 2: [4.15, -1.95], 3: [4.15, -2.95], 4: [6.35, -2.95] };

/** The colours the right column and the map are drawn in. */
export type Ink = { ink: string; paper: string; emphasis: string; soft: string };

/** Lines of text at the reader's size, wrapped to the right column, from `top` down; a head is bold in the emphasis colour. */
export function columnLines(rows: readonly (string | { text: string; head: true })[], top: number, { ink, emphasis }: Pick<Ink, 'ink' | 'emphasis'>): Text[] {
  const out: Text[] = [];
  let y = top - SIZE * 0.6;
  for (const row of rows) {
    const head = typeof row !== 'string';
    const words = (head ? row.text : row).split(' ');
    let line = '';
    const flush = () => {
      out.push(
        new Text(line, {
          fontSize: SIZE,
          color: head ? emphasis : ink,
          weight: head ? 'bold' : 'normal',
          anchor: 'start',
        }).moveTo([RIGHT[0] + 0.1, y], [-1, 0]),
      );
      y -= SIZE * 1.45;
      line = '';
    };
    for (const w of words) {
      const next = line ? line + ' ' + w : w;
      if (line && new Text(next, { fontSize: SIZE }).width() > RIGHT[2] - RIGHT[0] - 0.2) flush();
      line = line ? line + ' ' + w : w;
    }
    flush();
  }
  return out;
}

/**
 * A small map of the four quadrants under the right column, `filled` in the emphasis colour, so a
 * close-up of one quadrant keeps its place in the 2 × 2.
 */
export function quadrantMap(filled: Quadrant, { ink, paper, emphasis, soft }: Ink): Group {
  const parts = ([1, 2, 3, 4] as const).map((n) =>
    new Rectangle({
      width: 2.1,
      height: 0.92,
      fill: n === filled ? emphasis : paper,
      stroke: soft,
      strokeWidth: 0.025,
    }).moveTo(MAP[n]),
  );
  const word = (text: string, at: [number, number], edge: [number, number]) =>
    new Text(text, { fontSize: SIZE, color: ink }).moveTo(at, edge);
  return new Group(
    ...parts,
    word('Sync', [3.0, MAP[2][1]], [1, 0]),
    word('Not Sync', [3.0, MAP[3][1]], [1, 0]),
    word('Not Send', [MAP[3][0], -3.8], [0, 0]),
    word('Send', [MAP[4][0], -3.8], [0, 0]),
  );
}
