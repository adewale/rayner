import { Scene, FadeIn, Create, Transform, AnimationGroup, Succession, Machine, view, rushFrom, thereAndBack } from '../../../src/index.ts';
import type { ScheduledAnimation as Animation, SceneState, View, VMobject } from '../../../src/index.ts';
import { stage, settingsOf } from '../../../explain/index.ts';
import { TokenBucket, bucketStart, bucketRequest } from './model.ts';
import type { BucketCall as Call, BucketState } from './model.ts';
import { listed } from '../lib/format.ts';
import {
  CHIP_Y, SHELL_X, barAt, cappedAt as capAt, chipX, climb, climbTo, coin, drawArrivals, drawAxes, drawBucketLabel, drawChart, drawChips, drawComparison,
  drawGauge, drawLevel, drawReadout, drawReadoutTitle, drawShell, fmt, levelY, missingRing, name, startOf,
} from './picture.ts';

// Six at once, three within the next second, then one after a four-second quiet spell:
// long enough at 2 and 4 tokens a second for min(5, …) to throw refill away, not at 1.
const TIMES = [0, 0, 0, 0, 0, 0, 0.5, 1, 1, 5];
const GROUPS = [
  [0, 6],
  [6, 9],
  [9, 10],
] as const;
const RATES = [1, 2, 4];
const CAPACITY = 5;
const CODE = [
  'function allow(now) {',
  '  tokens = min(5,',
  '    tokens + (now - lastRefill) * rate)',
  '  lastRefill = now',
  '  if (tokens < 1) return 429',
  '  tokens -= 1',
  '  return 200',
  '}',
];
/** Code lines, by what they do: refill, refuse, spend. */
const REFILL = [1, 3] as const,
  REFUSE = [4, 4] as const,
  SPEND = [5, 6] as const;
/** Seconds as the captions write them: 5, 1.5. */
const seconds = (t: number) => (Number.isInteger(t) ? String(t) : t.toFixed(1));
const perSecond = (r: number) => `${r} token${r > 1 ? 's' : ''} a second`;

/** The ten requests through the model at one refill rate. */
function runAt(rate: number): Call[] {
  const bucket = new TokenBucket(rate, CAPACITY);
  return TIMES.map((at) => {
    const ok = bucket.allow(at);
    return { at, ok, found: bucket.tokens + (ok ? 1 : 0), after: bucket.tokens };
  });
}
const START = startOf(CAPACITY);
/** How the readout and its description write a value of scene.state. */
const formatState = (v: unknown) =>
  Array.isArray(v)
    ? v.length
      ? v.join(', ')
      : 'none'
    : typeof v === 'number'
      ? Number.isInteger(v)
        ? String(v)
        : v.toFixed(1)
      : String(v);

export default class TokenBucketExplainer extends Scene {
  static meta = {
    sources: [
      'https://github.com/ivarvong/lantern/blob/2c7bad5/scenes/token-bucket.ts',
      // The oracle: tools/oracle/token-bucket runs this schedule through rate.Limiter.
      'https://pkg.go.dev/golang.org/x/time@v0.15.0/rate',
      'https://www.rfc-editor.org/rfc/rfc6585#section-4',
    ],
    // The readout's own words, which the captions use too.
    watch: { tokens: 'Tokens left', allowed: 'Accepted', rejected: 'Rejected' },
    claims: [
      { says: 'A burst can spend only the tokens saved up, and only elapsed time adds more', test: 'test/explain-token-bucket.test.ts: a burst can spend only the tokens saved up' },
      { says: 'R6 is refused at every rate', test: 'test/explain-token-bucket.test.ts: R6 is refused at every refill rate' },
      { says: 'R10 is accepted at every rate', test: 'test/explain-token-bucket.test.ts: R10 is accepted at the three offered rates and refused below a fifth of a token a second' },
    ],
  };
  static settings = [
    {
      id: 'rate',
      label: 'Refill per second',
      default: '2',
      options: [
        { value: '1', label: '1 token' },
        { value: '2', label: '2 tokens' },
        { value: '4', label: '4 tokens' },
      ],
    },
  ];
  /** The state readout: a View of scene.state, checked against the trace at every step. */
  readout: View | null = null;

