import { table, keyed } from '../../../explain/drawing.ts';
import { stagedStep } from '../../../explain/index.ts';
import { Scene, Rectangle, Text, Group, Circle, Cross, Line, Arrow, view } from '../../../src/index.ts';
import type { Mobject } from '../../../src/index.ts';
import { stage, regionBox, resolveSettings } from '../../../explain/index.ts';
import type { ExplainerClass } from '../../../explain/index.ts';
import { TokenBucket } from '../token-bucket/model.ts';
import { PLACEMENTS } from '../traffic-policy/model.ts';
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
const SCENARIOS = PODS.length * POLICIES.length;
/** The diagram families the explainers name and describe; test/explain-fidelity.test.ts holds it to explain/words.ts. */
const FAMILIES = 15;
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
/** One rate's ten requests as a step records them: each answer (200 or 429), and the tokens R10 finds. */
interface RateRun { rate: number; offered: boolean; responses: number[]; found: number }
/** The opening steps' state: the offered rates' answers, each rate's run, and the rate the page never built. */
interface SentenceState { offered: { rate: number; r10: number }[]; runs: RateRun[]; pending: { rate: number } }
/** The token bucket's rate setting, each scenario it makes with R10's answer there, and where two links land. */
interface Choice {
  setting: typeof RATE_SETTING;
  scenarios: { rate: string; r10: number; default: boolean }[];
  links: { asked: string; opens: string; refused?: string }[];
}
/** The 'fork' step on the page: seconds moving, seconds still, and the words its caption holds. */
interface Timing { motion: number; held: number; words: number }
const perSecond = (r: number) => `${r} token${r === 1 ? '' : 's'} a second`;

