import {
  Scene,
  Text,
  Circle,
  Square,
  Line,
  Dot,
  Rectangle,
  Arrow,
  Group,
  Axes,
  Transform,
  TransformMatchingText,
  Restore,
  Circumscribe,
  view,
} from '../../../src/index.ts';
import type { SceneState, Mobject } from '../../../src/index.ts';
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
    result: 'An empty step, then the greeting',
    code: [
      "await this.step('hello', {",
      "  title: 'Hello',",
      "  caption: 'The greeting is visible.'",
      '});',
      "const hello = new Text('Hello!',",
      '  {fontSize: 1});',
      'await s.enter(hello);',
    ],
    caption: 'A named step and one drawing make a whole step: the greeting is its picture, the caption sits under it, and the step’s name becomes its link, as this step’s ?step=result shows.',
  },
  settings: {
    title: 'Declare a setting; each option becomes a case',
    result: 'The default case, then the case you chose',
    code: [
      'static settings = [{',
      "  id: 'feature',",
      "  label: 'Authoring feature',",
      "  default: 'animation', options: [",
      "    {value:'animation',label:'Animations'},",
      "    {value:'chart',label:'Charts'}]",
      '}];',
      'const choice = settingsOf(this).feature;',
    ],
    caption:
      'The feature picker on this page is the setting in the recipe. The build made one case per option, and choosing another feature loads another of those cases, with its own steps.',
  },
  diagram: {
    title: 'Capture a diagram, then follow a real edge',
    result: 'A bare flowchart, then its walked edge marked',
    code: [
      'const d = await s.show({source:',
      "  'graph LR\\nA[Start] --> B[Finish]'},",
      "  {box: 'main'});",
      "await d.walk([['A', 'B']], {trail: true});",
    ],
    caption:
      'Both flowcharts were captured at build time. walk throws on an edge the diagram does not have, so the trail on the right lies on the captured Start → Finish link.',
  },
  code: {
    title: 'Show the author’s code, then focus a line',
    result: 'Two plain lines, then the second marked as the update',
    code: [
      'const block = await s.code([',
      "  'let count = 0;', 'count += 1;'",
      "], {at: 'main'});",
      "await block.focus(1, {as: 'update'});",
    ],
    caption:
      'block.focus marks the second line as the update, and the mark stays after the motion ends. code.span and code.token mark smaller parts of a line.',
  },
  'code-diff': {
    title: 'Morph edited code by its surviving lines',
    result: 'count += 1 edited to count += 2, the new line marked',
    code: [
      'const block = await s.code([',
      "  'let count = 0;', 'count += 1;'",
      "], {at: 'top'});",
      "await block.morph(['let count = 0;',",
      "  'count += 2;'], {markAdded: true});",
    ],
    caption:
      'morph keeps the first line in place, moves the changed line in and marks it as added. For a full diff of a native Code object, use TransformDiff.',
  },
  animation: {
    title: 'Animate one object into another',
    result: 'A circle before, the square it became after',
    code: [
      'const shape = new Circle({radius: 0.8});',
      "await s.enter(shape, {describe: 'A shape'});",
      'await this.play(new Transform(shape,',
      '  new Square({side: 1.6})));',
    ],
    caption:
      'Transform reshapes the circle in place, so the square on the right is the same object the step entered. FadeIn, Create, Succession and the matching transforms run on the same play clock.',
  },
  matching: {
    title: 'Match text by shared characters',
    result: 'cache miss becomes cache hit',
    code: [
      "const before = new Text('cache miss');",
      'await s.enter(before);',
      "const after = new Text('cache hit');",
      'await this.play(new TransformMatchingText(',
      '  before, after));',
      's.keep(after);',
    ],
    caption:
      'TransformMatchingText moves the letters both labels share to their new places and fades the others out or in. It matches characters only and says nothing about what the words mean.',
  },
  restore: {
    title: 'Save a look, then animate back to it',
    result: 'The circle moves away and returns to its saved place',
    code: [
      'const circle = new Circle({radius: 0.8});',
      "await s.enter(circle, {describe: 'Circle'});",
      'circle.saveState();',
      'await this.play(circle.animate.shift([2,0]));',
      'await this.play(new Restore(circle));',
    ],
    caption: 'saveState records the circle’s points and style. Restore animates the same circle back to that record, and the dashed outline marks where it had moved.',
  },
  emphasis: {
    title: 'Leave emphasis in the resting picture',
    result: 'A plain 42, then 42 left circled',
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
      'With keep: true, Circumscribe leaves its outline round 42 when the motion ends. s.keep gives that outline a description, so a screen reader can say what the wordless ring marks.',
  },
  camera: {
    title: 'Frame the subject without moving its points',
    result: 'The camera moves closer; the circle stays put',
    code: [
      'const subject = new Circle({radius: 0.6});',
      "await s.enter(subject, {describe: 'Circle'});",
      'await s.focus(subject, {margin: 0.8});',
      "// await s.focus('all') returns home",
    ],
    caption:
      'A focused camera frames the whole picture, so this case has no before panel. The ruler that spanned the stage now shows only its middle, and the label gives the numbers: s.focus changed the view and left the circle’s coordinates alone.',
  },
  chart: {
    title: 'Plot the model’s numbers',
    result: 'Three values as numbers, then as a line on axes',
    code: [
      'const axes = new Axes({xRange: [0,2,1],',
      '  yRange: [0,2,1], width: 5, height: 3});',
      'const line = axes.lineGraph(',
      '  [[0,0],[1,2],[2,1]]);',
      "await s.enter(axes, line, {describe: 'Plot'});",
    ],
    caption:
      'lineGraph places each point by its value on the axes, so nothing in the line is positioned by hand. Axes can also plot a function or draw bars and guides.',
  },
  state: {
    title: 'Derive the picture from scene.state',
    result: 'state.count goes from 0 to 1, and the label follows',
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
      'The label is built by a view of this.state. Setting count to 1 and calling sync rebuilds the label from the recorded value.',
  },
  annotations: {
    title: 'Put an explanation beside its subject',
    result: 'A bare circle, then its centre pinned',
    code: [
      'await s.enter(new Circle({radius: 0.8}),',
      "  {describe: 'Circle'});",
      "await s.pin([0, 0], {label: 'centre'});",
    ],
    caption:
      's.pin attaches the word ‘centre’ to the point it names. s.callout labels a box, and s.dimension measures between two points.',
  },
  direction: {
    title: 'Place a card at the logical start',
    result: 'Start, in a left-to-right stage and in this right-to-left one',
    code: [
      "const s = stage(this, {direction: 'rtl'});",
      "await s.card([['Count', 3]],",
      "  {at: 'start', direction: 'ltr'});",
    ],
    caption: 'A right-to-left stage mirrors its regions, so the card placed at start sits on the right. Its own direction: ‘ltr’ keeps Count and 3 in left-to-right order.',
  },
  drawing: {
    title: 'Draw a native path with a tool',
    result: 'Two end points, then the line the pen drew between them',
    code: [
      'const path = new Line([-4,-1],[4,1]);',
      "await s.draw(path, {tool: 'pen',",
      "  describe: 'A rising line'});",
    ],
    caption:
      's.draw moves a pen along the line as it appears, and the line stays when the pen lifts. Its description, ‘A rising line’, gives the same fact to a reader who never sees the motion.',
  },
};


