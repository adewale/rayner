import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mermaid } from '../explain/index.ts';

test('mermaid.frontMatter writes the config block two spaces a level, quoting what YAML would misread', () => {
  assert.equal(mermaid.frontMatter({ flowchart: { rankSpacing: 24, nodeSpacing: 16 } }), '---\nconfig:\n  flowchart:\n    rankSpacing: 24\n    nodeSpacing: 16\n---');
  assert.equal(
    mermaid.frontMatter({ pie: { legendPosition: 'right', textPosition: 0.68 }, themeVariables: { pie1: '#8250df', pieLegendTextSize: '17px' } }),
    "---\nconfig:\n  pie:\n    legendPosition: right\n    textPosition: 0.68\n  themeVariables:\n    pie1: '#8250df'\n    pieLegendTextSize: 17px\n---",
  );
  assert.equal(mermaid.frontMatter({ radar: { tickLabels: true, label: 'true', size: '12', quote: "it's" } }), "---\nconfig:\n  radar:\n    tickLabels: true\n    label: 'true'\n    size: '12'\n    quote: 'it''s'\n---");
});

test('mermaid.frontMatter refuses what Mermaid could not read back', () => {
  assert.throws(() => mermaid.frontMatter({}), /config is empty/);
  assert.throws(() => mermaid.frontMatter({ pie: {} }), /pie is empty/);
  assert.throws(() => mermaid.frontMatter({ xyChart: { width: NaN } }), /xyChart\.width is NaN/);
  assert.throws(() => mermaid.frontMatter({ 'bad key': 1 }), /not a config key/);
  assert.throws(() => mermaid.frontMatter({ title: 'two\nlines' }), /spans lines/);
});

test('mermaid.pie writes the pie as the collection wrote it by hand', () => {
  assert.equal(
    mermaid.pie([{ label: 'Row data', value: 901 }, { label: 'Free space', value: 12 }], { title: 'One page of int rows', showData: true, config: { pie: { textPosition: 0.72 } } }),
    '---\nconfig:\n  pie:\n    textPosition: 0.72\n---\npie showData\n  title One page of int rows\n  "Row data" : 901\n  "Free space" : 12\n',
  );
  assert.equal(mermaid.pie([{ label: 'A', value: 1.5 }]), 'pie\n  "A" : 1.5\n');
});

test('mermaid.pie refuses a zero or negative slice, an empty title, and labels Mermaid cannot keep', () => {
  assert.throws(() => mermaid.pie([{ label: 'Free', value: 0 }]), /the slice "Free" is 0; Mermaid draws only positive slices/);
  assert.throws(() => mermaid.pie([{ label: 'Free', value: -3 }]), /"Free" is -3/);
  assert.throws(() => mermaid.pie([{ label: 'Free', value: Infinity }]), /"Free" is Infinity/);
  assert.throws(() => mermaid.pie([]), /at least one slice/);
  assert.throws(() => mermaid.pie([{ label: 'A', value: 1 }], { title: '' }), /a title must be one line/);
  assert.throws(() => mermaid.pie([{ label: 'A', value: 1 }], { title: '  ' }), /a title must be one line/);
  assert.throws(() => mermaid.pie([{ label: 'say "hi"', value: 1 }]), /without double quotes/);
  assert.throws(() => mermaid.pie([{ label: 'A', value: 1 }, { label: 'A', value: 2 }]), /two slices are labelled "A"/);
});
