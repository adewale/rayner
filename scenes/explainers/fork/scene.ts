import { table } from '../lib/reader-drawing.ts';
import { Scene, Rectangle, Text, Group, Circle, Cross, FadeOut } from '../../../src/index.ts';
import type { Mobject } from '../../../src/index.ts';
import { stage, regionBox } from '../../../explain/index.ts';
import { VOCABULARY } from '../../../explain/words.ts';
import { TokenBucket } from '../lib/models.ts';
import { PLACEMENTS } from '../lib/traffic-policy.ts';
const STYLE = 'github-light';
// Upstream Lantern at the fork base, 2c7bad5: README "Outputs", app/worker.ts, src/mermaid.ts, src/doc.ts.
const LANTERN =
  'graph LR\nDoc[JSON doc]\nParser[Flowchart parser]\nScene[Scene class]\nClock[Fixed dt clock]\nPlayer[Dev player]\nWorker[Worker]\nFrames[SVG frames]\nDoc --> Scene\nParser --> Scene\nScene --> Clock\nClock --> Player\nClock --> Worker\nClock --> Frames';
// The fork: docs/UPSTREAM.md and the design record's table of what is inherited and what changes.
const FORK =
  'graph LR\nSettings[Settings]\nCapture[Agentic Mermaid]\nSnaps[Snapshots]\nScene[Scene class]\nClock[Fixed dt clock]\nPage[Embed page]\nFrames[SVG frames]\nImage[PNG stills]\nCheck[rayner check]\nSettings --> Scene\nCapture --> Snaps\nSnaps --> Scene\nScene --> Clock\nClock --> Page\nClock --> Frames\nFrames --> Image\nClock --> Check';
// scenes/explainers/token-bucket/scene.ts: its one setting, and the ten requests it sends.
const SETTINGS = [
  'static settings = [{',
  "  id: 'rate', label: 'Refill per second', default: '2',",
  "  options: [{ value: '1', label: '1 token' },",
  "            { value: '2', label: '2 tokens' },",
  "            { value: '4', label: '4 tokens' }],",
  '}];',
];
const TIMES = [0, 0, 0, 0, 0, 0, 0.5, 1, 1, 5];
/** The token bucket's refill options, as SETTINGS declares them, and a rate it does not offer. */
const RATES = [1, 2, 4];
const UNBUILT = 0.1;
// scenes/explainers/traffic-policy/scene.ts: its two settings, externalTrafficPolicy and where the pods run.
const POLICIES = ['Local', 'Cluster'];
const PODS = Object.keys(PLACEMENTS);
const CASES = PODS.length * POLICIES.length;
/** What rayner check fails a case on (tools/lib/explain-check.ts checkProject, and the glyph check every command runs). */
const CHECKS: readonly (readonly [string, readonly string[]])[] = [
  ['Motion and clock', ['motion', 'still during the caption', 'seek equals play', 'skipped trace']],
  ['Resting pictures', ['each step changes', 'text collisions', 'routes over labels', 'legibility']],
  ['Words', ['descriptions', 'glyphs', 'the stated answer']],
  ['Code', ['catch lint', 'bare runtime']],
];
const CHECK_COUNT = CHECKS.reduce((n, [, items]) => n + items.length, 0);
/** The diagram families the explainers name and describe (explain/words.ts). */
const FAMILIES = Object.keys(VOCABULARY.en!.families!).length;
const GONE = ['Doc', 'Parser', 'Player', 'Worker'];
// The diagram takes the top three fifths; cards sit under it.
const ABOVE = regionBox('top', { bottom: -1.1 }),
  BELOW = regionBox('bottom', { top: -1.35 });

/** The ten requests through the token bucket's own model at one refill rate. */
function runAt(rate: number) {
  const bucket = new TokenBucket(rate);
  return TIMES.map((at) => {
    const ok = bucket.allow(at);
    return { ok, found: bucket.tokens + (ok ? 1 : 0) };
  });
}
const perSecond = (r: number) => `${r} token${r === 1 ? '' : 's'} a second`;

