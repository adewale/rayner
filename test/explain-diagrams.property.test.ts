// Property tests for explain/diagrams.ts: a Diagram built from synthetic
// snapshots (test/lib/random-snapshot.ts) must keep its documented promises
// for every diagram, not just the fixtures in explain-emphasis.test.ts.
// Each case builds a diagram on a NullSink scene that skips frames, so plays
// cost their begin/finish only. Counts: test/lib/pbt.ts (FULL=1 is 10x).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Scene, Dot } from '../src/index.ts';
import { NullSink } from '../src/output.ts';
import { loadFonts } from '../explain/testing.ts';
import type { Box, Mobject } from '../src/index.ts';
import { Diagram } from '../explain/diagrams.ts';
import type { PictureNote } from '../explain/diagrams.ts';
import { REGIONS, emphasis, dimOpacity } from '../explain/look.ts';
import type { Region } from '../explain/look.ts';
import { diagramKey, snapshotResolver, useDiagrams } from '../integrations/agentic-mermaid/snapshot.ts';
import type { DiagramSnapshot } from '../explain/index.ts';
import { fc, params } from './lib/pbt.ts';
import { snapshot, hexColor, buildSnapshot, snapshotPlan, uniqueIds, planOf } from './lib/random-snapshot.ts';

await loadFonts();

const region = fc.constantFrom(...(Object.keys(REGIONS) as Region[]));
const anyBox: fc.Arbitrary<Box> = fc
  .tuple(
    fc.double({ min: -8, max: 7, noNaN: true }),
    fc.double({ min: -4.5, max: 4, noNaN: true }),
    fc.double({ min: 0.5, max: 16, noNaN: true }),
    fc.double({ min: 0.5, max: 9, noNaN: true }),
  )
  .map(([x, y, w, h]): Box => [x, y, x + w, y + h]);
const where = fc.oneof(region, anyBox);
const noteText = fc.string({ unit: 'grapheme', minLength: 1, maxLength: 30 });

async function shown(s: DiagramSnapshot, box: Box | Region = 'full', build: 'all' | 'frame' | null = 'all') {
  const scene = new Scene(new NullSink(), { skipUntil: Infinity });
  const d = new Diagram(scene, s.spec, s, { box });
  if (build) await d.build(build);
  return { scene, d };
}
const tops = (d: Diagram) => [...d.parts.values()].filter((p) => !p.info.owner).map((p) => p.info.id);
const allIds = (d: Diagram) => [...d.parts.keys()];
const looks = (d: Diagram) => JSON.stringify([...d.parts].map(([id, p]) => [id, p.mob.family().map((m) => m.style)]));
const within = (inner: Box, outer: Box, eps = 1e-9) =>
  inner[0] >= outer[0] - eps && inner[1] >= outer[1] - eps && inner[2] <= outer[2] + eps && inner[3] <= outer[3] + eps;
const overlaps = (a: Box, b: Box) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
const union = (boxes: Box[]): Box =>
  boxes.reduce((u, b) => [Math.min(u[0], b[0]), Math.min(u[1], b[1]), Math.max(u[2], b[2]), Math.max(u[3], b[3])]);
const links = (d: Diagram) => [...d.parts.values()].filter((p) => !p.info.owner && p.info.from && p.info.to);
/**
 * Each live member's copy in a picture of the diagram drawn without notes: picture() copies the
 * root member for member.
 */
const drawnIn = (d: Diagram, picture: Mobject) => {
  const live = d.root.family(), drawn = picture.family();
  assert.equal(drawn.length, live.length, 'the picture copies the diagram member for member');
  return (m: Mobject) => drawn[live.indexOf(m)]!;
};
/** Every part's styles as a picture draws them. */
const pictureLooks = (d: Diagram, picture: Mobject) => {
  const drawn = drawnIn(d, picture);
  return JSON.stringify([...d.parts].map(([id, p]) => [id, p.mob.family().map((m) => drawn(m).style)]));
};
/** What a view's draw gives a diagram's picture: the parts it marks, in one colour, and the parts its dimming keeps. */
type Drawn = { marks: string[]; color: string; keep: string[] | null };
const drawn = (ids: string[]): fc.Arbitrary<Drawn> => fc.record({ marks: fc.subarray(ids), color: hexColor, keep: fc.option(fc.subarray(ids)) });
const draw = (d: Diagram, p: Drawn, notes: readonly PictureNote[] = []) =>
  d.picture(Object.fromEntries(p.marks.map((id) => [id, p.color])), { dim: p.keep, notes });
/** The part a name names, from what the generator built: its own id, or the part a bare name stands for. */
const named = (s: DiagramSnapshot, id: string) => (s.parts.some((p) => p.id === id) ? id : planOf(s).names.get(id));
/** The top-level part a name names: an owned label belongs to the link that owns it. */
const topOf = (s: DiagramSnapshot, id: string) => {
  let p = s.parts.find((q) => q.id === named(s, id))!;
  while (p.owner) p = s.parts.find((q) => q.id === p.owner)!;
  return p.id;
};

