import { Scene, AnimationGroup, FadeIn, linear } from '../../../src/index.ts';
import type { View } from '../../../explain/index.ts';
import { stage, settingsOf, answerOf, view } from '../../../explain/index.ts';
import {
  POSITIONS,
  CAPACITY,
  NIST_UP_TO,
  NIST_EXCEPTIONS,
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
} from './model.ts';
import type { Block, Symbol } from './model.ts';
import { listed as list, ordinal, upperFirst } from '../lib/format.ts';
import { PAPER, INK, SOFT, RUNS, ROW_CELLS, samePlace, nameOf, drawTable, drawNotes, sayPeriodic } from './picture.ts';
import type { Followed, Member, PeriodicState } from './picture.ts';

const ELEMENTS = {
  na: 'Na',
  cl: 'Cl',
  fe: 'Fe',
  cu: 'Cu',
  he: 'He',
} as const satisfies Record<string, Symbol>;
type Choice = keyof typeof ELEMENTS;



/** Of the 108 elements in the NIST reference, how many it lists as the filling rule predicts. */
const RULE_MATCHES = NIST_UP_TO - Object.keys(NIST_EXCEPTIONS).length;

/** A jump down a column as the row it adds: 8 = 2 + 6, from the subshell capacities. */
function rowSum(jump: number): string {
  const rows: Block[][] = [['s'], ['s', 'p'], ['s', 'd', 'p'], ['s', 'f', 'd', 'p']];
  const row = rows.find((r) => r.reduce((sum, b) => sum + CAPACITY[b], 0) === jump);
  if (!row) throw new Error(`A jump of ${jump} is not one row`);
  return `${jump} = ${row.map((b) => CAPACITY[b]).join(' + ')}`;
}

