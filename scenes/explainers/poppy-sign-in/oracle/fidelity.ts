import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { loadFonts, loadProject } from '../../../../explain/testing.ts';
import { MachineMotionCheck } from '../../../../tools/lib/explain-motion-rules.ts';
import { CORPUS } from '../../../../test/fixtures/motion-corpus/corpus.ts';
import { check as fidelity } from '../fidelity.ts';
// Deliberate defects run in temporary copies: the working scene never changes.
const originalFile = resolve(import.meta.dirname, '../scene.ts');
const raw = await readFile(originalFile, 'utf8');
await loadFonts();
const results = [];
for (const id of ['sign-in-pages-overlap', 'sign-in-password-hand-and-flight', 'sign-in-tag-over-scopes', 'source-only', 'offstage-presentation']) {
  let source = raw;
  if (id === 'source-only') source = source.replace("c.leave('you:password', { runTime: 0.2 }), card[0]!", 'card[0]!');
  else if (id === 'offstage-presentation') source = source.replace(/const card = c.to\('card'\);\n          const present: Pt = \[[\s\S]+?card.height\(\) \/ 2 \+ 0.06\];/, "const present: Pt = c.has('tag', 'to') ? [seal[0], c.to('agent:key').box()![3] + c.to('card').height() / 2 + 0.06] : seal;");
  else {
    const entry = CORPUS.find(e => e.id === id)!;
    for (const edit of entry.edits) {
      if (!source.includes(edit.find)) throw new Error('missing exact mutation anchor: ' + id);
      source = source.replace(edit.find, edit.replace);
    }
  }
  if (source === raw) throw new Error('no mutation: ' + id);
  source = source.replace(/from '([.][^']+)'/g, (_, path) => `from '${resolve(dirname(originalFile), path)}'`);
  const directory = await mkdtemp(join(tmpdir(), 'sign-in-control-'));
  const file = join(directory, 'scene.mts');
  await writeFile(file, source);
  try {
    const Source = (await import(pathToFileURL(file).href)).default;
    const project = await loadProject(Source, dirname(originalFile));
    const scenario = project.scenarios.find(s => s.values.flow === (id === 'sign-in-pages-overlap' || id === 'offstage-presentation' ? 'device' : 'direct'))!;
    if (id === 'offstage-presentation' || id === 'source-only') {
      try { await fidelity(scenario.trace, scenario.values, {scenario}); throw new Error('poison passed owner fidelity'); }
      catch (error) {
        const message = String((error as Error).message);
        assert.equal(message, id === 'source-only' ? 'one password card leaves the hand as it travels' : 'the paper and every printed letter fit onstage throughout presentation');
        results.push({id, ownerFailure: message});
      }
    } else {
      const check = new MachineMotionCheck(), scene = new scenario.Scene(check);
      await check.during(scene, () => scene.run());
      const subject = id === 'sign-in-pages-overlap' ? 'window:frame' : id === 'sign-in-password-hand-and-flight' ? 'you:password' : 'agent:key';
      assert.ok(check.findings.some(line => line.includes(`subject \"${subject}\" must be absent`)), `exact intended ${subject} absence must reject ${id}`);
      results.push({id, findings: check.findings});
    }
  } finally { await rm(directory, {recursive: true, force: true}); }
}
console.log(JSON.stringify(results, null, 2));
