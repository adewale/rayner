import { Scene, Rectangle, Text, Arrow, Group, Line, SurroundingRectangle, FadeOut } from '../../../src/index.ts';
import type { Vec } from '../../../src/index.ts';
import { stage } from '../../../explain/index.ts';
import {
  COFFEE,
  COFFEE_COPIED,
  PLAYER,
  booleanRun,
  bothTrue,
  flattenRegions,
  nameOf,
  runFlat,
  runRegions,
  startOf,
  type Region,
} from './model.ts';

/** How many arrows with this event a chart draws. */
const arrowsFor = (arrows: { event: string }[], event: string) => arrows.filter((a) => a.event === event).length;

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

    // Pieces of the picture. Every value shown comes from model.ts.
    const box = (name: string, at: Vec, w: number, h: number, lit = false) =>
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
    const frame = (at: Vec, w: number, h: number, color: string) =>
      new Rectangle({ width: w, height: h, cornerRadius: 0.16, stroke: color, strokeWidth: 0.03, fill: 'none' }).moveTo(at);
    const words = (text: string, at: Vec, color = soft, size = 0.28) => new Text(text, { fontSize: size, color }).moveTo(at);
    const pointer = (from: Vec, to: Vec) => new Arrow(from, to, { stroke: ink, strokeWidth: 0.03, tipLength: 0.2, tipWidth: 0.17 });
    const region = (name: string, cx: number, r: Region, lit: string) => {
      const [left, right] = r.states as [string, string];
      const fwd = r.arrows.find((a) => a.from === left)!,
        back = r.arrows.find((a) => a.from === right)!;
      return new Group(
        frame([cx, 0], 6.4, 3.2, soft),
        words(name, [cx, 1.2], soft, 0.28),
        box(left, [cx - 1.5, 0], 2.0, 0.9, lit === left),
        box(right, [cx + 1.5, 0], 2.0, 0.9, lit === right),
        pointer([cx - 0.5, 0.18], [cx + 0.5, 0.18]),
        pointer([cx + 0.5, -0.18], [cx - 0.5, -0.18]),
        words(fwd.event, [cx, 0.66], soft, 0.26),
        words(back.event, [cx, -0.66], soft, 0.26),
      );
    };

    // Values computed once from the model, shared by the steps below.
    const copiedArrows = arrowsFor(COFFEE_COPIED.arrows, 'POWER_OFF');
    const boxedArrows = arrowsFor(COFFEE.arrows, 'POWER_OFF');
    const events = ['PLAY', 'MUTE', 'PAUSE'];
    const flat = flattenRegions(PLAYER);
    const regionArrows = Object.values(PLAYER).reduce((n, r) => n + r.arrows.length, 0);
    const flatArrows = flat.arrows.length;
    const regionCombos = Object.values(PLAYER).reduce((n, r) => n * r.states.length, 1);
    const flatCombos = Object.keys(flat.parent).length;

    // 1. Definition.
    await this.step('definition', {
      title: 'States can nest, and can split into regions',
      line: 'Left: a parent with two children. Right: one state split into two regions.',
      caption:
        'A statechart is a state machine whose states can contain other states. It adds two things. A state can be a box of states, a parent. And a state can be split into regions, each in one state at the same time.',
    });
    const parent = new Group(
      frame([-3.95, 0.2], 6.0, 4.6, ink),
      words('on', [-6.4, 1.85], ink, 0.3),
      box('idle', [-5.2, 0.2], 2.0, 0.9),
      box('brewing', [-2.7, 0.2], 2.0, 0.9),
    );
    const split = new Group(
      frame([3.95, 0.2], 5.9, 4.6, ink),
      new Line([1.0, 0.2], [6.9, 0.2], { stroke: soft, strokeWidth: 0.03, dashArray: '0.1 0.08' }),
      words('playback', [3.95, 1.9], soft, 0.26),
      box('playing', [3.95, 1.1], 2.6, 0.8, true),
      words('volume', [3.95, -1.6], soft, 0.26),
      box('unmuted', [3.95, -0.9], 2.6, 0.8, true),
    );
    await s.enter(
      parent,
      split,
      words('a parent with child states', [-3.95, -2.75], soft, 0.28),
      words('one state, split into regions', [3.95, -2.75], soft, 0.28),
      { describe: 'A parent box, on, holding the child states idle and brewing; beside it one box split by a dashed line into two regions, playback (playing) and volume (unmuted), each with one lit state.' },
    );

    // 2. Copies.
    await this.step('copies', {
      title: 'Plain machines copy shared behaviour',
      line: `Four states, ${copiedArrows} POWER_OFF arrows, all to off.`,
      caption:
        'In a plain state machine, behaviour shared by many states must be copied onto each of them. Give a coffee machine a power button, and idle, grinding, brewing and ready each need their own POWER_OFF arrow. Predict before the next step: four states all need POWER_OFF. What would a statechart draw instead?',
    });
    await s.clear({ runTime: 0.5 });
    const ys = [2.0, 0.6, -0.8, -2.2];
    const states = new Group(...['idle', 'grinding', 'brewing', 'ready'].map((n, i) => box(n, [-5.0, ys[i]!], 2.0, 0.9)));
    const off = new Group(frame([4.5, 0], 2.0, 5.6, ink), words('off', [4.5, 0], ink, 0.3));
    const arrows = new Group(...ys.flatMap((y) => [pointer([-4.0, y], [3.5, y]), words('POWER_OFF', [-0.25, y + 0.3], soft, 0.26)]));
    await s.enter(states, off, arrows, {
      describe: `Four state boxes, idle, grinding, brewing and ready, each with its own arrow labelled POWER_OFF to a box called off; ${copiedArrows} POWER_OFF arrows in all.`,
    });

    // 3. The box.
    await this.step('box', {
      title: 'One arrow on the box covers all four',
      line: 'Brewing has no POWER_OFF, so the event goes up to on.',
      caption:
        "Put the four in a box called on, and one POWER_OFF on the box does the job. Any event its children don't handle goes to the parent. Brewing has no POWER_OFF, so the event goes up to on, and the arrow leaves from on.",
    });
    await this.play(new FadeOut(arrows, { runTime: 0.5 }));
    const onBox = new Group(frame([-5.0, 0.0], 2.8, 6.0, ink), words('on', [-5.0, 2.72], ink, 0.3));
    const boxArrow = new Group(pointer([-3.6, 0], [3.5, 0]), words('POWER_OFF', [-0.05, 0.3], soft, 0.26));
    const ring = new SurroundingRectangle(states.children[2]!, { buff: 0.1, cornerRadius: 0.17, stroke: hot, strokeWidth: 0.045 });
    await s.enter(onBox, boxArrow, ring, {
      describe: `The four states now sit in a box called on, with ${boxedArrows} POWER_OFF arrow leaving on for off. The brewing box is ringed, where the event starts.`,
    });

    // 4. Booleans and the four combinations.
    await this.step('booleans', {
      title: 'Two booleans can say playing and paused',
      line: 'After PLAY, PAUSE, PLAY the flags read both true, and no flat state does.',
      caption:
        'A player that is playing or paused, and muted or unmuted, needs one flat state per combination, four of them, and each new on/off feature doubles that. Booleans hide the same problem: isPlaying and isPaused can both be true, which should be impossible. Predict before the next step: why do two independent on/off features need four flat states, but only two regions?',
    });
    await s.clear({ runTime: 0.5 });
    const flags = booleanRun(['PLAY', 'PAUSE', 'PLAY']);
    const cellAt: Vec[] = [
      [-4.6, 1.2],
      [-0.9, 1.2],
      [-4.6, -0.6],
      [-0.9, -0.6],
    ];
    const grid = new Group(
      words('four flat states, one per combination', [-2.7, 2.25], soft, 0.28),
      ...Object.keys(flat.parent).map((name, i) => box(name, cellAt[i]!, 3.0, 1.0)),
    );
    await s.enter(grid, { describe: `Four flat state boxes: ${Object.keys(flat.parent).join(', ')}.` });
    const card = await s.card(
      [
        ['isPlaying', String(flags.isPlaying)],
        ['isPaused', String(flags.isPaused)],
        ['isMuted', String(flags.isMuted)],
      ],
      { at: [4.9, 0.4], width: 4.4, fontSize: 0.3, title: 'Flags after PLAY, PAUSE, PLAY' },
    );
    await card.mark('isPaused', { as: 'impossible' });
    await s.note('isPlaying and isPaused are both true, and no flat state is.');
    this.state.flags = { ...flags };
    this.state.bothTrue = bothTrue(flags);

    // 5. Regions.
    await this.step('regions', {
      title: 'Regions keep playback and volume apart',
      line: 'Each region holds one state; the lit one is where it is now.',
      caption:
        "Regions keep playback and volume apart, as two small machines side by side, so the impossible combination can't be written. A flat drawing lists every pair: 2 × 2 = 4 states. Regions keep two states per feature, and the pairs are whatever the two regions hold together. Predict before the next step: can a statechart do anything a state machine can't?",
    });
    await s.clear({ runTime: 0.5 });
    const start = startOf(PLAYER);
    await s.enter(
      region('playback', -3.9, PLAYER.playback!, start.playback!),
      region('volume', 3.9, PLAYER.volume!, start.volume!),
      {
        describe: `Two regions side by side. Playback has playing and paused, with ${PLAYER.playback!.arrows.map((a) => a.event).join(' and ')} between them, and is in ${start.playback}. Volume has unmuted and muted, with ${PLAYER.volume!.arrows.map((a) => a.event).join(' and ')} between them, and is in ${start.volume}.`,
      },
    );
    this.state.playback = start.playback;
    this.state.volume = start.volume;

    // 6. Flattening.
    await this.step('flatten', {
      title: 'Flattening keeps the behaviour',
      line: `Same events, same end state; ${regionArrows} arrows drawn for the regions, ${flatArrows} flat.`,
      caption:
        'Flatten any statechart and you get an ordinary state machine with the same behaviour, so nothing new becomes possible. What you gain is a drawing the size of the idea instead of the size of every combination, so shared behaviour is written once and independent features do not multiply. The limit: at run time the machine is still in one of the four combinations.',
    });
    await s.clear({ runTime: 0.5 });
    const regionsEnd = nameOf(runRegions(PLAYER, events));
    const flatEnd = runFlat(flat, nameOf(start), events);
    const endCard = await s.card(
      [
        ['Events', events.join(', ')],
        ['Ends in', regionsEnd, flatEnd],
        ['Arrows drawn', regionArrows, flatArrows],
        ['States it can be in', regionCombos, flatCombos],
      ],
      { columns: ['Regions', 'Flat'], width: 9.0, fontSize: 0.3 },
    );
    await endCard.mark('Ends in');
    this.state.endsIn = { regions: regionsEnd, flat: flatEnd };
  }
}