/** What an author choosing Rayner wants to do, as the question each case answers. */
const QUESTIONS: Record<Feature, string> = {
  steps: 'How do I give an idea its own link and picture?',
  settings: 'How do I let a reader switch between prepared cases?',
  diagram: 'How do I show a path through a real flowchart?',
  code: 'How do I point at one line of code?',
  'code-diff': 'How do I show an edit without redrawing the code?',
  animation: 'How do I show one shape turning into another?',
  matching: 'How do I change a label and keep its shared letters?',
  restore: 'How do I put an object back after a demonstration?',
  emphasis: 'How do I make a result stand out after the motion ends?',
  camera: 'How do I bring the reader closer to a small subject?',
  chart: 'How do I plot the model’s numbers?',
  state: 'How do I keep a label in step with the model’s state?',
  annotations: 'How do I name a point in the picture?',
  direction: 'How do I lay out panels for a right-to-left page?',
  drawing: 'How do I reveal a line as if drawn by hand?',
};
/** Why an author reaches for each feature, said on its recipe. */
const USES: Record<Feature, string> = {
  steps: 'Each idea gets a stable link and a resting picture.',
  settings: 'A reader switches between cases the build has already made.',
  diagram: 'A highlighted path follows a real captured edge.',
  code: 'A mark on one line sends the reader to the operation the step is about.',
  'code-diff': 'An unchanged line stays in place while the edit arrives.',
  animation: 'One object changes shape while the rest of the picture stays.',
  matching: 'Letters the old and new labels share stay on screen.',
  restore: 'An object returns to its saved position after a demonstration.',
  emphasis: 'The evidence stays marked after the animation ends.',
  camera: 'A small subject is seen closer without changing its coordinates.',
  chart: 'Plotted positions come from the model’s numbers.',
  state: 'A recorded value changes, and the label is derived from it.',
  annotations: 'A label sits on the point it names, so the reader need not search for it.',
  direction: 'Panel placement follows a right-to-left reading order.',
  drawing: 'A route is revealed by following its own path.',
};
/** What the reader predicts on each recipe; the result step's before and after panels answer it. */
const PREDICT: Record<Feature, string> = {
  steps: 'Predict: opened from a link, what does the next step show, and what is its address?',
  settings: 'Predict: which case is this page showing, and how many did the build make?',
  diagram: 'Predict: once the walk ends, what stays on the flowchart?',
  code: 'Predict: once the focus ends, which line is still marked?',
  'code-diff': 'Predict: during the morph, which line moves and which stays put?',
  animation: 'Predict: opened from a link, does the next step show the circle, the square or both?',
  matching: 'Predict: from cache miss to cache hit, which letters stay on screen?',
  restore: 'Predict: opened from a link, how would a reader know the circle ever moved?',
  emphasis: 'Predict: when Circumscribe ends, is 42 still circled?',
  camera: 'Predict: after the focus, has the circle moved, or has the view?',
  chart: 'Predict: which values does the line pass through?',
  state: 'Predict: after the sync, what number does the label show, and where does it come from?',
  annotations: 'Predict: what does the pin say, and where does it point?',
  direction: 'Predict: in a right-to-left stage, where does a card placed at start go?',
  drawing: 'Predict: opened from a link, what is left of the pen’s motion?',
};

