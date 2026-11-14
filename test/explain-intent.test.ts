// A script's intent header (explain/intent.ts): the one home of an explainer's title,
// answer, reader questions and what its model is checked against.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseIntent, adoptIntent } from '../explain/intent.ts';
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
  assert.throws(() => adoptIntent({ meta: { answer: 'twice' } }, parseIntent(SCRIPT)!, 'lamp'), /^Error: lamp: answer is declared in both script\.md and the scene/);
  // A scene module loaded once is collected many times in one process: adopting again is not declaring twice.
  adoptIntent(Scene, parseIntent(SCRIPT)!, 'lamp');
  assert.equal(Scene.meta.answer, 'the second press only dims it');
});

test('every adoption starts from the declared metadata: withIntent and loadProject drop a removed header\'s keys, as the command does', async () => {
  const { withIntent } = await import('../explain/testing.ts');
  const { loadProject } = await import('../explain/project.ts');
  const { Scene } = await import('../src/index.ts');
  const Lamp = { meta: { id: 'lamp' } as Record<string, unknown> };
  withIntent(Lamp, SCRIPT);
  assert.equal(Lamp.meta.answer, 'the second press only dims it');
  // Reader prose, with no intent header: the scene's metadata is what it declares again.
  withIntent(Lamp, '# Lamps\n\nA story about lamps.\n');
  assert.deepEqual(Lamp.meta, { id: 'lamp' });
  adoptIntent(Lamp, parseIntent(SCRIPT), 'lamp');
  assert.equal(adoptIntent(Lamp, null, 'lamp'), undefined);
  assert.deepEqual(Lamp.meta, { id: 'lamp' });
  // loadProject, run twice on one class in one process while its script loses its header.
  class Dim extends Scene {
    override async construct() { await this.step('one', { caption: 'The lamp.' }); }
  }
  const root = await mkdtemp(join(tmpdir(), 'rayner-intent-load-')), folder = join(root, 'lamp');
  try {
    await mkdir(folder);
    await writeFile(join(folder, 'script.md'), SCRIPT);
    const first = await loadProject(Dim, folder);
    assert.equal(first.Scene.meta?.answer, 'the second press only dims it');
    await writeFile(join(folder, 'script.md'), '# Lamps\n\nA story about lamps.\n');
    const second = await loadProject(Dim, folder);
    assert.equal(second.Scene.meta?.answer, undefined, 'the removed header took its answer with it');
    assert.equal(second.Scene.meta?.title, undefined);
    assert.equal(second.Scene.meta?.id, 'lamp', 'the id loadProject gives it is given again');
    await rm(join(folder, 'script.md'));
    assert.equal((await loadProject(Dim, folder)).Scene.meta?.answer, undefined);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('a part declared in both places is refused under the script\'s path', async () => {
  const { loadProject } = await import('../explain/project.ts');
  const { Scene } = await import('../src/index.ts');
  const root = await mkdtemp(join(tmpdir(), 'rayner-intent-twice-')), folder = join(root, 'lamp');
  try {
    await mkdir(folder);
    await writeFile(join(folder, 'script.md'), SCRIPT);
    const twice = (where: string) => new RegExp(`^Error: ${where.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}: answer is declared in both script\\.md and the scene;`);
    // The command and loadProject adopt a script by one function, adoptExplainer.
    class Lamp extends Scene {
      static meta = { answer: 'twice' };
      override async construct() { await this.step('one', { caption: 'The lamp.' }); }
    }
    await assert.rejects(loadProject(Lamp, folder), twice(join(folder, 'script.md')));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
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

test('a Grounding line gives the model a grade and the system it was checked against; an unknown grade is refused', () => {
  const graded = SCRIPT.replace('  wiring diagram.\n', '  wiring diagram.\n- **Grounding:** recorded: the lamp’s wiring diagram, measured on 2026-10-25.\n');
  const Scene = { meta: {} as Record<string, unknown> };
  adoptIntent(Scene, parseIntent(graded)!, 'lamp');
  assert.deepEqual(Scene.meta.grounding, { grade: 'recorded', subject: 'the lamp’s wiring diagram, measured on 2026-10-25' });
  adoptIntent(Scene, parseIntent(SCRIPT)!, 'lamp');
  assert.equal(Scene.meta.grounding, undefined, 'a script without the line gives no grade');
  assert.throws(() => parseIntent(SCRIPT.replace('  wiring diagram.\n', '  wiring diagram.\n- **Grounding:** tested: lots\n'), 'lamp/script.md'),
    /^Error: lamp\/script\.md: Grounding must start with one of live, recorded, read, none/);
  assert.throws(() => adoptIntent({ meta: { grounding: { grade: 'live' } } }, parseIntent(graded)!, 'lamp'), /grounding is declared in both script\.md and the scene/);
});

test('the page’s receipt is one sentence for the grade, with the full Checked against line, its files as code, behind a disclosure', async () => {
  const { groundingHtml } = await import('../tools/lib/explain-build.ts');
  const { chromeFor } = await import('../app/embed-strings.ts');
  const line = 'CPython 3.12’s storage, captured by `oracle/dict.py` into `fixtures/dict.json`';
  const en = groundingHtml(line, { grade: 'live', subject: 'CPython 3.12’s dict storage' }, 'en', chromeFor('en').checkedAgainst);
  assert.equal(en,
    '<p class="grounding" data-grade="live">Checked against CPython 3.12’s dict storage, run again each time the model’s tests run.</p>' +
    '<details class="grounding-details"><summary>How it was checked</summary><p>CPython 3.12’s storage, captured by <code>oracle/dict.py</code> into <code>fixtures/dict.json</code></p></details>');
  assert.ok(!en.includes('`'), 'no raw backticks reach the reader');
  assert.match(groundingHtml(line, { grade: 'recorded', subject: 'Postgres 18.6, on 2026-10-25' }, 'en', chromeFor('en').checkedAgainst), />Checked against Postgres 18\.6, on 2026-10-25: run once and recorded/);
  assert.match(groundingHtml(line, { grade: 'read', subject: 'RFC 7636' }, 'en', chromeFor('en').checkedAgainst), />Checked against RFC 7636, read and not run\.</);
  assert.match(groundingHtml(line, { grade: 'none' }, 'en', chromeFor('en').checkedAgainst), />Not checked against an outside system: only the model’s own tests check it\.</);
  assert.match(groundingHtml(line, { grade: 'recorded', subject: 'openfisca-france 176.1.3' }, 'fr', chromeFor('fr').checkedAgainst), />Vérifié par openfisca-france 176\.1\.3 : exécuté une fois et enregistré.*<summary>Comment il a été vérifié<\/summary>/);
  // Without a grade the line is the receipt, as before, with its files as code.
  assert.equal(groundingHtml(line, undefined, 'en', chromeFor('en').checkedAgainst),
    '<p class="grounding">The model is checked against: CPython 3.12’s storage, captured by <code>oracle/dict.py</code> into <code>fixtures/dict.json</code></p>');
  assert.equal(groundingHtml(undefined, undefined, 'en', chromeFor('en').checkedAgainst), '');
});

test('a catalogued explainer’s page, describe and gallery card give the same grade', async () => {
  const { describeExplainer } = await import('../explain/describe.ts');
  const { galleryTile } = await import('../tools/repo/lib/explain-gallery.ts');
  const project = await collectProject('scenes/explainers/pg-page', { write: false });
  const grounding = project.Scene.meta?.grounding;
  assert.deepEqual(grounding, { grade: 'recorded', subject: 'a Postgres 18.6 server, measured on 2026-10-25' });
  const d = await describeExplainer(project.Scene, { snapshots: project.store, drawings: false });
  assert.deepEqual(d.grounding, { ...grounding, label: 'Recorded: a Postgres 18.6 server, measured on 2026-10-25',
    sentence: 'Checked against a Postgres 18.6 server, measured on 2026-10-25: run once and recorded, and the model’s tests compare with that recording.' });
  assert.match(galleryTile({ id: 'pg-page', title: 'Pages', lang: 'en', grounding: { grade: 'recorded', label: d.grounding!.label } }),
    /<\/span><small class="grounding" data-grade="recorded">Recorded: a Postgres 18\.6 server, measured on 2026-10-25<\/small><\/a>/);
  const folder = await mkdtemp(join(tmpdir(), 'rayner-grounding-'));
  try {
    const { html } = await buildExplainer(project, join(folder, 'pg-page.html'));
    assert.ok(html.includes(`<h2>Sources</h2><p class="grounding" data-grade="recorded">${d.grounding!.sentence}</p><details class="grounding-details"><summary>How it was checked</summary><p>a real Postgres 18.6 server (Docker <code>postgres:18</code>`));
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