/** A snapshot together with draws that index into its parts, by id or by a bare name. */
const withPicks = <T>(pick: (ids: string[]) => fc.Arbitrary<T>) =>
  snapshot().chain((s) => fc.tuple(fc.constant(s), pick([...s.parts.map((p) => p.id), ...planOf(s).names.keys()])));

test('reading order lists every top-level part exactly once', async () => {
  await fc.assert(
    fc.asyncProperty(snapshot(), async (s) => {
      const { d } = await shown(s, 'full', null);
      assert.deepEqual([...d.order].sort(), tops(d).sort());
    }),
    params(),
  );
});

test('in graph families a node is read just before the links that leave it', async () => {
  await fc.assert(
    fc.asyncProperty(snapshot(), async (s) => {
      fc.pre(['flowchart', 'state', 'mindmap', 'class'].includes(s.family));
      const { d } = await shown(s, 'full', null);
      // A link may name its source by a bare name (a class's 'A' for 'class:A').
      const source = (id: string) => named(s, d.parts.get(id)!.info.from!);
      for (const l of links(d)) {
        const from = source(l.info.id);
        if (!from || !d.parts.has(from)) continue;
        const [at, link] = [d.order.indexOf(from), d.order.indexOf(l.info.id)];
        assert.ok(at < link, `${from} before ${l.info.id}`);
        // Only its other links come between them.
        for (const id of d.order.slice(at + 1, link)) assert.equal(source(id), from, `${id} between ${from} and ${l.info.id}`);
      }
    }),
    params(),
  );
});

test('a built diagram fits inside the box it is shown in', async () => {
  await fc.assert(
    fc.asyncProperty(snapshot(), where, async (s, box) => {
      const { d } = await shown(s, box);
      const frame = typeof box === 'string' ? REGIONS[box] : box;
      for (const id of tops(d)) {
        const b = d.get(id).box();
        if (b) assert.ok(within(b, frame as Box), `${id} ${JSON.stringify(b)} outside ${JSON.stringify(frame)}`);
      }
    }),
    params(),
  );
});

test('a picture marks outlines and links, never labels or owned parts, and leaves the live diagram as it was', async () => {
  await fc.assert(
    fc.asyncProperty(
      withPicks((ids) => fc.subarray(ids)),
      hexColor,
      async ([s, ids], color) => {
        fc.pre(ids.length > 0);
        const { d } = await shown(s);
        const live = looks(d);
        const before = new Map(tops(d).map((id) => [id, d.parts.get(id)!.mob.family().map((m) => ({ ...m.style }))]));
        const drawnAs = drawnIn(d, d.picture(Object.fromEntries(ids.map((id) => [id, color]))));
        assert.equal(looks(d), live, 'drawing a picture changes nothing live');
        for (const id of new Set(ids.map((i) => topOf(s, i)))) {
          const p = d.parts.get(id)!;
          const connector = !!(p.info.from && p.info.to);
          p.mob.family().forEach((m, i) => {
            const b = before.get(id)![i]!;
            const style = drawnAs(m).style;
            let owned = false;
            let text = false;
            for (let a: typeof m | null = m; a && a !== p.mob; a = a.parent) {
              if (a.key != null && a.key !== id) owned = true;
              if (typeof (a as { text?: unknown }).text === 'string') text = true;
            }
            if (owned || text) return assert.deepEqual(style, b, `${id}: labels and owned parts keep their look`);
            if (b.stroke && b.stroke !== 'none' && (b.strokeWidth ?? 0) > 0) assert.equal(style.stroke, color);
            if (connector && b.fill && b.fill !== 'none' && (b.fillOpacity ?? 1) > 0) assert.equal(style.fill, color);
          });
        }
      },
    ),
    params(),
  );
});

type Op = { k: 'picture'; p: Drawn } | { k: 'focus'; ids: string[] | 'all' };
const focusOp = (ids: string[]) =>
  fc.record({ k: fc.constant('focus' as const), ids: ids.length ? fc.oneof(fc.constant('all' as const), fc.subarray(ids, { minLength: 1 })) : fc.constant('all' as const) });
const ops = (ids: string[], focus: boolean): fc.Arbitrary<Op[]> =>
  fc.array(fc.oneof(fc.record({ k: fc.constant('picture' as const), p: drawn(ids) }), ...(focus ? [focusOp(ids)] : [])), { maxLength: 8 });
/** Draw each picture (and throw it away, as a view's sync replaces it) and make each camera move. */
async function apply(d: Diagram, sequence: Op[]) {
  for (const op of sequence) {
    if (op.k === 'picture') draw(d, op.p);
    else await d.focus(op.ids);
  }
}

