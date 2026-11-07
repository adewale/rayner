// How one state of the periodic-groups explainer looks: the table (or, before it, the runs laid in rows),
// the words in the empty space above the d block, and the resting picture said in words. The scene sets
// the state; these draw it.
//
// Visual decisions: Atlas's block colours, each also named in words on the stage so colour never carries
// identity alone; the opening's comparison of one column is drawn large, with the full table shrunk to
// context beside it; and an element's cell and symbol keep their keys wherever they go, so the runs slide
// from their rows into the table.
import { Group, Text, Rectangle, Line, Arrow, matchByKey, lerpColor } from '../../../src/index.ts';
import type { Mobject, Vec, MatchKey } from '../../../src/index.ts';
import { POSITIONS, NAMES, CAPACITY, predicted } from './model.ts';
import type { Block, Symbol, Subshell, Position } from './model.ts';
import { listed as list } from '../lib/format.ts';
import { keyed } from '../../../explain/drawing.ts';

// The table: 18 numbered columns, 7 periods, the f block's two rows below.
const PITCH_X = 0.82,
  PITCH_Y = 0.66,
  CELL_W = 0.76,
  CELL_H = 0.6;
const LEFT = -PITCH_X * 9;
const colX = (col: number) => LEFT + (col - 0.5) * PITCH_X;
// Leave room for the question and subtitle above the full reference table.
const rowY = (row: number) => 2.29 - (row - 1) * PITCH_Y;
const HEADER_Y = 2.78;
const STRIP_Y = -2.24;
const fRowY = (row: number) => -3.03 - (row - 1) * PITCH_Y;
/**
 * The opening's small, unlabelled table and its caption, one row under the comparison: the
 * caption's left edge, the table's scale, and its centre. The caption is about 6.2 wide and the
 * table 14.76 × 0.4 = 5.9, so the pair, 1 apart, centres on the stage.
 */
const CONTEXT_LABEL_X = -6.6,
  CONTEXT_SCALE = 0.4,
  CONTEXT_X = 3.6,
  CONTEXT_Y = -2.8;
/** The empty rectangle above the d block, periods 1 to 3: where the words go. */
const NOTE_X = colX(3) - CELL_W / 2;

export const PAPER = '#f7f2e8',
  INK = '#0f0f0f',
  RULE = '#cccccc';
// Atlas's block colours (atlas-48p.pages.dev/about/design). Paper text reads at 4.6:1 or
// better on each. s, d and f are all dark, so each block is also named on the strip under
// the table and colour never carries identity alone.
const BLOCK: Record<Block, string> = { s: '#133e7c', d: '#9e1c2c', p: '#856912', f: '#0f0f0f' };
export const SOFT = '#666666';
const tint = (block: Block, k: number) => lerpColor(PAPER, BLOCK[block], k);

/** A cell in the table. Helium sits over beryllium until the blocks step moves it over neon. */
const cellAt = (z: number, heliumOverNeon = true): Vec => {
  if (z === 2 && !heliumOverNeon) return [colX(2), rowY(1)];
  const p = POSITIONS[z - 1]!;
  return p.group != null ? [colX(p.group), rowY(p.period)] : [colX(p.fColumn! + 2), fRowY(p.period - 5)];
};


/**
 * Every run of the filling rule through element 118, in order. A row starts at each run of
 * 2, which is where the table starts a row: just after a noble gas.
 */
export interface Run {
  sub: Subshell;
  from: number;
  to: number;
  row: number;
}
export const RUNS: Run[] = [];
{
  let from = 1,
    row = 0;
  for (const sub of predicted(POSITIONS.length)) {
    if (sub.l === 's') row++;
    RUNS.push({ sub, from, to: from + sub.electrons - 1, row });
    from += sub.electrons;
  }
}
/** How many cells each row of runs holds, laid side by side. */
export const ROW_CELLS = Array.from({ length: 7 }, (_, r) =>
  RUNS.filter((run) => run.row === r + 1).reduce((sum, run) => sum + run.sub.electrons, 0),
);

