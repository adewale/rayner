import { Scene, Group, Text, Brace, DecimalNumber, Create, FadeIn, FadeOut, Transform, Succession, LaggedStart, MoveAlongPath, PulseAlongPath, GrowFromEdge, smooth, linear, keyed } from '../../../src/index.ts';
import type { Box, Mobject } from '../../../src/index.ts';
import { stage, answerOf, having } from '../../../explain/index.ts';
import type { Stage, ExplainerMeta } from '../../../explain/index.ts';
import { bars } from '../../../explain/drawing.ts';
import { FIRST, ROWS, binOf, boardStory, routes } from './model.ts';
import type { BoardState, Turn } from './model.ts';
import { FLOOR, SIZE, W, ball, binAxes, binX, drawBell, drawBoard, drawCounts, drawLattice, drawPile, hops, routePath, sideWords } from './picture.ts';
import { percent } from '../lib/format.ts';

/** The three routes to the middle bin the page draws: rights first, lefts first, and alternating. */
const MIDDLE_ROUTES: Turn[][] = [[...'RRRLLL'] as Turn[], [...'LLLRRR'] as Turn[], [...'RLRLRL'] as Turn[]];

export default class GaltonBoard extends Scene<BoardState, {}> {
  static meta = {
    sources: [
      'https://galton.org/books/natural-inheritance/pdf/galton-nat-inh-1up-clean.pdf',
      'https://docs.python.org/3.12/library/math.html#math.comb',
      'https://docs.python.org/3.12/library/statistics.html#normaldist-objects',
    ],
    claims: [
      { says: 'At every peg the ball goes left or right', test: 'model.test.ts: every route is listed once' },
      { says: 'One ball down every route', test: 'model.test.ts: every route is listed once' },
      { says: 'each as likely as any other', test: 'model.test.ts: at fair pegs a bin’s chance is its share of the routes' },
      { says: 'every route is equally likely', test: 'model.test.ts: at fair pegs a bin’s chance is its share of the routes' },
      { says: 'only 1 ends in each edge bin', test: 'model.test.ts: more routes lead to the middle bins than to the edges' },
      { says: 'The arcs show every hop a ball could make', shown: true as const },
      { says: 'Drop exactly one ball down each of the 64 routes', test: 'model.test.ts: every route is listed once' },
    ],
  } satisfies ExplainerMeta;

