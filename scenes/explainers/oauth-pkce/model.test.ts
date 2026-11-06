import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fc, params } from '../lib/pbt.ts';
import { createHash } from 'node:crypto';
import { sha256, pkceChallenge } from './model.ts';

test('SHA-256 and PKCE agree with independent crypto and the RFC 7636 vector', () => {
  const checkHash = (input: string) => {
    const expected = createHash('sha256').update(input).digest();
    assert.deepEqual(Buffer.from(sha256(input)), expected);
    assert.equal(pkceChallenge(input), expected.toString('base64url'));
  };
  // Independent UTF-8 hashing at SHA's one/two-block padding boundaries, with
  // NUL, non-BMP characters and lone surrogates handled by TextEncoder/Node.
  for (const size of [0, 1, 55, 56, 63, 64, 65, 119, 120, 127, 128]) checkHash('x'.repeat(size));
  for (const text of ['\0', 'é中文😀', '\ud800', '\udfff']) checkHash(text);
  const utf16 = fc.array(fc.integer({ min: 0, max: 0xffff }), { maxLength: 192 })
    .map((units) => String.fromCharCode(...units));
  fc.assert(fc.property(utf16, checkHash), params(300));
  assert.equal(
    pkceChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'),
    'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
  );
});
