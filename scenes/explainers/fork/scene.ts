import { table } from '../../../explain/drawing.ts';
import { stagedStep, answerOf, view } from '../../../explain/index.ts';
import { Scene, Text, FadeIn } from '../../../src/index.ts';
import { stage, regionBox, resolveSettings } from '../../../explain/index.ts';
import type { ExplainerClass, Diagram, PictureNote, View } from '../../../explain/index.ts';
import { TokenBucket } from '../token-bucket/model.ts';
import { PLACEMENTS } from '../traffic-policy/model.ts';
import { drawChoice, drawOffered, drawTimeline, drawUnbuilt, perSecond } from './picture.ts';
import type { Choice, RateRun, SentenceState, Timing } from './picture.ts';
// This explainer has no model of its own. Its rate rows run the token bucket's model and request schedule,
// with a 0.1-rate run held beside the three offered rates: it is not a run against a deployed rate limiter.
// Lantern's Worker is read from its source at commit 2c7bad5, not measured by running it. The traffic-policy
// scenario count comes from that scene's settings; this page does not draw its six scenarios. The timing
// detail uses this page's own trace and the default caption reading speed.
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
/** The diagram families the explainers name and describe; fidelity.ts holds it to explain/words.ts. */
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

export default class ForkExplainer extends Scene {
  static meta = {
    sources: [
      'https://github.com/ivarvong/lantern/blob/2c7bad5/README.md',
      'https://github.com/ivarvong/lantern/blob/2c7bad5/app/worker.ts',
      'https://github.com/ivarvong/lantern/blob/2c7bad5/src/mermaid.ts',
      'https://github.com/adewale/rayner/blob/main/docs/UPSTREAM.md',
      'https://github.com/adewale/rayner/blob/main/scenes/explainers/token-bucket/scene.ts',
    ],
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
  };
  override async construct() {
    const answer = answerOf(this);
    const s = stage(this, { headingSize: 0.6, style: STYLE });
    const ink = s.palette.ink;
    /** The colours the pictures are drawn in. */
    const colours = { ink, soft: s.soft, good: s.good, bad: s.bad, emphasis: s.emphasis };
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
    const answers = view(this, (st) => drawOffered(st as unknown as SentenceState, colours), { place: false });
    // Under them, the rate the page never built: a question mark until its run is in the state, then its row.
    const unbuiltRow = view(this, (st) => drawUnbuilt(st as unknown as SentenceState, TIMES.length, colours), { place: false });
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
      caption: `At ${perSecond(UNBUILT)}, R10 still needs a whole token. After five seconds only ${slow.found.toFixed(1)} tokens have come back, so R10 gets 429. The caption described the offered inputs, not arbitrary rates. ${answer}.`,
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
    const choicePicture = (st: { choice: Choice }) => drawChoice(st.choice, colours);
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
    // The Worker's mark is how the diagram is shown, not the model: it lives in `shown`, and the
    // diagram is shown by a view that draws it.
    this.shown.lanternMarked = false;
    const lanternView = s.diagramView(lantern, (_st, sh) => ({
      marks: Object.fromEntries(sh.lanternMarked ? [['Worker', { color: s.emphasis, as: 'renders on request' }]] : []),
    }));
    this.shown.lanternMarked = true;
    await this.play(lanternView.sync({ match: 'key', staged: true, runTime: 0.45 }));
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
    // How the flow diagram is shown, apart from its source: the parts marked deleted, the links walked,
    // its notes and what stays undimmed. That is `shown`, not the model; the diagram's view draws it,
    // and each change is a sync. A morph or a focus takes the live diagram, with `shown` plain. The
    // timing step quotes this step's motion, so its plays keep their run times: 0.45 to mark the deleted
    // parts, 0.35 to clear them before the morph, and the trail and the note in one 0.35 play with the families note.
    type FlowShown = { deleted: string[]; walked: [string, string][]; notes: PictureNote[]; dim: string[] | null };
    const drawFlow = (of: Diagram) => (_st: object, sh: Record<string, unknown>) => {
      const f = sh.flow as FlowShown;
      return {
        marks: { ...of.trail(f.walked), ...Object.fromEntries(f.deleted.map((id) => [id, { color: s.bad, as: 'deleted' }])) },
        notes: f.notes,
        dim: f.dim,
      };
    };
    this.shown.flow = { deleted: [], walked: [], notes: [], dim: null } satisfies FlowShown;
    let flowView: View = s.diagramView(flow, drawFlow(flow));
    const showFlow = async (change: Partial<FlowShown>, runTime = 0.45) => {
      this.shown.flow = { ...(this.shown.flow as FlowShown), ...change };
      await this.play(flowView.sync({ match: 'key', staged: true, runTime }));
    };
    await showFlow({ deleted: GONE });
    await showFlow({ deleted: [] }, 0.35);
    s.liveDiagram(flow);
    await flow.morph({ source: FORK });
    flowView = s.diagramView(flow, drawFlow(flow));
    const path: [string, string][] = [
      ['Settings', 'Scene'],
      ['Capture', 'Snaps'],
      ['Snaps', 'Scene'],
      ['Scene', 'Clock'],
      ['Clock', 'Page'],
    ];
    await flow.walk(path);
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
    s.keep(familiesNote);
    this.shown.flow = { ...(this.shown.flow as FlowShown), walked: path, notes: [{ id: 'Page', text: 'no diagram renderer', side: 'above' }] };
    await this.play(
      new FadeIn(familiesNote, { runTime: 0.35, shift: [0, -0.06] }),
      flowView.sync({ match: 'key', staged: true, runTime: 0.35 }),
    );

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
    await showFlow({ walked: [], notes: [] });
    s.liveDiagram(flow);
    await flow.enlarge(['Clock', 'Page', 'Frames', 'Image', 'Check'], { zoom: 0.95 });
    flowView = s.diagramView(flow, drawFlow(flow));
    await showFlow({ dim: ['Clock', 'Frames', 'Image'] });
    this.state.timing = { motion: Number(motion.toFixed(2)), held: Number(held.toFixed(2)), words };
    // One bar per phase of the 'fork' step, to scale: the timing the state records.
    const timeline = view(this, (st) => drawTimeline((st as unknown as { timing: Timing }).timing, colours), { place: false });
    await s.enter(timeline, {
      describe: () => {
        const t = (this.state as unknown as { timing: Timing }).timing;
        return `A timeline of the fork step on the page: ${t.motion.toFixed(1)} seconds of motion, then ${t.held.toFixed(1)} seconds still under its ${t.words}-word caption`;
      },
    });
  }
}
