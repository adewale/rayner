# Lettering on request

A scene that requests no lettering draws with the embedded Inter and JetBrains Mono and needs no font download or capture. Plain `Latn`, `Grek` and `Cyrl` requests use the subset workflow in [the reference](REFERENCE.md#lettering-on-request). A request with `faces`, `styles`, `math` or another script uses the outline snapshot workflow described here. Do not regenerate `src/font-data.ts` to add a language to one scene.

Request the work on the scene class:

```ts
import { Scene, Math as Formula } from 'rayner';
import { stage } from 'rayner/explain';

export default class Example extends Scene {
  static meta = {
    id: 'joining', title: 'Arabic and maths',
    textContext: 'explicit' as const,
    lettering: { scripts: ['Arab'], math: true },
  };
  override async construct() {
    const s = stage(this, { heading: false });
    await this.step('joining', { caption: 'Arabic joining and vowel marks.' });
    await s.enter(this.text('السَّلَامُ عَلَيْكُمْ', { color: s.palette.ink }));
    await this.step('fraction', { caption: 'A fraction and a superscript.' });
    await s.clear();
    await s.enter(new Formula('\\frac{1}{2}+x^2', {color: s.palette.ink, shaping: this.textShaping}));
  }
}
```

`Text`, `Code`, native stage panels, headings and diagram labels use the requested faces. The browser and resvg draw the same stored paths: there is no browser font request, system-font lookup, HarfBuzz or TeX at runtime. `Math` (also exported as `MathTex`) is laid out at build time by glyph's TeX subset and OpenType MATH; `{ display: true }` selects display layout. Invalid TeX, unavailable glyphs, and `Math` without `math: true` fail the build.

`textContext: 'explicit'` makes shaping belong to the objects the scene creates. Use `this.text(...)` for ordinary text, and pass `shaping: this.textShaping` to `Code`, `ItalicText`, `MathTex`, axes and other text-bearing primitives. Stage headings, cards, code blocks, annotations and diagram labels get the scene's shaping automatically. A copied text keeps its shaping, including when edited after the scene finishes, so explicit scenes with different faces can run together. A scene without `textContext` keeps ambient `new Text(...)`, which serializes conflicting scene contexts across awaits; new code should use the explicit form.

## Capture, check, build

Building and checking from committed snapshots needs only `npm ci`. Capturing new lettering needs Python and the source fonts:

```sh
python3 -m venv out/lettering-venv
out/lettering-venv/bin/pip install -r tools/lettering-requirements.txt
export RAYNER_LETTERING_PYTHON="$PWD/out/lettering-venv/bin/python"
bash tools/lettering-outline-fonts.sh
# Latin Modern Math 1.959 comes from Ubuntu's fonts-lmodern package;
# otherwise set RAYNER_MATH_FONT to the original latinmodern-math.otf.
npm run rayner -- snapshots path/to/scene.ts
npm run rayner -- check path/to/scene.ts
npm run rayner -- build path/to/scene.ts --out out/example.html
```

On macOS, install Python with `brew install python@3.12`, create the environment with `python3.12 -m venv`, and also set `PYFTSUBSET` to the environment's `bin/pyftsubset`. An existing TeX installation finds Latin Modern Math with `kpsewhich latinmodern-math.otf`; its SHA-256 must match the original release.

In an author project with the package installed, keep the environment and fonts in your own `out/` directory:

```sh
python3 -m venv out/lettering-venv
out/lettering-venv/bin/pip install -r node_modules/rayner/tools/lettering-requirements.txt
export RAYNER_LETTERING_PYTHON="$PWD/out/lettering-venv/bin/python"
export RAYNER_LETTERING_FONTS="$PWD/out/lettering-fonts"
bash node_modules/rayner/tools/lettering-outline-fonts.sh
npx rayner snapshots path/to/scene.ts
npx rayner check path/to/scene.ts
```

Commit `scene.lettering.json` beside the scene, as with diagram snapshots. Capture visits every scenario, including text built during replay and contact-sheet titles. HarfBuzz shapes each distinct string once at unit em, and each run keeps glyph IDs, logical source clusters, advances, offsets and outlines. The subset keeps the code points used plus their layout and glyph dependencies. Replacement faces also keep a bounded numeric alphabet for animated values, whose intermediate strings depend on the playback frame rate. Each requested font's licence travels with its subset into the page's licence block.

`check`, `build` and `shots` require a fresh snapshot and never recapture silently; `preview` refreshes during authoring. Changing a caption, imported scene code, the request, the lettering builder, the embedded fallback fonts or the core shaping code invalidates the snapshot, and `snapshots` refreshes it. A cached snapshot's run structure and payload checksum are validated before drawing. Unrecorded prose fails closed, and seek and playback cannot start an unrecorded language scenario. Formatted numbers and known simple-script prefix and suffix templates replay through the glyph shaper with the requested subset, so counters work at any frame rate. A missing character in an unrequested script still fails, during capture too.

`rayner check` reports `lettering.bytes` (the serialized snapshot payload), `lettering.pageBytes` (what the page's script carries of it), each face's binary subset size and the distinct run count. A page carries the request, the runs its scene draws and only the subsets its counters shape at runtime; hashes and licences stay in the snapshot, and each distinct licence notice joins the page's licence block once. Runs only the build draws, such as contact sheets' numbered titles, are listed in the snapshot's `offPage` and left out of the page. The snapshot and the page store each distinct glyph outline once (`outlines`, indexed by each glyph's `o`), because a wrapped caption is measured line by line and its glyphs recur in many runs. Subsets keep the layout features glyph's shaper applies when a counter replays (without ligatures for JetBrains Mono, which capture shapes as literal code) and no hinting. A cut's subset holds only the characters that cut drew, and a cut that drew nothing is left out. Receipts include `letteringHash`, and the snapshot records source, font and builder hashes.

## Supported requests

`scripts` takes ISO 15924 codes. These add build-time fallbacks without replacing Inter for ordinary text:

| Script | Face |
| --- | --- |
| `Arab` | Noto Naskh Arabic |
| `Deva` | Noto Sans Devanagari |
| `Hebr` | Noto Sans Hebrew |
| `Grek`, `Cyrl`, extended `Latn` | Full Inter |
| `Hani` | Noto Sans SC, TrueType outlines |

For Chinese, first run `LETTERING_CJK=1 bash tools/lettering-outline-fonts.sh`, which fetches the checksum-pinned larger face and fixes its variable weight at 400. The other faces come from pinned npm packages. `RAYNER_LETTERING_FONTS` selects another font cache directory.

To use a style's serif face, request it explicitly, so the request is visible in `meta`:

```ts
static meta = {
  id: 'ink', title: 'Ink on paper',
  lettering: { faces: { sans: 'eb-garamond' } },
};
// In construct(): stage(this, { style: 'pen-and-ink' })
```

The registry accepts `inter`, `eb-garamond`, `jetbrains-mono`, `noto-naskh-arabic`, `noto-sans-devanagari`, `noto-sans-hebrew` and `noto-sans-sc` for `sans` or `mono`, and rejects any other face. A face does not add scripts: Greek text in a replacement face must still request `Grek`. Only faces under the SIL Open Font License 1.1 or the Apache License 2.0 may be in the registry. Capture checks each face's notice, and every check and build from a snapshot checks the stored notices again, so a face under another licence fails the build. Latin Modern Math, for `Math`, is the one exception (GUST Font License).

## Diagram measurements

A replacement face changes the glyph outlines, but diagrams still fit those outlines into the widths Agentic Mermaid captured. To lay a diagram out with the requested face's actual advances, opt into natural measurements on that diagram:

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

Capture supplies the active sans and mono measurements through Agentic Mermaid's host-measurement hook before layout. The style chooses which font family a label uses; `meta.lettering` chooses the actual face, and naming a style alone never installs its suggested face. Bold and italic labels use their real cuts, so request the matching `styles` too.

The labels keep their natural proportions, and Rayner may scale the whole diagram uniformly to fit its stage box. Capture checks the laid-out label widths against the active shaper and refuses a mismatch, including an unsupported measurement path, rather than stretching the text to hide it. The [font-metrics example](../scenes/explainers/font-metrics/scene.ts) draws the same requested EB Garamond in native text and a measured diagram.

After opting in, run `rayner snapshots scene.ts` and commit both the diagram and lettering snapshots. Natural snapshots record the font-byte hashes and measurement identity, so changing a requested face, cut, request, shaper or renderer invalidates them. Diagrams without `lettering: 'natural'` keep fitting captured widths.

## Bold and italic

Without a request, `weight: 'bold'` strokes the Regular outline (faux bold) and there is no italic. Ask for the real cuts:

```ts
import { Scene, Text, ItalicText } from 'rayner';

static meta = { id: 'cuts', title: 'Cuts', lettering: { styles: ['bold', 'italic'] } };
// In construct():
this.add(new Text('Bold', { weight: 'bold' }));            // the Bold cut, no stroke
this.add(new ItalicText('Italic'));                         // the Italic cut
this.add(new ItalicText('Both', { weight: 'bold' }));       // the Bold Italic cut
```

- With `'bold'`, every bold Text in the explainer draws its face's Bold cut, the stage heading and panel titles included. Without it, bold stays faux.
- `ItalicText` is a `Text` in the Italic cut. It fails the build unless `styles` includes `'italic'`; there is no faux italic. With both styles, `weight: 'bold'` gives Bold Italic.
- The cuts come from the family's face: the requested `faces.sans` or `faces.mono`, else the full releases of Inter for `sans` and JetBrains Mono for `mono`. A requested face without the cut fails capture, naming it: `noto-sans-hebrew` has no italic.
- Scripts follow the nearest cut their face has. Noto Naskh Arabic, Noto Sans Devanagari and Noto Sans Hebrew have Bold cuts and no italic, so italic text in them draws upright and bold italic draws bold. Noto Sans SC has no Bold cut in the registry, so bold Chinese fails capture, naming that face. Symbols and numerals that only the embedded Noto fallbacks draw stay at their one weight.
- HarfBuzz shapes each cut at capture like any other run, keyed `["sans/bold", text, false]`. A cut's subset holds only the characters styled runs asked of it, plus the numeric alphabet for the family's own cut, so a bold counter replays at any frame rate.
- `test/lettering/styles` is the fixture: heading, bold, italic, bold italic, bold code, bold and italic Arabic, and a bold counter.

## Shaping and bidi

HarfBuzz shapes at capture through `uharfbuzz`, pinned in `tools/lettering-requirements.txt`. The build already needs Python and fontTools to subset faces, so the binding adds one wheel, where harfbuzzjs would add a WASM dependency to the Node build. The page draws the stored runs without shaping them.

Bidi resolves logical runs before shaping, paired brackets in mixed-direction text included, and clusters always address the original string even when the glyphs run right to left. The Unicode Bidi Algorithm comes from python-bidi 0.6.12, whose Rust backend is the `unicode-bidi` crate. It supplies resolved UTF-8 levels; the builder validates them, maps them to source code-point indices and reorders each line (rules L1 and L2). It handles explicit embeddings and overrides, keeps shaping joiners, and rejects isolate controls. Complex scripts beyond the registered faces are unsupported.

A paragraph takes the direction of its first strong letter (rules P2 and P3): a string that starts with Hebrew or Arabic letters runs right to left, and Latin words and numbers inside it keep their own order. `test/lettering/hebrew` is the fixture.

- **In the picture**, a Text is its advance box, and `anchor` names a side of that box (`start` is the left edge) whatever the paragraph direction. Choose panel placement and field order separately, with `stage(this, { direction: 'rtl' })` and a card's `direction` override; stage `start` and `end` regions follow that spatial direction, and text, digits and code are never mirrored. Mermaid flow follows its source, such as `graph RL`. See [spatial direction](REFERENCE.md#spatial-direction).
- **On the page**, captions, titles, the steps list and the transcript are HTML text. A page whose request includes `Arab` or `Hebr` gives them `unicode-bidi: plaintext` and `text-align: start`, so each takes its direction from its own text and a Hebrew caption aligns right. The player's controls are unchanged, and pages that ask for no right-to-left script carry no such rule.

## Changes between strings

Every scenario is built ahead of time, so every string it shows is shaped at capture and must be in a requested script. A scenario cannot switch to an unrequested language at runtime, and an unrecorded string fails closed; counters are the one bounded exception, described above.

`Write` reveals stored glyphs, and a ligature or conjunct is one indivisible outline. `TransformMatchingText` pairs glyphs of lettered text by cluster: a glyph pairs only with a glyph whose cluster holds the same characters, in the same face and cut, drawn with the same number of glyphs. A cluster whose glyphs change fades out and in instead of morphing. `क` to the conjunct `क्ष` fades; `नम` to `नमस्ते` keeps न and म and fades in the conjunct `स्ते`; `سلم` to `سلام` keeps its three letters, which change joining form as they morph (`test/lettering/matching`). Text on pages without lettering pairs by the character at a glyph's cluster start. A formula's glyphs are not characters of its source, so they carry no cluster, and both matching transforms pair them by shape; use `Transform` for whole-formula changes ([Maths](REFERENCE.md#maths)).

Picture descriptions are generated in English or French only; describing pictures in Arabic, Hebrew, Hindi or Chinese is outside lettering on request.

`Code.span`, `token` and `lineSpan` keep logical UTF-16 source ranges while their boxes cover the corresponding visual right-to-left cells, complete combining clusters included. To change a colour, select the whole source cluster: one glyph outline cannot be split into separately styled characters. Ordinary scenes and overlapping independent renders keep separate font leases, and nested runs with the same lettering provider work. Awaiting a nested `Scene.run()` with a different provider, an unlettered child included, is unsupported: render those scenes independently and compose their output.

## Verification

```sh
node --test test/lettering-outlines.test.ts test/lettering-styles.test.ts test/lettering-rtl.test.ts
EXPLAIN_LETTERING=1 node --test test/lettering-outlines.test.ts test/lettering-styles.test.ts test/lettering-rtl.test.ts test/lettering-*-audit.test.ts
EXPLAIN_BROWSER=1 node --test test/browser/lettering-browser.test.ts
```

The first command uses the committed Arabic, Devanagari, Hebrew, maths, serif, bold-and-italic and matching fixtures. It runs the legacy cost and bare-runtime and seek gates, and checks the visual order of bidi runs, the page's right-to-left captions and the cluster pairing. The second, which needs the capture dependencies above, also compares stored IDs, clusters and placement with a separate direct HarfBuzz oracle (Hebrew and each bold and italic cut included), checks maths symbol glyphs and fraction and script layout, deterministic refresh and script rejection. The last builds each fixture's page, opens every step in Chromium and asserts that the live stage draws the same path data Node draws from the same runs, and that a Hebrew caption aligns right and an English one left (`npm run test:embeds` runs it; `CHROMIUM_EXECUTABLE_PATH` selects a system browser). No screenshot or browser assertion replaces the outline and receipt comparisons.

## Compatibility and build identity

An explainer that requests nothing builds the same page and receipt as before lettering existed. The legacy engine fingerprint leaves out optional modules and type-only metadata to keep that true, and byte pins over the whole current catalog check it. Those pins are compatibility checks, not the list of page inputs: `tools/lib/build-inputs.ts` owns that list, including the player, build tools, dependencies and notices, and installed commands also count the compiled JavaScript they run. New producer files join the fingerprint automatically; documentation and generated checkout output do not change it.

Review changes to the compatibility entry point and its pins together with the rendered output. The subset and outline workflows keep their snapshot formats. Both public entry points export the complete `LetteringRequest` type; the subset implementation uses the narrower `SubsetLetteringRequest` internally.
