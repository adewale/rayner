import { test } from 'node:test';
import assert from 'node:assert/strict';
import { looksNamed, keyedByLine, captionLookProblems, NOT_A_LOOK } from '../explain/caption-looks.ts';
import { colorName, swatchWords } from '../explain/annotate.ts';

test('looksNamed reads colour and pattern words, folding gray into grey and plurals into the word', () => {
  assert.deepEqual(looksNamed('The purple fill marks cat; the dashed line is the browser.'), ['purple', 'dashed']);
  assert.deepEqual(looksNamed('Gray bars and two Reds'), ['grey', 'red']);
  // Emphasis and dimming words carry their own meaning, so they are not looks the stage must name.
  assert.deepEqual(looksNamed('the outlined cards, in bold, the rest faded and greyed out'), []);
});

test('looksNamed leaves out phrases whose colour word is not a look, each with a reason', () => {
  assert.deepEqual(looksNamed('A red-black tree keeps whitespace in a black box.'), []);
  assert.deepEqual(looksNamed('how far the colour stands from grey'), []);
  assert.ok(NOT_A_LOOK.every((entry) => entry.why.length > 10), 'every exception says why');
});

test('a line keys a look with a colon, clause by clause', () => {
  assert.deepEqual([...keyedByLine('Red: the plane’s route. Blue dashed: the ruler’s line.')].sort(), ['blue', 'dashed', 'red']);
  assert.deepEqual([...keyedByLine('The red arc rises where the street points.')], []);
});

test('captionLookProblems: a caption may lean on the stage or the heading, a line only on the rest of the stage or its own key', () => {
  const words = { title: 'Taking cat', line: 'Three hashes', caption: 'The purple fill marks cat’s bits.' };
  assert.deepEqual(captionLookProblems(words, [words.title, words.line], ['Taken:', 'cat (1, 6, 15)']), [
    'the caption names “purple”, which no word on the stage says',
  ]);
  assert.deepEqual(captionLookProblems(words, [words.title, words.line], ['Key: purple fill, cat (1, 6, 15)']), []);
  const keyed = { line: 'Red: the plane’s route.', caption: 'The red line is the shortest.' };
  assert.deepEqual(captionLookProblems(keyed, [keyed.line], []), []);
  const loose = { line: 'The red line is the shortest.', caption: '' };
  assert.deepEqual(captionLookProblems(loose, [loose.line], []), ['the line names “red”, which nothing else on the stage says']);
});

test('colorName names a colour by its hue, and greys, black and white by lightness', () => {
  assert.deepEqual(
    ['#cf222e', '#fb8f44', '#bf8700', '#9a6700', '#1a7f37', '#1b7c83', '#0969da', '#8250df', '#bf3989', '#6e7781', '#1f2328', '#ffffff'].map(colorName),
    ['red', 'orange', 'yellow', 'brown', 'green', 'teal', 'blue', 'purple', 'pink', 'grey', 'black', 'white'],
  );
  assert.equal(colorName('not a colour'), 'coloured');
});

test('swatchWords says a fill, a line and an outline, dashed or not, with a name override', () => {
  assert.equal(swatchWords({ label: 'cat', fill: '#8250df' }), 'purple fill');
  assert.equal(swatchWords({ label: 'browser', stroke: '#0969da', dashed: true }), 'dashed blue line');
  assert.equal(swatchWords({ label: 'gap', fill: 'none', stroke: '#cf222e', dashed: true }), 'dashed red outline');
  assert.equal(swatchWords({ label: 'dog', fill: '#e0d0b0', stroke: '#9a6700', name: 'brown' }), 'brown fill with a brown outline');
  // The article follows the word after it.
  assert.equal(swatchWords({ label: 'fox', fill: '#8250df', stroke: '#e8590c' }), 'purple fill with an orange outline');
  assert.throws(() => swatchWords({ label: 'nothing' }), /needs a fill or a stroke/);
});