test('a picture’s look depends only on what it draws and the camera moves before it, not on the pictures drawn before it', async () => {
  await fc.assert(
    fc.asyncProperty(
      withPicks((ids) => fc.tuple(ops(ids, true), drawn(ids))),
      async ([s, [sequence, last]]) => {
        const { d } = await shown(s);
        await apply(d, sequence);
        // The oracle makes only the camera moves, then draws the same picture.
        const { d: oracle } = await shown(s);
        await apply(oracle, sequence.filter((op) => op.k === 'focus'));
        assert.equal(looks(d), looks(oracle), 'pictures drawn before change nothing live');
        assert.equal(pictureLooks(d, draw(d, last)), pictureLooks(oracle, draw(oracle, last)));
      },
    ),
    params(300),
  );
});

test('a picture’s dimming fades exactly the parts outside the kept set, the links between kept parts, and scaffolding', async () => {
  await fc.assert(
    fc.asyncProperty(
      withPicks((ids) => fc.subarray(ids)),
      async ([s, keep]) => {
        const { d } = await shown(s);
        const base = new Map(tops(d).map((id) => [id, d.parts.get(id)!.mob.family().map((m) => m.style.opacity)]));
        const drawnAs = drawnIn(d, d.picture({}, { dim: keep }));
        const kept = new Set(keep.map((id) => topOf(s, id)));
        for (const l of links(d))
          if ([l.info.from!, l.info.to!].every((n) => named(s, n) && kept.has(topOf(s, n)))) kept.add(l.info.id);
        const { scaffold } = planOf(s);
        for (const id of tops(d)) {
          const p = d.parts.get(id)!;
          const faded = !kept.has(id) && !scaffold.has(id);
          p.mob.family().forEach((m, i) =>
            assert.equal(drawnAs(m).style.opacity, faded ? base.get(id)![i]! * dimOpacity(s.palette) : base.get(id)![i]!, `${id} faded=${faded}`),
          );
        }
      },
    ),
    params(),
  );
});

test('forget, after any pictures, leaves every style as built and takes the diagram off the stage', async () => {
  await fc.assert(
    fc.asyncProperty(
      withPicks((ids) => ops(ids, false)),
      async ([s, sequence]) => {
        const { d } = await shown(s);
        const before = looks(d);
        await apply(d, sequence);
        d.forget();
        assert.equal(looks(d), before);
        assert.equal(d.visible.size, 0);
        assert.equal(d.root.children.length, 0);
      },
    ),
    params(300),
  );
});

test('hide fades out the picture that shows the diagram, its notes with it; reveal then draws it as if freshly built', async () => {
  await fc.assert(
    fc.asyncProperty(
      withPicks((ids) => fc.tuple(drawn(ids), fc.subarray(ids))),
      async ([s, [p, noted]]) => {
        const { scene, d } = await shown(s);
        const before = looks(d);
        // Shown by its picture, as stage.diagramView shows it.
        const picture = draw(d, p, noted.map((id) => ({ id, text: 'n' })));
        scene.remove(d.root);
        scene.add(picture);
        d.showBy(picture);
        await d.hide();
        const present = new Set(scene.familyMembers());
        assert.ok(tops(d).every((id) => !present.has(d.get(id))), 'no part left on stage');
        assert.ok(!present.has(picture), 'the picture and its notes are gone');
        assert.equal(looks(d), before);
        await d.reveal('rest');
        assert.equal(looks(d), looks((await shown(s)).d));
      },
    ),
    params(300),
  );
});

/** Hops along links that exist (each hop's first matching link is the one walked). */
const hops = (s: DiagramSnapshot) => {
  const pairs = s.parts.filter((p) => p.from && p.to && !p.owner).map((p) => [p.from!, p.to!] as [string, string]);
  return pairs.length ? fc.array(fc.constantFrom(...pairs), { minLength: 1, maxLength: 5 }) : fc.constant([]);
};
const walkSnapshot = snapshot().chain((s) => fc.tuple(fc.constant(s), hops(s)));
/** Walks recorded so far (revealing a message records its walk too, so tests read the ones after a point). */
const walks = (scene: Scene) => (scene.describe().walks ?? []) as { edge: string; from: string; to: string }[];

test('walk, one after another or in parallel, records each hop in order on the link it travelled, and leaves no token behind', async () => {
  await fc.assert(
    fc.asyncProperty(walkSnapshot, fc.boolean(), async ([s, path], parallel) => {
      const { scene, d } = await shown(s);
      const built = walks(scene).length;
      await d.walk(path, { parallel });
      const first = (from: string, to: string) => s.parts.find((p) => p.from === from && p.to === to)!.id;
      assert.deepEqual(
        walks(scene).slice(built).map((w) => [w.from, w.to, w.edge]),
        path.map(([from, to]) => [from, to, first(from, to)]),
      );
      assert.ok(!scene.familyMembers().some((m) => m instanceof Dot), 'tokens fade out');
    }),
    params(),
  );
});

