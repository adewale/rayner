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
export const RECIPES: Record<Feature, { title: string; result: string; code: string[]; recipe: string; caption: string; point: string }> = {
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
    recipe: "this.step opens a step with a name, a title and a caption. Whatever the lines after it enter becomes that step’s resting picture, and the step’s name becomes part of its address.",
    caption: "A link ending ?step=hello opens the finished greeting without playing its entry, so this resting picture and its caption carry everything a direct visitor gets. The empty frame on the left is a separate drawing of the step before entry, not something these lines draw.",
    point: 'This picture and its caption are all a reader gets from a link ending ?step=hello.',
  },
  settings: {
    title: 'Declare a setting; each option becomes a scenario',
    result: 'The default scenario, then the scenario you chose',
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
    recipe: "static settings declares an option list, the build makes one scenario for every option, and settingsOf(this) tells construct which scenario it is building. The two options shown are excerpts from this page’s own feature picker.",
    caption: "The left card names the default scenario and the right card this one, with the number of scenarios the build made: one per option in the feature picker. Choosing a feature switches between those prepared scenarios; it does not run the scene on new input.",
    point: 'The default scenario is Animations; this page is the Settings scenario.',
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
    recipe: "s.show draws a diagram from geometry captured at build time. d.walk sends a token along an edge that exists in the diagram, here Start → Finish; trail: true is the walk option this scenario is about.",
    caption: "The trail stays on Start → Finish after the token has gone, so the route can be inspected at rest, and it follows the captured edge rather than a shortcut. The unmarked copy on the left is a separate drawing of the flowchart before the walk.",
    point: 'The trail stays on Start → Finish after the walk ends.',
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
    recipe: "s.code draws the lines as a code panel. block.focus(1, {as: 'update'}) points at the line with index 1, the second, and says why.",
    caption: "The update bar stays on count += 1 after the focus finishes, which ties the caption to the line it explains. The plain copy on the left is a separate drawing of the panel before the focus.",
    point: 'The update bar stays on count += 1 after the motion stops.',
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
    recipe: "block.morph turns the panel into a new list of lines and keeps the lines both versions share in place; markAdded: true marks what the edit introduced.",
    caption: "let count = 0 stays where it was, and count += 2 replaces the old increment and carries the mark. The mark labels the current line; it is not a history of earlier edits. The panel on the left is a separate drawing of the version before the morph.",
    point: 'Only count += 2 carries the added mark; let count = 0 kept its place.',
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
    recipe: "Transform reshapes the object already on stage, point by point, until it matches the target.",
    caption: "Only the square comes from the recipe: Transform turned the circle into it. The circle on the left is a separate drawing of the starting shape, so a direct visitor can inspect the change without seeing it play.",
    point: 'From a link, these lines leave a square; the circle is a separate drawing.',
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
    recipe: "TransformMatchingText pairs equal characters between the two texts, moves each pair and fades the characters left over. s.keep tells the stage that the new text stays.",
    caption: "The lists under the result record the pairs the animation used. Matching follows characters, not words, so a letter can move into a different word. The smaller cache miss on the left is a separate drawing of the text before the change.",
    point: 'The shared letters slid into place, and the others faded.',
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
    recipe: "saveState() records the circle’s points and style. Restore animates the circle back to that record from wherever the lines in between moved it.",
    caption: "Restore brought the circle back to the place saveState() recorded, so the circle alone gives no sign that it moved. The dashed outline, which this page draws separately, marks where it went before Restore.",
    point: 'Without the dashed outline, the resting picture would hide the circle’s trip.',
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
    recipe: "Circumscribe animates an outline round its target; keep: true is the option this scenario is about, and s.keep gives the outline a description for readers who cannot see it.",
    caption: "Circumscribe normally removes its outline when the animation ends. keep: true leaves the box round 42, and the description says what it marks. The plain 42 on the left is a separate drawing.",
    point: 'The box round 42 is still drawn once the motion ends.',
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
    recipe: "s.focus frames a subject for the reader, with a margin round it; s.focus('all') returns to the whole stage.",
    caption: "The ruler, which this page draws across the whole stage, now shows only its middle, while the circle is still at (0, 0): the view moved, not the circle. A before panel would sit inside the same closer view, so the ruler is the reference instead.",
    point: 'The view moved in; the circle kept its coordinates.',
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
    recipe: "Axes maps data coordinates to stage positions, and lineGraph joins the points you give it through that mapping.",
    caption: "The axes placed each point, so the line can be checked against the numbers without guessing where an author drew it by hand. The card on the left is a separate drawing of the same values.",
    point: 'The line passes through 0, 2 and 1, each placed by the axes.',
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
    recipe: "this.state holds values the model decides. view builds a label from that state, and label.sync() rebuilds the label after the state changes.",
    caption: "Setting count alone changes nothing on screen; sync rebuilt the label from count, so the label and the recorded state both read 1. The 0 on the left is a separate drawing of the view before the change.",
    point: 'Label and trace both read 1, because the view rebuilt the label from state.',
  },
  annotations: {
    title: 'Put an explanation beside its subject',
    result: 'A bare circle, then its centre pinned',
    code: [
      'await s.enter(new Circle({radius: 0.8}),',
      "  {describe: 'Circle'});",
      "await s.pin([0, 0], {label: 'centre'});",
    ],
    recipe: "s.pin puts a label at a point in the picture and draws a leader to it.",
    caption: "The leader ties the word centre to the circle’s centre, so the label names a place without another animation. The bare circle on the left is a separate drawing.",
    point: 'The word centre sits at the end of a leader to the circle’s centre.',
  },
  direction: {
    title: 'Place a card at the logical start',
    result: 'Start, in a left-to-right stage and in this right-to-left one',
    code: [
      "const s = stage(this, {direction: 'rtl'});",
      "await s.card([['Count', 3]],",
      "  {at: 'start', direction: 'ltr'});",
    ],
    recipe: "direction: 'rtl' lays the stage’s logical regions out right to left. The card’s own direction: 'ltr' sets the order of the text inside it.",
    caption: "The card sits on the right, the start of a right-to-left stage, yet still reads Count, 3: placement and the order inside the card are separate choices. The outline on the left marks where start would be in a left-to-right stage.",
    point: 'Start is on the right in this stage, yet the card still reads Count, 3.',
  },
  drawing: {
    title: 'Draw a native path with a tool',
    result: 'Two end points, then the line the pen drew between them',
    code: [
      'const path = new Line([-4,-1],[4,1]);',
      "await s.sketch(path, {tool: 'pen',",
      "  describe: 'A rising line'});",
    ],
    recipe: "s.draw reveals a path along its length with a tool riding its tip, and describe says what the finished stroke shows.",
    caption: "The pen disappears when drawing ends, and the rising line remains; its description carries the same fact to readers who do not see the motion. The two dots on the left are a separate drawing of the path’s ends.",
    point: 'Of the pen’s motion, only the finished line is left at rest.',
  },
};