/** The script's one-sentence answer (meta.answer), which the untested step states. */
const ANSWER =
  'Rayner builds every case before anyone reads it, so the author can check each one, and a reader can open only a case that was checked';

export default class ForkExplainer extends Scene {
  static meta = {
    id: 'fork',
    title: 'Why build the page before readers open it?',
    sources: [
      'https://github.com/ivarvong/lantern/blob/2c7bad5/README.md',
      'https://github.com/ivarvong/lantern/blob/2c7bad5/app/worker.ts',
      'https://github.com/ivarvong/lantern/blob/2c7bad5/src/mermaid.ts',
      'https://github.com/adewale/rayner/blob/main/docs/UPSTREAM.md',
      'https://github.com/adewale/rayner/blob/main/scenes/explainers/token-bucket/scene.ts',
    ],
    // The script's answer and check questions (script.md); the untested step states the answer.
    answer: ANSWER,
    checks: [
      {
        question: 'Below what refill rate would the token bucket’s R10 be refused, and why can no reader of that page see it?',
        answer:
          'Below 0.2 tokens a second. At such rates R7 to R9 are refused, so nothing is spent after the burst, and R10 at 5 s finds 5 × rate tokens: under one below 0.2. The page offers only 1, 2 and 4 tokens a second, the cases it built and checked.',
      },
      {
        question:
          'A link can open any step of the token bucket page, at any of its three rates. Why is opening a step from a link safe when a typed rate of 0.1 would not be?',
        answer:
          'A step link picks a step inside a case the build made, and rayner check went through every step of every built case, so the picture it opens was checked. A rate of 0.1 asks for a case nobody built, where the page’s sentence about R10 is false.',
      },
    ],
  };
  override async construct() {
    const s = stage(this, { headingSize: 0.6, style: STYLE });
    const ink = s.palette.ink;
    const runs = new Map([...RATES, UNBUILT].map((r) => [r, runAt(r)] as const));
    const r10 = (r: number) => runs.get(r)![TIMES.length - 1]!;
    // The second and third steps say R10 gets 200 at every offered rate and 429 at the unbuilt one.
    if (!RATES.every((r) => r10(r).ok) || r10(UNBUILT).ok)
      throw new Error('R10 must be accepted at every offered rate and refused at the unbuilt one');

    // 1. A sentence that is true of every case the page offers.
    const pitch = 0.82,
      x0 = -2.9,
      labelX = -7.4,
      findsX = x0 + pitch * (TIMES.length - 1) + 0.75;
    const rowY = (i: number) => 1.15 - i * 1.05;
    const header = new Group();
    TIMES.forEach((_, i) =>
      header.add(new Text(`R${i + 1}`, { fontSize: 0.26, color: ink }).moveTo([x0 + i * pitch, 2.05])),
    );
    header.add(new Text('Request', { fontSize: 0.26, color: s.soft, anchor: 'start' }).moveTo([labelX, 2.05], [-1, 0]));
    const row = (r: number, i: number, built: boolean) => {
      const g = new Group();
      const y = rowY(i);
      g.add(
        new Text(built ? perSecond(r) : `${perSecond(r)}, not offered`, {
          fontSize: 0.26,
          color: built ? ink : s.bad,
          anchor: 'start',
        }).moveTo([labelX, y], [-1, 0]),
      );
      runs.get(r)!.forEach((call, j) => {
        const circle = new Circle({ radius: 0.2, stroke: call.ok ? s.good : s.bad, strokeWidth: 0.05 }).moveTo([x0 + j * pitch, y]);
        const mark: Mobject = call.ok ? circle : new Cross(circle, { stroke: s.bad, strokeWidth: 0.05 });
        mark.key = `call:${r}:R${j + 1}`;
        g.add(mark);
      });
      g.add(
        new Text(`R10 finds ${r10(r).found.toFixed(1)}`, { fontSize: 0.24, font: 'mono', color: r10(r).ok ? ink : s.bad, anchor: 'start' }).moveTo(
          [findsX, y],
          [-1, 0],
        ),
      );
      g.key = `rate:${r}`;
      return g;
    };
    const key = new Text('circle: 200, accepted · cross: 429, refused · a request needs 1 token', { fontSize: 0.22, color: s.soft }).moveTo([0, -3.2]);
    const column = (rows: number) => {
      const x = x0 + pitch * (TIMES.length - 1);
      return new Rectangle({ width: 0.62, height: rows * 1.05 + 0.5, stroke: s.emphasis, strokeWidth: 0.04, cornerRadius: 0.1 }).moveTo([
        x,
        2.05 - (rows * 1.05 + 0.5) / 2 + 0.25,
      ]);
    };
    await this.step('sentence', {
      title: '“R10 is accepted at every rate”',
      line: `Predict: at ${perSecond(UNBUILT)}, a rate the page doesn’t offer, is it still true?`,
      caption: `Rayner’s token bucket explainer sends ten requests, R1 to R10, through a bucket that refills at ${RATES.slice(0, -1).join(', ')} or ${RATES.at(-1)} tokens a second, the only rates its reader can choose. Its last step says R10 is accepted at every rate, and at each of those three it is: R10 arrives after a four-second wait and finds at least one token, so its outlined column is a circle in every row. A page could instead take any rate a reader types and show the same sentence.`,
    });
    await s.clear();
    const rows = RATES.map((r, i) => row(r, i, true));
    const pending = new Group(
      new Text(`${perSecond(UNBUILT)}, not offered`, { fontSize: 0.26, color: s.soft, anchor: 'start' }).moveTo([labelX, rowY(3) - 0.25], [-1, 0]),
      new Text('?', { fontSize: 0.5, color: s.soft, weight: 'bold' }).moveTo([x0 + pitch * (TIMES.length - 1), rowY(3) - 0.25]),
    );
    await s.enter(header, ...rows, column(3), key, {
      describe: `The token bucket’s ten requests at ${RATES.map(perSecond).join(', ')}: ${RATES.map((r) => `${runs.get(r)!.filter((c) => !c.ok).length} refused`).join(', ')}; R10, outlined, is accepted at each, finding ${RATES.map((r) => r10(r).found.toFixed(1)).join(', ')} tokens.`,
    });
    await s.enter(pending, { describe: `Below, a row for ${perSecond(UNBUILT)} with a question mark where R10’s answer goes.` });
    this.state.offered = RATES.map((r) => ({ rate: r, r10: r10(r).ok ? 200 : 429 }));

    // 2. The answer, from the same model at a rate the page never built.
    const slow = r10(UNBUILT);
    await this.step('untested', {
      title: `At ${perSecond(UNBUILT)}, R10 finds ${slow.found.toFixed(1)} tokens and is refused`,
      line: 'The sentence holds at every rate the page built and fails at one it never built.',
      caption: `In the new bottom row, the same model at ${perSecond(UNBUILT)} refuses R7, R8 and R9, and in the five seconds since the burst only ${slow.found.toFixed(1)} tokens have come back, so R10 gets 429. The page’s author ran and read all three offered cases; nobody can do that for every rate a reader might type. ${ANSWER}.`,
    });
    const slowRow = row(UNBUILT, 3, false);
    slowRow.shift([0, -0.25]);
    await this.play(new FadeOut(pending, { runTime: 0.3 }));
    await s.enter(slowRow, {
      shift: [0, -0.2],
      describe: `Added below the three offered rates: the ten requests at ${perSecond(UNBUILT)}, not offered, where only ${runs.get(UNBUILT)!.filter((c) => c.ok).length} are accepted and R10 finds ${slow.found.toFixed(1)} tokens and is refused.`,
    });
    this.state.unbuilt = { rate: UNBUILT, r10: slow.ok ? 200 : 429, found: Number(slow.found.toFixed(2)) };

    // 3. Where the live page went: Lantern rendered whatever was asked; Rayner offers what it built.
    await this.step('live', {
      title: 'Lantern, which Rayner forks, rendered any frame on request',
      line: 'Rayner deleted that Worker; its pages offer only the cases listed in the scene.',
      caption: `Lantern is the animation engine Rayner was forked from, at commit 2c7bad5. Its Cloudflare Worker, marked in the diagram, re-ran a scene to whatever step or time a client asked for and served the frame, its text or the trace, caching nothing. Rayner deleted the Worker. Below is the token bucket’s one setting as its scene declares it: the three rates in that list are the cases its build made, and the page has no others.`,
    });
    await s.clear();
    const lantern = await s.show({ source: LANTERN }, { box: regionBox(ABOVE, { right: 3 }) });
    await lantern.mark(['Worker'], { color: s.emphasis, as: 'renders on request' });
    // What the Worker did, beside it: GET /frame.svg?scene=&step= or &t=, rendered when asked.
    const worker = lantern.get('Worker').box()!;
    await s.enter(
      new Text('any step or time, on request', { fontSize: 0.24, color: s.emphasis, anchor: 'start' }).moveTo(
        [worker[2] + 0.25, (worker[1] + worker[3]) / 2],
        [-1, 0],
      ),
      { describe: 'Beside Worker: any step or time, rendered on request.' },
    );
    await s.code(SETTINGS, { at: BELOW, fontSize: 0.24 });

    // 4. The price, the ending: every combination of settings is a case to build and check.
    await this.step('cases', {
      title: `${PODS.length} pod placements × ${POLICIES.length} traffic policies make ${CASES} cases to build`,
      line: 'Every combination of options is a case the build makes and the author checks.',
      caption: `Building every case first has a price: settings multiply. Rayner’s traffic-policy explainer has two settings, externalTrafficPolicy with ${POLICIES.length} options and the placement of pods on its three nodes with ${PODS.length}, so its build makes ${POLICIES.length} × ${PODS.length} = ${CASES} cases, and a third setting would multiply that again. A reader of that page switches among those ${CASES} and no others.`,
    });
    await s.clear();
    const grid = table(
      ['Pods per node', ...POLICIES],
      PODS.map((pods, r) => [pods.replaceAll('-', ', '), ...POLICIES.map((_, p) => `case ${r * POLICIES.length + p + 1}`)]),
      s,
      { xs: [-5, 0, 5], y: 2.2, gap: 1.45, key: 'fork-cases' },
    );
    await s.enter(grid, {
      describe: `A table of the traffic-policy explainer’s ${PODS.length} pod placements by its ${POLICIES.length} policies, ${POLICIES.join(' and ')}: ${CASES} cases, numbered 1 to ${CASES}`,
    });
    this.state.cases = { count: CASES, policies: POLICIES, pods: PODS };

    // Details after the ending: what the build does for each case, and what replaced Lantern's live parts.
    await this.step('fork', {
      detail: true,
      title: 'For each case the build draws every diagram once',
      line: 'Diagrams are captured at build time, so the page runs no diagram renderer.',
      caption: `The four parts marked deleted, Lantern’s JSON document, flowchart parser, development player and Worker, are gone. The embed page replaces the player, and capture replaces the parser: Agentic Mermaid, the Mermaid layout library Rayner uses, draws each diagram in Chromium at build time and stores the snapshot beside the scene. The author pays for that: capturing a new diagram needs Chromium, though building a page from stored snapshots does not.`,
    });
    await s.clear();
    const flow = await s.show({ source: LANTERN }, { box: ABOVE });
    await flow.mark(GONE, { color: s.bad, as: 'deleted' });
    await flow.morph({ source: FORK });
    await flow.walk(
      [
        ['Settings', 'Scene'],
        ['Capture', 'Snaps'],
        ['Snaps', 'Scene'],
        ['Scene', 'Clock'],
        ['Clock', 'Page'],
      ],
      { trail: true },
    );
    await flow.note('Capture', `${FAMILIES} diagram families, Chromium at build`, { side: 'below' });
    await flow.note('Page', 'no diagram renderer', { side: 'above' });
    this.state.families = FAMILIES;

    // What the build checks for each case.
    await this.step('checks', {
      detail: true,
      title: `Each case must pass ${CHECK_COUNT} checks before it ships`,
      line: 'Each added case is run through every check again.',
      caption: `rayner check runs every case and fails the build on any of ${CHECK_COUNT} problems, from a seeked frame that differs from the played one to text under 14 px or a step that never states the scene’s answer. rayner describe prints every caption of every case for the author to read. Both commands work only on cases the build has made.`,
    });
    await s.clearOverlays();
    await flow.focus('all');
    await flow.dim(['Settings', 'Scene', 'Clock', 'Check']);
    await flow.walk([['Clock', 'Check']], { trail: true });
    await s.card(
      CHECKS.map(([group, items]) => [`${group} (${items.length})`, items.join(', ')]),
      { at: BELOW, fontSize: 0.22 },
    );
    this.state.checks = CHECK_COUNT;

    // A detail after the ending: the page holds each resting picture for its caption. It reads the
    // timing of the 'fork' step, which has ended by now.
    const shown = this.steps.find((st) => st.name === 'fork')!;
    const words = String(shown.meta.caption).trim().split(/\s+/).length;
    const motion = (shown.hold ?? shown.t1!) - shown.t0,
      held = shown.hold == null ? 0 : shown.t1! - shown.hold;
    await this.step('timing', {
      detail: true,
      title: 'The page holds each resting picture for its caption',
      line: `Moving ${motion.toFixed(1)} s, then still for ${held.toFixed(1)} s.`,
      caption: `A step lasts at least as long as its caption takes to read at ${Scene.captionWpm} words a minute. The fork step’s ${words}-word caption needs ${(motion + held).toFixed(1)} seconds; its motion takes ${motion.toFixed(1)}, so the clock holds the resting picture still for the other ${held.toFixed(1)}.`,
    });
    await s.clearOverlays();
    await flow.unmark();
    await flow.dim(['Clock', 'Frames', 'Image']);
    await flow.focus(['Clock', 'Page', 'Frames', 'Image', 'Check'], { zoom: 0.95 });
    // One bar per phase of the 'fork' step, to scale.
    const unit = 11 / (motion + held),
      bx = -5.5,
      y = -2.85;
    const phase = (from: number, len: number, fill: string, label: string) => {
      const bar = new Rectangle({ width: len * unit, height: 0.55, fill, fillOpacity: 0.85, stroke: 'none' }).moveTo([
        bx + (from + len / 2) * unit,
        y,
      ]);
      const text = new Text(label, { fontSize: 0.24, color: ink }).moveTo([bx + (from + len / 2) * unit, y - 0.6]);
      return new Group(bar, text);
    };
    await s.enter(
      new Text(`Step 'fork' on the page: ${(motion + held).toFixed(1)} s`, {
        fontSize: 0.26,
        color: ink,
        weight: 'bold',
      }).moveTo([0, -1.85]),
      phase(0, motion, s.emphasis, `moving: ${motion.toFixed(1)} s`),
      phase(motion, held, s.soft, `still, caption of ${words} words: ${held.toFixed(1)} s`),
      {
        describe: `A timeline of the fork step on the page: ${motion.toFixed(1)} seconds of motion, then ${held.toFixed(1)} seconds still under its ${words}-word caption`,
      },
    );
    this.state.timing = { motion: Number(motion.toFixed(2)), held: Number(held.toFixed(2)), words };
  }
}