test('a picture of a walk’s trail draws every travelled link in the trail colour, said as travelled', async () => {
  await fc.assert(
    fc.asyncProperty(walkSnapshot, hexColor, async ([s, path], color) => {
      const { d } = await shown(s);
      const trail = d.trail(path, color);
      const drawnAs = drawnIn(d, d.picture(trail));
      for (const [from, to] of path) {
        const id = s.parts.find((p) => p.from === from && p.to === to)!.id;
        assert.deepEqual(trail[id], { color, as: 'travelled' });
        const edge = d.parts.get(id)!;
        // The link's own strokes: not its route, not a label it owns, not its words.
        const own = edge.mob.family().filter((m) => m.parent === edge.mob && m !== edge.route && m.key == null && typeof (m as { text?: unknown }).text !== 'string');
        for (const m of own)
          if (m.style.stroke !== 'none' && (m.style.strokeWidth ?? 0) > 0) assert.equal(drawnAs(m).style.stroke, color);
      }
    }),
    params(),
  );
});

test('walk rejects a hop that is not a link before anything moves or is recorded', async () => {
  await fc.assert(
    fc.asyncProperty(
      walkSnapshot.chain(([s, path]) =>
        fc.tuple(fc.constant(s), fc.constant(path), fc.nat({ max: path.length }), fc.string(), fc.string()),
      ),
      async ([s, path, at, from, to]) => {
        // A link's ends are bare names; a hop may name them by those or by the parts they stand for.
        const end = (n: string) => named(s, n) ?? n;
        fc.pre(!s.parts.some((p) => p.from && p.to && end(p.from) === end(from) && end(p.to) === end(to)));
        const { scene, d } = await shown(s);
        const before = looks(d),
          built = walks(scene).length;
        const bad = [...path.slice(0, at), [from, to] as [string, string], ...path.slice(at)];
        await assert.rejects(d.walk(bad), /is not a real link/);
        assert.throws(() => d.trail(bad), /is not a real link/);
        assert.equal(walks(scene).length, built);
        assert.equal(looks(d), before);
      },
    ),
    params(),
  );
});

test('walk rejects a link that has not been revealed', async () => {
  await fc.assert(
    fc.asyncProperty(walkSnapshot, async ([s, path]) => {
      fc.pre(path.length > 0);
      const { d } = await shown(s, 'full', 'frame');
      await assert.rejects(d.walk(path), /reveal [^]* first/);
    }),
    params(),
  );
});

test("focus on any parts, then focus('all'), returns the diagram to its home frame and its home styles", async () => {
  await fc.assert(
    fc.asyncProperty(
      withPicks((ids) => fc.array(ids.length ? fc.subarray(ids, { minLength: 1 }) : fc.constant([] as string[]), { minLength: 1, maxLength: 3 })),
      fc.double({ min: 0.25, max: 4, noNaN: true }),
      where,
      async ([s, focuses], zoom, box) => {
        const { d } = await shown(s, box);
        const boxes = () => tops(d).map((id) => d.get(id).box()).filter((b): b is Box => !!b);
        fc.pre(boxes().length > 0);
        const home = union(boxes()),
          styles = looks(d);
        const span = (b: Box) => Math.max(b[2] - b[0], b[3] - b[1]);
        let far = 0;
        for (const ids of focuses) {
          await d.focus(ids, { zoom });
          far = Math.max(far, ...union(boxes()).map(Math.abs));
        }
        const zoomed = span(union(boxes())) / span(home);
        await d.focus('all');
        const now = union(boxes());
        // Points are stored as float32. Each camera move rounds every point several times (scale,
        // shift, the transform's landing, the measured bounds the way back is computed from), at the
        // magnitude the points reach while zoomed; the way back divides that error by the zoom. The
        // budget is 64 such half-ulps per move: measured worst cases use about 25.
        const eps = 2 ** -24 * 64 * (focuses.length + 1) * (far / zoomed + Math.max(1, ...home.map(Math.abs)));
        now.forEach((v, i) => assert.ok(Math.abs(v - home[i]!) <= eps, `${now} vs ${home}`));
        // Stroke widths and dashes followed the camera; at home they are exactly the authored ones.
        assert.equal(looks(d), styles);
      },
    ),
    params(300),
  );
});