// The fill step lays each row's runs side by side, before any table: smaller cells, a
// small gap between runs, 32 across at most. The longest rows and their "= 32" span the
// stage; the short rows leave the upper right for the notes.
const PK_PITCH = 0.42,
  PK_W = 0.38,
  PK_H = 0.64,
  PK_GAP = 0.12,
  PK_LEFT = -7.45;
const pkRowY = (row: number) => 2.4 - (row - 1) * 0.8;
const PACKED: Vec[] = [];
const ROW_END: number[] = [];
{
  let row = 0,
    x = PK_LEFT;
  for (const run of RUNS) {
    if (run.row !== row) {
      row = run.row;
      x = PK_LEFT;
    } else x += PK_GAP;
    for (let i = 0; i < run.sub.electrons; i++) PACKED[run.from + i - 1] = [x + (i + 0.5) * PK_PITCH, pkRowY(row)];
    x += run.sub.electrons * PK_PITCH;
    ROW_END[row] = x;
  }
}

export const nameOf = (symbol: Symbol) => NAMES[symbol] ?? symbol;

/**
 * Parts pair across a redraw by the keys the pictures give them: an element's cell and
 * symbol keep their identity wherever they go, so the runs slide from their rows into the
 * table. Anything unkeyed pairs only when it is the same thing in the same place: the same
 * words, or a shape of the same size; a badge, a note or a block label that is new or gone
 * fades, and no letter travels between labels.
 */
export const samePlace: MatchKey = matchByKey({ fallback: (part: Mobject) => {
  const owner = part.parent instanceof Text ? part.parent : part;
  const b = owner.box();
  if (!b) return undefined;
  const at = `${((b[0] + b[2]) / 2).toFixed(2)},${((b[1] + b[3]) / 2).toFixed(2)}`;
  return part.parent instanceof Text
    ? `${part.parent.text}@${at}#${(part as { cluster?: number }).cluster ?? ''}`
    : `${(b[2] - b[0]).toFixed(2)}x${(b[3] - b[1]).toFixed(2)}@${at}`;
} });

/** One family member, as the family step writes it. */
export interface Member {
  symbol: Symbol;
  z: number;
  config: string | null;
  core: string | null;
  counted: string;
  uncounted: string;
  count: number | null;
}

/** The element a scenario follows, and its column, as the pictures need them. */
export interface Followed {
  z: number;
  group: number;
  name: string;
  Name: string;
  members: Position[];
  jumps: number[];
  family: Member[];
}

/**
 * One state of the explainer: the element followed, the step's note, and the knobs the pictures
 * read. Each step sets the knobs it needs, and a knob it leaves out takes its default.
 */
export interface PeriodicState {
  element: Symbol;
  z: number;
  group: number;
  note: 'column' | 'fill' | 'stack' | 'names' | 'blocks' | 'family';
  /** The followed column's band. */
  band?: boolean;
  members?: number[];
  gaps?: number[];
  /** The fill step lays the runs side by side in rows, before the table exists. */
  layout?: 'rows';
  /** How many cells are lit, in filling order. */
  lit?: number;
  filling?: string;
  runs?: number[];
  rows?: number[];
  blocks?: boolean;
  helium?: 'over-be' | 'over-ne';
  slid?: boolean;
  strip?: 'runs' | 'named';
  landed?: number;
  landingRun?: string;
  capacity?: Record<Block, number>;
  /** The element whose run the trail follows. */
  trail?: number;
  core?: number;
  coreSymbol?: Symbol | null;
  ruleMatches?: number;
  block?: Block;
  landing?: string[];
  count?: number;
  adjustment?: Position['adjustment'];
  listed?: string;
  listedCount?: number;
  ghost?: boolean;
  family?: { symbol: Symbol; config: string | null; count: number | null }[];
}

