import {
  Scene,
  Rectangle,
  Text,
  Group,
  Dot,
  Axes,
  FadeIn,
  FadeOut,
  Create,
  Follow,
  Transform,
  AnimationGroup,
  Succession,
  Machine,
  choreograph,
  view,
  StateReadout,
  Circle,
  Cross,
} from '../../../src/index.ts';
import type { ScheduledAnimation as Animation, Mobject, SceneState, Vec, View, VMobject } from '../../../src/index.ts';
import { stage, settingsOf } from '../../../explain/index.ts';
import { TokenBucket, bucketStart, bucketRequest } from '../lib/models.ts';
import type { BucketCall as Call, BucketState } from '../lib/models.ts';

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
const fmt = (n: number) => n.toFixed(1);
/** Seconds as the captions write them: 5, 1.5. */
const seconds = (t: number) => (Number.isInteger(t) ? String(t) : t.toFixed(1));
const name = (i: number) => 'R' + (i + 1);
const perSecond = (r: number) => `${r} token${r > 1 ? 's' : ''} a second`;

/** The ten requests through the model at one refill rate. */
function runAt(rate: number): Call[] {
  const bucket = new TokenBucket(rate, CAPACITY);
  return TIMES.map((at) => {
    const ok = bucket.allow(at);
    return { at, ok, found: bucket.tokens + (ok ? 1 : 0), after: bucket.tokens };
  });
}
/**
 * The balance between the previous call and this one, as allow() would
 * compute it at each moment: what the last call left plus
 * (now − lastRefill) × rate, capped at five. Straight, with a corner where the
 * cap is reached; it ends at what this call found.
 */
function climb(prev: { at: number; after: number }, call: Call, rate: number): [number, number][] {
  const points: [number, number][] = [[prev.at, prev.after]];
  if (prev.after + (call.at - prev.at) * rate > CAPACITY + 1e-9)
    points.push([prev.at + (CAPACITY - prev.after) / rate, CAPACITY]);
  points.push([call.at, call.found]);
  return points;
}
const START = { at: 0, after: CAPACITY };
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
/** "R6", "R6 and R9", "R6, R7 and R9". */
const list = (names: string[]) =>
  names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;

// The check questions' runs, from the same model (test/explain-token-bucket.test.ts checks them).
/** The schedule at 2 a second with a bucket of six tokens. */
const SIX_TOKENS = (() => {
  const bucket = new TokenBucket(2, 6);
  return TIMES.map((at) => (bucket.allow(at) ? 200 : 429));
})();
/** One request every 0.4 s at 2 a second: the first refused, and how many of requests 101–200 get through. */
const STEADY = (() => {
  const bucket = new TokenBucket(2, CAPACITY),
    ok = Array.from({ length: 200 }, (_, n) => bucket.allow(n * 0.4));
  return { first: ok.indexOf(false) + 1, share: ok.slice(100).filter(Boolean).length };
})();
/** R10 moved to 1.5 s, at each rate: what R9 left, what R10 found, and its answer. */
const MOVED = RATES.map((rate) => {
  const bucket = new TokenBucket(rate, CAPACITY);
  TIMES.slice(0, 9).forEach((at) => bucket.allow(at));
  const left = bucket.tokens,
    ok = bucket.allow(1.5);
  return { rate, left, found: bucket.tokens + (ok ? 1 : 0), ok };
});

/** Drop repeated points; a line needs two distinct ones. */
const distinct = (points: [number, number][]) =>
  points.filter((p, i) => i === 0 || p[0] !== points[i - 1]![0] || p[1] !== points[i - 1]![1]);

