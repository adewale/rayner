# Code: spans and syntax tokens

`Code` is monospace lines, one `Text` per line, one glyph (a `VMobject`) per
visible character. Each glyph's `cluster` is its index into the line's string as written
(UTF-16 code units, tabs unexpanded).
Spans address glyphs through that index; syntax colour is data computed at
build time and painted through the same spans.

## Spans

```ts
const code = new Code(lines);
code.span(1, 8, 11);          // line 1, source indices [8, 11)
code.token(1, 'await');       // the first "await" on line 1
code.token(3, 'id', 1);       // the second "id" on line 3 (non-overlapping matches)
code.lineSpan(4);             // all of line 4
```

Indices are JS string indices (UTF-16 code units) into `code.lines[i].text`,
the same numbers `Glyph.cluster` holds. A tab is one index however many
columns it takes, and a character outside the BMP is two
(`test/code-tabs.test.ts`). Out-of-range lines or indices throw
`RangeError`; a `token` that isn't there throws.

### A span is a view

A `CodeSpan` is a `Group` whose children are the line's live glyphs: not
copies, and not re-parented (they stay children of the line). So:

- `span.setFill(GOLD)` recolours the text on screen.
- `span.box()`, `center()`, `top()`... are where the text is now, after any
  shift or scale of the block. A `Rectangle` or brace built from `span.box()`
  lands on the real glyphs.
- `span.shift(...)` moves the real glyphs and invalidates the line's and the
  block's boxes.
- `span.animate.setFill(RED)` records the calls and plays them as a Transform
  of the span's *line* to a copy of the line with the same span changed. The
  span never joins the scene. Two spans of one line can't animate in the same
  `play()` (both would drive the line); recolour a `code.copy()` and Transform
  to it instead (`Code.copy()` gives the copy its own `lines`).
- Don't build animations on the span itself (`new Indicate(span)`,
  `new Transform(span, ...)`): `play()` would add the span to the scene and its
  glyphs would draw twice. Indicate a shape drawn from its box instead.

A span is fixed when taken. After its line's text changes (`Text.setText`, or a
Transform that lands another string on the line) it is `stale` and `box()`
throws; take a new span from the `Code` now on screen. After
`Transform(a, b, { replace: true })`, take spans from `b`.

`span.source` is the substring it covers; `span.line`, `from`, `to` are its
address; `span.owner` is the line's `Text`. That address is the stable
contract for features built on spans (braces, boxes, diff-driven transforms).

### The box: advance cells by line metrics

`Text.box()` is the advance box: typographic extent, not ink. A span's box is
built the same way so that boxes around tokens on one line line up:

- **x**: from the pen position at `from` to the pen position at `to`, from the
  shaped advances (spaces count; a span of spaces has a box and no glyphs; a
  tab takes the columns it expands to, as drawn);
- **y**: the line's descent to ascent at its current size, the same for every
  span of the line;
- unioned with the glyphs' ink, so nothing is ever cut off (in the embedded
  mono face, ink stays inside its cells, so the union changes nothing).

Spans of adjacent ranges share an edge exactly: `span(l, a, b).box()[2] ===
span(l, b, c).box()[0]`. Lines are assumed unrotated (shifted and scaled are
fine).

## Syntax tokens

### Data format

```ts
interface ColorSpan { line: number; from: number; to: number; color: string }
new Code(lines, { color: '#dddddd', spans });
```

`from`/`to` are indices into that line's string, as above. `Code` paints the
spans once, at construction, over `color`. They belong to that construction:
`Text.setText` on a line restyles the whole line from its first glyph, so to
change coloured code, build the next `Code` with its own spans and Transform
to it (as explainers already do). Styling applied after construction (a
`setFill` on the line or a span) paints over token colours.

### The tool

```
node tools/tokens.ts <file | -> [--lang ts|js|python|bash|elixir] [--theme dark|light] [--engine auto|shiki|fallback]
```

