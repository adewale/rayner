import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { erSource, schema } from './model.ts';
import type { Cardinality } from './model.ts';

test('the captured ER diagrams draw each marker at the end it counts', () => {
  // Capture names the marker at the first entity card:<rel>:1 and at the second card:<rel>:2, with
  // Mermaid's category; explain/diagrams.ts reads them the same way for the picture's description.
  const CATEGORY: Record<Cardinality, string> = { 'one-only': 'one', 'zero-or-one': 'zero-one', 'zero-or-many': 'zero-many', 'one-or-many': 'many' };
  const dir = new URL('./scene.snapshots/', import.meta.url);
  type Part = { id: string; shapes: { subpaths: number[][] }[]; channels?: { category?: string } };
  const centre = (p: Part) => {
    const xs: number[] = [],
      ys: number[] = [];
    for (const s of p.shapes) for (const sp of s.subpaths) for (let i = 0; i < sp.length; i += 2) xs.push(sp[i]!), ys.push(sp[i + 1]!);
    return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2, box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] };
  };
  const gap = (pt: { x: number; y: number }, box: number[]) => Math.hypot(Math.max(box[0]! - pt.x, 0, pt.x - box[2]!), Math.max(box[1]! - pt.y, 0, pt.y - box[3]!));
  let seen = 0;
  for (const scenario of ['rfc', 'sabre'] as const) {
    const file = readdirSync(dir).find((f) => f !== 'index.json' && JSON.parse(readFileSync(new URL(f, dir), 'utf8')).spec.source === erSource(scenario));
    assert.ok(file, `no snapshot for the ${scenario} schema`);
    const parts: Part[] = JSON.parse(readFileSync(new URL(file, dir), 'utf8')).parts;
    const get = (id: string) => parts.find((p) => p.id === id)!;
    for (const r of schema(scenario)) {
      const rel = `${r.from}-${r.to}#0`;
      const [one, two] = [get(`card:${rel}:1`), get(`card:${rel}:2`)];
      assert.equal(one.channels?.category, CATEGORY[r.left], `${scenario} ${rel} at ${r.from}`);
      assert.equal(two.channels?.category, CATEGORY[r.right], `${scenario} ${rel} at ${r.to}`);
      const from = centre(get(`entity:${r.from}`)).box,
        to = centre(get(`entity:${r.to}`)).box;
      assert.ok(gap(centre(one), from) < gap(centre(one), to), `${scenario} ${rel}: marker 1 is drawn at ${r.from}`);
      assert.ok(gap(centre(two), to) < gap(centre(two), from), `${scenario} ${rel}: marker 2 is drawn at ${r.to}`);
      seen++;
    }
  }
  assert.equal(seen, 10);
});
