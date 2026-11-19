import test from 'node:test';
import assert from 'node:assert/strict';
import {Scene, Rectangle} from '../src/index.ts';
import type {Style} from '../src/index.ts';
import {renderElements, toSvgString} from '../src/svg.ts';
import {NullSink} from '../src/timeline.ts';

const changes: Record<string, Style> = {
  lineCap: {lineCap: 'square'}, lineJoin: {lineJoin: 'bevel'}, fillRule: {fillRule: 'evenodd'},
  dashArray: {dashArray: '0.3 0.4'}, dashOffset: {dashOffset: 0.2}, miterLimit: {miterLimit: 8}, paintOrder: {paintOrder: 'stroke fill'},
};
for (const [field, change] of Object.entries(changes)) test(`paint cache invalidates ${field} and retains immutable earlier records`, () => {
  for (const relative of [true, false]) {
    const shape = new Rectangle({fill: '#123456', stroke: '#654321', dashArray: '0.2 0.1'});
    const scene = new Scene(new NullSink()).add(shape);
    const prior = renderElements(scene, {relative})[0]!, saved = {...prior.attrs};
    shape.setStyle(change);
    const actual = renderElements(scene, {relative})[0]!;
    const fresh = new Scene(new NullSink()).add(shape.copy());
    assert.deepEqual(actual.attrs, renderElements(fresh, {relative})[0]!.attrs);
    assert.notDeepEqual(actual.attrs, saved);
    assert.deepEqual(prior.attrs, saved);
    assert.equal(toSvgString(scene), toSvgString(fresh));
  }
});