export default class TokenBucketExplainer extends Scene {
  static meta = {
    id: 'token-bucket',
    title: 'How does a token bucket let a burst through but refuse a flood?',
    sources: [
      'https://github.com/ivarvong/lantern/blob/2c7bad5/scenes/token-bucket.ts',
      // The oracle: tools/oracle/token-bucket runs this schedule through rate.Limiter.
      'https://pkg.go.dev/golang.org/x/time@v0.15.0/rate',
      'https://www.rfc-editor.org/rfc/rfc6585#section-4',
    ],
    // The readout's own words, which the captions use too.
    watch: { tokens: 'Tokens left', allowed: 'Accepted', rejected: 'Rejected' },
    // check holds the burst step to stating the answer.
    answer: 'A burst can spend only the tokens saved up, and only elapsed time adds more',
    checks: [
      {
        question: 'R6 is refused at all three rates. Would a faster refill or a bigger bucket let it through, and why?',
        answer: `A bigger bucket. R1 to R6 arrive at the same instant, so no time passes and refill adds nothing at any rate. A bucket of six tokens, still at 2 a second, answers R6 with ${SIX_TOKENS[5]}.`,
      },
      {
        question: 'At 2 tokens a second, a client sends one request every 0.4 seconds from a full bucket and never pauses. Is any request refused, and what share gets through in the long run?',
        answer: `Yes. Each gap earns 0.8 tokens and each request spends one, so the saved five drain by 0.2 a request and request ${STEADY.first} is the first refused. From then on ${STEADY.share} of every 100 get through, 2 a second: the refill rate, however long the flood lasts.`,
      },
      {
        question: 'Suppose R10 arrived at 1.5 s instead of 5 s. At which of the three rates would it be refused?',
        answer: `At ${list(MOVED.filter((m) => !m.ok).map((m) => perSecond(m.rate)))} only. ${MOVED.map((m, i) => `${i ? 'at' : 'At'} ${m.rate} a second R9 leaves ${formatState(m.left)} and R10 finds ${formatState(m.found)}`).join('; ')}. Half a second has to earn the token R9 did not leave.`,
      },
    ],
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
    const ink = s.palette.ink,
      soft = s.soft;

    // A dry run of the same model at every rate, so titles and captions can name its answers.
    const runs = new Map(RATES.map((r) => [r, runAt(r)] as const)),
      plan = runs.get(rate)!;
    const codes = (a: number, b: number) =>
      plan
        .slice(a, b)
        .map((r) => (r.ok ? 200 : 429))
        .join(', ');
    const refusedAt = (r: number) => runs.get(r)!.flatMap((c, i) => (c.ok ? [] : [name(i)]));
    /** When a climb from `prev` to `call` reached the capacity, where min(capacity, …) took over; null when it stayed under. */
    const cappedAt = (prev: { at: number; after: number }, call: Call) =>
      prev.after + (call.at - prev.at) * rate > CAPACITY + 1e-9 ? prev.at + (CAPACITY - prev.after) / rate : null;
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
              ? `${list(refused)} ${refused.length > 1 ? 'are' : 'is'} under the one-token line and got 429`
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
          ? `${ok} answered 200${no.length ? `, ${list(no)} 429` : ''}${calls.length < TIMES.length ? `, ${TIMES.length - calls.length} waiting` : ''}`
          : 'none answered yet')
      );
    };
    const gaugeSays = () => `The bucket, filled to ${fmt(bucketOf().tokens)} of ${CAPACITY} tokens`;

    // ---- request chips: one per call, filled in as each answer comes back
    const PITCH = 1.46,
      CHIP_Y = 2.3;
    const chipX = (i: number) => (i - 4.5) * PITCH;
    const chip = (i: number, result: boolean | null) => {
      const color = result == null ? s.palette.muted : result ? s.good : s.bad;
      const box = new Rectangle({
        width: 1.22,
        height: 0.95,
        cornerRadius: 0.1,
        fill: result == null ? s.palette.paper : color,
        fillOpacity: result == null ? 1 : 0.22,
        stroke: color,
        strokeWidth: result == null ? 0.02 : 0.035,
        ...(result == null ? { dashArray: '0.08 0.06' } : {}),
      });
      const label = new Text(name(i), { fontSize: 0.2, color: soft }).moveTo([0, 0.24]);
      const answer = new Text(result == null ? '…' : result ? '200' : '429', {
        fontSize: 0.3,
        font: 'mono',
        weight: 'bold',
        color: result == null ? soft : ink,
      }).moveTo([0, -0.14]);
      const request = new Group(box, label, answer).moveTo([chipX(i), CHIP_Y]);
      request.key = `request:${name(i)}`;
      return request;
    };
    const times = TIMES.map((t, i) =>
      new Text('t = ' + t, { fontSize: 0.2, color: soft }).moveTo([chipX(i), CHIP_Y + 0.72]),
    );
    times.forEach((time, i) => { time.key = `arrival:${name(i)}`; });

    // ---- the chart: tokens over time. Its y axis has the gauge's scale, so the
    // bucket's level always stands where the chart's line ends.
    const Y0 = -3.87,
      Y5 = 0.57;
    const axes = new Axes({
      xRange: [0, TIMES.at(-1)!, 1],
      yRange: [0, CAPACITY, 1],
      width: 7.2,
      height: Y5 - Y0,
      axisStyle: { stroke: s.palette.muted, labelColor: soft, labelFontSize: 0.2, includeNumbers: true },
      xLabel: 's',
      yLabel: 'tokens',
      axisLabelFontSize: 0.2,
    });
    axes.shift([-5.6 - axes.c2p(0, 0)[0], Y0 - axes.c2p(0, 0)[1]]);
    const need = axes.horizontalLine(1, {
      stroke: soft,
      strokeWidth: 0.02,
      dashArray: '0.1 0.08',
      to: TIMES.at(-1)! - 0.6,
    });
    const needLabel = new Text('1 token', { fontSize: 0.2, color: soft }).moveTo(
      [axes.c2p(TIMES.at(-1)! - 0.55, 1)[0], axes.c2p(TIMES.at(-1)! - 0.55, 1)[1] + 0.17],
      [-1, 0],
    );
    const line = (points: [number, number][], color: string, width = 0.045) => {
      const p = distinct(points);
      return p.length < 2 ? null : axes.lineGraph(p, { color, strokeWidth: width });
    };

    // ---- the gauge: a bucket whose level is the balance
    const SHELL_X = -6.75,
      SHELL_W = 1.1;
    const shell = new Rectangle({
      width: SHELL_W,
      height: Y5 - Y0 + 0.16,
      stroke: s.palette.muted,
      strokeWidth: 0.03,
      fill: s.palette.paper,
    }).moveTo([SHELL_X, (Y0 + Y5) / 2]);
    const fill = (n: number) => {
      const level = new Rectangle({
        width: SHELL_W - 0.16,
        height: Math.max(0.001, ((Y5 - Y0) * n) / CAPACITY),
        stroke: 'none',
        fill: s.palette.accent,
      }).moveTo([SHELL_X, Y0], [0, -1]);
      level.key = 'bucket:level';
      return level;
    };
    /** The height of `n` tokens in the bucket. */
    const levelY = (n: number) => Y0 + ((Y5 - Y0) * n) / CAPACITY;
    shell.key = 'bucket:shell';
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
    /** A climb drawn up to time t: the share of the line's length at or before t, as Create reveals a stroke. */
    const climbTo = (points: [number, number][], t: number) => {
      const path = line(points, s.palette.accent)!;
      const ps = distinct(points),
        ws = ps.map(([x, y]) => axes.c2p(x, y));
      let total = 0,
        upTo = 0;
      for (let i = 1; i < ps.length; i++) {
        const len = Math.hypot(ws[i]![0] - ws[i - 1]![0], ws[i]![1] - ws[i - 1]![1]),
          [t0, t1] = [ps[i - 1]![0], ps[i]![0]];
        total += len;
        upTo += t >= t1 ? len : t > t0 ? (len * (t - t0)) / (t1 - t0) : 0;
      }
      const share = total > 0 ? upTo / total : 1;
      if (share < 1) path.style.drawFraction = share;
      path.style.opacity = share > 0 ? 1 : 0;
      return path;
    };
    const bucketLabel = new Text('bucket', { fontSize: 0.2, color: soft }).moveTo([SHELL_X, Y0 - 0.33]);

    // ---- the pictures of the model's state: every part keyed, so a transition can move each
    /** The balance in the bucket. */
    const gaugePicture = (st: BucketState) => new Group(fill(st.tokens));
    /** Each call's climb, its drop when it spent a token, its dot, and the tags on the calls the captions name. */
    const chartPicture = (st: BucketState) => {
      const parts: Mobject[] = [];
      const add = (m: Mobject | null, key: string) => { if (m) { m.key = key; parts.push(m); } };
      const notes: Mobject[] = [];
      st.calls.forEach((call, i) => {
        const prev = st.calls[i - 1] ?? START;
        add(line(climb(prev, call, rate), s.palette.accent), `balance:refill:${name(i)}`);
        add(call.ok ? line([[call.at, call.found], [call.at, call.after]], s.palette.accent) : null, `balance:spend:${name(i)}`);
        const dot = axes.dot(call.at, call.found, { radius: 0.085, color: call.ok ? s.good : s.bad });
        add(dot, `balance:found:${name(i)}`);
        // Refused calls are named by their dot; R7, the predicted call, also shows what it found.
        if (i === 6)
          // R7: centred above its dot, between the climb into it and the climb out.
          add(new Text(`${name(i)}: ${fmt(call.found)}`, { fontSize: 0.22, color: call.ok ? s.good : s.bad }).moveTo([dot.center()[0], dot.center()[1] + 0.32], [0, 0]), 'balance:found:R7:value');
        else if (!call.ok)
          // Refused: above and to the left, since the line climbs away to the right.
          add(new Text(name(i), { fontSize: 0.2, color: s.bad }).moveTo([dot.center()[0] - 0.12, dot.center()[1] + 0.28], [1, 0]), `balance:tag:${name(i)}`);
        // The flat run along five is the refill min(5, …) threw away; say so where it is.
        const full = cappedAt(prev, call);
        if (full != null) {
          const [x, y] = axes.c2p((full + call.at) / 2, CAPACITY);
          const note = new Text('full: min(5, …)', { fontSize: 0.2, color: s.palette.accent }).moveTo([x, y + 0.24]);
          note.key = i === TIMES.length - 1 ? 'balance:cap:note' : `balance:cap:note:${name(i)}`;
          notes.push(note);
        }
      });
      return new Group(...parts, ...notes);
    };
    const chipsPicture = (st: BucketState) => new Group(...TIMES.map((_, i) => chip(i, st.calls[i]?.ok ?? null)));
    const part = (v: View, key: string) => v.current.find(key)!;

    // ------------------------------------------------------------- balance
    await this.step('balance', {
      title: 'Ten requests from one client, and a bucket of five tokens',
      line: 'Predict: R1–R6 arrive at the same instant. How many get 200?',
      caption:
        'A server shares its work among many clients, so it limits each one: a request it serves gets 200, OK, and one it refuses gets 429, Too Many Requests, which tells the client to slow down. A short burst, such as the requests a page makes as it loads, should still get through. So the server keeps a balance for the client of at most five tokens: the bucket. Each accepted request spends one token, and a request that finds less than one, under the dashed line, gets 429. Ten requests will arrive at the times written above their boxes.',
    });
    await s.clear();
    const start = bucketStart(rate, CAPACITY);
    this.state = start as unknown as SceneState;
    const gauge = view(this, (st) => gaugePicture(st as unknown as BucketState), { place: false });
    const chart = view(this, (st) => chartPicture(st as unknown as BucketState), { place: false });
    const chips = view(this, (st) => chipsPicture(st as unknown as BucketState), { place: false });
    const readout = view(
      this,
      (state) => {
        const rows = new StateReadout(
          [
            ['Tokens left', formatState(state.tokens)],
            ['Last refill (s)', formatState(state.lastRefill)],
            ['Accepted', formatState(state.allowed)],
            ['Rejected', formatState(state.rejected)],
          ],
          {
            fontSize: 0.26,
            gap: 0.42,
            at: [4.9, -2.78],
          },
        );
        rows.children[0]!.key = 'balance:label';
        rows.values['Tokens left']!.key = 'balance:value';
        return rows;
      },
    );
    this.readout = readout;
    const readoutTitle = new Text('Bucket balance', { fontSize: 0.2, color: soft }).moveTo([3.3, -2.4], [-1, 0]);
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
    s.keep(chips, ...times, { describe: chipsSay });
    await this.play(new FadeIn(chips, { runTime: 0.4 }), ...times.map((t) => new FadeIn(t)));
    const code = await s.code(CODE, {
      at: [2.15, -2.25, 7.75, 1.55],
      title: `bucket.allow(now), rate = ${rate}`,
      fontSize: 0.22,
    });
    code.code.lines[1]!.key = 'balance:cap';
    await this.play(new FadeIn(readout), new FadeIn(readoutTitle));
    await code.focus(REFILL, { as: 'refill' });

    /** The focus bar's place on lines a..b, as CodeBlock.focus draws it, for use inside a Succession. */
    const barAt = ([a, b]: readonly [number, number]) => {
      const lines = code.code.lines,
        pitch = Math.abs(lines[1]!.anchorPoint()[1] - lines[0]!.anchorPoint()[1]),
        top = lines[a]!.anchorPoint()[1] + pitch / 2,
        bottom = lines[b]!.anchorPoint()[1] - pitch / 2;
      return new Rectangle({
        width: code.panel.width() - 0.14,
        height: top - bottom,
        cornerRadius: 0.05,
        stroke: 'none',
      })
        .setStyle({ ...code.bar.style })
        .moveTo([code.panel.center()[0], (top + bottom) / 2]);
    };

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
          const climbed = climb(prev, call, rate);
          const balanceAt = (t: number) => (t >= call.at ? call.found : Math.min(CAPACITY, prev.after + (t - prev.at) * rate));
          const refill = new Follow(
            { from: prev.at, to: call.at, draw: (t) => (rise ? [fill(balanceAt(t)), climbTo(climbed, t)] : fill(balanceAt(t))) },
            { targets: [level, ...(rise ? [rise] : [])], runTime: REFILL_S },
          );
          // The answer. A 200 takes the top token out of the bucket to the request, as the level
          // and the line drop by one; a 429 finds no whole token there, and the request turns red.
          const top = levelY(call.found);
          const answer: Animation[] = [
            ...(call.ok ? [c.enter(`balance:spend:${n}`, { create: true }, { runTime: ANSWER_S })] : []),
            c.enter(`balance:found:${n}`, {}, { runTime: ANSWER_S }),
            new Transform(level, g.to('bucket:level'), { runTime: ANSWER_S }),
            q.leave(`request:${n}`, { runTime: ANSWER_S }),
            q.enter(`request:${n}`, {}, { runTime: ANSWER_S }),
            readout.sync({ match: 'index', runTime: ANSWER_S }),
          ];
          if (call.ok) {
            const coin = (at: Vec) => new Circle({ radius: 0.13, fill: s.palette.accent, fillOpacity: 1, stroke: 'none' }).moveTo(at);
            const token = g.insert('bucket:token', coin([SHELL_X, top - 0.14]));
            answer.push(
              new Succession([
                new Transform(token, coin([SHELL_X, top - 0.14]), { runTime: 0.18 }),
                new Transform(token, coin([chipX(i), CHIP_Y - 0.62]), { runTime: 0.27 }),
                g.leave('bucket:token', { runTime: 0.15 }),
              ]),
            );
          } else {
            const ring = (opacity: number) =>
              new Circle({ radius: 0.13, fill: 'none', stroke: s.bad, strokeWidth: 0.035, dashArray: '0.06 0.05', opacity }).moveTo([SHELL_X, levelY(Math.max(call.found, 0)) + 0.18]);
            const missing = g.insert('bucket:missing', ring(0));
            answer.push(new Succession([new Transform(missing, ring(1), { runTime: 0.3 }), g.leave('bucket:missing', { runTime: 0.3 })]));
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
      ? 'All three dots stay at or above the dashed line, so all three get 200.'
      : `${lowNames} ${low.length > 1 ? 'are' : 'is'} under the dashed line, so ${low.length > 1 ? 'they get' : 'it gets'} 429.`;
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
      `No time passed between R1 and R6, so the line drops one token per request and R6 finds ${f(5)}, under the dashed line: 429. A burst can spend only the tokens saved up, and only elapsed time adds more. On each arrival the server adds elapsed time multiplied by the refill rate, here ${perSecond(rate)}, before deciding whether to spend a token. The line between arrivals shows available credit; no background timer needs to update the balance.`,
      `Between calls the line climbs ${perSecond(rate)}. Half a second after the burst, R7 finds ${tokens(r7.found)}, ${r7.ok ? 'enough for one request' : 'less than the one a request needs'}, so it gets ${code7}. The rate decides it: the same half second buys ${list(halfSecond)}. R8 at 1 s finds ${f(7)}; R9 arrives at the same instant, so nothing is added and it finds what R8 left. Fractional tokens are saved, but a request must spend a whole one. ${verdict}`,
      uncapped > CAPACITY
        ? `R9 left ${formatState(r9.after)}. A wait of ${seconds(wait)} s at ${perSecond(rate)} would bring the balance to ${formatState(uncapped)}, but min(5, …) stops it at five, reached at ${seconds(fullAt)} s, and the line runs flat from there. However long a client waits, its next burst is at most five requests. R10 spends one and leaves ${formatState(r10.after)}.`
        : `R9 left ${formatState(r9.after)}, and a wait of ${seconds(wait)} s at ${perSecond(rate)} brings the balance to ${formatState(uncapped)}, under min(5, …)'s cap. R10 spends one and leaves ${formatState(r10.after)}.${capped.length ? ` At ${list(capped.map(perSecond))} the same wait would pass five, and min(5, …) would stop the balance there.` : ''}`,
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
          new Succession([new Transform(code.bar, barAt(REFILL), { runTime: REFILL_S }), new Transform(code.bar, barAt(ok ? SPEND : REFUSE), { runTime: ANSWER_S })]),
        );
      }
      // The bar already stands where the last call left it; this names those lines for the description.
      const last = bucketOf().calls.at(-1)!;
      await code.focus(last.ok ? SPEND : REFUSE, { as: last.ok ? 'spend' : 'refuse', runTime: 0.2 });
      // What a phone reader is shown first: R5's 200 beside R6's 429, then what R7 found.
      if (index === 0) s.reading(part(chips, 'request:R5'), part(chips, 'request:R6'));
      // R7 (its climb, dot, drop and tag) and R6's tag, where the climb to R7 starts, are read together.
      if (index === 1)
        s.reading(...['balance:refill:R7', 'balance:found:R7', 'balance:spend:R7', 'balance:found:R7:value', 'balance:tag:R6'].flatMap((k) => chart.current.find(k) ?? []));
      if (index === 2)
        s.reading(code.code.lines[1]!, part(chips, 'request:R9'), part(chips, 'request:R10'), times[8]!, times[9]!,
          readout.current.children[0]!, readout.current.values['Tokens left']!,
          ...['balance:refill:R10', 'balance:found:R10', 'balance:spend:R10', 'balance:cap:note'].flatMap((k) => chart.current.find(k) ?? []));
    }

    // --------------------------------------------------------------- trace
    // R7–R9, the requests whose answer the rate decides on this schedule.
    const between = (r: number) => refusedAt(r).filter((n) => ['R7', 'R8', 'R9'].includes(n));
    const betweenSay = (r: number) =>
      between(r).length ? `${list(between(r))} ${between(r).length > 1 ? 'are' : 'is'} refused` : 'none of them is refused';
    // Below a fifth of a token a second, R6–R9 all fail, the bucket refills from empty at 0 s, and R10 at 5 s finds
    // under 5 × 0.2 = 1 token (test/explain-token-bucket.test.ts).
    await this.step('trace', {
      title: 'The same ten requests at 1, 2 and 4 tokens a second',
      line: `429s at 4 / s: ${list(refusedAt(4))}; at 1 / s: ${list(refusedAt(1))}.`,
      caption: `Each row runs the same ten requests at its labelled refill rate; the outlined row is this case. Circles are 200s and crosses are 429s. R6 is refused at every rate, because no time passes inside the burst, and R10 is accepted at every rate, because after its ${seconds(wait)}-second wait it finds at least ${formatState(Math.min(...RATES.map((r) => runs.get(r)![9]!.found)))} tokens. Those are the three rates offered here; below a fifth of a token a second, R10 too would find less than one token. For R7 to R9 the rate decides: at ${perSecond(4)} ${betweenSay(4)}; at ${perSecond(1)} ${betweenSay(1)}. The bucket’s capacity sets the burst, and its rate sets how soon the client can send again.`,
    });
    // The curves explain refill in earlier steps. End on a large comparison of
    // their outcomes, so a phone reader sees all three rates together.
    await s.clear();
    const comparison = view(this, (state) => {
      const picture = new Group();
      const first = -3.7,
        pitch = 1.12;
      for (let i = 0; i < TIMES.length; i++)
        picture.add(new Text(String(i + 1), { fontSize: 0.7, color: ink }).moveTo([first + i * pitch, 2.5]));
      for (const [row, r] of RATES.entries()) {
        const y = 1.05 - row * 1.65;
        picture.add(new Text(`${r} / s`, { fontSize: 0.7, color: ink }).moveTo([-6.25, y]));
        if (r === rate)
          picture.add(
            new Rectangle({
              width: 14.4,
              height: 1.3,
              cornerRadius: 0.12,
              stroke: s.palette.accent,
              strokeWidth: 0.05,
            }).moveTo([0, y]),
          );
        const responses = r === rate ? (state.responses as number[]) : runs.get(r)!.map((c) => (c.ok ? 200 : 429));
        for (const [i, response] of responses.entries()) {
          const circle = new Circle({
            radius: 0.24,
            stroke: response === 200 ? s.good : s.bad,
            strokeWidth: 0.06,
          }).moveTo([first + i * pitch, y]);
          const mark = response === 200 ? circle : new Cross(circle, { stroke: s.bad, strokeWidth: 0.06 });
          mark.key = `result:${r}:R${i + 1}:${response}`;
          picture.add(mark);
        }
      }
      picture.add(new Text('Request', { fontSize: 0.7, color: ink }).moveTo([-6.0, 2.5]));
      picture.add(new Text('Circle: 200     Cross: 429', { fontSize: 0.7, color: ink }).moveTo([0, -3.8]));
      return picture;
    });
    this.readout = comparison;
    await s.enter(comparison, {
      describe: () =>
        'Requests R1 to R10, left to right. ' +
        RATES.map((r) => `${r} / s: ${list(refusedAt(r))} ${refusedAt(r).length > 1 ? 'get' : 'gets'} 429; all other requests get 200`).join('. ') +
        `. The ${rate} / s row is outlined.`,
    });
  }
}
