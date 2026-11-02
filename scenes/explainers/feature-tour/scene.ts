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
// `recipe` is the recipe step's caption: what the lines do, and what the result step draws besides them.
export const RECIPES: Record<Feature, { title: string; result: string; code: string[]; recipe: string; caption: string }> = {
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
    recipe:
      'this.step opens a step and gives it a name, a title and a caption; whatever is entered after it, here one Text, becomes that step’s picture. Next, beside the greeting, the page draws an empty frame for the step before anything is entered, and prints the step’s address under it.',
    caption:
      'The greeting is the step’s whole picture and the caption sits under it. The name passed to this.step, hello, becomes the step’s address, so a link can open this picture without playing anything before it.',
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
    recipe:
      'These are two of the fifteen options of this page’s own setting. The build runs construct() once per option before anyone reads the page, and settingsOf(this) tells each run which option it is making. The result compares two of those cases with cards.',
    caption:
      'The feature picker on this page is the setting in the recipe, with all fifteen options. Each option is a case built ahead of time, and choosing another feature loads that case with its own two steps.',
  },
  diagram: {
    title: 'Capture a diagram, then follow one of its edges',
    result: 'A bare flowchart, then its walked edge marked',
    code: [
      'const d = await s.show({source:',
      "  'graph LR\\nA[Start] --> B[Finish]'},",
      "  {box: 'main'});",
      "await d.walk([['A', 'B']], {trail: true});",
    ],
    recipe:
      's.show draws Mermaid source as a diagram captured when the page is built, and d.walk names each edge it travels by the ids of its two nodes. Next to the walked flowchart the page draws it once more, bare.',
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
    recipe:
      's.code draws the lines on a code panel, and block.focus puts a bar on one of them with a label saying what it is. In the result an unmarked copy of the panel sits on the left.',
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
    recipe:
      'block.morph is given the panel’s new lines and keeps any old line that survives unchanged; markAdded flags the lines that are new. The panel as it was before the edit is drawn again beside the morphed one.',
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
    recipe:
      'Transform takes the shape already on stage and a target, and moves the shape’s outline onto the target’s. The result runs these lines on the right; the circle on its left is a second circle the page draws first.',
    caption:
      'Only the square comes from the recipe: Transform reshaped the circle in place, so the object the step entered is now a square, and a link to this step shows no circle of its own. The circle on the left was drawn separately so that a reader who arrives by link can see what the motion did.',
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
    recipe:
      'TransformMatchingText pairs letters of the old text with equal letters of the new one, moves each pair, and fades the leftovers. On the next step the old label stays on the left, and a list under the new one says which letters moved and which faded.',
    caption:
      'The list under cache hit comes from the pairs the animation made. It matched characters only, so a shared letter moves even when the words around it mean something else.',
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
    recipe:
      'saveState records the circle’s points and style, and Restore animates the same circle back to that record. The result adds a dashed outline that none of these lines draws, at the place the circle visited.',
    caption:
      'Left alone, these lines end with the circle where it started, and a reader arriving by link would see no sign that it moved. The dashed outline was drawn separately to mark where the circle went before Restore brought it back.',
  },
  emphasis: {
    title: 'Leave emphasis in the resting picture',
    result: 'A plain 42, then 42 left in a box',
    code: [
      "const target = new Text('42');",
      'await s.enter(target);',
      'const circle = new Circumscribe(target,',
      '  {keep: true, color: s.emphasis});',
      's.keep(circle.outline,',
      "  {describe: 'Box round 42'});",
      'await this.play(circle);',
    ],
    recipe:
      'Circumscribe draws an outline round its target and normally removes it when the play ends; keep: true changes that. s.keep gives the outline words for a screen reader. An unmarked 42 is set beside it for comparison.',
    caption:
      'With keep: true, Circumscribe leaves its rectangle round 42 when the motion ends. s.keep gave that outline a description, so a screen reader can say what the wordless box marks. Pass shape: ‘circle’ for a ring.',
  },
  camera: {
    title: 'Frame the subject without moving its points',
    result: 'The same circle, seen through a closer view',
    code: [
      'const subject = new Circle({radius: 0.6});',
      "await s.enter(subject, {describe: 'Circle'});",
      'await s.focus(subject, {margin: 0.8});',
      "// await s.focus('all') returns home",
    ],
    recipe:
      's.focus moves the camera until the subject fills the stage below the heading. A moved camera frames everything on stage, so the result has no room for a before panel: it lays a ruler across the stage under the circle first, and labels the closer view with its numbers.',
    caption:
      'The ruler that spanned the stage from −7 to 7 now shows only its middle, and the label gives the numbers: s.focus changed what the camera frames and left the circle’s coordinates alone.',
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
    recipe:
      'Axes maps values to places on the stage, and lineGraph joins the points it is given through that map. The same three values also appear as a card beside the plot.',
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
    recipe:
      'The trace records every value set on this.state, and view(this, …) builds the label from that state again each time its sync is played. In the result the label at count 0 stands on the left, and each label has its state printed under it.',
    caption:
      'The label is built by a view of this.state. Setting count to 1 and playing sync rebuilt the label from the recorded value, so the picture and the trace both say 1.',
  },
  annotations: {
    title: 'Put an explanation beside its subject',
    result: 'A bare circle, then its centre pinned',
    code: [
      'await s.enter(new Circle({radius: 0.8}),',
      "  {describe: 'Circle'});",
      "await s.pin([0, 0], {label: 'centre'});",
    ],
    recipe:
      's.pin takes a point in stage units and a label, and draws the label with a short leader to that point. A bare circle sits on the left of the result.',
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
    recipe:
      'direction: ‘rtl’ mirrors the stage’s named regions, while a card’s own direction sets the order of what is inside it. For comparison, an outline marks where start would be in a left-to-right stage.',
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
    recipe:
      's.draw reveals the path along its own length with a pen at the tip, and describe is what a screen reader says in place of the motion. Two dots on the left of the result mark where the path will start and end.',
    caption:
      's.draw moved a pen along the line as it appeared, and the line stays when the pen lifts. Its description, ‘A rising line’, gives the same fact to a reader who never sees the motion.',
  },
};

