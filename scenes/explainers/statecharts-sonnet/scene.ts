import { Scene, Group, Rectangle, FadeIn, FadeOut, Succession } from '../../../src/index.ts';
import type { Vec } from '../../../src/index.ts';
import { stage } from '../../../explain/index.ts';
import { SIZE, words, frame, state, arrow, link, divider, ring, route, badge, ringLegend } from './draw.ts';
import {
  coffeeChart,
  frotherChart,
  playerChart,
  flatten,
  flatFor,
  declaredFor,
  dispatch,
  run,
  runFlat,
  configName,
  growth,
  sizes as sizesOf,
  compareAll,
  eventsOf,
  FLAGS,
  COFFEE_STATES,
  COFFEE_FLOW,
} from './model.ts';

const SOURCE = ['https://statecharts.dev/what-is-a-statechart.html', 'https://www.sciencedirect.com/science/article/pii/0167642387900359'];

// The coffee machine's four working states are drawn in one row, the same way in every step that shows them.
const CX = [-5.2, -1.75, 1.75, 5.2];
const CW = 2.0,
  CH = 1.0;

export default class StatechartsSonnet extends Scene {
  static meta = {
    id: 'statecharts-sonnet',
    title: 'What is a statechart?',
    sources: SOURCE,
    watch: {
      powerOffArrows: 'POWER_OFF arrows',
      flatStates: 'Flat states',
      config: 'Player',
    },
  };

