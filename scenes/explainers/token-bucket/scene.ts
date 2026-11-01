import { readerFirst } from '../lib/reader-drawing.ts';
import { frames as readerFrames } from '../lib/readers/token-bucket.ts';
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
  Transform,
  AnimationGroup,
  Succession,
  ViewSync,
  view,
  StateReadout,
  Circle,
  Cross,
} from '../../../src/index.ts';
import type { Animation, Mobject, SceneState, SyncOpts, View } from '../../../src/index.ts';
import { stage, settingsOf } from '../../../explain/index.ts';
import { TokenBucket } from '../lib/models.ts';

const TIMES = [0, 0, 0, 0, 0, 0, 0.5, 1, 1, 2];
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
const name = (i: number) => 'R' + (i + 1);
const perSecond = (r: number) => `${r} token${r > 1 ? 's' : ''} a second`;

/** One call of allow(): when it came, what it found after refill, and what it left. */
interface Call {
  at: number;
  ok: boolean;
  found: number;
  after: number;
}
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
/** Drop repeated points; a line needs two distinct ones. */
const distinct = (points: [number, number][]) =>
  points.filter((p, i) => i === 0 || p[0] !== points[i - 1]![0] || p[1] !== points[i - 1]![1]);

/**
 * A readout sync that first makes one call's result the scene's state. In a
 * Succession it begins when its turn comes, so each request's members show
 * that request's state, and the step ends on the last one.
 */
class SyncToCall extends ViewSync {
  owner: Scene;
  result: SceneState;
  constructor(owner: Scene, readout: View, result: SceneState, opts: SyncOpts) {
    super(readout, opts);
    this.owner = owner;
    this.result = result;
  }
  override begin(): void {
    this.owner.state = this.result;
    super.begin();
  }
}

