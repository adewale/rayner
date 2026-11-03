# Matching transforms

`Transform` pairs the two families by position: the source's third leaf morphs
into the target's third leaf, whatever they are. When the two sides share
pieces (a word that grows a letter, code with a line inserted, a diagram that
keeps two of its nodes), pair the pieces by what they are instead:

```js
import { Text, Code, TransformMatchingText, TransformMatchingShapes, TransformMatching } from 'rayner';

// Five letters stay where they are, a d grows in
await this.play(new TransformMatchingText(new Text('cache'), new Text('cached')));
// Shared nodes travel, the rest fade
await this.play(new TransformMatchingShapes(oldDiagram, newDiagram));
// Your own key
await this.play(new TransformMatching(before, after, { key: (part) => part.style.fill }));
```

## Which key

| | pairs parts that | use for |
|---|---|---|
| `TransformMatchingText` | are the same character in the same font and weight; anything else by shape. In an explainer with outline lettering, the same whole cluster drawn with the same number of glyphs ([lettering](LETTERING.md#changes-between-strings)) | `Text`, `Code`, groups of them |
| `TransformMatchingShapes` | have the same `shapeKey()`: same path up to position and size | diagrams, symbols, anything drawn |
| `TransformMatching` + `key` | map to the same string (`undefined` never matches) | identity you know: a node id, a color, a role |
| `TransformMatching` + `matchByKey({ fallback?, text? })` | sit at the same place inside containers with the same `mobject.key` | keyed cells, labels and nodes that move as units ([below](#keyed-components)) |

A part is one drawable piece: a visible `VMobject` with points of its own (a
glyph, an arrow's line or tip, a node's box). Containers are not parts; a
`Text`'s advance box is not a part. A key function receives the part and the
picture it belongs to (the transform's source or target), so it can stop
reading ancestors at that root.

## Keyed components

A picture rebuilt from state names what persists by giving a container a
`key`: a table cell `cell:${z}`, a state node `state:${id}`. `matchByKey()`
pairs every part under a keyed container with the part at the same place under
the container of the same key on the other side, so the cell is kept as one
component wherever it moves and its own parts morph inside it. A keyed part
(a lone `Rectangle` with a key) pairs by its own key. The nearest key wins when
keyed containers nest. A key two containers share pairs by distance, like any
repeated key.

A keyed `Text` whose words change needs a decision, and `text` makes it. By
place (the default), its glyphs morph place by place and a glyph with no
counterpart fades inside it: right for a readout whose digits change. Whole,
it pairs only with a `Text` of the same key and the same words, so a renamed
state or event fades out and the new name fades in: right where the words are
the identity. `statecharts` uses `text: 'whole'`.

```js
import { TransformMatching, matchByKey } from 'rayner';
await this.play(new TransformMatching(before, after, { key: matchByKey() }));
// A relabelled node's old name fades and the new one grows in
machine.sync({ match: matchByKey({ text: 'whole' }) });
// Keyed cells keep their identity; the same word elsewhere stays put instead of fading
table.sync({ match: matchByKey({ fallback: (part) => part.parent instanceof Text ? `${part.parent.text}@${where(part.parent)}` : undefined }) });
```

`mobject.find(key)` and `scene.find(key)` return the first part with a key,
depth first in drawing order; `findAll(key or test)` returns every one. Use
them, rather than walking `family()` or `children`, so the parts a scene
addresses are the same ones matching, invariants and reviews address.

What is under no key below the root pairs by the `fallback`, and by default
not at all: it fades out and in, as a label that is new or gone should. Pass a
fallback to keep unkeyed parts that are the same thing in the same place
(`periodic-groups` keys them by their words or size and position). The root's
own key, and keys above it, are never read: they would make every part one
component and reduce the morph to matching by index. `View.sync({ match: 'keys' })`
is `matchByKey()` with the defaults ([views](VIEWS.md#match)). This is the
morph the [live machine](https://github.com/adewale/rayner/issues/88) needs
for a reader-driven redraw: the parts that stay keep their identity.

## How parts pair

- A key that occurs once on each side pairs outright.
- A key that repeats pairs so the total squared distance travelled is least.
  A row of equal boxes that moves as a whole keeps its order; nearest-first
  pairing would swap the ends.
- `ordered: true` (on by default for text) pairs runs of consecutive equal keys
  first, longest first, in reading order, like manim's
  `TransformMatchingStrings`. Lines are then matched by where their glyphs
  went, and a leftover letter pairs only within its own line, so stray letters
  do not fly across the code.

## What unmatched parts do

- A source part with no partner shrinks to a point and fades out; a target part
  with no partner grows from a point and fades in. Both are carried with the
  matched parts of their line (the line's move and font-size change), so a new
  letter grows beside its neighbours and travels with them.
- In `TransformMatchingText` a removed glyph also ends inside the line it
  becomes, an added glyph starts inside the line it joins, and a glyph whose
  lagged share has not started rides with its line, so each line stays one
  piece for the motion verifier (`test/matching-motion.test.ts`). With a
  `lagRatio` above about 0.25 and large rearrangements, matched glyphs that
  cross a line can still report a teleport in a few frames.
- `fadeMismatches: false` morphs the unmatched parts into each other instead,
  by index, as manim's `transform_mismatches` does; only the surplus fades.

New parts live in the source while the animation plays: copies of them are
added to the source's line their target line corresponds to, or to a bare copy
of the target line when the line is new. play() sees one mobject, and every
line stays one piece. With `replace: true` (the default) the scene holds the
target afterwards. With `replace: false` the source stays, showing the target:
faded parts left in it invisible, new copies attached, its `text` unchanged.

## What it reports

After `begin()` (that is, once played):

- `summary()`: `{ matched, morphed, removed, added }`, counts.
- `pairs`, `morphed`: `[sourcePart, targetPart]` in source order; `removed`:
  source parts; `added`: target parts (the originals; their copies are
  `fadesIn[i].sub`).

Every part of either side is in exactly one of these. Invisible parts
(opacity 0, such as what an earlier transform left behind) take no part.

## Same shape

`VMobject.shapeKey()` is equal for two paths with the same subpaths (point
counts and closed flags) whose points coincide once each is centered and
scaled so its larger side is 1, to a grid cell of about 1.6% of that side.
Same path, not same outline: a square drawn from another corner, or one that
an earlier `Transform` subdivided, is another shape.

The grid pitch is irrational. With a decimal or binary pitch, common values
(half a side, an eighth, ratios of integer font units) sit exactly on a cell
boundary, and Float32 noise from moving the shape decides which way they round:
50 steps per side split 8% of moved copies from their originals, 100 steps
0.04%. With the irrational pitch a moved copy always shares its original's
key; a scaled copy can still split when a point lands on a grid-cell
boundary, about 0.02% of copies.

## Relation to manim

- `TransformMatchingShapes` follows manim's (`Mobject.has_same_shape_as`:
  centered, height 1, 1% tolerance). `test/manim.test.ts` holds `shapeKey()` to
  it on a set of shapes, extracted from the pinned checkout. Differences:
  a grid instead of a tolerance (a key must be a string); scaled by the larger
  side, where manim's height-1 scaling divides by zero on a horizontal line;
  closed flags count; and among several same-shaped parts manim pairs the
  first it finds, here the nearest.
- `TransformMatchingText` follows `TransformMatchingStrings`/`TransformMatchingTex`
  (longest matching substrings first), on glyphs.
- manim fades unmatched parts toward the other side's center; here they stay
  with their line.
- Run time is 1 s, like every Lantern transform (manim: 2 s).

## Invariants

- The pairing and every endpoint are fixed in `begin()`; each frame is a pure
  function of alpha, so seeking renders the frame a full run renders
  (`test/matching.test.ts`, which also runs the motion verifier).
- The target is never modified. The source is, as `Transform`'s alignment
  modifies it: matched parts gain curves, new copies are attached.
- `TransformMatchingText` scans both texts once per matching run it finds, so
  `begin()` is O(runs·N·M). One edit costs little: 42 ms at begin for 40 lines
  of code, 90 ms for 80. Scattered edits (a change on every line) leave many
  short runs: 0.3 s for 40 lines, 1.2 s for 80. Prefer `TransformDiff` for
  code (36 ms and 168 ms for the same edits). Frames cost what a `Transform`
  of the same parts costs. A key repeated by hundreds of parts is the other
  expensive case (600 alike parts: 100 ms at begin).

## Diff-driven

For a code change, what stayed and what changed is not a guess about shapes:
it is the diff. `TransformDiff` takes the pairing from it, so the animation
cannot show a change the diff does not contain.

```js
import { Code, TransformDiff, diffLines, parseUnifiedDiff } from 'rayner';

await this.play(new TransformDiff(before, after));                       // hunks from diffLines
await this.play(new TransformDiff(before, after, { hunks: parseUnifiedDiff(patch) }));   // the author's diff
```

- **Unchanged lines** (outside the hunks, and context lines) pair glyph for
  glyph with the line the hunks say they became, so each travels whole and
  ends exactly on the after block's line.
- **Rewritten lines.** In a hunk, each removed line pairs with the added line
  most like it, in order (an LCS over the hunk's lines, scored by shared token
  characters; a pair needs half of both lines' non-space characters in
  shared tokens). Their shared tokens' glyphs pair character for character
  (`diffTokens`, addressed through `code.span(line, from, to)`); the rest of
  the two lines fades out and grows in. `return db.get(id)` ->
  `const row = await db.get(id)` keeps its call and swaps the words around it.
- **Removed and added lines** fade out in place and grow in place.
- Nothing pairs across lines the diff does not relate: no stray glyph flies
  from one line to another, so each line stays one piece for the motion
  verifier. A glyph that grows in (or fades out) beyond the old (or new)
  extent of its rewritten line starts (or ends) at the line's nearest edge,
  so the line grows smoothly rather than jumping on the first frame.

It is a `TransformMatching` whose key is that pairing: `pairs`, `removed`,
`added`, `summary()`, `replace` and seeking work as above, and `plan` says
what each line did (`same`, `changed`, `removed`, `added`, by index).

### Hunks are the truth

`hunks` (unified-diff shape: `oldStart`, `oldLines`, `newStart`, `newLines`,
then `ops` and `lines`, one per line of the hunk: `'='` context, `'-'`, `'+'`)
default to `diffLines(before, after)`: a line LCS with the common head and tail
trimmed, deletions before insertions, no context. On an edit with one minimal
diff that is exactly what git prints (`test/diff.test.ts` holds it to
`git diff --no-index --unified=0` on random edits). Where several diffs are
minimal (repeated lines: braces, blank lines), git may place a hunk elsewhere;
so do patience and histogram diffs. To animate the diff a reviewer sees,
hand it in:

```js
// git diff --no-index --unified=0 before.ts after.ts > change.patch (any context size works)
const hunks = parseUnifiedDiff(readFileSync('change.patch', 'utf8'));   // at build time, checked in
await this.play(new TransformDiff(before, after, { hunks }));
```

Given hunks are used as they are, even where `diffLines` would differ. They
must describe the two texts: begin() throws, naming the hunk and the line,
when a removed, added or context line's text is not the line at that
position, when a hunk's ops do not add up to its header, when hunks overlap
or leave unequal gaps, or when the lines outside the hunks differ. Running
`git` is a build or test step; nothing in `src/` shells out.

### Evidence

In a scene, a matching transform records what it did as step evidence when it
begins (`Scene.record`, see [the reference](REFERENCE.md#scene)): `{ kind: 'match', matched,
morphed, removed, added }`, and for `TransformDiff`, `{ kind: 'diff', hunks,
lines: { unchanged, changed, removed, added }, matched, morphed, removed, added }`.
A View's internal morph (`view.sync()`) does not record evidence.
The trace carries it per step, and `renderText` prints a one-line summary under the
frame. The KV-cache explainer morphs its merge request's two texts with
`TransformDiff`, and `test/explain-fidelity.test.ts` holds the hunks it
records, in both of its cases, to `git diff --no-index --unified=0`, with its
line counts git's. The same file checks the match evidence behind the counts
the glyph and git explainers put on screen.

## In the explainers

- [`scenes/explainers/mr-cache/scene.ts`](../scenes/explainers/mr-cache/scene.ts): `TransformDiff`
  on coloured `Code`, with tinted bars placed from `diff.plan`.
- [`scenes/explainers/glyph/scene.ts`](../scenes/explainers/glyph/scene.ts): `TransformMatchingShapes`
  pairing glyphs by outline across sizes and fonts, and `TransformMatchingText`
  for a text diff, with lines drawn between `pairs` and counts from `summary()`.
- [`scenes/explainers/exgit/scene.ts`](../scenes/explainers/exgit/scene.ts): `TransformMatchingShapes`
  keeping one row whole while another grows in, and `TransformMatchingText`
  morphing old git ids into new, with counts read from `scene.evidence`.