/** What an author choosing Rayner wants to do, as the question each case answers. */
const QUESTIONS: Record<Feature, string> = {
  steps: 'How do I give an idea its own link and picture?',
  settings: 'How do I let a reader switch between prepared cases?',
  diagram: 'How do I trace a path through a flowchart?',
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
/** What the reader predicts on each recipe, about what these lines leave; the result step answers it. */
const PREDICT: Record<Feature, string> = {
  steps: 'Predict: what address would a link to this step end with?',
  settings: 'Predict: which case is this page showing, and how many did the build make?',
  diagram: 'Predict: once the walk ends, what stays on the flowchart?',
  code: 'Predict: once the focus ends, is any line still marked?',
  'code-diff': 'Predict: after the morph, which line carries the added mark?',
  animation: 'Predict: opened from a link, do these lines leave the circle, the square or both?',
  matching: 'Predict: from cache miss to cache hit, which letters move rather than fade?',
  restore: 'Predict: opened from a link, would these lines show that the circle ever moved?',
  emphasis: 'Predict: when Circumscribe ends, is anything still drawn round 42?',
  camera: 'Predict: after the focus, has the circle moved, or has the view?',
  chart: 'Predict: which values does the line pass through?',
  state: 'Predict: after the sync, what number does the label show, and where does it come from?',
  annotations: 'Predict: what does the pin say, and where does it point?',
  direction: 'Predict: in a right-to-left stage, where does a card placed at start go?',
  drawing: 'Predict: opened from a link, what is left of the pen’s motion?',
};

/** The script's one-sentence answer, the line of every case's result step. */
const ANSWER =
  'From a link, a reader sees only the picture a step leaves at rest, so it must show what changed';

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
          'Your step removes a warning with FadeOut, then holds for its caption. What does a reader who opens that step from a link see of the warning, and what could the step leave instead?',
        answer:
          'Nothing: the link shows the picture after the fade, so the warning is simply absent. Leave a sign of what happened, such as a dimmed or struck-through copy where the warning was, or a label saying it was removed.',
      },
      {
        question:
          'This page has one setting with fifteen options. Add a second setting, a light or a dark theme. How many cases does the build make, and which of them can a reader open?',
        answer:
          'Thirty: every feature meets every theme, and the build makes each combination before anyone reads the page. A reader can open any of the thirty and nothing else.',
      },
      {
        question:
          'In the state case, a later step sets this.state.count = 5 but never plays label.sync(). What does the trace record, and what does the label show?',
        answer:
          'The trace records count 5, but the label still shows 1: a view builds its picture from the state only when its sync is played, so the two disagree until a sync.',
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
      caption: example.recipe,
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
    await this.step('result', { title: example.result, line: `${ANSWER}.`, caption: example.caption });
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
        new Text('its link ends ?step=hello', { fontSize: 0.34, font: 'mono', color: soft }).moveTo([ax, ay - 1.1]),
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
      const match = new TransformMatchingText(before, after);
      await this.play(match);
      s.keep(after);
      // Which letters the animation paired (moved) and which it faded, read from its own pairs.
      const cluster = (m: Mobject) => (m as { cluster?: number }).cluster!;
      const letters = (t: string, at: number[]) => at.sort((a, b) => a - b).map((i) => t[i]).join(' ');
      const moved = letters('cache hit', match.pairs.map(([, to]) => cluster(to)));
      const fadedIn = letters('cache hit', match.added.map(cluster));
      const fadedOut = letters('cache miss', match.removed.map(cluster));
      await s.enter(
        new Text(`moved: ${moved}`, { fontSize: 0.32, font: 'mono', color: soft }).moveTo([ax, ay - 1.1]),
        new Text(`faded in: ${fadedIn} · faded out: ${fadedOut}`, { fontSize: 0.32, font: 'mono', color: soft }).moveTo([ax, ay - 1.65]),
        { describe: `Under cache hit: the letters moved, ${moved}; faded in, ${fadedIn}; faded out, ${fadedOut}` },
      );
      this.state.matched = { moved, fadedIn, fadedOut };
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
      s.keep(circle.outline, { describe: 'After: the result 42 remains in a box' });
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