test('under focus, stroke widths and dash lengths scale with the artwork', async () => {
  const lengths = (d: Diagram) =>
    tops(d).flatMap((id) => d.get(id).family().map((m) => [m.style.strokeWidth ?? 0, ...(m.style.dashArray ?? '').split(/[ ,]+/).filter(Boolean).map(Number)]));
  await fc.assert(
    fc.asyncProperty(
      withPicks((ids) => (ids.length ? fc.subarray(ids, { minLength: 1 }) : fc.constant([] as string[]))),
      fc.double({ min: 0.25, max: 4, noNaN: true }),
      where,
      async ([s, ids], zoom, box) => {
        fc.pre(ids.length > 0);
        const { d } = await shown(s, box);
        const span = () => {
          const u = union(tops(d).map((id) => d.get(id).box()).filter((b): b is Box => !!b));
          return Math.max(u[2] - u[0], u[3] - u[1]);
        };
        const [before, home] = [lengths(d), span()];
        fc.pre(home > 1e-3);
        await d.focus(ids, { zoom });
        const k = span() / home;
        lengths(d).forEach((now, i) =>
          now.forEach((v, j) => {
            const want = before[i]![j]! * k;
            assert.ok(Math.abs(v - want) <= 1e-3 * want + 1e-9, `length ${j} of member ${i}: ${v}, want ${want} (k ${k})`);
          }),
        );
      },
    ),
    params(),
  );
});

test('focus on no parts is refused, and moves nothing', async () => {
  await fc.assert(
    fc.asyncProperty(snapshot(), async (s) => {
      const { d } = await shown(s);
      const before = JSON.stringify(tops(d).map((id) => d.get(id).box()));
      await assert.rejects(d.focus([]), /at least one part/);
      assert.equal(JSON.stringify(tops(d).map((id) => d.get(id).box())), before);
    }),
    params(),
  );
});

test('focus refuses a zoom that is not a positive number, and moves nothing', async () => {
  await fc.assert(
    fc.asyncProperty(withPicks((ids) => (ids.length ? fc.subarray(ids, { minLength: 1 }) : fc.constant(['none'] as string[]))), fc.oneof(fc.constantFrom(0, -0, NaN, Infinity, -Infinity), fc.double({ max: 0 })), async ([s, ids], zoom) => {
      fc.pre(s.parts.length > 0);
      const { d } = await shown(s);
      const before = JSON.stringify(tops(d).map((id) => d.get(id).box()));
      await assert.rejects(d.focus(ids, { zoom }), /zoom must be a positive number/);
      assert.equal(JSON.stringify(tops(d).map((id) => d.get(id).box())), before);
    }),
    params(),
  );
});

test('focus centres the chosen parts in the frame', async () => {
  await fc.assert(
    fc.asyncProperty(withPicks((ids) => (ids.length ? fc.subarray(ids, { minLength: 1 }) : fc.constant([] as string[]))), fc.double({ min: 0.25, max: 4, noNaN: true }), where, async ([s, ids], zoom, box) => {
      fc.pre(ids.length > 0);
      const { d } = await shown(s, box);
      await d.focus(ids, { zoom });
      const [x0, y0, x1, y1] = union(ids.map((id) => d.get(id).box()!));
      const f = d.frameBox;
      const tol = 2 ** -24 * 64 * Math.max(1, ...[x0, y0, x1, y1, ...f].map(Math.abs));
      assert.ok(Math.abs((x0 + x1) / 2 - (f[0] + f[2]) / 2) <= tol && Math.abs((y0 + y1) / 2 - (f[1] + f[3]) / 2) <= tol);
    }),
    params(),
  );
});

test('a note keeps its size through any focus', async () => {
  await fc.assert(
    fc.asyncProperty(withPicks((ids) => fc.tuple(fc.constantFrom(...(ids.length ? ids : ['none'])), fc.array(ids.length ? fc.subarray(ids, { minLength: 1 }) : fc.constant(['none'] as string[]), { minLength: 1, maxLength: 3 }))), noteText, async ([s, [id, focuses]], text) => {
      fc.pre(s.parts.some((p) => p.id === id));
      const { d } = await shown(s);
      // A view redraws its notes at each sync: one drawn while zoomed, or back home, is the same size.
      const size = () => {
        const note = d.notePicture(id, text);
        return [note.width(), note.height()];
      };
      const [w, h] = size();
      const same = () => {
        const [nw, nh] = size();
        assert.ok(Math.abs(nw! - w!) < 1e-5 && Math.abs(nh! - h!) < 1e-5);
      };
      for (const f of focuses) {
        await d.focus(f);
        same();
      }
      await d.focus('all');
      same();
    }),
    params(300),
  );
});

test("focus('all') on a diagram with nothing drawn is a no-op", async () => {
  await fc.assert(
    fc.asyncProperty(snapshotPlan, async (plan) => {
      const s = buildSnapshot({ ...plan, nodes: [], links: [], frame: null });
      const { d } = await shown(s);
      await d.focus('all');
      assert.equal(d.root.children.length, 0);
    }),
    params(),
  );
});