  override async construct() {
    const rate = Number(settingsOf(this).rate),
      s = stage(this, { headingSize: 0.6, style: 'github-dark' });
    const colours = { ink: s.palette.ink, soft: s.soft, muted: s.palette.muted, paper: s.palette.paper, accent: s.palette.accent, good: s.good, bad: s.bad };

    // A dry run of the same model at every rate, so titles and captions can name its answers.
    const runs = new Map(RATES.map((r) => [r, runAt(r)] as const)),
      plan = runs.get(rate)!;
    const refusedAt = (r: number) => runs.get(r)!.flatMap((c, i) => (c.ok ? [] : [name(i)]));
    /** When a climb from `prev` to `call` reached the capacity, where min(capacity, …) took over; null when it stayed under. */
    const cappedAt = (prev: { at: number; after: number }, call: Call) => capAt(prev, call, rate, CAPACITY);
    /** The model's state: the bucket and every call so far, which every picture and description is drawn from. */
    const bucketOf = () => this.state as unknown as BucketState;

    // ---- descriptions of the drawings, read at every step boundary from the state
    const chartSays = () => {
      const { calls } = bucketOf();
      const refused = calls.flatMap((c, i) => (c.ok ? [] : [`${name(i)} at ${fmt(c.found)}`]));
      const capped = calls.flatMap((c, i) => {
        const full = cappedAt(calls[i - 1] ?? START, c);
        return full == null ? [] : [`The line reaches five at ${seconds(full)} s and runs flat until ${name(i)} arrives at ${seconds(c.at)} s`];
      });
      return !calls.length
        ? `A chart of tokens, 0 to ${CAPACITY}, against time, 0 to ${TIMES.at(-1)} s, with a dashed line at the one token a request needs`
        : `A chart of the balance over time: it climbs at ${rate} a second between calls and drops one token for each 200. ` +
            `Dots mark what R1–${name(calls.length - 1)} found; ` +
            (refused.length
              ? `${listed(refused)} ${refused.length > 1 ? 'are' : 'is'} under the one-token line and got 429`
              : 'none is under the one-token line') +
            capped.map((c) => `. ${c}`).join('');
    };
    const chipsSay = () => {
      const { calls } = bucketOf();
      const ok = calls.filter((c) => c.ok).length,
        no = calls.flatMap((c, i) => (c.ok ? [] : [name(i)]));
      return (
        'Requests R1 to R10 at their arrival times: ' +
        (calls.length
          ? `${ok} answered 200${no.length ? `, ${listed(no)} 429` : ''}${calls.length < TIMES.length ? `, ${TIMES.length - calls.length} waiting` : ''}`
          : 'none answered yet')
      );
    };
    const gaugeSays = () => `The bucket, filled to ${fmt(bucketOf().tokens)} of ${CAPACITY} tokens`;

    // ---- request chips: one per call, filled in as each answer comes back (picture.ts).
    const { times, names } = drawArrivals(TIMES, colours);
    // ---- the chart: tokens over time, on the gauge's scale; the gauge: a bucket whose level is the balance.
    const { axes, need, needLabel } = drawAxes(TIMES.at(-1)!, CAPACITY, colours);
    const shell = drawShell(colours);
    const fill = (n: number) => drawLevel(n, CAPACITY, colours);
    // The claim the shared scale makes, checked on every frame by rayner check: wherever the balance
    // line has got to, refilling or spending, the bucket's level stands at the same height. The line's
    // tip is the drawn end furthest along in time; at equal times, the one drawn last.
    this.addInvariant('the bucket stands where the balance line ends', (scene) => {
      const gauge = scene.find('bucket:level');
      if (!gauge || gauge.style.opacity <= 0) return;
      let tip: [number, number] | null = null;
      for (const m of scene.findAll((k) => k.startsWith('balance:refill:') || k.startsWith('balance:spend:'))) {
        const shown = m.style.drawFraction ?? 1;
        if (m.style.opacity <= 0 || shown <= 0) continue;
        const p = (m as VMobject).pointFromProportion(shown);
        if (!tip || p[0] >= tip[0] - 1e-6) tip = [p[0], p[1]];
      }
      if (!tip) return;
      const top = gauge.box()![3];
      // An empty bucket keeps a sliver 0.001 tall, so it can still be seen.
      return Math.abs(top - tip[1]) <= 0.002 || `the bucket's top is at ${top.toFixed(3)}, the line ends at ${tip[1].toFixed(3)}`;
    });
    const bucketLabel = drawBucketLabel(colours);

    // ---- the pictures of the model's state: every part keyed, so a transition can move each
    /** The balance in the bucket. */
    const gaugePicture = (st: BucketState) => drawGauge(st, CAPACITY, colours);
    /** Each call's climb, its drop when it spent a token, its dot, and the tags on the calls the captions name. */
    const chartPicture = (st: BucketState) => drawChart(st, axes, { rate, capacity: CAPACITY, last: TIMES.length - 1 }, colours);
    const chipsPicture = (st: BucketState) => drawChips(st, TIMES.length, colours);
    const part = (v: View, key: string) => v.current.find(key)!;

    // ------------------------------------------------------------- balance
    await this.step('balance', {
      title: 'Ten requests from one client, and a bucket of five tokens',
      line: 'Predict: R1–R6 arrive at the same instant. How many get 200?',
      caption:
        'A server shares its work among many clients, so it limits each one: a request it serves gets 200, OK, and one it refuses gets 429, Too Many Requests, which tells the client to slow down. A short burst, such as the requests a page makes as it loads, should still get through. So the server keeps a balance for the client of at most five tokens: the bucket. Each accepted request spends one token, and a request that finds less than one, under the 1 token line, gets 429. Ten requests will arrive at the times written above their boxes.',
    });
    await s.clear();
    const start = bucketStart(rate, CAPACITY);
    this.state = start as unknown as SceneState;
    const gauge = view(this, (st) => gaugePicture(st as unknown as BucketState), { place: false });
    const chart = view(this, (st) => chartPicture(st as unknown as BucketState), { place: false });
    const chips = view(this, (st) => chipsPicture(st as unknown as BucketState), { place: false });
    const readout = view(this, (state) => drawReadout(state, formatState));
    this.readout = readout;
    const readoutTitle = drawReadoutTitle(colours);
    s.keep(readout, readoutTitle, {
      describe: () =>
        `Bucket balance: ${formatState(this.state.tokens)} tokens left, last refill at ${formatState(this.state.lastRefill)} seconds, ${formatState(this.state.allowed)} accepted; rejected requests: ${formatState(this.state.rejected)}`,
    });
    await s.enter(shell, gauge, bucketLabel, { describe: gaugeSays });
    s.keep(axes, { describe: chartSays });
    await this.play(new Create(axes), { runTime: 2 });
    await s.enter(need, needLabel, { describe: chartSays });
    // The chart's balance line, dots and tags, drawn from the calls (none yet).
    this.add(chart);
    s.keep(chart, { describe: chartSays });
    s.keep(chips, ...times, ...names, { describe: chipsSay });
    await this.play(new FadeIn(chips, { runTime: 0.4 }), ...[...times, ...names].map((t) => new FadeIn(t)));
    const code = await s.code(CODE, {
      at: [2.15, -2.25, 7.75, 1.55],
      title: `bucket.allow(now), rate = ${rate}`,
      fontSize: 0.22,
    });
    code.code.lines[1]!.key = 'balance:cap';
    await this.play(new FadeIn(readout), new FadeIn(readoutTitle));
    await code.focus(REFILL, { as: 'refill' });

    /** The focus bar's place on lines a..b, as CodeBlock.focus draws it, for use inside a Succession. */
    const bar = (lines: readonly [number, number]) => barAt(code, lines);

    // ---------------------------------------- the machine: one request at a time
    // Each request is one call of allow() on the model, at the time the schedule gives it. The
    // client sends ten, so an eleventh is refused; every balance stays within 0 and the capacity.
    // A call takes 0.3 s to refill and 0.6 s to answer.
    const REFILL_S = 0.3,
      ANSWER_S = 0.6;
    const machine = new Machine<BucketState, 'request'>(this, {
      start,
      events: ['request'],
      // The bucket would take a request at any time; this client sends ten. Past the schedule, another
      // request at the last request's time shows the model would go on, and the bound stops the story.
      next: (st) => bucketRequest(st, TIMES[st.calls.length] ?? TIMES.at(-1)!),
      bound: (st) => (st.calls.length >= TIMES.length ? `The client sends ${TIMES.length} requests` : undefined),
      views: [gauge, chart, chips, readout],
      runTime: REFILL_S + ANSWER_S,
      transition: {
        request: (t) => {
          const { before, after } = t;
          const g = t.choreograph(gauge),
            c = t.choreograph(chart),
            q = t.choreograph(chips);
          const i = before.calls.length,
            call = after.calls[i]!,
            prev = before.calls.at(-1) ?? START,
            n = name(i);
          // Refill: one elapsed time drives the line's climb and the gauge from allow()'s own
          // formula, so the two agree at every frame, the corner where min(5, …) takes over included.
          const level = g.own('bucket:level');
          const rise = c.has(`balance:refill:${n}`, 'to') ? c.insert(`balance:refill:${n}`, c.to(`balance:refill:${n}`)) : null;
          const climbed = climb(prev, call, rate, CAPACITY);
          const balanceAt = (t: number) => (t >= call.at ? call.found : Math.min(CAPACITY, prev.after + (t - prev.at) * rate));
          const refill = g.follow(
            { from: prev.at, to: call.at, draw: (t) => (rise ? [fill(balanceAt(t)), climbTo(axes, climbed, t, s.palette.accent)] : fill(balanceAt(t))) },
            { targets: [level, ...(rise ? [rise] : [])], runTime: REFILL_S },
          );
          // The answer. A 200 takes the top token out of the bucket to the request, as the level
          // and the line drop by one; a 429 finds no whole token there, and the request turns red.
          const top = levelY(call.found, CAPACITY);
          const answer: Animation[] = [
            ...(call.ok ? [c.enter(`balance:spend:${n}`, { create: true }, { runTime: ANSWER_S })] : []),
            c.enter(`balance:found:${n}`, {}, { runTime: ANSWER_S }),
            new Transform(level, g.to('bucket:level'), { runTime: ANSWER_S }),
            q.leave(`request:${n}`, { runTime: ANSWER_S }),
            q.enter(`request:${n}`, {}, { runTime: ANSWER_S }),
            readout.sync({ match: 'index', runTime: ANSWER_S }),
          ];
          if (call.ok) {
            const token = g.insert('bucket:token', coin([SHELL_X, top - 0.14], colours));
            answer.push(
              new Succession([
                new Transform(token, coin([SHELL_X, top - 0.14], colours), { runTime: 0.18 }),
                // rushFrom: the token is sent off, leaving the bucket at full speed and easing into the request.
                new Transform(token, coin([chipX(i), CHIP_Y], colours), { runTime: 0.27, rateFunc: rushFrom }),
                g.leave('bucket:token', { runTime: 0.15 }),
              ]),
            );
          } else {
            const ring = (opacity: number) => missingRing(opacity, call.found, CAPACITY, colours);
            const missing = g.insert('bucket:missing', ring(0));
            // thereAndBack: the request looks for a token where one would be and comes back empty: the empty ring
            // shows and goes in one there-and-back, and is gone by the end of the answer.
            answer.push(new Succession([new Transform(missing, ring(1), { runTime: 0.58, rateFunc: thereAndBack }), g.leave('bucket:missing', { runTime: 0.02 })]));
          }
          return new Succession([
            refill,
            new AnimationGroup([...answer, g.rest({ runTime: ANSWER_S }), c.rest({ runTime: ANSWER_S }), q.rest({ runTime: ANSWER_S })]),
          ]);
        },
      },
    });

    // ---------------------------------------- burst, refill, later: the calls
    const f = (i: number) => fmt(plan[i]!.found);
    const tokens = (n: number) => `${fmt(n)} token${n === 1 ? '' : 's'}`;
    const r7 = plan[6]!,
      r9 = plan[8]!,
      r10 = plan[9]!;
    const code7 = r7.ok ? 200 : 429;
    // What the same half second buys at each rate, from the same dry runs.
    const halfSecond = RATES.map((r) => {
      const c = runs.get(r)![6]!;
      return `${tokens(c.found)} at ${r} a second (${c.ok ? 200 : 429})`;
    });
    // Which of R7–R9 found under one token, with the balance each one found.
    const low = [6, 7, 8].filter((i) => !plan[i]!.ok),
      lowNames = low.map((i) => `${name(i)} (${f(i)})`).join(' and ');
    const verdict = !low.length
      ? 'All three dots stay at or above the 1 token line, so all three get 200.'
      : `${lowNames} ${low.length > 1 ? 'are' : 'is'} under the 1 token line, so ${low.length > 1 ? 'they get' : 'it gets'} 429.`;
    // The long wait: what refill would add without the cap, and when the balance reaches five.
    const wait = r10.at - r9.at,
      uncapped = r9.after + wait * rate,
      fullAt = r9.at + (CAPACITY - r9.after) / rate;
    // The rates at which the same wait would pass five, for the case where this one does not.
    const capped = RATES.filter((r) => {
      const c = runs.get(r)!;
      return c[8]!.after + wait * r > CAPACITY;
    });
    const titles = [
      'Answer: five 200s, then a 429',
      `Answer: ${code7}. R7 finds ${tokens(r7.found)} after half a second`,
      uncapped > CAPACITY
        ? `R10 waits ${seconds(wait)} s, but the bucket stops at ${formatState(r10.found)} tokens`
        : `R10 waits ${seconds(wait)} s and finds ${formatState(r10.found)} tokens`,
    ];
    const lines = [
      'Predict: R7 arrives half a second later, at 0.5 s. 200 or 429?',
      `R8 at 1 s finds ${f(7)}; R9 at the same instant finds what R8 left.`,
      uncapped > CAPACITY
        ? 'The line runs flat along five: min(5, …) throws the rest away.'
        : `The line climbs to ${fmt(uncapped)}, under the cap of five.`,
    ];
    const captions = [
      `No time passed between R1 and R6, so the line drops one token per request and R6 finds ${f(5)}, under the 1 token line: 429. A burst can spend only the tokens saved up, and only elapsed time adds more. On each arrival the server adds elapsed time multiplied by the refill rate, here ${perSecond(rate)}, before deciding whether to spend a token. The line between arrivals shows available credit; no background timer needs to update the balance.`,
      `Between calls the line climbs ${perSecond(rate)}. Half a second after the burst, R7 finds ${tokens(r7.found)}, ${r7.ok ? 'enough for one request' : 'less than the one a request needs'}, so it gets ${code7}. The rate decides it: the same half second buys ${listed(halfSecond)}. R8 at 1 s finds ${f(7)}; R9 arrives at the same instant, so nothing is added and it finds what R8 left. Fractional tokens are saved, but a request must spend a whole one. ${verdict}`,
      uncapped > CAPACITY
        ? `R9 left ${formatState(r9.after)}. A wait of ${seconds(wait)} s at ${perSecond(rate)} would bring the balance to ${formatState(uncapped)}, but min(5, …) stops it at five, reached at ${seconds(fullAt)} s, and the line runs flat from there. However long a client waits, its next burst is at most five requests. R10 spends one and leaves ${formatState(r10.after)}.`
        : `R9 left ${formatState(r9.after)}, and a wait of ${seconds(wait)} s at ${perSecond(rate)} brings the balance to ${formatState(uncapped)}, under min(5, …)'s cap. R10 spends one and leaves ${formatState(r10.after)}.${capped.length ? ` At ${listed(capped.map(perSecond))} the same wait would pass five, and min(5, …) would stop the balance there.` : ''}`,
    ];
    for (const [index, [from, to]] of GROUPS.entries()) {
      await this.step(['burst', 'refill', 'later'][index]!, {
        title: titles[index],
        line: lines[index],
        caption: captions[index],
      });
      // Ask the program, one request at a time. The focus bar follows allow(): on the refill lines
      // while the bucket refills, then on the line that answered. It is the code's, not the
      // model's, so it moves beside the machine, a call at a time.
      for (let i = from; i < to; i++) {
        const ok = bucketRequest(bucketOf(), TIMES[i]!).calls[i]!.ok;
        await this.play(
          machine.send('request'),
          new Succession([new Transform(code.bar, bar(REFILL), { runTime: REFILL_S }), new Transform(code.bar, bar(ok ? SPEND : REFUSE), { runTime: ANSWER_S })]),
        );
      }
      // The bar already stands where the last call left it; this names those lines for the description.
      const last = bucketOf().calls.at(-1)!;
      await code.focus(last.ok ? SPEND : REFUSE, { as: last.ok ? 'spend' : 'refuse', runTime: 0.2 });
      // What a phone reader is shown first: R5's 200 beside R6's 429, then what R7 found.
      if (index === 0) s.opening(part(chips, 'request:R5'), part(chips, 'request:R6'), names[4]!, names[5]!);
      // R7 (its climb, dot, drop and tag) and R6's tag, where the climb to R7 starts, are read together.
      if (index === 1)
        s.opening(...['balance:refill:R7', 'balance:found:R7', 'balance:spend:R7', 'balance:found:R7:value', 'balance:tag:R6'].flatMap((k) => chart.current.find(k) ?? []));
      if (index === 2)
        s.opening(code.code.lines[1]!, part(chips, 'request:R9'), part(chips, 'request:R10'), times[8]!, times[9]!, names[8]!, names[9]!,
          readout.current.children[0]!, readout.current.values['Tokens left']!,
          ...['balance:refill:R10', 'balance:found:R10', 'balance:spend:R10', 'balance:cap:note'].flatMap((k) => chart.current.find(k) ?? []));
    }

    // --------------------------------------------------------------- trace
    // R7–R9, the requests whose answer the rate decides on this schedule.
    const between = (r: number) => refusedAt(r).filter((n) => ['R7', 'R8', 'R9'].includes(n));
    const betweenSay = (r: number) =>
      between(r).length ? `${listed(between(r))} ${between(r).length > 1 ? 'are' : 'is'} refused` : 'none of them is refused';
    // Below a fifth of a token a second, R6–R9 all fail, the bucket refills from empty at 0 s, and R10 at 5 s finds
    // under 5 × 0.2 = 1 token (test/explain-token-bucket.test.ts).
    await this.step('trace', {
      title: 'The same ten requests at 1, 2 and 4 tokens a second',
      line: `429s at 4 / s: ${listed(refusedAt(4))}; at 1 / s: ${listed(refusedAt(1))}.`,
      caption: `Each row runs the same ten requests at its labelled refill rate; the outlined row is this scenario. Circles are 200s and crosses are 429s. R6 is refused at every rate, because no time passes inside the burst, and R10 is accepted at every rate, because after its ${seconds(wait)}-second wait it finds at least ${formatState(Math.min(...RATES.map((r) => runs.get(r)![9]!.found)))} tokens. Those are the three rates offered here; below a fifth of a token a second, R10 too would find less than one token. For R7 to R9 the rate decides: at ${perSecond(4)} ${betweenSay(4)}; at ${perSecond(1)} ${betweenSay(1)}. The bucket’s capacity sets the burst, and its rate sets how soon the client can send again.`,
    });
    // The curves explain refill in earlier steps. End on a large comparison of
    // their outcomes, so a phone reader sees all three rates together.
    await s.clear();
    const comparison = view(this, (state) =>
      drawComparison(RATES.map((r) => [r, r === rate ? (state.responses as number[]) : runs.get(r)!.map((c) => (c.ok ? 200 : 429))] as const), rate, TIMES.length, colours),
    );
    this.readout = comparison;
    await s.enter(comparison, {
      describe: () =>
        'Requests R1 to R10, left to right. ' +
        RATES.map((r) => `${r} / s: ${listed(refusedAt(r))} ${refusedAt(r).length > 1 ? 'get' : 'gets'} 429; all other requests get 200`).join('. ') +
        `. The ${rate} / s row is outlined.`,
    });
  }
}
