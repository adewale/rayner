import { Scene, Group, Line, Rectangle, FadeIn, FadeOut, Transform } from '../../../src/index.ts';
import type { Mobject, Vec } from '../../../src/index.ts';
import { stage, settingsOf, regionBox } from '../../../explain/index.ts';
import type { Card } from '../../../explain/panels.ts';
import { agree, coffee, coffeeRing, counts, flatStep, flatten, growth, initialConfig, lookup, player, REGION_SPECS, run, send } from './model.ts';
import type { Button, Chart } from './model.ts';
import { arrow, attach, chip, frame, here, label, polyArrow, stateBox } from './draw.ts';
import type { Look, Rect } from './draw.ts';

// ---- the coffee machine's layout: a column of four states, `off` to the right ----
const CX = -3.5,
  W = 3.0,
  H = 0.9;
const NAMES = ['idle', 'grinding', 'brewing', 'ready'] as const;
const ROW_Y = [2.25, 0.75, -0.75, -2.25];
const SPOT: Record<string, Rect> = {
  ...Object.fromEntries(NAMES.map((n, i) => [n, { cx: CX, cy: ROW_Y[i]!, w: W, h: H }])),
  off: { cx: 1.3, cy: 0, w: 1.5, h: 0.9 },
};
const OFF = SPOT.off!;
const ON_BOX: Rect = { cx: -3.9, cy: 0, w: 6.1, h: 6.3 };
const BOX_RIGHT = ON_BOX.cx + ON_BOX.w / 2;
const OFF_LEFT = OFF.cx - OFF.w / 2;

const SIDE_TOP = regionBox('side', { bottom: 1.15 });
const SIDE_BELOW = regionBox('side', { top: 0.85 });
const SCORE = { columns: ['Flat', 'Statechart'], align: 'top', width: 4.9, fontSize: 0.3 } as const;
const group = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const COLORS = ['#0b7285', '#7048e8', '#2b8a3e'];
const FLAT_BAR = '#495057',
  CHART_BAR = '#1971c2';

export default class StatechartsFresh extends Scene {
  static meta = {
    id: 'statecharts-fresh',
    title: 'What does a statechart add to a state machine?',
    sources: [
      'https://x.com/DavidKPiano',
      'https://www.wisdom.weizmann.ac.il/~harel/papers/Statecharts.pdf',
    ],
    watch: { current: 'Now in', flatStates: 'Flat states', flatArrows: 'Flat arrows', chartArrows: 'Chart arrows' },
  };
  static settings = [
    {
      id: 'button',
      label: 'Coffee machine: new button',
      default: 'power',
      options: [
        { value: 'power', label: 'POWER_OFF' },
        { value: 'back', label: 'BACK' },
      ],
    },
    {
      id: 'regions',
      label: 'Media player: regions',
      default: 'two',
      options: [
        { value: 'two', label: 'Play, sound' },
        { value: 'three', label: 'Play, sound, loop' },
      ],
    },
  ];

