import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describeExplainer } from '../explain/testing.ts';
import type { ExplainerDescription } from '../explain/testing.ts';
import { writeDescriptions, summaryOf, describeProject, checkBuilt } from '../tools/repo/lib/explain-site-describe.ts';
import { collectProject, loadScene, sceneInputs, ROOT } from '../tools/lib/explain-project.ts';

test('site:export copies each explainer\'s describe.json from demos:build as <id>.json beside its page, and writes llms.txt at the site root', async () => {
  const root = await mkdtemp(join(tmpdir(), 'explain-site-'));
  try {
    await mkdir(join(root, 'projects/rayner'), { recursive: true });
    // As demos:build writes them, in out/explainers/<id>/.
    const built = join(root, 'out');
    for (const id of ['glyph', 'ring-buffer']) {
      await mkdir(join(built, id), { recursive: true });
      await writeFile(join(built, id, 'describe.json'), await describeProject(await collectProject(join(ROOT, 'scenes/explainers', id), { write: false })));
    }
    // glyph's is laid out with indents, which describeProject never writes, to tell copying from describing.
    const glyph = JSON.stringify(JSON.parse(await readFile(join(built, 'glyph/describe.json'), 'utf8')), null, 1);
    await writeFile(join(built, 'glyph/describe.json'), glyph);
    const sizes = await writeDescriptions(root, '/projects/rayner', [
      { id: 'glyph', group: 'toolchain' },
      { id: 'ring-buffer', group: 'topic' },
    ], built);
    // The JSON is describeExplainer's object, drawings included, as `rayner describe` prints it,
    // in the bytes demos:build wrote.
    const json = await readFile(join(root, 'projects/rayner/ring-buffer.json'), 'utf8');
    assert.equal(json, await readFile(join(built, 'ring-buffer/describe.json'), 'utf8'));
    // As the project collects it: the scene with its script's intent (title, answer, checks, checked against).
    assert.deepEqual(JSON.parse(json), await describeExplainer((await collectProject(join(ROOT, 'scenes/explainers/ring-buffer'), { write: false })).Scene));
    // Copied, not described again: glyph's file is published as it is.
    assert.equal(await readFile(join(root, 'projects/rayner/glyph.json'), 'utf8'), glyph);
    const llms = await readFile(join(root, 'llms.txt'), 'utf8');
    assert.equal(sizes.llms, Buffer.byteLength(llms));
    assert.ok(sizes.json > json.length);
    // llms.txt: an H1, a blockquote, then link lists by group, topics first.
    assert.match(llms, /^# Rayner explainers\n\n> \S.+\n/);
    assert.ok(llms.indexOf('## Explainers') < llms.indexOf('## How these are made'));
    assert.match(
      llms,
      /^- \[How does a ring buffer reuse storage\?\]\(\/projects\/rayner\/ring-buffer\): The simplest queue keeps its values in order in an array\. JSON: \[ring-buffer\.json\]\(\/projects\/rayner\/ring-buffer\.json\)$/m,
    );
    assert.match(llms, /^## How these are made\n\n- \[[^\]]+\]\(\/projects\/rayner\/glyph\): .+ JSON: \[glyph\.json\]\(\/projects\/rayner\/glyph\.json\)$/m);
    // The collection's lists sit between markers that name its path.
    assert.match(llms, /\n\n<!-- rayner:begin \/projects\/rayner -->\n## Explainers\n/);
    assert.ok(llms.endsWith('\n<!-- rayner:end /projects/rayner -->\n'));
    // A second export replaces its own section, with absolute links given --origin.
    await writeDescriptions(root, '/projects/rayner', [{ id: 'ring-buffer', group: 'topic' }], built, 'https://example.org/');
    assert.match(
      await readFile(join(root, 'llms.txt'), 'utf8'),
      /\]\(https:\/\/example\.org\/projects\/rayner\/ring-buffer\): .+ JSON: \[ring-buffer\.json\]\(https:\/\/example\.org\/projects\/rayner\/ring-buffer\.json\)$/m,
    );
    // An explainer demos:build has not described fails with what to run.
    await assert.rejects(
      writeDescriptions(root, '/projects/rayner', [{ id: 'fork', group: 'topic' }], built),
      /^Error: Missing \S+\/out\/fork\/describe\.json: run npm run demos:build/,
    );
    // A site's own llms.txt keeps its lines; the collection's section is appended after them.
    await writeFile(join(root, 'llms.txt'), '# My site\n\n> Notes.\n');
    await writeDescriptions(root, '/projects/rayner', [{ id: 'ring-buffer', group: 'topic' }], built);
    const own = await readFile(join(root, 'llms.txt'), 'utf8');
    assert.ok(own.startsWith('# My site\n\n> Notes.\n\n<!-- rayner:begin /projects/rayner -->\n## Explainers\n\n- [How does a ring buffer'), own);
    assert.ok(own.endsWith('<!-- rayner:end /projects/rayner -->\n'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("an explainer's llms.txt summary is the first sentence of its default scenario's first caption", () => {
  const step = (caption: string) => ({ step: 's', title: 'T', line: '', caption, start: 0, end: 1, state: {}, changed: {}, picture: '' });
  const d: ExplainerDescription = {
    schema: 1,
    id: 'x',
    title: 'X',
    lang: 'en',
    sources: [],
    settings: [{ id: 'n', label: 'N', default: 'b', options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }] }],
    scenarios: [
      { values: { n: 'a' }, name: 'N: A', duration: 1, steps: [step('Not the default.')] },
      { values: { n: 'b' }, name: 'N: B', duration: 1, steps: [step('Version 4.3.3 sets  it.\nThe rest is detail.')] },
    ],
  };
  assert.equal(summaryOf(d), 'Version 4.3.3 sets it.');
});

test("site:export refuses an explainer's built files when demos:build has not run since its scene changed", async () => {
  const root = await mkdtemp(join(tmpdir(), 'explain-built-'));
  try {
    const scene = join(root, 'scene'),
      folder = join(root, 'out/x');
    await mkdir(scene, { recursive: true });
    await mkdir(folder, { recursive: true });
    const code = (n: number) =>
      `import{Scene,Text,FadeIn}from'rayner';export default class X extends Scene{static meta={id:'x',title:'X'};async construct(){await this.step('one',{caption:'One.'});await this.play(new FadeIn(new Text('${n}')));}}`;
    await writeFile(join(scene, 'scene.ts'), code(1));
    await writeFile(join(scene, 'data.txt'), 'a');
    await assert.rejects(checkBuilt(folder, scene), /^Error: Missing \S+\/out\/x\/inputs\.json: run npm run demos:build/);
    // What demos:build records after writing the folder's other files.
    await writeFile(join(folder, 'inputs.json'), JSON.stringify(await sceneInputs(await loadScene(scene))));
    await checkBuilt(folder, scene);
    // What file browsers and editors leave in a folder is not an input.
    await writeFile(join(scene, '.DS_Store'), 'x');
    await writeFile(join(scene, 'scene.ts~'), 'x');
    await checkBuilt(folder, scene);
    // A data file or pinned snapshot in the scene's folder, then the scene's code.
    await writeFile(join(scene, 'data.txt'), 'b');
    await assert.rejects(checkBuilt(folder, scene), /out\/x is stale: .*Run npm run demos:build/);
    await writeFile(join(scene, 'data.txt'), 'a');
    await checkBuilt(folder, scene);
    await writeFile(join(scene, 'scene.ts'), code(2));
    await assert.rejects(checkBuilt(folder, scene), /out\/x is stale: the scene's code, the scene's folder changed since it was built/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('llms.txt leaves out coverage-tier explainers', async () => {
  const { llmsTxt } = await import('../tools/repo/lib/explain-site-describe.ts');
  const d = (title: string) => ({ title, settings: [], scenarios: [{ values: {}, steps: [{ caption: `${title} opens here.` }] }] }) as unknown as Parameters<typeof llmsTxt>[0][number]['d'];
  const llms = llmsTxt(
    [
      { item: { id: 'shown', group: 'topic', tier: 'gallery' }, d: d('Shown') },
      { item: { id: 'probe', group: 'topic', tier: 'coverage' }, d: d('Probe') },
    ],
    '',
  );
  assert.match(llms, /\[Shown\]\(\/shown\)/);
  assert.ok(!llms.includes('probe'), 'a coverage scene is not listed');
});

test('two collections share llms.txt: each export replaces only its own section, under its own heading, and keeps the host preamble', async () => {
  const { llmsSection, mergeLlms } = await import('../tools/repo/lib/explain-site-describe.ts');
  const d = (title: string) => ({ title, settings: [], scenarios: [{ values: {}, steps: [{ caption: `${title} opens here.` }] }] }) as unknown as Parameters<typeof llmsSection>[0][number]['d'];
  const a = (title: string) => llmsSection([{ item: { id: 'one', group: 'topic' }, d: d(title) }, { item: { id: 'tool', group: 'toolchain' }, d: d('Tool') }], 'https://example.org/projects/a', '/projects/a');
  const b = llmsSection([{ item: { id: 'two', group: 'topic' }, d: d('Two') }], 'https://example.org/projects/b', '/projects/b', 'Poppy, explained');
  // The first export creates the file: the H1, blockquote and intro, then its section.
  const first = mergeLlms(null, '/projects/a', a('One'));
  assert.match(first, /^# Rayner explainers\n\n> \S.+\n\nEach item links the page.+\n\n<!-- rayner:begin \/projects\/a -->\n## Explainers\n\n- \[One\]\(https:\/\/example\.org\/projects\/a\/one\): One opens here\. JSON: .+\n\n## How these are made\n\n- \[Tool\]/);
  // The first export of another path appends its section, under its own heading.
  const both = mergeLlms(first, '/projects/b', b);
  assert.ok(both.startsWith(first) && both.endsWith(b), both);
  assert.match(both, /\n\n<!-- rayner:begin \/projects\/b -->\n## Poppy, explained\n\n- \[Two\]\(https:\/\/example\.org\/projects\/b\/two\)/);
  // A host edits the preamble; re-exporting A replaces A's section in place and leaves the rest.
  const edited = both.replace('# Rayner explainers', '# oshineye.dev');
  const again = mergeLlms(edited, '/projects/a', a('One, revised'));
  assert.ok(again.startsWith('# oshineye.dev\n'));
  assert.ok(again.includes('[One, revised]') && !again.includes('[One]('));
  assert.ok(again.indexOf('rayner:begin /projects/a') < again.indexOf('rayner:begin /projects/b'));
  assert.ok(again.endsWith(b));
  assert.equal(mergeLlms(again, '/projects/b', b), again, 'an unchanged export changes nothing');
  // A custom heading names the toolchain list too, so two collections never share a heading.
  assert.match(llmsSection([{ item: { id: 't', group: 'toolchain' }, d: d('T') }], '', '/p', 'Poppy'), /^## Poppy: how these are made$/m);
});

test('an llms.txt from before sections were marked loses its unmarked collection lists but keeps a host-written section', async () => {
  const { mergeLlms, llmsSection } = await import('../tools/repo/lib/explain-site-describe.ts');
  const legacy = '# Rayner explainers\n\n> Step-through explainers.\n\nEach item links the page.\n\n## Explainers\n\n- [Old](/projects/rayner/old): Old.\n\n## How these are made\n\n- [Glyph](/projects/rayner/glyph): G.\n\n## Poppy, explained\n\nWritten by the host.\n\n- [Poppy](/projects/poppy/poppy): P.\n';
  const section = llmsSection([], '', '/projects/rayner');
  const merged = mergeLlms(legacy, '/projects/rayner', section);
  assert.ok(!merged.includes('[Old]') && !merged.includes('[Glyph]'));
  assert.ok(merged.startsWith('# Rayner explainers\n\n> Step-through explainers.\n\nEach item links the page.\n\n## Poppy, explained\n\nWritten by the host.'));
  assert.ok(merged.endsWith('\n\n' + section));
});
