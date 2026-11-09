import { Scene, Text, Circle, Line, Dot, Rectangle, Arrow, Group, Axes, Transform, Restore, TransformFromCopy, MoveAlongPath, ArcBetweenPoints, TransformMatchingText, Circumscribe, Brace, NumberLine, DecimalNumber, MathTex, TransformMatching, matchByKey, Code, TransformDiff, diffLines, parseUnifiedDiff, smooth, rushInto, rushFrom, thereAndBack } from '../../../src/index.ts';
import { seenFrom, between, latLon, circleOn, project } from '../../../explain/geo.ts';
import { Square, Underline, Write } from './shorthands.ts';
import type { Mobject, Vec } from '../../../src/index.ts';
import { stage, settingsOf, palette, answerOf, view, having } from '../../../explain/index.ts';
import type { ExplainerMeta } from '../../../explain/index.ts';
import { bars, tile, keyed, code } from '../../../explain/drawing.ts';

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
  | 'drawing'
  | 'brace'
  | 'underline'
  | 'number-line'
  | 'decimal'
  | 'math'
  | 'arc'
  | 'write'
  | 'copy'
  | 'keys'
  | 'diff'
  | 'rates'
  | 'bars'
  | 'palette'
  | 'globe';

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
      'this.shown.walked = [];',
      'const v = s.diagramView(d, (st, sh) =>',
      '  ({marks: d.trail(sh.walked)}));',
      "await d.walk([['A', 'B']]);",
      "this.shown.walked = [['A', 'B']];",
      "await this.play(v.sync());",
    ],
    recipe: "s.show draws a diagram from geometry captured at build time. d.walk sends a token along an edge that exists in the diagram, here Start → Finish; the walked edge is then recorded in this.shown, and the diagram’s view draws it as a trail.",
    caption: "The trail stays on Start → Finish after the token has gone, so the route can be inspected at rest, and it follows the captured edge rather than a shortcut. The unmarked copy on the left is a separate drawing of the flowchart before the walk.",
    point: 'The trail stays on Start → Finish after the walk ends.',
  },
  code: {
    title: 'Show the author’s code, then light a line',
    result: 'Two plain lines, then the second marked as the update',
    code: [
      'this.shown.lit = null;',
      'const block = view(this, (st, sh) => code(s,',
      "  ['let count = 0;', 'count += 1;'],",
      "  {at: 'main', lit: sh.lit, key: 'block'}),",
      "  {place: false});",
      'await s.enter(block);',
      "this.shown.lit = {lines: 1, as: 'update'};",
      "await this.play(block.sync());",
    ],
    recipe: "A view draws the lines as a code panel, its lit line from this.shown, which says how the scene is shown. Lighting line 1 and syncing points at the line with index 1, the second, and as: 'update' says why.",
    caption: "The update bar stays on count += 1 after the sync finishes, which ties the caption to the line it explains. The plain copy on the left is a separate drawing of the panel before the bar arrived.",
    point: 'The update bar stays on count += 1 after the motion stops.',
  },
  'code-diff': {
    title: 'Morph edited code by its surviving lines',
    result: 'count += 1 edited to count += 2, the new line marked',
    code: [
      'const block = view(this, (st) =>',
      '  code(s, st.lines, {at: AFTER,',
      "   added: st.added, key: 'block'}),",
      '  {place: false});',
      'await s.enter(block);',
      "this.state.lines = ['let count = 0;', 'count += 2;'];",
      'this.state.added = [1];',
      "await this.play(block.sync());",
    ],
    recipe: "A view draws the lines in this.state as a code panel. Syncing after an edit keeps each line both versions share, paired by its text; added lists the lines the edit introduced, which carry the mark.",
    caption: "let count = 0 stays where it was, and count += 2 replaces the old increment and carries the mark. The mark labels the current line; it is not a history of earlier edits. The panel on the left is a separate drawing of the version before the edit.",
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
      '  {keep: true, color: s.look.emphasis});',
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
      "await this.play(label.sync({match: 'text'}));",
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
    recipe: "s.sketch reveals a path along its length with a tool riding its tip, and describe says what the finished stroke shows.",
    caption: "The pen disappears when drawing ends, and the rising line remains; its description carries the same fact to readers who do not see the motion. The two dots on the left are a separate drawing of the path’s ends.",
    point: 'Of the pen’s motion, only the finished line is left at rest.',
  },
  brace: {
    title: 'Mark a span that counts as one',
    result: 'Four letters, then a brace that counts them',
    code: [
      "const row = new Text('a b c d');",
      'await s.enter(row);',
      'const brace = new Brace(row, [0, -1]);',
      "const count = new Text('4 items');",
      'brace.putAtTip(count);',
      'await s.enter(brace, count);',
    ],
    recipe: 'Brace draws a curly bracket along one side of its target’s box: [0, -1] puts it underneath, its tip pointing down. putAtTip places anything just past the tip.',
    caption: 'The brace is as wide as the row’s box, so it takes the four letters together, and putAtTip set 4 items just past its tip. A brace is built once from the box: if the row moves later, the brace stays where it was. The row on the left is a separate drawing, before the brace.',
    point: 'The brace spans all four letters, and 4 items sits past its tip.',
  },
  underline: {
    title: 'Underline one value in a row',
    result: 'Three values, then the middle one underlined',
    code: [
      "const values = ['12', '42', '7'].map((v, i) =>",
      '  new Text(v).moveTo([i * 1.5, 0]));',
      'await s.enter(...values);',
      'const mark = new Underline(values[1],',
      '  {stroke: s.look.emphasis});',
      "await s.enter(mark, {describe: '42 underlined'});",
    ],
    recipe: 'Underline draws a stroke just under its target’s box, left to right. The other values are not touched.',
    caption: 'The underline is as wide as 42 and sits just under it, so it singles out one value without boxing it or moving its neighbours, and its description says which. The row on the left is a separate drawing, before the mark.',
    point: '42 is underlined, and the row has not moved.',
  },
  'number-line': {
    title: 'Place a value on a scale',
    result: 'The value 7, then 7 placed on a scale from 0 to 10',
    code: [
      'const line = new NumberLine({range: [0, 10, 2],',
      '  length: 8, includeNumbers: true,',
      '  stroke: s.look.soft, labelColor: s.look.ink});',
      'const at = new Dot({color: s.look.emphasis})',
      '  .moveTo(line.n2p(7));',
      "await s.enter(line, at, {describe: '7 on 0 to 10'});",
    ],
    recipe: 'NumberLine draws a scale from its range, with a tick at each step; n2p turns a number into the point where it belongs on the line.',
    caption: 'n2p measured 7 along the line, so the dot sits between the ticks for 6 and 8 with no position typed by hand, and it would stay right if the line moved or scaled. The number on the left is a separate drawing of the value.',
    point: 'The dot sits between the ticks for 6 and 8, where n2p put 7.',
  },
  decimal: {
    title: 'Count a number up to its new value',
    result: '0.0 ms before, 12.5 ms after',
    code: [
      'const ms = new DecimalNumber(0, {decimals: 1,',
      "  suffix: ' ms', fontSize: 1});",
      'await s.enter(ms);',
      'await this.play(new Transform(ms,',
      '  new DecimalNumber(12.5, {decimals: 1,',
      "    suffix: ' ms', fontSize: 1})));",
    ],
    recipe: 'DecimalNumber is a Text that keeps its value. A Transform to another DecimalNumber counts through the values in between, with the decimals and suffix it was given.',
    caption: 'Transform interpolated the value, so a reader watching saw 0.0 ms climb through the values in between to 12.5 ms, and one opening the link sees 12.5 ms alone. The 0.0 ms on the left is a separate drawing of where the count started.',
    point: 'From a link the number reads 12.5 ms; the count happened in between.',
  },
  math: {
    title: 'Set a formula from TeX',
    result: 'The TeX an author writes, then the formula it sets',
    code: [
      'static meta = { /* … */',
      '  lettering: {math: true} };',
      "const f = new MathTex('a^2+b^2=c^2',",
      '  {display: true, fontSize: 0.8});',
      'await s.enter(f, {describe:',
      "  'a squared plus b squared equals c squared'});",
    ],
    recipe: 'lettering: {math: true} asks the build for maths, and MathTex draws TeX as outlines, typeset once when rayner snapshots runs. describe says the formula in words, because outlines have no text to read.',
    caption: 'rayner snapshots typeset a^2+b^2=c^2 once and stored its outlines in scene.lettering.json, so the page draws them and runs no TeX. The description gives the formula in words for readers who cannot see it. The source on the left is a separate drawing, as the author types it.',
    point: 'The page draws stored outlines; the browser typesets nothing.',
  },
  arc: {
    title: 'Send a token along a curved route',
    result: 'A token at the start, then at the end of its curved route',
    code: [
      'const route = new ArcBetweenPoints([-3, 0], [3, 0],',
      '  {angle: Math.PI / 2, stroke: s.look.soft});',
      'const token = new Dot({color: s.look.emphasis})',
      '  .moveTo([-3, 0]);',
      "await s.enter(route, token, {describe: 'A route'});",
      'await this.play(new MoveAlongPath(token, route));',
    ],
    recipe: 'ArcBetweenPoints draws a circular arc from one point to another, bending through angle, here a quarter turn. MoveAlongPath carries the token along that path instead of in a straight line.',
    caption: 'MoveAlongPath followed the arc, so the token travelled the curve rather than the straight line between its ends, and it rests at the far end of the route. The route is still drawn because the recipe entered it; the motion leaves no trail of its own. The left panel is a separate drawing of the token at the start.',
    point: 'The token rests at the route’s far end, and the route stays drawn.',
  },
  write: {
    title: 'Write a word letter by letter',
    result: 'An empty panel, then the written word',
    code: [
      "const word = new Text('Rayner', {fontSize: 1.2});",
      'await this.play(new Write(word));',
      's.keep(word);',
    ],
    recipe: 'Write draws each letter’s outline and then fills it, each letter starting before the one before it finishes. s.keep puts the word in the stage’s description.',
    caption: 'Write changes how the letters arrive, not where they end: at rest the word is the same Rayner a fade would leave, and a link to this step shows no sign of the writing. When the order of writing is the lesson, draw that order, as this tour draws its before panels.',
    point: 'At rest, a written word looks like any other word.',
  },
  copy: {
    title: 'Make a new shape from a copy, keeping the original',
    result: 'One square, then the square and the circle made from its copy',
    code: [
      'const source = new Square({side: 1.4});',
      'const result = new Circle({radius: 0.8})',
      '  .moveTo([3, 0]);',
      "await s.enter(source, {describe: 'A square'});",
      'await this.play(new TransformFromCopy(source, result));',
      "s.keep(result, {describe: 'A circle'});",
    ],
    recipe: 'TransformFromCopy morphs a copy of the source into the result, so the source stays where it is and the scene keeps the result.',
    caption: 'Transform would have turned the square itself into the circle; TransformFromCopy morphed a copy, so the square stays and the circle sits beside it. The left panel is a separate drawing of the square alone.',
    point: 'Both shapes remain: the square, and the circle its copy became.',
  },
  keys: {
    title: 'Reorder items so each travels to its new place',
    result: 'A B C, then C A B with each tile moved whole',
    code: [
      'const row = (ids: string[]) => new Group(...ids.map(',
      '  (id, i) => tile(s, id, {at: [i * 1.6, 0],',
      '    width: 1.2, height: 1.2, key: `tile:${id}`})));',
      "const before = row(['A', 'B', 'C']);",
      'await s.enter(before);',
      "const after = row(['C', 'A', 'B']);",
      'await this.play(new TransformMatching(before,',
      '  after, {key: matchByKey()}));',
      's.keep(after);',
    ],
    recipe: 'Each tile carries a key. TransformMatching with matchByKey pairs tiles by key, not by position, so tile C travels from last to first.',
    caption: 'Pairing by key moved C from the end to the front and A and B one place on. Transform pairs by position, and would have morphed the first tile’s A into C where it stood. The row on the left is a separate drawing of the order before the move.',
    point: 'Each tile travelled to its new place; none changed its letter.',
  },
  diff: {
    title: 'Animate a patch you already have',
    result: 'n += 1, then n += 2 as the patch says',
    code: [
      "const before = new Code(['let n = 0;', 'n += 1;']);",
      "const after = new Code(['let n = 0;', 'n += 2;']);",
      'await s.enter(before);',
      'const hunks = parseUnifiedDiff(',
      "  '@@ -1,2 +1,2 @@\\n let n = 0;\\n-n += 1;\\n+n += 2;');",
      'await this.play(new TransformDiff(before, after, {hunks}));',
      's.keep(after);',
    ],
    recipe: 'parseUnifiedDiff reads a patch, as Git prints one, into hunks. TransformDiff takes its pairing from those hunks, so the motion can show only the change the patch contains.',
    caption: 'The hunk keeps let n = 0 as context, so that line travelled whole, and pairs the removed n += 1 with the added n += 2, which kept n += and swapped the number. Under the result, diffLines, which diffs the two versions itself, finds the same removed and added line; the patch also carries let n = 0 as context. The code on the left is a separate drawing of the version before.',
    point: 'let n = 0 kept its place, and the line the hunk changes was rewritten.',
  },
  rates: {
    title: 'Choose how a move speeds up and slows down',
    result: 'Four rate functions, each move marked at each tenth of its run',
    code: [
      'const rates = {smooth, rushInto,',
      '  rushFrom, thereAndBack};',
      'for (const [name, rateFunc] of Object.entries(rates))',
      '  await this.play(dots[name].animate.shift([5, 0]),',
      '    {rateFunc});',
    ],
    recipe: 'rateFunc maps the time a play has run to how far along its move is: smooth eases in and out, rushInto starts slow and arrives at full speed, rushFrom leaves at full speed and eases out, and thereAndBack goes out and comes back.',
    caption: 'Each tick marks where a dot was after another tenth of its run, read from the same rate function, so wide gaps mean speed: rushInto’s ticks spread out as it arrives, rushFrom’s as it leaves, smooth’s in the middle, and thereAndBack’s dot is back where it started. The bare tracks on the left are a separate drawing, before any move.',
    point: 'Wide gaps are fast: rushInto at its end, rushFrom at its start.',
  },
  bars: {
    title: 'Compare two values on one scale',
    result: 'Two counts, then the same counts as bars on one scale',
    code: [
      'const rows = [',
      "  {label: 'LRU', value: 3, display: '3 hits'},",
      "  {label: 'MRU', value: 1, display: '1 hit'}];",
      "await s.enter(bars(s, rows, 4, {key: 'hits'}));",
    ],
    recipe: 'bars, from the drawing kit, draws each row on one scale with aligned starts, here a maximum of 4, so the lengths compare directly.',
    caption: 'Both bars start at one edge and share the scale of 4, so 1 hit draws a third as long as 3 hits and the comparison needs no reading of numbers. Each label and value is keyed, so a later picture can morph the same rows. The card on the left is a separate drawing of the same counts.',
    point: 'MRU’s bar is a third as long as LRU’s, both measured from one start.',
  },
  palette: {
    title: 'Colour a stage that has no diagram',
    result: 'This tour’s usual colours, then the same stage in nord',
    code: [
      'const s = stage(this,',
      "  {palette: palette('nord')});",
      "await s.card([['Paper', s.look.paper],",
      "  ['Ink', s.look.ink],",
      "  ['Emphasis', s.look.emphasis]]);",
    ],
    recipe: 'palette(\'nord\') gives the stage a named palette of paper, ink and accent. The stage’s helpers colour from its look, and s.look hands the same colours to what you draw.',
    caption: 'One option recoloured the paper, the heading and the card, and the card lists the colours s.look gave it, so a drawing coloured from s.look follows a change of palette and keeps its contrast. The panel on the left is a separate drawing in github-dark, this tour’s usual palette.',
    point: 'Paper, heading and card all took nord’s colours from one option.',
  },
  globe: {
    title: 'Turn a globe to face another place',
    result: 'The globe from the Atlantic, then turned to face London',
    code: [
      "const a = {kind: 'orthographic', yaw: -60, pitch: 0},",
      '  b = {...a, yaw: 0, pitch: 45};',
      'const draw = (t: number) =>',
      '  seenFrom(model, between(a, b, t), {scale: 1.6});',
      'const globe = view(this, (st) => draw(st.turn));',
      "await s.enter(globe, {describe: 'A globe'});",
      'await this.play(globe.tween((t) => ({turn: t})));',
    ],
    recipe: 'seenFrom draws a 3D model through a viewpoint as flat, keyed pieces, and between interpolates two viewpoints. A view\'s tween redraws the globe from one number on each frame, so the turn passes through the viewpoints in between.',
    caption: 'The tween drew the globe from between(a, b, t) on each frame, so parts turning away went behind the globe instead of sliding across its face, and from a link the reader sees the end of the turn: London near the middle. The globe on the left is a separate drawing from the first viewpoint.',
    point: 'London now faces the reader, turned by one number from 0 to 1.',
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
  brace: 'How do I show that several things count as one span?',
  underline: 'How do I single out one value in a row?',
  'number-line': 'How do I place a value on a scale?',
  decimal: 'How do I count a number up to a new value?',
  math: 'How do I set a formula?',
  arc: 'How do I send something along a curved route?',
  write: 'How do I write a word in, letter by letter?',
  copy: 'How do I make a new shape from one and keep the original?',
  keys: 'How do I reorder items so each one travels to its new place?',
  diff: 'How do I animate a patch I already have?',
  rates: 'How do I choose how a move speeds up and slows down?',
  bars: 'How do I compare values on one scale?',
  palette: 'How do I colour a scene that has no diagram?',
  globe: 'How do I turn a globe to face another place?',
};
/** What the reader predicts on each recipe, about what these lines leave; the result step answers it. */
const PREDICT: Record<Feature, string> = {
  steps: 'Predict: what address would a link to this step end with?',
  settings: 'Predict: which scenario is this page showing, and how many did the build make?',
  diagram: 'Predict: once the walk ends, what stays on the flowchart?',
  code: 'Predict: once the bar stops moving, is any line still marked?',
  'code-diff': 'Predict: after the edit, which line carries the added mark?',
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
  brace: 'Predict: which way does the brace’s tip point, and what sits past it?',
  underline: 'Predict: what does the underline span, and do the other values move?',
  'number-line': 'Predict: 7 has no tick of its own, so where does the dot go?',
  decimal: 'Predict: between 0 and 12.5, does the number fade across or count through the values in between?',
  math: 'Predict: does the page typeset the formula when it loads, or carry it ready-made?',
  arc: 'Predict: once the move ends, where is the token, and is the route still drawn?',
  write: 'Predict: opened from a link, does a written word look any different from one that faded in?',
  copy: 'Predict: once the copy has morphed, how many shapes are left?',
  keys: 'Predict: when A B C becomes C A B, does each tile slide, or does each letter change in place?',
  diff: 'Predict: which line does the patch let travel whole, and which does it rewrite?',
  rates: 'Predict: which dot arrives at full speed, and which comes back to where it started?',
  bars: 'Predict: how long is MRU’s bar beside LRU’s?',
  palette: 'Predict: which colours change with the palette: the card, the heading, or both?',
  globe: 'Predict: once the turn ends, where is London on the globe?',
};