export default class PeriodicGroupsExplainer extends Scene<PeriodicState, {}> {
  static meta = {
    player: { minStageWidth: 880 },
    sources: [
      'https://en.wikipedia.org/w/index.php?title=Group_(periodic_table)&oldid=1381612279',
      'https://en.wikipedia.org/w/index.php?title=Aufbau_principle&oldid=1360487775',
      'https://physics.nist.gov/PhysRefData/ASD/ionEnergy.html',
      'https://github.com/adewale/rayner/blob/main/scenes/explainers/periodic-groups/model.ts',
    ],
    // Sentences that speak for all 118 elements, not only the five scenarios, and the test that holds each.
    claims: [
      { says: 'every full run is 2, 6, 10 or 14 long', test: 'model.test.ts: the filling rule fills runs of 2, 6, 10 and 14' },
      { says: 'every jump down step 1’s column is one of those row lengths', test: 'model.test.ts: down a group, each jump in atomic number is one whole period' },
      { says: 'Slide every run of 6 to the right edge and every run of 10 into the middle', test: 'model.test.ts: stack into the s, d, p and f columns, helium apart' },
      { says: 'Every group 1 element ends in one s electron', test: 'model.test.ts: every group 1 element ends in one s electron' },
      { says: 'Every halogen ends in two s and five p electrons', test: 'model.test.ts: every halogen in two s and five p electrons' },
      { says: 'Each badge counts the electrons after the noble gas that closes the row above', shown: true as const },
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
    const answer = answerOf(this);
    const choice = settingsOf(this).element as Choice;
    const symbol = ELEMENTS[choice],
      z = atomicNumber(symbol),
      name = nameOf(symbol),
      Name = upperFirst(name);
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


    // How each state looks is picture.ts's; the steps below set the state.
    const followed: Followed = { z, group, name, Name, members, jumps, family };
    const base = { element: symbol, z, group };

    // ---- 1. the column: a puzzle to predict ------------------------------------------
    const distinct = [...new Set(jumps)].sort((a, b) => a - b);
    await this.step('column', {
      title: `Why are the jumps down ${name}’s column uneven?`,
      line: `Predict: what makes the jumps down the column ${list(distinct.map(String))}?`,
      caption: `${Name} is element ${z}, in group ${group}. Down its column the atomic number rises by ${list(jumps.map(String))}. Rows of equal length would give equal jumps, so the lower rows must hold more elements. To see why, add electrons one at a time in the order an atom fills them, then line up the runs they make.`,
    });
    await s.clear();
    this.state = { ...base, note: 'column', band: true, members: members.map((m) => m.z), gaps: jumps };
    // Both pictures are drawn from this.state, so every resting picture is the state it shows.
    const table = view(this, (state) => drawTable(state, followed), { place: false });
    const notes = view(this, (state) => drawNotes(state, followed), { place: false });
    // Named, so each redraw's evidence says which picture it paired.
    table.key = 'periodic:table';
    notes.key = 'periodic:notes';
    this.table = table;
    this.notes = notes;
    s.keep(table, notes, { describe: () => sayPeriodic(this.state, followed) });
    const redraw = (runTime: number) => table.sync({ runTime, match: samePlace, staged: false });
    const both = (runTime: number) =>
      new AnimationGroup([redraw(runTime), notes.sync({ runTime, match: samePlace, staged: false })], { rateFunc: linear });
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
      caption: `Give each element a cell and add its electrons one at a time; in a neutral atom the atomic number counts them. A filling rule arranges them in runs, and every full run is 2, 6, 10 or 14 long. ${ownRuns} Lay each run beside the last, starting a new row at each run of 2: the rows hold ${list(ROW_CELLS.map(String))} cells, and every jump down step 1’s column is one of those row lengths.`,
    });
    {
      const fillState = (lit: number, runs: number, done: boolean): PeriodicState => ({
        ...base,
        note: 'fill',
        layout: 'rows',
        lit,
        filling: configText(filling),
        runs: own.slice(0, runs),
        ...(done ? { rows: ROW_CELLS } : {}),
      });
      // Each state in turn: assign it, then redraw both pictures from it.
      const fillTo = async (next: PeriodicState, runTime: number) => {
        this.state = next;
        await this.play(both(runTime));
      };
      for (const [i, run] of RUNS.entries()) {
        // The scenario's last run stops at its own electron first.
        if (run.from <= z && z < run.to) await fillTo(fillState(z, own.length, false), 0.6);
        await fillTo(fillState(run.to, Math.min(own.length, i + 1), false), run.to <= z ? Math.min(0.75, 0.25 + run.sub.electrons * 0.05) : 0.2);
      }
      await fillTo(fillState(POSITIONS.length, own.length, true), 0.6);
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
      caption: `Slide every run of 6 to the right edge and every run of 10 into the middle, and lift the runs of 14 into two rows below so the table stays 18 columns wide. Rows 2 and 3 have no run of 10, so their runs of 6 slide 10 columns and leave a gap. ${answer}. ${
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

    // Name only what the picture now needs; configuration machinery stays in the details.
    await this.step('names', {
      title: 'The runs have names; helium needs one move',
      line: 's holds 2, p holds 6, d holds 10 and f holds 14 electrons.',
      caption: `Each run is a subshell, named by its shell number and a letter for its length: s holds 2, p 6, d 10 and f 14. By the filling rule, ${name}’s runs read ${configText(filling)}. Those widths give the table its blocks and gaps. Widths alone leave helium over beryllium; the table puts it over neon because its 1s² completes shell 1, as 2s² 2p⁶ completes neon’s shell 2. That grouping is chemistry we bring; sliding cells does not prove it.`,
    });
    this.state = { ...base, note: 'names', blocks: true, lit: POSITIONS.length, strip: 'named', helium: 'over-ne', capacity: CAPACITY };
    await this.play(both(1.2));

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
      kind: 'detail',
      title: `Which run fills next: ${name}’s ${z} electrons in order`,
      line: `The solid cells are ${name}’s ${z} electrons, in the order they fill.`,
      caption: `Subshells fill lowest n + l first, where n is the shell and l runs from 0 for s to 3 for f, and lower n first on a tie: Madelung’s empirical rule, which NIST’s reference configurations follow for ${RULE_MATCHES} of the first ${NIST_UP_TO} elements. ${
        (
          {
            na: 'Sodium’s 3s¹ follows 2p⁶ because n + l is 3 for both and 2p has the lower n.',
            cl: 'Chlorine has 7 electrons after neon yet sits in group 17: 3d (n + l = 5) waits until after 4s, and shell 2 has no d at all, so rows 2 and 3 have no d run. Rows 1 and 2 hold 10 electrons, so from aluminium to argon the atomic number equals the group.',
            fe: 'Iron’s 4s² comes before its 3d⁶ because n + l is 4 for 4s and 5 for 3d.',
            cu: 'Copper is one of the 20 exceptions: the rule gives 4s² 3d⁹ and NIST lists 3d¹⁰ 4s¹. Both put 11 electrons after argon, so the group is 11 either way.',
            he: 'Helium’s run puts it in column 2, the cell marked He?, but the table moves it over neon: 1s² completes shell 1, which has no p subshell, as 2s² 2p⁶ completes neon’s shell 2.',
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
      kind: 'detail',
      title: (
        {
          na: 'Every group 1 element ends in one s electron',
          cl: 'Every halogen ends in two s and five p electrons',
          fe: 'Iron, ruthenium and osmium each end with 8 s and d electrons',
          cu: 'Copper, silver and gold all end in d¹⁰ s¹',
          he: 'Neon to radon end in s² p⁶; helium ends in 1s²',
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
            he: 'From neon to radon, each noble gas ends in s² p⁶, a full s and p subshell; helium’s 1s² is shorter because shell 1 has no p subshell. Neon and argon count 8, ten short of their column, because rows 2 and 3 have no d run; from krypton on the count is 18. Each noble gas closes its row, so each jump is the next row’s length.',
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
