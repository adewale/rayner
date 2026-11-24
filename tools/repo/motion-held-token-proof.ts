// Independently paint the enlarged historical token beside a held refresh tag.
// The new docking layout prevents this old word obstruction; absence of a detector
// warning alone cannot establish that prevention.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { parseArgs } from 'node:util';
import { LiveSink, liveBase, liveSteps, runLive } from '../../explain/internal.ts';
import { loadFonts } from '../../explain/testing.ts';
import { Text } from '../../src/index.ts';
import { routeInkCheck } from '../../scenes/explainers/lib/route-ink/fidelity.ts';
import { CORPUS } from '../../test/fixtures/motion-corpus/corpus.ts';
import { collectProject } from '../lib/explain-project.ts';
import { ROOT } from '../lib/roots.ts';
import { buildVariant } from './motion-corpus-lib.ts';

const {values} = parseArgs({options:{out:{type:'string'}}});
const entry = CORPUS.find(e=>e.id === 'sign-in-tokens-over-labels');
assert.ok(entry);
const history = ['ask', 'approve-read', 'collect', 'ask', 'collect'];
await loadFonts();
const observations = [];
for (const mutated of [false, true]) {
  const sceneFile = await buildVariant({...entry, id:`held-proof-${randomUUID()}`, edits:mutated ? entry.edits : []});
  try {
    const project = await collectProject(sceneFile, {write:false});
    const scenario = project.scenarios.find(s=>s.values.flow === 'device');
    assert.ok(scenario);
    const host = await new scenario.Scene(new LiveSink()).run();
    const place = liveSteps(host).get('sign-out');
    assert.ok(place);
    const {base} = await liveBase(scenario.Scene, 'sign-out', place);
    assert.ok(base);
    const outward = routeInkCheck(), returning = routeInkCheck();
    let frames = 0;
    await runLive(scenario.Scene, 'sign-out', place, history, {from:base.from, animate:{
      async frame(scene) {
        frames++;
        const words = scene.familyMembers().filter((m):m is Text=>m instanceof Text &&
          (m.text === 'your agent' || m.text === 'refresh token' || m.text === 'pat_8Hk2' || m.text === 'Example Company' || m.text === 'example.com' || m.text === 'WDJB-MJHT'));
        await outward.frame(scene, 'poll', words);
        await returning.frame(scene, 'poll:back', words);
      },
    }});
    const required = ['your agent', 'refresh token', 'pat_8Hk2', 'Example Company', 'example.com', 'WDJB-MJHT'];
    outward.assertClear(`${mutated?'enlarged':'normal'} held-token outward route`,required);
    returning.assertClear(`${mutated?'enlarged':'normal'} held-token return route`,required);
    assert.ok(frames > 2);
    observations.push({mutated,frames,required,restoredLetterPixels:0});
  } finally { await rm(dirname(dirname(sceneFile)), {recursive:true, force:true}); }
}
const out = values.out ?? join(ROOT,'out','motion-held-token-proof');
await mkdir(out,{recursive:true});
await writeFile(join(out,'report.json'),JSON.stringify({entry:entry.id,history,renderer:'native Resvg, 800px, four-paint subject/mover knockout',observations},null,2)+'\n');
console.log(`Verified normal and enlarged held-token routes. Evidence in ${out}`);