prints the spans as a JSON array, one span per line, to paste into a scene. The language defaults to the file extension; stdin needs `--lang`.
The engine used goes to stderr. From code, the module `tools/lib/tokenize.ts`
exports `tokenize(source, lang, { engine, palette })`, which returns the same
`ColorSpan[]` (the `rayner` CLI can call it at build time). It is not the
`tokenize` that `rayner` exports: that one, from `src/diff.ts`, splits a line
into the tokens `diffTokens` compares. The module's `lex()` and `shikiTokens()`
return the classified tokens (`keyword`, `string`, `comment`, `number`,
`function`, `punctuation`) before colouring.

- **shiki** (a devDependency of this checkout, pinned to 4.5.0, so `npm install`
  brings it): with it, `--engine auto` uses its grammars, loaded synchronously
  with the JavaScript regex engine (no WASM). Its `github-dark` colours are mapped back to the
  token kinds above; anything else (plain text, variables, parameters) stays
  in the base colour.
- **fallback**: a single-pass lexer for ts/js, python, bash and elixir:
  keywords, strings (multi-line where the language allows), comments,
  numbers and language constants (`true`, `None`, `nil`, `:atoms`, ALL_CAPS),
  definition names and calls, punctuation. On simple code it produces the
  same ranges as shiki (tested); on template interpolations and operators
  shiki is finer.

Both engines map kinds through one palette (`DARK` by default, `LIGHT` for
light stages), so their output is interchangeable. Punctuation is left in the
base colour by default, as GitHub's themes do (and see the cost below).

### Build time only

Spans are computed once, by a tool, and checked in as a literal array
(the KV-cache explainer, [`scenes/explainers/mr-cache/scene.ts`](../scenes/explainers/mr-cache/scene.ts),
is the example). Nothing in `src/` or the browser bundle imports shiki or the lexer:

- **zero runtime dependencies**: the engine and anything a page loads stay
  dependency-free; shiki is a devDependency of the checkout, used only by
  `tools/tokens.ts`, which the package does not ship.
- **deterministic output**: the same data renders the same frames everywhere,
  and seeks stay byte-identical. A highlighter running at view time could
  change colours with a grammar update; a checked-in array changes only when
  someone regenerates it, and the diff shows what changed. Regenerate with
  the same engine (`--engine shiki` or `--engine fallback`), since the two
  differ in detail.

## Cost: elements per line

The DOM renderer (`DomSink`, absolute path mode) draws a group of glyphs as one
`<path>` per run of consecutive equal-styled glyphs (`mergedRecords` in
`src/svg.ts`). A plain line is one element; a coloured line is one element per
colour run. Spaces have no glyph, so `return await` in one colour is one run.
A glyph mid-Write (partial draw) still falls back to one element per glyph.
The SVG string renderer is unaffected.

A 20-line TypeScript block (lines 52 to 71 of `src/text.ts`, 638 glyphs),
measured at `53c5add` with shiki 4.5.0:

| | fallback lexer (48 spans) | shiki (94 spans) |
|---|---|---|
| plain | 19 | 19 |
| coloured, one element per glyph on any mixed line (before runs, counted) | 559 | 578 |
| coloured, runs | 97 | 163 |

Grouping by style instead of by run (one element per colour per line) would
give 45 / 49, but changes paint order between glyphs of a line, which matters
mid-morph when glyphs cross; runs keep the per-glyph order exactly. Fewer
colours is the cheaper lever: a palette that leaves punctuation uncoloured (the
default) costs a fraction of one that colours it.

## In the explainers

- [mr-cache](../scenes/explainers/mr-cache/scene.ts): both blocks of the merge
  request are `new Code(lines, { spans })`, with spans that
  `node tools/tokens.ts --theme light --engine shiki` generated and that are
  checked in beside the scene (`scenes/explainers/mr-cache/code.ts`);
  `TransformDiff` morphs one into the other.
- [state-machine](../scenes/explainers/state-machine/scene.ts): finds the reducer
  row it read with `code.token(line, text)`, takes `code.span` from the key to
  the value, and rings it with a `SurroundingRectangle` built from the span's
  `box()`.