/** The script's one-sentence answer (meta.answer), which the untested step states. */
const ANSWER =
  'Rayner builds every scenario before anyone reads it, so rayner check can test each one and the author can read it, and a reader can open only a scenario the build made';

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
    // Sentences about every rate, scenario or combination, and the test that holds each.
    claims: [
      {
        says: 'R10 is accepted at every rate',
        test: "test/explain-fidelity.test.ts: every authored scenario exposes the program's answers at step boundaries",
      },
      {
        says: 'the only rates its reader can choose',
        test: "test/explain-fidelity.test.ts: every authored scenario exposes the program's answers at step boundaries",
      },
      {
        says: 'The sentence holds at every rate the page built',
        test: "test/explain-fidelity.test.ts: every authored scenario exposes the program's answers at step boundaries",
      },
      {
        says: 'tokens have come back, so R10 gets 429',
        test: "test/explain-fidelity.test.ts: every authored scenario exposes the program's answers at step boundaries",
      },
      {
        says: 'Rayner builds every scenario before anyone reads it',
        test: 'test/explain-gates.test.ts: the build makes every combination of options a scenario, rayner check tests each, and a reader can open no other',
      },
      {
        says: 'A reader can choose only a rate the scene lists',
        test: 'test/explain-gates.test.ts: the build makes every combination of options a scenario, rayner check tests each, and a reader can open no other',
      },
      {
        says: 'Every combination of options is a scenario the build makes and rayner check tests',
        test: 'test/explain-gates.test.ts: the build makes every combination of options a scenario, rayner check tests each, and a reader can open no other',
      },
    ],
    checks: [
      {
        question:
          'On the token bucket page, R8 and R9 arrive together at 1 s. If its author moved R10 from 5 s to 1.5 s, at which offered rate would ‘R10 is accepted at every rate’ become false, and could a reader see the false sentence?',
        answer:
          'At 1 token a second. There R8 spends the one token that has come back by 1 s, so at 1.5 s the bucket holds half a token and R10 gets 429; at 2 and 4 tokens a second it is still accepted. A reader could see it only if the author published without reading that scenario, because 1 token a second is a scenario the build makes and the author can run and read.',
      },
      {
        question:
          'Someone shares a link to the token bucket page that ends in ?rate=0.1. What does the reader see, and do they meet the false sentence about R10?',
        answer:
          'The player looks for 0.1 among the rates the scene lists, finds none, and opens the default scenario, 2 tokens a second, with the notice “Unknown rate option: 0.1. Showing the default scenario.” The reader sees a scenario the author ran, where R10 is accepted; the 0.1 row exists only in this explainer.',
      },
      {
        question:
          'The traffic-policy page has two policies and three pod placements. Its author wants a third setting, the number of nodes, with four values. How many scenarios would the build make and the author need to read, and when is such a setting worth adding?',
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
    /** One rate's ten requests as the state records them: each answer, and the balance R10 finds. */
    const runOf = (rate: number, offered: boolean): RateRun => ({
      rate,
      offered,
      responses: runs.get(rate)!.map((c) => (c.ok ? 200 : 429)),
      found: Number(r10(rate).found.toFixed(2)),
    });

    // 1. A sentence that is true of every scenario the page offers.
    const pitch = 0.82,
      x0 = -2.9,
      labelX = -7.4,
      findsX = x0 + pitch * (TIMES.length - 1) + 0.75;
    const rowY = (i: number) => 1.15 - i * 1.05;
    /** One rate's row of answers, drawn from its run: a circle for 200, a cross for 429, and what R10 finds. */
    const row = (run: RateRun, i: number) => {
      const g = new Group();
      const y = rowY(i);
      g.add(
        new Text(run.offered ? perSecond(run.rate) : `${perSecond(run.rate)}, not offered`, {
          fontSize: 0.26,
          color: run.offered ? ink : s.bad,
          anchor: 'start',
        }).moveTo([labelX, y], [-1, 0]),
      );
      run.responses.forEach((code, j) => {
        const ok = code === 200;
        const circle = new Circle({ radius: 0.2, stroke: ok ? s.good : s.bad, strokeWidth: 0.05 }).moveTo([x0 + j * pitch, y]);
        const mark: Mobject = ok ? circle : new Cross(circle, { stroke: s.bad, strokeWidth: 0.05 });
        mark.key = `call:${run.rate}:R${j + 1}`;
        g.add(mark);
      });
      const accepted = run.responses.at(-1) === 200;
      g.add(
        new Text(`R10 finds ${run.found.toFixed(1)}`, { fontSize: 0.24, font: 'mono', color: accepted ? ink : s.bad, anchor: 'start' }).moveTo(
          [findsX, y],
          [-1, 0],
        ),
      );
      g.key = `rate:${run.rate}`;
      return g;
    };
    const column = (rows: number) => {
      const x = x0 + pitch * (TIMES.length - 1);
      return new Rectangle({ width: 0.62, height: rows * 1.05 + 0.5, stroke: s.emphasis, strokeWidth: 0.04, cornerRadius: 0.1 }).moveTo([
        x,
        2.05 - (rows * 1.05 + 0.5) / 2 + 0.25,
      ]);
    };
    const sentenceState = () => this.state as unknown as SentenceState;
    await this.step('sentence', {
      title: '“R10 is accepted at every rate”',
      line: `At ${perSecond(UNBUILT)}, a rate the page doesn’t offer, is it still true?`,
      caption: `The token-bucket page offers ${RATES.join(', ')} tokens a second, the only rates its reader can choose. R10 succeeds in all three, so its caption says “R10 is accepted at every rate”. Would that sentence survive a reader typing ${UNBUILT}?`,
    });
    await s.clear();
    this.state.offered = RATES.map((r) => ({ rate: r, r10: r10(r).ok ? 200 : 429 }));
    this.state.runs = RATES.map((r) => runOf(r, true));
    this.state.pending = { rate: UNBUILT };
    // The offered rates' rows, R10's column outlined, with the header and the key: a picture of the runs the state records.
    const answers = view(
      this,
      (st) => {
        const offered = (st as unknown as SentenceState).runs.filter((r) => r.offered);
        const header = new Group();
        offered[0]!.responses.forEach((_, i) =>
          header.add(new Text(`R${i + 1}`, { fontSize: 0.26, color: ink }).moveTo([x0 + i * pitch, 2.05])),
        );
        header.add(new Text('Request', { fontSize: 0.26, color: s.soft, anchor: 'start' }).moveTo([labelX, 2.05], [-1, 0]));
        const key = new Text('circle: 200, accepted · cross: 429, refused · a request needs 1 token', { fontSize: 0.22, color: s.soft }).moveTo([0, -3.2]);
        return new Group(keyed(header, 'fork-header'), ...offered.map((r, i) => row(r, i)), keyed(column(offered.length), 'fork-r10'), keyed(key, 'fork-key'));
      },
      { place: false },
    );
    // Under them, the rate the page never built: a question mark until its run is in the state, then its row.
    const unbuiltRow = view(
      this,
      (st) => {
        const { runs: all, pending } = st as unknown as SentenceState;
        const slow = all.find((r) => !r.offered);
        const offered = all.filter((r) => r.offered).length;
        if (slow) return row(slow, offered).shift([0, -0.25]);
        return keyed(
          new Group(
            new Text(`${perSecond(pending.rate)}, not offered`, { fontSize: 0.26, color: s.soft, anchor: 'start' }).moveTo([labelX, rowY(offered) - 0.25], [-1, 0]),
            new Text('?', { fontSize: 0.5, color: s.soft, weight: 'bold' }).moveTo([x0 + pitch * (TIMES.length - 1), rowY(offered) - 0.25]),
          ),
          'fork-pending',
        );
      },
      { place: false },
    );
    await s.enter(answers, {
      describe: () => {
        const offered = sentenceState().runs.filter((r) => r.offered);
        return `The token bucket’s ten requests at ${offered.map((r) => perSecond(r.rate)).join(', ')}: ${offered.map((r) => `${r.responses.filter((c) => c !== 200).length} refused`).join(', ')}; R10, outlined, is accepted at each, finding ${offered.map((r) => r.found.toFixed(1)).join(', ')} tokens.`;
      },
    });
    await s.enter(unbuiltRow, {
      describe: () => {
        const slow = sentenceState().runs.find((r) => !r.offered);
        return slow
          ? `Added below the three offered rates: the ten requests at ${perSecond(slow.rate)}, not offered, where only ${slow.responses.filter((c) => c === 200).length} are accepted and R10 finds ${slow.found.toFixed(1)} tokens and is refused.`
          : `Below, a row for ${perSecond(sentenceState().pending.rate)} with a question mark where R10’s answer goes.`;
      },
    });

    // 2. The answer, from the same model at a rate the page never built.
    const slow = r10(UNBUILT);
    await this.step('untested', {
      title: `At ${perSecond(UNBUILT)}, R10 finds ${slow.found.toFixed(1)} tokens and is refused`,
      line: 'The sentence holds at every rate the page built and fails at one it never built.',
      caption: `At ${perSecond(UNBUILT)}, R10 still needs a whole token. After five seconds only ${slow.found.toFixed(1)} tokens have come back, so R10 gets 429. The caption described the offered inputs, not arbitrary rates. ${ANSWER}.`,
    });
    this.state.unbuilt = { rate: UNBUILT, r10: slow.ok ? 200 : 429, found: Number(slow.found.toFixed(2)) };
    this.state.runs = [...sentenceState().runs, runOf(UNBUILT, false)];
    // The question mark goes and the row of answers comes in under the offered rates.
    await this.play(unbuiltRow.sync({ match: 'key', runTime: 0.6 }));

    // 3. Why no reader meets that row: a link picks one of the scenarios the build made, or gets the default.
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
    if (!fallback.refused || links[0]!.opens !== '4') throw new Error('A listed rate must open its scenario and 0.1 must be refused');
    const choice: Choice = {
      setting: RATE_SETTING,
      scenarios: RATE_SETTING.options.map((o) => ({ rate: o.value, r10: r10(Number(o.value)).ok ? 200 : 429, default: o.value === RATE_SETTING.default })),
      links,
    };
    // The scenarios the setting makes, the slot a 0.1 scenario would fill, and where each link lands: all from the choice the state records.
    const choicePicture = (st: { choice: Choice }) => {
      const { setting, scenarios: built, links: asked } = st.choice;
      const [listed, refusedLink] = asked as [Choice['links'][number], Choice['links'][number]];
      const W = 3.1,
        H = 0.68,
        pitch = 0.8,
        top = 1.3;
      const y = (i: number) => top - i * pitch;
      const slotY = y(built.length);
      const left = -W / 2,
        right = W / 2;
      const two = (a: string, b: string, at: number, color: string, colorB = s.soft) =>
        new Group(
          new Text(a, { fontSize: 0.28, color, anchor: 'start' }).moveTo([left + 0.18, at + 0.15], [-1, 0]),
          new Text(b, { fontSize: 0.25, color: colorB, anchor: 'start' }).moveTo([left + 0.18, at - 0.16], [-1, 0]),
        );
      const scenarios = new Group();
      built.forEach((o, i) => {
        scenarios.add(
          new Rectangle({ width: W, height: H, stroke: o.default ? s.emphasis : ink, strokeWidth: o.default ? 0.05 : 0.025, cornerRadius: 0.08 }).moveTo([0, y(i)]),
          two(perSecond(Number(o.rate)), `R10: ${o.r10}, checked`, y(i), ink, o.r10 === 200 ? s.good : s.bad),
        );
      });
      // Where a 0.1 scenario would sit: the build made none.
      const slot = new Rectangle({ width: W, height: H, stroke: s.bad, strokeWidth: 0.03, cornerRadius: 0.08, fill: 'none' }).moveTo([0, slotY]);
      slot.style.dashArray = '0.14 0.1';
      scenarios.add(slot, two(`${perSecond(Number(refusedLink.asked))}`, 'no scenario: never built', slotY, s.bad, s.bad));
      scenarios.key = 'fork-choice-scenarios';
      // The setting's name labels the column, beside its first scenario, clear of the fallback's path below.
      const heading = new Group(
        new Text(setting.label, { fontSize: 0.3, color: ink, weight: 'bold', anchor: 'end' }).moveTo([left - 0.3, top + 0.16], [1, 0]),
        new Text(`${built.length} scenarios`, { fontSize: 0.26, color: s.soft, anchor: 'end' }).moveTo([left - 0.3, top - 0.17], [1, 0]),
      );
      // Links come in from the right.
      const arrow = (from: number, to: number, at: number, color: string) =>
        new Arrow([from, at], [to, at], { stroke: color, strokeWidth: 0.04, tipLength: 0.22, tipWidth: 0.2 });
      const linkX = right + 1.5;
      const link = (text: string, at: number, color: string) =>
        new Group(
          new Text(text, { font: 'mono', fontSize: 0.3, color, anchor: 'start' }).moveTo([linkX + 0.15, at], [-1, 0]),
          arrow(linkX, right + 0.08, at, color),
        );
      const index = (rate: string) => built.findIndex((o) => o.rate === rate);
      const four = link(`?rate=${listed.asked}`, y(index(listed.opens)), ink);
      const unknown = link(`?rate=${refusedLink.asked}`, slotY, s.bad);
      const defaultY = y(built.findIndex((o) => o.default));
      const tag = new Text('the default scenario', { fontSize: 0.3, color: s.emphasis, anchor: 'start' }).moveTo([right + 0.3, defaultY], [-1, 0]);
      // Refused, the link falls back along the left side to the default scenario.
      const back = left - 0.5,
        to = y(index(refusedLink.opens));
      const redirect = new Group(
        new Line([left - 0.05, slotY], [back, slotY], { stroke: s.emphasis, strokeWidth: 0.04 }),
        new Line([back, slotY], [back, to], { stroke: s.emphasis, strokeWidth: 0.04 }),
        arrow(back, left - 0.08, to, s.emphasis),
      );
      redirect.key = 'fork-choice-fallback';
      const refusal = new Group(
        new Text(String(refusedLink.refused), { fontSize: 0.28, color: s.bad }).moveTo([0, slotY - H / 2 - 0.4]),
        new Text('so the page opens the default scenario', { fontSize: 0.28, color: s.emphasis }).moveTo([0, slotY - H / 2 - 0.8]),
      );
      return new Group(heading, scenarios, tag, four, unknown, redirect, refusal);
    };
    await s.steps([
      stagedStep({
        id: 'choice',
        title: `The build made ${RATES.length} scenarios, and a link opens one of them`,
        line: `A link naming ${UNBUILT} matches no scenario, so the page opens the default, ${byDefault}.`,
        caption: `The rate setting lists ${RATES.length} options, so the build ran the scene once for each and rayner check tested each of the ${RATES.length} scenarios; R10 is accepted in all three. A link picks a scenario by naming its option: ?rate=4 opens the 4-token scenario. ?rate=${UNBUILT} matches no option, so Rayner refuses it with “${fallback.refused}” and opens the default scenario, ${byDefault}. The ${UNBUILT} row from the last step exists in this explainer, not on the token-bucket page.`,
        state: { choice },
        draw: (st) => choicePicture(st),
        opening: ['fork-choice-scenarios', 'fork-choice-fallback'],
      }),
    ]);

    // 4. Where the live page went: Lantern rendered whatever was asked; Rayner offers what it built.
    // The diagram, its mark and the settings listing are the same in every scenario: Lantern's
    // architecture at the fork base and the token bucket's source, not values a model computes.
    await this.step('live', {
      title: 'Lantern, the engine Rayner was forked from, rendered frames on request',
      line: 'A reader can choose only a rate the scene lists, and each listed rate is a scenario the build runs.',
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

    // 5. The price, the ending: every combination of settings is a scenario to build and check.
    await s.steps([
      stagedStep({
        id: 'scenarios',
        title: `${PODS.length} pod placements × ${POLICIES.length} traffic policies make ${SCENARIOS} scenarios to build`,
        line: 'Every combination of options is a scenario the build makes and rayner check tests.',
        caption: `Prepared inputs have a cost: settings multiply. ${POLICIES.length} policies combined with ${PODS.length} pod placements produce ${SCENARIOS} scenarios, and another setting multiplies that collection again. Finite review becomes more work as the number of combinations grows.`,
        state: { scenarios: { count: SCENARIOS, policies: POLICIES, pods: PODS } },
        // A row per pod placement and a column per policy, each cell the scenario that combination makes.
        draw: ({ scenarios: { policies, pods } }, st) =>
          table(
            ['Pods per node', ...policies],
            pods.map((placement, r) => [placement.replaceAll('-', ', '), ...policies.map((_, p) => `scenario ${r * policies.length + p + 1}`)]),
            st,
            { xs: [-5, 0, 5], y: 2.2, gap: 1.45, key: 'fork-scenarios' },
          ),
        opening: ['fork-scenarios'],
      }),
    ]);

    // Details after the ending: what the build does for each scenario, and what replaced Lantern's live parts.
    await this.step('fork', {
      kind: 'detail',
      title: 'The build draws the diagrams ahead of the page',
      line: 'Diagrams are captured at build time, so the page runs no diagram renderer.',
      caption: 'The build captures Agentic Mermaid’s diagrams and saves their geometry. The finished page draws those snapshots without a diagram renderer. Chromium is needed for capture, while stored snapshots can be used to build a page without recapturing them.',
    });
    await s.clear();
    // The two architectures, what the fork deleted and the path a page takes are fixed facts of the
    // two code bases, the same in every scenario; the count of diagram families is the describer's own.
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
    this.state.families = FAMILIES;
    // The count of families, said in a note below Capture: drawn from the state. The note describes itself
    // and says what it emphasises.
    const familiesNote = view(
      this,
      (st) =>
        flow.notePicture('Capture', `${(st as { families: number }).families} diagram families, Chromium at build`, {
          side: 'below',
          color: s.emphasis,
          key: 'fork-families-note',
        }),
      { place: false },
    );
    await s.enter(familiesNote, { runTime: 0.35, shift: [0, -0.06] });
    await flow.note('Page', 'no diagram renderer', { side: 'above' });

    // A detail after the ending: the page holds each resting picture for its caption. It reads the
    // timing of the 'fork' step, so that step ends here, holding for its caption as any step does.
    await this.endCurrentStep();
    const shown = this.steps.find((st) => st.name === 'fork')!;
    const words = String(shown.meta.caption).trim().split(/\s+/).length;
    const motion = (shown.hold ?? shown.t1!) - shown.t0,
      held = shown.hold == null ? 0 : shown.t1! - shown.hold;
    await this.step('timing', {
      kind: 'detail',
      title: 'The page holds each resting picture for its caption',
      line: `Moving ${motion.toFixed(1)} s, then still for ${held.toFixed(1)} s.`,
      caption: `The scene clock reserves reading time after motion. This caption needs ${(motion + held).toFixed(1)} seconds at ${Scene.captionWpm} words a minute; the ${motion.toFixed(1)}-second animation leaves ${held.toFixed(1)} seconds at rest. The caption therefore does not have to compete with a still-changing picture.`,
    });
    await s.clearOverlays();
    await flow.unmark();
    await flow.dim(['Clock', 'Frames', 'Image']);
    await flow.focus(['Clock', 'Page', 'Frames', 'Image', 'Check'], { zoom: 0.95 });
    this.state.timing = { motion: Number(motion.toFixed(2)), held: Number(held.toFixed(2)), words };
    // One bar per phase of the 'fork' step, to scale: the timing the state records.
    const timeline = view(
      this,
      (st) => {
        const t = (st as unknown as { timing: Timing }).timing;
        const unit = 11 / (t.motion + t.held),
          bx = -5.5,
          y = -2.85;
        const phase = (from: number, len: number, fill: string, label: string, key: string) => {
          const bar = new Rectangle({ width: len * unit, height: 0.55, fill, fillOpacity: 0.85, stroke: 'none' }).moveTo([
            bx + (from + len / 2) * unit,
            y,
          ]);
          const text = new Text(label, { fontSize: 0.24, color: ink }).moveTo([bx + (from + len / 2) * unit, y - 0.6]);
          return keyed(new Group(bar, text), key);
        };
        return new Group(
          keyed(
            new Text(`Step 'fork' on the page: ${(t.motion + t.held).toFixed(1)} s`, {
              fontSize: 0.26,
              color: ink,
              weight: 'bold',
            }).moveTo([0, -1.85]),
            'timing:title',
          ),
          phase(0, t.motion, s.emphasis, `moving: ${t.motion.toFixed(1)} s`, 'timing:moving'),
          phase(t.motion, t.held, s.soft, `still, caption of ${t.words} words: ${t.held.toFixed(1)} s`, 'timing:still'),
        );
      },
      { place: false },
    );
    await s.enter(timeline, {
      describe: () => {
        const t = (this.state as unknown as { timing: Timing }).timing;
        return `A timeline of the fork step on the page: ${t.motion.toFixed(1)} seconds of motion, then ${t.held.toFixed(1)} seconds still under its ${t.words}-word caption`;
      },
    });
  }
}
