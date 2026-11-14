import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadProject } from '../../../explain/testing.ts';
import { Text } from '../../../src/index.ts';
import type { Mobject, Scene } from '../../../src/index.ts';
import StringLength from './scene.ts';
import { WORDS, apart, byteHex, cutStory, lengths, word } from './model.ts';
import { CELL } from './picture.ts';

test('string-length: the cells, bytes and bars on stage are the model’s, and the regrouped cells are the same cells', async () => {
  const project = await loadProject(StringLength, 'scenes/explainers/string-length');
  assert.equal(project.scenarios.length, 1);
  const hi = apart(word('namaste').text), he = apart(word('shalom').text), seen: string[] = [];
  await new project.scenarios[0]!.Scene({
    skipUntil: Infinity,
    async frame() {},
    async stepEnd(scene: Scene, step: { name: string }) {
      const all = () => scene.familyMembers();
      const part = (key: string): Mobject => {
        const found = all().find((p) => p.key === key);
        assert.ok(found, `${step.name}: no part keyed ${key}`);
        return found;
      };
      const said = (key: string) => { const t = part(key); assert.ok(t instanceof Text, `${key} is text`); return t.text; };
      const keyed = (prefix: string) => all().filter((p) => p.key?.startsWith(prefix)).map((p) => p.key!);
      const x = (key: string) => part(key).center()[0];
      seen.push(step.name);
      if (step.name === 'question') {
        // Three bars on one scale: their lengths are in the ratio of the three counts, and each says its count.
        const widths = [0, 1, 2].map((i) => { const [x0, , x1] = part(`lengths:${i}:bar`).box()!; return x1 - x0; });
        assert.ok(Math.abs(widths[1]! / widths[0]! - hi.points / hi.bytes) < 1e-3 && Math.abs(widths[2]! / widths[0]! - hi.characters / hi.bytes) < 1e-3);
        assert.deepEqual([0, 1, 2].map((i) => said(`lengths:${i}:value`)), [hi.bytes, hi.points, hi.characters].map(String));
        assert.equal(said('word'), hi.text);
      }
      if (step.name === 'points' || step.name === 'bytes') {
        // One cell per code point, left to right in the word's order, each named by its number and kind.
        assert.equal(keyed('cp:hex:').length, hi.points);
        hi.parts.forEach((p, i) => {
          assert.equal(said(`cp:hex:${i}`), p.hex);
          assert.equal(said(`cp:kind:${i}`), p.kind);
          if (i) assert.ok(x(`cp:${i}`) > x(`cp:${i - 1}`));
        });
      }
      if (step.name === 'bytes') {
        // Each code point's bytes stand under its cell, and there are as many boxes as the word has bytes.
        assert.equal(keyed('cp:byte:').filter((k) => k.endsWith(':label')).length, hi.bytes);
        hi.parts.forEach((p, i) => p.bytes.forEach((b, k) => {
          assert.equal(said(`cp:byte:${i}:${k}:label`), byteHex(b));
          assert.ok(Math.abs(x(`cp:byte:${i}:${k}:box`) - x(`cp:${i}`)) < 1e-3);
        }));
      }
      if (step.name === 'characters') {
        // The same six cells: those of one character touch, and characters stand apart.
        hi.parts.forEach((p, i) => {
          if (!i) return;
          const gap = x(`cp:${i}`) - x(`cp:${i - 1}`);
          if (p.cluster === hi.parts[i - 1]!.cluster) assert.ok(Math.abs(gap - CELL) < 1e-3, `cells ${i - 1} and ${i} touch`);
          else assert.ok(gap > CELL + 1, `cells ${i - 1} and ${i} stand apart`);
        });
        assert.equal(all().filter((p) => /^cp:\d+$/.test(p.key ?? '')).length, hi.points);
        assert.deepEqual(hi.read.map((_, k) => said(`read:${k}`)), hi.read);
        assert.equal(keyed('character:').length, hi.characters);
      }
      if (step.name === 'predict') {
        // The Hebrew word's characters, the first at the right; no code point cell is on stage yet.
        he.read.forEach((_, k) => { if (k) assert.ok(x(`he:character:${k}`) < x(`he:character:${k - 1}`)); });
        assert.equal(keyed('he:cp:').length, 0);
        assert.equal(said('word'), he.text);
      }
      if (step.name === 'hebrew') {
        he.parts.forEach((p, i) => {
          assert.equal(said(`he:cp:hex:${i}`), p.hex);
          assert.equal(said(`he:cp:kind:${i}`), p.kind);
          if (i) assert.ok(x(`he:cp:${i}`) < x(`he:cp:${i - 1}`), 'from the right');
        });
      }
      if (step.name === 'table') {
        for (const w of WORDS) {
          const n = lengths(w.text);
          assert.equal(said(`greetings:${w.id}:Word`), w.text);
          assert.deepEqual(['Bytes', 'Code points', 'Characters'].map((h) => said(`greetings:${w.id}:${h}`)), [n.bytes, n.points, n.characters].map(String));
        }
      }
      if (step.name === 'cut') {
        assert.equal(said('cut:bytes'), cutStory(hi.text, 10, 'bytes').text);
        assert.equal(said('cut:points'), cutStory(hi.text, 4, 'points').text);
        assert.equal(said('cut:characters'), cutStory(hi.text, 2, 'characters').text);
      }
    },
  }).run();
  assert.deepEqual(seen, ['question', 'points', 'bytes', 'characters', 'predict', 'hebrew', 'table', 'cut']);
});