/** The script's one-sentence answer, stated on every case's result step. */
const ANSWER =
  'Each feature is a few lines of construct(), and a reader who opens its step from a link sees only the picture those lines leave at rest, so the resting picture must show what changed';

// The result step's two panels: what the reader would have seen before the feature ran, and after.
const BEFORE: [number, number, number, number] = [-7.4, -3.5, -2.5, 2.1],
  AFTER: [number, number, number, number] = [-1.3, -3.5, 7.4, 2.1];
const centre = (b: readonly number[]): [number, number] => [(b[0]! + b[2]!) / 2, (b[1]! + b[3]!) / 2];

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
    // The script's answer and check questions (script.md); every case's result step states the answer.
    answer: ANSWER,
    checks: [
      {
        question:
          'Your step moves a highlighted label with an animation, then holds for its caption. A reader opens that step from a link. What do they see, and what should the step leave on screen?',
        answer:
          'Only the resting picture after the motion: a direct link does not play it. So the step should leave the label at its end and something that shows where it came from, such as a faint copy of its start, as each result here shows a before beside its after.',
      },
      {
        question:
          'You want a counter that the trace records and the picture shows, and the two must never disagree. Which case’s recipe do you copy, and why not edit a Text?',
        answer:
          'State and views: set this.state.count and sync a view(this, …) built from it. The picture is derived from the recorded state, so there is no second copy of the value to forget to update.',
      },
      {
        question:
          'An Arabic explainer puts its summary card at ‘start’. Which side of the stage does it land on, and how do you keep the card’s digits and labels in left-to-right order?',
        answer: 'The right: in a right-to-left stage, start is the right-hand region. Give the card direction: \'ltr\'.',
      },
    ],
  };
  static settings = [
    {
      id: 'feature',
      label: 'Authoring feature',
      default: 'animation',
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
    const s = stage(this, {
      style: 'github-dark',
      headingSize: 0.6,
      numbered: false,
      ...(feature === 'direction' ? { direction: 'rtl' as const } : {}),
    });
    const ink = s.palette.ink,
      accent = s.emphasis,
      soft = s.soft;

    // 1. The author's question, and the few lines that answer it.
    await this.step('recipe', {
      title: QUESTIONS[feature],
      line: PREDICT[feature],
      caption: `${USES[feature]} An author writes these ${example.code.length} lines; the next step runs them, with positions and colours added.`,
    });
    await s.code(example.code, { at: 'full', fontSize: 0.6 });
    this.state.feature = feature;
    this.state.phase = 'recipe';

    // 2. The result, at rest: before on the left, after on the right.
    const panels = async (before: Mobject[], describe: string) => {
      const [bx] = centre(BEFORE),
        [ax] = centre(AFTER);
      const heads = new Group(
        new Text('Before', { fontSize: 0.34, color: soft }).moveTo([bx, 2.55]),
        new Text('After', { fontSize: 0.34, color: soft }).moveTo([ax, 2.55]),
        new Arrow([BEFORE[2] + 0.15, -0.7], [AFTER[0] - 0.15, -0.7], { stroke: soft, strokeWidth: 0.04 }),
      );
      await s.enter(heads, ...before, { describe: `Before: ${describe}` });
    };
    // Each result names its own before and after; the camera case has no before panel.
    await this.step('result', { title: example.result, caption: `${example.caption} ${ANSWER}.` });
    this.state.phase = 'result';
    await s.clear();
    const [ax, ay] = centre(AFTER),
      [bx, by] = centre(BEFORE);
    if (feature === 'steps') {
      await panels(
        [
          new Rectangle({ width: 4.4, height: 2.5, stroke: soft, strokeWidth: 0.03, cornerRadius: 0.1 }).moveTo([bx, by]),
          new Text('an empty step', { fontSize: 0.36, color: soft }).moveTo([bx, by]),
        ],
        'an empty step',
      );
      await s.enter(
        new Text('Hello!', { fontSize: 1.4, color: ink }).moveTo([ax, ay + 0.3]),
        new Text('its own link: ?step=result', { fontSize: 0.34, font: 'mono', color: soft }).moveTo([ax, ay - 1.1]),
      );
    } else if (feature === 'settings') {
      const options = FeatureTour.settings[0]!;
      await panels([], `the default case, feature = ${options.default}`);
      await s.card([['Default case', options.default]], { at: BEFORE, fontSize: 0.45 });
      await s.card([['This case', feature], ['Cases built', String(options.options.length)]], { at: AFTER, fontSize: 0.55 });
    } else if (feature === 'diagram') {
      await panels([], 'the captured flowchart, no path marked');
      await s.show({ source: 'graph LR\nA[Start] --> B[Finish]' }, { box: BEFORE });
      const d = await s.show({ source: 'graph LR\nA[Start] --> B[Finish]' }, { box: AFTER });
      await d.walk([['A', 'B']], { trail: true });
    } else if (feature === 'code') {
      await panels([], 'the two lines, nothing marked');
      await s.code(['let count = 0;', 'count += 1;'], { at: BEFORE, fontSize: 0.36 });
      const block = await s.code(['let count = 0;', 'count += 1;'], { at: AFTER, fontSize: 0.45 });
      await block.focus(1, { as: 'update' });
    } else if (feature === 'code-diff') {
      await panels([], 'count += 1');
      await s.code(['let count = 0;', 'count += 1;'], { at: BEFORE, fontSize: 0.36 });
      const block = await s.code(['let count = 0;', 'count += 1;'], { at: AFTER, fontSize: 0.5 });
      await block.morph(['let count = 0;', 'count += 2;'], { markAdded: true });
    } else if (feature === 'animation') {
      await panels(
        [new Circle({ radius: 0.8, stroke: accent, strokeWidth: 0.06 }).moveTo([bx, by])],
        'a circle',
      );
      const shape = new Circle({ radius: 0.8, stroke: accent, strokeWidth: 0.06 }).moveTo([ax, ay]);
      await s.enter(shape, { describe: 'After: the circle has become a square' });
      await this.play(new Transform(shape, new Square({ side: 1.6, stroke: accent, strokeWidth: 0.06 }).moveTo([ax, ay])));
    } else if (feature === 'matching') {
      await panels([new Text('cache miss', { fontSize: 0.6, color: ink }).moveTo([bx, by])], 'cache miss');
      const before = new Text('cache miss', { fontSize: 1, color: ink }).moveTo([ax, ay]);
      await s.enter(before);
      const after = new Text('cache hit', { fontSize: 1, color: ink }).moveTo([ax, ay]);
      await this.play(new TransformMatchingText(before, after));
      s.keep(after);
    } else if (feature === 'restore') {
      await panels(
        [
          new Circle({ radius: 0.6, stroke: accent, strokeWidth: 0.06 }).moveTo([bx, by]),
          new Text('saveState() here', { fontSize: 0.3, color: soft }).moveTo([bx, by - 1.1]),
        ],
        'a circle whose state is saved',
      );
      const circle = new Circle({ radius: 0.8, stroke: accent, strokeWidth: 0.06 }).moveTo([ax - 1, ay]);
      // Where the demonstration took it, left as a dashed outline.
      const away = new Circle({ radius: 0.8, stroke: soft, strokeWidth: 0.03 }).moveTo([ax + 1, ay]);
      away.style.dashArray = '0.1 0.08';
      await s.enter(circle, { describe: 'After: the circle is back at its saved place; a dashed outline marks where it moved to' });
      circle.saveState();
      await this.play(circle.animate.shift([2, 0]));
      await s.enter(away, new Text('moved here, then restored', { fontSize: 0.3, color: soft }).moveTo([ax + 1, ay - 1.2]), {
        describe: 'A dashed outline where the circle moved to before Restore',
      });
      await this.play(new Restore(circle));
    } else if (feature === 'emphasis') {
      await panels([new Text('42', { fontSize: 0.8, color: ink }).moveTo([bx, by])], 'the result 42, unmarked');
      const target = new Text('42', { fontSize: 1.2, color: ink }).moveTo([ax, ay]);
      await s.enter(target);
      const circle = new Circumscribe(target, { keep: true, color: accent });
      s.keep(circle.outline, { describe: 'After: the result 42 remains circled' });
      await this.play(circle);
    } else if (feature === 'camera') {
      // A ruler across the whole stage, so the closer view shows how little of it the camera now frames.
      const ruler = new Group(new Line([-7, -1.1], [7, -1.1], { stroke: soft, strokeWidth: 0.02 }));
      for (let x = -7; x <= 7; x++) {
        ruler.add(new Line([x, -1.02], [x, -1.18], { stroke: soft, strokeWidth: 0.02 }));
        // Numbers on the even ticks only, so none is cut by the closer view's edge.
        if (x % 2 === 0) ruler.add(new Text(String(x), { fontSize: 0.18, font: 'mono', color: soft }).moveTo([x, -1.32]));
      }
      const subject = new Circle({ radius: 0.6, stroke: accent, strokeWidth: 0.07 }).moveTo([0, 0]);
      await s.enter(ruler, subject, {
        describe: 'A circle at the centre of a ruler that spans the stage from −7 to 7, numbered on its even ticks',
      });
      const home = this.frame.box()!;
      await s.focus(subject, { margin: 0.8 });
      const now = this.frame.box()!,
        wide = now[2] - now[0];
      // Said in the closer view, at a size that reads there.
      const k = wide / (home[2] - home[0]);
      const said = new Text(`the view: ${wide.toFixed(1)} of the stage’s ${home[2] - home[0]} units · the circle: still at (0, 0), radius 0.6`, {
        fontSize: 0.3 * k,
        color: ink,
      }).moveTo([(now[0] + now[2]) / 2, 1.0]);
      await s.enter(said, {
        describe: `The camera now frames ${wide.toFixed(1)} of the stage’s ${home[2] - home[0]} units; the circle is still at (0, 0) with radius 0.6`,
      });
      this.state.camera = { before: home[2] - home[0], after: Number(wide.toFixed(2)) };
    } else if (feature === 'chart') {
      const data: [number, number][] = [
        [0, 0],
        [1, 2],
        [2, 1],
      ];
      await panels([], 'the model’s three values as numbers');
      await s.card(
        data.map(([x, y]) => [`x = ${x}`, `y = ${y}`]),
        { at: BEFORE, fontSize: 0.45 },
      );
      const axes = new Axes({
        xRange: [0, 2, 1],
        yRange: [0, 2, 1],
        width: 6.5,
        height: 3.8,
        axisStyle: { stroke: soft, labelColor: ink, labelFontSize: 0.5, includeNumbers: true },
      });
      axes.moveTo([ax, ay]);
      const line = axes.lineGraph(data, { color: accent });
      await s.enter(axes, line, { describe: 'After: a line through values zero, two and one at x zero, one and two' });
    } else if (feature === 'state') {
      await panels(
        [
          new Text('0', { fontSize: 1, color: ink }).moveTo([bx, by]),
          new Text('state.count = 0', { fontSize: 0.3, font: 'mono', color: soft }).moveTo([bx, by - 1.1]),
        ],
        'the view of state.count = 0',
      );
      this.state.count = 0;
      const label = view(
        this,
        (state: SceneState) => new Text(String(state.count), { fontSize: 1.3, color: ink }).moveTo([ax, ay]),
        { place: false },
      );
      await s.enter(label, { describe: () => `Recorded count: ${String(this.state.count)}` });
      this.state.count = 1;
      await this.play(label.sync());
      await s.enter(new Text('state.count = 1', { fontSize: 0.34, font: 'mono', color: soft }).moveTo([ax, ay - 1.3]));
    } else if (feature === 'annotations') {
      await panels([new Circle({ radius: 0.6, stroke: accent, strokeWidth: 0.05 }).moveTo([bx, by])], 'a circle, nothing named');
      await s.enter(new Circle({ radius: 0.8, stroke: accent, strokeWidth: 0.05 }).moveTo([ax, ay]), {
        describe: 'After: a circle whose centre is pinned',
      });
      await s.pin([ax, ay], { label: 'centre', size: 0.42 });
    } else if (feature === 'direction') {
      // In a right-to-left stage the panels mirror: the before panel is drawn on the right.
      await s.enter(
        new Rectangle({ width: 6.8, height: 1.6, stroke: soft, strokeWidth: 0.03, cornerRadius: 0.1 }).moveTo([-4, 1.2]),
        new Text('Before: start in a left-to-right stage', { fontSize: 0.34, color: soft }).moveTo([-4, 1.2]),
        { describe: 'Before: an outline on the left, where start is in a left-to-right stage' },
      );
      await s.card([['Count', 3]], { at: 'start', direction: 'ltr', width: 6.8, fontSize: 0.65 });
      await s.enter(new Text('After: start in this right-to-left stage', { fontSize: 0.34, color: soft }).moveTo([4, -2.8]));
    } else {
      await panels(
        [
          new Dot({ radius: 0.08, color: accent }).moveTo([bx - 1.8, by - 0.45]),
          new Dot({ radius: 0.08, color: accent }).moveTo([bx + 1.8, by + 0.45]),
          new Text('the path’s two ends', { fontSize: 0.3, color: soft }).moveTo([bx, by - 1.1]),
        ],
        'the path’s two ends, nothing drawn',
      );
      const path = new Line([ax - 3.6, ay - 0.9], [ax + 3.6, ay + 0.9], { stroke: accent, strokeWidth: 0.08 });
      await s.draw(path, { tool: 'pen', describe: 'After: a rising line, drawn' });
    }
  }
}
