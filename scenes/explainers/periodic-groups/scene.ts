import {
  Scene,
  Group,
  Text,
  Rectangle,
  Line,
  Arrow,
  Animation,
  AnimationGroup,
  Succession,
  FadeIn,
  view,
  linear,
} from '../../../src/index.ts';
import type { SceneState, View, Mobject, Vec, MatchKey } from '../../../src/index.ts';
import { stage, settingsOf } from '../../../explain/index.ts';
import { lerpColor } from '../../../src/color.ts';
import {
  POSITIONS,
  NAMES,
  CAPACITY,
  NIST_UP_TO,
  NIST_EXCEPTIONS,
  periodLength,
  predicted,
  listed,
  coreOf,
  counted,
  membersOf,
  gaps,
  symbolOf,
  atomicNumber,
  configText,
  subshellText,
  shorthand,
  beyondCore,
} from '../lib/periodic-groups.ts';
import type { Block, Symbol, Subshell } from '../lib/periodic-groups.ts';

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
/** The empty rectangle above the d block, periods 1 to 3: where the words go. */
const NOTE_X = colX(3) - CELL_W / 2,
  NOTE_RIGHT = colX(12) + CELL_W / 2;

const PAPER = '#f7f2e8',
  INK = '#0f0f0f',
  RULE = '#cccccc';
// Atlas's block colours (atlas-48p.pages.dev/about/design). Paper text reads at 4.6:1 or
// better on each. s, d and f are all dark, so each block is also named on the strip under
// the table and colour never carries identity alone.
const BLOCK: Record<Block, string> = { s: '#133e7c', d: '#9e1c2c', p: '#856912', f: '#0f0f0f' };
const SOFT = '#666666';
const tint = (block: Block, k: number) => lerpColor(PAPER, BLOCK[block], k);

const ELEMENTS = {
  na: 'Na',
  cl: 'Cl',
  fe: 'Fe',
  cu: 'Cu',
  he: 'He',
} as const satisfies Record<string, Symbol>;
type Choice = keyof typeof ELEMENTS;

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
interface Run {
  sub: Subshell;
  from: number;
  to: number;
  row: number;
}
const RUNS: Run[] = [];
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
const ROW_CELLS = Array.from({ length: 7 }, (_, r) =>
  RUNS.filter((run) => run.row === r + 1).reduce((sum, run) => sum + run.sub.electrons, 0),
);

// The fill step lays each row's runs side by side, before any table: smaller cells, a
// small gap between runs, 32 across at most.
const PK_PITCH = 0.4,
  PK_W = 0.36,
  PK_H = 0.56,
  PK_GAP = 0.1,
  PK_LEFT = -7.0;
const pkRowY = (row: number) => 2.2 - (row - 1) * 0.72;
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

const nameOf = (symbol: Symbol) => NAMES[symbol] ?? symbol;
const cap = (text: string) => text[0]!.toUpperCase() + text.slice(1);
const list = (items: string[]) =>
  items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
const ordinal = (n: number) => `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`;

/**
 * A program step at its turn in a Succession: when it begins, the scene's state becomes
 * the model's answer for that point, so the syncs after it show that state. Draws nothing.
 */
class Apply extends Animation {
  readonly host: Scene;
  readonly next: SceneState;
  constructor(host: Scene, next: SceneState) {
    super(new Group(), { runTime: 0, remover: true });
    this.host = host;
    this.next = next;
  }
  override begin(): void {
    this.host.state = JSON.parse(JSON.stringify(this.next)) as SceneState;
    super.begin();
  }
}

/**
 * Parts pair across a redraw when they are the same element's cell or symbol, wherever it
 * goes, so the runs slide from their rows into the table. Anything else pairs only when it
 * is the same thing in the same place: the same words, or a shape of the same size; a badge,
 * a note or a block label that is new or gone fades, and no letter travels between labels.
 */