/** The table, drawn from the state: the runs in rows during the fill step, the 18-column table after it. */
export function drawTable(state: PeriodicState, { z, group, members }: Followed): Group {
  // The opening compares a family's atomic numbers. The complete table is
  // context there; give the comparison its own readable native drawing.
  const compact = state.note === 'column';
  // The fill step lays the runs side by side in rows, before the table exists.
  const packed = state.layout === 'rows';
  const heliumOverNeon = state.helium !== 'over-be';
  const lit = Number(state.lit ?? 0),
    trail = state.trail == null ? null : Number(state.trail);
  const blocks = !!state.blocks,
    band = !!state.band,
    onlyFamily = !!state.family;
  const memberZ = new Set(members.map((m) => m.z));
  const picture = new Group();
  for (let col = 1; !compact && !packed && col <= 18; col++) {
    const hot = band && col === group;
    picture.add(
      new Text(String(col), { fontSize: 0.24, color: hot ? INK : SOFT, weight: hot ? 'bold' : 'normal' }).moveTo([
        colX(col),
        HEADER_Y,
      ]),
    );
  }
  for (const p of POSITIONS) {
    // In the family step, only the column stays; in the fill step, only the cells filled so far.
    if (onlyFamily && !memberZ.has(p.z)) continue;
    if (packed && p.z > lit) continue;
    const [x, y] = packed ? PACKED[p.z - 1]! : cellAt(p.z, heliumOverNeon);
    const chosen = p.z === z;
    // Solid in its run's colour: every cell from the stack step on, the cells filled so far
    // in the fill step, and in the blocks step the chosen element's own electrons.
    const solid = trail != null ? p.z <= trail : blocks || p.z <= lit;
    const fill = solid ? BLOCK[p.block] : trail != null ? tint(p.block, 0.22) : PAPER;
    const stroke = chosen ? INK : solid ? BLOCK[p.block] : RULE;
    const letter = solid ? PAPER : INK,
      number = solid ? PAPER : SOFT;
    const cell = new Rectangle({
      width: packed ? PK_W : CELL_W,
      height: packed ? PK_H : CELL_H,
      cornerRadius: 0,
      fill,
      fillOpacity: 1,
      stroke: compact && !chosen ? SOFT : stroke,
      strokeWidth: compact ? (chosen ? 0.12 : 0.045) : chosen ? 0.05 : 0.015,
    }).moveTo([x, y]);
    if (!compact) cell.key = `periodic-cell:${p.z}`;
    picture.add(cell);
    if (compact) continue;
    const letters = new Text(p.symbol, {
      fontSize: packed ? 0.23 : 0.3,
      color: letter,
      weight: chosen ? 'bold' : 'normal',
    }).moveTo([x, packed ? y : y - 0.11]);
    letters.key = `periodic-symbol:${p.z}`;
    picture.add(letters);
    if (!packed)
      picture.add(
        new Text(String(p.z), { fontSize: 0.22, font: 'mono', color: number }).moveTo(
          [x - CELL_W / 2 + 0.05, y + 0.175],
          [-1, 0],
        ),
      );
  }
  // The chosen column, outlined over its cells.
  const top = rowY(members[0]!.period) + CELL_H / 2 + 0.05,
    bottom = rowY(members.at(-1)!.period) - CELL_H / 2 - 0.05;
  if (band)
    picture.add(
      new Rectangle({
        width: PITCH_X + 0.04,
        height: top - bottom,
        cornerRadius: 0,
        fill: 'none',
        stroke: INK,
        strokeWidth: compact ? 0.14 : 0.04,
      }).moveTo([colX(group), (top + bottom) / 2]),
    );
  // Where rows 2 and 3 laid their runs of 6 before sliding them over the runs of 6 below.
  if (state.slid)
    for (const row of [2, 3]) {
      const x0 = colX(3) - CELL_W / 2,
        x1 = colX(8) + CELL_W / 2;
      picture.add(
        new Rectangle({
          width: x1 - x0,
          height: CELL_H,
          cornerRadius: 0,
          fill: 'none',
          stroke: SOFT,
          strokeWidth: 0.025,
          dashArray: '0.1 0.07',
        }).moveTo([(x0 + x1) / 2, rowY(row)]),
        new Arrow([x1 + 0.06, rowY(row)], [colX(13) - CELL_W / 2 - 0.06, rowY(row)], {
          stroke: SOFT,
          strokeWidth: 0.03,
          tipLength: 0.18,
          tipWidth: 0.16,
        }),
      );
    }
  // Where helium's run alone would put it: over beryllium.
  if (state.ghost && !compact)
    picture.add(
      new Rectangle({
        width: CELL_W,
        height: CELL_H,
        cornerRadius: 0,
        fill: 'none',
        stroke: INK,
        strokeWidth: 0.03,
        dashArray: '0.1 0.07',
      }).moveTo([colX(2), rowY(1)]),
      new Text('He?', { fontSize: 0.26, color: SOFT }).moveTo([colX(2), rowY(1) - 0.04]),
    );
  // The runs' widths, measured under the columns: 2 + 10 + 6, and the f rows' 14. They are
  // named s, d, p and f only once the blocks step has named them.
  if (state.strip) {
    const named = state.strip === 'named';
    const span = (from: number, to: number, block: Block, label: string) => {
      const x0 = colX(from) - CELL_W / 2,
        x1 = colX(to) + CELL_W / 2;
      picture.add(
        new Line([x0, STRIP_Y], [x1, STRIP_Y], { stroke: BLOCK[block], strokeWidth: 0.05 }),
        new Line([x0, STRIP_Y - 0.09], [x0, STRIP_Y + 0.09], { stroke: BLOCK[block], strokeWidth: 0.035 }),
        new Line([x1, STRIP_Y - 0.09], [x1, STRIP_Y + 0.09], { stroke: BLOCK[block], strokeWidth: 0.035 }),
        new Text(label, { fontSize: 0.22, color: INK }).moveTo([(x0 + x1) / 2, STRIP_Y - 0.22]),
      );
    };
    span(1, 2, 's', named ? 's: 2 columns' : '2 columns');
    span(3, 12, 'd', named ? 'd: 10 columns' : '10 columns');
    span(13, 18, 'p', named ? 'p: 6 columns' : '6 columns');
    if (!onlyFamily)
      [named ? 'f: 14 columns,' : '14 columns,', 'no group', 'number'].forEach((line, i) =>
        picture.add(
          new Text(line, { fontSize: 0.22, color: INK }).moveTo(
            [colX(1) - CELL_W / 2, fRowY(1) + 0.12 - i * 0.32],
            [-1, 0],
          ),
        ),
      );
  }
  if (compact) {
    picture.key = 'periodic-context';
    picture.scale(CONTEXT_SCALE).moveTo([CONTEXT_X, CONTEXT_Y]);
  }
  return picture;
}

