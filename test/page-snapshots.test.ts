import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pageSnapshots, packPageSnapshots} from '../tools/lib/page-snapshots.ts';
import {decodeSnapshotPayload} from '../app/embed-snapshot-codec.ts';
import {inflateSnapshots} from '../app/embed-snapshots.ts';
import {gzipSync} from 'node:zlib';
import type {SnapshotStore} from '../integrations/agentic-mermaid/snapshot.ts';
import {fc, params} from './lib/pbt.ts';
import {collectProject} from '../tools/lib/explain-project.ts';
import {bindSnapshots} from '../explain/index.ts';
import {toSvgString} from '../src/index.ts';
import type {SceneClass} from '../src/index.ts';

import { fixture } from './lib/page-snapshot-fixture.ts';

test('page path compaction preserves exact float32 bytes through JSON, including signed underflow', () => {
  const check = (points: number[]) => {
    const store = fixture(points), before = JSON.stringify(store);
    const compact = pageSnapshots(store);
    assert.equal(JSON.stringify(store), before, 'never change the committed snapshot or its caller');
    const wire = JSON.parse(JSON.stringify(compact)) as SnapshotStore;
    const original = JSON.parse(before) as SnapshotStore;
    const shape = (s: SnapshotStore) => s.diagram!.parts[0]!.shapes[0]!;
    const actual = new Float32Array(shape(wire).subpaths[0]!);
    const expected = new Float32Array(shape(original).subpaths[0]!);
    assert.deepEqual(Buffer.from(actual.buffer), Buffer.from(expected.buffer));
    assert.equal(wire.diagram!.width, original.diagram!.width, 'layout dimensions retain double precision');
    assert.deepEqual(shape(wire).style, shape(original).style, 'paint metadata retains double precision');
    shape(original).subpaths = shape(wire).subpaths;
    assert.deepEqual(wire, original, 'every non-path field remains exact');
  };
  check([0, -0, -1e-300, 1e-300, -1e-45, 1e-45, 3.4028234e38, -3.4028234e38]);
  fc.assert(fc.property(fc.array(fc.double({min: -3.402823466e38, max: 3.402823466e38, noNaN: true, noDefaultInfinity: true}), {minLength: 2, maxLength: 38}), check), params(200));
});

test('path transport preserves independent JSON metadata, numeric bits and prototype-sensitive keys', () => {
  fc.assert(fc.property(
    fc.array(fc.double({min: -3.402823466e38, max: 3.402823466e38, noNaN: true, noDefaultInfinity: true}), {minLength: 4, maxLength: 38}),
    fc.jsonValue(), fc.string(), (points, metadata, source) => {
      const original = fixture(points);
      original.diagram!.spec.source = source;
      original.diagram!.layoutCertification = metadata;
      original.diagram!.parts[0]!.channels = metadata;
      original.diagram!.parts[0]!.shapes[0]!.subpaths.push([...points]);
      const compact = pageSnapshots(Object.fromEntries(['__proto__', 'constructor', 'diagram'].map(key => [key, original.diagram!])));
      const before = JSON.stringify(compact), independent = JSON.parse(before) as SnapshotStore;
      const wire = JSON.parse(JSON.stringify(packPageSnapshots(compact)));
      const decoded = decodeSnapshotPayload(wire);
      assert.deepEqual(decoded, independent, 'every field and its ordering survives independent JSON transport');
      assert.equal(JSON.stringify(decoded), before, 'object key order is preserved');
      assert.equal(JSON.stringify(compact), before, 'packing never mutates its input');
      assert.equal(Object.getPrototypeOf(decoded), Object.prototype);
      assert.equal(Object.hasOwn(decoded, '__proto__'), true);
      const restored = decoded.diagram!.parts[0]!.shapes[0]!.subpaths;
      for (const path of restored) {
        const actual = new Float32Array(path), expected = new Float32Array(independent.diagram!.parts[0]!.shapes[0]!.subpaths[0]!);
        assert.deepEqual(Buffer.from(actual.buffer), Buffer.from(expected.buffer));
      }
      assert.notEqual(restored[0], restored[1]);
      const sensitiveKey: string = 'constructor';
      assert.notEqual(restored[0], decoded[sensitiveKey]!.parts[0]!.shapes[0]!.subpaths[0]);
      restored[0]![0] = 42;
      assert.equal(JSON.stringify(compact), before);
      assert.deepEqual(decoded[sensitiveKey], independent[sensitiveKey]);
      assert.deepEqual(restored[1], independent.diagram!.parts[0]!.shapes[0]!.subpaths[1]);
    }), params(200));
});