const samePlace: MatchKey = (part: Mobject) => {
  if (part.key?.startsWith('periodic-cell:')) return part.key;
  if (part.parent instanceof Text && part.parent.key?.startsWith('periodic-symbol:'))
    return `${part.parent.key}#${(part as { cluster?: number }).cluster ?? ''}`;
  const owner = part.parent instanceof Text ? part.parent : part;
  const b = owner.box();
  if (!b) return undefined;
  const at = `${((b[0] + b[2]) / 2).toFixed(2)},${((b[1] + b[3]) / 2).toFixed(2)}`;
  return part.parent instanceof Text
    ? `${part.parent.text}@${at}#${(part as { cluster?: number }).cluster ?? ''}`
    : `${(b[2] - b[0]).toFixed(2)}x${(b[3] - b[1]).toFixed(2)}@${at}`;
};

/** The script's one-sentence answer (meta.answer), which the stack step states. */
const ANSWER = 'Apart from helium and the f block, an element’s group is the column where its last electron lands, in rows of 2, 10 and 6 columns';

/** Of the 108 elements in the NIST reference, how many it lists as the filling rule predicts. */
const RULE_MATCHES = NIST_UP_TO - Object.keys(NIST_EXCEPTIONS).length;

/** A jump down a column as the row it adds: 8 = 2 + 6, from the subshell capacities. */
function rowSum(jump: number): string {
  const rows: Block[][] = [['s'], ['s', 'p'], ['s', 'd', 'p'], ['s', 'f', 'd', 'p']];
  const row = rows.find((r) => r.reduce((sum, b) => sum + CAPACITY[b], 0) === jump);
  if (!row) throw new Error(`A jump of ${jump} is not one row`);
  return `${jump} = ${row.map((b) => CAPACITY[b]).join(' + ')}`;
}

/** One family member, as the family step writes it. */
interface Member {
  symbol: Symbol;
  z: number;
  config: string | null;
  core: string | null;
  counted: string;
  uncounted: string;
  count: number | null;
}

export default class PeriodicGroupsExplainer extends Scene {
  static meta = {
    id: 'periodic-groups',
    title: 'What puts an element in its group?',
    player: { minStageWidth: 880 },
    sources: [
      'https://en.wikipedia.org/w/index.php?title=Group_(periodic_table)&oldid=1381612279',
      'https://en.wikipedia.org/w/index.php?title=Aufbau_principle&oldid=1360487775',
      'https://physics.nist.gov/PhysRefData/ASD/ionEnergy.html',
      'https://github.com/adewale/rayner/blob/main/scenes/explainers/lib/periodic-groups.ts',
    ],
    // The script's answer and check questions (script.md); the stack step states the answer.
    answer: ANSWER,
    checks: [
      {
        question:
          'Suppose each shell filled completely before the next began, so a run of 10 came straight after a row’s run of 6. Laying the runs out and stacking them as this explainer does, which column would potassium, element 19, land in, and would it still sit under sodium?',
        answer:
          'Column 3. Row 3 would run 2, 6, then 10, and potassium’s electron would be the first of that run of 10, which stacks just after the 2 left-hand columns: 2 + 1 = 3. It would leave sodium’s column, and group 1 would lose it.',
      },
      {
        question:
          'Some tables keep the runs of 14 in the body, between the runs of 2 and the runs of 10, so the table is 2 + 14 + 10 + 6 columns wide. In that table, which column would chlorine sit in, and how far would row 3’s run of 6 slide from where the fill step lays it?',
        answer:
          'Column 2 + 14 + 10 + 5 = 31. Row 3’s run of 6 would slide 14 + 10 = 24 columns to sit over the runs of 6 below.',
      },
      {
        question:
          'If element 119 opened an eighth row and the filling rule held, that row would bring a new kind of run, 18 long, between its run of 2 and its run of 14. How many cells would row 8 hold, and which element would sit below element 119 in group 1?',
        answer:
          'Row 8 would hold 2 + 18 + 14 + 10 + 6 = 50. Element 119 starts that row, so the next member of group 1 is a whole row further on: element 169.',
      },
    ],
  };
  static settings = [
    {
      id: 'element',
      label: 'Follow an element',
      default: 'na',
      options: [
        { value: 'na', label: 'Sodium' },
        { value: 'cl', label: 'Chlorine' },
        { value: 'fe', label: 'Iron' },
        { value: 'cu', label: 'Copper' },
        { value: 'he', label: 'Helium' },
      ],
    },
  ];
  table: View | null = null;
  notes: View | null = null;

