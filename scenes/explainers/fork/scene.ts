import { table } from '../lib/reader-drawing.ts';
import { Scene, Rectangle, Text, Group } from '../../../src/index.ts';
import { stage, regionBox } from '../../../explain/index.ts';
import { VOCABULARY } from '../../../explain/words.ts';
const STYLE = 'github-light';
// Upstream Lantern at the fork base, 2c7bad5: README "Outputs", app/worker.ts, src/mermaid.ts, src/doc.ts.
const LANTERN =
  'graph LR\nDoc[JSON doc]\nParser[Flowchart parser]\nScene[Scene class]\nClock[Fixed dt clock]\nPlayer[Dev player]\nWorker[Worker]\nFrames[SVG frames]\nDoc --> Scene\nParser --> Scene\nScene --> Clock\nClock --> Player\nClock --> Worker\nClock --> Frames';
// The fork: docs/UPSTREAM.md and the design record's table of what is inherited and what changes.
const FORK =
  'graph LR\nSettings[Settings]\nCapture[Agentic Mermaid]\nSnaps[Snapshots]\nScene[Scene class]\nClock[Fixed dt clock]\nPage[Embed page]\nFrames[SVG frames]\nImage[PNG stills]\nCheck[rayner check]\nSettings --> Scene\nCapture --> Snaps\nSnaps --> Scene\nScene --> Clock\nClock --> Page\nClock --> Frames\nFrames --> Image\nClock --> Check';
// scenes/explainers/token-bucket/scene.ts.
const SETTINGS = [
  'static settings = [{',
  "  id: 'rate', label: 'Refill per second', default: '2',",
  "  options: [{ value: '1', label: '1 token' },",
  "            { value: '2', label: '2 tokens' },",
  "            { value: '4', label: '4 tokens' }],",
  '}];',
];
/** The token bucket's refill options, as SETTINGS declares them, and a second setting to add. */
const RATES = ['1 token', '2 tokens', '4 tokens'];
const POLICIES = ['Policy A', 'Policy B'];
const CASES = RATES.length * POLICIES.length;
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

/** The script's one-sentence answer (meta.answer), which the cases step states. */
const ANSWER = 'Every combination of settings is a case the build runs, draws and checks before anyone opens the page';