export default class TokenBucketExplainer extends Scene {
  static meta = {
    id: 'token-bucket',
    title: 'Why can a token bucket reject a burst?',
    sources: ['https://github.com/ivarvong/lantern/blob/2c7bad5/scenes/token-bucket.ts'],
    // The readout's own words, which the captions use too.
    watch: { tokens: 'Tokens left', allowed: 'Accepted', rejected: 'Rejected' },
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
      bucket = new TokenBucket(rate, CAPACITY),
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
    const list = (names: string[]) =>
      names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
    /** The calls made so far, in order: what every readout and description reports. */
    const calls: Call[] = [];

    // ---- descriptions of the native drawings, read at every step boundary
    const chartSays = () => {
      const refused = calls.flatMap((c, i) => (c.ok ? [] : [`${name(i)} at ${fmt(c.found)}`]));
      return !calls.length
        ? `A chart of tokens, 0 to ${CAPACITY}, against time, 0 to 2.5 s, with a dashed line at the one token a request needs`
        : `A chart of the balance over time: it climbs at ${rate} a second between calls and drops one token for each 200. ` +
            `Dots mark what R1–${name(calls.length - 1)} found; ` +
            (refused.length
              ? `${list(refused)} ${refused.length > 1 ? 'are' : 'is'} under the one-token line and got 429`
              : 'none is under the one-token line');
    };
    const chipsSay = () => {
      const ok = calls.filter((c) => c.ok).length,
        no = calls.flatMap((c, i) => (c.ok ? [] : [name(i)]));
      return (
        'Requests R1 to R10 at their arrival times: ' +
        (calls.length
          ? `${ok} answered 200${no.length ? `, ${list(no)} 429` : ''}${calls.length < TIMES.length ? `, ${TIMES.length - calls.length} waiting` : ''}`
          : 'none answered yet')
      );
    };
    const gaugeSays = () => `The bucket, filled to ${fmt(bucket.tokens)} of ${CAPACITY} tokens`;

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
    const chips = TIMES.map((_, i) => chip(i, null));
    const times = TIMES.map((t, i) =>
      new Text('t = ' + t, { fontSize: 0.2, color: soft }).moveTo([chipX(i), CHIP_Y + 0.72]),
    );
    times.forEach((time, i) => { time.key = `arrival:${name(i)}`; });

    // ---- the chart: tokens over time. Its y axis has the gauge's scale, so the
    // bucket's level always stands where the chart's line ends.
    const Y0 = -3.87,
      Y5 = 0.57;
    const axes = new Axes({
      xRange: [0, 2.5, 0.5],
      yRange: [0, CAPACITY, 1],
      width: 5.8,
      height: Y5 - Y0,
      axisStyle: { stroke: s.palette.muted, labelColor: soft, labelFontSize: 0.2, includeNumbers: true },
      xAxisStyle: { decimals: 1 },
      xLabel: 's',
      yLabel: 'tokens',
      axisLabelFontSize: 0.2,
    });
    axes.shift([-5.2 - axes.c2p(0, 0)[0], Y0 - axes.c2p(0, 0)[1]]);
    const need = axes.horizontalLine(1, {
      stroke: soft,
      strokeWidth: 0.02,
      dashArray: '0.1 0.08',
      to: 2,
    });
    const needLabel = new Text('1 token', { fontSize: 0.2, color: soft }).moveTo(
      [axes.c2p(2.05, 1)[0], axes.c2p(2.05, 1)[1] + 0.17],
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
    const fill = (n: number) =>
      new Rectangle({
        width: SHELL_W - 0.16,
        height: Math.max(0.001, ((Y5 - Y0) * n) / CAPACITY),
        stroke: 'none',
        fill: s.palette.accent,
      }).moveTo([SHELL_X, Y0], [0, -1]);
    const level = fill(CAPACITY);
    const bucketLabel = new Text('bucket', { fontSize: 0.2, color: soft }).moveTo([SHELL_X, Y0 - 0.33]);

    // ------------------------------------------------------------- balance
    await readerFirst(this, s, readerFrames(rate));
    await this.step('balance', {
      detail: true,
      title: 'Five tokens of burst capacity',
      line: 'allow(now) adds refill on each call; no timer runs.',
      caption:
        'The bucket starts full at five tokens, and each accepted request spends one. allow(now) adds refill for the time since the last call, so no background timer runs. The chart will plot the balance over time; the dashed line is the one token a request needs.',
    });
    await s.clear();
    const record = (calls: Call[]) => ({
      rate,
      tokens: bucket.tokens,
      lastRefill: bucket.lastRefill,
      responses: calls.map((c) => (c.ok ? 200 : 429)),
      balances: calls.map((c) => c.after),
      allowed: calls.filter((c) => c.ok).length,
      rejected: calls.flatMap((c, i) => (c.ok ? [] : [name(i)])),
    });
    this.state = record([]);
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
    await s.enter(shell, level, bucketLabel, { describe: gaugeSays });
    s.keep(axes, { describe: chartSays });
    await this.play(new Create(axes), { runTime: 2 });
    await s.enter(need, needLabel, { describe: chartSays });
    s.keep(chips[0]!, ...chips.slice(1), ...times, { describe: chipsSay });
    await this.play(...chips.map((c) => new FadeIn(c, { runTime: 0.4 })), ...times.map((t) => new FadeIn(t)));
    const code = await s.code(CODE, {
      at: [1.3, -2.25, 7.55, 1.55],
      title: `bucket.allow(now), rate = ${rate}`,
      fontSize: 0.25,
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

    // ---------------------------------------- burst, refill, later: the calls
    const titles = [
      'Six at once: five 200s, then a 429',
      `Refill at ${rate}/s: R7–R9 get ${codes(6, 9)}`,
      `R10 arrives at 2 s and gets ${codes(9, 10)}`,
    ];
    const f = (i: number) => fmt(plan[i]!.found);
    // Which of R7–R9 found under one token, with the balance each one found.
    const low = [6, 7, 8].filter((i) => !plan[i]!.ok),
      lowNames = low.map((i) => `${name(i)} (${f(i)})`).join(' and ');
    const verdict = !low.length
      ? 'All three dots stay at or above the dashed line, so all three get 200.'
      : `${lowNames} ${low.length > 1 ? 'are' : 'is'} under the dashed line, so ${low.length > 1 ? 'they get' : 'it gets'} 429.`;
    const lines = [
      `No time passes, so no refill: R6 finds ${f(5)} tokens.`,
      `Between calls the balance climbs ${perSecond(rate)}.`,
      `R10 finds ${f(9)}; min(5, …) keeps the balance at five or below.`,
    ];
    const captions = [
      `Six requests arrive at time zero. No time has passed, so refill adds nothing and the line drops one token per request. The sixth finds ${f(5)} tokens, under the dashed line, and gets 429.`,
      `Between calls the line climbs at ${rate} a second: (now − lastRefill) × ${rate}. R7 at 0.5 s finds ${f(6)} and R8 at 1 s finds ${f(7)}; R9 arrives at the same instant as R8 and finds what R8 left. ${verdict}`,
      `R10 arrives at 2 s, one second after R9, and finds ${f(9)}. The min(5, …) cap keeps the balance at five or below however long a client waits. R10 spends one token and leaves ${fmt(plan[9]!.after)}.`,
    ];
    for (const [index, [from, to]] of GROUPS.entries()) {
      await this.step(['burst', 'refill', 'later'][index]!, {
        detail: true,
        title: titles[index],
        line: lines[index],
        caption: captions[index],
      });
      // Ask the program, one request at a time; each call's members show its answer.
      const members: Animation[] = [];
      const evidence: Mobject[] = [];
      for (let i = from; i < to; i++) {
        const now = TIMES[i]!,
          prev = calls.at(-1) ?? START;
        const ok = bucket.allow(now);
        const call: Call = { at: now, ok, found: bucket.tokens + (ok ? 1 : 0), after: bucket.tokens };
        calls.push(call);
        const after = record(calls);
        // Refill: the bar on the min(…) lines while the line climbs to what the call found.
        const rise = line(climb(prev, call, rate), s.palette.accent);
        if (rise) {
          rise.key = `balance:refill:${name(i)}`;
          s.keep(rise, { describe: chartSays });
        }
        members.push(
          new AnimationGroup([new Transform(code.bar, barAt(REFILL)), ...(rise ? [new Create(rise)] : [])], {
            runTime: 0.3,
          }),
        );
        // The verdict: spend one token or refuse, and every readout follows.
        const drop = ok
          ? line(
              [
                [now, call.found],
                [now, call.after],
              ],
              s.palette.accent,
            )
          : null;
        const dot = axes.dot(now, call.found, { radius: 0.085, color: ok ? s.good : s.bad });
        dot.key = `balance:found:${name(i)}`;
        if (drop) drop.key = `balance:spend:${name(i)}`;
        evidence.push(...(rise ? [rise] : []), dot, ...(drop ? [drop] : []));
        const tag = ok
          ? null
          : new Text(name(i), { fontSize: 0.2, color: s.bad }).moveTo(
              // Above and to the left: the line climbs away to the right.
              [dot.center()[0] - 0.12, dot.center()[1] + 0.28],
              [1, 0],
            );
        s.keep(dot, ...(drop ? [drop] : []), ...(tag ? [tag] : []), { describe: chartSays });
        const marks: Animation[] = [new FadeIn(dot), ...(tag ? [new FadeIn(tag)] : [])];
        const next = chip(i, ok);
        s.keep(next, { describe: chipsSay });
        members.push(
          new AnimationGroup(
            [
              new Transform(code.bar, barAt(ok ? SPEND : REFUSE)),
              ...(drop ? [new Create(drop)] : []),
              ...marks,
              new FadeOut(chips[i]!),
              new FadeIn(next),
              new Transform(level, fill(call.after)),
              // By position: a value that gains characters ("0" to "0.5") splits its
              // glyphs outward instead of growing new ones inside a box that jumps.
              new SyncToCall(this, readout, after, { match: 'index' }),
            ].map((a) => a.setOptions({ runTime: 0.4 })),
          ),
        );
        chips[i] = next;
      }
      await this.play(new Succession(members));
      // The bar already stands where the last call left it; this names those lines for the description.
      const last = calls.at(-1)!;
      await code.focus(last.ok ? SPEND : REFUSE, { as: last.ok ? 'spend' : 'refuse', runTime: 0.2 });
      if (index === 2)
        s.reading(code.code.lines[1]!, chips[8]!, chips[9]!, times[8]!, times[9]!,
          readout.current.children[0]!, readout.current.values['Tokens left']!, ...evidence);
    }

    // --------------------------------------------------------------- trace
    const refused = RATES.map((r) => `${perSecond(r)}, ${list(refusedAt(r))}`);
    await this.step('trace', {
      detail: true,
      title: 'The same ten requests at 1, 2 and 4 tokens a second',
      line: `429s at 4 / s: ${list(refusedAt(4))}; at 1 / s: ${list(refusedAt(1))}.`,
      caption: `Each row runs the same ten requests at its labelled refill rate; the outlined row is this case. Circles are accepted requests and crosses are 429s. At ${refused[2]} gets 429; at ${refused[0]} do.`,
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
        RATES.map((r) => `${r} / s: ${list(refusedAt(r))} get 429; all other requests get 200`).join('. ') +
        `. The ${rate} / s row is outlined.`,
    });
  }
}
