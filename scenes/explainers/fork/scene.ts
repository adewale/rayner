import { readerFirst } from '../lib/reader-drawing.ts';
import { frames as readerFrames } from '../lib/readers/fork.ts';
import { Scene, Rectangle, Text, Group } from '../../../src/index.ts';
import { stage, regionBox } from '../../../explain/index.ts';
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
const GONE = ['Doc', 'Parser', 'Player', 'Worker'];
// The diagram takes the top three fifths; cards sit under it.
const ABOVE = regionBox('top', { bottom: -1.1 }),
  BELOW = regionBox('bottom', { top: -1.35 });

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
  };
  override async construct() {
    const s = stage(this, { headingSize: 0.6, style: STYLE });
    const ink = s.palette.ink;

    await readerFirst(this, s, readerFrames());
    await this.step('lantern', {
      detail: true,
      title: 'Lantern runs each scene for its player and Worker',
      line: 'The same fixed clock feeds both live readers.',
      caption:
        'What must change to send a scene as one HTML page instead of running it for each request? At commit 2c7bad5, Lantern’s development player reads a Scene on a fixed clock, while a Cloudflare Worker serves frames, text and traces on demand. We will keep the scene and its clock but replace that delivery path with a build, then count what readers gain and lose.',
    });
    await s.clear();
    const flow = await s.show({ source: LANTERN }, { box: ABOVE });
    await flow.walk([['Scene', 'Clock']], { trail: true });
    await flow.walk(
      [
        ['Clock', 'Player'],
        ['Clock', 'Worker'],
      ],
      { parallel: true, trail: true },
    );
    await s.card(
      [
        ['Dev player', '?scene=&step= links, reloads on save'],
        ['Worker', '/frame.svg, /text, /trace.json, /llms.txt'],
        ['Diagrams', 'Mermaid flowcharts, laid out in the page'],
        ['Runtime dependencies', 'none'],
      ],
      { at: BELOW },
    );

    await this.step('engine', {
      detail: true,
      title: 'The fork keeps the engine',
      line: 'Bézier points, fixed endpoints and seek by replay all stay.',
      caption:
        'The scene still runs on Lantern’s src/: shapes and glyphs stored as Bézier points, animations whose endpoints are fixed when they begin, the fixed clock and seeking by replay. The fork changed the engine only to fix a fault or add a hook the helpers need, and docs/UPSTREAM.md lists each change with its regression test.',
    });
    await s.clearOverlays();
    await flow.unmark();
    await flow.dim(['Scene', 'Clock', 'Frames']);
    await s.card(
      [
        ['Mobject', 'Bézier points'],
        ['Animation', 'endpoints fixed at begin'],
        ['Scene', 'fixed dt, seek by replay'],
        ['Text', 'Inter and JetBrains Mono outlines'],
        ['Changes offered upstream', 'none yet'],
      ],
      { at: BELOW },
    );

    await this.step('removed', {
      detail: true,
      title: 'Four parts of Lantern are deleted',
      line: 'The JSON doc, parser, dev player and Worker are gone.',
      caption:
        'The fork deleted the JSON scene format, the flowchart parser, the development player and the Worker, along with the nine original scenes, which the explainers rebuild. The player and the parser have replacements; the JSON format and the Worker’s endpoints have none.',
    });
    await s.clearOverlays();
    await flow.dim(null);
    await flow.mark(GONE, { color: s.bad, as: 'deleted' });
    // What replaces each deleted part, said on the part.
    await flow.note('Doc', 'no replacement', { side: 'left' });
    await flow.note('Parser', 'replaced by Agentic Mermaid capture', { side: 'below' });
    await flow.note('Player', 'replaced by the embed page', { side: 'above' });
    await flow.note('Worker', 'no replacement', { side: 'right' });

    await this.step('fork', {
      detail: true,
      title: 'The fork puts a build between the scene and the reader',
      line: 'Diagrams are captured once; the page runs no renderer.',
      caption:
        'Agentic Mermaid draws each diagram in Chromium at build time, and the snapshot is stored beside the scene, so the page runs no diagram renderer. The same scene and clock then feed an embed page, PNG stills and rayner check.',
    });
    await flow.morph({ source: FORK });
    await flow.walk(
      [
        ['Capture', 'Snaps'],
        ['Snaps', 'Scene'],
        ['Scene', 'Clock'],
        ['Clock', 'Page'],
      ],
      { trail: true },
    );
    await flow.note('Capture', '15 diagram families in 0.4.1', { side: 'below' });
    await flow.note('Page', 'no diagram renderer, still no dependencies', { side: 'above' });

    await this.step('settings', {
      detail: true,
      title: 'A reader setting is a case built ahead of time',
      line: 'Each option of the refill rate is a case, checked in advance.',
      caption:
        'A scene may declare a few settings, like the token bucket’s refill rate. Every combination of options is a case: the build runs each one, captures its diagrams and checks it, so choosing 4 tokens opens a page that was already tested.',
    });
    await s.clearOverlays();
    await flow.unmark();
    await flow.dim(['Settings', 'Scene', 'Clock', 'Page']);
    await flow.walk([['Settings', 'Scene']], { trail: true });
    await s.code(SETTINGS, { at: BELOW, fontSize: 0.24 });
    await flow.note('Settings', '3 cases, each built, captured and checked', { side: 'above' });

    // The timing step reads the timing of the 'fork' step this scene has just played.
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

    await this.step('checks', {
      detail: true,
      title: 'Every case passes rayner check before it ships',
      line: 'Two checks come from Lantern; the fork adds four.',
      caption:
        'Lantern’s own tests compared a seeked frame with a played one and looked for jumps in motion. rayner check runs both on every case and adds the fork’s checks: text at least 14 px, no letters the fonts lack, words for every drawing, and a still picture while the caption is read.',
    });
    await s.clearOverlays();
    await flow.focus('all');
    await flow.dim(['Clock', 'Check']);
    await flow.walk([['Clock', 'Check']], { trail: true });
    await s.card(
      [
        ['Seek equals play', 'from Lantern'],
        ['No jumps in motion', 'from Lantern'],
        ['Text at least 14 px', 'fork'],
        ['Letters in the fonts', 'fork'],
        ['Words for every drawing', 'fork'],
        ['Still while the caption reads', 'fork'],
      ],
      { at: BELOW, fontSize: 0.2 },
    );

    await this.step('cost', {
      detail: true,
      title: 'A prebuilt page no longer exposes Lantern’s Worker endpoints',
      line: 'The Worker endpoints are gone; Inter is the default face.',
      caption:
        'Agents lose the Worker’s endpoints. Diagrams use embedded Inter by default; a scene can explicitly request another face and measure it before layout, as font-metrics does. Capturing a new diagram needs Chromium at build time, though a page built from stored snapshots does not. No engine change has gone upstream.',
    });
    await s.clearOverlays();
    await flow.dim(null);
    await flow.mark(['Capture'], { as: 'needs Chromium' });
    await flow.note('Capture', 'Chromium at build time; Inter by default', { side: 'below' });
    await flow.note('Page', 'no agent endpoints', { side: 'above' });
  }
}
