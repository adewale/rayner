// Await-only adaptation of the preserved independent review probe for the private async route keeper.
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { renderAsync } from '@resvg/resvg-js';

const base = process.env.RAYNER_REPRO_ROOT || process.cwd();
const source = name => import(pathToFileURL(resolve(base, name)).href);
const { Scene, Group, Rectangle, Text, VMobject, Transform, keyed, toSvgString, linear } = await source('src/index.ts');
const { KeyedMotionSink } = await source('src/keyed-motion.ts');
const { loadFonts } = await source('explain/testing.ts');
await loadFonts();
const cases = [];
const selected = new Set(process.argv.slice(2));
const run = async (name, f) => { if (!selected.size || selected.has(name)) cases.push({ name, ...(await f()) }); };
const text = (str = 'TOKEN', color = '#ff0000', size = 0.8) => new Text(str, { fontSize: size, color }).moveTo([0, 0]);
const solid = (w = 4, h = 1.4, color = '#224466') => new Rectangle({width: w, height: h, fill: color, stroke: 'none'});
const raster = async scene => (await renderAsync(toSvgString(scene, {width: 480}), {font: {loadSystemFonts: false}})).pixels;
function colors(bytes) {
  let red = 0, green = 0;
  for (let i = 0; i < bytes.length; i += 4) {
    if (bytes[i] > 160 && bytes[i + 1] < 80 && bytes[i + 2] < 80) red++;
    if (bytes[i + 1] > 160 && bytes[i] < 80 && bytes[i + 2] < 80) green++;
  }
  return {red, green};
}
const native = async scene => colors(await raster(scene));
const findingsOf = (findings, ...kinds) => findings.filter(f => kinds.includes(f.kind)).map(({kind, path, value, t, detail}) => ({kind, path, value, t, detail}));
async function play(construct, frame = () => {}) {
  const sink = new KeyedMotionSink(() => 'fixture');
  class Example extends Scene { async construct() { await this.step('fixture'); await construct(this); } }
  await new Example({ async frame(scene, delta) { await frame(scene); await sink.frame(scene, delta); } }).run();
  return sink.finish();
}

await run('duplicate-visibility', async () => {
  const rows = [];
  for (const mode of ['both paint', 'moving clipped', 'fixed fully behind paper', 'moving fully behind paper', 'contained at different sizes']) {
    const samples = [];
    const findings = await play(async s => {
      const contained = mode === 'contained at different sizes';
      const fixed = keyed(text('TOKEN', '#ff0000', contained ? 1.7 : 0.8), 'fixed');
      const mover = keyed(text('TOKEN', '#00ff00', contained ? 0.55 : 0.8).moveTo([contained ? -0.5 : -1, 0]), 'mover');
      if (mode === 'moving clipped') mover.clipBox = [6, 2, 7, 3];
      const paper = solid(8, 2.3);
      if (mode === 'fixed fully behind paper') s.add(fixed, paper, mover);
      else if (mode === 'moving fully behind paper') s.add(mover, paper, fixed);
      else s.add(fixed, mover);
      mover.setOpacity(0);
      await s.wait(0.2);
      mover.setOpacity(1);
      await s.play(mover.animate.shift([contained ? 1 : 2, 0]), {runTime: 1, rateFunc: linear});
      mover.setOpacity(0);
      await s.wait(0.2);
    }, async s => {
      if (s.find('mover')?.style.opacity === 1) samples.push(await native(s));
    });
    const red = samples.map(p => p.red), green = samples.map(p => p.green);
    assert.ok(red.length >= 29);
    if (mode === 'moving clipped' || mode === 'moving fully behind paper') assert.equal(Math.max(...green), 0);
    if (mode === 'fixed fully behind paper') assert.equal(Math.max(...red), 0);
    if (mode === 'both paint' || mode === 'contained at different sizes') assert.ok(samples.some(p => p.red > 20 && p.green > 20));
    rows.push({mode, frames: red.length, red: [Math.min(...red),Math.max(...red)], green: [Math.min(...green),Math.max(...green)], findings: findingsOf(findings, 'duplicate words')});
  }
  return {rows};
});

