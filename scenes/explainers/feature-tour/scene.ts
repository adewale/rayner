import {
  Scene,
  Text,
  Circle,
  Square,
  Line,
  Axes,
  Transform,
  TransformMatchingText,
  Restore,
  Circumscribe,
  view,
} from '../../../src/index.ts';
import type { SceneState } from '../../../src/index.ts';
import { stage, settingsOf } from '../../../explain/index.ts';

type Feature =
  | 'steps'
  | 'settings'
  | 'diagram'
  | 'code'
  | 'code-diff'
  | 'animation'
  | 'matching'
  | 'restore'
  | 'emphasis'
  | 'camera'
  | 'chart'
  | 'state'
  | 'annotations'
  | 'direction'
  | 'drawing';

// These are author-side excerpts, not the implementation of the reader player.
// The complete, runnable version of each example is this scene's construct() below.
export const RECIPES: Record<Feature, { title: string; result: string; code: string[]; caption: string }> = {
  steps: {
    title: 'Name a step, then draw its resting picture',
    result: 'The greeting appears',
    code: [
      "await this.step('hello', {",
      "  title: 'Hello',",
      "  caption: 'The greeting is visible.'",
      '});',
      "const hello = new Text('Hello!',",
      '  {fontSize: 1});',
      'await s.enter(hello);',
    ],
    caption: 'A named step and a drawing are enough. The caption sits below the picture; the step name becomes a link.',
  },
  settings: {
    title: 'Declare a setting; each option becomes a case',
    result: 'This case reads its chosen option',
    code: [
      'static settings = [{',
      "  id: 'feature',",
      "  label: 'Authoring feature',",
      "  default: 'steps', options: [",
      "    {value:'steps',label:'Steps and text'},",
      "    {value:'chart',label:'Charts'}]",
      '}];',
      'const choice = settingsOf(this).feature;',
    ],
    caption:
      'The picker above the picture is a real setting. Choose another feature and the page loads another prebuilt case with its own steps.',
  },
  diagram: {
    title: 'Capture a diagram, then follow a real edge',
    result: 'The marked path remains',
    code: [
      'const d = await s.show({source:',
      "  'graph LR\\nA[Start] --> B[Finish]'},",
      "  {box: 'main'});",
      "await d.walk([['A', 'B']], {trail: true});",
    ],
    caption:
      'The graph is captured at build time. walk checks that the edge exists and leaves a trail; it is not a line drawn by guesswork.',
  },
  code: {
    title: 'Show the author’s code, then focus a line',
    result: 'The changed line stays marked',
    code: [
      'const block = await s.code([',
      "  'let count = 0;', 'count += 1;'",
      "], {at: 'main'});",
      "await block.focus(1, {as: 'update'});",
    ],
    caption:
      'The code panel is an authoring helper. A line focus remains on screen; code.span and code.token can address smaller parts.',
  },
  'code-diff': {
    title: 'Morph edited code by its surviving lines',
    result: 'The edited line is marked',
    code: [
      'const block = await s.code([',
      "  'let count = 0;', 'count += 1;'",
      "], {at: 'top'});",
      "await block.morph(['let count = 0;',",
      "  'count += 2;'], {markAdded: true});",
    ],
    caption:
      'The first line stays while the changed line moves in and receives an added mark. TransformDiff handles a full diff when the code is a native Code object.',
  },
  animation: {
    title: 'Animate one object into another',
    result: 'The circle becomes a square',
    code: [
      'const shape = new Circle({radius: 0.8});',
      "await s.enter(shape, {describe: 'A shape'});",
      'await this.play(new Transform(shape,',
      '  new Square({side: 1.6})));',
    ],
    caption:
      'The transform preserves the visible object across the step. FadeIn, Create, Succession and matching transforms use the same play clock.',
  },
  matching: {
    title: 'Match text by shared characters',
    result: 'The shared text stays recognisable',
    code: [
      "const before = new Text('cache miss');",
      'await s.enter(before);',
      "const after = new Text('cache hit');",
      'await this.play(new TransformMatchingText(',
      '  before, after));',
      's.keep(after);',
    ],
    caption:
      'Matching pairs common text before introducing new letters. It is not a proof that two different words mean the same thing.',
  },
  restore: {
    title: 'Save a look, then animate back to it',
    result: 'The circle returns to its saved place',
    code: [
      'const circle = new Circle({radius: 0.8});',
      "await s.enter(circle, {describe: 'Circle'});",
      'circle.saveState();',
      'await this.play(circle.animate.shift([1,0]));',
      'await this.play(new Restore(circle));',
    ],
    caption: 'saveState records the shape. Restore animates its points back; the saved object remains the same object.',
  },
  emphasis: {
    title: 'Leave emphasis in the resting picture',
    result: 'The circled result stays circled',
    code: [
      "const target = new Text('42');",
      'await s.enter(target);',
      'const circle = new Circumscribe(target,',
      '  {keep: true, color: s.emphasis});',
      's.keep(circle.outline,',
      "  {describe: 'Circle'});",
      'await this.play(circle);',
    ],
    caption:
      'Circumscribe with keep leaves an outline. The description gives a text alternative to an otherwise wordless mark.',
  },
  camera: {
    title: 'Frame the subject without moving its points',
    result: 'The camera moves closer',
    code: [
      'const subject = new Circle({radius: 0.6});',
      "await s.enter(subject, {describe: 'Circle'});",
      'await s.focus(subject, {margin: 2});',
      "// await s.focus('all') returns home",
    ],
    caption:
      'Camera focus changes the view, not the circle’s coordinates. The previous step shows the code; the circle fills the closer view.',
  },
  chart: {
    title: 'Plot the model’s numbers',
    result: 'Three values make a graph',
    code: [
      'const axes = new Axes({xRange: [0,2,1],',
      '  yRange: [0,2,1], width: 5, height: 3});',
      'const line = axes.lineGraph(',
      '  [[0,0],[1,2],[2,1]]);',
      "await s.enter(axes, line, {describe: 'Plot'});",
    ],
    caption:
      'These three points, not hand-positioned bars, make the line. Axes can also plot a function or draw bars and guides.',
  },
  state: {
    title: 'Derive the picture from scene.state',
    result: 'The state-driven value changes',
    code: [
      'this.state.count = 0;',
      'const label = view(this, state =>',
      '  new Text(String(state.count),',
      '    {fontSize: 1}));',
      "await s.enter(label, {describe: 'Count'});",
      'this.state.count = 1;',
      'await this.play(label.sync());',
    ],
    caption:
      'The visible number is a view of the recorded state. Changing state and syncing rebuilds the picture; no separate label value is edited.',
  },
  annotations: {
    title: 'Put an explanation beside its subject',
    result: 'A pin names the point',
    code: [
      'await s.enter(new Circle({radius: 0.8}),',
      "  {describe: 'Circle'});",
      "await s.pin([0, 0], {label: 'centre'});",
    ],
    caption:
      'A pin attaches words to a specific point. callout and dimension are other authoring helpers for local evidence.',
  },
  direction: {
    title: 'Place a card at the logical start',
    result: 'The card follows RTL start',
    code: [
      "const s = stage(this, {direction: 'rtl'});",
      "await s.card([['Count', 3]],",
      "  {at: 'start', direction: 'ltr'});",
    ],
    caption: 'In an RTL stage, start is the right-hand region. This card keeps its own label and value in LTR order.',
  },
  drawing: {
    title: 'Draw a native path with a tool',
    result: 'The drawn line remains',
    code: [
      'const path = new Line([-4,-1],[4,1]);',
      "await s.draw(path, {tool: 'pen',",
      "  describe: 'A rising line'});",
    ],
    caption:
      'The pen follows the line as it is drawn. The path stays on screen, and its text description does not depend on watching the motion.',
  },
};