// The result step's two panels: what the reader would have seen before the feature ran, and after.
const BEFORE: [number, number, number, number] = [-7.4, -3.5, -2.5, 2.1],
  AFTER: [number, number, number, number] = [-1.3, -3.5, 7.4, 2.1];
const centre = (b: readonly number[]): [number, number] => [(b[0]! + b[2]!) / 2, (b[1]! + b[3]!) / 2];

/** The feature shown, and what its scenario records. */
type TourState = {
  feature?: Feature;
  lines?: string[];
  added?: number[];
  matched?: { moved: string; fadedIn: string; fadedOut: string };
  camera?: { before: number; after: number };
  count?: number;
  placed?: { value: number; x: number };
  order?: string[];
  ops?: { patch: string; diffLines: string };
  rates?: string[];
  turn?: number;
  london?: number[];
};
/** Whether the recipe or its result is on show, the diagram's walked edges and the code's focused line. */
type TourShown = { chapter?: 'recipe' | 'result'; walked?: [string, string][]; lit?: { lines: number; as: string } | null };

export default class FeatureTour extends Scene<TourState, TourShown> {
  static meta = {
    // The maths scenario's formula, typeset once by rayner snapshots into scene.lettering.json.
    lettering: { math: true },
    scenarioNavigation: 'first' as const,
    sources: [
      'https://github.com/adewale/rayner/blob/main/scenes/explainers/feature-tour/scene.ts',
      'https://github.com/adewale/rayner/blob/main/docs/REFERENCE.md',
      'https://github.com/adewale/rayner/tree/main/scenes/explainers/latest-search',
      'https://github.com/adewale/rayner/tree/main/scenes/explainers/mr-cache',
      'https://github.com/adewale/rayner/tree/main/scenes/explainers/layout-direction',
    ],
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
        says: 'so the motion can show only the change the patch contains',
        test: 'test/diff.test.ts: TransformDiff: given hunks are the truth',
      },
      {
        says: 'Of the pen’s motion, only the finished line is left at rest',
        test: 'test/explain-stage-tools.test.ts: draw: the tool rides the tip without jumps, leaves no trace',
      },
    ],
  } satisfies ExplainerMeta;
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
        { value: 'diff', label: 'Patches' },
        { value: 'animation', label: 'Animations' },
        { value: 'matching', label: 'Matching text' },
        { value: 'keys', label: 'Matching by key' },
        { value: 'copy', label: 'Copies' },
        { value: 'restore', label: 'Restore' },
        { value: 'write', label: 'Writing text' },
        { value: 'arc', label: 'Curved paths' },
        { value: 'rates', label: 'Rate functions' },
        { value: 'emphasis', label: 'Emphasis' },
        { value: 'underline', label: 'Underlines' },
        { value: 'brace', label: 'Braces' },
        { value: 'camera', label: 'Camera' },
        { value: 'chart', label: 'Charts' },
        { value: 'number-line', label: 'Number lines' },
        { value: 'bars', label: 'Bar charts' },
        { value: 'decimal', label: 'Counting numbers' },
        { value: 'state', label: 'State and views' },
        { value: 'annotations', label: 'Annotations' },
        { value: 'direction', label: 'RTL layout' },
        { value: 'palette', label: 'Palettes' },
        { value: 'math', label: 'Maths' },
        { value: 'drawing', label: 'Drawing tools' },
        { value: 'globe', label: 'Globes' },
      ],
    },
  ];

  override async construct() {
    const answer = answerOf(this);
    const feature = settingsOf(this).feature as Feature;
    const example = RECIPES[feature];
    const s = stage(this, {
      // The palette scenario's recipe gives the stage nord's colours; every other scenario is github-dark.
      ...(feature === 'palette' ? { palette: palette('nord') } : { style: 'github-dark' }),
      headingSize: 0.6,
      numbered: false,
      ...(feature === 'direction' ? { direction: 'rtl' as const } : {}),
    });
    const ink = s.look.ink,
      accent = s.look.emphasis,
      soft = s.look.soft;

    // 1. The author's question, and the few lines that answer it.
    await this.step('recipe', {
      title: QUESTIONS[feature],
      line: PREDICT[feature],
      caption: `${answer}. ${example.recipe}`,
    });
    await s.code(example.code, { at: 'full', size: 0.6, fitHeight: true });
    this.state.feature = feature;
    this.shown.chapter = 'recipe';

    // 2. The result, at rest: before on the left, after on the right. The before panels, the camera
    // ruler and Restore's dashed outline are this scene's own artwork, not what the recipe lines draw;
    // keep them visibly separate so readers do not credit the before-and-after to the feature itself.
    // The camera changes the whole view, so it gets a ruler rather than a before panel.
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
    this.shown.chapter = 'result';
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
      await s.card([['Default scenario', options.default]], { at: BEFORE, size: 0.45 });
      await s.card([['This scenario', feature], ['Scenarios built', String(options.options.length)]], { at: AFTER, size: 0.55 });
    } else if (feature === 'diagram') {
      // One live diagram; the before panel is a picture of it, its keys prefixed so each key names one part.
      const d = await s.show({ source: 'graph LR\nA[Start] --> B[Finish]' }, { box: AFTER });
      const before = d.picture({}, { prefix: 'before:' });
      const [x0, y0, x1, y1] = before.box()!;
      const k = Math.min((BEFORE[2] - BEFORE[0]) / (x1 - x0), (BEFORE[3] - BEFORE[1]) / (y1 - y0), 1);
      const [cx, cy] = [(x0 + x1) / 2, (y0 + y1) / 2];
      before.scale(k).moveTo([bx, by]);
      // The copy keeps the diagram's clip and line widths; carry both with it.
      const to = (x: number, y: number) => [bx + (x - cx) * k, by + (y - cy) * k] as const;
      for (const m of before.family()) {
        if (typeof m.style.strokeWidth === 'number') m.style.strokeWidth *= k;
        if (m.clipBox) {
          const [l, b] = to(m.clipBox[0], m.clipBox[1]), [r, t] = to(m.clipBox[2], m.clipBox[3]);
          m.clipBox = [l, b, r, t];
        }
      }
      await panels([before], 'the captured flowchart, no path marked');
      // The walked edge is how the diagram is shown (this.shown); its view draws it as a trail.
      this.shown.walked = [];
      const v = s.diagramView(d, (_st, sh) => ({ marks: d.trail(having(sh, 'walked').walked) }));
      await d.walk([['A', 'B']]);
      this.shown.walked = [['A', 'B']];
      await this.play(v.sync());
    } else if (feature === 'code') {
      await panels([], 'the two lines, nothing marked');
      await s.code(['let count = 0;', 'count += 1;'], { at: BEFORE, size: 0.36 });
      // The lit line is how the panel is shown (this.shown); the panel is a view of it.
      this.shown.lit = null;
      const block = view(
        this,
        (_st, sh) => code(s, ['let count = 0;', 'count += 1;'], { at: AFTER, size: 0.45, lit: sh.lit ?? null, key: 'block' }),
        { place: false },
      );
      await s.enter(block, { runTime: 0.4 });
      this.shown.lit = { lines: 1, as: 'update' };
      await this.play(block.sync());
    } else if (feature === 'code-diff') {
      await panels([], 'count += 1');
      await s.code(['let count = 0;', 'count += 1;'], { at: BEFORE, size: 0.36 });
      // The code is the model here (this.state); the panel is a view of it, and marks what the edit added.
      this.state.lines = ['let count = 0;', 'count += 1;'];
      this.state.added = [];
      const block = view(
        this,
        (state) => {
          const st = having(state, 'lines', 'added');
          return code(s, st.lines, { at: AFTER, size: 0.5, added: st.added, key: 'block' });
        },
        { place: false },
      );
      await s.enter(block, { runTime: 0.4 });
      this.state.lines = ['let count = 0;', 'count += 2;'];
      this.state.added = [1];
      await this.play(block.sync());
    } else if (feature === 'animation') {
      await panels(
        [new Circle({ radius: 0.8, stroke: accent, strokeWidth: 0.06 }).moveTo([bx, by])],
        'a circle',
      );
      const shape = new Circle({ radius: 0.8, stroke: accent, strokeWidth: 0.06 }).moveTo([ax, ay]);
      shape.key = 'animation:shape';
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
      circle.key = 'restore:circle';
      away.key = 'restore:away';
      await s.enter(circle, { describe: 'After: the circle is back at its saved place; a dashed outline marks where it moved to' });
      circle.saveState();
      await this.play(circle.animate.shift([2, 0]));
      await s.enter(away, new Text('dashed: moved here, then restored', { fontSize: 0.3, color: soft }).moveTo([ax + 1, ay - 1.2]), {
        describe: 'A dashed outline where the circle moved to before Restore',
      });
      await this.play(new Restore(circle));
    } else if (feature === 'emphasis') {
      await panels([new Text('42', { fontSize: 0.8, color: ink }).moveTo([bx, by])], 'the result 42, unmarked');
      const target = new Text('42', { fontSize: 1.2, color: ink }).moveTo([ax, ay]);
      await s.enter(target);
      const circle = new Circumscribe(target, { keep: true, color: accent });
      circle.outline.key = 'emphasis:box';
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
      subject.key = 'camera:circle';
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
        { at: BEFORE, size: 0.45 },
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
      line.key = 'chart:line';
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
        (state) => new Text(String(state.count), { fontSize: 1.3, color: ink }).moveTo([ax, ay]),
        { place: false },
      );
      await s.enter(label, { describe: () => `Recorded count: ${String(this.state.count)}` });
      this.state.count = 1;
      await this.play(label.sync({ match: 'text' }));
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
      await s.card([['Count', 3]], { at: 'start', direction: 'ltr', width: 6.8, size: 0.65 });
      await s.enter(new Text('After: start in this right-to-left stage', { fontSize: 0.34, color: soft }).moveTo([4, -2.8]));
    } else if (feature === 'drawing') {
      await panels(
        [
          new Dot({ radius: 0.08, color: accent }).moveTo([bx - 1.8, by - 0.45]),
          new Dot({ radius: 0.08, color: accent }).moveTo([bx + 1.8, by + 0.45]),
          new Text('the path’s two ends', { fontSize: 0.3, color: soft }).moveTo([bx, by - 1.1]),
        ],
        'the path’s two ends, nothing drawn',
      );
      const path = new Line([ax - 3.6, ay - 0.9], [ax + 3.6, ay + 0.9], { stroke: accent, strokeWidth: 0.08 });
      path.key = 'drawing:path';
      await s.sketch(path, { tool: 'pen', describe: 'After: a rising line, drawn' });
    } else if (feature === 'brace') {
      await panels([new Text('a b c d', { fontSize: 0.6, color: ink }).moveTo([bx, by])], 'the letters a b c d');
      const row = new Text('a b c d', { fontSize: 0.9, color: ink }).moveTo([ax, ay + 0.6]);
      await s.enter(row);
      const brace = new Brace(row, [0, -1], { stroke: accent, strokeWidth: 0.04 });
      brace.key = 'brace:brace';
      const count = new Text('4 items', { fontSize: 0.5, color: ink });
      brace.putAtTip(count);
      await s.enter(brace, count, { describe: 'After: a brace under all four letters, its tip pointing at 4 items' });
    } else if (feature === 'underline') {
      const row = (x: number, size: number) => ['12', '42', '7'].map((v, i) => new Text(v, { fontSize: size, color: ink }).moveTo([x + (i - 1) * size * 2.2, by]));
      await panels(row(bx, 0.55), 'the values 12, 42 and 7, none marked');
      const values = row(ax, 0.9);
      await s.enter(...values);
      const mark = new Underline(values[1]!, { stroke: accent, strokeWidth: 0.06 });
      mark.key = 'underline:mark';
      await s.enter(mark, { describe: 'After: 42 is underlined; 12 and 7 are not' });
    } else if (feature === 'number-line') {
      await panels(
        [new Text('7', { fontSize: 1, color: ink }).moveTo([bx, by]), new Text('a value', { fontSize: 0.3, color: soft }).moveTo([bx, by - 1.0])],
        'the value 7, on no scale',
      );
      const line = new NumberLine({ range: [0, 10, 2], length: 7.4, includeNumbers: true, stroke: soft, labelColor: ink, labelFontSize: 0.4 }).moveTo([ax, ay - 0.4]);
      const at = new Dot({ radius: 0.13, color: accent }).moveTo(line.n2p(7));
      at.key = 'number-line:dot';
      const said = new Text('7', { fontSize: 0.5, color: accent }).moveTo([line.n2p(7)[0], line.n2p(7)[1] + 0.55]);
      await s.enter(line, at, said, { describe: 'After: a scale from 0 to 10, ticked every 2, with a dot at 7, between the ticks for 6 and 8' });
      this.state.placed = { value: 7, x: Number(line.n2p(7)[0].toFixed(3)) };
    } else if (feature === 'decimal') {
      await panels([new Text('0.0 ms', { fontSize: 0.7, color: ink }).moveTo([bx, by])], 'the count at 0.0 ms');
      const ms = new DecimalNumber(0, { decimals: 1, suffix: ' ms', fontSize: 1.2, color: ink }).moveTo([ax, ay]);
      await s.enter(ms, { describe: () => `After: the count reads ${ms.text}` });
      await this.play(new Transform(ms, new DecimalNumber(12.5, { decimals: 1, suffix: ' ms', fontSize: 1.2, color: ink }).moveTo([ax, ay])));
      this.state.count = ms.value;
    } else if (feature === 'math') {
      await panels([new Text('a^2+b^2=c^2', { fontSize: 0.42, font: 'mono', color: ink }).moveTo([bx, by])], 'the TeX source a^2+b^2=c^2');
      const f = new MathTex('a^2+b^2=c^2', { display: true, fontSize: 1.1, color: ink }).moveTo([ax, ay]);
      f.key = 'math:formula';
      await s.enter(f, { describe: 'After: the formula a squared plus b squared equals c squared, typeset' });
    } else if (feature === 'arc') {
      const start = (x: number, w: number) => [x - w, by] as Vec,
        end = (x: number, w: number) => [x + w, by] as Vec;
      await panels(
        [
          new ArcBetweenPoints(start(bx, 1.8), end(bx, 1.8), { angle: Math.PI / 2, stroke: soft, strokeWidth: 0.03 }),
          new Dot({ radius: 0.1, color: accent }).moveTo(start(bx, 1.8)),
        ],
        'the token at the start of its route',
      );
      const route = new ArcBetweenPoints(start(ax, 3), end(ax, 3), { angle: Math.PI / 2, stroke: soft, strokeWidth: 0.04 });
      const token = new Dot({ radius: 0.14, color: accent }).moveTo(start(ax, 3));
      token.key = 'arc:token';
      await s.enter(route, token, { describe: () => `After: a curved route dipping below the straight line between its ends, with the token at its ${token.center()[0] > ax ? 'far end' : 'start'}` });
      await this.play(new MoveAlongPath(token, route));
    } else if (feature === 'write') {
      await panels(
        [
          new Rectangle({ width: 4.4, height: 2.5, stroke: soft, strokeWidth: 0.03, cornerRadius: 0.1 }).moveTo([bx, by]),
          new Text('nothing written yet', { fontSize: 0.34, color: soft }).moveTo([bx, by]),
        ],
        'an empty panel, nothing written yet',
      );
      const word = new Text('Rayner', { fontSize: 1.6, color: ink }).moveTo([ax, ay]);
      await this.play(new Write(word));
      s.keep(word, { describe: 'After: the word Rayner, written' });
    } else if (feature === 'copy') {
      await panels([new Square({ side: 1.2, stroke: accent, strokeWidth: 0.06 }).moveTo([bx, by])], 'the square alone');
      const source = new Square({ side: 1.4, stroke: accent, strokeWidth: 0.06 }).moveTo([ax - 1.7, ay]);
      const result = new Circle({ radius: 0.8, stroke: accent, strokeWidth: 0.06 }).moveTo([ax + 1.7, ay]);
      source.key = 'copy:source';
      result.key = 'copy:result';
      await s.enter(source, { describe: 'After: the square, unchanged' });
      await this.play(new TransformFromCopy(source, result));
      s.keep(result, { describe: 'After: a circle beside the square, morphed from its copy' });
    } else if (feature === 'keys') {
      const row = (ids: string[], x: number, size: number, prefix: string) =>
        new Group(...ids.map((id, i) => tile(s, id, { at: [x + (i - 1) * size * 1.35, by], width: size, height: size, key: `${prefix}tile:${id}`, size: size * 0.55 })));
      await panels([row(['A', 'B', 'C'], bx, 1, 'before:')], 'the tiles in the order A, B, C');
      const before = row(['A', 'B', 'C'], ax, 1.4, '');
      await s.enter(before);
      const after = row(['C', 'A', 'B'], ax, 1.4, '');
      const match = new TransformMatching(before, after, { key: matchByKey() });
      await this.play(match);
      s.keep(after, { describe: 'After: the tiles in the order C, A, B, each moved whole' });
      this.state.order = ['C', 'A', 'B'];
    } else if (feature === 'diff') {
      const old = ['let n = 0;', 'n += 1;'],
        next = ['let n = 0;', 'n += 2;'];
      const patch = '@@ -1,2 +1,2 @@\n let n = 0;\n-n += 1;\n+n += 2;';
      await panels([new Code(old, { fontSize: 0.4, color: ink }).moveTo([bx, by])], 'the code with n += 1');
      const before = new Code(old, { fontSize: 0.6, color: ink }).moveTo([ax, ay + 0.6]);
      const after = new Code(next, { fontSize: 0.6, color: ink }).moveTo([ax, ay + 0.6]);
      await s.enter(before);
      const hunks = parseUnifiedDiff(patch);
      await this.play(new TransformDiff(before, after, { hunks }));
      s.keep(after, { describe: 'After: let n = 0; then n += 2;' });
      const ops = (hs: { ops: string[] }[]) => hs.flatMap((h) => h.ops).join(' ');
      const fromPatch = ops(hunks),
        found = ops(diffLines(old, next));
      await s.enter(
        new Text(`the patch: ${fromPatch}`, { fontSize: 0.32, font: 'mono', color: soft }).moveTo([ax, ay - 1.0]),
        new Text(`diffLines: ${found}`, { fontSize: 0.32, font: 'mono', color: soft }).moveTo([ax, ay - 1.55]),
        { describe: `Under the code: the patch's operations, ${fromPatch}, and diffLines', ${found}` },
      );
      this.state.ops = { patch: fromPatch, diffLines: found };
    } else if (feature === 'rates') {
      const RATES = { smooth, rushInto, rushFrom, thereAndBack } as const;
      const names = Object.keys(RATES) as (keyof typeof RATES)[];
      const rowY = (i: number, top: number, gap: number) => top - i * gap;
      const track = (x0: number, length: number, y: number, size: number) => new Line([x0, y], [x0 + length, y], { stroke: soft, strokeWidth: size });
      await panels(
        names.flatMap((name, i) => [
          track(bx - 1.6, 3.2, rowY(i, by + 1.3, 1.05), 0.02),
          new Text(name, { fontSize: 0.26, font: 'mono', color: soft }).moveTo([bx - 1.6, rowY(i, by + 1.3, 1.05) + 0.25], [-1, 0]),
          new Dot({ radius: 0.07, color: accent }).moveTo([bx - 1.6, rowY(i, by + 1.3, 1.05)]),
        ]),
        'four bare tracks, each dot at its start',
      );
      const x0 = ax - 2.6,
        length = 5,
        top = ay + 1.95,
        gap = 1.3;
      const dots = names.map((name, i) => keyed(new Dot({ radius: 0.12, color: accent }).moveTo([x0, rowY(i, top, gap)]), `rates:${name}`));
      const ticks = names.flatMap((name, i) =>
        Array.from({ length: 11 }, (_, k) => {
          const x = x0 + length * RATES[name](k / 10),
            y = rowY(i, top, gap);
          return new Line([x, y - 0.22], [x, y - 0.4], { stroke: soft, strokeWidth: 0.025 });
        }),
      );
      await s.enter(
        ...names.flatMap((name, i) => [
          track(x0, length, rowY(i, top, gap), 0.025),
          new Text(name, { fontSize: 0.32, font: 'mono', color: ink }).moveTo([x0, rowY(i, top, gap) + 0.3], [-1, 0]),
        ]),
        ...ticks,
        ...dots,
        {
          describe: () =>
            `After: four tracks, each with ticks where its dot was at every tenth of its run; ${names.map((name, i) => `${name}’s dot is at its ${dots[i]!.center()[0] > x0 + length / 2 ? 'end' : 'start'}`).join(', ')}`,
        },
      );
      for (const [i, name] of names.entries()) await this.play(dots[i]!.animate.shift([length, 0]), { rateFunc: RATES[name], runTime: 0.8 });
      this.state.rates = names;
    } else if (feature === 'bars') {
      const rows = [
        { label: 'LRU', value: 3, display: '3 hits' },
        { label: 'MRU', value: 1, display: '1 hit' },
      ];
      await panels([], 'the counts as numbers');
      await s.card(rows.map((r) => [r.label, r.display]), { at: BEFORE, size: 0.45 });
      const chart = bars(s, rows, 4, { key: 'hits' });
      chart.scale(0.62).moveTo([ax, ay]);
      await s.enter(chart, { describe: 'After: two bars on one scale of 4, LRU at 3 hits and MRU at 1 hit, a third as long' });
    } else if (feature === 'palette') {
      const dark = palette('github-dark');
      await panels(
        [
          new Rectangle({ width: 4.2, height: 2.6, fill: dark.paper, stroke: soft, strokeWidth: 0.02, cornerRadius: 0.1 }).moveTo([bx, by]),
          new Text('github-dark', { fontSize: 0.36, color: dark.ink }).moveTo([bx, by + 0.4]),
          new Text('paper, ink, accent', { fontSize: 0.3, color: dark.accent }).moveTo([bx, by - 0.4]),
        ],
        'a panel in github-dark, the tour’s usual paper and ink',
      );
      await s.card(
        [
          ['Paper', s.look.paper],
          ['Ink', s.look.ink],
          ['Emphasis', s.look.emphasis],
        ],
        { at: AFTER, size: 0.55, title: "palette('nord')" },
      );
    } else {
      // A globe: London and two great circles, seen from one viewpoint and turned to another by a view's tween.
      const model = {
        body: { radius: 1, fill: s.look.paper, stroke: soft, strokeWidth: 0.03 },
        parts: [
          { kind: 'path' as const, key: 'globe:equator', lines: [circleOn([0, 0, 1], 90)], closed: true, color: soft, width: 0.025 },
          { kind: 'path' as const, key: 'globe:meridian', lines: [circleOn(latLon(0, 90), 90)], closed: true, color: soft, width: 0.025 },
          { kind: 'point' as const, key: 'globe:london', at: latLon(51.5, -0.1), color: accent, radius: 0.09 },
        ],
      };
      const a = { kind: 'orthographic' as const, yaw: -60, pitch: 0 },
        b = { ...a, yaw: 0, pitch: 45 };
      const draw = (t: number, at: Vec, scale: number, key?: string) => seenFrom(model, between(a, b, t), { at, scale, ...(key ? { key } : {}) });
      const before = draw(0, [bx, by], 1.3, 'before:globe');
      for (const m of before.family()) if (m.key) m.key = `before:${m.key}`;
      await panels([before], 'the globe from the Atlantic, London near its right edge');
      this.state.turn = 0;
      const base = { ...this.state };
      const globe = view(this, (st) => draw(having(st, 'turn').turn, [ax, ay], 2), { place: false });
      await s.enter(globe, { describe: 'After: the globe, turned to face London, which sits near its middle' });
      await this.play(globe.tween((t) => ({ ...base, turn: t })));
      const london = project(latLon(51.5, -0.1), b, 1, { at: [ax, ay], scale: 2 }).at;
      await s.enter(new Text('London', { fontSize: 0.36, color: ink }).moveTo([london[0] + 0.25, london[1]], [-1, 0]));
      this.state.london = london.map((v) => Number(v.toFixed(2)));
    }
  }
}