await run('travel-coverage', async () => {
  const rows = [];
  for (const mode of ['solid', 'evenodd hole', 'victim clipped']) {
    const samples = [];
    const findings = await play(async s => {
      const victim = keyed(text('ABCD'), 'victim');
      if (mode === 'victim clipped') victim.clipBox = [5, 2, 6, 3];
      const shape = new VMobject({fill: '#224466', stroke: 'none', fillRule: 'evenodd'});
      shape.setPolygon([[-4,-1.4],[4,-1.4],[4,1.4],[-4,1.4]]);
      if (mode === 'evenodd hole') shape.startNewPath([-3.8,-1.2]).addLineTo([3.8,-1.2]).addLineTo([3.8,1.2]).addLineTo([-3.8,1.2]).closePath();
      const mover = keyed(shape, 'carrier').shift([-1, 0]);
      s.add(victim); await s.wait(0.2);
      s.add(mover); await s.play(mover.animate.shift([2,0]), {runTime: 1, rateFunc: linear});
      s.remove(mover); await s.wait(0.2);
    }, async s => { if (s.find('victim')) samples.push({moving: !!s.find('carrier'), ...(await native(s))}); });
    const moving = samples.filter(p => p.moving).map(p => p.red), alone = samples.filter(p => !p.moving).map(p => p.red);
    assert.ok(moving.length >= 29 && alone.length > 0);
    if (mode === 'evenodd hole') assert.ok(samples.every(p => p.red === alone[0] && p.red > 50));
    if (mode === 'victim clipped') assert.ok(samples.every(p => p.red === 0));
    rows.push({mode, frames: moving.length, movingRed: [Math.min(...moving),Math.max(...moving)], standaloneRed: alone[0], findings: findingsOf(findings,'covers','occluded words')});
  }
  return {rows};
});

await run('partial-handoff', async () => {
  const rows = [];
  for (const mode of ['no replacement', 'complete replacement', 'one glyph replacement']) {
    const visible = [];
    const findings = await play(async s => {
      const original = text('ABCD'), replacement = text('ABCD', '#00ff00'), cover = keyed(solid(4,1.3), 'paper');
      if (mode === 'one glyph replacement') {
        const glyph = replacement.children[0].box();
        replacement.clipBox = [glyph[0] - 0.01, -1, glyph[2] + 0.01, 1];
      }
      const group = keyed(new Group(original), 'reader');
      s.add(group); await s.wait(0.2);
      group.add(cover); if (mode !== 'no replacement') group.add(replacement);
      await s.wait(0.5);
      group.remove(cover); if (mode !== 'no replacement') group.remove(replacement);
      await s.wait(0.2);
    }, async s => {
      if (s.find('reader')) visible.push({covered: !!s.find('paper'), ...(await native(s))});
    });
    const a = visible.filter(p=>!p.covered), b = visible.filter(p=>p.covered);
    assert.ok(a.length > 0 && b.length > 10);
    assert.ok(a.every(p => p.red > 150) && b.every(p => p.red === 0));
    rows.push({mode, framesCovered: b.length, oldRed: a[0].red, coveredRed: b[0].red, replacementGreen: b[0].green, findings: findingsOf(findings, 'occluded words')});
  }
  return {rows};
});

await run('alternating-victims', async () => {
  const rows = [];
  for (const locations of ['one label', 'alternating labels']) {
    const sampled = [];
    const findings = await play(async s => {
      const left = text('OK').moveTo([-3,0]), right = text('OK','#00ff00').moveTo([3,0]);
      const leftCover = keyed(solid(3,1.3).moveTo([-3,0]),'left cover');
      const rightCover = keyed(solid(3,1.3).moveTo([3,0]),'right cover');
      s.add(keyed(new Group(left,right),'row values'));
      await s.wait(0.2);
      for (let step = 0; step < 6; step++) {
        const cover = locations === 'alternating labels' && step % 2 ? rightCover : leftCover;
        s.add(cover); await s.wait(2/30); s.remove(cover);
      }
      await s.wait(0.2);
    }, async s => { if (s.find('row values')) sampled.push(await native(s)); });
    const longestZero = key => {
      let run = 0, longest = 0;
      for (const frame of sampled) { run = frame[key] === 0 ? run + 1 : 0; longest = Math.max(longest, run); }
      return longest;
    };
    const redBlackout = longestZero('red'), greenBlackout = longestZero('green');
    if (locations === 'alternating labels') assert.ok(redBlackout === 2 && greenBlackout === 2);
    rows.push({locations, maxConsecutiveRedAbsent:redBlackout,maxConsecutiveGreenAbsent:greenBlackout,
      alwaysOneCompleteLabel:sampled.every(f=>f.red>100 || f.green>100), findings: findingsOf(findings,'occluded words')});
  }
  return {rows};
});