  override async construct() {
    const settings = settingsOf(this);
    const button = settings.button as Button;
    const s = stage(this, { style: 'hand-drawn', headingSize: 0.5 });
    const look: Look = { ink: s.palette.ink, soft: s.soft, paper: s.palette.paper, emphasis: s.emphasis };
    const EDGE = s.palette.ink;
    let words = '';
    const said = () => words;
    const keep = <T extends Mobject>(first: T, ...rest: Mobject[]): T => s.keep(first, ...rest, { describe: said });
    const fade = (...mobs: Mobject[]) => mobs.map((m) => new FadeIn(m, { runTime: 0.5 }));
    const gone = (...mobs: Mobject[]) => mobs.map((m) => new FadeOut(m, { runTime: 0.4 }));
    const pair = (a: unknown, b: unknown): [unknown, unknown] => [a, b];
    const note = (o: Record<string, unknown>) => Object.assign(this.state, o);

    // ---- the models this page draws -------------------------------------------------
    const power = button === 'power';
    const chart = coffee(button);
    const flat = flatten(chart);
    const ringCounts = counts(coffeeRing());
    const full = counts(chart);
    const sequences = agree(chart, flat, 4);

    /** Every piece of the coffee machine, freshly drawn (a mobject that has faded out is not reused). */
    const coffeeParts = () => {
      const states: Record<string, Group> = {};
      for (const n of NAMES) states[n] = keep(stateBox(look, n, SPOT[n]!, { size: 0.3 }));
      const fwdX = power ? CX : CX - 0.9;
      const forward = (from: number, event: string) => {
        const a: Vec = [fwdX, ROW_Y[from]! - H / 2],
          b: Vec = [fwdX, ROW_Y[from + 1]! + H / 2];
        return keep(new Group(arrow({ a, b, color: EDGE }), label(look, event, [fwdX + 0.12, (a[1] + b[1]) / 2], { anchor: 'start' })));
      };
      const take = keep(
        new Group(
          arrow({ a: [CX - W / 2, ROW_Y[3]!], b: [CX - W / 2, ROW_Y[0]!], bend: -1.52, color: EDGE }),
          label(look, 'TAKE', [CX - W / 2 - 0.98, 0], { anchor: 'end' }),
        ),
      );
      const ring = [forward(0, 'START'), forward(1, 'GROUND'), forward(2, 'BREWED'), take];
      const off = keep(stateBox(look, 'off', OFF, { size: 0.3 }));
      // The flat power button: a POWER_OFF out of every state, and POWER_ON back to idle.
      const offFan = NAMES.map((n, i) => {
        const a: Vec = [CX + W / 2, ROW_Y[i]!],
          b: Vec = [OFF_LEFT, [0.33, 0.11, -0.11, -0.33][i]!];
        const above = i < 2 ? 0.2 : -0.22;
        return keep(new Group(arrow({ a, b, color: EDGE }), label(look, 'POWER_OFF', [a[0] + 0.14, a[1] + (b[1] - a[1]) * 0.06 + above], { anchor: 'start' })));
      });
      const onFlat = keep(
        new Group(
          polyArrow([[OFF.cx, OFF.h / 2], [OFF.cx, 2.85], [CX + 0.7, 2.85], [CX + 0.7, ROW_Y[0]! + H / 2]], EDGE),
          label(look, 'POWER_ON', [-0.4, 3.04]),
        ),
      );
      // BACK: one step back from every state but the first, each to a different target.
      const backs = [1, 2, 3].map((i) => {
        const x = CX + 0.9;
        const a: Vec = [x, ROW_Y[i]! + H / 2],
          b: Vec = [x, ROW_Y[i - 1]! - H / 2];
        return keep(new Group(arrow({ a, b, color: EDGE }), label(look, 'BACK', [x + 0.12, (a[1] + b[1]) / 2], { anchor: 'start' })));
      });
      // The statechart's box and its single arrows.
      const onBox = keep(
        new Group(
          frame(ON_BOX, { color: look.soft, width: 0.045, radius: 0.3 }),
          label(look, power ? 'on' : 'machine', [ON_BOX.cx - ON_BOX.w / 2 + 0.3, ON_BOX.cy + ON_BOX.h / 2 - 0.3], { size: 0.32, color: look.ink, weight: 'bold', anchor: 'start' }),
        ),
      );
      const offOne = keep(
        new Group(arrow({ a: [BOX_RIGHT, 0.25], b: [OFF_LEFT, 0.25], color: EDGE }), label(look, 'POWER_OFF', [(BOX_RIGHT + OFF_LEFT) / 2, 0.47])),
      );
      const onOne = keep(
        new Group(arrow({ a: [OFF_LEFT, -0.25], b: [BOX_RIGHT, -0.25], color: EDGE }), label(look, 'POWER_ON', [(BOX_RIGHT + OFF_LEFT) / 2, -0.48])),
      );
      // The history marker inside the box, and POWER_ON aimed at it.
      const HC: Vec = [BOX_RIGHT - 0.5, -0.25];
      const hMark = keep(new Group(frame({ cx: HC[0], cy: HC[1], w: 0.56, h: 0.56 }, { color: EDGE, width: 0.04, radius: 0.28 }), label(look, 'H', HC, { size: 0.3, color: look.ink, weight: 'bold' })));
      const onH = keep(
        new Group(arrow({ a: [OFF_LEFT, -0.25], b: [HC[0] + 0.3, -0.25], color: EDGE }), label(look, 'POWER_ON', [(BOX_RIGHT + OFF_LEFT) / 2, -0.48])),
      );
      // BACK given to the box: it has no single place to go.
      const backQuestion = keep(
        new Group(
          arrow({ a: [BOX_RIGHT, 0], b: [OFF.cx - 0.4, 0], color: s.bad }),
          label(look, 'BACK', [(BOX_RIGHT + OFF.cx - 0.4) / 2, 0.24], { color: s.bad }),
          chip(look, '?', [OFF.cx, 0], s.bad, 0.38),
        ),
      );
      const mark = keep(here(look, SPOT.idle!));
      return { states, ring, off, offFan, onFlat, backs, onBox, offOne, onOne, hMark, onH, backQuestion, mark };
    };
    const at = (name: string) => here(look, SPOT[name]!);
    let scoreboard!: Card;

    // =====================================================================================
    // Act 1: the coffee machine
    // =====================================================================================
    const C = coffeeParts();
    await this.step('ring', {
      title: 'Four states, four arrows',
      line: 'Each arrow is the event that moves the machine on.',
      caption:
        'A coffee machine as a plain state machine. One state is current (outlined), and each arrow names the event that moves it to the next. This drawing is already a statechart, one with no nesting, so both columns of the scoreboard count the same: four states, four arrows.',
    });
    words = 'A coffee machine with four states in a column, idle, grinding, brewing and ready. START leads from idle to grinding, GROUND to brewing, BREWED to ready, and TAKE from ready back to idle. The machine is in idle.';
    this.state = { current: 'idle', flatStates: ringCounts.flatStates, flatArrows: ringCounts.flatArrows, chartArrows: ringCounts.chartArrows };
    await this.play(...fade(...NAMES.map((n) => C.states[n]!), ...C.ring, C.mark));
    scoreboard = await s.card(
      [
        ['States', ringCounts.flatStates, ringCounts.chartStates],
        ['Arrows', ringCounts.flatArrows, ringCounts.chartArrows],
      ],
      { ...SCORE, at: SIDE_TOP },
    );

    if (power) {
      await this.step('button', {
        title: 'A power button costs five arrows',
        line: 'POWER_OFF means the same everywhere, but is drawn per state.',
        caption: `To switch off from any state, each state needs its own POWER_OFF arrow, because a state only knows the arrows that leave it. POWER_ON adds one more and off adds a state: ${full.flatArrows} arrows for ${full.flatStates} states. A sixth state tomorrow means another POWER_OFF.`,
      });
      words = 'The same coffee machine with a fifth state, off, on the right. A POWER_OFF arrow leaves each of the four states and all four meet at off, and a POWER_ON arrow runs from off over the top back to idle.';
      note({ flatStates: full.flatStates, flatArrows: full.flatArrows, chartArrows: full.flatArrows });
      await this.play(...fade(C.off, ...C.offFan, C.onFlat));
      await scoreboard.set({ States: pair(full.flatStates, full.flatStates), Arrows: pair(full.flatArrows, full.flatArrows) });
      await scoreboard.mark('Arrows');
    } else {
      await this.step('button', {
        title: 'BACK costs three arrows',
        line: 'One button, but each BACK leads somewhere different.',
        caption: `BACK steps one state back: grinding to idle, brewing to grinding, ready to brewing. It is one button but three arrows with three different targets: ${full.flatArrows} arrows for ${full.flatStates} states.`,
      });
      words = 'The same coffee machine with three BACK arrows pointing up: grinding to idle, brewing to grinding, and ready to brewing, beside the forward arrows.';
      note({ flatArrows: full.flatArrows, chartArrows: full.flatArrows });
      await this.play(...fade(...C.backs));
      await scoreboard.set({ Arrows: pair(full.flatArrows, full.flatArrows) });
      await scoreboard.mark('Arrows');
    }

    if (power) {
      await this.step('group', {
        title: 'One box, one POWER_OFF',
        line: 'The box stands for whichever of its states is current.',
        caption: `Put the four states in a box called on and hang POWER_OFF on the box: it applies whichever state inside is current. POWER_ON enters the box and starts at its first state, idle. ${full.chartArrows} arrows instead of ${full.flatArrows}, and a sixth state adds none for the button.`,
      });
      words = 'The four states sit inside a box called on. One POWER_OFF arrow leaves the box for off and one POWER_ON arrow returns to the box. The machine is still in idle.';
      note({ chartArrows: full.chartArrows });
      await this.play(...gone(...C.offFan, C.onFlat), ...fade(C.onBox, C.offOne, C.onOne));
      await scoreboard.set({ Arrows: pair(full.flatArrows, full.chartArrows) });
    } else {
      await this.step('group', {
        title: 'A box cannot hold BACK',
        line: 'One arrow cannot have three different targets.',
        caption: `Try the same move: box the four states and hang BACK on the box. Where would it go? Each state's BACK leads somewhere different, so the box has nothing to say for them, and all three arrows stay: ${full.chartArrows} arrows either way. Grouping only helps with what states share.`,
      });
      words = 'The four states sit inside a box. A red BACK arrow from the box leads to a question mark, because the three BACK arrows inside have different targets. The three BACK arrows remain.';
      await this.play(...fade(C.onBox, C.backQuestion));
    }

    // ---- the lookup: who answers an event? ----
    const events = power ? ['START', 'GROUND', 'POWER_OFF'] : ['START', 'GROUND', 'BACK'];
    await this.step('lookup', {
      title: power ? 'The innermost state answers first' : 'Each state answers its own BACK',
      line: power ? 'No arrow here? Ask the parent.' : 'A parent is asked only when its child has no arrow.',
      caption: power
        ? 'Run START, GROUND, then POWER_OFF while brewing. The event is offered to brewing first (1): it has no POWER_OFF arrow, so it goes up to on (2), which does, and the machine leaves for off. A parent handles the events its children do not; a child with its own POWER_OFF would win.'
        : 'Run START, GROUND, then BACK while brewing. brewing has its own BACK arrow (1), so the event goes no further and the machine lands in grinding. Lookup always starts at the innermost state; the parent matters only when the child has nothing to say.',
    });
    const lookupCard = await s.card(
      [
        ['Event', '–'],
        ['Asked first', '–'],
        ['Asked next', '–'],
        ['Moves to', '–'],
      ],
      { at: SIDE_BELOW, align: 'top', width: 4.9, fontSize: 0.27 },
    );
    let cfg = initialConfig(chart);
    const verdict = (name: string, from: string | undefined) => `${name}: ${name === from ? 'has it' : 'none'}`;
    let asked: string[] = [];
    for (const ev of events) {
      const [l] = lookup(chart, cfg, ev);
      const next = send(chart, cfg, ev).config;
      asked = l!.asked;
      const row = { Event: ev, 'Asked first': verdict(asked[0]!, l!.handler?.from), 'Asked next': asked[1] ? verdict(asked[1], l!.handler?.from) : 'not needed', 'Moves to': next.leaves[0]! };
      await lookupCard.set(row);
      note({ current: next.leaves[0]! });
      await this.play(new Transform(C.mark, at(next.leaves[0]!), { runTime: 0.5 }));
      cfg = next;
    }
    const chips = [chip(look, 1, [CX + W / 2 - 0.05, SPOT.brewing!.cy + H / 2], asked.length > 1 ? s.bad : s.good)];
    if (asked.length > 1) chips.push(chip(look, 2, [ON_BOX.cx - ON_BOX.w / 2 + 1.1, ON_BOX.cy + ON_BOX.h / 2 - 0.3], s.good));
    keep(...chips);
    words = power
      ? 'POWER_OFF was offered first to brewing, marked 1, which has no such arrow, then to the box on, marked 2, which has one; the machine is now in off.'
      : 'BACK was offered to brewing, marked 1, which has its own BACK arrow; the machine is now in grinding.';
    await this.play(...fade(...chips));
    await lookupCard.mark(asked.length > 1 ? 'Asked next' : 'Asked first');

    // ---- flattening: the box dissolves into the arrows it stood for ----
    if (power) {
      await this.step('flatten', {
        title: 'Flatten it and nothing is lost',
        line: 'The same events leave both machines in the same state.',
        caption: `Flattening copies each parent arrow onto every state inside it, and the ${full.flatArrows}-arrow machine is back. The same events end in the same states in both columns, and so does every one of the ${group(sequences)} sequences of up to four events checked, so the box saves drawing, not behaviour.`,
      });
      words = 'The box on has dissolved: each of the four states again has its own POWER_OFF arrow to off, and POWER_ON returns to idle. The machine is in idle.';
      const replay = ['START', 'GROUND', 'POWER_OFF', 'POWER_ON'];
      await this.play(new FadeOut(lookupCard, { runTime: 0.3 }));
      const proof = await s.card(
        [
          ...replay.map((e) => [e, '–', '–'] as [string, unknown, unknown]),
          ['Sequences checked', group(sequences)],
          ['Disagreements', 0],
        ],
        { columns: ['Chart', 'Flat'], at: SIDE_BELOW, align: 'top', width: 4.9, fontSize: 0.23 },
      );
      await this.play(...gone(C.onBox, C.offOne, C.onOne, ...chips), ...fade(...C.offFan, C.onFlat), new Transform(C.mark, at('idle'), { runTime: 0.6 }));
      let cc = initialConfig(chart);
      let ff = flat.initial;
      const leavesOf = (id: string) => flat.states.find((x) => x.id === id)!.leaves.join(' ');
      for (const ev of replay) {
        cc = send(chart, cc, ev).config;
        ff = flatStep(flat, ff, ev);
        await proof.set({ [ev]: pair(cc.leaves.join(' '), leavesOf(ff)) });
        await this.play(new Transform(C.mark, at(cc.leaves[0]!), { runTime: 0.5 }));
      }
      note({ current: cc.leaves[0]!, flatArrows: full.flatArrows });
      await proof.mark('Disagreements');
    }

    // =====================================================================================
    // Act 2: the media player
    // =====================================================================================
    const k = (settings.regions === 'three' ? 3 : 2) as 2 | 3;
    const pchart = player(k);
    const pflat = flatten(pchart);
    const pc = counts(pchart);
    const specs = REGION_SPECS.slice(0, k);
    const regionOfEvent = (e: string) => REGION_SPECS.findIndex((r) => (r.to as readonly string[]).includes(e));
    const regionOfLeaf = (l: string) => REGION_SPECS.findIndex((r) => (r.states as readonly string[]).includes(l));
    const bit = (l: string) => (REGION_SPECS[regionOfLeaf(l)]!.states as readonly string[]).indexOf(l);
    const flatLabel = (leaves: string[]) => [...leaves].sort((a, b) => regionOfLeaf(a) - regionOfLeaf(b));
    const rowName = (leaves: string[]) => flatLabel(leaves).join(' · ');

    // The flat player's boxes sit on the corners of a square (two switches), or of a square inside a square (three):
    // playback picks left or right, sound picks top or bottom, and loop picks the inner square.
    const cube = k === 3;
    const BOX: [number, number] = cube ? [1.7, 1.05] : [2.4, 1.0];
    const XC = -2.6,
      YC = cube ? -0.45 : -0.2;
    const spot = (leaves: string[]): Rect => {
      const b: number[] = [0, 0, 0];
      for (const l of leaves) b[regionOfLeaf(l)] = bit(l);
      const [hx, hy] = cube ? (b[2] ? [1.55, 0.95] : [3.95, 2.25]) : [2.2, 1.95];
      return { cx: XC + (b[0] ? hx : -hx), cy: YC + (b[1] ? -hy : hy), w: BOX[0], h: BOX[1] };
    };
    /** An arrow from box `A` to box `B`, shifted sideways so the arrow back runs beside it, labelled unless the picture is crowded. */
    const between = (A: Rect, B: Rect, event: string, { labelled = true, shift = 0.13, size = 0.22, tip = 0.2 } = {}) => {
      const dx = B.cx - A.cx,
        dy = B.cy - A.cy,
        len = Math.hypot(dx, dy);
      const n: Vec = [-dy / len, dx / len];
      const a0 = attach(A, [B.cx, B.cy], 0.03),
        b0 = attach(B, [A.cx, A.cy], 0.03);
      const a: Vec = [a0[0] + n[0] * shift, a0[1] + n[1] * shift],
        b: Vec = [b0[0] + n[0] * shift, b0[1] + n[1] * shift];
      const color = COLORS[regionOfEvent(event)] ?? EDGE;
      const g = new Group(arrow({ a, b, color, width: 0.035, tip }));
      if (labelled) {
        const mid: Vec = [(a[0] + b[0]) / 2 + n[0] * 0.2, (a[1] + b[1]) / 2 + (Math.abs(n[0]) > 0.5 ? 0 : n[1] * 0.14)];
        g.add(label(look, event, mid, { color, anchor: n[0] > 0.5 ? 'start' : n[0] < -0.5 ? 'end' : 'middle', size }));
      }
      return keep(g);
    };
    const flatRect = new Map(pflat.states.map((st) => [st.id, spot(st.leaves)]));
    const flatBoxes = pflat.states.map((st) => keep(stateBox(look, flatLabel(st.leaves), flatRect.get(st.id)!, { size: cube ? 0.21 : 0.28 })));
    const flatArrows = pflat.edges.map((e) => between(flatRect.get(e.from)!, flatRect.get(e.to)!, e.event, { labelled: !cube, tip: cube ? 0.16 : 0.2 }));
    // The colours say which switch an arrow belongs to, next to the scoreboard.
    const legend = (items: string[]) =>
      keep(
        new Group(
          ...items.flatMap((text, i) => {
            const y = 0.55 - i * 0.42;
            return [new Line([2.85, y], [3.35, y], { stroke: COLORS[i]!, strokeWidth: 0.07 }), label(look, text, [3.5, y], { anchor: 'start', color: look.ink, size: 0.24 })];
          }),
        ),
      );
    const flatLegend = legend(specs.map((r) => `${r.id}: ${r.to.join(', ')}`));

    await this.step('product', {
      title: cube ? 'Three switches make eight states' : 'Two switches make four states',
      line: 'Every combination is a state, with an arrow per switch.',
      caption: cube
        ? `A media player can be paused or playing, muted or unmuted, and looping or playing once. Each switch is independent, yet the flat machine needs a state for every combination: ${pc.flatStates}, with ${pc.flatArrows} arrows because each state has one arrow per switch.`
        : `A media player can be paused or playing, and muted or unmuted. The two switches do not affect each other, yet the flat machine needs a state for every combination: ${pc.flatStates}, with ${pc.flatArrows} arrows because each state has one arrow per switch. These are the states that two booleans give you.`,
    });
    await s.clear();
    words = cube
      ? 'A flat media player drawn as a square inside a square: eight boxes for the combinations of paused or playing, unmuted or muted, and once or looping, joined by twenty-four arrows in three colours, one pair along each edge.'
      : 'A flat media player drawn as a square: four boxes for paused or playing combined with unmuted or muted, joined by eight arrows, PLAY and PAUSE along the rows and MUTE and UNMUTE along the columns.';
    this.state = { current: rowName(pflat.states.find((st) => st.id === pflat.initial)!.leaves), flatStates: pc.flatStates, flatArrows: pc.flatArrows, chartArrows: '–' };
    await this.play(...fade(...flatBoxes, ...flatArrows));
    scoreboard = await s.card(
      [
        ['States', pc.flatStates, '–'],
        ['Arrows', pc.flatArrows, '–'],
      ],
      { ...SCORE, at: SIDE_TOP },
    );
    await this.play(...fade(flatLegend));
    await scoreboard.mark('Arrows');

    // ---- the parallel statechart: regions side by side ----
    const P_BOX: Rect = { cx: -2.65, cy: -0.5, w: 9.3, h: 6.9 };
    const pLeft = P_BOX.cx - P_BOX.w / 2;
    const rw = P_BOX.w / k;
    const regionX = (i: number) => pLeft + rw * (i + 0.5);
    const topY = 0.85,
      botY = -2.15;
    const stateRect = (i: number, j: number): Rect => ({ cx: regionX(i), cy: j === 0 ? topY : botY, w: cube ? 2.3 : 2.9, h: 1.0 });
    const chartStates = specs.flatMap((r, i) => r.states.map((st, j) => keep(stateBox(look, st, stateRect(i, j), { size: 0.28 }))));
    const chartArrows = specs.flatMap((r, i) => {
      const [down, up] = r.to;
      const c = regionX(i),
        color = COLORS[i]!,
        top = topY - 0.5,
        bot = botY + 0.5;
      const dx = cube ? 0.3 : 0.42,
        size = cube ? 0.2 : 0.22;
      return [
        keep(new Group(arrow({ a: [c - dx, top], b: [c - dx, bot], color }), label(look, down, [c - dx - 0.12, (top + bot) / 2], { anchor: 'end', color, size }))),
        keep(new Group(arrow({ a: [c + dx, bot], b: [c + dx, top], color }), label(look, up, [c + dx + 0.12, (top + bot) / 2], { anchor: 'start', color, size }))),
      ];
    });
    const chartFrame = keep(
      new Group(
        frame(P_BOX, { color: look.soft, width: 0.045, radius: 0.3 }),
        label(look, 'player', [pLeft + 0.3, P_BOX.cy + P_BOX.h / 2 - 0.32], { size: 0.3, color: look.ink, weight: 'bold', anchor: 'start' }),
        ...specs.map((r, i) => label(look, r.id, [regionX(i), P_BOX.cy + P_BOX.h / 2 - 0.85], { size: 0.28, color: COLORS[i]!, weight: 'bold' })),
        ...specs.slice(1).map((_, i) => {
          const x = pLeft + rw * (i + 1);
          return new Line([x, P_BOX.cy + P_BOX.h / 2 - 0.15], [x, P_BOX.cy - P_BOX.h / 2 + 0.15], { stroke: look.soft, strokeWidth: 0.03, dashArray: '0.14 0.1' });
        }),
      ),
    );
    const tokens = specs.map((_, i) => keep(here(look, stateRect(i, 0))));

    await this.step('regions', {
      title: cube ? 'Three regions, six states' : 'Two regions, the same four states',
      line: 'Each region keeps its own current state.',
      caption: cube
        ? `Draw each switch as its own region, with a dashed line between them, and the player is in one state of every region at once. That is ${pc.chartStates} states and ${pc.chartArrows} arrows against ${pc.flatStates} and ${pc.flatArrows}: the regions add where the flat machine multiplies.`
        : `Draw each switch as its own region, with a dashed line between them, and the player is in one state of every region at once. With only two regions the state count ties at ${pc.chartStates}, but the arrows halve to ${pc.chartArrows}: each is drawn once, not once per combination.`,
    });
    words = `The same player as a statechart: a box called player split by dashed lines into ${specs.map((r) => r.id).join(', ')} regions, each with its two states and a pair of arrows. Each region has one orange current state.`;
    note({ chartArrows: pc.chartArrows });
    await this.play(...gone(...flatBoxes, ...flatArrows, flatLegend));
    await this.play(...fade(chartFrame, ...chartStates, ...chartArrows, ...tokens));
    await scoreboard.set({ States: pair(pc.flatStates, pc.chartStates), Arrows: pair(pc.flatArrows, pc.chartArrows) });

    // ---- together: events move one region, and the flat state is the combination ----
    const sent = k === 3 ? ['PLAY', 'MUTE', 'LOOP_ON', 'PAUSE'] : ['PLAY', 'MUTE', 'PAUSE'];
    const rowsCard = await s.card(
      pflat.states.map((st) => [rowName(st.leaves), `${pflat.edges.filter((e) => e.from === st.id).length} out`] as [string, unknown]),
      { title: 'Flat machine states', at: SIDE_BELOW, align: 'top', width: 4.9, fontSize: k === 3 ? 0.23 : 0.27, enter: false },
    );
    await this.step('together', {
      title: 'One event moves one region',
      line: 'The current states, read together, name one flat state.',
      caption: `Send ${sent.join(', ')}. Each event is heard by one region; the others stay put. The orange states, read together, name one flat state: ${rowName(run(pchart, sent).at(-1)!.leaves)}. Both machines agree on all ${group(agree(pchart, pflat, 4))} event sequences of up to four events checked.`,
    });
    words = 'The player statechart with its current states outlined in orange, beside a list of the flat machine states; the row matching the current states is highlighted.';
    await this.play(new FadeIn(rowsCard, { runTime: 0.4 }));
    s.keep(rowsCard, { describe: said });
    let pcfg = initialConfig(pchart);
    await rowsCard.mark(rowName(pcfg.leaves));
    for (const ev of sent) {
      pcfg = send(pchart, pcfg, ev).config;
      const idx = regionOfEvent(ev);
      const leaf = pcfg.leaves.find((l) => regionOfLeaf(l) === idx)!;
      await this.play(new Transform(tokens[idx]!, here(look, stateRect(idx, bit(leaf))), { runTime: 0.5 }));
      await rowsCard.mark(rowName(pcfg.leaves));
    }
    note({ current: rowName(pcfg.leaves) });

    // ---- growth: the model's counts for one to six regions ----
    const g = growth(6);
    const last = g.at(-1)!;
    await this.step('growth', {
      title: 'Each region doubles the flat machine',
      line: 'Counts from the model, for 1 to 6 two-state regions.',
      caption: `A region adds two states to the chart and doubles the flat machine. At six regions the chart has ${last.chartStates} states and ${last.chartArrows} arrows; the flat machine has ${last.flatStates} states and ${group(last.flatArrows)}. The states only tie at one and two regions, so the explosion starts at three, and regions with more than two states grow it faster.`,
    });
    await s.clear();
    words = `Two bar charts for one to six regions. States: flat ${g.map((r) => r.flatStates).join(', ')} against chart ${g.map((r) => r.chartStates).join(', ')}. Arrows: flat ${g.map((r) => r.flatArrows).join(', ')} against chart ${g.map((r) => r.chartArrows).join(', ')}. The group for ${k} regions is outlined.`;
    note({ flatStates: last.flatStates, flatArrows: last.flatArrows, chartArrows: last.chartArrows, current: '–' });
    const panels = (['States', 'Arrows'] as const).map((title, p) => {
      const left = p === 0 ? -7.2 : 0.55,
        width = 6.7,
        base = -3.0,
        height = 4.6;
      const key = (r: (typeof g)[number]) => (p === 0 ? [r.flatStates, r.chartStates] : [r.flatArrows, r.chartArrows]);
      const top = Math.max(...g.map((r) => key(r)[0]!));
      const gw = width / 6;
      const parts: Mobject[] = [new Line([left, base], [left + width, base], { stroke: look.soft, strokeWidth: 0.03 }), label(look, title, [left, 2.75], { size: 0.34, color: look.ink, weight: 'bold', anchor: 'start' })];
      g.forEach((r, i) => {
        const cx = left + gw * (i + 0.5);
        const [f, c] = key(r) as [number, number];
        const bw = 0.4;
        for (const [v, dx, color] of [[f, -bw / 2 - 0.02, FLAT_BAR], [c, bw / 2 + 0.02, CHART_BAR]] as const) {
          const h = Math.max(0.06, (v / top) * height);
          parts.push(new Rectangle({ width: bw, height: h, fill: color, stroke: 'none' }).moveTo([cx + dx, base + h / 2]));
          parts.push(label(look, String(v), [cx + dx, base + h + 0.17], { size: 0.2, color: look.ink }));
        }
        parts.push(label(look, String(r.regions), [cx, base - 0.25], { size: 0.24, color: r.regions === k ? s.emphasis : look.soft, weight: r.regions === k ? 'bold' : 'normal' }));
        if (r.regions === k) parts.push(frame({ cx, cy: base + 0.62, w: gw - 0.1, h: 1.6 }, { color: s.emphasis, width: 0.04, radius: 0.12, dashed: true }));
      });
      return keep(new Group(...parts));
    });
    const axis = keep(
      new Group(
        label(look, 'number of regions', [0, -3.62], { size: 0.24 }),
        new Rectangle({ width: 0.3, height: 0.3, fill: FLAT_BAR, stroke: 'none' }).moveTo([-3.4, -4.0]),
        label(look, 'flat machine', [-3.15, -4.0], { size: 0.24, color: look.ink, anchor: 'start' }),
        new Rectangle({ width: 0.3, height: 0.3, fill: CHART_BAR, stroke: 'none' }).moveTo([0.4, -4.0]),
        label(look, 'statechart', [0.65, -4.0], { size: 0.24, color: look.ink, anchor: 'start' }),
      ),
    );
    await this.play(...fade(...panels, axis));

    // =====================================================================================
    // Act 3 (power): history, the third thing a box buys
    // =====================================================================================
    const hchart: Chart = coffee('power', { history: true });
    const hflat = flatten(hchart);
    const hc = counts(hchart);
    if (power) {
      const H2 = coffeeParts();
      await this.step('history', {
        title: 'H resumes where the box was left',
        line: 'An arrow to on restarts at idle; an arrow to H does not.',
        caption: 'Back to the coffee machine. Switch off while brewing, then on again. POWER_ON aimed at the box enters its first state, idle, and the brew is lost. Aimed at H, the history marker, it re-enters whichever state the box last held, brewing. The chart gains one small marker and no arrow.',
      });
      await s.clear();
      words = 'The coffee machine drawn with its box on, off to the right, and a small circle marked H inside the box. POWER_ON from off points at H. Beside it a table lists the machine after each event for an arrow to on and for an arrow to H.';
      const plain = coffee('power');
      const evs = ['START', 'GROUND', 'POWER_OFF', 'POWER_ON'];
      this.state = { current: 'idle', flatStates: hc.flatStates, flatArrows: hc.flatArrows, chartArrows: hc.chartArrows };
      await this.play(...fade(...NAMES.map((n) => H2.states[n]!), ...H2.ring, H2.off, H2.onBox, H2.offOne, H2.onH, H2.hMark, H2.mark));
      const table = await s.card(
        [...evs.map((e) => [e, '–', '–'] as [string, unknown, unknown])],
        { columns: ['To on', 'To H'], at: regionBox('side', { bottom: 0.4 }), align: 'top', width: 4.9, fontSize: 0.27 },
      );
      let pa = initialConfig(plain),
        pb = initialConfig(hchart);
      for (const e of evs) {
        pa = send(plain, pa, e).config;
        pb = send(hchart, pb, e).config;
        await table.set({ [e]: pair(pa.leaves[0], pb.leaves[0]) });
        await this.play(new Transform(H2.mark, at(pb.leaves[0]!), { runTime: 0.5 }));
      }
      note({ current: pb.leaves[0]! });
      await table.mark('POWER_ON');

      // The same chart, flattened: the memory has to live in the states.
      await this.step('history-flat', {
        title: 'Flat, off splits into four states',
        line: 'The machine stores the memory in its states.',
        caption: `A flat machine has nowhere else to keep "which state was I in?", so off becomes four states, one per place to return to, and every state in the column needs its own POWER_ON. That is ${hc.flatStates} states and ${hc.flatArrows} arrows against ${hc.chartStates} and ${hc.chartArrows} for the chart with H.`,
      });
      await s.clear();
      words = 'A flat machine in two rows of four. The top row holds idle, grinding, brewing and ready, joined by START, GROUND and BREWED, with TAKE arching back over the top. Below each is its own off state, off after idle, off after grinding, off after brewing and off after ready, with a POWER_OFF arrow down and a POWER_ON arrow up in every column.';
      const colX = [-5.55, -1.85, 1.85, 5.55];
      const GW = 2.5,
        GH = 0.95,
        TOPY = 1.15,
        BOTY = -1.5;
      const cell = new Map<string, Rect>();
      for (const st of hflat.states) {
        const name = st.leaves[0]!;
        const memory = st.memory.on;
        const i = NAMES.indexOf((name === 'off' ? memory : name) as (typeof NAMES)[number]);
        cell.set(st.id, { cx: colX[i]!, cy: name === 'off' ? BOTY : TOPY, w: GW, h: GH });
      }
      const gBoxes = hflat.states.map((st) => {
        const name = st.leaves[0]!;
        return keep(stateBox(look, name === 'off' ? ['off', `was ${st.memory.on}`] : name, cell.get(st.id)!, { size: 0.28 }));
      });
      const gArrows = hflat.edges.map((e) => {
        if (e.event === 'TAKE') {
          const A = cell.get(e.from)!,
            B = cell.get(e.to)!;
          return keep(
            new Group(
              arrow({ a: [A.cx, A.cy + GH / 2], b: [B.cx, B.cy + GH / 2], bend: 0.5, color: EDGE }),
              label(look, 'TAKE', [(A.cx + B.cx) / 2, TOPY + GH / 2 + 1.05], { size: 0.22 }),
            ),
          );
        }
        return between(cell.get(e.from)!, cell.get(e.to)!, e.event, { size: 0.2, shift: 0.14 });
      });
      // `between` colours by region; here every arrow is ink.
      void gArrows;
      this.state = { current: '–', flatStates: hc.flatStates, flatArrows: hc.flatArrows, chartArrows: hc.chartArrows };
      await this.play(...fade(...gBoxes, ...gArrows));
      scoreboard = await s.card(
        [
          ['States', hc.flatStates, hc.chartStates],
          ['Arrows', hc.flatArrows, hc.chartArrows],
        ],
        { ...SCORE, at: [-3.2, -4.25, 3.2, -2.35] },
      );
      await scoreboard.mark('States');
    }

    // =====================================================================================
    // The ledger
    // =====================================================================================
    const p2 = counts(player(2)),
      p3 = counts(player(3));
    const ledger: [string, number, number][] = [
      ['POWER_OFF button: arrows', counts(coffee('power')).flatArrows, counts(coffee('power')).chartArrows],
      ['BACK button: arrows', counts(coffee('back')).flatArrows, counts(coffee('back')).chartArrows],
      ['Player, 2 regions: states', p2.flatStates, p2.chartStates],
      ['Player, 2 regions: arrows', p2.flatArrows, p2.chartArrows],
      ['Player, 3 regions: states', p3.flatStates, p3.chartStates],
      ['Player, 3 regions: arrows', p3.flatArrows, p3.chartArrows],
      ...(power ? ([['Coffee with H: states', hc.flatStates, hc.chartStates], ['Coffee with H: arrows', hc.flatArrows, hc.chartArrows]] as [string, number, number][]) : []),
    ];
    await this.step('ledger', {
      title: 'Where the savings are, and where they stop',
      line: 'Every row is a count from the model: flat, then chart.',
      caption:
        'Group states that answer an event alike, and split parts that change independently; where neither holds, as with BACK, the counts match. Flatten any chart and you get an ordinary state machine: no new power, only a drawing you can read. Harel introduced statecharts in 1987; guards, entry and exit actions, delayed transitions, final states and invoked actors build on them and are not simulated here.',
    });
    await s.clear();
    words = `A table of counts, flat against statechart: ${ledger.map(([l, a, b]) => `${l} ${a} against ${b}`).join('; ')}.`;
    note({ current: '–' });
    const ledgerCard = await s.card(ledger.map(([l, a, b]) => [l, a, b] as [string, unknown, unknown]), {
      columns: ['Flat', 'Statechart'],
      at: [-5.2, -4.2, 5.2, 3.2],
      align: 'top',
      width: 10.4,
      fontSize: power ? 0.32 : 0.36,
    });
    await ledgerCard.mark('BACK button: arrows');
  }
}