  override async construct() {
    const s = stage(this, { style: 'github-light', headingSize: 0.6 });
    const m = boardStory(), rows = ROWS, all = routes(rows);
    const ink = s.look.ink, accent = s.look.emphasis;
    const none = Array<number>(rows + 1).fill(0);
    const pct = (x: number, digits = 1) => percent(x, { digits });
    const fadeOut = (...mobs: Mobject[]) => mobs.map((x) => new FadeOut(x, { runTime: 0.3 }));

    // 1. One ball: a hop for every turn of its route, each hop its own arc.
    await this.step('drop', {
      title: 'One ball, six coin flips',
      line: 'At every peg the ball goes left or right.',
      caption: `A Galton board is a triangle of pegs over a row of bins. A ball dropped at the top hits a peg and falls to its left or its right, as likely one way as the other, then meets another peg. After six pegs it drops into one of seven bins. This ball went right ${binOf(FIRST)} times and left ${rows - binOf(FIRST)} times, so it ends in the middle bin: a bin is the number of rights.`,
    });
    this.state = { rows, dropped: 1, counts: none.map((_, k) => (k === binOf(FIRST) ? 1 : 0)), routes: [[...FIRST]] };
    const board = drawBoard(s, rows);
    const first = keyed(ball(s), 'ball');
    const said = sideWords(s, [
      { text: 'This ball’s turns', soft: true },
      { text: FIRST.join(' '), size: 0.8, bold: true, mono: true },
      { text: `${binOf(FIRST)} rights: the middle bin` },
    ]);
    await s.enter(board, { describe: `A triangle of pegs, ${rows} rows deep, over ${rows + 1} bins` });
    await s.enter(first, ...said, { describe: () => `A ball that turns ${FIRST.map((t) => (t === 'R' ? 'right' : 'left')).join(', ')} and rests in the middle bin, its route drawn behind it` });
    // The ball hops along one arc per turn; its route is drawn behind it as it goes, so the route stays to be read.
    const firstHops = hops(FIRST), trail = keyed(routePath(FIRST, { stroke: s.look.soft, strokeWidth: 0.04 }), 'trail');
    s.keep(trail, { describe: 'The route the ball took' });
    await this.play(
      new Succession(firstHops.map((hop) => new MoveAlongPath(first, hop, { runTime: 0.42, rateFunc: linear }))),
      new Create(trail, { runTime: 0.42 * firstHops.length, rateFunc: linear }),
    );

    // 2. The question: every route there is, one ball each.
    await this.step('predict', {
      title: 'One ball down every route: which bin fills highest?',
      line: 'Predict: an edge bin, the middle bin, or all the same?',
      caption: `Six pegs, two ways at each: ${m.total} different routes from the top to the bins, each as likely as any other. The arcs show every hop a ball could make. Drop exactly one ball down each of the ${m.total} routes. Will the balls spread evenly over the seven bins, pile up at an edge, or pile up in the middle?`,
      // The reader commits before the balls drop; the answer is the model's fullest bin.
      predict: {
        options: ['An edge bin', 'The middle bin', 'All bins the same'],
        answer: new Set(m.counts).size === 1 ? 'All bins the same' : m.most === rows / 2 ? 'The middle bin' : 'An edge bin',
      },
    });
    this.state = { rows, dropped: 0, counts: none, routes: [] };
    const lattice = drawLattice(s, rows);
    const asked = sideWords(s, [{ text: `${m.total} routes,` }, { text: 'one ball down each.' }, { text: 'Which bin fills', size: 0.64, bold: true, gap: 0.16 }, { text: 'highest?', size: 0.64, bold: true }]);
    await this.play(...fadeOut(first, trail, ...said));
    s.keep(lattice, { describe: 'An arc for every hop a ball could make: two from each peg' });
    await this.play(new Create(lattice, { runTime: 1.2, lagRatio: 0.02 }));
    await s.enter(...asked);

    // 3. The pile: a token down each route, the bins growing from their floor, the count running up.
    await this.step('pile', {
      title: `The middle bin gets ${m.counts[m.most]} balls, each edge bin ${m.counts[0]}`,
      line: `${answerOf(this)}.`,
      caption: `No ball was steered. Each of the ${m.total} routes carried one ball, and ${m.counts[m.most]} of those routes end in the middle bin while only ${m.counts[0]} ends in each edge bin. ${answerOf(this)}, and since every route is equally likely, a ball is ${m.counts[m.most]! / m.counts[0]!} times as likely to finish in the middle as at the far left.`,
    });
    this.state = { rows, dropped: m.total, counts: m.counts, routes: [] };
    await this.play(...fadeOut(...asked));
    const number = (n: number) => new DecimalNumber(n, { fontSize: 1.6, color: ink, anchor: 'start', shaping: this.textShaping }).moveTo([0.75, 1.5], [-1, 0]);
    const count = keyed(number(0), 'dropped');
    const counted = sideWords(s, [{ text: 'balls dropped,' }, { text: 'one down every route' }], 0.45);
    await s.enter(count, ...counted, { describe: () => `${count.text} balls dropped, one down every route` });
    const axes = binAxes(s, rows);
    const pile = drawPile(s, axes, m.counts);
    s.keep(pile, { describe: `Bins filled to ${m.counts.join(', ')} balls, left to right` });
    // PulseAlongPath moves evenly by default; smooth lets each ball leave the top slowly and settle into its bin.
    const stream = new LaggedStart(all.map((route) => new PulseAlongPath(ball(s), routePath(route), { runTime: 1.5, rateFunc: smooth })), { lagRatio: 0.045 });
    await this.play(
      stream,
      new LaggedStart(pile.children.map((bar) => new GrowFromEdge(bar, [0, -1], { runTime: stream.runTime * 0.7 })), { lagRatio: 0.03, runTime: stream.runTime }),
      new Transform(count, number(m.total), { runTime: stream.runTime, rateFunc: linear }),
    );
    const counts = drawCounts(s, rows, m.counts);
    await s.enter(counts, { runTime: 0.4 });

    // 4. Why: a bin is a number of rights, and a route is one order for them.
    const edge = all[0]!;
    await this.step('paths', {
      title: `One way to reach the edge, ${m.counts[m.most]} ways to reach the middle`,
      line: 'A bin is a number of rights; a route is one order for them.',
      caption: `To reach the left edge a ball must go left at all six pegs: one route. To reach the middle it needs three rights and three lefts, in any order, and there are ${m.counts[m.most]} different orders: rights first, lefts first, or mixed. Drawn over the pegs are the one route down the left side and three of the ${m.counts[m.most]} that end in the middle. The pile is a count of orders.`,
    });
    this.state = { rows, dropped: m.total, counts: m.counts, routes: [edge, ...MIDDLE_ROUTES] };
    await this.play(...fadeOut(count, ...counted, lattice));
    const drawn = (route: Turn[], key: string, stroke: string, strokeWidth: number) => keyed(routePath(route, { stroke, strokeWidth }), key);
    const edgeRoute = drawn(edge, 'route:edge', ink, 0.08);
    const middleRoutes = MIDDLE_ROUTES.map((route) => drawn(route, `route:${route.join('')}`, accent, 0.05));
    const listed = sideWords(s, [
      { text: `Left edge bin: ${m.counts[0]} route`, gap: 0.14 },
      { text: edge.join(''), size: 0.64, mono: true, gap: 0.5 },
      { text: `Middle bin: ${m.counts[m.most]} routes`, gap: 0.14 },
      ...MIDDLE_ROUTES.map((route) => ({ text: route.join(''), size: 0.64, mono: true, gap: 0.14 })),
      { text: `and ${m.counts[m.most]! - MIDDLE_ROUTES.length} more`, soft: true },
    ]);
    s.keep(edgeRoute, ...middleRoutes, { describe: `The one route to the left edge bin, down the left side, and three of the ${m.counts[m.most]} routes to the middle bin` });
    await this.play(new Create(edgeRoute, { runTime: 0.8 }), new LaggedStart(middleRoutes.map((r) => new Create(r, { runTime: 0.8 })), { lagRatio: 0.5 }));
    await s.enter(...listed);

    // 5. The bell curve, laid over the pile: its area over three bins against the balls counted there.
    await this.step('bell', {
      title: 'A bell curve fits the pile',
      line: `Bins inside the brace: ${pct(m.exact)} counted, ${pct(m.curve)} under the curve.`,
      caption: `The smooth line is the normal curve, the bell curve, drawn with the pile’s own middle and spread. It was not used to make the pile; it is laid over it. The three bins inside the brace hold ${m.middle} of the ${m.total} balls, ${pct(m.exact)}. The shaded area under the curve across the same three bins is ${pct(m.curve)} of the curve’s whole area: the same share to within a quarter of a percentage point.`,
    });
    this.state = { rows, dropped: m.total, counts: m.counts, routes: [], span: { lo: m.lo, hi: m.hi, middle: m.middle, exact: m.exact, curve: m.curve } };
    await this.play(...fadeOut(edgeRoute, ...middleRoutes, ...listed));
    const { curve, area } = drawBell(s, axes, rows, m.total, m.lo, m.hi);
    const span: Box = [binX(rows, m.lo) - W / 2, FLOOR - 0.72, binX(rows, m.hi) + W / 2, FLOOR];
    const brace = keyed(new Brace(span, [0, -1], { stroke: ink, strokeWidth: 0.04 }), 'brace');
    const held = new Text(`${m.middle} of ${m.total} balls`, { fontSize: SIZE, color: ink, shaping: this.textShaping });
    brace.putAtTip(held, 0.12);
    const shares = sideWords(s, [
      { text: 'Counted in the bins', soft: true, gap: 0.14 },
      { text: pct(m.exact), size: 0.8, bold: true, gap: 0.55 },
      { text: 'Under the curve', soft: true, gap: 0.14 },
      { text: pct(m.curve), size: 0.8, bold: true },
    ]);
    s.keep(curve, area, { describe: `A bell curve over the pile, shaded across the three middle bins` });
    await this.play(new Create(curve, { runTime: 1.2 }));
    await this.play(new FadeIn(area, { runTime: 0.5 }));
    await s.enter(brace, held, ...shares, { describe: `A brace under the three middle bins: ${m.middle} of ${m.total} balls, ${pct(m.exact)} counted and ${pct(m.curve)} under the curve` });

    // 6. Where the curve stops being right: the edge bin, and the bins the board does not have.
    await s.steps([
      {
        id: 'edges',
        title: 'At the edges the curve drifts from the count',
        line: 'The board ends at its last bin; the curve runs on past it.',
        caption: `The curve is an approximation, and the edges show it. One route in ${m.total} reaches the left edge bin, ${pct(m.edgeExact, 2)} of the balls; the curve gives that bin ${pct(m.edgeCurve, 2)}. The curve also keeps going past the last bin, putting ${pct(m.beyond, 2)} of its area on each side where the board has no bins at all. Use the curve for the middle of a pile like this, and count routes at its edges.`,
        state: { rows, dropped: m.total, counts: m.counts, routes: [], tails: { beyond: m.beyond, edgeCurve: m.edgeCurve, edgeExact: m.edgeExact } } as BoardState,
        draw: (st: BoardState, s: Stage) => {
          const t = having(st, 'tails').tails, total = 2 ** st.rows;
          const rows = [
            { label: `Left edge bin: ${st.counts[0]} route in ${total}`, value: t.edgeExact * 100, display: pct(t.edgeExact, 2) },
            { label: 'Left edge bin, under the curve', value: t.edgeCurve * 100, display: pct(t.edgeCurve, 2) },
            { label: 'Past the last bin, under the curve', value: t.beyond * 100, display: pct(t.beyond, 2) },
          ];
          return new Group(bars(s, rows, 2, { at: [-3.2, 2.1], key: 'edges' }));
        },
      },
    ]);
  }
}