await run('match-order', async () => {
  const rows = [];
  for (const mode of ['insert behind retained label', 'paper already behind retained label', 'three later admissions']) {
    const samples = [];
    const findings = await play(async s => {
      const wording = () => keyed(text('KEEP'), 'caption');
      const page = () => keyed(solid(4, 1.4), 'page');
      const src = keyed(new Group(...(mode === 'paper already behind retained label' ? [page(),wording()] : [wording()])), 'picture');
      const later = mode === 'three later admissions' ? Array.from({length:3},(_,i)=>keyed(solid(0.5,0.5).moveTo([3+i,2]),'other'+i)) : [];
      const dst = keyed(new Group(page(),wording(),...later), 'picture');
      s.add(src); await s.wait(0.2);
      await s.play(new Transform(src, dst, {match:'key',runTime:1,rateFunc:linear,lagRatio:later.length ? 1 : 0}));
      await s.wait(0.2);
    }, async s => {
      if (!s.find('picture')) return;
      const actual = await raster(s), caption = s.find('caption');
      const shaded = caption.family().map(p => [p, p.style.opacity]);
      let zeroContribution;
      try {
        for (const [p] of shaded) p.setStyle({opacity:0},false);
        const gone = await raster(s);
        zeroContribution = Buffer.compare(actual,gone)===0;
      } finally { for (const [p,v] of shaded) p.setStyle({opacity:v},false); }
      samples.push({frame:s.frameCount,time:s.time,zeroContribution, ...colors(actual)});
    });
    const zero = samples.filter(p=>p.red === 0);
    assert.ok(samples[0].red > 100 && samples.at(-1).red > 100);
    rows.push({mode, initialRed:samples[0].red, finalRed:samples.at(-1).red,
      minimumRed:Math.min(...samples.map(p=>p.red)), zeroFrames:zero.map(p=>p.frame),
      zeroActualLabelContribution:samples.filter(p=>p.zeroContribution).map(p=>p.frame),
      findings: findingsOf(findings,'occluded words')});
  }
  return {rows};
});

await run('match-root-clip', async () => {
  const rows = [];
  for (const mode of ['target root', 'entering child']) {
    const samples = [];
    await play(async s => {
      const anchor = () => keyed(solid(0.4,0.4,'#ff0000').moveTo([-5,0]), 'anchor');
      const src = keyed(new Group(anchor()), 'picture'), entrant = keyed(solid(2,1,'#00ff00'), 'entrant');
      const target = keyed(new Group(anchor(), entrant), 'picture');
      (mode === 'target root' ? target : entrant).clipBox = [-6,-1,-4,1];
      s.add(src); await s.wait(0.2);
      await s.play(new Transform(src,target,{match:'key',runTime:1,rateFunc:linear}));
      await s.wait(0.2);
    }, async s => { if (s.find('picture')) samples.push({frame:s.frameCount,...(await native(s))}); });
    const painted = samples.filter(s=>s.green>0);
    assert.ok(samples.every(s=>s.red>100) && samples[0].green===0 && samples.at(-1).green===0);
    rows.push({mode,greenAtEnds:[samples[0].green,samples.at(-1).green],maxGreen:Math.max(...samples.map(s=>s.green)),
      paintedFrames:painted.length, paintedRange:painted.length ? [painted[0].frame,painted.at(-1).frame] : []});
  }
  return {rows};
});

await run('route-counterfactual', async () => {
  if (process.env.RAYNER_REPRO_ROOT) return {skipped:'helper introduced by branch'};
  const {routeInkCheck} = await source('scenes/explainers/lib/route-ink/fidelity.ts');
  const scene = new Scene({async frame(){}}), route = routeInkCheck();
  const subject = text('KEEP').moveTo([0,2]);
  const invisibleBacking = solid(0.55,0.55,'#224466').moveTo([-0.35,0]);
  const carrier = keyed(solid(9,1.3,'#224466'),'carrier');
  carrier.clipBox = [-1,-0.45,1,0.45];
  scene.add(invisibleBacking, subject, carrier);
  carrier.moveTo([-2,0]); await route.frame(scene,'carrier',[subject]);
  const first = await raster(scene);
  carrier.moveTo([2,0]); invisibleBacking.moveTo([0.35,0]); await route.frame(scene,'carrier',[subject]);
  const second = await raster(scene);
  assert.deepEqual(first,second);
  let result = 'passed'; try {route.assertClear('counterfactual travel',['KEEP']);} catch (e) {result = e.message;}
  return {framesByteIdentical:true, worldTravel:4, actualPixelChanges:0, helper:result};
});
console.log(JSON.stringify({base, cases},null,2));
