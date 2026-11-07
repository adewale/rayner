// Authored emphasis words are data, including words Object.prototype also names.
// Keep one real description-boundary owner: grouping, summary and transcript must agree.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { picture, pictureSummary, pictureHtml } from '../explain/trace.ts';
import type { Description } from '../explain/trace.ts';

test('authored mark words survive grouping, summary and HTML as literal words', () => {
  // [authored word, sentence heading, HTML spelling]. Expected prose is authored here,
  // independently of the production dictionaries, grouping and escaping helpers.
  const cases = [
    ['rejected', 'Rejected', 'rejected'],
    ['valueOf', 'ValueOf', 'valueOf'],
    ['constructor', 'Constructor', 'constructor'],
    ['__proto__', '__proto__', '__proto__'],
    ['toString', 'ToString', 'toString'],
    ['hasOwnProperty', 'HasOwnProperty', 'hasOwnProperty'],
    ['isPrototypeOf', 'IsPrototypeOf', 'isPrototypeOf'],
    ['propertyIsEnumerable', 'PropertyIsEnumerable', 'propertyIsEnumerable'],
    ['toLocaleString', 'ToLocaleString', 'toLocaleString'],
    ['__defineGetter__', '__defineGetter__', '__defineGetter__'],
    ['__defineSetter__', '__defineSetter__', '__defineSetter__'],
    ['__lookupGetter__', '__lookupGetter__', '__lookupGetter__'],
    ['__lookupSetter__', '__lookupSetter__', '__lookupSetter__'],
    ['rejected & <held>', 'Rejected & <held>', 'rejected &amp; &lt;held&gt;'],
  ] as const;
  for (const [mark, heading, escaped] of cases) {
    const authored: Description[] = [
      { what: 'A path', parts: [
        { name: 'Start & finish', mark },
        { name: 'Middle <node>', mark },
        { name: 'Unmarked node' },
      ] },
      { what: 'A counter', parts: [{ name: '3 retries', mark }] },
    ];
    const result = picture(authored, new Set());
    assert.deepEqual(result, { entries: [
      { what: 'A path', marked: { [mark]: ['Start & finish', 'Middle <node>'] }, items: ['Unmarked node'] },
      { what: 'A counter', marked: { [mark]: ['3 retries'] }, items: [] },
    ] }, mark);
    assert.equal(pictureSummary({ picture: result }),
      `A path; A counter. ${heading}: Start & finish; Middle <node>; 3 retries.`, mark);
    assert.equal(pictureHtml({ picture: result }),
      '<ul><li>A path:<ul>' +
      `<li>Start &amp; finish (${escaped});</li><li>Middle &lt;node&gt; (${escaped});</li>` +
      '<li>Unmarked node.</li></ul></li>' +
      `<li>A counter:<ul><li>3 retries (${escaped}).</li></ul></li></ul>`, mark);
  }
  const numeric = picture([{ what: 'Counts', parts: [
    { name: 'Second', mark: '2' }, { name: 'First', mark: '1' },
  ] }], new Set());
  assert.equal(pictureSummary({ picture: numeric }), 'Counts. 1: First; 2: Second.');
});
