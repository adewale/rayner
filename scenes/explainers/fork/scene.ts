import { table } from '../lib/reader-drawing.ts';
import { Scene, Rectangle, Text, Group, Circle, Cross, FadeOut, Line, Arrow } from '../../../src/index.ts';
import type { Mobject } from '../../../src/index.ts';
import { stage, regionBox, resolveSettings } from '../../../explain/index.ts';
import type { ExplainerClass } from '../../../explain/index.ts';
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
/** The token bucket's setting, as SETTINGS lists it; the choice step resolves links against it. */
const RATE_SETTING = {
  id: 'rate',
  label: 'Refill per second',
  default: '2',
  options: [
    { value: '1', label: '1 token' },
    { value: '2', label: '2 tokens' },
    { value: '4', label: '4 tokens' },
  ],
};
/** The token bucket's refill options, and a rate it does not offer. */
const RATES = RATE_SETTING.options.map((o) => Number(o.value));
const UNBUILT = 0.1;
// scenes/explainers/traffic-policy/scene.ts: its two settings, externalTrafficPolicy and where the pods run.
const POLICIES = ['Local', 'Cluster'];
const PODS = Object.keys(PLACEMENTS);
const CASES = PODS.length * POLICIES.length;
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
  'Rayner builds every case before anyone reads it, so rayner check can test each one and the author can read it, and a reader can open only a case the build made';

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
    // Sentences about every rate, case or combination, and the test that holds each.
    claims: [
      {
        says: 'R10 is accepted at every rate',
        test: "test/explain-fidelity.test.ts: every authored case exposes the program's answers at step boundaries",
      },
      {
        says: 'the only rates its reader can choose',
        test: "test/explain-fidelity.test.ts: every authored case exposes the program's answers at step boundaries",
      },
      {
        says: 'The sentence holds at every rate the page built',
        test: "test/explain-fidelity.test.ts: every authored case exposes the program's answers at step boundaries",
      },
      {
        says: 'tokens have come back, so R10 gets 429',
        test: "test/explain-fidelity.test.ts: every authored case exposes the program's answers at step boundaries",
      },
      {
        says: 'Rayner builds every case before anyone reads it',
        test: 'test/explain-gates.test.ts: the build makes every combination of options a case, rayner check tests each, and a reader can open no other',
      },
      {
        says: 'A reader can choose only a rate the scene lists',
        test: 'test/explain-gates.test.ts: the build makes every combination of options a case, rayner check tests each, and a reader can open no other',
      },
      {
        says: 'Every combination of options is a case the build makes and rayner check tests',
        test: 'test/explain-gates.test.ts: the build makes every combination of options a case, rayner check tests each, and a reader can open no other',
      },
    ],
    checks: [
      {
        question:
          'On the token bucket page, R8 and R9 arrive together at 1 s. If its author moved R10 from 5 s to 1.5 s, at which offered rate would ‘R10 is accepted at every rate’ become false, and could a reader see the false sentence?',
        answer:
          'At 1 token a second. There R8 spends the one token that has come back by 1 s, so at 1.5 s the bucket holds half a token and R10 gets 429; at 2 and 4 tokens a second it is still accepted. A reader could see it only if the author published without reading that case, because 1 token a second is a case the build makes and the author can run and read.',
      },
      {
        question:
          'Someone shares a link to the token bucket page that ends in ?rate=0.1. What does the reader see, and do they meet the false sentence about R10?',
        answer:
          'The player looks for 0.1 among the rates the scene lists, finds none, and opens the default case, 2 tokens a second, with the notice “Unknown rate option: 0.1. Showing the default case.” The reader sees a case the author ran, where R10 is accepted; the 0.1 row exists only in this explainer.',
      },
      {
        question:
          'The traffic-policy page has two policies and three pod placements. Its author wants a third setting, the number of nodes, with four values. How many cases would the build make and the author need to read, and when is such a setting worth adding?',
        answer:
          'Twenty-four: 2 × 3 × 4. Each is built, checked and must be read before publishing, so a setting earns its place when one of its values changes what the page concludes, not merely a number on it.',
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
      line: `At ${perSecond(UNBUILT)}, a rate the page doesn’t offer, is it still true?`,
      caption: `The token-bucket page offers ${RATES.join(', ')} tokens a second, the only rates its reader can choose. R10 succeeds in all three, so its caption says “R10 is accepted at every rate”. Would that sentence survive a reader typing ${UNBUILT}?`,
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
      caption: `At ${perSecond(UNBUILT)}, R10 still needs a whole token. After five seconds only ${slow.found.toFixed(1)} tokens have come back, so R10 gets 429. The caption described the offered inputs, not arbitrary rates. ${ANSWER}.`,
    });
    const slowRow = row(UNBUILT, 3, false);
    slowRow.shift([0, -0.25]);
    await this.play(new FadeOut(pending, { runTime: 0.3 }));
    await s.enter(slowRow, {
      shift: [0, -0.2],
      describe: `Added below the three offered rates: the ten requests at ${perSecond(UNBUILT)}, not offered, where only ${runs.get(UNBUILT)!.filter((c) => c.ok).length} are accepted and R10 finds ${slow.found.toFixed(1)} tokens and is refused.`,
    });
    this.state.unbuilt = { rate: UNBUILT, r10: slow.ok ? 200 : 429, found: Number(slow.found.toFixed(2)) };

    // 3. Why no reader meets that row: a link picks one of the cases the build made, or gets the default.
    const resolver = { settings: [RATE_SETTING] } as unknown as ExplainerClass;
    const open = (asked: string) => {
      try {
        return { asked, opens: resolveSettings(resolver, { rate: asked }).rate! };
      } catch (e) {
        return { asked, opens: RATE_SETTING.default, refused: (e as Error).message };
      }
    };
    const links = [open('4'), open(String(UNBUILT))];
    const fallback = links[1]!;
    const byDefault = perSecond(Number(RATE_SETTING.default));
    if (!fallback.refused || links[0]!.opens !== '4') throw new Error('A listed rate must open its case and 0.1 must be refused');
    await this.step('choice', {
      title: `The build made ${RATES.length} cases, and a link opens one of them`,
      line: `A link naming ${UNBUILT} matches no case, so the page opens the default, ${byDefault}.`,
      caption: `The rate setting lists ${RATES.length} options, so the build ran the scene once for each and rayner check tested each of the ${RATES.length} cases; R10 is accepted in all three. A link picks a case by naming its option: ?rate=4 opens the 4-token case. ?rate=${UNBUILT} matches no option, so Rayner refuses it with “${fallback.refused}” and opens the default case, ${byDefault}. The ${UNBUILT} row from the last step exists in this explainer, not on the token-bucket page.`,
    });
    await s.clear();
    {
      const W = 3.1,
        H = 0.68,
        pitch = 0.8,
        top = 1.3;
      const y = (i: number) => top - i * pitch;
      const slotY = y(RATES.length);
      const left = -W / 2,
        right = W / 2;
      const two = (a: string, b: string, at: number, color: string, colorB = s.soft) =>
        new Group(
          new Text(a, { fontSize: 0.28, color, anchor: 'start' }).moveTo([left + 0.18, at + 0.15], [-1, 0]),
          new Text(b, { fontSize: 0.25, color: colorB, anchor: 'start' }).moveTo([left + 0.18, at - 0.16], [-1, 0]),
        );
      const cases = new Group();
      RATE_SETTING.options.forEach((o, i) => {
        const r = Number(o.value),
          isDefault = o.value === RATE_SETTING.default;
        cases.add(
          new Rectangle({ width: W, height: H, stroke: isDefault ? s.emphasis : ink, strokeWidth: isDefault ? 0.05 : 0.025, cornerRadius: 0.08 }).moveTo([0, y(i)]),
          two(perSecond(r), `R10: ${r10(r).ok ? 200 : 429}, checked`, y(i), ink, r10(r).ok ? s.good : s.bad),
        );
      });
      // Where a 0.1 case would sit: the build made none.
      const slot = new Rectangle({ width: W, height: H, stroke: s.bad, strokeWidth: 0.03, cornerRadius: 0.08, fill: 'none' }).moveTo([0, slotY]);
      slot.style.dashArray = '0.14 0.1';
      cases.add(slot, two(`${perSecond(UNBUILT)}`, 'no case: never built', slotY, s.bad, s.bad));
      cases.key = 'fork-choice-cases';
      // The setting's name labels the column, beside its first case, clear of the fallback's path below.
      const heading = new Group(
        new Text(RATE_SETTING.label, { fontSize: 0.3, color: ink, weight: 'bold', anchor: 'end' }).moveTo([left - 0.3, top + 0.16], [1, 0]),
        new Text(`${RATES.length} cases`, { fontSize: 0.26, color: s.soft, anchor: 'end' }).moveTo([left - 0.3, top - 0.17], [1, 0]),
      );
      // Links come in from the right.
      const arrow = (from: number, to: number, at: number, color: string) =>
        new Arrow([from, at], [to, at], { stroke: color, strokeWidth: 0.04, tipLength: 0.22, tipWidth: 0.2 });
      const linkX = right + 1.5;
      const link = (text: string, at: number, color: string) =>
        new Group(
          new Text(text, { fontSize: 0.3, font: 'mono', color, anchor: 'start' }).moveTo([linkX + 0.15, at], [-1, 0]),
          arrow(linkX, right + 0.08, at, color),
        );
      const four = link(`?rate=${links[0]!.asked}`, y(RATES.indexOf(Number(links[0]!.opens))), ink);
      const slow = link(`?rate=${fallback.asked}`, slotY, s.bad);
      const defaultY = y(RATE_SETTING.options.findIndex((o) => o.value === RATE_SETTING.default));
      const tag = new Text('the default case', { fontSize: 0.3, color: s.emphasis, anchor: 'start' }).moveTo([right + 0.3, defaultY], [-1, 0]);
      // Refused, the link falls back along the left side to the default case.
      const back = left - 0.5,
        to = y(RATE_SETTING.options.findIndex((o) => o.value === fallback.opens));
      const redirect = new Group(
        new Line([left - 0.05, slotY], [back, slotY], { stroke: s.emphasis, strokeWidth: 0.04 }),
        new Line([back, slotY], [back, to], { stroke: s.emphasis, strokeWidth: 0.04 }),
        arrow(back, left - 0.08, to, s.emphasis),
      );
      redirect.key = 'fork-choice-fallback';
      const refusal = new Group(
        new Text(String(fallback.refused), { fontSize: 0.28, color: s.bad }).moveTo([0, slotY - H / 2 - 0.4]),
        new Text('so the page opens the default case', { fontSize: 0.28, color: s.emphasis }).moveTo([0, slotY - H / 2 - 0.8]),
      );
      await s.enter(heading, cases, tag, four, slow, redirect, refusal, {
        describe: `The ${RATES.length} cases the build made for the token bucket’s rate setting, ${RATE_SETTING.options.map((o) => perSecond(Number(o.value))).join(', ')}, each checked, with R10 accepted; the default is ${byDefault}. Below them a dashed, empty slot for ${perSecond(UNBUILT)}: no case. A link ?rate=4 points at the 4-token case; ?rate=${UNBUILT} points at the empty slot and is redirected, “${fallback.refused}”, to the default case.`,
      });
    }
    this.state.choice = {
      setting: RATE_SETTING,
      cases: RATE_SETTING.options.map((o) => ({ rate: o.value, r10: r10(Number(o.value)).ok ? 200 : 429, default: o.value === RATE_SETTING.default })),
      links,
    };

    // 4. Where the live page went: Lantern rendered whatever was asked; Rayner offers what it built.
    await this.step('live', {
      title: 'Lantern, the engine Rayner was forked from, rendered frames on request',
      line: 'A reader can choose only a rate the scene lists, and each listed rate is a case the build runs.',
      caption: `Lantern’s Worker rendered requested scene times on demand. Rayner prepares the page and diagrams ahead of reading instead. A reader can choose only a rate the scene lists. That gives an author a finite set of outcomes to inspect, but publishing a prepared page still does not make an unchecked caption true for arbitrary inputs.`,
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

    // 5. The price, the ending: every combination of settings is a case to build and check.
    await this.step('cases', {
      title: `${PODS.length} pod placements × ${POLICIES.length} traffic policies make ${CASES} cases to build`,
      line: 'Every combination of options is a case the build makes and rayner check tests.',
      caption: `Prepared inputs have a cost: settings multiply. ${POLICIES.length} policies combined with ${PODS.length} pod placements produce ${CASES} cases, and another setting multiplies that collection again. Finite review becomes more work as the number of combinations grows.`,
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
      title: 'The build draws the diagrams ahead of the page',
      line: 'Diagrams are captured at build time, so the page runs no diagram renderer.',
      caption: 'The build captures Agentic Mermaid’s diagrams and saves their geometry. The finished page draws those snapshots without a diagram renderer. Chromium is needed for capture, while stored snapshots can be used to build a page without recapturing them.',
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

    // A detail after the ending: the page holds each resting picture for its caption. It reads the
    // timing of the 'fork' step, so that step ends here, holding for its caption as any step does.
    await this.endCurrentStep();
    const shown = this.steps.find((st) => st.name === 'fork')!;
    const words = String(shown.meta.caption).trim().split(/\s+/).length;
    const motion = (shown.hold ?? shown.t1!) - shown.t0,
      held = shown.hold == null ? 0 : shown.t1! - shown.hold;
    await this.step('timing', {
      detail: true,
      title: 'The page holds each resting picture for its caption',
      line: `Moving ${motion.toFixed(1)} s, then still for ${held.toFixed(1)} s.`,
      caption: `The scene clock reserves reading time after motion. This caption needs ${(motion + held).toFixed(1)} seconds at ${Scene.captionWpm} words a minute; the ${motion.toFixed(1)}-second animation leaves ${held.toFixed(1)} seconds at rest. The caption therefore does not have to compete with a still-changing picture.`,
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
