import { readerFirst } from '../lib/reader-drawing.ts';
import { frames as readerFrames } from '../lib/readers/periodic-groups.ts';
import {
  Scene,
  Group,
  Text,
  Rectangle,
  Line,
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
  GROUP_NAMES,
  NAMES,
  CAPACITY,
  NIST_UP_TO,
  predicted,
  listed,
  coreOf,
  counted,
  membersOf,
  gaps,
  symbolOf,
  atomicNumber,
  configText,
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

const cellAt = (z: number): Vec => {
  const p = POSITIONS[z - 1]!;
  return p.group != null ? [colX(p.group), rowY(p.period)] : [colX(p.fColumn! + 2), fRowY(p.period - 5)];
};
const nameOf = (symbol: Symbol) => NAMES[symbol] ?? symbol;
const cap = (text: string) => text[0]!.toUpperCase() + text.slice(1);
const list = (items: string[]) =>
  items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;

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
 * Parts pair across a redraw only when they are the same thing in the same place: the
 * same words, or a shape of the same size. A cell keeps its place and changes colour;
 * a badge, a note or a block label that is new or gone fades, and no letter travels
 * from one label into another.
 */
const samePlace: MatchKey = (part: Mobject) => {
  const owner = part.parent instanceof Text ? part.parent : part;
  const b = owner.box();
  if (!b) return undefined;
  const at = `${((b[0] + b[2]) / 2).toFixed(2)},${((b[1] + b[3]) / 2).toFixed(2)}`;
  return part.parent instanceof Text
    ? `${part.parent.text}@${at}#${(part as { cluster?: number }).cluster ?? ''}`
    : `${(b[2] - b[0]).toFixed(2)}x${(b[3] - b[1]).toFixed(2)}@${at}`;
};

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
      'https://physics.nist.gov/PhysRefData/ASD/ionEnergy.html',
      'https://github.com/adewale/rayner/blob/main/scenes/explainers/lib/periodic-groups.ts',
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
    const named = GROUP_NAMES[group - 1]!;
    // Each electron is one cell: the subshell that cell's electron enters, by the filling rule.
    const runs: { sub: Subshell; from: number; to: number }[] = [];
    filling.reduce((from, sub) => (runs.push({ sub, from, to: from + sub.electrons - 1 }), from + sub.electrons), 1);
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
      // These steps compare a family or a few counts. The complete table is
      // context; give the actual comparison its own readable native drawing.
      const compact = state.note === 'column' || state.note === 'count';
      const lit = Number(state.lit ?? 0),
        coreZ = Number(state.core ?? 0);
      const blocks = !!state.blocks,
        band = !!state.band,
        onlyFamily = !!state.family;
      const spotlight = new Set(((state.limit ?? []) as Symbol[]).map(atomicNumber));
      const memberZ = new Set(members.map((m) => m.z));
      const picture = new Group();
      for (let col = 1; !compact && col <= 18; col++) {
        const hot = band && col === group;
        picture.add(
          new Text(String(col), { fontSize: 0.24, color: hot ? INK : SOFT, weight: hot ? 'bold' : 'normal' }).moveTo([
            colX(col),
            HEADER_Y,
          ]),
        );
      }
      for (const p of POSITIONS) {
        // In the family step, only the column stays.
        if (onlyFamily && !memberZ.has(p.z)) continue;
        const [x, y] = cellAt(p.z);
        const filled = p.z <= lit,
          inCore = filled && p.z <= coreZ,
          chosen = p.z === z,
          lead = filled && !inCore;
        const solid = lead || blocks;
        const fill = solid ? BLOCK[p.block] : filled ? tint(p.block, 0.22) : PAPER;
        const stroke = chosen ? INK : solid ? BLOCK[p.block] : RULE;
        const letter = solid ? PAPER : INK,
          number = solid ? PAPER : SOFT;
        picture.add(
          new Rectangle({
            width: CELL_W,
            height: CELL_H,
            cornerRadius: 0,
            fill,
            fillOpacity: 1,
            stroke: compact && !chosen ? SOFT : stroke,
            strokeWidth: compact ? (chosen ? 0.12 : 0.045) : chosen ? 0.05 : lead ? 0.03 : 0.015,
          }).moveTo([x, y]),
        );
        if (!compact)
          picture.add(
            new Text(p.symbol, { fontSize: 0.3, color: letter, weight: chosen ? 'bold' : 'normal' }).moveTo([
              x,
              y - 0.11,
            ]),
            new Text(String(p.z), { fontSize: 0.22, font: 'mono', color: number }).moveTo(
              [x - CELL_W / 2 + 0.05, y + 0.175],
              [-1, 0],
            ),
          );
        // What the ending's caveat points at.
        if (spotlight.has(p.z)) {
          const outline = new Rectangle({
            width: CELL_W + 0.1,
            height: CELL_H + 0.1,
            cornerRadius: 0,
            fill: 'none',
            stroke: INK,
            strokeWidth: 0.06,
            dashArray: '0.12 0.08',
          }).moveTo([x, y]);
          outline.key = `periodic-limit:${p.symbol}`;
          picture.add(outline);
        }
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
      // Where helium's count alone would put it: over beryllium.
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
      // The blocks, measured under the columns: 2 + 10 + 6, and the f block's 14.
      if (blocks) {
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
        span(1, 2, 's', 's: 2 columns');
        span(3, 12, 'd', 'd: 10 columns');
        span(13, 18, 'p', 'p: 6 columns');
        if (!onlyFamily)
          ['f: 14 columns,', 'no group', 'number'].forEach((line, i) =>
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
        say(`${Name}: ${z} electron${z > 1 ? 's' : ''}, in filling order`, [NOTE_X, rowY(1)], {
          size: 0.24,
          color: SOFT,
        });
        say(String(state.filling ?? ''), [NOTE_X, rowY(2) + 0.08], { size: 0.4 });
      }
      if (note === 'count') {
        picture.key = 'periodic-count-comparison';
        const past = here.count,
          verdict = `${past} counted ${past === group ? '=' : '≠'} group ${group}`;
        say(choice === 'cu' ? `${past} counted either way = group ${group}` : verdict, [0, 2.65], {
          size: 0.68,
          bold: true,
          edge: [0, 0],
        });
        if (choice === 'cu') {
          say('Filling rule:', [-6.4, 1.15], { size: 0.68 });
          say(shorthand(filling, z), [-2.2, 1.15], { size: 0.68 });
          say('NIST lists:', [-6.4, -0.15], { size: 0.68 });
          say(shorthand(actual, z), [-2.2, -0.15], { size: 0.68 });
        } else if (choice === 'he') {
          for (const [x, upper, lower, column] of [
            [-3.5, 'He?', 'Be', here.count],
            [3.5, 'He', 'Ne', group],
          ] as const) {
            const pair = new Group(
              new Rectangle({
                width: 2.2,
                height: 1.0,
                fill: PAPER,
                stroke: INK,
                strokeWidth: 0.04,
                ...(upper === 'He?' ? { dashArray: '0.12 0.08' } : {}),
              }).moveTo([x, 1.35]),
              new Text(upper, { fontSize: 0.72, color: INK }).moveTo([x, 1.35]),
              new Rectangle({ width: 2.2, height: 1.0, fill: PAPER, stroke: INK, strokeWidth: 0.04 }).moveTo([x, 0.1]),
              new Text(lower, { fontSize: 0.72, color: INK }).moveTo([x, 0.1]),
              new Text(`Group ${column}`, { fontSize: 0.68, color: INK }).moveTo([x, -1.0]),
            );
            pair.key = `periodic-helium:${column}`;
            pair.children[0]!.key = `${pair.key}:outline`;
            pair.children[1]!.key = `${pair.key}:upper`;
            pair.children[3]!.key = `${pair.key}:lower`;
            pair.children[4]!.key = `${pair.key}:group`;
            picture.add(pair);
          }
        } else {
          say(shorthand(filling, z), [-3.4, 1.7], { size: 0.68, edge: [0, 0] });
          const equation = new Text(`${z} - ${core} = ${here.count}`, {
            fontSize: 0.6,
            font: 'mono',
            color: INK,
          }).moveTo([4, 1.7]);
          equation.key = 'periodic-core-equation';
          picture.add(equation);
          const cells = POSITIONS.filter((p) => p.z > core && p.z <= z);
          for (const [row, title] of ['Element', 'Count', 'Group'].entries())
            say(title, [-6.85, 0.6 - row * 0.92], { size: 0.68 });
          cells.forEach((p, i) => {
            const x = cells.length === 1 ? 1 : -3.8 + i * 1.35;
            const cell = new Group(
              new Text(p.symbol, { fontSize: 0.68, color: INK, weight: p.z === z ? 'bold' : 'normal' }).moveTo([
                x,
                0.6,
              ]),
              new Text(Number(state.badges) > i ? String(i + 1) : '–', {
                fontSize: 0.62,
                font: 'mono',
                color: BLOCK[p.block],
              }).moveTo([x, -0.32]),
              new Text(String(p.group), { fontSize: 0.62, font: 'mono', color: INK, weight: 'bold' }).moveTo([
                x,
                -1.24,
              ]),
            );
            cell.key = `periodic-count:${p.symbol}`;
            cell.children[0]!.key = `${cell.key}:symbol`;
            cell.children[1]!.key = `${cell.key}:count`;
            cell.children[2]!.key = `${cell.key}:group`;
            picture.add(cell);
          });
        }
        say(`Group ${group}`, [-6.4, -2.45], { size: 0.72, bold: true });
        say(`in the ${POSITIONS.length}-cell table`, [-6.4, -3.3], { size: 0.68 });
      }
      if (note === 'blocks') {
        const why: Record<Choice, string[]> = {
          na: ['3s¹ lands in the s block:', 'its first column.'],
          cl: ['3s² 3p⁵ counts 7, then the', '10 d columns: 7 + 10 = 17.'],
          fe: ['4s² 3d⁶: 2 s columns', 'then the 6th d column: 8.'],
          cu: ['4s² 3d⁹: 2 s columns', 'then the 9th d column: 11.'],
          he: ['1s holds only 2: helium is', 'full, as neon is at 2s² 2p⁶.'],
        };
        say('2 + 10 + 6 = 18 numbered columns', [NOTE_X, rowY(1)], { size: 0.3, bold: true });
        why[choice].forEach((line, i) => say(line, [NOTE_X, rowY(2) + 0.08 - i * 0.38], { size: 0.27 }));
      }
      if (note === 'family') {
        // Beside each member, NIST's configuration with the endings lined up: the core
        // and any f electrons in the soft colour, since the count leaves them out. Then the
        // count, in the same dark badge the count step used.
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
      if (note === 'names') {
        const rows = GROUP_NAMES.filter((g) => g.trivial || g.group === group).map((g) => ({
          label: `${g.group}  ${g.trivial ?? g.byElement}`,
          hot: g.group === group,
          at: g.group,
        }));
        rows.push({ label: '3–10  named after their top element', hot: false, at: 3.5 });
        rows.sort((a, b) => a.at - b.at);
        const half = Math.ceil(rows.length / 2);
        rows.forEach((r, i) => {
          const x = NOTE_X + (i < half ? 0 : 4.2),
            y = rowY(1) + 0.16 - (i % half) * 0.31;
          say(r.label, [x, y], { size: 0.24, color: r.hot ? INK : SOFT, bold: r.hot });
        });
      }
      if (note === 'limit') {
        const lines: Record<Choice, string[]> = {
          na: ['Hydrogen: 1s¹, the same ending,', 'but not a metal, so not an alkali metal.'],
          cl: ['Tennessine (117) is beyond this model’s', 'captured NIST reference (1–108).'],
          fe: ['“Iron group” can also mean', 'iron, cobalt and nickel: a row, not a column.'],
          cu: ['Roentgenium (111) is in group 11;', 'authors differ on calling it a coinage metal.'],
          he: ['By its count of 2, helium would sit', 'over beryllium, in the dashed cell.'],
        };
        lines[choice].forEach((line, i) => say(line, [NOTE_X, rowY(1) - i * 0.38], { size: 0.27 }));
      }
      if (picture.children.length === 0) say('', [NOTE_X, rowY(1)]);
      return picture;
    };

    const coreZ = (st: SceneState) => Number(st.core ?? 0);
    /** The resting picture in words, from the same state and data the two views draw. */
    const describe = (st: SceneState) => {
      const note = String(st.note ?? ''),
        said: string[] = [];
      said.push(
        note === 'family'
          ? `Only group ${group} remains, ${name} outlined.`
          : note === 'column' || note === 'count'
            ? `A readable comparison above a small, unlabelled ${POSITIONS.length}-cell periodic table with group ${group} outlined.`
            : `Periodic table of 118 elements with group ${group} outlined and ${name} (${z}) in bold.`,
      );
      if (note === 'column')
        said.push(
          `Group ${group}, top to bottom: ${members.map((m) => `${nameOf(m.symbol)} (${m.symbol}, ${m.z})`).join(', ')}. Atomic-number gaps: ${jumps.join(', ')}.`,
        );
      if (note !== 'family') {
        if (st.blocks) said.push('All 118 element cells are filled in by block colour.');
        else if (st.lit) said.push(`Cells 1 to ${st.lit} are filled in by subshell colour${coreZ(st) ? `, cells 1 to ${coreZ(st)} paler as the core` : ''}.`);
      }
      if (note === 'fill') said.push(`Note: ${String(st.filling)}.`);
      if (note === 'count') {
        const k = Number(st.badges);
        if (choice !== 'cu' && choice !== 'he')
          said.push(
            `Element, count and group rows: ${POSITIONS.filter((p) => p.z > core && p.z <= z)
              .map((p, i) => `${p.symbol}: ${i < k ? i + 1 : 'not counted yet'}, group ${p.group}`)
              .join('; ')}.`,
          );
        said.push(
          choice === 'cu'
            ? `Note: filling rule ${shorthand(filling, z)}; NIST lists ${shorthand(actual, z)}; ${here.count} counted either way = group ${group}.`
            : choice === 'he'
              ? `Two comparisons: helium's count of 2 over beryllium in group 2, and helium's actual position over neon in group 18.`
              : `Note: ${shorthand(filling, z)}; ${here.count} counted ${here.count === group ? '=' : '≠'} group ${group}.`,
        );
      }
      if (st.ghost) said.push('A dashed cell marked He? sits over beryllium, where a count of 2 would put helium.');
      if (st.blocks && note !== 'family')
        said.push(
          'Under the columns, the s block spans 2, d 10 and p 6; the 14 f columns sit below with no group number.',
        );
      if (note === 'family')
        said.push(
          family
            .map((m) =>
              m.config ? `${m.symbol} ${m.config}, count ${m.count}` : `${m.symbol} outside our NIST reference`,
            )
            .join('; ') + '.',
        );
      if (note === 'names')
        said.push(`A list of group names, with group ${group}, ${named.trivial ?? named.byElement}, in bold.`);
      if (Array.isArray(st.limit)) said.push(`Dashed outlines mark ${(st.limit as string[]).join(', ')}.`);
      return said.join(' ');
    };
    const base = { element: symbol, z, group };
    const apply = (next: SceneState) => new Apply(this, next);

    // ---- 1. the column ------------------------------------------------------------
    const others = members.filter((m) => m.z !== z);
    await readerFirst(this, s, readerFrames(symbol));
    await this.step('column', {
      title: `What puts ${name} in group ${group}?`,
      line: 'The jumps between neighbours in the column are uneven.',
      caption: (
        {
          na: `Sodium is element 11. Its group runs from hydrogen (1) to francium (87), with gaps of ${list(jumps.map(String))}. Those changing gaps rule out a fixed interval between neighbours; electron configurations explain the shared column.`,
          cl: `Chlorine, element 17, shares group 17 with ${list(others.map((m) => nameOf(m.symbol)))}, with jumps of ${list(jumps.map(String))}. That chlorine’s atomic number equals its group number is a coincidence: bromine, 35, is in group 17 too.`,
          fe: `Iron, element 26, shares group 8 with ${list(others.map((m) => nameOf(m.symbol)))}, with jumps of ${list(jumps.map(String))}. Nothing in those numbers says 8; counting iron’s electrons does.`,
          cu: `Copper, element 29, shares group 11 with ${list(others.map((m) => nameOf(m.symbol)))}, with jumps of ${list(jumps.map(String))}. Nothing in those numbers says 11; counting copper’s electrons does.`,
          he: `Helium, element 2, heads the last column, above ${list(others.map((m) => nameOf(m.symbol)))}; the jumps are ${list(jumps.map(String))}. Helium has two electrons, yet it is not in group 2.`,
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

    // ---- 2. fill the cells in order -----------------------------------------------
    await this.step('fill', {
      detail: true,
      title: `Cells 1 to ${z}, read in order, are ${name}’s electrons`,
      line: `${configText(filling)}: one cell per electron.`,
      caption: (
        {
          na: 'Each cell up to sodium adds one electron to a subshell, named by shell number and letter: two in 1s (hydrogen and helium), two in 2s, six in 2p, then one in 3s. A run of same-coloured cells is one subshell.',
          cl: 'Each cell up to chlorine adds one electron to a subshell, named by shell number and letter: 1s², 2s², 2p⁶, 3s², then five of the six places in 3p. The gap in rows 2 and 3 is where the 10 d columns open from row 4.',
          fe: 'Each cell up to iron adds one electron to a subshell, named by shell number and letter. Row 4 opens with 4s in potassium and calcium, then six cells of 3d: by the filling rule, 3d fills after 4s.',
          cu: 'Each cell up to copper adds one electron to a subshell, named by shell number and letter. Row 4 opens with 4s, then nine cells of 3d, so the filling rule predicts 4s² 3d⁹ for copper.',
          he: 'Helium’s two electrons are hydrogen’s cell and its own, both in 1s: shell 1, subshell s. The first row has only two cells because the first shell has one subshell, with room for two.',
        } satisfies Record<Choice, string>
      )[choice],
    });
    {
      const seq: Animation[] = [];
      runs.forEach((run, i) => {
        seq.push(
          apply({ ...base, note: 'fill', band: true, lit: run.to, filling: configText(filling.slice(0, i + 1)) }),
        );
        seq.push(both(Math.min(0.75, 0.25 + run.sub.electrons * 0.05)));
      });
      await this.play(new Succession(seq));
      this.state = { ...base, note: 'fill', band: true, lit: z, filling: configText(filling) };
    }

    // ---- 3. count past the core ------------------------------------------------------
    await this.step('count', {
      title: (
        {
          na: 'Past neon’s core, sodium has 1 electron: group 1',
          cl: 'Past neon, chlorine counts 7 but sits in group 17',
          fe: 'Past argon’s core, iron has 8 electrons: group 8',
          cu: 'Copper counts 11 past argon by either configuration',
          he: 'Helium counts 2, but sits in group 18',
        } satisfies Record<Choice, string>
      )[choice],
      line: core ? `${coreSymbol} closes the row above; count from there.` : 'No noble gas comes before helium.',
      caption: (
        {
          na: 'Neon closes the row above, and its 10 electrons form sodium’s core, leaving one 3s electron. IUPAC’s numbering is based on the s, p and d electrons beyond the preceding noble gas: sodium has 1, and sits in group 1.',
          cl: 'Chlorine carries neon’s core plus seven: 3s² 3p⁵. Counting from sodium gives 1 and 2, then aluminium counts 3 in group 13, and every count after it is 10 short of its column. The count gives chlorine 7, not 17.',
          fe: 'Iron carries argon’s 18-electron core plus 4s² 3d⁶. Two s and six d electrons make 8, and from potassium to iron each count matches its group number.',
          cu: 'The filling rule predicts 4s² 3d⁹, but NIST lists copper’s ground state as 3d¹⁰ 4s¹, one electron moved from 4s to 3d. Both arrangements hold 11 electrons beyond argon’s core, so copper is in group 11 either way.',
          he: 'With no noble gas before it, both of helium’s electrons count. A count of 2 would put helium in group 2, in the dashed cell over beryllium; the table puts it in group 18, over neon.',
        } satisfies Record<Choice, string>
      )[choice],
    });
    {
      // Count the cells past the core one at a time; the last count is the element's.
      const counting = {
        ...base,
        note: 'count',
        band: true,
        lit: z,
        core,
        coreSymbol,
        count: here.count,
        adjustment: here.adjustment,
        listed: shorthand(actual, z),
        listedCount: counted(actual, z),
        ghost: choice === 'he',
      };
      const seq: Animation[] = [apply({ ...counting, badges: 0 }), both(0.6)];
      for (let k = 1; k <= z - core; k++) seq.push(apply({ ...counting, badges: k }), both(0.22));
      await this.play(new Succession(seq));
      this.state = { ...counting, badges: z - core };
    }

    // ---- 4. the blocks --------------------------------------------------------------
    await this.step('blocks', {
      detail: true,
      title: 'The 18 columns are 2 for s, 10 for d, 6 for p',
      line: 'Each block is as wide as its subshell holds.',
      caption: (
        {
          na: 'The blocks are subshells laid side by side: s holds 2 electrons, d holds 10 and p holds 6, so 2 + 10 + 6 = 18 numbered columns. The f block’s 14 columns sit below, unnumbered. Sodium’s last electron is in s, the first column.',
          cl: 'From row 4 down, the 10 d columns fill before p, so bromine counts 2 + 10 + 5 = 17. Chlorine has the same s² p⁵ pattern, but no filled d subshell beneath it, so it sits 10 columns past its count of 7, over bromine.',
          fe: 'The blocks are subshells laid side by side: 2 columns for s, 10 for d and 6 for p. Iron’s 4s² takes the two s columns and its 3d⁶ reaches the sixth d column: 2 + 6 = 8.',
          cu: 'The blocks are subshells laid side by side: 2 columns for s, 10 for d and 6 for p. By the filling rule, copper’s 4s² takes the s columns and 3d⁹ reaches the ninth d column: 2 + 9 = 11, as NIST’s 3d¹⁰ 4s¹ also gives.',
          he: 'Each block is as wide as its subshell holds: 2, 10 and 6 make 18 columns. The first shell has only 1s, so helium’s 1s² completes it, as neon’s 2s² 2p⁶ completes the second shell. The table groups helium with the other full shells.',
        } satisfies Record<Choice, string>
      )[choice],
    });
    this.state = {
      ...base,
      note: 'blocks',
      band: true,
      lit: z,
      core,
      blocks: true,
      capacity: CAPACITY,
      block: here.block,
    };
    await this.play(both(0.9));

    // ---- 5. the family ----------------------------------------------------------------
    await this.step('family', {
      detail: true,
      title: (
        {
          na: 'Every group 1 element ends in one s electron',
          cl: 'Every halogen ends in two s and five p electrons',
          fe: 'Group 8 counts 8, even where the ending changes',
          cu: 'Copper, silver and gold all end in d¹⁰ s¹',
          he: 'Every noble gas ends with its outer shell full',
        } satisfies Record<Choice, string>
      )[choice],
      line: 'Each core is the noble gas one row up.',
      caption: (
        {
          na: 'Lithium to francium each carry the previous noble gas as a core plus one s electron. Each jump in atomic number is the row added to that core: 8 from lithium to sodium, 32 from caesium to francium. Hydrogen’s 1s¹ ends the same way.',
          cl: 'Each halogen ends in s² p⁵. From bromine down, a full d¹⁰ sits beneath that ending and the count reaches 17; fluorine and chlorine count 7 and take the same column. Tennessine is outside our NIST reference.',
          fe: 'NIST lists ruthenium as 4d⁷ 5s¹ rather than iron’s d⁶ s² pattern, yet 7 + 1 is still 8. Osmium and hassium carry 4f¹⁴ and 5f¹⁴, which the count leaves out. The column follows the count of 8 rather than one exact ending.',
          cu: 'NIST lists silver and gold with the same d¹⁰ s¹ ending as copper. Gold also carries 4f¹⁴, which the count leaves out because f electrons have their own 14 unnumbered columns. Roentgenium is outside our NIST reference.',
          he: 'From neon down, each noble gas ends in s² p⁶, a full outer s and p. Helium’s 1s² is shorter because the first shell has no p subshell, and it is still full. Neon and argon count 8 and shift 10 columns; krypton onward counts 18.',
        } satisfies Record<Choice, string>
      )[choice],
    });
    this.state = {
      ...base,
      note: 'family',
      band: true,
      lit: z,
      core,
      blocks: true,
      family: family.map((m) => ({ symbol: m.symbol, config: m.config, count: m.count })),
    };
    await this.play(both(1));

    // ---- 6. the names -----------------------------------------------------------------
    await this.step('names', {
      detail: true,
      title: (
        {
          na: 'Group 1: hydrogen and the alkali metals',
          cl: 'Group 17: the halogens',
          fe: 'Group 8: the iron group',
          cu: 'Group 11: the copper group, or coinage metals',
          he: 'Group 18: the noble gases',
        } satisfies Record<Choice, string>
      )[choice],
      line:
        named.cas === named.oldIupac
          ? `CAS and the old IUPAC system both wrote ${named.cas}.`
          : `CAS wrote ${named.cas}; the old IUPAC system wrote ${named.oldIupac}.`,
      caption: (
        {
          na: 'Since 1988 IUPAC has recommended the numbers 1 to 18. Group 1 is also the lithium group; “hydrogen and alkali metals” keeps hydrogen in. This table puts lutetium in group 3; many textbooks put lanthanum there.',
          cl: 'Since 1988 IUPAC has recommended the numbers 1 to 18. Group 17 is the halogens. CAS wrote VIIA and old IUPAC VIIB: both use VII, chlorine’s count of 7. This table puts lutetium in group 3; many textbooks put lanthanum there.',
          fe: 'Since 1988 IUPAC has recommended the numbers 1 to 18. Groups 3 to 12 are usually named after their top element, so group 8 is the iron group. This table puts lutetium in group 3; many textbooks put lanthanum there.',
          cu: 'Since 1988 IUPAC has recommended the numbers 1 to 18. Group 11 is the copper group; “coinage metals” is a looser name for copper, silver and gold. This table puts lutetium in group 3; many textbooks put lanthanum there.',
          he: 'Since 1988 IUPAC has recommended the numbers 1 to 18. Group 18 is the noble gases, unknown when Mendeleev drew his first table; he later added them as group 0. This table puts lutetium in group 3; many textbooks put lanthanum there.',
        } satisfies Record<Choice, string>
      )[choice],
    });
    this.state = {
      ...base,
      note: 'names',
      band: true,
      lit: z,
      core,
      blocks: true,
      name: named.trivial ?? named.byElement,
      cas: named.cas,
      oldIupac: named.oldIupac,
    };
    await this.play(both(0.9));

    // ---- 7. the limit -----------------------------------------------------------------
    await this.step('limit', {
      detail: true,
      title: (
        {
          na: 'Hydrogen ends in 1s¹ but is not an alkali metal',
          cl: 'Tennessine lies beyond the captured reference',
          fe: '“Iron group” can also name a row',
          cu: 'Roentgenium is in group 11; “coinage metal” is disputed',
          he: 'Helium sits over neon because its shell is full',
        } satisfies Record<Choice, string>
      )[choice],
      line: (
        {
          na: 'Hydrogen is 1s¹ like the rest, but not a metal.',
          cl: 'Our NIST reference covers elements 1 to 108.',
          fe: 'Iron, cobalt and nickel: a row, not a column.',
          cu: 'Element 111 is too short-lived to make coins.',
          he: 'The dashed cell is where the count would put helium.',
        } satisfies Record<Choice, string>
      )[choice],
      caption: (
        {
          na: 'Hydrogen’s 1s¹ ends like every group 1 element, so the count puts it at the top of the column. It is not a metal, so it is not an alkali metal: the count picks a column, and a name needs more.',
          cl: 'The captured NIST reference ends at hassium (108). Beyond it, this scene uses a filling-rule prediction: tennessine (117) has an s² p⁵ ending and sits below astatine. Its configuration is not checked against that reference.',
          fe: '“Iron group” usually means group 8, but in chemistry it can also mean iron, cobalt and nickel, three neighbours in row 4. The electron count fixes the column; which elements a name covers is a convention.',
          cu: 'Roentgenium, 111, is in group 11 by the filling rule’s count; The NIST reference used here ends at 108. It is too radioactive and short-lived to use as coinage, so authors differ on calling it a coinage metal.',
          he: 'Some dissent exists about where elements 1 and 2 belong. Helium’s count of 2 matches beryllium’s 2s², which is why the dashed cell sits over beryllium. Placing helium over neon follows its full shell rather than its count.',
        } satisfies Record<Choice, string>
      )[choice],
    });
    const spotlight: Record<Choice, Symbol[]> = {
      na: ['H'],
      cl: ['Ts'],
      fe: ['Fe', 'Co', 'Ni'],
      cu: ['Rg'],
      he: ['He', 'Be'],
    };
    this.state = {
      ...base,
      note: 'limit',
      band: true,
      lit: z,
      core,
      blocks: true,
      limit: spotlight[choice],
      ghost: choice === 'he',
    };
    await this.play(both(0.9));
  }
}