  override async construct() {
    const s = stage(this, { style: 'github-light', headingSize: 0.64 });
    const ink = s.palette.ink,
      soft = s.soft,
      hot = s.emphasis,
      bad = s.bad,
      good = s.good;

    // ---- the model's answers every step draws from ----
    const coffee = coffeeChart(),
      coffeeFlat = flatten(coffee),
      coffeeSize = sizesOf(coffee),
      copies = flatFor(coffeeFlat, 'POWER_OFF'), // arrows a plain machine draws
      onBox = declaredFor(coffee, 'POWER_OFF'), // arrows the chart draws
      asked = dispatch(coffee, ['brewing'], 'POWER_OFF').asked[0]!,
      handled = dispatch(coffee, ['brewing'], 'BREWED').asked[0]!;
    const player = playerChart(2),
      playerFlat = flatten(player),
      events = ['PAUSE', 'MUTE', 'PLAY'],
      chartRun = run(player, events),
      flatRun = runFlat(playerFlat, events),
      agree = compareAll(player, eventsOf(player), 4);
    const growing = [2, 3, 4, 5].map(growth),
      five = growing[growing.length - 1]!,
      fiveChart = playerChart(5),
      fiveNow = run(fiveChart, ['PAUSE', 'MUTE'])[2]!;
    const frother = frotherChart(),
      frotherSize = sizesOf(frother),
      frotherCopies = flatFor(flatten(frother), 'POWER_OFF');

    // ---- drawings used in more than one step ----
    const counts = (text: string, y: number, color: string, edge: 'left' | 'right' = 'left') =>
      words(text, [edge === 'left' ? -7.2 : 7.2, y], color, 0.34, edge);

    /** The four working states, their arrows and (optionally) TAKE going round the top. */
    const coffeeRow = (y: number, withTake: boolean): Group => {
      const flow = COFFEE_STATES.slice(0, 3).map((id, i) =>
        link([CX[i]! + CW / 2 + 0.05, y], [CX[i + 1]! - CW / 2 - 0.05, y], ink, COFFEE_FLOW[id]!, [(CX[i]! + CX[i + 1]!) / 2, y + 0.38], 'middle', 0.3, soft),
      );
      const g = new Group(...COFFEE_STATES.map((id, i) => state(s, id, [CX[i]!, y], CW, CH, { size: 0.4 })), ...flow);
      if (withTake) {
        const top = y + CH / 2 + 0.05;
        g.add(route([[CX[3]!, top], [CX[3]!, y + 1.3], [CX[0]!, y + 1.3], [CX[0]!, top]], ink));
        g.add(words(COFFEE_FLOW.ready!, [0, y + 1.62], soft, 0.3));
      }
      return g;
    };

    /** The player with its two regions. Returns where each state sits so a ring can go on it. */
    const BX = -2.8,
      SW = 2.6,
      SHh = 1.0,
      PX = [BX - 2.2, BX + 2.2],
      PTY = 1.45,
      PBY = -1.3;
    const at = { playing: [PX[0]!, PTY], paused: [PX[1]!, PTY], unmuted: [PX[0]!, PBY], muted: [PX[1]!, PBY] } as Record<string, Vec>;
    const lane = (y: number, a: string, b: string, ea: string, eb: string) => [
      link([PX[0]! + SW / 2 + 0.05, y + 0.17], [PX[1]! - SW / 2 - 0.05, y + 0.17], ink, ea, [BX, y + 0.5], 'middle', 0.3, soft),
      link([PX[1]! - SW / 2 - 0.05, y - 0.17], [PX[0]! + SW / 2 + 0.05, y - 0.17], ink, eb, [BX, y - 0.5], 'middle', 0.3, soft),
      state(s, a, at[a]!, SW, SHh),
      state(s, b, at[b]!, SW, SHh),
    ];
    const playerLanes = () => [...lane(PTY, 'playing', 'paused', 'PAUSE', 'PLAY'), ...lane(PBY, 'unmuted', 'muted', 'MUTE', 'UNMUTE')];
    const regionLabels = () => [words('playback', [BX - 4.35, 2.5], ink, 0.4, 'left'), words('volume', [BX - 4.35, -0.1], ink, 0.4, 'left')];
    const playerBox = () =>
      new Group(frame(s, [BX, 0.2], 9.2, 5.4, { filled: false, stroke: 0.05 }), divider([BX - 4.6, 0.2], [BX + 4.6, 0.2], ink), ...regionLabels(), ...playerLanes());
    const RX = 2.3; // the right-hand column beside the player

    // ================= 1. The definition: the parent =================
    await this.step('definition', {
      title: 'A statechart is a state machine with nesting',
      line: 'Addition one: a parent holds child states.',
      caption:
        "A statechart is a state machine whose states can contain other states. It adds two things. A state can be a box of states, a parent, and any event its children don't handle goes to the parent. And a state can be split into regions, each in one state at the same time.",
    });
    {
      const Y = 0.2;
      await s.enter(coffeeRow(Y, false), {
        describe: 'Four states in a row: idle goes to grinding on SELECT, grinding to brewing on GROUND, brewing to ready on BREWED.',
      });
      const parent = new Group(frame(s, [0, 0.8], 14.4, 4.0, { filled: false, stroke: 0.05 }), words('on', [-6.95, 2.4], ink, 0.42, 'left'));
      await s.enter(parent, { describe: 'A box named on surrounds all four states.' });
      const up = new Group(
        arrow([CX[2]!, Y + CH / 2 + 0.05], [CX[2]!, 2.8], hot, 0.05),
        words("an event the child doesn't handle", [CX[2]! - 0.3, 2.1], ink, 0.34, 'right'),
        words('goes up to the parent', [CX[2]! - 0.3, 1.65], ink, 0.34, 'right'),
      );
      await s.enter(up, { describe: "An arrow rises from the child brewing to the edge of the box on: an event the child doesn't handle goes up to the parent." });
      await s.enter(
        words('parent = a box of states', [-7.0, -1.7], ink, 0.46, 'left'),
        words('children = the states inside it', [-7.0, -2.45], ink, 0.46, 'left'),
        { describe: 'Legend: a parent is a box of states, and its children are the states inside it.' },
      );
    }

    // ================= 2. Regions =================
    await this.step('regions-defined', {
      title: 'A statechart can split a state into regions',
      line: 'Rings mark the state each region is in.',
      caption: 'Addition two: a state split into regions. The regions run side by side, and each is in exactly one of its own states at any moment.',
    });
    await s.clear({ runTime: 0.25 });
    this.state.config = configName(chartRun[0]!);
    {
      await s.enter(playerBox(), {
        describe:
          'A player box split by a dashed line into two regions. Playback holds playing and paused, joined by PAUSE and PLAY. Volume holds unmuted and muted, joined by MUTE and UNMUTE.',
      });
      const r1 = ring(s, at.playing!, SW, SHh),
        r2 = ring(s, at.unmuted!, SW, SHh);
      await s.enter(r1, r2, { describe: "A ring on playing in the playback region and a ring on unmuted in the volume region: the player is in both at once." });
      await s.enter(ringLegend(s, [RX, -2.4]), { describe: 'Legend: a ring means where the machine is now.' });
      await s.enter(
        words('in two states at once:', [RX, 1.5], ink, 0.4, 'left'),
        words(configName(chartRun[0]!), [RX, 0.85], hot, 0.46, 'left'),
        words('one state in each region', [RX, 0.3], soft, 0.3, 'left'),
        { describe: `The player is in ${configName(chartRun[0]!)}: one state in each region.` },
      );
    }

    // ================= 3. The copied arrows, with a prediction prompt =================
    await this.step('copies', {
      title: 'Four states, four copies of POWER_OFF',
      line: 'Predict what a statechart does with these four.',
      caption:
        'In a plain state machine, behaviour shared by many states must be copied onto each of them. Give a coffee machine a power button, and idle, grinding, brewing and ready each need their own POWER_OFF arrow. What would a statechart do with four identical arrows?',
    });
    await s.clear({ runTime: 0.25 });
    this.state.powerOffArrows = copies;
    this.state.flatStates = coffeeSize.flatStates;
    const Y3 = 0.6,
      OFF: Vec = [0, -2.55];
    const row = coffeeRow(Y3, true);
    const off = state(s, 'off', OFF, 5.2, 0.9, { size: 0.44 });
    const powerOn = new Group(
      route([[-2.65, OFF[1]], [-7.0, OFF[1]], [-7.0, Y3], [CX[0]! - CW / 2 - 0.05, Y3]], ink),
      words('POWER_ON', [-4.0, OFF[1] - 0.38], soft, 0.3),
    );
    await s.enter(row, off, powerOn, {
      describe:
        'A coffee machine, full cycle: idle goes to grinding on SELECT, grinding to brewing on GROUND, brewing to ready on BREWED, ready back to idle on TAKE. A state named off returns to idle on POWER_ON.',
    });
    const power = COFFEE_STATES.map((id, i) => {
      const from: Vec = [CX[i]!, Y3 - CH / 2 - 0.05],
        to: Vec = [CX[i]! * 0.45, OFF[1] + 0.45 + 0.05];
      // Each label sits just under its state, on the outside of its line, so the four never touch.
      const y = from[1] - 0.55,
        t = (from[1] - y) / (from[1] - to[1]),
        lineX = from[0] + (to[0] - from[0]) * t;
      const where: Vec = [lineX + (CX[i]! < 0 ? -1.45 : 1.45), y];
      return link(from, to, bad, 'POWER_OFF', where, 'middle', 0.3, bad);
    });
    for (const p of power) s.keep(p, { describe: 'A POWER_OFF arrow from one state down to off.' });
    await this.play(new Succession(power.map((p) => new FadeIn(p, { runTime: 0.45 }))));
    const flatCount = counts(`Flat: ${coffeeSize.flatStates} states · ${coffeeSize.flatArrows} arrows`, -3.45, ink);
    const tally = counts(`POWER_OFF arrows: ${copies}`, -3.45, bad, 'right');
    await s.enter(flatCount, tally, {
      describe: `The flat machine has ${coffeeSize.flatStates} states and ${coffeeSize.flatArrows} arrows, ${copies} of them POWER_OFF.`,
    });

    // ================= 4. The box: one arrow, children first =================
    await this.step('box', {
      title: 'One POWER_OFF on the box replaces four',
      line: 'Answer: ask the child first, then the parent.',
      caption: `Answer: put the four in a box called on, and one POWER_OFF on the box does the job. An event goes to the child first. Brewing has no POWER_OFF, so it goes to the parent, on, which does.`,
    });
    this.state.powerOffArrows = onBox;
    await this.play(...power.map((p) => new FadeOut(p, { runTime: 0.4 })), new FadeOut(tally, { runTime: 0.4 }));
    const on = new Group(
      frame(s, [0, 1.15], 14.6, 2.9, { filled: false, stroke: 0.05 }),
      words('on', [-6.95, 2.3], ink, 0.42, 'left'),
    );
    await s.enter(on, { describe: 'A box named on now surrounds idle, grinding, brewing and ready.' });
    const one = link([0, -0.3], [0, OFF[1] + 0.5], hot, 'POWER_OFF', [0.3, -0.55], 'left', 0.34, ink);
    await s.enter(one, { describe: 'One POWER_OFF arrow leaves the box on, not any single state, and goes to off.' });
    const chartCount = counts(`Statechart: ${coffeeSize.chartStates} states · ${coffeeSize.chartArrows} arrows`, -4.0, hot);
    const brewingAt: Vec = [CX[2]!, Y3];
    const here = ring(s, brewingAt, CW, CH);
    const b1 = badge(s, 1, [CX[2]! + CW / 2 + 0.1, Y3 - CH / 2 - 0.1]);
    const tr = (text: string, y: number, color = ink, x = -6.6) => words(text, [x, y], color, 0.34, 'left');
    const traceOff = new Group(
      tr(`POWER_OFF arrives while ${asked.from}`, -0.95),
      tr(`1. ${asked.path[0]}: no POWER_OFF arrow`, -1.4, soft),
    );
    await s.enter(here, b1, traceOff, {
      describe: `A ring on brewing. POWER_OFF arrives while brewing. First brewing is asked, number one, and has no POWER_OFF arrow.`,
    });
    const b2 = badge(s, 2, [6.9, 2.6]);
    await s.enter(b2, tr(`2. ${asked.path[1]}: has one, goes to ${asked.target}`, -1.85), {
      describe: `Then ${asked.path[1]}, number two, is asked: it has one and goes to ${asked.target}.`,
    });
    await s.enter(
      tr(`BREWED arrives while brewing`, -0.95, ink, 0.9),
      tr(`1. ${handled.path[0]}: has one, goes to ${handled.target}`, -1.4, soft, 0.9),
      tr(`${asked.path[1]} is never asked`, -1.85, soft, 0.9),
      { describe: `For contrast, BREWED arrives while brewing: brewing has an arrow for it, so the parent is never asked.` },
    );
    await s.enter(chartCount, {
      describe: `The chart has ${coffeeSize.chartStates} states and ${coffeeSize.chartArrows} arrows, with ${onBox} POWER_OFF arrow, against ${coffeeSize.flatStates} states and ${coffeeSize.flatArrows} arrows flat.`,
    });

    // ================= 5. Independent features: predict =================
    await this.step('features', {
      title: 'Two independent on/off features',
      line: 'Predict: how many states would one plain machine need?',
      caption:
        'Independent features multiply. A player is playing or paused, and muted or unmuted, and each can change at any time without touching the other. How many states would one plain machine need for the whole player, and why?',
    });
    await s.clear({ runTime: 0.25 });
    this.state.flatStates = playerFlat.states.length;
    {
      await s.enter(new Group(...regionLabels(), ...playerLanes()), {
        describe: 'Two small machines, unframed: playback with playing and paused, volume with unmuted and muted. Each has its own arrows.',
      });
      await s.enter(
        words('Each feature changes', [RX, 1.5], ink, 0.4, 'left'),
        words('on its own, at any time.', [RX, 0.95], ink, 0.4, 'left'),
        words('One plain machine for', [RX, -0.2], hot, 0.4, 'left'),
        words('the whole player:', [RX, -0.75], hot, 0.4, 'left'),
        words('how many states? why?', [RX, -1.3], hot, 0.4, 'left'),
        { describe: 'Each feature changes on its own at any time. One plain machine for the whole player: how many states, and why?' },
      );
    }

    // ================= 6. Four flat states; each feature doubles =================
    await this.step('product', {
      title: 'Four flat states: one per combination',
      line: 'Each new on/off feature doubles the count.',
      caption:
        'Answer: four, because a flat state must name one setting of every feature, 2 × 2. A player that is playing or paused, and muted or unmuted, needs one flat state per combination, and each new on/off feature doubles that.',
    });
    await s.clear({ runTime: 0.25 });
    {
      const FX = [-5.9, -2.0],
        RY = [1.35, -1.45],
        FW = 2.5,
        FH = 1.2;
      const names = [
        ['playing\nunmuted', 'paused\nunmuted'],
        ['playing\nmuted', 'paused\nmuted'],
      ];
      const boxes = new Group(...names.flatMap((r, ri) => r.map((n, ci) => state(s, n, [FX[ci]!, RY[ri]!], FW, FH, { size: 0.4 }))));
      const E = 0.3;
      const lanes = new Group(
        ...RY.flatMap((y) => [
          link([FX[0]! + FW / 2 + 0.05, y + 0.2], [FX[1]! - FW / 2 - 0.05, y + 0.2], ink, 'PAUSE', [(FX[0]! + FX[1]!) / 2, y + 0.52], 'middle', E, soft),
          link([FX[1]! - FW / 2 - 0.05, y - 0.2], [FX[0]! + FW / 2 + 0.05, y - 0.2], ink, 'PLAY', [(FX[0]! + FX[1]!) / 2, y - 0.52], 'middle', E, soft),
        ]),
        ...FX.flatMap((x) => [
          link([x - 0.3, RY[0]! - FH / 2 - 0.05], [x - 0.3, RY[1]! + FH / 2 + 0.05], ink, 'MUTE', [x - 0.45, (RY[0]! + RY[1]!) / 2], 'right', E, soft),
          link([x + 0.3, RY[1]! + FH / 2 + 0.05], [x + 0.3, RY[0]! - FH / 2 - 0.05], ink, 'UNMUTE', [x + 0.45, (RY[0]! + RY[1]!) / 2], 'left', E, soft),
        ]),
      );
      await s.enter(boxes, lanes, {
        describe:
          'A flat machine with four states, one per combination: playing unmuted, paused unmuted, playing muted, paused muted. PAUSE and PLAY arrows join the columns, MUTE and UNMUTE arrows join the rows.',
      });
      await s.enter(words(`${playerFlat.states.length} flat states: 2 × 2, one per combination`, [-3.95, -3.55], ink, SIZE.note), {
        describe: `${playerFlat.states.length} flat states: two settings times two settings, one per combination.`,
      });
      const TX = [2.7, 5.9];
      const TY = [2.45, 1.3, 0.2, -0.9, -2.0];
      const head = new Group(words('Features', [TX[0]!, TY[0]!], soft, SIZE.note), words('Flat states', [TX[1]!, TY[0]!], soft, SIZE.note));
      const rows = new Group(
        ...growing.flatMap((g, i) => [
          words(String(g.features), [TX[0]!, TY[i + 1]!], g.features === 2 ? hot : ink, 0.6),
          words(String(g.flatStates), [TX[1]!, TY[i + 1]!], g.features === 2 ? hot : ink, 0.6),
        ]),
        ...[0, 1, 2].map((i) => words('x2', [7.05, (TY[i + 1]! + TY[i + 2]!) / 2], soft, 0.3)),
      );
      await s.enter(head, rows, {
        describe: `A table of features against flat states: ${growing.map((g) => `${g.features} features, ${g.flatStates} states`).join('; ')}. Each extra feature doubles the count.`,
      });
    }

    // ================= 7. The boolean bug =================
    await this.step('booleans', {
      title: 'Two booleans can say what the player never is',
      line: 'Both true should be impossible, and nothing stops it.',
      caption:
        "Booleans hide the same problem: isPlaying and isPaused can both be true, which should be impossible. Both false is not impossible, but the flags don't say what the player is then.",
    });
    await s.clear({ runTime: 0.25 });
    {
      const COL = [-4.6, -0.3, 4.4];
      const TY = [2.4, 1.25, 0.15, -0.95, -2.05];
      const head = new Group(
        words('isPlaying', [COL[0]!, TY[0]!], soft, 0.3),
        words('isPaused', [COL[1]!, TY[0]!], soft, 0.3),
        words('what the flags say', [COL[2]!, TY[0]!], soft, 0.3),
      );
      const rows = FLAGS.map((f, i) => {
        const color = f.verdict === 'impossible' ? bad : f.verdict === 'neither?' ? soft : ink;
        return new Group(
          words(String(f.isPlaying), [COL[0]!, TY[i + 1]!], color, 0.55),
          words(String(f.isPaused), [COL[1]!, TY[i + 1]!], color, 0.55),
          words(f.verdict, [COL[2]!, TY[i + 1]!], color, 0.55),
        );
      });
      await s.enter(head, ...rows, {
        describe: `Two flags written four ways: ${FLAGS.map((f) => `isPlaying ${f.isPlaying}, isPaused ${f.isPaused} says ${f.verdict}`).join('; ')}.`,
      });
      const bothTrue = FLAGS.findIndex((f) => f.verdict === 'impossible');
      const mark = new Rectangle({ width: 13.4, height: 0.95, cornerRadius: 0.16, fill: 'none', stroke: bad, strokeWidth: 0.06 }).moveTo([-0.3, TY[bothTrue + 1]!]);
      await s.enter(mark, { describe: 'A red box around the row where isPlaying and isPaused are both true.' });
      await s.enter(
        words('red: a combination the player can never be in', [0, -3.05], bad, SIZE.note),
        words('grey: legitimate, but the flags do not name it', [0, -3.65], soft, SIZE.note),
        { describe: 'Legend: red marks a combination the player can never be in; grey marks one that is legitimate but that the flags do not name.' },
      );
    }

    // ================= 8. Regions =================
    await this.step('regions', {
      title: 'Each region is in exactly one state',
      line: 'PAUSE moves one region. MUTE moves the other.',
      caption:
        "Answer: two regions need only 2 + 2 states, because each lists just its own feature, where the flat machine multiplies 2 × 2. Two small machines side by side can't write the impossible combination. Can a chart like this do anything a plain state machine cannot?",
    });
    await s.clear({ runTime: 0.25 });
    this.state.config = configName(chartRun[0]!);
    {
      await s.enter(playerBox(), {
        describe:
          'A player box split by a dashed line into two regions. Playback holds playing and paused, joined by PAUSE and PLAY. Volume holds unmuted and muted, joined by MUTE and UNMUTE.',
      });
      let playback = 'playing',
        volume = 'unmuted';
      const r1 = ring(s, at[playback]!, SW, SHh),
        r2 = ring(s, at[volume]!, SW, SHh);
      s.keep(r1, { describe: () => `A ring on ${playback}, the playback region's state` });
      s.keep(r2, { describe: () => `A ring on ${volume}, the volume region's state` });
      await this.play(new FadeIn(r1, { runTime: 0.3 }), new FadeIn(r2, { runTime: 0.3 }));
      await s.enter(ringLegend(s, [RX, -2.4]), { describe: 'Legend: a ring means where the machine is now.' });
      // The log: which regions an event reaches comes from the model.
      const reach = (event: string, before: readonly string[]) => {
        const moved = dispatch(player, before, event)
          .asked.filter((a) => a.handledBy !== null)
          .map((a) => (a.from === 'playing' || a.from === 'paused' ? 'playback' : 'volume'));
        return moved.length ? `${event}: ${moved.join(' and ')} only` : `${event}: nothing`;
      };
      const logAt: Vec[] = [[RX, 1.55], [RX, 0.95]];
      for (const [i, ev] of events.slice(0, 2).entries()) {
        const before = chartRun[i]!,
          after = chartRun[i + 1]!;
        const line = words(reach(ev, before), logAt[i]!, ink, 0.38, 'left');
        s.keep(line, { describe: line.text });
        const [pb, vol] = after;
        const moves = [] as ReturnType<typeof r1.animate.shift>[];
        if (pb !== playback) {
          moves.push(r1.animate.shift([at[pb!]![0] - at[playback]![0], 0]));
          playback = pb!;
        }
        if (vol !== volume) {
          moves.push(r2.animate.shift([at[vol!]![0] - at[volume]![0], 0]));
          volume = vol!;
        }
        this.state.config = configName(after);
        await this.play(new FadeIn(line, { runTime: 0.3 }), ...moves);
      }
      await s.enter(words(`now: ${configName(chartRun[2]!)}`, [RX, 0.3], hot, 0.42, 'left'), {
        describe: `Now the player is in ${configName(chartRun[2]!)}: one state from each region.`,
      });
      await s.enter(
        words('playing + paused:', [RX, -0.75], bad, 0.36, 'left'),
        words('cannot be written', [RX, -1.25], bad, 0.36, 'left'),
        { describe: 'playing + paused cannot be written: no region holds two states.' },
      );
      await s.enter(words(`${player.children!.length} regions, one per feature`, [BX, -3.45], ink, SIZE.note), {
        describe: `${player.children!.length} regions, one per feature.`,
      });
    }

    // ================= 9. Flattening: same behaviour =================
    await this.step('flatten', {
      title: 'Flattened, it behaves the same',
      line: 'Same events, same state at every row.',
      caption:
        'Answer: no. Nothing new becomes possible: flatten any statechart and you get an ordinary state machine with the same behaviour. Here both run PAUSE, MUTE, PLAY and agree at every step.',
    });
    await s.clear({ runTime: 0.25 });
    {
      const EX = -6.9,
        CXX = -1.6,
        FX = 3.6,
        VX = 6.7;
      const TY = [2.5, 1.45, 0.4, -0.65, -1.7];
      const chip = (text: string, x: number, y: number, w: number, color = ink) =>
        new Group(frame(s, [x, y], w, 0.7, { color, stroke: 0.03 }), words(text, [x, y], color, 0.34));
      const head = new Group(
        words('Event', [EX, TY[0]!], soft, 0.3, 'left'),
        words('Statechart: one state per region', [CXX, TY[0]!], soft, 0.3),
        words('Flattened: one state', [FX + 0.4, TY[0]!], soft, 0.3),
      );
      s.keep(head, { describe: 'Column headings: Event, Statechart with one state per region, Flattened with one state.' });
      await this.play(new FadeIn(head, { runTime: 0.3 }));
      const labels = ['start', ...events];
      const rowGroups = labels.map((label, i) => {
        const [pb, vol] = chartRun[i]!;
        const same = chartRun[i]!.join(' + ') === flatRun[i];
        const g = new Group(
          words(label, [EX, TY[i + 1]!], ink, 0.46, 'left'),
          chip(pb!, CXX - 1.0, TY[i + 1]!, 1.9),
          chip(vol!, CXX + 1.0, TY[i + 1]!, 1.9),
          chip(flatRun[i]!, FX + 0.4, TY[i + 1]!, 3.9),
          words(same ? 'same' : 'differs', [VX + 0.4, TY[i + 1]!], same ? good : bad, 0.4),
        );
        s.keep(g, {
          describe: `${label}: the statechart is in ${pb} and ${vol}; the flattened machine is in ${flatRun[i]}; ${same ? 'same' : 'different'}.`,
        });
        return g;
      });
      await this.play(new Succession(rowGroups.map((g) => new FadeIn(g, { runTime: 0.45 }))));
      this.state.flatStates = playerFlat.states.length;
      this.state.config = flatRun[flatRun.length - 1];
      await s.enter(
        words("Tempting claim: a statechart can do things a plain machine can't", [-7.2, -2.7], soft, 0.3, 'left'),
        words(`No: they agreed on all ${agree.agreed} of ${agree.tried} event sequences of length 4`, [-7.2, -3.3], agree.agreed === agree.tried ? good : bad, 0.34, 'left'),
        { describe: `The tempting claim that a statechart can do things a plain machine can't is refuted: the two agreed on ${agree.agreed} of ${agree.tried} event sequences of length 4.` },
      );
    }

    // ================= 10. What you gain =================
    await this.step('size', {
      title: 'The drawing stays the size of the idea',
      line: 'Flat states double. Region states add two.',
      caption:
        'What you gain is a drawing the size of the idea instead of the size of every combination, so it stays readable as the product grows.',
    });
    await s.clear({ runTime: 0.25 });
    {
      const UNIT = 0.2,
        X0 = -4.4;
      const RY = [2.35, 0.95, -0.45, -1.85];
      const flatCol = soft,
        regCol = hot;
      const bars = growing.map((g, i) => {
        const y = RY[i]!;
        return new Group(
          words(`${g.features} features`, [-7.3, y], ink, 0.44, 'left'),
          new Rectangle({ width: g.flatStates * UNIT, height: 0.46, fill: flatCol, fillOpacity: 0.55, stroke: flatCol, strokeWidth: 0.03 }).moveTo([X0 + (g.flatStates * UNIT) / 2, y + 0.3]),
          words(String(g.flatStates), [X0 + g.flatStates * UNIT + 0.15, y + 0.3], ink, 0.4, 'left'),
          new Rectangle({ width: g.regionStates * UNIT, height: 0.46, fill: regCol, fillOpacity: 0.9, stroke: regCol, strokeWidth: 0.03 }).moveTo([X0 + (g.regionStates * UNIT) / 2, y - 0.3]),
          words(String(g.regionStates), [X0 + g.regionStates * UNIT + 0.15, y - 0.3], ink, 0.4, 'left'),
        );
      });
      await s.enter(...bars, {
        describe: `Bars for 2 to 5 on/off features. Flat states: ${growing.map((g) => g.flatStates).join(', ')}. States drawn with regions: ${growing.map((g) => g.regionStates).join(', ')}.`,
      });
      const legend = new Group(
        new Rectangle({ width: 0.5, height: 0.3, fill: flatCol, fillOpacity: 0.55, stroke: flatCol, strokeWidth: 0.03 }).moveTo([-6.8, -3.4]),
        words('Flat machine: doubles per feature', [-6.4, -3.4], ink, 0.3, 'left'),
        new Rectangle({ width: 0.5, height: 0.3, fill: regCol, fillOpacity: 0.9, stroke: regCol, strokeWidth: 0.03 }).moveTo([0.6, -3.4]),
        words('Statechart: adds two per feature', [1.0, -3.4], ink, 0.3, 'left'),
      );
      await s.enter(legend, { describe: 'Legend: in each pair, the upper grey bar is the flat machine, which doubles per feature, and the lower coloured bar is the statechart, which adds two states per feature.' });
    }

    // ================= 11. The caution: situations =================
    await this.step('situations', {
      title: 'Regions shrink the drawing, not the situations',
      line: `Same ${five.flatStates} situations; ${five.flatStates} states drawn against ${five.regionStates}.`,
      caption: `A tempting claim: regions reduce the situations the machine can be in. They don't. At run time it is still in one combination, one of ${five.flatStates} at five features. Regions shrink the drawing, not the set of situations.`,
    });
    await s.clear({ runTime: 0.25 });
    {
      const LX = -7.2,
        C = [1.6, 5.6];
      const TY = [2.45, 1.2, -0.3];
      await s.enter(
        words('Flat machine', [C[0]!, TY[0]!], soft, 0.38),
        words('Statechart', [C[1]!, TY[0]!], soft, 0.38),
        words('5 features', [LX, TY[0]!], soft, 0.38, 'left'),
        { describe: 'Column headings for five features: flat machine and statechart.' },
      );
      await s.enter(
        words('Situations it', [LX, TY[1]! + 0.25], ink, 0.42, 'left'),
        words('can be in', [LX, TY[1]! - 0.25], ink, 0.42, 'left'),
        words(String(five.flatStates), [C[0]!, TY[1]!], ink, 0.95),
        words(String(five.flatStates), [C[1]!, TY[1]!], ink, 0.95),
        words('same', [(C[0]! + C[1]!) / 2, TY[1]! - 0.75], good, 0.34),
        { describe: `Situations the machine can be in: ${five.flatStates} for the flat machine and ${five.flatStates} for the statechart. The same.` },
      );
      await s.enter(
        words('States drawn', [LX, TY[2]!], ink, 0.42, 'left'),
        words(String(five.flatStates), [C[0]!, TY[2]!], ink, 0.95),
        words(String(five.regionStates), [C[1]!, TY[2]!], hot, 0.95),
        { describe: `States drawn: ${five.flatStates} for the flat machine, ${five.regionStates} for the statechart.` },
      );
      await s.enter(
        words(`At run time it is in exactly one of the ${five.flatStates}:`, [LX, -1.75], soft, 0.3, 'left'),
        words(configName(fiveNow), [LX, -2.4], hot, 0.42, 'left'),
        { describe: `At run time the machine is in exactly one combination, for example ${configName(fiveNow)}.` },
      );
    }

    // ================= 12. Transfer: ask =================
    await this.step('frother', {
      title: 'Add a milk frother to the coffee machine',
      line: 'Predict: where does it go, and what happens to the flat machine?',
      caption:
        'Now apply both ideas. The machine gains a milk frother that can be switched on or off at any time, whatever the machine is doing. Where does it go in the chart, and what happens to the flat machine?',
    });
    await s.clear({ runTime: 0.25 });
    {
      const O: Vec = [0, -2.55];
      await s.enter(
        coffeeRow(Y3, true),
        new Group(frame(s, [0, 1.2], 14.6, 3.0, { filled: false, stroke: 0.05 }), words('on', [-6.95, 2.35], ink, 0.42, 'left')),
        state(s, 'off', O, 5.2, 0.9, { size: 0.44 }),
        link([0, -0.3], [0, O[1] + 0.5], ink, 'POWER_OFF', [0.3, -1.15], 'left', 0.34, ink),
        {
          describe: 'The coffee machine chart: a box named on holding idle, grinding, brewing and ready, one POWER_OFF arrow from the box to off, and POWER_ON back.',
        },
      );
      await s.enter(
        new Group(
          frame(s, [5.0, -2.9], 4.4, 1.5, { color: hot, stroke: 0.05, dashed: true, filled: false }),
          words('milk frother', [5.0, -2.55], ink, 0.42),
          words('on or off, at any time', [5.0, -3.2], ink, 0.34),
        ),
        { describe: 'A dashed box: a milk frother, on or off at any time. Where it goes is the question.' },
      );
      await s.enter(
        words('Where does it go?', [-7.2, -2.2], hot, 0.38, 'left'),
        words('What happens to the', [-7.2, -2.85], hot, 0.38, 'left'),
        words('flat machine?', [-7.2, -3.4], hot, 0.38, 'left'),
        { describe: 'Where does it go, and what happens to the flat machine?' },
      );
    }

    // ================= 13. Transfer: answer =================
    await this.step('frother-answer', {
      title: 'A second region inside on: still one POWER_OFF',
      line: 'Answer: the frother is a region, the flat machine doubles.',
      caption: `Answer: the frother is a second region inside on, so the one POWER_OFF on the box still stops both. The flat machine needs a state for every pairing, ${frotherSize.flatStates} states and ${frotherCopies} copies of POWER_OFF; the chart adds two states.`,
    });
    await s.clear({ runTime: 0.25 });
    this.state.powerOffArrows = declaredFor(frother, 'POWER_OFF');
    this.state.flatStates = frotherSize.flatStates;
    {
      const Y = 0.85,
        FY = -0.82,
        O: Vec = [0, -3.0];
      const frothAt = { off: [-2.2, FY] as Vec, on: [2.2, FY] as Vec };
      const box = new Group(
        frame(s, [0, 0.65], 14.6, 4.6, { filled: false, stroke: 0.05 }),
        words('on', [-6.95, 2.65], ink, 0.42, 'left'),
        divider([-7.3, 0.0], [7.3, 0.0], ink),
        words('cycle', [-6.2, 2.1], soft, 0.3, 'left'),
        words('frother', [-6.95, -0.3], soft, 0.3, 'left'),
        coffeeRow(Y, true),
      );
      await s.enter(box, { describe: 'A box named on, now split into two regions. The first region, cycle, holds idle, grinding, brewing and ready with SELECT, GROUND, BREWED and TAKE.' });
      await s.enter(
        state(s, 'froth off', frothAt.off, 2.5, 0.8, { size: 0.38 }),
        state(s, 'froth on', frothAt.on, 2.5, 0.8, { size: 0.38 }),
        link([frothAt.off[0] + 1.3, FY + 0.12], [frothAt.on[0] - 1.3, FY + 0.12], ink, 'FROTH_ON', [0, FY + 0.45], 'middle', 0.3, soft),
        link([frothAt.on[0] - 1.3, FY - 0.12], [frothAt.off[0] + 1.3, FY - 0.12], ink, 'FROTH_OFF', [0, FY - 0.45], 'middle', 0.3, soft),
        { describe: 'The second region, frother, holds froth off and froth on, joined by FROTH_ON and FROTH_OFF.' },
      );
      await s.enter(state(s, 'off', O, 2.0, 0.8, { size: 0.44 }), link([0, -1.65], [0, O[1] + 0.45], hot, 'POWER_OFF', [-0.3, -2.2], 'right', 0.34, ink), {
        describe: 'One POWER_OFF arrow leaves the whole box on to off.',
      });
      await s.enter(
        words(`Flat: ${frotherSize.flatStates} states · ${frotherSize.flatArrows} arrows`, [-7.2, -2.95], ink, 0.34, 'left'),
        words(`POWER_OFF arrows: ${frotherCopies}`, [-7.2, -3.5], bad, 0.34, 'left'),
        words(`Statechart: ${frotherSize.chartStates} states · ${frotherSize.chartArrows} arrows`, [2.5, -2.95], hot, 0.34, 'left'),
        words(`POWER_OFF arrows: ${declaredFor(frother, 'POWER_OFF')}`, [2.5, -3.5], hot, 0.34, 'left'),
        { describe: `Flat machine: ${frotherSize.flatStates} states, ${frotherSize.flatArrows} arrows, ${frotherCopies} POWER_OFF arrows. Statechart: ${frotherSize.chartStates} states, ${frotherSize.chartArrows} arrows, 1 POWER_OFF arrow.` },
      );
    }

    // ================= 14. Remember =================
    await this.step('remember', {
      title: 'A statechart in one sentence',
      line: 'Check yourself against the three questions.',
      caption: 'The three check questions, answered, under the sentence to remember.',
    });
    await s.clear({ runTime: 0.25 });
    {
      await s.enter(
        words('A statechart is a state machine that can nest states', [0, 2.25], ink, 0.5),
        words('and run parts side by side, so shared behaviour is', [0, 1.6], ink, 0.5),
        words("written once and independent features don't multiply.", [0, 0.95], ink, 0.5),
        { describe: "A statechart is a state machine that can nest states and run parts side by side, so shared behaviour is written once and independent features don't multiply." },
      );
      const q = (n: number, a: string, b: string, y: number) =>
        new Group(words(`${n}. ${a}`, [-7.2, y], ink, 0.38, 'left'), words(b, [-6.75, y - 0.45], soft, 0.3, 'left'));
      await s.enter(
        q(1, 'Four states, one EXIT arrow?', 'Put them in a parent and write the arrow once.', -0.3),
        q(2, 'Why 4 flat states but 2 regions?', 'Flat multiplies the settings (2 × 2); regions list them (2 + 2).', -1.5),
        q(3, "Can a statechart do what a machine can't?", 'No: flatten it and a plain machine behaves the same.', -2.7),
        { describe: 'Three answers. One: four states with the same EXIT arrow go in a parent and the arrow is written once. Two: a flat machine multiplies the settings, regions list them. Three: no, flatten any statechart and a plain machine behaves the same.' },
      );
    }
  }
}