test('only repeated long shape paths become references and restored arrays never alias', async () => {
  const long = Array.from({length: 20}, (_, i) => i / 13), short = [0, 1], unique = long.map(n => n + 100);
  const store = fixture(long);
  store.diagram!.parts[0]!.shapes[0]!.subpaths = [long, [...long], short, [...short], unique];
  const packed = packPageSnapshots(store);
  assert.deepEqual(packed.paths, [long]);
  assert.deepEqual(packed.store.diagram!.parts[0]!.shapes[0]!.subpaths, [0, 0, short, short, unique]);
  const wire = JSON.stringify(packed);
  const restored = await inflateSnapshots(gzipSync(wire).toString('base64'));
  assert.deepEqual(restored, JSON.parse(JSON.stringify(store)));
  const paths = restored.diagram!.parts[0]!.shapes[0]!.subpaths;
  assert.notEqual(paths[0], paths[1]); assert.notEqual(paths[2], paths[3]);
  paths[0]![0] = -123;
  assert.equal(paths[1]![0], long[0]); assert.equal(packed.paths[0]![0], long[0]);
  assert.equal(JSON.stringify(packed), wire);
  paths[2]![0] = -456;
  assert.deepEqual(paths[3], short);
});

test('packed transport rejects invalid references and malformed dictionary entries', () => {
  for (const ref of [-1, 0.5, 1, Number.MAX_SAFE_INTEGER, NaN, Infinity, {}, '0', null, [0, 'bad']]) {
    const payload = packPageSnapshots(fixture([0, 1]));
    payload.paths = [[0, 1]];
    payload.store.diagram!.parts[0]!.shapes[0]!.subpaths = [ref as number];
    assert.throws(() => decodeSnapshotPayload(payload), /Invalid packed diagram snapshots/);
  }
  for (const paths of [null, {}, [null], [[Infinity]], [['1']], [[{}]], Array(1), [Array(2)]]) {
    assert.throws(() => decodeSnapshotPayload({format: 'rayner-paths-v1', paths, store: {}}), /Invalid packed diagram snapshots/);
  }
  assert.throws(() => decodeSnapshotPayload({format: 'rayner-paths-v2', paths: [], store: {}}), /Invalid packed diagram snapshots/);
  const sparse = packPageSnapshots(fixture([0, 1]));
  sparse.store.diagram!.parts[0]!.shapes[0]!.subpaths = Array(1);
  assert.throws(() => decodeSnapshotPayload(sparse), /Invalid packed diagram snapshots/);
});

test('compacted real flowchart, timeline and XY snapshots render byte-identical resting SVGs', async () => {
  const frames = async (Source: SceneClass) => {
    const result: string[] = [];
    await new Source({async frame() {}, async stepEnd(scene) {result.push(toSvgString(scene));}}, {skipUntil: Infinity}).run();
    return result;
  };
  for (const id of ['mr-cache', 'cert-renewal', 'tailwind-gamut']) {
    const project = await collectProject(`scenes/explainers/${id}`, {write: false});
    const compact = pageSnapshots(project.store);
    const Source = project.variants[0]!.Scene;
    const original = await frames(Source);
    assert.ok(original.length >= 3, 'compare every resting picture, not an empty render');
    assert.deepEqual(await frames(bindSnapshots(Source, compact)), original, id);
    const decoded = decodeSnapshotPayload(JSON.parse(JSON.stringify(packPageSnapshots(compact))));
    assert.deepEqual(await frames(bindSnapshots(Source, decoded)), original, `${id}: packed transport`);
  }
});