  override async construct() {
    const choice = settingsOf(this).element as Choice;
    const symbol = ELEMENTS[choice],
      z = atomicNumber(symbol),
      name = nameOf(symbol),
      Name = cap(name);
    const here = POSITIONS[z - 1]!,
      group = here.group!;
    const core = coreOf(z),
      coreSymbol = core ? symbolOf(core) : null;
    const members = membersOf(group);
    const jumps = gaps(group);
    const filling = predicted(z);
    const actual = listed(z);
    const family: Member[] = members.map((m) => {
      if (m.z > NIST_UP_TO)
        return { symbol: m.symbol, z: m.z, config: null, core: null, counted: '', uncounted: '', count: null };
      const c = listed(m.z),
        past = beyondCore(c, m.z),
        k = coreOf(m.z);
      return {
        symbol: m.symbol,
        z: m.z,
        config: shorthand(c, m.z),
        core: k ? `[${symbolOf(k)}]` : null,
        uncounted: configText(past.filter((s) => s.l === 'f')),
        counted: configText(past.filter((s) => s.l !== 'f')),
        count: counted(c, m.z),
      };
    });

    // Atlas stays inside the picture; the step number uses the shared player's teal.
    const s = stage(this, { palette: { paper: PAPER, ink: INK, accent: '#176166', muted: SOFT }, headingSize: 0.6 });

    // ---- the table, drawn from this.state --------------------------------------
    const drawTable = (state: SceneState) => {
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
          fontSize: packed ? 0.21 : 0.3,
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
        picture.scale(0.3).moveTo([4.1, -2.9]);
      }
      return picture;
    };

