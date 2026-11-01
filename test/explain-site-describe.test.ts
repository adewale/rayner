import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describeExplainer } from '../explain/index.ts';
import type { ExplainerClass, ExplainerDescription } from '../explain/index.ts';
import { writeDescriptions, summaryOf, describeProject, checkBuilt } from '../tools/lib/explain-site-describe.ts';
import { collectProject, loadScene, sceneInputs, ROOT } from '../tools/lib/explain-project.ts';
import RingBuffer from '../scenes/explainers/ring-buffer/scene.ts';

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
    assert.deepEqual(JSON.parse(json), await describeExplainer(RingBuffer as ExplainerClass));
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
      /^- \[How does a ring buffer reuse storage\?\]\(\/projects\/rayner\/ring-buffer\): After five pushes, all slots hold values and both pointers return to slot 0\. JSON: \[ring-buffer\.json\]\(\/projects\/rayner\/ring-buffer\.json\)$/m,
    );
    assert.match(llms, /^## How these are made\n\n- \[[^\]]+\]\(\/projects\/rayner\/glyph\): .+ JSON: \[glyph\.json\]\(\/projects\/rayner\/glyph\.json\)$/m);
    // A second export replaces its own llms.txt, with absolute links given --origin; a site's own
    // llms.txt is left alone and the export fails.
    await writeDescriptions(root, '/projects/rayner', [{ id: 'ring-buffer', group: 'topic' }], built, 'https://example.org/');
    assert.match(
      await readFile(join(root, 'llms.txt'), 'utf8'),
      /\]\(https:\/\/example\.org\/projects\/rayner\/ring-buffer\): .+ JSON: \[ring-buffer\.json\]\(https:\/\/example\.org\/projects\/rayner\/ring-buffer\.json\)$/m,
    );
    // An explainer demos:build has not described fails with what to run.
    await assert.rejects(
      writeDescriptions(root, '/projects/rayner', [{ id: 'fork', group: 'topic' }], built),
      /^Error: Missing \S+\/out\/fork\/describe\.json: run npm run demos:build first$/,
    );
    await writeFile(join(root, 'llms.txt'), '# My site\n');
    await assert.rejects(writeDescriptions(root, '/projects/rayner', [{ id: 'ring-buffer', group: 'topic' }], built), /not one site:export wrote/);
    assert.equal(await readFile(join(root, 'llms.txt'), 'utf8'), '# My site\n');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("an explainer's llms.txt summary is the first sentence of its default case's first caption", () => {
  const step = (caption: string) => ({ step: 's', title: 'T', line: '', caption, start: 0, end: 1, state: {}, changed: {}, picture: '' });
  const d: ExplainerDescription = {
    schema: 1,
    id: 'x',
    title: 'X',
    lang: 'en',
    sources: [],
    settings: [{ id: 'n', label: 'N', default: 'b', options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }] }],
    cases: [
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
    await assert.rejects(checkBuilt(folder, scene), /^Error: Missing \S+\/out\/x\/inputs\.json: run npm run demos:build first$/);
    // What demos:build records after writing the folder's other files.
    await writeFile(join(folder, 'inputs.json'), JSON.stringify(await sceneInputs(await loadScene(scene))));
    await checkBuilt(folder, scene);
    // What file browsers and editors leave in a folder is not an input.
    await writeFile(join(scene, '.DS_Store'), 'x');
    await writeFile(join(scene, 'scene.ts~'), 'x');
    await checkBuilt(folder, scene);
    // A data file or pinned snapshot in the scene's folder, then the scene's code.
    await writeFile(join(scene, 'data.txt'), 'b');
    await assert.rejects(checkBuilt(folder, scene), /out\/x is stale: the scene's folder changed since it was built\. Run npm run demos:build$/);
    await writeFile(join(scene, 'data.txt'), 'a');
    await checkBuilt(folder, scene);
    await writeFile(join(scene, 'scene.ts'), code(2));
    await assert.rejects(checkBuilt(folder, scene), /out\/x is stale: the scene's code, the scene's folder changed since it was built/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