const side = fc.constantFrom('above' as const, 'below' as const, 'left' as const, 'right' as const);

test('a note stays inside the diagram frame whenever it fits there', async () => {
  await fc.assert(
    fc.asyncProperty(
      withPicks((ids) => fc.constantFrom(...(ids.length ? ids : ['none']))),
      noteText,
      side,
      where,
      async ([s, id], text, at, box) => {
        fc.pre(s.parts.some((p) => p.id === id));
        const { d } = await shown(s, box);
        const note = d.notePicture(id, text, { side: at });
        const f = d.frameBox,
          b = note.box()!;
        fc.pre(b[2] - b[0] + 0.1 <= f[2] - f[0] && b[3] - b[1] + 0.1 <= f[3] - f[1]);
        assert.ok(within(b, f), `${JSON.stringify(b)} outside ${JSON.stringify(f)}`);
      },
    ),
    params(),
  );
});

test('a note avoids its part whenever one of the sides it tries has room', async () => {
  const OPPOSITE = { above: 'below', below: 'above', left: 'right', right: 'left' } as const;
  await fc.assert(
    fc.asyncProperty(
      withPicks((ids) => fc.constantFrom(...(ids.length ? ids : ['none']))),
      noteText,
      side,
      where,
      async ([s, id], text, at, box) => {
        fc.pre(s.parts.some((p) => p.id === id));
        const { d } = await shown(s, box);
        const part = d.get(id).box()!;
        const note = d.notePicture(id, text, { side: at });
        const [w, h] = [note.width(), note.height()],
          f = d.frameBox;
        // Room with a margin wider than any gap the placement uses, so this does not restate it.
        const m = 0.25;
        const room = {
          above: f[3] - part[3] >= h + m && f[2] - f[0] >= w + m,
          below: part[1] - f[1] >= h + m && f[2] - f[0] >= w + m,
          left: part[0] - f[0] >= w + m && f[3] - f[1] >= h + m,
          right: f[2] - part[2] >= w + m && f[3] - f[1] >= h + m,
        };
        fc.pre([at, OPPOSITE[at], 'above', 'below'].some((k) => room[k as keyof typeof room]));
        assert.ok(!overlaps(note.box()!, part), `note ${JSON.stringify(note.box())} on its part ${JSON.stringify(part)}`);
      },
    ),
    params(),
  );
});

test('get finds every part by its id and rejects names that are not parts', async () => {
  await fc.assert(
    fc.asyncProperty(snapshot(), fc.string(), async (s, name) => {
      const { d } = await shown(s, 'full', null);
      for (const p of s.parts) assert.equal(d.get(p.id), d.parts.get(p.id)!.mob);
      // A participant's or a class's bare name names its part.
      for (const [bare, id] of planOf(s).names) if (!s.parts.some((p) => p.id === bare)) assert.equal(d.get(bare), d.get(id));
      if (!named(s, name)) assert.throws(() => d.get(name), /No diagram mark/);
    }),
    params(),
  );
});

test('reveal(n) shows exactly the next n pending parts in reading order', async () => {
  await fc.assert(
    fc.asyncProperty(snapshot(), fc.array(fc.nat({ max: 4 }), { maxLength: 4 }), async (s, counts) => {
      const { d } = await shown(s, 'full', 'frame');
      for (const n of counts) {
        const pending = d.order.filter((id) => !d.visible.has(id));
        const expected = new Set([...d.visible, ...pending.slice(0, n)]);
        for (const p of d.parts.values()) if (p.info.owner && expected.has(topOf(s, p.info.id))) expected.add(p.info.id);
        await d.reveal(n);
        assert.deepEqual([...d.visible].sort(), [...expected].sort());
      }
    }),
    params(),
  );
});

test('reveal rejects a count that is not a non-negative integer, revealing nothing', async () => {
  await fc.assert(
    fc.asyncProperty(
      snapshot(),
      fc.oneof(fc.integer({ max: -1 }), fc.double().filter((n) => !Number.isInteger(n) || n < 0)),
      async (s, n) => {
        const { d } = await shown(s, 'full', 'frame');
        const before = [...d.visible];
        await assert.rejects(d.reveal(n), /non-negative integer/);
        assert.deepEqual([...d.visible], before);
      },
    ),
    params(),
  );
});