export default class ForkExplainer extends Scene {
  static meta = {
    id: 'fork',
    title: 'Why build the page before readers open it?',
    sources: [
      'https://github.com/ivarvong/lantern/blob/2c7bad5/README.md',
      'https://github.com/ivarvong/lantern/blob/2c7bad5/app/worker.ts',
      'https://github.com/ivarvong/lantern/blob/2c7bad5/src/mermaid.ts',
      'https://github.com/adewale/rayner/blob/main/docs/UPSTREAM.md',
    ],
    // The script's answer and check questions (script.md); the cases step states the answer.
    answer: ANSWER,
    checks: [
      {
        question: `The token bucket’s refill rate has ${RATES.length} options. Add a policy setting with ${POLICIES.length}: how many cases does the build make, and how many checks run?`,
        answer: `${CASES} cases, one per combination, each run, captured and checked: ${CASES} × ${CHECK_COUNT} = ${CASES * CHECK_COUNT} checks before the page ships.`,
      },
      {
        question: 'What could a reader get from Lantern’s Worker that a built page cannot give?',
        answer: 'A frame, text or trace of something nobody built: the Worker ran the scene on request, and the built page holds only the cases made ahead of time.',
      },
      {
        question: 'Which part of the build needs Chromium, and does the page?',
        answer: 'Capturing a new diagram with Agentic Mermaid. The page does not: it replays the stored snapshots and runs no diagram renderer.',
      },
    ],
  };
  override async construct() {
    const s = stage(this, { headingSize: 0.6, style: STYLE });
    const ink = s.palette.ink;

    // 1. A concrete setting: three options, three pages built in advance.
    await this.step('settings', {
      title: `The token bucket’s refill setting is ${RATES.length} cases built ahead`,
      line: `Predict: add a policy setting with ${POLICIES.length} options. How many cases then?`,
      caption: `A reader of the token bucket explainer can choose a refill rate of ${RATES.join(', ').replace(/, ([^,]*)$/, ' or $1')} a second. Choosing one opens no new computation: the build already ran the scene once per option, captured its diagrams and checked it, so each choice is a case made before anyone reads.`,
    });
    await s.clear();
    await s.code(SETTINGS, { at: ABOVE, fontSize: 0.3 });
    await s.card(
      RATES.map((rate, i) => [`Refill ${rate} a second`, `case ${i + 1}: run, captured, checked`]),
      { at: BELOW },
    );
    this.state.cases = RATES.length;

    // 2. The answer: settings multiply.
    await this.step('cases', {
      title: `Answer: ${CASES}. Every combination is a case`,
      line: `${RATES.length} rates × ${POLICIES.length} policies = ${CASES} cases to build and check.`,
      caption: `${ANSWER}. ${RATES.length} rates and ${POLICIES.length} policies make ${CASES}, and every further setting multiplies again. The reader can switch among those cases and no others: an input with no fixed options would need the model running in the page, and checks for values nobody tried.`,
    });
    await s.clear();
    const grid = table(
      ['', ...POLICIES],
      RATES.map((rate, r) => [`Rate ${rate.split(' ')[0]}`, ...POLICIES.map((_, p) => `case ${r * POLICIES.length + p + 1}`)]),
      s,
      { xs: [-5, 0, 5], y: 2.2, gap: 1.45, key: 'fork-cases' },
    );
    await s.enter(grid, {
      describe: `A table of ${RATES.length} refill rates by ${POLICIES.length} policies: ${CASES} cases, numbered 1 to ${CASES}`,
    });
    this.state.cases = CASES;

    // 3. What the build does for each case.
    await this.step('fork', {
      title: 'For each case the build draws every diagram once',
      line: 'Diagrams are captured at build time; the page runs no renderer.',
      caption: `Agentic Mermaid draws each diagram in Chromium at build time, and the snapshot is stored beside the scene, so the page runs no diagram renderer and has no runtime dependency. The cost lands on the author: capturing a new diagram needs Chromium, though a page built from stored snapshots does not.`,
    });
    await s.clear();
    const flow = await s.show({ source: FORK }, { box: ABOVE });
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
    await flow.note('Page', 'no diagram renderer, no dependencies', { side: 'above' });
    this.state.families = FAMILIES;

    // 4. What the build checks for each case.
    await this.step('checks', {
      title: `Each case must pass ${CHECK_COUNT} checks before it ships`,
      line: `${CASES} cases × ${CHECK_COUNT} checks = ${CASES * CHECK_COUNT}; another two-option setting doubles it.`,
      caption: `rayner check runs every case and fails the build on any of ${CHECK_COUNT} problems, from a seeked frame that differs from the played one to text under 14 px or a step that never states the scene’s answer. Because every case is known in advance, every case can be checked; the price is that the work grows with each setting.`,
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

    // A detail: the page holds each resting picture for its caption. It reads the timing of the
    // 'fork' step, which has ended by now.
    const shown = this.steps.find((st) => st.name === 'fork')!;
    const words = String(shown.meta.caption).trim().split(/\s+/).length;
    const motion = (shown.hold ?? shown.t1!) - shown.t0,
      held = shown.hold == null ? 0 : shown.t1! - shown.hold;
    await this.step('timing', {
      detail: true,
      title: 'The page holds each resting picture for its caption',
      line: `Moving ${motion.toFixed(1)} s, then still for ${held.toFixed(1)} s.`,
      caption: `The scene advances automatically; the page waits for the reader. Its clock gives the fork step ${motion.toFixed(1)} seconds of motion and ${held.toFixed(1)} seconds at rest, allowing its ${words}-word caption to be read at ${Scene.captionWpm} words a minute.`,
    });
    await s.clearOverlays();
    await flow.unmark();
    await flow.dim(['Clock', 'Frames', 'Image']);
    await flow.focus(['Clock', 'Page', 'Frames', 'Image', 'Check'], { zoom: 0.95 });
    // One bar per phase of the 'fork' step, to scale.
    const unit = 11 / (motion + held),
      x0 = -5.5,
      y = -2.85;
    const phase = (from: number, len: number, fill: string, label: string) => {
      const bar = new Rectangle({ width: len * unit, height: 0.55, fill, fillOpacity: 0.85, stroke: 'none' }).moveTo([
        x0 + (from + len / 2) * unit,
        y,
      ]);
      const text = new Text(label, { fontSize: 0.24, color: ink }).moveTo([x0 + (from + len / 2) * unit, y - 0.6]);
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

    // 5. What building first gave up: Lantern's live path.
    await this.step('removed', {
      title: 'Building first deleted Lantern’s live Worker',
      line: 'The JSON doc, parser, dev player and Worker are gone.',
      caption:
        'Lantern, which Rayner forks at 2c7bad5, ran each scene live: a development player, and a Cloudflare Worker serving frames, text and traces on request. The fork deleted that path. The player and the parser have replacements; the JSON format and the Worker’s endpoints have none, so a page cannot answer for a case nobody built.',
    });
    await s.clearOverlays();
    await flow.focus('all');
    await flow.dim(null);
    await flow.morph({ source: LANTERN });
    await flow.mark(GONE, { color: s.bad, as: 'deleted' });
    // What replaces each deleted part, said on the part.
    await flow.note('Doc', 'no replacement', { side: 'left' });
    await flow.note('Parser', 'replaced by Agentic Mermaid capture', { side: 'below' });
    await flow.note('Player', 'replaced by the embed page', { side: 'above' });
    await flow.note('Worker', 'no replacement', { side: 'right' });
  }
}
