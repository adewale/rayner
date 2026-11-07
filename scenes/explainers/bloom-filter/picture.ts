import { Group, Rectangle, Text, lerpColor } from '../../../src/index.ts';
import type { Stage } from '../../../explain/index.ts';
import { label, table, stat, legend } from '../../../explain/drawing.ts';
import { locations } from './model.ts';
import { grouped } from '../lib/format.ts';

/** Each taken name's colour: text on white at 4.5:1 or better, and a pale fill behind a bit it set. */
const OWNER: Record<string, string> = { cat: '#8250df', dog: '#9a6700', more: '#57606a' };
/** Each owner's fill in words, as the captions and the legend say it. */
const OWNER_NAME: Record<string, string> = { cat: 'purple', dog: 'brown', more: 'grey' };
const PAPER = '#ffffff';
const fillOf = (name: string) => lerpColor(PAPER, OWNER[name]!, 0.36);

/**
 * The taken names over the row, as a legend: each name after a swatch of the fill it gives a bit, with the bits
 * it set. The legend says each fill's colour too ("purple fill, cat (1, 6, 15)"), the word the captions use.
 * `stored`: the names in the filter; `full`: the full row, where the later names share one grey entry.
 */
export function takenLabel(s: Stage, size: number, full: boolean, stored: readonly string[]): Group {
  const SIZE = 0.66;
  const lead = new Text(stored.length ? 'Taken:' : 'Taken: cat, dog. Not yet in the filter', { fontSize: SIZE, color: s.look.ink });
  const entry = (owner: string, label: string) => ({ label, fill: fillOf(owner), stroke: OWNER[owner]!, name: OWNER_NAME[owner]! });
  const items = !stored.length
    ? []
    : full
      ? [entry('cat', 'cat'), entry('dog', 'dog'), entry('more', `${stored.length - 2} more`)]
      : stored.map((name) => entry(name, `${name} (${locations(name, size).join(', ')})`));
  const key = items.length ? legend(s, items, { size: SIZE, direction: 'row', gap: 0.36, key: 'bloom-key' }) : null;
  // The lead and the legend in one centred row over the bits.
  const gap = 0.36,
    width = lead.width() + (key ? gap + key.width() : 0);
  lead.moveTo([-width / 2, 2.7], [-1, 0]);
  key?.moveTo([-width / 2 + lead.width() + gap, 2.7], [-1, 0]);
  const g = new Group(lead, ...(key ? [key] : []));
  g.key = 'bloom-taken';
  return g;
}

/**
 * The row of bits, keyed 'bloom-bits'. 16 bits sit in two rows of 8 large boxes; 32 bits in two rows of 16
 * narrower ones, so both keep each position, in grey, above its box and leave room for the footer lines below.
 * Each bit shows its value large in the box, filled in the colour of each name that set it, side by side;
 * `active` bits are outlined in the emphasis colour, and `bad` ones (a lookup's 0) in red.
 */
export function drawBits(
  s: Stage,
  bits: readonly number[],
  owners: readonly (readonly string[])[],
  active: readonly number[],
  bad: (j: number) => boolean,
): Group {
  const size = bits.length;
  const perRow = size === 16 ? 8 : 16,
    pitch = size === 16 ? 1.8 : 0.94,
    W = size === 16 ? 1.6 : 0.84,
    H = size === 16 ? 1.0 : 0.86,
    rowY = [0.75, -1.45],
    positionGap = 0.4;
  const bitTile = (j: number, bit: number, x: number, y: number, setBy: readonly string[], { active = false, bad = false } = {}) => {
    const part = W / Math.max(1, setBy.length);
    const color = bad ? s.look.bad : active ? s.look.emphasis : s.look.soft;
    const g = new Group(
      ...setBy.map((name, k) =>
        new Rectangle({ width: part, height: H, fill: fillOf(name), fillOpacity: 1, stroke: 'none' }).moveTo([
          x - W / 2 + part * (k + 0.5),
          y,
        ]),
      ),
      new Rectangle({ width: W, height: H, fill: 'none', stroke: color, strokeWidth: active || bad ? 0.055 : 0.025 }).moveTo([
        x,
        y,
      ]),
      label(String(j), x, y + H / 2 + positionGap, s.look.soft, 0.66),
      label(String(bit), x, y, bad ? s.look.bad : s.look.ink, size === 16 ? 0.9 : 0.74),
    );
    g.key = `bit-${j}`;
    return g;
  };
  const grid = new Group(
    ...bits.map((bit, j) => {
      const x = ((j % perRow) - (perRow - 1) / 2) * pitch,
        y = rowY[Math.floor(j / perRow)]!;
      return bitTile(j, bit, x, y, owners[j] ?? [], { active: active.includes(j), bad: bad(j) });
    }),
  );
  grid.key = 'bloom-bits';
  return grid;
}

/** One lookup as the pipeline step records it. */
interface Lookup { word: string; maybe: boolean; stored: boolean }
/**
 * The pipeline step: two blocks on one left edge, the three lookups with their read count beside them, then the
 * sample. Each row is keyed by what it is about, a name or a row length: bloom-pipeline:wolf:Filter is wolf's
 * answer, and bloom-sample:bits-16:Pass the 16-bit row's count, wherever the row sits.
 */
export function drawPipeline(
  s: Stage,
  st: { queries: readonly Lookup[]; exactLookups: number; sampleSize: number; sizes: readonly { size: number; setBits: number; sampleFalsePositives: number }[] },
): Group {
  const lookups = {
      headers: ['Name', 'Filter', 'Database'],
      rows: st.queries.map((q) => ({ key: q.word, cells: [q.word, q.maybe ? 'maybe' : 'no', q.maybe ? (q.stored ? 'taken' : 'free') : 'skipped'] })),
    },
    sample = {
      headers: [`${grouped(st.sampleSize)} untaken`, 'Bits set', 'Pass'],
      rows: st.sizes.map((row) => ({ key: `bits-${row.size}`, cells: [`${row.size} bits`, `${row.setBits} of ${row.size}`, grouped(row.sampleFalsePositives)] })),
    };
  const TABLE = 0.7,
    COLUMN_GAP = 1.1,
    READS_GAP = 1.4;
  const reads = stat(s, 'Reads', `${st.exactLookups} of ${st.queries.length}`, 0, 0, 'bloom-checks').scale(7 / 6);
  // The lookups and the read count beside them, centred together; the sample shares their left edge.
  const top = table(lookups.headers, lookups.rows, s, { xs: { left: 0, gap: COLUMN_GAP }, y: 2.6, gap: 0.98, key: 'bloom-pipeline', size: TABLE });
  // The read count sits level with the lookups' rows, centred on them.
  reads.moveTo([top.width() + READS_GAP, 0.64], [-1, 0]);
  const LEFT = -(top.width() + READS_GAP + reads.width()) / 2;
  top.shift([LEFT, 0]);
  reads.shift([LEFT, 0]);
  return new Group(
    top,
    reads,
    table(sample.headers, sample.rows, s, { xs: { left: LEFT, gap: COLUMN_GAP }, y: -1.75, gap: 0.98, key: 'bloom-sample', size: TABLE }),
  );
}