export default class FeatureTour extends Scene {
  static meta = {
    id: 'feature-tour',
    title: 'How do I write that in Rayner?',
    caseNavigation: 'first' as const,
    sources: [
      'https://github.com/adewale/rayner/blob/main/scenes/explainers/feature-tour/scene.ts',
      'https://github.com/adewale/rayner/blob/main/docs/REFERENCE.md',
      'https://github.com/adewale/rayner/tree/main/scenes/explainers/latest-search',
      'https://github.com/adewale/rayner/tree/main/scenes/explainers/mr-cache',
      'https://github.com/adewale/rayner/tree/main/scenes/explainers/layout-direction',
    ],
  };
  static settings = [
    {
      id: 'feature',
      label: 'Authoring feature',
      default: 'steps',
      options: [
        { value: 'steps', label: 'Steps and text' },
        { value: 'settings', label: 'Settings' },
        { value: 'diagram', label: 'Diagrams' },
        { value: 'code', label: 'Code panels' },
        { value: 'code-diff', label: 'Code edits' },
        { value: 'animation', label: 'Animations' },
        { value: 'matching', label: 'Matching text' },
        { value: 'restore', label: 'Restore' },
        { value: 'emphasis', label: 'Emphasis' },
        { value: 'camera', label: 'Camera' },
        { value: 'chart', label: 'Charts' },
        { value: 'state', label: 'State and views' },
        { value: 'annotations', label: 'Annotations' },
        { value: 'direction', label: 'RTL layout' },
        { value: 'drawing', label: 'Drawing tools' },
      ],
    },
  ];

