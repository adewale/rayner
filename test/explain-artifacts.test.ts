import test from 'node:test';
import assert from 'node:assert/strict';
import {catalog, catalogEvidence, sceneInputs} from '../tools/lib/explain-artifacts.ts';
const totals = {explainers: 1, cases: 1, diagrams: 0, styles: 0, families: 0};
const c = {version: 1, product: {entry: {id: 'example', step: 'one', settings: {case: 'a'}}}, totals,
  scenes: [{id: 'example', cases: 1, group: 'topic', showcase: true}]};
const e = {version: 2, checked: true, totals, scenes: [{id: 'example', cases: [{case: 'a'}], diagrams: 0, styles: [], families: [],
  narrowOpenings: [{settings: {case: 'a'}, steps: [{step: 'one', reviewed: true, targets: ['answer'], labels: []}]}]}]};
test('catalog and evidence readers validate known fields before returning typed artifacts', () => {
  assert.deepEqual(catalog(c), c); assert.deepEqual(catalogEvidence(e), e);
  for (const defect of [
    (v: typeof c) => {v.version = 2;},
    (v: typeof c) => {v.scenes.push(v.scenes[0]!);},
    (v: typeof c) => {v.product.entry.settings.case = 7 as never;},
    (v: typeof c) => {v.scenes[0]!.group = 'unknown';},
    (v: typeof c) => {v.scenes[0]!.showcase = 'yes' as never;},
    (v: typeof c) => {v.totals.cases = NaN;},
  ]) {const bad = structuredClone(c); defect(bad); assert.throws(() => catalog(bad), /Invalid catalog/);}
  for (const defect of [
    (v: typeof e) => {v.checked = 'yes' as never;},
    (v: typeof e) => {v.scenes[0]!.cases[0]!.case = 2 as never;},
    (v: typeof e) => {v.scenes[0]!.narrowOpenings[0]!.steps[0]!.targets = [] as string[];},
    (v: typeof e) => {v.scenes[0]!.narrowOpenings[0]!.steps[0]!.reviewed = 'yes' as never;},
  ]) {const bad = structuredClone(e); defect(bad); assert.throws(() => catalogEvidence(bad), /Invalid/);}
});
test('scene input records require their declared format and actual digest strings', () => {
  const value = {version: '2', sourceHash: 'a'.repeat(64), engineHash: 'b'.repeat(64), importer: 'c'.repeat(16), files: 'd'.repeat(64), buildHash: 'e'.repeat(64)};
  assert.deepEqual(sceneInputs(value), value);
  for (const key of Object.keys(value)) {
    const bad = {...value, [key]: key === 'version' ? '1' : 'not-a-digest'};
    assert.throws(() => sceneInputs(bad), /Invalid scene inputs/);
  }
});
