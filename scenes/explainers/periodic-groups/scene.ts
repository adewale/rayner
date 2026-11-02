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

/** The script's one-sentence answer (meta.answer), which the blocks step states. */
const ANSWER = 'Except for helium, an element’s group is the column where its last electron lands, in rows of 2 s, 10 d and 6 p columns';

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
      'https://physics.nist.gov/PhysRefData/ASD/ionEnergy.html',
      'https://github.com/adewale/rayner/blob/main/scenes/explainers/lib/periodic-groups.ts',
    ],
    // The script's answer and check questions (script.md); the blocks step states the answer.
    answer: ANSWER,
    checks: [
      {
        question: 'Tin, element 50, ends 5s² 4d¹⁰ 5p². By this explainer’s rule, which column does its last electron land in?',
        answer: 'The second p column. The p block starts after 2 s and 10 d columns, so tin lands in column 2 + 10 + 2 = 14: group 14.',
      },
      {
        question: 'Scandium, element 21, comes straight after calcium. Its last electron is the first in a run of 10. Why is it in group 3 and not group 13?',
        answer: 'Runs of 10 are the d block, which sits between the s and p blocks. Scandium’s electron is the first d, so it lands just after the 2 s columns: 2 + 1 = 3.',
      },
      {
        question: 'Suppose rows 2 and 3 were drawn without the 10 empty columns above the d block. Where would chlorine sit, and would it still be over bromine?',
        answer: 'In column 2 + 5 = 7. Bromine, in row 4, has a run of 10 before its p electrons and stays in column 2 + 10 + 5 = 17, so chlorine would no longer sit over it and the halogens would split across two columns.',
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
      const lit = Number(state.lit ?? 0),
        coreZ = Number(state.core ?? 0);
      const blocks = !!state.blocks,
        band = !!state.band,
        onlyFamily = !!state.family;
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
        // The element's own runs, by length: the names s, p, d and f come in the next step.
        const lengths = (state.runs ?? []) as number[];
        say(`${Name}: ${z} electron${z > 1 ? 's' : ''}, one per cell`, [NOTE_X, rowY(1)], { size: 0.24, color: SOFT });
        say(lengths.length > 1 ? `${lengths.join(' + ')} = ${lengths.reduce((a, b) => a + b, 0)}` : String(lengths[0] ?? ''), [
          NOTE_X,
          rowY(2) + 0.08,
        ], { size: 0.4 });
        if (state.strip) say('Every full run is 2, 6, 10 or 14 cells', [NOTE_X, rowY(3) + 0.12], { size: 0.27 });
      }
      if (note === 'blocks') {
        // The case's configuration and where its last electron lands, in the empty space above the d block.
        say('2 + 10 + 6 = 18 numbered columns', [NOTE_X, rowY(1)], { size: 0.3, bold: true });
        ((state.landing ?? []) as string[]).forEach((line, i) => say(line, [NOTE_X, rowY(1) - 0.5 - i * 0.38], { size: 0.27 }));
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
            : `Periodic table of 118 elements with group ${group} outlined and ${name} (${z}) in bold.`,
      );
      if (note === 'column')
        said.push(
          `Group ${group}, top to bottom: ${members.map((m) => `${nameOf(m.symbol)} (${m.symbol}, ${m.z})`).join(', ')}. Atomic-number gaps: ${jumps.join(', ')}.`,
        );
      if (note !== 'family') {
        if (st.blocks) said.push('All 118 element cells are filled in by block colour.');
        else if (st.lit) said.push(`Cells 1 to ${st.lit} are filled in order, coloured by the run each one’s electron enters.`);
      }
      if (note === 'fill') {
        const lengths = (st.runs ?? []) as number[];
        said.push(`Note: ${name}’s ${z} electrons are runs of ${lengths.join(', ')}.`);
      }
      if (note === 'blocks') said.push(`Note: ${((st.landing ?? []) as string[]).join(' ')}`);
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
          na: `Sodium is element 11, in the column that runs from hydrogen (1) to francium (87). The jumps between neighbours are ${list(jumps.map(String))}: no fixed step, yet every member sits in group 1. Something other than the atomic number puts them there.`,
          cl: `Chlorine, element 17, shares group 17 with ${list(others.map((m) => nameOf(m.symbol)))}. That its atomic number equals its group number is a coincidence: bromine, 35, is in group 17 too, and the jumps down the column are ${list(jumps.map(String))}.`,
          fe: `Iron, element 26, shares group 8 with ${list(others.map((m) => nameOf(m.symbol)))}, elements ${list(others.map((m) => String(m.z)))}. Nothing in those numbers says 8, and the jumps between them, ${list(jumps.map(String))}, are not a fixed step.`,
          cu: `Copper, element 29, shares group 11 with ${list(others.map((m) => nameOf(m.symbol)))}, elements ${list(others.map((m) => String(m.z)))}. Nothing in those numbers says 11, and the jumps between them, ${list(jumps.map(String))}, are not a fixed step.`,
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

    // ---- 2. fill the whole table in order: the runs ------------------------------------
    // Every electron of all 118 elements by the filling rule: the case's own first, then the rest.
    const allRuns: { sub: Subshell; from: number; to: number }[] = [];
    predicted(POSITIONS.length).reduce(
      (from, sub) => (allRuns.push({ sub, from, to: from + sub.electrons - 1 }), from + sub.electrons),
      1,
    );
    const own = filling.map((sub) => sub.electrons);
    const last = filling.at(-1)!,
      partial = last.electrons < CAPACITY[last.l];
    const full = partial ? own.slice(0, -1) : own;
    const ownRuns = partial
      ? `${Name}’s ${z} are runs of ${list(full.map(String))}, then ${last.electrons} into a run of ${CAPACITY[last.l]}.`
      : `${Name}’s ${z} fill ${full.length === 1 ? `one run of ${full[0]}` : `runs of ${list(full.map(String))}`}.`;
    await this.step('fill', {
      title: 'One electron per cell: they fill runs of 2, 6, 10 and 14',
      line: `${Name}’s ${z} electron${z > 1 ? 's' : ''}: ${own.length === 1 ? 'one run' : 'runs'} of ${list(own.map(String))}.`,
      caption: `Read the cells in order of atomic number. By the filling rule chemists use to predict where electrons go, each cell adds one electron, and the electrons fill runs, one colour for each run length. Every full run is 2, 6, 10 or 14 cells long. ${ownRuns} ${
        (
          {
            na: '',
            cl: 'Rows 2 and 3 have no run of 10, so their runs of 6 sit at the right, over the runs of 6 below. ',
            fe: 'The first run of 10 opens in row 4, after potassium and calcium. ',
            cu: 'The first run of 10 opens in row 4, after potassium and calcium. ',
            he: '',
          } satisfies Record<Choice, string>
        )[choice]
      }Runs of one length stack into the same columns: runs of 2 at the left (helium apart, which the table moves to the right), runs of 10 in the middle, runs of 6 at the right, and runs of 14 in the two rows set below. This table puts lutetium and lawrencium in group 3; many textbooks put lanthanum and actinium there.`,
    });
    {
      const fillState = (lit: number, runs: number, strip: boolean): SceneState => ({
        ...base,
        note: 'fill',
        band: true,
        lit,
        filling: configText(filling),
        runs: own.slice(0, runs),
        ...(strip ? { strip: 'runs' } : {}),
      });
      const seq: Animation[] = [];
      allRuns.forEach((run, i) => {
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

    // ---- 3. the blocks: the runs named, and the answer -------------------------------------
    const ordinal = (n: number) => `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`;
    // The landing column, from the run widths: s columns first, then d, then p.
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
      title: 'Answer: the column where its last electron lands, helium apart',
      line: 'Each run is a subshell: s holds 2, p 6, d 10 and f 14.',
      caption: `Chemists call each run a subshell and name it by its shell and its length, s for 2, p for 6, d for 10 and f for 14, so ${name}’s runs read ${configText(filling)}. A subshell holds exactly that many electrons, so each block is as wide as its subshell holds. ${ANSWER}. ${
        (
          {
            na: `Sodium’s last electron starts the run of 2 in row 3, 3s, so it lands in the first s column: group 1.`,
            cl: `Chlorine’s last electron is the fifth in 3p. Rows 2 and 3 have no d run, but the p block still starts after the 10 d columns that open in row 4, so the fifth p column is ${sum}. Counting only its ${here.count} electrons after neon’s 10 would give ${here.count}, ten short.`,
            fe: `Iron’s last electron is the sixth in 3d, after 4s²: past the 2 s columns, the sixth d column is ${sum}.`,
            cu: `By the filling rule copper’s last electron is the ninth in 3d, after 4s²: ${sum}. NIST’s reference lists 3d¹⁰ 4s¹ instead, one electron moved from 4s to 3d. That is still 11 electrons after argon’s 18, the [Ar] in the note, and all in the s and d columns, so copper stays in group 11.`,
            he: `Helium’s last electron is the second in 1s, which by that rule would put it in column 2, the dashed cell over beryllium. But 1s² completes the first shell, which has no p subshell, as 2s² 2p⁶ completes neon’s second, and the table puts helium with the full shells in group 18.`,
          } satisfies Record<Choice, string>
        )[choice]
      }`,
    });
    this.state = {
      ...base,
      note: 'blocks',
      band: true,
      lit: POSITIONS.length,
      core,
      coreSymbol,
      blocks: true,
      strip: 'named',
      capacity: CAPACITY,
      block: here.block,
      landed,
      landing,
      count: here.count,
      adjustment: here.adjustment,
      listed: shorthand(actual, z),
      listedCount: counted(actual, z),
      ghost: choice === 'he',
    };
    await this.play(both(0.9));

    // ---- 4. the family: the jumps, explained --------------------------------------------
    await this.step('family', {
      title: (
        {
          na: 'Every group 1 element ends in one s electron',
          cl: 'Every halogen ends in two s and five p electrons',
          fe: 'Group 8 counts 8, even where the ending changes',
          cu: 'Copper, silver and gold all end in d¹⁰ s¹',
          he: 'Every noble gas ends with its outer shell full',
        } satisfies Record<Choice, string>
      )[choice],
      line: `Each jump is a row: ${distinct.map(rowSum).join(', ')}.`,
      caption: `Each badge counts the electrons after the noble gas that closes the row above (every electron, in row 1), leaving out f electrons. ${
        (
          {
            na: 'Lithium to francium each carry the previous noble gas as a core plus one s electron. Hydrogen’s 1s¹ ends the same way.',
            cl: 'Each halogen ends in s² p⁵. From bromine down, a full d¹⁰ sits beneath that ending and the count reaches 17; fluorine and chlorine count 7 and take the same column. Tennessine is outside our NIST reference.',
            fe: 'NIST lists ruthenium as 4d⁷ 5s¹ rather than iron’s d⁶ s² pattern, yet 7 + 1 is still 8. Osmium and hassium carry 4f¹⁴ and 5f¹⁴, which the count leaves out.',
            cu: 'NIST lists silver and gold with the same d¹⁰ s¹ ending as copper. Gold also carries 4f¹⁴, which the count leaves out because f electrons have their own 14 unnumbered columns. Roentgenium is outside our NIST reference.',
            he: 'From neon down, each noble gas ends in s² p⁶, a full outer s and p. Helium’s 1s² is shorter because the first shell has no p subshell, and it is still full. Neon and argon count 8 and shift 10 columns; krypton onward counts 18.',
          } satisfies Record<Choice, string>
        )[choice]
      } The opening’s jumps are whole rows: one place down a column is one full row further on, and a row holds as many elements as its blocks are wide.`,
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
