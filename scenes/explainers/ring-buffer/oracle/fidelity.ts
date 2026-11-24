// Repository-only native reader evidence. Portable scene tests do not import this owner.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
import {toSvgString} from '../../../../src/index.ts';
import type {Arrow, SceneClass} from '../../../../src/index.ts';
import {NullSink, KeyedMotionSink} from '../../../../src/internal.ts';
import {withIntent, withSettings} from '../../../../explain/testing.ts';
import {liveBase, liveSteps, runLive} from '../../../../explain/internal.ts';
import {acceptedLog} from '../../../../app/embed-live.ts';
import {rasterize} from '../../../../tools/lib/explain-raster.ts';

interface Row {
  time: number; source: number; proxy: number; receipt: number;
  headBase: readonly number[];
  slotPaint: {fill: string; fillOpacity: number};
}
async function observe(Source: SceneClass) {
  const host = await new Source(new NullSink()).run(), place = liveSteps(host).get('implementation-result');
  assert.ok(place, 'the implementation machine offers its actual reader controls');
  const {machine, base} = await liveBase(Source, 'implementation-result', place);
  assert.ok(base, 'the public reader has an origin');
  // Use only events admitted at the published resting picture. The two authored
  // scenarios need different prefixes; the last pop transfers slot four's value.
  const log: string[] = [];
  let before = base.state as {head: number};
  for (let n = 0; n < 6; n++) {
    log.push('pop');
    const outcome = machine.outcome(before, 'pop');
    assert.ok('next' in outcome, 'the selected reader pop is accepted');
    if (before.head === 4) break;
    before = outcome.next as {head: number};
  }
  assert.equal(before.head, 4, 'the reader reaches the independently selected fifth value');
  const admitted = acceptedLog(machine, base.state, log);
  assert.deepEqual(admitted.kept, log, 'the page admits the entire evidence history');
  const after = admitted.states.at(-1)! as {tray: {values: unknown[]}};
  const receipt = `ring:tray:${after.tray.values.length - 1}`;
  const source = `ring:value:${before.head}`, proxy = `${receipt}:source:0:${source}`;
  const motion = new KeyedMotionSink(() => 'last reader pop');
  const wanted = [0, 0.4, 0.5, 19/30, 1, 1.4, 2.1], rows: Row[] = [];
  let start: number | undefined;
  const result = await runLive(Source, 'implementation-result', place, log, {from: base.from, animate: {async frame(scene) {
    await motion.frame(scene, 0);
    start ??= scene.time;
    const time = scene.time - start;
    if (!wanted.length || time + 1e-7 < wanted[0]!) return;
    wanted.shift();
    const actual = await rasterize(toSvgString(scene, {width: 1280})), rgba = actual.pixels;
    const contribution = async (key: string): Promise<number> => {
      const part = scene.find(key);
      if (!part) return 0;
      const states = part.family().map(m => [m, m.style.opacity] as const);
      for (const [m] of states) m.setStyle({opacity: 0}, false);
      let without: Buffer;
      try {without = (await rasterize(toSvgString(scene, {width: 1280}))).pixels;}
      finally {for (const [m, opacity] of states) m.setStyle({opacity}, false);}
      let changed = 0;
      for (let i = 0; i < rgba.length; i += 4)
        if (rgba[i] !== without[i] || rgba[i+1] !== without[i+1] || rgba[i+2] !== without[i+2]) changed++;
      return changed;
    };
    const slot = scene.find('ring:slot:4')!, head = scene.find('ring:pointer:head:arrow') as Arrow;
    rows.push({time, source: await contribution(source),
      proxy: await contribution(proxy), receipt: await contribution(receipt),
      headBase: head.line.start(), slotPaint: {fill: slot.style.fill, fillOpacity: slot.style.fillOpacity}});
  }}});
  return {rows, duplicates: motion.finish().filter(f => f.kind === 'duplicate words'), state: result.scene.stateJson()};
}
function ownership(observed: Awaited<ReturnType<typeof observe>>): void {
  const {rows} = observed;
  assert.equal(rows.length, 7, 'all independently named transfer phases were captured');
  assert.ok(rows[0]!.source > 100 && rows[0]!.proxy === 0 && rows[0]!.receipt === 0,
    'the original source visibly exists before departure');
  const middle = rows.filter(row => row.time > .49 && row.time < .65);
  assert.equal(middle.length, 2);
  assert.ok(middle.every(row => row.proxy > 100 && row.receipt === 0), 'the actual proxy paints and the receipt waits');
  assert.ok(middle.every(row => row.source === 0), 'source ownership is exclusive through departure');
  assert.ok(rows.at(-1)!.receipt > 100 && rows.at(-1)!.source === 0 && rows.at(-1)!.proxy === 0,
    'visible arrival replaces the proxy with the receipt');
  assert.deepEqual(observed.state.returned, [5]);
  assert.deepEqual(observed.duplicates, [], 'the reader transfer has no overlapping duplicate words');
}

async function retainedSource(values: Record<string, string>): Promise<SceneClass> {
  // Reproduce the original source-survival fault in a separate module/class. Its empty
  // departure action leaves the stored value in place until rest; no duration guard changes.
  const sceneUrl = new URL('../scene.ts', import.meta.url);
  let source = await readFile(sceneUrl, 'utf8');
  const from = 'const retired = c.leave(`ring:value:${slot}`, {runTime: 0});';
  assert.equal(source.split(from).length, 2, 'one source-ownership poison anchor');
  source = source.replace(from, 'const retired = new AnimationGroup([]);')
    .replace(/from '([^']+)'/g, (_, path: string) => `from '${new URL(path, sceneUrl).href}'`);
  const url = `data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString('base64')}`;
  const Changed = (await import(url)).default as typeof import('../scene.ts').default;
  return withSettings(withIntent(Changed, await readFile(new URL('../script.md', import.meta.url), 'utf8')), values);
}

/** The actual offered scenario, plus a legal-duration independent retained-source control. */
export async function checkMotion(Source: SceneClass, values: Record<string, string>): Promise<void> {
  const keeper = await observe(Source);
  ownership(keeper);
  const poison = await observe(await retainedSource(values));
  assert.throws(() => ownership(poison), /source ownership is exclusive through departure/);
  // Physical ownership, rather than equal text in unrelated locations, is the
  // authority here. The generic duplicate rule only diagnoses overlapping ink.
  assert.deepEqual(keeper.state, poison.state, 'the defect and repair reach the same durable result');
  for (let i = 0; i < keeper.rows.length; i++) {
    assert.equal(keeper.rows[i]!.time, poison.rows[i]!.time);
    assert.deepEqual(keeper.rows[i]!.headBase, poison.rows[i]!.headBase, 'head pointer timing stays intact');
    assert.deepEqual(keeper.rows[i]!.slotPaint, poison.rows[i]!.slotPaint, 'slot clearing timing stays intact');
  }
}
