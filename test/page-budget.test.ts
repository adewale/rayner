import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {pageSize, PAGE_BUDGET} from '../tools/lib/page-budget.ts';
import {inflateSnapshots} from '../app/embed-snapshots.ts';

test('page budgets count UTF-8 bytes and reject raw or compressed excess independently', () => {
  assert.equal(pageSize('é').bytes, 2);
  assert.throws(() => pageSize('x'.repeat(PAGE_BUDGET.htmlBytes + 1)), /raw bytes.*Reduce scenarios/);
  const noisy = Buffer.alloc(600 * 1024);
  for (let i = 0; i < noisy.length; i += 32) createHash('sha256').update(String(i)).digest().copy(noisy, i);
  const html = noisy.toString('base64');
  assert.ok(Buffer.byteLength(html) < PAGE_BUDGET.htmlBytes);
  assert.throws(() => pageSize(html), /gzip bytes.*Reduce scenarios/);
});

test('the native browser decoder restores exact JSON values, including prototype-sensitive keys', async () => {
  const {gzipSync} = await import('node:zlib');
  const text = '{"__proto__":{"x":1},"positions":[0.123456789,-1e-30,1e30],"label":"سلام <script> & é"}';
  const packed = gzipSync(text);
  assert.equal(gunzipSync(packed).toString(), text);
  const decoded = await inflateSnapshots(packed.toString('base64'));
  assert.deepEqual(decoded, JSON.parse(text));
  assert.equal(Object.getPrototypeOf(decoded), Object.prototype);
  assert.equal(Object.hasOwn(decoded, '__proto__'), true);
  await assert.rejects(inflateSnapshots(Buffer.from('not gzip').toString('base64')));
});