/** The words in the empty space above the d block (or, in the opening, the column compared large). */
export function drawNotes(state: PeriodicState, { z, group, members, jumps, family, Name }: Followed): Group {
  const picture = new Group();
  const say = (text: string, at: Vec, { size = 0.26, color = INK, edge = [-1, 0] as Vec, bold = false } = {}) =>
    picture.add(new Text(text, { fontSize: size, color, weight: bold ? 'bold' : 'normal' }).moveTo(at, edge));
  const note = String(state.note ?? '');
  if (note === 'column') {
    picture.key = 'periodic-family-comparison';
    say(`Group ${group}: elements from top to bottom`, [0, 2.6], { size: 0.68, edge: [0, 0] });
    const pitch = 1.95;
    members.forEach((m, i) => {
      const x = (i - (members.length - 1) / 2) * pitch;
      const hot = m.z === z,
        ink = hot ? PAPER : INK;
      const cell = new Group(
        new Rectangle({
          width: 1.65,
          height: 1.65,
          cornerRadius: 0,
          fill: hot ? BLOCK[m.block] : PAPER,
          stroke: hot ? BLOCK[m.block] : INK,
          strokeWidth: 0.03,
        }).moveTo([x, 1.1]),
        keyed(new Text(m.symbol, { fontSize: 0.72, color: ink, weight: 'bold' }).moveTo([x, 1.5]), `periodic-member:${m.symbol}:symbol`),
        keyed(
          new Text(String(m.z), { fontSize: 0.6, font: 'mono', color: hot ? PAPER : BLOCK[m.block] }).moveTo([x, 0.65]),
          `periodic-member:${m.symbol}:atomic-number`,
        ),
      );
      cell.key = `periodic-member:${m.symbol}`;
      picture.add(cell);
      if (i > 0) {
        const jump = new Text(`+${jumps[i - 1]}`, { fontSize: 0.62, font: 'mono', color: INK }).moveTo([
          x - pitch / 2,
          -0.45,
        ]);
        jump.key = `periodic-jump:${members[i - 1]!.symbol}:${m.symbol}`;
        picture.add(jump);
      }
    });
    // The small table's caption, beside it: the two make one row centred under the comparison.
    say(`Group ${group}`, [CONTEXT_LABEL_X, CONTEXT_Y + 0.42], { size: 0.72, bold: true });
    say(`in the ${POSITIONS.length}-cell table`, [CONTEXT_LABEL_X, CONTEXT_Y - 0.42], { size: 0.68 });
  }
  if (note === 'fill') {
    // The element's own runs, by length, in the space right of the short rows; the names
    // s, p, d and f come two steps later.
    const lengths = state.runs ?? [];
    const left = ROW_END[3]! + 1.5;
    say(`${Name}: ${z} electron${z > 1 ? 's' : ''}, one per cell`, [left, pkRowY(1)], { size: 0.32, color: SOFT });
    say(lengths.length > 1 ? `${lengths.join(' + ')} = ${lengths.reduce((a, b) => a + b, 0)}` : String(lengths[0] ?? ''), [
      left,
      pkRowY(2) + 0.04,
    ], { size: 0.5 });
    const rows = state.rows ?? null;
    if (rows) {
      say('Every full run is 2, 6, 10 or 14 cells', [left, pkRowY(3) + 0.08], { size: 0.34 });
      // Each row's length, at its right end.
      rows.forEach((n, i) => say(`= ${n}`, [ROW_END[i + 1]! + 0.16, pkRowY(i + 1) - 0.02], { size: 0.34, bold: true }));
      // Colour says the run's length; the legend says it in words too, spread under the longest rows.
      const legendY = pkRowY(7) - 1.0,
        legendPitch = (ROW_END[6]! - PK_LEFT) / 4;
      (['s', 'p', 'd', 'f'] as Block[]).forEach((b, i) => {
        const x = PK_LEFT + i * legendPitch;
        picture.add(new Line([x, legendY], [x + 0.6, legendY], { stroke: BLOCK[b], strokeWidth: 0.34 }));
        say(`run of ${CAPACITY[b]}`, [x + 1.0, legendY - 0.02], { size: 0.34 });
      });
    }
  }
  if (note === 'stack') {
    // Where the scenario's last electron lands, in the empty first row.
    say(String(state.landingRun ?? ''), [NOTE_X, rowY(1) - 0.04], { size: 0.28 });
  }
  if (note === 'blocks') {
    // The scenario's configuration and where its last electron lands, in the empty space above the d block.
    say('2 + 10 + 6 = 18 numbered columns', [NOTE_X, rowY(1)], { size: 0.3, bold: true });
    (state.landing ?? []).forEach((line, i) => say(line, [NOTE_X, rowY(1) - 0.5 - i * 0.38], { size: 0.27 }));
  }
  if (note === 'family') {
    // Beside each member, NIST's configuration with the endings lined up: the core
    // and any f electrons in the soft colour, since the count leaves them out. Then the
    // count, in a dark badge.
    const right = group <= 9,
      size = 0.28,
      gap = 0.12;
    const width = (t: string) => {
      const b = new Text(t, { fontSize: size }).box()!;
      return b[2] - b[0];
    };
    const listedRows = family.filter((m) => m.config);
    const widest = Math.max(
      ...listedRows.map((m) =>
        [m.core, m.uncounted, m.counted].filter(Boolean).reduce((w, t) => w + width(t!) + gap, -gap),
      ),
    );
    const edge = right ? colX(group) + CELL_W / 2 + 0.25 + widest : colX(group) - CELL_W / 2 - 0.62;
    for (const m of family) {
      const y = rowY(POSITIONS[m.z - 1]!.period);
      if (!m.config) {
        say(
          'outside our NIST reference',
          right ? [colX(group) + CELL_W / 2 + 0.25, y - 0.06] : [edge + 0.4, y - 0.06],
          { size: 0.24, color: SOFT, edge: right ? [-1, 0] : [1, 0] },
        );
        continue;
      }
      let x = edge;
      for (const [text, color] of [
        [m.counted, INK],
        [m.uncounted, SOFT],
        [m.core ?? '', SOFT],
      ] as const) {
        if (!text) continue;
        say(text, [x, y - 0.06], { size, color, edge: [1, 0] });
        x -= width(text) + gap;
      }
      const at: Vec = [edge + 0.34, y];
      picture.add(
        new Rectangle({
          width: 0.36,
          height: 0.36,
          cornerRadius: 0,
          fill: BLOCK[POSITIONS[m.z - 1]!.block],
          fillOpacity: 1,
          stroke: 'none',
        }).moveTo(at),
      );
      say(String(m.count), at, { size: 0.22, color: PAPER, edge: [0, 0], bold: true });
    }
  }
  if (picture.children.length === 0) say('', [NOTE_X, rowY(1)]);
  return picture;
}