test('morph hands over to the next diagram: every part shown, at its fresh place, with focus reset', async () => {
  await fc.assert(
    fc.asyncProperty(
      withPicks((ids) => ops(ids, true)),
      snapshot('next'),
      where,
      async ([s, sequence], next, box) => {
        const { scene, d } = await shown(s, box);
        useDiagrams(scene, snapshotResolver({ [diagramKey(next.spec)]: next }));
        await apply(d, sequence);
        await d.morph(next.spec);
        const fresh = new Diagram(new Scene(new NullSink()), next.spec, next, { box: d.frameBox });
        assert.deepEqual([...d.visible].sort(), [...d.parts.keys()].sort());
        assert.deepEqual([...d.parts.keys()], next.parts.map((p) => p.id));
        assert.ok(!d.describe().parts.some((p) => p.mark === 'focused'), 'nothing is in focus');
        assert.equal(looks(d), looks(fresh));
        for (const id of tops(d)) assert.deepEqual(d.get(id).box(), fresh.get(id).box(), id);
        // The next style brings its own emphasis colour.
        assert.equal(d.accent, emphasis(next.palette));
      },
    ),
    params(300),
  );
});

test('a part revealed under focus arrives in the current look, and pictures draw it as if it had been there', async () => {
  await fc.assert(
    fc.asyncProperty(
      withPicks((ids) => fc.tuple(ops(ids, true), drawn(ids))),
      async ([s, [sequence, last]]) => {
        const late = await shown(s, 'full', 'frame');
        await apply(late.d, sequence);
        await late.d.reveal('rest');
        const early = await shown(s);
        await apply(early.d, sequence);
        assert.equal(looks(late.d), looks(early.d));
        assert.equal(pictureLooks(late.d, draw(late.d, last)), pictureLooks(early.d, draw(early.d, last)));
      },
    ),
    params(300),
  );
});

test("build('frame') shows exactly the scaffolding, and build('all') everything", async () => {
  await fc.assert(
    fc.asyncProperty(snapshot(), async (s) => {
      const { d } = await shown(s, 'full', 'frame');
      const scaffold = tops(d).filter((id) => planOf(s).scaffold.has(id));
      assert.deepEqual(tops(d).filter((id) => d.visible.has(id)).sort(), scaffold.sort());
      await d.build('all');
      assert.deepEqual([...d.visible].sort(), allIds(d).sort());
    }),
    params(),
  );
});

test('visible parts are drawn in snapshot order, each with its owned labels', async () => {
  await fc.assert(
    fc.asyncProperty(snapshot(), fc.array(fc.nat({ max: 3 }), { maxLength: 4 }), async (s, counts) => {
      const { d } = await shown(s, 'full', 'frame');
      for (const n of counts) {
        await d.reveal(n);
        for (const id of d.visible) for (const p of d.parts.values()) if (p.info.owner === id) assert.ok(d.visible.has(p.info.id));
        // By part id: a part's key is its id, but the frame's, which is keyed by its diagram.
        const drawn = d.root.children.map((m) => [...d.parts].find(([, p]) => p.mob === m)?.[0]);
        const index = (id: string) => s.parts.findIndex((p) => p.id === id);
        assert.deepEqual(drawn, tops(d).filter((id) => d.visible.has(id)).sort((a, b) => index(a) - index(b)));
      }
    }),
    params(),
  );
});

test('a gitgraph reads left to right', async () => {
  await fc.assert(
    fc.asyncProperty(snapshot(), async (s) => {
      const { d } = await shown({ ...s, family: 'gitgraph' }, 'full', null);
      const x = d.order.map((id) => d.get(id).center()[0]);
      for (let i = 1; i < x.length; i++) assert.ok(x[i]! >= x[i - 1]!);
    }),
    params(),
  );
});

test('a picture refuses to mark, dim to or note an unknown part, and changes nothing', async () => {
  await fc.assert(
    fc.asyncProperty(withPicks((ids) => fc.subarray(ids)), fc.string(), fc.constantFrom('marks', 'dim', 'notes'), async ([s, ids], name, how) => {
      const { d } = await shown(s);
      fc.pre(!named(s, name));
      const before = looks(d);
      const bad = [...ids, name];
      assert.throws(
        () =>
          how === 'marks' ? d.picture(Object.fromEntries(bad.map((id) => [id, '#ff0000'])))
          : how === 'dim' ? d.picture({}, { dim: bad })
          : d.picture({}, { notes: bad.map((id) => ({ id, text: 'n' })) }),
        /No diagram mark/,
      );
      assert.equal(looks(d), before);
    }),
    params(),
  );
});

