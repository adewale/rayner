import { Scene, Group, Rectangle, FadeIn, FadeOut, Succession, AnimationGroup } from '../../../src/index.ts';
import type { Vec } from '../../../src/index.ts';
import { stage } from '../../../explain/index.ts';
import { SIZE, words, frame, state, arrow, link, divider, ring } from './draw.ts';
import {
  coffeeChart,
  playerChart,
  flatten,
  flatFor,
  declaredFor,
  dispatch,
  run,
  runFlat,
  configName,
  growth,
  FLAGS,
  COFFEE_STATES,
  COFFEE_FLOW,
} from './model.ts';

const SOURCE = ['https://statecharts.dev/what-is-a-statechart.html', 'https://www.sciencedirect.com/science/article/pii/0167642387900359'];

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
      copies = flatFor(coffeeFlat, 'POWER_OFF'), // arrows a plain machine draws
      onBox = declaredFor(coffee, 'POWER_OFF'), // arrows the chart draws
      trace = dispatch(coffee, ['brewing'], 'POWER_OFF').asked[0]!;
    const player = playerChart(2),
      playerFlat = flatten(player),
      events = ['PAUSE', 'MUTE', 'PLAY'],
      chartRun = run(player, events),
      flatRun = runFlat(playerFlat, events);
    const sizes = [2, 3, 4, 5].map(growth);

    // ================= 1. The definition, parts named =================
    await this.step('definition', {
      title: 'A statechart is a state machine with nesting',
      line: 'Left: a parent. Right: two regions.',
      caption:
        "A statechart is a state machine whose states can contain other states. It adds two things. A state can be a box of states, a parent, and any event its children don't handle goes to the parent. And a state can be split into regions, each in one state at the same time.",
    });
    {
      const SH = 0.9;
      const LC = -4.2; // left chart centre
      const kids = new Group(
        state(s, 'idle', [LC - 1.5, 1.0], 2.4, SH, { size: 0.4 }),
        state(s, 'grinding', [LC + 1.5, 1.0], 2.4, SH, { size: 0.4 }),
        arrow([LC - 0.3, 1.0], [LC + 0.3, 1.0], ink),
      );
      await s.enter(kids, { describe: 'Two states, idle and grinding, with an arrow from idle to grinding.' });
      const parent = new Group(
        frame(s, [LC, 1.55], 6.4, 2.7, { filled: false, stroke: 0.05 }),
        words('on', [LC - 3.0, 2.5], ink, 0.4, 'left'),
      );
      const off = state(s, 'off', [LC, -1.5], 1.6, 0.8, { size: 0.4 });
      const up = link([LC, 0.2], [LC, -1.1], ink, 'POWER_OFF', [LC + 0.25, -0.45], 'left', SIZE.event, ink);
      await s.enter(parent, off, up, {
        describe: 'A box named on now surrounds both states. One POWER_OFF arrow leaves the box, not either state, to a state named off.',
      });
      await s.enter(
        words('A parent: a box of states', [LC, -2.95], ink, SIZE.note),
        words('the states inside are its children', [LC, -3.5], soft, 0.3),
        { describe: 'Caption under the left chart: a parent is a box of states, and the states inside are its children.' },
      );

      const RC = 4.2;
      const rkids = new Group(
        state(s, 'playing', [RC - 1.65, 1.45], 2.5, SH, { size: 0.4 }),
        state(s, 'paused', [RC + 1.65, 1.45], 2.5, SH, { size: 0.4 }),
        arrow([RC - 0.3, 1.6], [RC + 0.3, 1.6], ink),
        arrow([RC + 0.3, 1.3], [RC - 0.3, 1.3], ink),
        state(s, 'unmuted', [RC - 1.65, -1.25], 2.5, SH, { size: 0.4 }),
        state(s, 'muted', [RC + 1.65, -1.25], 2.5, SH, { size: 0.4 }),
        arrow([RC - 0.3, -1.1], [RC + 0.3, -1.1], ink),
        arrow([RC + 0.3, -1.4], [RC - 0.3, -1.4], ink),
      );
      await s.enter(rkids, { describe: 'Four states in two rows: playing and paused, then unmuted and muted, with arrows both ways in each row.' });
      const regions = new Group(
        frame(s, [RC, 0.25], 6.8, 5.3, { filled: false, stroke: 0.05 }),
        divider([RC - 3.4, 0.25], [RC + 3.4, 0.25], ink),
        words('playback', [RC - 3.2, 2.55], ink, 0.38, 'left'),
        words('volume', [RC - 3.2, -0.1], ink, 0.38, 'left'),
      );
      await s.enter(regions, { describe: 'A box around all four, split by a dashed line into two regions, playback above and volume below.' });
      await s.enter(
        words('Regions: each in one state', [RC, -3.2], ink, SIZE.note),
        words('at the same time', [RC, -3.7], soft, 0.3),
        { describe: 'Caption under the right chart: regions are each in one state at the same time.' },
      );
    }

    // ================= 2. The copied arrows, with a prediction prompt =================
    await this.step('copies', {
      title: 'Four states, four copies of POWER_OFF',
      line: 'Predict what a statechart does with these four.',
      caption:
        'In a plain state machine, behaviour shared by many states must be copied onto each of them. Give a coffee machine a power button, and idle, grinding, brewing and ready each need their own POWER_OFF arrow. What would a statechart do with four identical arrows?',
    });
    await s.clear({ runTime: 0.25 });
    this.state.powerOffArrows = copies;
    const X = [-5.55, -1.85, 1.85, 5.55],
      Y = 1.0,
      W = 2.0,
      H = 1.0,
      OFF: Vec = [0, -2.55];
    const flow = COFFEE_STATES.map((id, i) =>
      i < 3
        ? link([X[i]! + W / 2 + 0.05, Y], [X[i + 1]! - W / 2 - 0.05, Y], ink, COFFEE_FLOW[id]!, [(X[i]! + X[i + 1]!) / 2, Y + 0.38], 'middle', 0.3, soft)
        : null,
    ).filter((g): g is Group => g !== null);
    const row = new Group(...COFFEE_STATES.map((id, i) => state(s, id, [X[i]!, Y], W, H, { size: 0.4 })), ...flow);
    const off = state(s, 'off', OFF, 2.0, 0.9, { size: 0.44 });
    await s.enter(row, off, {
      describe:
        'A coffee machine: idle goes to grinding on SELECT, grinding to brewing on GROUND, brewing to ready on BREWED. Below them a state named off.',
    });
    const power = COFFEE_STATES.map((id, i) => {
      const from: Vec = [X[i]!, Y - H / 2 - 0.05],
        to: Vec = [X[i]! * 0.22, OFF[1] + 0.45 + 0.05];
      // Each label sits just under its state, on the outside of its line, so the four never touch.
      const y = from[1] - 0.55,
        t = (from[1] - y) / (from[1] - to[1]),
        lineX = from[0] + (to[0] - from[0]) * t;
      const at: Vec = [lineX + (X[i]! < 0 ? -1.25 : 1.25), y];
      return link(from, to, bad, 'POWER_OFF', at, 'middle', 0.3, bad);
    });
    for (const p of power) s.keep(p, { describe: 'A POWER_OFF arrow from one state down to off.' });
    await this.play(new Succession(power.map((p) => new FadeIn(p, { runTime: 0.45 }))));
    const tally = words(`${copies} copies of the same arrow`, [0, -3.75], bad, SIZE.note);
    await s.enter(tally, { describe: `${copies} copies of the same POWER_OFF arrow, one per state.` });

    // ================= 3. The box: one arrow, children first =================
    await this.step('box', {
      title: 'One POWER_OFF on the box replaces four',
      line: 'Children are asked first, then the parent.',
      caption:
        'Put the four in a box called on, and one POWER_OFF on the box does the job. An event goes to the child first. Brewing has no POWER_OFF, so it goes to the parent, on, which does.',
    });
    this.state.powerOffArrows = onBox;
    await this.play(...power.map((p) => new FadeOut(p, { runTime: 0.4 })), new FadeOut(tally, { runTime: 0.4 }));
    const on = new Group(
      frame(s, [0, 1.45], 14.6, 2.9, { filled: false, stroke: 0.05 }),
      words('on', [-6.95, 2.5], ink, 0.42, 'left'),
    );
    await s.enter(on, { describe: 'A box named on now surrounds idle, grinding, brewing and ready.' });
    const one = link([0, 0.0], [0, OFF[1] + 0.5], hot, 'POWER_OFF', [0.3, -0.7], 'left', 0.34, ink);
    await s.enter(one, { describe: 'One POWER_OFF arrow leaves the box on, not any single state, and goes to off.' });
    const brewingAt: Vec = [X[2]!, Y];
    const where = ring(s, brewingAt, W, H);
    const steps = new Group(
      words('POWER_OFF arrives while brewing', [1.6, -1.45], ink, 0.36, 'left'),
      words(`1. ${trace.path[0]}: no POWER_OFF arrow`, [1.6, -2.05], soft, 0.34, 'left'),
      words(`2. ${trace.path[1]}: has one, goes to ${trace.target}`, [1.6, -2.65], ink, 0.34, 'left'),
    );
    await s.enter(where, steps, {
      describe: `A ring on brewing. POWER_OFF arrives while brewing. First brewing is asked and has no POWER_OFF arrow. Then ${trace.path[1]} is asked: it has one and goes to ${trace.target}.`,
    });
    await s.enter(words(`${onBox} arrow instead of ${copies}`, [-4.2, -3.75], hot, SIZE.note), {
      describe: `${onBox} POWER_OFF arrow instead of ${copies}.`,
    });

    // ================= 4. Four flat states; each feature doubles =================
    await this.step('product', {
      title: 'Two on/off features need four flat states',
      line: 'Each new on/off feature doubles the count.',
      caption:
        'Independent features multiply. A player that is playing or paused, and muted or unmuted, needs one flat state per combination, four of them, and each new on/off feature doubles that.',
    });
    await s.clear({ runTime: 0.25 });
    this.state.flatStates = playerFlat.states.length;
    {
      const CX = [-5.9, -2.0],
        RY = [1.35, -1.45],
        FW = 2.5,
        FH = 1.2;
      const names = [
        ['playing\nunmuted', 'paused\nunmuted'],
        ['playing\nmuted', 'paused\nmuted'],
      ];
      const boxes = new Group(
        ...names.flatMap((r, ri) => r.map((n, ci) => state(s, n, [CX[ci]!, RY[ri]!], FW, FH, { size: 0.4 }))),
      );
      const E = 0.3;
      const lanes = new Group(
        // playback: the two arrows between the columns of each row
        ...RY.flatMap((y) => [
          link([CX[0]! + FW / 2 + 0.05, y + 0.2], [CX[1]! - FW / 2 - 0.05, y + 0.2], ink, 'PAUSE', [(CX[0]! + CX[1]!) / 2, y + 0.52], 'middle', E, soft),
          link([CX[1]! - FW / 2 - 0.05, y - 0.2], [CX[0]! + FW / 2 + 0.05, y - 0.2], ink, 'PLAY', [(CX[0]! + CX[1]!) / 2, y - 0.52], 'middle', E, soft),
        ]),
        // volume: the two arrows between the rows of each column
        ...CX.flatMap((x) => [
          link([x - 0.3, RY[0]! - FH / 2 - 0.05], [x - 0.3, RY[1]! + FH / 2 + 0.05], ink, 'MUTE', [x - 0.45, (RY[0]! + RY[1]!) / 2], 'right', E, soft),
          link([x + 0.3, RY[1]! + FH / 2 + 0.05], [x + 0.3, RY[0]! - FH / 2 - 0.05], ink, 'UNMUTE', [x + 0.45, (RY[0]! + RY[1]!) / 2], 'left', E, soft),
        ]),
      );
      await s.enter(boxes, lanes, {
        describe:
          'A flat machine with four states, one per combination: playing unmuted, paused unmuted, playing muted, paused muted. PAUSE and PLAY arrows join the columns, MUTE and UNMUTE arrows join the rows.',
      });
      await s.enter(words('one flat state per combination', [-3.95, -3.55], ink, SIZE.note), {
        describe: 'Caption under the flat machine: one flat state per combination.',
      });
      const TX = [2.7, 5.9];
      const TY = [2.45, 1.3, 0.2, -0.9, -2.0];
      const head = new Group(
        words('Features', [TX[0]!, TY[0]!], soft, SIZE.note),
        words('Flat states', [TX[1]!, TY[0]!], soft, SIZE.note),
      );
      const rows = new Group(
        ...sizes.flatMap((g, i) => [
          words(String(g.features), [TX[0]!, TY[i + 1]!], g.features === 2 ? hot : ink, 0.6),
          words(String(g.flatStates), [TX[1]!, TY[i + 1]!], g.features === 2 ? hot : ink, 0.6),
        ]),
        ...[0, 1, 2].map((i) => words('x2', [7.05, (TY[i + 1]! + TY[i + 2]!) / 2], soft, 0.32)),
      );
      await s.enter(head, rows, {
        describe: `A table of features against flat states: ${sizes.map((g) => `${g.features} features, ${g.flatStates} states`).join('; ')}. Each extra feature doubles the count.`,
      });
    }

    // ================= 5. The boolean bug =================
    await this.step('booleans', {
      title: 'Two booleans can say what the player never is',
      line: 'Predict how many states two small machines need.',
      caption:
        'Booleans hide the same problem: isPlaying and isPaused can both be true, which should be impossible. If playback and volume were two small machines side by side, how many states would you draw in each?',
    });
    await s.clear({ runTime: 0.25 });
    {
      const CX = [-4.6, -0.3, 4.4];
      const TY = [2.4, 1.25, 0.15, -0.95, -2.05];
      const real = FLAGS.filter((f) => f.state).length;
      const head = new Group(
        words('isPlaying', [CX[0]!, TY[0]!], soft, 0.3),
        words('isPaused', [CX[1]!, TY[0]!], soft, 0.3),
        words('what it means', [CX[2]!, TY[0]!], soft, 0.3),
      );
      const rows = FLAGS.map((f, i) => {
        const wrong = !f.state;
        const col = f.isPlaying && f.isPaused ? bad : wrong ? bad : ink;
        return new Group(
          words(String(f.isPlaying), [CX[0]!, TY[i + 1]!], col, 0.55),
          words(String(f.isPaused), [CX[1]!, TY[i + 1]!], col, 0.55),
          words(f.state ?? 'impossible', [CX[2]!, TY[i + 1]!], col, 0.55),
        );
      });
      await s.enter(head, ...rows, {
        describe: `Two flags written four ways: ${FLAGS.map((f) => `isPlaying ${f.isPlaying}, isPaused ${f.isPaused} means ${f.state ?? 'impossible'}`).join('; ')}.`,
      });
      const bothTrue = FLAGS.findIndex((f) => f.isPlaying && f.isPaused);
      const mark = new Rectangle({ width: 13.4, height: 0.95, cornerRadius: 0.16, fill: 'none', stroke: bad, strokeWidth: 0.06 }).moveTo([-0.3, TY[bothTrue + 1]!]);
      await s.enter(mark, { describe: 'A red box around the row where isPlaying and isPaused are both true.' });
      await s.enter(words(`${FLAGS.length} ways to write it, ${real} real states`, [0, -3.45], ink, SIZE.note), {
        describe: `${FLAGS.length} ways to write the two flags, but only ${real} real states.`,
      });
    }

    // ================= 6. Regions =================
    await this.step('regions', {
      title: 'Each region is in exactly one state',
      line: 'PAUSE moves one region. MUTE moves the other.',
      caption:
        "Regions keep playback and volume apart, as two small machines side by side, so the impossible combination can't be written: each region is in one state at a time. Can a chart like this do anything a plain state machine cannot?",
    });
    await s.clear({ runTime: 0.25 });
    this.state.config = configName(chartRun[0]!);
    {
      const BX = -2.8,
        SW = 2.6,
        SHh = 1.0;
      const px = [BX - 2.2, BX + 2.2],
        ty = 1.45,
        by = -1.3;
      const at = { playing: [px[0]!, ty], paused: [px[1]!, ty], unmuted: [px[0]!, by], muted: [px[1]!, by] } as Record<string, Vec>;
      const chart = new Group(
        frame(s, [BX, 0.2], 9.2, 5.4, { filled: false, stroke: 0.05 }),
        divider([BX - 4.6, 0.2], [BX + 4.6, 0.2], ink),
        words('playback', [BX - 4.35, 2.5], ink, 0.4, 'left'),
        words('volume', [BX - 4.35, -0.1], ink, 0.4, 'left'),
        ...(['playing', 'paused', 'unmuted', 'muted'] as const).map((n) => state(s, n, at[n]!, SW, SHh)),
        link([px[0]! + SW / 2 + 0.05, ty + 0.17], [px[1]! - SW / 2 - 0.05, ty + 0.17], ink, 'PAUSE', [BX, ty + 0.5], 'middle', 0.3, soft),
        link([px[1]! - SW / 2 - 0.05, ty - 0.17], [px[0]! + SW / 2 + 0.05, ty - 0.17], ink, 'PLAY', [BX, ty - 0.5], 'middle', 0.3, soft),
        link([px[0]! + SW / 2 + 0.05, by + 0.17], [px[1]! - SW / 2 - 0.05, by + 0.17], ink, 'MUTE', [BX, by + 0.5], 'middle', 0.3, soft),
        link([px[1]! - SW / 2 - 0.05, by - 0.17], [px[0]! + SW / 2 + 0.05, by - 0.17], ink, 'UNMUTE', [BX, by - 0.5], 'middle', 0.3, soft),
      );
      await s.enter(chart, {
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
      // The log: which regions an event reaches comes from the model.
      const reach = (event: string, before: readonly string[]) => {
        const moved = dispatch(player, before, event).asked.filter((a) => a.handledBy !== null).map((a) => (a.from === 'playing' || a.from === 'paused' ? 'playback' : 'volume'));
        return moved.length ? `${event}: ${moved.join(' and ')} only` : `${event}: nothing`;
      };
      const logAt: Vec[] = [[2.5, 1.5], [2.5, 0.7]];
      const logged: string[] = [];
      let nowAt = 0;
      for (const [i, ev] of events.slice(0, 2).entries()) {
        const before = chartRun[i]!,
          after = chartRun[i + 1]!;
        const line = words(reach(ev, before), logAt[i]!, ink, 0.4, 'left');
        logged.push(line.text);
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
        await this.play(new FadeIn(line, { runTime: 0.3 }), ...moves.map((m) => m));
        nowAt = i;
      }
      void nowAt;
      await s.enter(words(`now: ${configName(chartRun[2]!)}`, [2.5, -0.5], hot, 0.46, 'left'), {
        describe: `Now the player is in ${configName(chartRun[2]!)}: one state from each region.`,
      });
      await s.enter(words(`${player.children!.length} regions, one per feature`, [BX, -3.45], ink, SIZE.note), {
        describe: `${player.children!.length} regions, one per feature.`,
      });
    }

    // ================= 7. Flattening: same behaviour =================
    await this.step('flatten', {
      title: 'Flattened, it behaves the same',
      line: 'Same events, same state at every row.',
      caption:
        'Nothing new becomes possible: flatten any statechart and you get an ordinary state machine with the same behaviour. Here both run PAUSE, MUTE, PLAY and agree at every step.',
    });
    await s.clear({ runTime: 0.25 });
    {
      const EX = -6.9,
        CX = -1.6,
        FX = 3.6,
        VX = 6.7;
      const TY = [2.5, 1.35, 0.2, -0.95, -2.1];
      const chip = (text: string, x: number, y: number, w: number, color = ink) =>
        new Group(frame(s, [x, y], w, 0.7, { color, stroke: 0.03 }), words(text, [x, y], color, 0.34));
      const head = new Group(
        words('Event', [EX, TY[0]!], soft, 0.3, 'left'),
        words('Statechart: one state per region', [CX, TY[0]!], soft, 0.3),
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
          chip(pb!, CX - 1.0, TY[i + 1]!, 1.9),
          chip(vol!, CX + 1.0, TY[i + 1]!, 1.9),
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
    }

    // ================= 8. What you gain =================
    await this.step('size', {
      title: 'The drawing stays the size of the idea',
      line: 'Flat states double. Region states add two.',
      caption:
        "What you gain is a drawing the size of the idea instead of the size of every combination, so it stays readable as the product grows. In short: a statechart is a state machine that can nest states and run parts side by side, so shared behaviour is written once and independent features don't multiply.",
    });
    await s.clear({ runTime: 0.25 });
    {
      const UNIT = 0.2,
        X0 = -4.4;
      const RY = [2.35, 0.95, -0.45, -1.85];
      const flatCol = soft,
        regCol = hot;
      const bars = sizes.map((g, i) => {
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
        describe: `Bars for 2 to 5 on/off features. Flat states: ${sizes.map((g) => g.flatStates).join(', ')}. States drawn with regions: ${sizes.map((g) => g.regionStates).join(', ')}.`,
      });
      const legend = new Group(
        new Rectangle({ width: 0.5, height: 0.3, fill: flatCol, fillOpacity: 0.55, stroke: flatCol, strokeWidth: 0.03 }).moveTo([-6.8, -3.4]),
        words('Flat machine: one state per combination', [-6.4, -3.4], ink, 0.3, 'left'),
        new Rectangle({ width: 0.5, height: 0.3, fill: regCol, fillOpacity: 0.9, stroke: regCol, strokeWidth: 0.03 }).moveTo([0.6, -3.4]),
        words('Statechart: states drawn in regions', [1.0, -3.4], ink, 0.3, 'left'),
      );
      await s.enter(legend, { describe: 'Legend: in each pair, the upper grey bar is the flat machine, one state per combination, and the lower coloured bar is the statechart, states drawn in regions.' });
    }
  }
}