    // ---- the words in the empty space above the d block ----------------------------
    const drawNotes = (state: SceneState) => {
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
            new Text(m.symbol, { fontSize: 0.72, color: ink, weight: 'bold' }).moveTo([x, 1.5]),
            new Text(String(m.z), { fontSize: 0.6, font: 'mono', color: hot ? PAPER : BLOCK[m.block] }).moveTo([
              x,
              0.65,
            ]),
          );
          cell.key = `periodic-member:${m.symbol}`;
          cell.children[1]!.key = `${cell.key}:symbol`;
          cell.children[2]!.key = `${cell.key}:atomic-number`;
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
        say(`Group ${group}`, [-6.4, -2.45], { size: 0.72, bold: true });
        say(`in the ${POSITIONS.length}-cell table`, [-6.4, -3.3], { size: 0.68 });
      }
      if (note === 'fill') {
        // The element's own runs, by length, in the space right of the short rows; the names
        // s, p, d and f come two steps later.
        const lengths = (state.runs ?? []) as number[];
        const left = ROW_END[3]! + 1.3;
        say(`${Name}: ${z} electron${z > 1 ? 's' : ''}, one per cell`, [left, pkRowY(1)], { size: 0.24, color: SOFT });
        say(lengths.length > 1 ? `${lengths.join(' + ')} = ${lengths.reduce((a, b) => a + b, 0)}` : String(lengths[0] ?? ''), [
          left,
          pkRowY(2) + 0.08,
        ], { size: 0.4 });
        const rows = (state.rows ?? null) as number[] | null;
        if (rows) {
          say('Every full run is 2, 6, 10 or 14 cells', [left, pkRowY(3) + 0.1], { size: 0.27 });
          // Each row's length, at its right end.
          rows.forEach((n, i) => say(`= ${n}`, [ROW_END[i + 1]! + 0.18, pkRowY(i + 1) - 0.03], { size: 0.28, bold: true }));
          // Colour says the run's length; the legend says it in words too.
          const legendY = pkRowY(7) - 0.8;
          (['s', 'p', 'd', 'f'] as Block[]).forEach((b, i) => {
            const x = PK_LEFT + i * 2.6;
            picture.add(new Line([x, legendY], [x + 0.5, legendY], { stroke: BLOCK[b], strokeWidth: 0.3 }));
            say(`run of ${CAPACITY[b]}`, [x + 0.85, legendY - 0.02], { size: 0.26 });
          });
        }
      }
      if (note === 'stack') {
        // Where the case's last electron lands, in the empty first row.
        say(String(state.landingRun ?? ''), [NOTE_X, rowY(1) - 0.04], { size: 0.28 });
      }
      if (note === 'blocks') {
        // The case's configuration and where its last electron lands, in the empty space above the d block.
        say('2 + 10 + 6 = 18 numbered columns', [NOTE_X, rowY(1)], { size: 0.3, bold: true });
        ((state.landing ?? []) as string[]).forEach((line, i) => say(line, [NOTE_X, rowY(1) - 0.5 - i * 0.38], { size: 0.27 }));
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
    };

    /** The resting picture in words, from the same state and data the two views draw. */
    const describe = (st: SceneState) => {
      const note = String(st.note ?? ''),
        said: string[] = [];
      said.push(
        note === 'family'
          ? `Only group ${group} remains, ${name} outlined.`
          : note === 'column'
            ? `A readable comparison above a small, unlabelled ${POSITIONS.length}-cell periodic table with group ${group} outlined.`
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
      if (note === 'stack' || note === 'blocks') {
        if (st.blocks) said.push('All 118 element cells are filled in by block colour.');
        if (st.trail != null)
          said.push(`${Name}’s ${st.trail} cell${Number(st.trail) > 1 ? 's are' : ' is'} solid in block colour; the other ${POSITIONS.length - Number(st.trail)} are pale.`);
      }
      if (note === 'fill') {
        said.push(`Cells 1 to ${st.lit} are filled in order, coloured by the run each one’s electron enters.`);
        const rows = (st.rows ?? null) as number[] | null;
        if (rows)
          said.push(
            `Each row starts with a run of 2 and lays its runs side by side: rows of ${list(rows.map(String))} cells. A legend reads blue as a run of 2, gold 6, red 10 and black 14.`,
          );
        const lengths = (st.runs ?? []) as number[];
        said.push(`Note: ${name}’s ${z} electrons are runs of ${lengths.join(', ')}.`);
      }
      if (note === 'stack') said.push(`Note: ${String(st.landingRun ?? '')}.`);
      if (note === 'blocks') said.push(`Note: ${((st.landing ?? []) as string[]).join(' ')}`);
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
    };
    const base = { element: symbol, z, group };
    const apply = (next: SceneState) => new Apply(this, next);

    // ---- 1. the column: a puzzle to predict ------------------------------------------
    const others = members.filter((m) => m.z !== z);
    const distinct = [...new Set(jumps)].sort((a, b) => a - b);
    await this.step('column', {
      title: `What puts ${name} in group ${group}?`,
      line: `Predict: what makes the jumps down the column ${list(distinct.map(String))}?`,
      caption: (
        {
          na: `Sodium reacts with water much as lithium and potassium do, and chemists put such look-alikes in one column. Sodium is element 11, in the column that runs from hydrogen (1) to francium (87). The jumps between neighbours are ${list(jumps.map(String))}: no fixed step, so something other than the atomic number puts them together.`,
          cl: `Chlorine, fluorine and bromine each join with sodium to make a salt (table salt is sodium chloride), and chemists put them in one column with ${list(others.filter((m) => m.symbol !== 'F' && m.symbol !== 'Br').map((m) => nameOf(m.symbol)))}. Chlorine is element 17 and bromine 35, both in group 17, and the jumps down the column are ${list(jumps.map(String))}.`,
          fe: `Iron, element 26, shares group 8 with ${list(others.map((m) => nameOf(m.symbol)))}, elements ${list(others.map((m) => String(m.z)))}, metals that chemists group because their compounds are alike. Nothing in those numbers says 8, and the jumps between them, ${list(jumps.map(String))}, are not a fixed step.`,
          cu: `Copper, silver and gold, the coinage metals, are soft, bright and conduct electricity well, and they share group 11 with roentgenium. Their atomic numbers, ${list(members.map((m) => String(m.z)))}, say nothing of 11, and the jumps between them, ${list(jumps.map(String))}, are not a fixed step.`,
          he: `Helium, like neon and argon, hardly reacts with anything, and it heads their column, above ${list(others.filter((m) => m.symbol !== 'Ne' && m.symbol !== 'Ar').map((m) => nameOf(m.symbol)))} too; the jumps are ${list(jumps.map(String))}. Helium has two electrons, yet it is not in group 2.`,
        } satisfies Record<Choice, string>
      )[choice],
    });
    await s.clear();
    this.state = { ...base, note: 'column', band: true, members: members.map((m) => m.z), gaps: jumps };
    // Both pictures are drawn from this.state, so every resting picture is the state it shows.
    const table = view(this, drawTable, { place: false });
    const notes = view(this, drawNotes, { place: false });
    this.table = table;
    this.notes = notes;
    s.keep(table, notes, { describe: () => describe(this.state) });
    const redraw = (runTime: number) => table.sync({ runTime, match: samePlace });
    const both = (runTime: number) =>
      new AnimationGroup([redraw(runTime), notes.sync({ runTime, match: samePlace })], { rateFunc: linear });
    await this.play(new FadeIn(table), new FadeIn(notes), { runTime: 0.8 });

    // ---- 2. fill: every electron in order, the runs laid side by side in rows -------------
    const own = filling.map((sub) => sub.electrons);
    const last = filling.at(-1)!,
      partial = last.electrons < CAPACITY[last.l];
    const full = partial ? own.slice(0, -1) : own;
    const ownRuns = partial
      ? `${Name}’s ${z} are runs of ${list(full.map(String))}, then ${last.electrons} into a run of ${CAPACITY[last.l]}.`
      : `${Name}’s ${z} fill ${full.length === 1 ? `one run of ${full[0]}` : `runs of ${list(full.map(String))}`}.`;
    await this.step('fill', {
      title: 'One electron per cell, in runs laid side by side',
      line: 'Predict: slide the runs so that runs of one length share columns. What shape do you get?',
      caption: `Give each element a cell and add electrons one at a time, in order of atomic number. By the filling rule, which step 4 explains, they fill runs, and every full run is 2, 6, 10 or 14 long. ${ownRuns} Lay each run beside the last and start a new row at each run of 2, as the table starts a row after each noble gas. The rows hold ${list(ROW_CELLS.map(String))} cells, and every jump down step 1’s column is one of those row lengths.`,
    });
    {
      const fillState = (lit: number, runs: number, done: boolean): SceneState => ({
        ...base,
        note: 'fill',
        layout: 'rows',
        lit,
        filling: configText(filling),
        runs: own.slice(0, runs),
        ...(done ? { rows: ROW_CELLS } : {}),
      });
      const seq: Animation[] = [];
      RUNS.forEach((run, i) => {
        // The case's last run stops at its own electron first.
        if (run.from <= z && z < run.to) seq.push(apply(fillState(z, own.length, false)), both(0.6));
        seq.push(
          apply(fillState(run.to, Math.min(own.length, i + 1), false)),
          both(run.to <= z ? Math.min(0.75, 0.25 + run.sub.electrons * 0.05) : 0.2),
        );
      });
      seq.push(apply(fillState(POSITIONS.length, own.length, true)), both(0.6));
      await this.play(new Succession(seq));
      this.state = fillState(POSITIONS.length, own.length, true);
    }

    // ---- 3. stack: runs of one length share columns, and the table appears --------------
    // The landing column, from the run widths: 2 columns first, then 10, then 6.
    const landed =
      last.l === 's'
        ? last.electrons
        : last.l === 'd'
          ? CAPACITY.s + last.electrons
          : CAPACITY.s + CAPACITY.d + last.electrons;
    const sum =
      last.l === 's'
        ? `${landed}`
        : last.l === 'd'
          ? `${CAPACITY.s} + ${last.electrons} = ${landed}`
          : `${CAPACITY.s} + ${CAPACITY.d} + ${last.electrons} = ${landed}`;
    const landingRun = `${Name}’s last electron: ${ordinal(last.electrons)} of a run of ${CAPACITY[last.l]}, column ${sum}`;
    await this.step('stack', {
      title: 'Stack runs of one length in the same columns',
      line: 'Runs of 2 at the left, 10 in the middle, 6 at the right, 14 in two rows below.',
      caption: `Slide every run of 6 to the right edge and every run of 10 into the middle, and lift the runs of 14 into two rows below so the table stays 18 columns wide. Rows 2 and 3 have no run of 10, so their runs of 6 slide 10 columns and leave a gap. The result is the periodic table with one cell out of place: helium, which the table puts over neon. ${ANSWER}. ${
        (
          {
            na: 'Sodium’s 11th electron starts a run of 2, so it lands in column 1.',
            cl: `Chlorine’s 17th electron is the 5th in a run of 6, which starts after 2 + 10 columns: column ${landed}.`,
            fe: `Iron’s 26th electron is the 6th in a run of 10, which starts after 2 columns: column ${landed}.`,
            cu: `Copper’s 29th electron is the 9th in a run of 10: column 2 + 9 = ${landed}.`,
            he: 'Helium’s 2nd electron ends a run of 2 in column 2, over beryllium, yet helium is in group 18; step 4 says why.',
          } satisfies Record<Choice, string>
        )[choice]
      }`,
    });
    this.state = {
      ...base,
      note: 'stack',
      lit: POSITIONS.length,
      blocks: true,
      helium: 'over-be',
      slid: true,
      strip: 'runs',
      landed,
      landingRun,
    };
    await this.play(both(2.4));

    // ---- 4. blocks: the runs named as subshells, and their order ----------------------------
    const landing: string[] = (
      {
        na: [`${Name}: ${configText(filling)}`, `${subshellText(last)} starts a run of ${CAPACITY.s}: s column ${landed}, group ${group}.`],
        cl: [
          `${Name}: ${configText(filling)}`,
          `${ordinal(last.electrons)} p column, after ${CAPACITY.s} s and ${CAPACITY.d} d: ${sum}.`,
          `Its ${here.count} after neon alone would say ${here.count}: ${group - here.count} short.`,
        ],
        fe: [`${Name}: ${configText(filling)}`, `${ordinal(last.electrons)} d column, after ${CAPACITY.s} s: ${sum}.`],
        cu: [
          `Filling rule: ${shorthand(filling, z)}, so ${sum}.`,
          `NIST lists ${shorthand(actual, z)}: still ${counted(actual, z)} after [${coreSymbol}].`,
        ],
        he: [`${Name}: ${configText(filling)}, column ${landed} by its run (He?),`, 'but 1s² fills shell 1, as 2s² 2p⁶ fills neon’s shell 2.'],
      } satisfies Record<Choice, string[]>
    )[choice];
    await this.step('blocks', {
      title: 'Each run is a subshell: s, p, d or f',
      line: 'A subshell holds at most 2 electrons (s), 6 (p), 10 (d) or 14 (f).',
      caption: `Chemists call each run a subshell, named by its shell n and a letter for its length (s 2, p 6, d 10, f 14): ${name}’s runs read ${configText(filling)}. A subshell holds at most that many electrons. Subshells fill lowest n + l first, with l from 0 for s to 3 for f, and lower n first on a tie: Madelung’s empirical rule, which NIST’s reference configurations follow for ${RULE_MATCHES} of the first ${NIST_UP_TO} elements. ${
        (
          {
            na: 'Sodium’s 11 electrons are the solid cells. Helium moves over neon, since 1s² fills shell 1.',
            cl: 'Chlorine has 7 electrons after neon yet sits in group 17, because rows 2 and 3 have no d run; aluminium counts 3 in group 13. Rows 1 and 2 hold 10 electrons, so from aluminium to argon the atomic number equals the group. Helium moves over neon, since 1s² fills shell 1.',
            fe: 'Iron’s 4s² comes before its 3d⁶ because n + l is 4 for 4s and 5 for 3d. Helium moves over neon, since 1s² fills shell 1.',
            cu: 'Copper is one of the 20 exceptions: the rule gives 4s² 3d⁹ and NIST lists 3d¹⁰ 4s¹. Both put 11 electrons after argon, so the group is 11 either way. Helium moves over neon, since 1s² fills shell 1.',
            he: 'Helium’s run puts it in column 2, the dashed cell, but the table moves it over neon: 1s² completes shell 1, which has no p subshell, as 2s² 2p⁶ completes neon’s shell 2.',
          } satisfies Record<Choice, string>
        )[choice]
      }`,
    });
    this.state = {
      ...base,
      note: 'blocks',
      band: true,
      lit: POSITIONS.length,
      trail: z,
      core,
      coreSymbol,
      strip: 'named',
      capacity: CAPACITY,
      ruleMatches: RULE_MATCHES,
      block: here.block,
      landed,
      landing,
      count: here.count,
      adjustment: here.adjustment,
      listed: shorthand(actual, z),
      listedCount: counted(actual, z),
      ghost: choice === 'he',
    };
    await this.play(both(1.2));

    // ---- 5. the family: the jumps, explained --------------------------------------------
    await this.step('family', {
      title: (
        {
          na: 'Every group 1 element ends in one s electron',
          cl: 'Every halogen ends in two s and five p electrons',
          fe: 'Iron, ruthenium and osmium each end with 8 s and d electrons',
          cu: 'Copper, silver and gold all end in d¹⁰ s¹',
          he: 'Every noble gas ends with its outer shell full',
        } satisfies Record<Choice, string>
      )[choice],
      line: `Each jump is a row: ${distinct.map(rowSum).join(', ')}.`,
      caption: `Each badge counts the electrons after the noble gas that closes the row above (every electron, in row 1), leaving out f electrons. ${
        (
          {
            na: 'Lithium to francium each carry the previous noble gas plus one s electron, and hydrogen’s 1s¹ ends the same way. Each jump is the row the upper member starts: 2 from hydrogen to lithium, 8 from lithium to sodium.',
            cl: 'Each halogen ends in s² p⁵. From bromine down, a full d¹⁰ sits beneath that ending and the count reaches 17; fluorine and chlorine count 7 and take the same column. Tennessine is outside our NIST reference. From chlorine to bromine the jump is row 4’s 18 cells.',
            fe: 'NIST lists ruthenium as 4d⁷ 5s¹ where iron has 3d⁶ 4s², yet 7 + 1 is still 8. Osmium and hassium carry 4f¹⁴ and 5f¹⁴, which the count leaves out. Ruthenium is 18 after iron, the length of row 5, and osmium 32 after ruthenium, the length of row 6.',
            cu: 'NIST lists silver and gold with copper’s d¹⁰ s¹ ending. Gold also carries 4f¹⁴, which the count leaves out because f electrons have their own 14 unnumbered columns. Roentgenium is outside our NIST reference. Silver sits one row of 18 below copper, and gold a row of 32 below silver.',
            he: 'From neon down, each noble gas ends in a full outer s² p⁶; helium’s 1s² is shorter because shell 1 has no p subshell. Neon and argon count 8, ten short of their column, because rows 2 and 3 have no d run; from krypton on the count is 18. Each noble gas closes its row, so each jump is the next row’s length.',
          } satisfies Record<Choice, string>
        )[choice]
      }`,
    });
    this.state = {
      ...base,
      note: 'family',
      band: true,
      lit: z,
      core,
      blocks: true,
      strip: 'named',
      family: family.map((m) => ({ symbol: m.symbol, config: m.config, count: m.count })),
    };
    await this.play(both(1));
  }
}