test('scale probe: a diagram of 1,800 parts with 600 outlined labels builds, is pictured, focuses and walks', { timeout: 120_000 }, async () => {
  const nodes = Array.from({ length: 600 }, (_, i) => ({
    id: 'n' + i,
    x: (i % 40) * 0.5,
    y: -Math.floor(i / 40) * 0.5,
    w: 0.3,
    h: 0.2,
    style: { fill: '#334455', stroke: '#aabbcc', strokeWidth: 0.02, fillOpacity: 1, strokeOpacity: 1, opacity: 1 },
    label: {
      text: 'n' + i,
      style: { fill: '#ffffff', stroke: 'none', strokeWidth: 0, fillOpacity: 1, strokeOpacity: 1, opacity: 1 },
      anchor: 'middle' as const,
      baseline: 'middle' as const,
      width: true,
      rotated: false,
    },
    value: i,
  }));
  const linksPlan = Array.from({ length: 1200 }, (_, i) => ({
    from: i % 600,
    to: (i * 7 + 1) % 600,
    line: { fill: 'none', stroke: '#aabbcc', strokeWidth: 0.02, fillOpacity: 1, strokeOpacity: 1, opacity: 1 },
    head: null,
    label: null,
  }));
  const s = buildSnapshot({
    family: 'flowchart',
    width: 2000,
    height: 800,
    nodes,
    links: linksPlan,
    frame: null,
    palette: { paper: '#000000', ink: '#ffffff', accent: '#ff8800', muted: '#888888' },
  });
  assert.ok(uniqueIds(s) && s.parts.length === 1800);
  const t = performance.now();
  const { scene, d } = await shown(s);
  const picture = d.picture({ n1: d.accent, n2: d.accent, ...d.trail([['n0', 'n1']]) }, { dim: ['n1'], notes: [{ id: 'n3', text: 'here' }] });
  await d.focus(['n5']);
  await d.focus('all');
  await d.walk([['n0', 'n1']]);
  scene.remove(d.root);
  scene.add(picture);
  d.showBy(picture);
  await d.hide();
  assert.equal(d.visible.size, 0);
  assert.ok(!scene.familyMembers().some((m) => m instanceof Dot));
  const seconds = (performance.now() - t) / 1000;
  assert.ok(seconds < 30, `1800 parts took ${seconds.toFixed(1)}s`);
});

// Keep the generator honest: it must reach what the importer writes (see test/lib/random-snapshot.ts).
test('the snapshot generator reaches every shape the importer writes', () => {
  const seen = new Set<string>();
  // Explicit covering plans make support coverage deterministic; product properties above
  // still generate arbitrary plans and shrink their failures.
  for (const family of ['flowchart', 'state', 'class', 'mindmap', 'sequence', 'gitgraph', 'xychart', 'er']) {
    for (const anchor of ['start', 'middle', 'end'] as const) {
      const style = { fill: '#fff', stroke: '#000', strokeWidth: 0.01, dashArray: '0.1 0.1' };
      const label = { text: 'label', style, anchor, baseline: 'middle' as const, width: true, rotated: true };
      const p = {
        family, width: 400, height: 200, frame: style,
        palette: { paper: '#fff', ink: '#000', accent: '#f00', muted: '#777' },
        nodes: [0, 1].map((i) => ({ id: `n${i}`, x: i * 2, y: 0, w: 1, h: 1, style, label, value: i + 1 })),
        links: [{ from: 0, to: 0, line: style, head: style, label },
          { from: 0, to: 1, line: style, head: style, label }, { from: 0, to: 1, line: style, head: style, label }],
      };
        const s = buildSnapshot(p);
        const shapes = s.parts.flatMap((x) => x.shapes);
        const run = shapes.flatMap((x) => (x.textRun ? [x.textRun] : []));
        if (s.parts.some((x) => x.id.startsWith('edge-label:') && x.owner)) seen.add('edge label');
        if (s.parts.some((x) => x.id.startsWith('rel-label:') && x.owner)) seen.add('relationship label');
        if (s.parts.some((x) => x.from && x.from === x.to)) seen.add('self');
        if (s.parts.some((x) => /#1$/.test(x.id))) seen.add('parallel');
        if (s.parts.some((x) => x.id === '__frame')) seen.add('frame');
        if (s.parts.some((x) => x.role === 'message' && x.shapes.some((y) => y.textRun))) seen.add('worded message');
        for (const prefix of ['actor:', 'lifeline:', 'class:', 'bar:', 'axis:', 'grid:', 'branch:'])
          if (s.parts.some((x) => x.id.startsWith(prefix))) seen.add(prefix);
        if (planOf(s).names.size) seen.add('bare names');
        if (shapes.some((x) => x.style.dashArray)) seen.add('dashes');
        for (const r of run) {
          seen.add(`anchor ${r.anchor}`);
          if (r.baseline) seen.add(`baseline ${r.baseline}`);
          if (r.width != null) seen.add('width');
          if (r.matrix[1] !== 0) seen.add('rotated');
        }
    }
  }

  assert.deepEqual([...seen].sort(), [
    'actor:', 'anchor end', 'anchor middle', 'anchor start', 'axis:', 'bar:', 'bare names', 'baseline middle', 'branch:', 'class:', 'dashes',
    'edge label', 'frame', 'grid:', 'lifeline:', 'parallel', 'relationship label', 'rotated', 'self', 'width', 'worded message',
  ]);
});
