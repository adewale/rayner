# Lettering on request

Plain `Latn`, `Grek`, and `Cyrl` requests retain the subset workflow introduced
in PR #10. Requests containing `faces`, `styles`, `math`, or another script use the
outline snapshot workflow described here; the existing snapshot schema remains supported.

Existing scenes keep their embedded Inter/JetBrains Mono lettering and their
page bytes and receipts. Nothing is downloaded for them. Do not regenerate
`src/font-data.ts` to add a language to one scene.

Request the work on the scene class:

```ts
import { Scene, Text, Math as Formula } from 'rayner';
import { stage } from 'rayner/explain';

export default class Example extends Scene {
  static meta = {
    id: 'joining', title: 'Arabic and maths',
    lettering: { scripts: ['Arab'], math: true },
  };
  override async construct() {
    const s = stage(this, { heading: false });
    await this.step('joining', { caption: 'Arabic joining and vowel marks.' });
    await s.enter(new Text('السَّلَامُ عَلَيْكُمْ', { color: s.palette.ink }));
    await this.step('fraction', { caption: 'A fraction and a superscript.' });
    await s.clear();
    await s.enter(new Formula('\\frac{1}{2}+x^2', { color: s.palette.ink }));
  }
}
```

`Text`, `Code`, native stage panels, headings, diagram labels
use the requested faces. The browser and resvg draw the same stored paths;
there is no browser font request, system-font lookup, HarfBuzz or TeX runtime.
`Math` (also exported as `MathTex`) uses glyph's TeX-subset/OpenType MATH
layout at build time. `{ display: true }` selects display layout. Invalid TeX,
unavailable glyphs, and `Math` without `math: true` fail the build.

## macOS setup

The HTML authoring workflow needs Node 24 and Chromium, as in the README. Python and source fonts are needed only when capturing new lettering; committed snapshots need neither.

For new lettering on macOS, install Python with `brew install python@3.12`, create a virtual environment with `python3.12 -m venv .venv`, then run `.venv/bin/pip install -r tools/lettering-requirements.txt`. Set `RAYNER_LETTERING_PYTHON="$PWD/.venv/bin/python"` and `PYFTSUBSET="$PWD/.venv/bin/pyftsubset"`, then run `bash tools/lettering-outline-fonts.sh`. These variables also work on Ubuntu. For new maths, set `RAYNER_MATH_FONT` to the original Latin Modern Math 1.959 `latinmodern-math.otf`; an existing TeX installation can locate it with `kpsewhich latinmodern-math.otf`.

## Capture, check, build

Ordinary `npm ci` is enough to check/build the committed examples. To capture
new lettering snapshots, install the optional build-time tools:

```sh
python3 -m venv out/lettering-venv
out/lettering-venv/bin/pip install -r tools/lettering-requirements.txt
export RAYNER_LETTERING_PYTHON="$PWD/out/lettering-venv/bin/python"
bash tools/lettering-outline-fonts.sh
# Latin Modern Math 1.959 is supplied by Ubuntu's fonts-lmodern package.
# Else set RAYNER_MATH_FONT to the original latinmodern-math.otf.
npm run rayner -- snapshots path/to/scene.ts
npm run rayner -- check path/to/scene.ts
npm run rayner -- build path/to/scene.ts --out out/example.html
```

Commit `scene.lettering.json` beside the scene, just like diagram snapshots.
Capture visits every settings case, including text built during replay and
contact-sheet titles. HarfBuzz shapes each distinct string once at unit em;
runs retain glyph IDs, logical source clusters, advances, offsets, and outlines.
The subset keeps the used code points plus layout/glyph dependencies. Replacement faces also retain a bounded numeric alphabet for animated values, whose intermediate strings depend on playback FPS. Each
requested font's licence travels with its subset into the page's licence block.

`check`, `build` and `shots` require a fresh snapshot and never
silently recapture. Changing a caption, imported scene code, the request, or the
lettering builder, embedded fallback fonts or core shaping code invalidates the snapshot. Cached snapshots validate their run structure and payload checksum before drawing. Run `snapshots` to refresh it.
`preview` refreshes during authoring. Unrecorded prose fails closed; seek and playback cannot start an unrecorded language case. Formatted numeric values and known simple-script prefix/suffix templates can replay through the existing glyph shaper with the requested subset, so counters work at arbitrary animation frame rates. Missing characters
in an unrequested script still fail, including during capture.