/** What an author choosing Rayner wants to do, as the question each scenario answers. */
const QUESTIONS: Record<Feature, string> = {
  steps: 'How do I give an idea its own link and picture?',
  settings: 'How do I let a reader switch between prepared scenarios?',
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
  settings: 'Predict: which scenario is this page showing, and how many did the build make?',
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

/** The script's one-sentence answer, which opens every scenario's recipe caption. */
const ANSWER =
  'Each feature takes a few lines of the scene, and the picture they leave at rest is what a reader who opens the step from a link sees';

// The result step's two panels: what the reader would have seen before the feature ran, and after.
const BEFORE: [number, number, number, number] = [-7.4, -3.5, -2.5, 2.1],
  AFTER: [number, number, number, number] = [-1.3, -3.5, 7.4, 2.1];
const centre = (b: readonly number[]): [number, number] => [(b[0]! + b[2]!) / 2, (b[1]! + b[3]!) / 2];

export default class FeatureTour extends Scene {
  static meta = {
    id: 'feature-tour',
    title: 'How do I write that in Rayner?',
    scenarioNavigation: 'first' as const,
    sources: [
      'https://github.com/adewale/rayner/blob/main/scenes/explainers/feature-tour/scene.ts',
      'https://github.com/adewale/rayner/blob/main/docs/REFERENCE.md',
      'https://github.com/adewale/rayner/tree/main/scenes/explainers/latest-search',
      'https://github.com/adewale/rayner/tree/main/scenes/explainers/mr-cache',
      'https://github.com/adewale/rayner/tree/main/scenes/explainers/layout-direction',
    ],
    // The script's answer and check questions (script.md); every scenario's recipe step states the answer.
    answer: ANSWER,
    // Scope sentences: the build rule and the drawing tool rule have tests; the result picture is the evidence for the rest.
    claims: [
      {
        says: 'the build makes one scenario for every option',
        test: 'test/explain-gates.test.ts: the build makes every combination of options a scenario, rayner check tests each, and a reader can open no other',
      },
      { says: 'Only count += 2 carries the added mark', shown: true as const },
      { says: 'Only the square comes from the recipe', shown: true as const },
      { says: 'now shows only its middle', shown: true as const },
      {
        says: 'Of the pen’s motion, only the finished line is left at rest',
        test: 'test/explain-stage-tools.test.ts: draw: the tool rides the tip without jumps, leaves no trace',
      },
    ],
    checks: [
      {
        question:
          'Run the code-edits recipe twice in one step: count += 1 becomes count += 2, then count += 3, each morph with markAdded. What does a reader who opens that step from a link see, and is there any sign of count += 2?',
        answer:
          'Two lines, let count = 0 and count += 3, with count += 3 marked as added. The second morph fades count += 2 out along with its mark, so nothing in the resting picture shows that it existed; to keep it, draw the earlier panel beside the result, as the before panels on this page do.',
      },
      {
        question:
          'In the camera scenario, the author also enters a second circle at (5, 0) before calling s.focus(subject). Is it in the result picture, and where is it?',
        answer:
          'It is out of the picture. The closer view frames 6 of the stage’s 16 units around the first circle, roughly x = −3 to 3, so a circle at x = 5 falls outside it. It is still at (5, 0), because s.focus moves only the camera, and s.focus(‘all’) would bring it back into view.',
      },
      {
        question:
          'An author wants the chart scenario to plot numbers that each reader types into a box. Can a Rayner page do that, and what can the author offer instead?',
        answer:
          'No. A reader can only choose among the options a setting declares, and the build makes one scenario per option before anyone reads the page. The author can declare a setting whose options are a few prepared data sets, so each one is a scenario the build makes and the author can read.',
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
      caption: `${ANSWER}. ${example.recipe}`,
    });
    await s.code(example.code, { at: 'full', fontSize: 0.6 });
    this.state.feature = feature;
    this.shown.phase = 'recipe';

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
    // Each result names its own before and after; the camera scenario has no before panel.
    await this.step('result', { title: example.result, line: example.point, caption: example.caption });
    this.shown.phase = 'result';
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
      await panels([], `the default scenario, feature = ${options.default}`);
      await s.card([['Default scenario', options.default]], { at: BEFORE, fontSize: 0.45 });
      await s.card([['This scenario', feature], ['Scenarios built', String(options.options.length)]], { at: AFTER, fontSize: 0.55 });
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
      await s.sketch(path, { tool: 'pen', describe: 'After: a rising line, drawn' });
    }
  }
}