/** The resting picture in words, from the same state and data the two views draw. */
export function sayPeriodic(st: PeriodicState, { z, group, name, Name, members, jumps, family }: Followed): string {
  const note = String(st.note ?? ''),
    said: string[] = [];
  said.push(
    note === 'family'
      ? `Only group ${group} remains, ${name} outlined.`
      : note === 'column'
        ? `A readable comparison above a small, unlabelled ${POSITIONS.length}-cell periodic table with group ${group} outlined.`
        : note === 'names'
          ? 'The table shows the named s, p, d and f widths, with helium now above neon.'
        : note === 'fill'
          ? `No table yet: one cell per element, ${name} (${z}) in bold.`
          : note === 'stack'
            ? `Periodic table of 118 elements with ${name} (${z}) in bold and helium over beryllium.`
            : `Periodic table of 118 elements with group ${group} outlined and ${name} (${z}) in bold.`,
  );
  if (note === 'column')
    said.push(
      `Group ${group}, top to bottom: ${members.map((m) => `${nameOf(m.symbol)} (${m.symbol}, ${m.z})`).join(', ')}. Atomic-number gaps: ${jumps.join(', ')}.`,
    );
  if (note === 'stack' || note === 'names' || note === 'blocks') {
    if (st.blocks) said.push('All 118 element cells are filled in by block colour.');
    if (st.trail != null)
      said.push(`${Name}’s ${st.trail} cell${Number(st.trail) > 1 ? 's are' : ' is'} solid in block colour; the other ${POSITIONS.length - Number(st.trail)} are pale.`);
  }
  if (note === 'fill') {
    said.push(`Cells 1 to ${st.lit} are filled in order, coloured by the run each one’s electron enters.`);
    const rows = st.rows ?? null;
    if (rows)
      said.push(
        `Each row starts with a run of 2 and lays its runs side by side: rows of ${list(rows.map(String))} cells. A legend reads blue as a run of 2, gold 6, red 10 and black 14.`,
      );
    const lengths = st.runs ?? [];
    said.push(`Note: ${name}’s ${z} electrons are runs of ${lengths.join(', ')}.`);
  }
  if (note === 'stack') said.push(`Note: ${String(st.landingRun ?? '')}.`);
  if (note === 'names') said.push('The run widths are named s, p, d and f, and helium has moved above neon because its first shell is full.');
  if (note === 'blocks') said.push(`Note: ${(st.landing ?? []).join(' ')}`);
  if (st.slid)
    said.push('Dashed outlines in rows 2 and 3, columns 3 to 8, mark where their runs of 6 sat before sliding 10 columns right.');
  if (st.ghost) said.push('A dashed cell marked He? sits over beryllium, where helium’s run alone would put it.');
  if (st.strip === 'runs' && note !== 'family')
    said.push('Under the columns, runs of 2, 10 and 6 stack into blocks 2, 10 and 6 columns wide; the 14-cell runs sit below with no group number.');
  if (st.strip === 'named' && note !== 'family')
    said.push('Under the columns, the s block spans 2, d 10 and p 6; the 14 f columns sit below with no group number.');
  if (note === 'family')
    said.push(
      family
        .map((m) =>
          m.config ? `${m.symbol} ${m.config}, count ${m.count}` : `${m.symbol} outside our NIST reference`,
        )
        .join('; ') + '.',
    );
  return said.join(' ');
}
