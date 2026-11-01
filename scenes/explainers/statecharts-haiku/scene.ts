import { Scene, Rectangle, Text, Arrow, Group, Line, Circle, SurroundingRectangle, FadeOut } from '../../../src/index.ts';
import type { Vec, Mobject } from '../../../src/index.ts';
import { stage } from '../../../explain/index.ts';
import {
  COFFEE,
  COFFEE_COPIED,
  FROTHER,
  PLAYER,
  booleanRun,
  bothTrue,
  dispatchTrace,
  flagRows,
  flattenRegions,
  growthOf,
  nameOf,
  runFlat,
  runRegions,
  startOf,
  type Region,
} from './model.ts';

/** How many arrows with this event a chart draws. */
const arrowsFor = (arrows: { event: string }[], event: string) => arrows.filter((a) => a.event === event).length;

const READING_LABEL = { playing: 'Playing', paused: 'Paused', impossible: 'Both', neither: 'Neither' } as const;

export default class StatechartsHaiku extends Scene {
  static meta = {
    id: 'statecharts-haiku',
    title: 'What is a statechart, and why use one?',
    sources: ['https://doi.org/10.1016/0167-6423(87)90035-9'],
  };

  override async construct() {
    const s = stage(this, { style: 'nord', headingSize: 0.54 });
    const ink = s.palette.ink,
      soft = s.soft,
      hot = s.emphasis,
      paper = s.palette.paper;

    // Pieces of the picture, drawn the same way in every step. Every value shown comes from model.ts.
    const box = (name: string, at: Vec, w = 2.0, h = 0.9, lit = false) =>
      new Group(
        new Rectangle({
          width: w,
          height: h,
          cornerRadius: 0.12,
          stroke: lit ? hot : ink,
          strokeWidth: lit ? 0.05 : 0.03,
          fill: lit ? hot : paper,
          fillOpacity: lit ? 0.22 : 1,
        }).moveTo(at),
        new Text(name, { fontSize: 0.3, color: ink }).moveTo(at),
      );
    const frame = (at: Vec, w: number, h: number, color = ink) =>
      new Rectangle({ width: w, height: h, cornerRadius: 0.16, stroke: color, strokeWidth: 0.03, fill: 'none' }).moveTo(at);
    const words = (text: string, at: Vec, color = soft, size = 0.3) => new Text(text, { fontSize: size, color }).moveTo(at);
    const pointer = (from: Vec, to: Vec) => new Arrow(from, to, { stroke: ink, strokeWidth: 0.03, tipLength: 0.2, tipWidth: 0.17 });
    const badge = (n: number, at: Vec) =>
      new Group(
        new Circle({ radius: 0.24, stroke: hot, strokeWidth: 0.04, fill: paper, fillOpacity: 1 }).moveTo(at),
        new Text(String(n), { fontSize: 0.3, color: ink }).moveTo(at),
      );
    const ring = (m: Mobject) => new SurroundingRectangle(m, { buff: 0.1, cornerRadius: 0.17, stroke: hot, strokeWidth: 0.045 });

    // The parent 'on' and the 'off' box, as drawn in the first steps.
    const onParent = (at: Vec, w: number, h: number) => frame(at, w, h, ink);
    const offBox = () => new Group(frame([4.5, 0.15], 2.0, 5.4, ink), words('off', [4.5, 0.15], ink, 0.3));

    // Regions: one outer state split by a dashed line into two regions, side by side.
    const SPLIT = 2.25;
    const regionsFrame = () =>
      new Group(
        frame([SPLIT, 0.3], 10.3, 4.6, ink),
        words('player', [-2.1, 2.0], soft, 0.3),
        new Line([SPLIT, -1.9], [SPLIT, 2.5], { stroke: soft, strokeWidth: 0.03, dashArray: '0.1 0.08' }),
      );
    /** One region: its name, then its two states in a row, the lit one where it starts. */
    const regionBoxes = (name: string, cx: number, r: Region) => {
      const [left, right] = r.states as [string, string];
      return [
        words(name, [cx, 1.5], soft, 0.3),
        box(left, [cx - 1.45, 0.3], 1.7, 0.9, r.start === left),
        box(right, [cx + 1.45, 0.3], 1.7, 0.9, r.start === right),
      ];
    };
    /** The arrows between a region's two states: forward from the left one, back from the right one. */
    const regionArrows = (cx: number, r: Region) => {
      const [left, right] = r.states as [string, string];
      const fwd = r.arrows.find((a) => a.from === left)!,
        back = r.arrows.find((a) => a.from === right)!;
      return [
        pointer([cx - 0.6, 0.5], [cx + 0.6, 0.5]),
        pointer([cx + 0.6, 0.1], [cx - 0.6, 0.1]),
        words(fwd.event, [cx, 0.9], ink, 0.3),
        words(back.event, [cx, -0.3], ink, 0.3),
      ];
    };
    const REGION_CENTRES = { playback: SPLIT - 2.575, volume: SPLIT + 2.575 } as const;

    // Values computed once from the model, shared by the steps below.
    const copiedArrows = arrowsFor(COFFEE_COPIED.arrows, 'POWER_OFF');
    const boxedArrows = arrowsFor(COFFEE.arrows, 'POWER_OFF');
    const flat = flattenRegions(PLAYER);
    const regionArrowCount = Object.values(PLAYER).reduce((n, r) => n + r.arrows.length, 0);
    const flatArrowCount = flat.arrows.length;
    const flatStateCount = Object.keys(flat.parent).length;
    const start = startOf(PLAYER);
    const startName = nameOf(start);
    const stateX = -5.0;
    const ys = [1.8, 0.5, -0.8, -2.1];
    const names = ['idle', 'grinding', 'brewing', 'ready'];

    // 1. Definition: a parent holds children, and a split state holds regions.
    await this.step('definition', {
      title: 'States can nest, and can split into regions',
      line: 'Left: a parent holds children. Right: one state split into regions.',
      caption:
        'A statechart is a state machine whose states can contain other states. It adds two things. A state can be a box of states, a parent, and any event its children don\'t handle goes to the parent. And a state can be split into regions, each in one state at the same time.',
    });
    const parent = new Group(
      onParent([-5.4, 0.3], 3.6, 4.6),
      words('on', [-6.9, 2.0], ink, 0.3),
      box('idle', [-5.4, 1.1], 1.9, 0.9),
      box('brewing', [-5.4, -0.6], 1.9, 0.9),
      words('a parent: children inside', [-5.4, -2.5], soft, 0.3),
    );
    const split = new Group(
      regionsFrame(),
      ...regionBoxes('playback', REGION_CENTRES.playback, PLAYER.playback!),
      ...regionBoxes('volume', REGION_CENTRES.volume, PLAYER.volume!),
      words('one state, split into regions', [SPLIT, -2.5], soft, 0.3),
    );
    await s.enter(parent, split, {
      describe: 'A parent box, on, holding idle and brewing. Beside it a box, player, split by a dashed line into two regions, playback (playing, paused) and volume (unmuted, muted), with one lit state in each.',
    });
    await s.note('Lit: the state each region is in now.', { size: 0.3 });

    // 2. Copies: each state needs its own POWER_OFF arrow in a plain machine.
    await this.step('copies', {
      title: 'Plain machines copy shared behaviour',
      line: 'Predict: what would a statechart draw instead?',
      caption:
        'In a plain state machine, behaviour shared by many states must be copied onto each of them. Give a coffee machine a power button, and idle, grinding, brewing and ready each need their own POWER_OFF arrow. The card counts the arrows: four in the plain machine.',
    });
    await s.clear({ runTime: 0.5 });
    const states = new Group(...names.map((n, i) => box(n, [stateX, ys[i]!], 2.0, 0.9)));
    const off = offBox();
    const copiedPointers = new Group(...ys.flatMap((y) => [pointer([-3.95, y], [3.45, y]), words('POWER_OFF', [-0.25, y + 0.3], ink, 0.3)]));
    await s.enter(states, off, copiedPointers, {
      describe: `Four state boxes, idle, grinding, brewing and ready, each with its own arrow labelled POWER_OFF to a box called off; ${copiedArrows} POWER_OFF arrows in all.`,
    });
    const countCard = await s.card([['POWER_OFF arrows', copiedArrows, '–']], {
      columns: ['Plain machine', 'Statechart'],
      at: [-0.4, -3.6],
      width: 8.0,
      fontSize: 0.44,
    });

    // 3. The box: one arrow on the parent covers its children.
    await this.step('box', {
      title: 'One POWER_OFF on the box covers all four',
      line: 'The four states sit inside on, so one arrow leaves on.',
      caption:
        'Answer to the prediction: one POWER_OFF on the box does the job. Any event its children don\'t handle goes to the parent, so the four states need no arrow of their own. The card now counts one.',
    });
    await this.play(new FadeOut(copiedPointers, { runTime: 0.5 }));
    const onBox = new Group(onParent([stateX, 0.15], 2.8, 6.0), words('on', [stateX, 2.8], ink, 0.3));
    const boxArrow = new Group(pointer([-3.6, 0.15], [3.45, 0.15]), words('POWER_OFF', [-0.05, 0.45], ink, 0.3));
    await s.enter(onBox, boxArrow, {
      describe: `The four states sit in a box called on, with ${boxedArrows} POWER_OFF arrow leaving on for off.`,
    });
    await countCard.set({ 'POWER_OFF arrows': [copiedArrows, boxedArrows] });
    this.state.powerOffArrows = { plain: copiedArrows, statechart: boxedArrows };

    // 4. Dispatch: the trace an event follows when the child has no arrow.
    await this.step('dispatch', {
      title: 'POWER_OFF while brewing goes up to on',
      line: 'Brewing has no arrow for it, so the check moves to on.',
      caption:
        'Follow one POWER_OFF that arrives while the machine is brewing. 1. brewing has no POWER_OFF arrow, so the event moves to its parent. 2. on has one, so the machine goes to off. The card lists the checks in order.',
    });
    await this.play(new FadeOut(countCard, { runTime: 0.4 }));
    const hops = dispatchTrace(COFFEE, 'brewing', 'POWER_OFF');
    const brewingBox = states.children[2]!;
    const trace = await s.card(
      hops.map((h, i) => [`${i + 1}. ${h.state}`, h.handles ? 'has one: goes to off' : 'no POWER_OFF arrow']),
      { at: [-0.4, -3.45], width: 8.0, fontSize: 0.44 },
    );
    await trace.mark(`2. on`, { as: 'handles it' });
    await s.enter(ring(brewingBox), badge(1, [-6.95, ys[2]!]), badge(2, [-3.1, 2.9]), {
      describe: 'The brewing box is ringed, with a numbered badge 1 beside it. A numbered badge 2 sits by the on box, which handles the event.',
    });
    this.state.dispatch = hops;

    // 5. Features multiply: a flat state for every combination.
    await this.step('features', {
      title: 'Two on/off features need four flat states',
      line: 'Predict: why four flat states, but only two regions?',
      caption:
        'A player that is playing or paused, and muted or unmuted, needs one flat state per combination, four of them. Each new on/off feature doubles that. Booleans hide the same problem in the next step.',
    });
    await s.clear({ runTime: 0.5 });
    const cell = (playback: string, volume: string): Vec => [volume === 'unmuted' ? -2.6 : 2.6, playback === 'playing' ? 1.6 : -1.6];
    const gridBoxes = () =>
      new Group(
        ...PLAYER.playback!.states.flatMap((pb) =>
          PLAYER.volume!.states.map((vol) => box(nameOf({ playback: pb, volume: vol }), cell(pb, vol), 3.0, 1.0)),
        ),
      );
    await s.enter(gridBoxes(), words('one box per pair: playback and volume', [0, 2.8], soft, 0.3), words(`2 × 2 = ${flatStateCount} flat states`, [0, -2.8], ink, 0.3), {
      describe: `Four flat state boxes in a square: ${Object.keys(flat.parent).join(', ')}.`,
    });
    this.state.flatStates = flatStateCount;

    // 6. Booleans: four flag pairs, one of them impossible.
    await this.step('booleans', {
      title: 'Two booleans can say playing and paused at once',
      line: 'Both true is the row the regions cannot hold.',
      caption:
        'Booleans hide the same problem. A PLAY handler sets isPlaying to true and does not clear isPaused, so PLAY, PAUSE, PLAY leaves both true. Two flags make four rows. Only playing and paused name a state the player can be in. The neither row names none.',
    });
    await s.clear({ runTime: 0.5 });
    const flags = booleanRun(['PLAY', 'PAUSE', 'PLAY']);
    const table = await s.card(
      flagRows().map((r) => [READING_LABEL[r.reading], String(r.isPlaying), String(r.isPaused), r.reading === 'neither' ? 'neither?' : r.reading]),
      { columns: ['isPlaying', 'isPaused', 'Means'], width: 9.4, fontSize: 0.44, title: 'Every pair of the two flags' },
    );
    await table.mark('Both', { as: 'impossible' });
    await s.note(`After PLAY, PAUSE, PLAY: isPlaying ${flags.isPlaying}, isPaused ${flags.isPaused}.`, { size: 0.3 });
    this.state.flags = { ...flags };
    this.state.bothTrue = bothTrue(flags);

    // 7. Regions: the same two features, with one lit state per region.
    await this.step('regions', {
      title: 'Regions keep playback and volume apart',
      line: 'Predict: can a statechart do anything a state machine can\'t?',
      caption:
        'Regions keep playback and volume apart, as two small machines side by side, so the impossible row can\'t be written: each region holds one lit state. Answer to the prediction: a flat machine needs a box for every pair, while a statechart needs one region per feature.',
    });
    await s.clear({ runTime: 0.5 });
    await s.enter(
      regionsFrame(),
      ...regionBoxes('playback', REGION_CENTRES.playback, PLAYER.playback!),
      ...regionBoxes('volume', REGION_CENTRES.volume, PLAYER.volume!),
      ...regionArrows(REGION_CENTRES.playback, PLAYER.playback!),
      ...regionArrows(REGION_CENTRES.volume, PLAYER.volume!),
      {
        describe: `Two regions side by side in one box. Playback has playing and paused, with ${PLAYER.playback!.arrows.map((a) => a.event).join(' and ')} between them, and is in ${start.playback}. Volume has unmuted and muted, with ${PLAYER.volume!.arrows.map((a) => a.event).join(' and ')} between them, and is in ${start.volume}.`,
      },
    );
    await s.note('Lit: the state each region is in now.', { size: 0.3 });
    await s.enter(words(`Two regions, ${regionArrowCount} arrows. One flat machine would draw ${flatArrowCount}.`, [2.25, -2.5], ink, 0.3));
    this.state.regions = { ...start };

    // 8. Flattening: the regions as one flat machine.
    await this.step('flatten', {
      title: 'Flattening keeps the behaviour',
      line: 'Each region arrow is copied into both states of the other region.',
      caption: `Flatten any statechart and you get an ordinary state machine with the same behaviour. Answer to the prediction: no. A common belief is that statecharts can do more than state machines. They cannot. The limit: at any moment the machine is in one of its ${flatStateCount} boxes, and the flat drawing has ${flatArrowCount} arrows where the regions draw ${regionArrowCount}.`,
    });
    await s.clear({ runTime: 0.5 });
    const W = 3.0,
      H = 1.0;
    const gridArrows = flat.arrows.map((arrow) => {
      const a = cell(...(arrow.from.split(' · ') as [string, string])),
        b = cell(...(arrow.to.split(' · ') as [string, string]));
      if (a[1] === b[1]) {
        const right = a[0] < b[0];
        const y = a[1] + (right ? 0.25 : -0.25);
        const x0 = right ? a[0] + W / 2 : a[0] - W / 2,
          x1 = right ? b[0] - W / 2 : b[0] + W / 2;
        return new Group(pointer([x0, y], [x1, y]), words(arrow.event, [(x0 + x1) / 2, y + (right ? 0.3 : -0.3)], ink, 0.3));
      }
      const down = a[1] > b[1];
      const x = a[0] + (down ? -0.3 : 0.3);
      const y0 = down ? a[1] - H / 2 : a[1] + H / 2,
        y1 = down ? b[1] + H / 2 : b[1] - H / 2;
      return new Group(pointer([x, y0], [x, y1]), words(arrow.event, [x + (down ? -0.75 : 0.75), (y0 + y1) / 2], ink, 0.3));
    });
    await s.enter(gridBoxes(), new Group(...gridArrows), {
      describe: `The same four boxes with ${flatArrowCount} arrows, each labelled with its event: each region arrow appears twice, once from each state of the other region.`,
    });
    await s.note(`The regions drew ${regionArrowCount} arrows; the flat machine draws ${flatArrowCount}.`, { size: 0.3 });
    this.state.arrows = { regions: regionArrowCount, flat: flatArrowCount };

    // 9. Same events, same end state, row by row.
    await this.step('same-events', {
      title: 'Same events, same end state, row by row',
      line: 'Read across: each row is the same state in both machines.',
      caption:
        'Five events run through both machines. Each row gives the regions\' state, the flat state, and whether they match. The fifth PAUSE finds no arrow out of paused, so both machines stay where they are.',
    });
    await s.clear({ runTime: 0.5 });
    const events = ['PLAY', 'MUTE', 'PAUSE', 'UNMUTE', 'PAUSE'];
    const rows = events.map((event, i) => {
      const prefix = events.slice(0, i + 1);
      const regionsNow = nameOf(runRegions(PLAYER, prefix)),
        flatNow = runFlat(flat, startName, prefix);
      return { label: `${i + 1}. ${event}`, regionsNow, flatNow, same: regionsNow === flatNow };
    });
    const sameCard = await s.card(
      rows.map((r) => [r.label, r.regionsNow, r.flatNow, r.same ? 'same' : 'differs']),
      { columns: ['Regions', 'Flat', 'Match'], width: 11.0, fontSize: 0.44 },
    );
    await sameCard.mark('5. PAUSE', { as: 'no arrow, stays' });
    this.state.rows = rows.map((r) => `${r.label}: ${r.regionsNow} / ${r.flatNow}`);

    // 10. Pattern beyond the example: bars for two to five features.
    await this.step('grow', {
      title: 'Flat states double; regions add two per feature',
      line: 'Left bar of each pair: flat states. Right bar: region states.',
      caption:
        'The same count for more features, from the model. A flat machine has one box per combination, so 2, 3, 4 and 5 features need 4, 8, 16 and 32 boxes. Regions have two states per feature, so they need 4, 6, 8 and 10.',
    });
    await s.clear({ runTime: 0.5 });
    const scale = 2.4 / 32,
      base = -2.4;
    const counts = [2, 3, 4, 5].map((n) => ({ n, ...growthOf(n) }));
    const bars = counts.flatMap((c, i) => {
      const cx = -4.5 + i * 3.0;
      const flatH = c.flat * scale,
        regionH = c.regions * scale;
      return [
        new Rectangle({ width: 0.8, height: flatH, stroke: hot, strokeWidth: 0.03, fill: hot, fillOpacity: 0.5 }).moveTo([cx - 0.45, base + flatH / 2]),
        new Rectangle({ width: 0.8, height: regionH, stroke: ink, strokeWidth: 0.03, fill: ink, fillOpacity: 0.25 }).moveTo([cx + 0.45, base + regionH / 2]),
        words(String(c.flat), [cx - 0.45, base + flatH + 0.3], ink, 0.3),
        words(String(c.regions), [cx + 0.45, base + regionH + 0.3], ink, 0.3),
        words(`${c.n} features`, [cx, -2.95], soft, 0.3),
      ];
    });
    await s.enter(new Line([-6.2, base], [6.2, base], { stroke: soft, strokeWidth: 0.03 }), new Group(...bars), {
      describe: `Bars for two to five features. Flat states: ${counts.map((c) => c.flat).join(', ')}. Region states: ${counts.map((c) => c.regions).join(', ')}.`,
    });
    this.state.growth = counts.map((c) => ({ features: c.n, flat: c.flat, regions: c.regions }));

    // 11. Transfer, ask first: a milk frother that can switch on or off at any time.
    await this.step('transfer-ask', {
      title: 'A milk frother can be on or off at any time',
      line: 'Predict: where does it go, and what happens to the flat count?',
      caption:
        'Transfer: add a milk frother to the coffee machine. It can switch on or off whatever the coffee is doing. The coffee cycle is drawn on the left, going round from idle to ready and back. Predict before the next step.',
    });
    await s.clear({ runTime: 0.5 });
    const C = { top: 1.0, bottom: -0.9, left: -4.4, right: -1.2 };
    const coffeeStates = [
      box('idle', [C.left, C.top]),
      box('grinding', [C.right, C.top]),
      box('brewing', [C.right, C.bottom]),
      box('ready', [C.left, C.bottom]),
    ];
    const cycle = new Group(
      frame([-2.8, 0.05], 8.0, 3.7, soft),
      words('coffee', [-1.9, 2.05], soft, 0.3),
      ...coffeeStates,
      pointer([C.left + 1.0, C.top], [C.right - 1.0, C.top]),
      words('START', [-2.8, C.top + 0.3], ink, 0.3),
      pointer([C.right, C.top - 0.55], [C.right, C.bottom + 0.45]),
      words('GROUND', [C.right + 0.9, 0.05], ink, 0.3),
      pointer([C.right - 1.0, C.bottom], [C.left + 1.0, C.bottom]),
      words('BREWED', [-2.8, C.bottom - 0.7], ink, 0.3),
      pointer([C.left, C.bottom + 0.45], [C.left, C.top - 0.55]),
      words('TAKE', [C.left - 0.9, 0.05], ink, 0.3),
    );
    const placeholder = new Group(
      new Rectangle({ width: 3.6, height: 1.6, cornerRadius: 0.16, stroke: soft, strokeWidth: 0.03, fill: 'none', dashArray: '0.12 0.08' }).moveTo([3.5, 0.05]),
      words('milk frother: where?', [3.5, 0.05], soft, 0.3),
    );
    await s.enter(cycle, placeholder, {
      describe: 'The coffee cycle as four boxes, idle, grinding, brewing and ready, joined by START, GROUND, BREWED and TAKE. Beside it a dashed box reads milk frother: where?',
    });

    // 12. Transfer, reveal: the frother is a second region, and the flat count doubles.
    await this.step('transfer-reveal', {
      title: 'A second region, and the flat count doubles',
      line: `Regions: ${Object.values(FROTHER).reduce((n, r) => n + r.states.length, 0)} states. Flat: ${Object.keys(flattenRegions(FROTHER).parent).length} states.`,
      caption:
        'Answer to the prediction: the frother is a second region of on, beside the coffee cycle, not four more arrows. It can switch in any coffee state, so its two arrows are copied into all four. Regions add two states; the flat machine multiplies to eight states and sixteen arrows.',
    });
    await s.clear({ runTime: 0.5 });
    const fl = flattenRegions(FROTHER);
    const frotherRegionArrows = Object.values(FROTHER).reduce((n, r) => n + r.arrows.length, 0);
    const outerX = 0.15;
    const frotherX = 4.1;
    const revealCycle = new Group(
      frame([outerX, 0.2], 13.5, 4.2, ink),
      words('on', [-6.4, 2.0], ink, 0.3),
      new Line([1.3, -1.6], [1.3, 2.0], { stroke: soft, strokeWidth: 0.03, dashArray: '0.1 0.08' }),
      ...coffeeStates,
      pointer([C.left + 1.0, C.top], [C.right - 1.0, C.top]),
      words('START', [-2.8, C.top + 0.3], ink, 0.3),
      pointer([C.right, C.top - 0.55], [C.right, C.bottom + 0.45]),
      words('GROUND', [C.right + 0.9, 0.05], ink, 0.3),
      pointer([C.right - 1.0, C.bottom], [C.left + 1.0, C.bottom]),
      words('BREWED', [-2.8, C.bottom - 0.7], ink, 0.3),
      pointer([C.left, C.bottom + 0.45], [C.left, C.top - 0.55]),
      words('TAKE', [C.left - 0.9, 0.05], ink, 0.3),
      words('coffee', [-2.8, 1.9], soft, 0.3),
    );
    const frotherRegion = new Group(
      box('off', [frotherX, 1.0], 1.6, 0.9, true),
      box('on', [frotherX, -0.9], 1.6, 0.9),
      pointer([frotherX - 0.3, 0.55], [frotherX - 0.3, -0.45]),
      words('FROTH_ON', [frotherX - 1.65, 0.05], ink, 0.3),
      pointer([frotherX + 0.3, -0.45], [frotherX + 0.3, 0.55]),
      words('FROTH_OFF', [frotherX + 1.65, 0.05], ink, 0.3),
      words('frother', [frotherX, 1.9], soft, 0.3),
    );
    await s.enter(revealCycle, frotherRegion, {
      describe: 'One box, on, holds two regions side by side. The coffee region is the four-state cycle. The frother region has off and on, with FROTH_ON and FROTH_OFF between them, and is in off.',
    });
    const frotherCard = await s.card(
      [
        ['States', Object.values(FROTHER).reduce((n, r) => n + r.states.length, 0), Object.keys(fl.parent).length],
        ['Arrows', frotherRegionArrows, fl.arrows.length],
      ],
      { columns: ['Regions', 'Flat'], at: [0.2, -3.25], width: 7.0, fontSize: 0.44 },
    );
    await frotherCard.mark('States');
    this.state.frother = {
      regionStates: Object.values(FROTHER).reduce((n, r) => n + r.states.length, 0),
      flatStates: Object.keys(fl.parent).length,
      regionArrows: frotherRegionArrows,
      flatArrows: fl.arrows.length,
    };

    // 13. Close on the sentence to remember, visible on screen.
    await this.step('close', {
      title: 'The sentence to remember',
      line: 'The idea, not every combination, is what you draw.',
      caption:
        'Copies, a box and regions are three drawings of one idea. The flat machine is the one that grows with every combination. The statechart stays the size of the idea.',
    });
    await s.clear({ runTime: 0.5 });
    const sentence = [
      'A statechart is a state machine that can nest states',
      'and run parts side by side, so shared behaviour',
      'is written once and independent features',
      "don't multiply.",
    ];
    await s.enter(
      words('the sentence to remember', [0, 2.6], soft, 0.3),
      new Group(...sentence.map((line, i) => new Text(line, { fontSize: 0.44, color: ink }).moveTo([0, 1.5 - i * 0.9]))),
      { describe: `The sentence to remember: ${sentence.join(' ')}` },
    );
  }
}