  override async construct() {
    const feature = settingsOf(this).feature as Feature;
    const example = RECIPES[feature];
    const uses: Record<Feature, string> = {
      steps: 'Give each idea a stable link and a resting picture.',
      settings: 'Let a reader compare two prepared cases.',
      diagram: 'Prove that a highlighted path follows a real captured edge.',
      code: 'Point at the operation the reader needs to inspect.',
      'code-diff': 'Keep an unchanged line in place while explaining an edit.',
      animation: 'Show one object changing instead of replacing an entire picture.',
      matching: 'Preserve common letters when a label changes.',
      restore: 'Return an object to its saved position after a demonstration.',
      emphasis: 'Make the evidence visible after the animation ends.',
      camera: 'Show a small subject without changing its model coordinates.',
      chart: 'Keep plotted positions tied to the model’s numbers.',
      state: 'Change a recorded value and derive the label from it.',
      annotations: 'Attach an explanation to a point instead of making the reader find it.',
      direction: 'Reuse panel placement for a right-to-left reading order.',
      drawing: 'Reveal a route by following its own path.',
    };
    const s = stage(this, {
      style: 'github-dark',
      headingSize: 0.6,
      numbered: false,
      ...(feature === 'direction' ? { direction: 'rtl' as const } : {}),
    });
    await this.step('recipe', {
      title: example.title,
      caption: uses[feature],
    });
    await s.code(example.code, { at: 'full', fontSize: 0.6 });
    this.state.feature = feature;
    this.state.phase = 'recipe';

    await this.step('result', { title: example.result, caption: example.caption });
    this.state.phase = 'result';
    await s.clear();
    if (feature === 'steps') {
      await s.enter(new Text('Hello!', { fontSize: 1.4, color: s.palette.ink }).moveTo([0, 0]));
    } else if (feature === 'settings') {
      await s.card([['Case', feature]], { at: 'top', fontSize: 0.6 });
    } else if (feature === 'diagram') {
      const d = await s.show({ source: 'graph LR\nA[Start] --> B[Finish]' }, { box: 'full' });
      await d.walk([['A', 'B']], { trail: true });
    } else if (feature === 'code') {
      const block = await s.code(['let count = 0;', 'count += 1;'], { at: 'top', fontSize: 0.45 });
      await block.focus(1, { as: 'update' });
    } else if (feature === 'code-diff') {
      const block = await s.code(['let count = 0;', 'count += 1;'], { at: 'top', fontSize: 0.53 });
      await block.morph(['let count = 0;', 'count += 2;'], { markAdded: true });
    } else if (feature === 'animation') {
      const shape = new Circle({ radius: 0.8, stroke: s.emphasis, strokeWidth: 0.06 }).moveTo([0, 0]);
      await s.enter(shape, { describe: 'A circle changes into a square' });
      await this.play(
        new Transform(shape, new Square({ side: 1.6, stroke: s.emphasis, strokeWidth: 0.06 }).moveTo([0, 0])),
      );
    } else if (feature === 'matching') {
      const before = new Text('cache miss', { fontSize: 1, color: s.palette.ink }).moveTo([0, 0]);
      await s.enter(before);
      const after = new Text('cache hit', { fontSize: 1, color: s.palette.ink }).moveTo([0, 0]);
      await this.play(new TransformMatchingText(before, after));
      s.keep(after);
    } else if (feature === 'restore') {
      const circle = new Circle({ radius: 0.8, stroke: s.emphasis, strokeWidth: 0.06 }).moveTo([0, 0]);
      await s.enter(circle, { describe: 'A circle moves right and returns to its saved position' });
      circle.saveState();
      await this.play(circle.animate.shift([1, 0]));
      await this.play(new Restore(circle));
    } else if (feature === 'emphasis') {
      const target = new Text('42', { fontSize: 1.2, color: s.palette.ink }).moveTo([0, 0]);
      await s.enter(target);
      const circle = new Circumscribe(target, { keep: true, color: s.emphasis });
      s.keep(circle.outline, { describe: 'The result 42 remains circled' });
      await this.play(circle);
    } else if (feature === 'camera') {
      const subject = new Circle({ radius: 0.6, stroke: s.emphasis, strokeWidth: 0.07 }).moveTo([0, 0]);
      await s.enter(subject, { describe: 'A circle remains in the same place as the camera moves closer' });
      await s.focus(subject, { margin: 2 });
    } else if (feature === 'chart') {
      const axes = new Axes({
        xRange: [0, 2, 1],
        yRange: [0, 2, 1],
        width: 10,
        height: 4,
        axisStyle: { stroke: s.soft, labelColor: s.palette.ink, labelFontSize: 0.65, includeNumbers: true },
      });
      axes.moveTo([0, 0]);
      const line = axes.lineGraph(
        [
          [0, 0],
          [1, 2],
          [2, 1],
        ],
        { color: s.emphasis },
      );
      await s.enter(axes, line, { describe: 'A line through values zero, two and one at x zero, one and two' });
    } else if (feature === 'state') {
      this.state.count = 0;
      const label = view(
        this,
        (state: SceneState) => new Text(String(state.count), { fontSize: 1.3, color: s.palette.ink }).moveTo([0, 0]),
        { place: false },
      );
      await s.enter(label, { describe: () => `Recorded count: ${String(this.state.count)}` });
      this.state.count = 1;
      await this.play(label.sync());
    } else if (feature === 'annotations') {
      await s.enter(new Circle({ radius: 0.8, stroke: s.emphasis, strokeWidth: 0.05 }).moveTo([0, 0]), {
        describe: 'A circle whose centre is pinned',
      });
      await s.pin([0, 0], { label: 'centre', size: 0.42 });
    } else if (feature === 'direction') {
      await s.card([['Count', 3]], { at: 'start', direction: 'ltr', width: 6.8, fontSize: 0.65 });
    } else {
      const path = new Line([-4, -1], [4, 1], { stroke: s.emphasis, strokeWidth: 0.08 });
      await s.draw(path, { tool: 'pen', describe: 'A rising line' });
    }
  }
}
