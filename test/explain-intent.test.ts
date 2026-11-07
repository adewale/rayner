// A script's intent header (tools/lib/explain-intent.ts): the one home of an explainer's title,
// answer, reader questions and what its model is checked against.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseIntent, adoptIntent } from '../tools/lib/explain-intent.ts';
import { collectProject } from '../tools/lib/explain-project.ts';
import { buildExplainer } from '../tools/lib/explain-build.ts';

const SCRIPT = `# Why does the lamp stay dim?

- **Reader:** has pressed the switch twice.
- **Answer:** the second press only dims it.
- **Checked against:** the lamp's
  wiring diagram.

## Check yourself

1. What does a third press do?
   It turns the lamp off,
   as the first press turned it on.

## Why this explainer

Free prose for the author, which Rayner does not read.
`;

test('an intent header gives the question, labelled lines and reader questions; the author\'s prose is not read', () => {
  assert.deepEqual(parseIntent(SCRIPT), {
    question: 'Why does the lamp stay dim?',
    fields: { Reader: 'has pressed the switch twice.', Answer: 'the second press only dims it.', 'Checked against': 'the lamp\'s wiring diagram.' },
    questions: [{ question: 'What does a third press do?', answer: 'It turns the lamp off, as the first press turned it on.' }],
  });
});

test('a script with no Answer line has no intent header; a header without what the model is checked against, or a question without an answer, is refused', () => {
  assert.equal(parseIntent('# A question\n\nReader prose, as scripts were written before.\n'), null);
  assert.throws(() => parseIntent('# Q\n\n- **Answer:** yes.\n', 'lamp/script.md'), /lamp\/script\.md: the intent header has no Checked against/);
  assert.throws(() => parseIntent('- **Answer:** yes.\n- **Checked against:** a test.\n'), /no the # question/);
  assert.throws(() => parseIntent('# Q\n\n- **Answer:** yes.\n- **Checked against:** a test.\n\n## Check yourself\n\n1. Why?\n'), /the question "Why\?" has no answer/);
});

test('the scene takes the intent as its own metadata, and a part declared in both places is refused', () => {
  const Scene = { meta: { id: 'lamp' } as Record<string, unknown> };
  adoptIntent(Scene, parseIntent(SCRIPT)!, 'lamp');
  assert.deepEqual(Scene.meta, {
    id: 'lamp', title: 'Why does the lamp stay dim?', answer: 'the second press only dims it',
    questions: [{ question: 'What does a third press do?', answer: 'It turns the lamp off, as the first press turned it on.' }],
    checkedAgainst: 'the lamp\'s wiring diagram.',
  });
  assert.throws(() => adoptIntent({ meta: { answer: 'twice' } }, parseIntent(SCRIPT)!, 'lamp'), /answer declared in both script\.md and the scene/);
  // A scene module loaded once is collected many times in one process: adopting again is not declaring twice.
  adoptIntent(Scene, parseIntent(SCRIPT)!, 'lamp');
  assert.equal(Scene.meta.answer, 'the second press only dims it');
});

test('Hanoi\'s scene declares no title, answer or questions, and its page shows the script\'s', async () => {
  const project = await collectProject('scenes/tutorial/hanoi', { write: false });
  const meta = project.Scene.meta as Record<string, unknown>;
  assert.equal(meta.title, 'How few moves can carry a tower to another peg?');
  assert.equal(meta.answer, 'the smaller tower moves twice and the largest disk once');
  assert.equal((meta.questions as unknown[]).length, 2);
  const folder = await mkdtemp(join(tmpdir(), 'rayner-intent-'));
  try {
    const { html } = await buildExplainer(project, join(folder, 'hanoi.html'));
    assert.match(html, /<title>How few moves can carry a tower to another peg\?<\/title>/);
    assert.match(html, /The model is checked against: a search of every arrangement of three, four and five disks/);
    assert.match(html, /Suppose the tower must end on B instead\./);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