`rayner check` reports `lettering.bytes` (serialized snapshot payload),
`lettering.pageBytes` (what the page's script carries of it), the binary subset
size per face, and the distinct run count. A page carries the request and the
runs its scene draws, which hold every outline it shows, and only the subsets its
counters shape with at runtime; hashes and licences stay in the snapshot, and each
distinct licence notice joins the page's licence block once. Runs that only the
build draws, such as contact sheets’ numbered titles, are listed in the snapshot's `offPage` and left
out of the page. The snapshot file and the page store each distinct glyph outline
once (`outlines`, with each glyph's `o` indexing it): a wrapped caption is
measured line by line, so its glyphs recur in many runs. Subsets keep the layout
features glyph's shaper applies when a counter replays (without ligatures for
JetBrains Mono, which capture shapes as literal code) and no hinting. A cut's
subset holds only the characters that cut drew, and a cut that drew nothing is
left out. Receipts include
`letteringHash`; the snapshot includes source/font/builder hashes. The legacy
engine fingerprint deliberately excludes optional modules and type-only
metadata, so opting out preserves receipts as well as page bytes. A regression
test originally pinned 26 pages across 140 cases; it now pins the complete current catalog. Historical inventories belong to their recorded revisions.

## Capture from an installed package

The preceding commands run in a Rayner checkout. In an author project with the package installed, keep the optional Python environment and source fonts in your own `out/` directory:

```sh
python3 -m venv out/lettering-venv
out/lettering-venv/bin/pip install -r node_modules/rayner/tools/lettering-requirements.txt
export RAYNER_LETTERING_PYTHON="$PWD/out/lettering-venv/bin/python"
export RAYNER_LETTERING_FONTS="$PWD/out/lettering-fonts"
bash node_modules/rayner/tools/lettering-outline-fonts.sh
npx rayner snapshots path/to/scene.ts
npx rayner check path/to/scene.ts
```

Maths capture also needs the checksum-pinned Latin Modern Math face described above. Cached snapshots build without these capture dependencies. Commit the refreshed `scene.lettering.json` with the scene.

## Supported requests

`scripts` uses ISO 15924 codes. These select build-time fallbacks, without
replacing Inter for ordinary text:

| Script | Face |
| --- | --- |
| `Arab` | Noto Naskh Arabic |
| `Deva` | Noto Sans Devanagari |
| `Hebr` | Noto Sans Hebrew |
| `Grek`, `Cyrl`, extended `Latn` | Full Inter |
| `Hani` | Noto Sans SC, TrueType outlines |

For Chinese, first run `LETTERING_CJK=1 bash tools/lettering-outline-fonts.sh`; this
fetches the checksum-pinned larger face and fixes its variable weight at 400.
The others use pinned npm packages. `RAYNER_LETTERING_FONTS` can select another
cache directory. Cached fonts and Python are required only for capture, not for
building from a snapshot. Latin Modern Math's original SHA-256 must match; the
GUST/LPPL font is an explicit exception to the OFL text-face registry.

To use a style's serif face, explicitly request it:

```ts
static meta = {
  id: 'ink', title: 'Ink on paper',
  lettering: { faces: { sans: 'eb-garamond' } },
};
// In construct(): stage(this, { style: 'pen-and-ink' })
```

The registry accepts `inter`, `eb-garamond`, `jetbrains-mono`, `noto-naskh-arabic`,
`noto-sans-devanagari`, `noto-sans-hebrew`, and `noto-sans-sc` for `sans` or
`mono`. Requests do not implicitly add scripts: Greek text in a replacement
face must still request `Grek`. Faces outside this licensed registry are rejected.
Only faces under the SIL Open Font License 1.1 or the Apache License 2.0 may be
in it: capture checks each face's notice, and every check and build from a
snapshot checks the stored notices again, so a face under another licence fails
the build. Latin Modern Math, for `Math`, is the one exception (GUST Font License).
The proposed `stage(..., { lettering: 'style' })` shorthand is not implemented;
explicit face selection keeps the request visible in `meta`.

## Diagram measurements

A replacement face changes the glyph outlines. Existing diagram specs still fit those outlines into the widths captured by Agentic Mermaid. Opt into natural measurements on each diagram when the layout should use the requested face's actual advances:

```ts
static meta = {
  id: 'ink', title: 'Ink on paper',
  lettering: { faces: { sans: 'eb-garamond' } },
};
// In construct():
const s = stage(this, { style: 'pen-and-ink' });
await s.show({
  source: 'graph LR\nA["Ink"] --> B["Paper"]',
  lettering: 'natural',
});
```

Capture supplies the active sans and mono measurements through Agentic Mermaid's host-measurement hook before layout. The style selects which font family a label uses; `meta.lettering` selects the actual face. Bold and italic labels use their requested real cuts, so request the corresponding `styles` entries too. Naming a style alone never installs its suggested face.

The resulting labels retain their natural proportions. Rayner can scale the whole diagram uniformly to fit its stage box. Natural capture checks the laid-out label widths against the active shaper and refuses a mismatch, including an unsupported measurement path, rather than stretching the text to hide it. The [font-metrics example](../scenes/explainers/font-metrics/scene.ts) draws the same requested EB Garamond in native text and a measured diagram.

Run `rayner snapshots scene.ts` and commit both diagram and lettering snapshots after opting in. Natural snapshots record the actual font-byte hashes and measurement identity; changing a requested face, cut, request, shaper or renderer invalidates the capture. Committed snapshots replay without Python or the original source fonts. Diagrams without `lettering: 'natural'` keep their existing width-fitting behavior.

## Bold and italic

Without a request, `weight: 'bold'` strokes the Regular outline (faux bold) and
there is no italic. Ask for the real cuts:

```ts
import { Scene, Text, ItalicText } from 'rayner';

static meta = { id: 'cuts', title: 'Cuts', lettering: { styles: ['bold', 'italic'] } };
// In construct():
this.add(new Text('Bold', { weight: 'bold' }));            // the Bold cut, no stroke
this.add(new ItalicText('Italic'));                         // the Italic cut
this.add(new ItalicText('Both', { weight: 'bold' }));       // the Bold Italic cut
```

- With `'bold'`, every bold Text in the explainer draws its face's Bold cut,
  including the stage heading and panel titles. Without it, bold stays faux.
- `ItalicText` is a `Text` in the Italic cut. It fails the build unless
  `styles` includes `'italic'`; there is no faux italic. With both styles,
  `weight: 'bold'` gives Bold Italic.
- The cuts come from the family's face: the requested `faces.sans` or
  `faces.mono`, else Inter for `sans` and JetBrains Mono for `mono` (the full
  releases of the embedded faces). A requested face without the cut fails
  capture, naming it: `noto-sans-hebrew` has no italic.
- Scripts follow the nearest cut their face has. Noto Naskh Arabic, Noto Sans
  Devanagari and Noto Sans Hebrew have Bold cuts and no italic, so italic text in
  them draws upright and bold italic draws bold. Noto Sans SC has no Bold cut in
  the registry, so bold Chinese fails capture, naming that face. Symbols and numerals that only the
  embedded Noto fallbacks draw stay at their one weight.
- Each cut is shaped by HarfBuzz at capture like any other run, keyed
  `["sans/bold", text, false]`, and stored with its outlines. A cut's subset holds
  only the characters styled runs asked of it, plus the numeric alphabet for the
  family's own cut so a bold counter replays at any frame rate.
- `test/lettering/styles` is the fixture: heading, bold, italic, bold italic,
  bold code, bold and italic Arabic, and a bold counter.

## Shaping and bidi

HarfBuzz shapes at capture through `uharfbuzz` (pinned in
`tools/lettering-requirements.txt`). The build already needs Python and
fontTools to subset faces, so the Python binding adds one wheel; harfbuzzjs
would add a WASM dependency to the Node build for the same shaping. The page
draws the stored runs without shaping them.

Bidi resolves logical runs before shaping, including paired brackets in mixed-direction text; clusters always address the original string, even when the visual glyph order is right to left. The Unicode Bidi Algorithm comes from python-bidi 0.6.12, whose Rust backend is the `unicode-bidi` crate; it supplies resolved UTF-8 levels, and the builder validates that metadata, maps it to source code-point indices and reorders each line (rules L1 and L2). It handles explicit embeddings/overrides, preserves shaping joiners, and rejects unsupported isolate controls. Complex scripts beyond the registered faces remain unsupported.

A paragraph's direction is its first strong letter's (rules P2 and P3): a string
that starts with Hebrew or Arabic letters runs right to left, and Latin words and
numbers inside it keep their own order. `test/lettering/hebrew` is the fixture.

- **In the picture**, a Text is its advance box; `anchor` names a side of that
  box (`start` is the left edge) whatever the paragraph direction. Choose panel
  placement and field order separately with `stage(this, { direction: 'rtl' })`
  and a card's `direction` override. Stage `start`/`end` regions follow that
  spatial direction; text, digits and code are never mirrored. Mermaid flow
  follows its authored direction, such as `graph RL`. See [spatial direction](REFERENCE.md#spatial-direction).

- **On the page**, captions, titles, the steps list and the transcript are
  HTML text. A page whose request includes `Arab` or `Hebr` gives them
  `unicode-bidi: plaintext` and `text-align: start`, so each takes its direction
  from its own text and a Hebrew caption aligns right. The player's controls are
  unchanged. Pages that ask for no right-to-left script carry no such rule.

## Changes between strings

Every case is built ahead of time, so every string a case shows is shaped at
capture and must be in a requested script; a case cannot switch to an unrequested
language at runtime, and an unrecorded string fails closed. Counters are the one
bounded exception described above.

`Write` reveals stored glyphs; a ligature/conjunct is an indivisible outline.
`TransformMatchingText` pairs glyphs of lettered text by cluster: a glyph pairs
only with a glyph whose cluster holds the same characters, in the same face and
cut, drawn with the same number of glyphs. A cluster whose glyphs change fades
out and in instead of morphing: `क` to the conjunct `क्ष` fades, while `नम` to
`नमस्ते` keeps न and म and fades in the conjunct `स्ते`, and `سلم` to `سلام` keeps its
three letters, which change joining form as they morph (`test/lettering/matching`).
Text in pages without lettering keeps the old pairing by the character at a
glyph's cluster start. Use `Transform` for whole-formula changes. A formula's
glyphs are not characters of its source, so they carry no cluster, and both
matching transforms pair them by shape ([Maths](REFERENCE.md#maths)).
Replacement prose must be built into a case; numeric animations use the bounded
exception described above.

Picture descriptions are generated in English or French only. Describing the
pictures in Arabic, Hebrew, Hindi or Chinese is outside lettering on request.

`Code.span`, `token` and `lineSpan` keep logical UTF-16 source ranges while their boxes cover the corresponding visual RTL cells, including complete combining clusters. For colour changes, select the entire source cluster; one glyph outline cannot be split into independently styled characters. Ordinary scenes and overlapping independent renders keep separate font leases; nested runs using the same lettering provider are supported. Awaiting a nested `Scene.run()` with a different provider (including an unlettered child) is unsupported: render those scenes independently before composing their output.

## Verification

```sh
node --test test/lettering-outlines.test.ts test/lettering-styles.test.ts test/lettering-rtl.test.ts
EXPLAIN_LETTERING=1 node --test test/lettering-outlines.test.ts test/lettering-styles.test.ts test/lettering-rtl.test.ts test/lettering-*-audit.test.ts
EXPLAIN_BROWSER=1 node --test test/browser/lettering-browser.test.ts
```

The first command uses the committed Arabic, Devanagari, Hebrew, maths, serif,
bold-and-italic and matching fixtures, and runs the legacy cost and bare-runtime/seek
gates, the visual order of bidi runs, the page’s right-to-left captions and the
cluster pairing. The second also compares stored IDs, clusters and placement with
a separate direct HarfBuzz oracle (for Hebrew and each bold and italic cut too),
checks maths symbol glyphs and fraction/script layout, deterministic refresh,
and script rejection. It needs the capture dependencies above. The last builds
each fixture's page, opens every step in Chromium and asserts the live stage
draws the same path data Node draws from the same runs (`npm run test:embeds`
runs it; `CHROMIUM_EXECUTABLE_PATH` may select a system browser). It also checks
that a Hebrew caption aligns right on the page and an English one left. No screenshot or browser assertion substitutes for the outline and
receipt comparisons.

## Compatibility and build identity

The legacy opt-out fingerprint and byte pins preserve the unrequested-lettering contract. They are compatibility checks, not a complete list of page inputs. `tools/lib/build-inputs.ts` owns that list for review and export, including the player, build tools, dependencies and notices; installed commands also count the compiled JavaScript they execute. New producer files join the fingerprint automatically. Documentation and generated checkout output do not invalidate it.

Keep changes to the compatibility entrypoint and its pins explicit and review them together with the rendered output. The subset and outline workflows retain their existing snapshot formats. Both public entrypoints export the complete `LetteringRequest` type; the subset implementation uses the narrower `SubsetLetteringRequest` internally.
